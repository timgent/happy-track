import { useState, useCallback, useRef } from 'react';
import { profile } from '../utils/profiling';

/**
 * Data with timestamp for conflict resolution
 */
export interface TimestampedData {
  lastModified?: string;
  _rev?: string;
}

/**
 * Conflict resolution strategy
 */
export type ConflictStrategy =
  | 'fallback-to-pod'  // Pod wins if local has no timestamp OR Pod is newer (handles fresh loads)
  | 'strict-newer';     // Pod wins only if explicitly newer

/**
 * Options for sync coordinator
 */
export interface SyncCoordinatorOptions<T extends TimestampedData> {
  /**
   * Current local data
   */
  currentData: T | null;

  /**
   * Function to save data to local database
   * Returns the new revision ID
   */
  saveToLocalDb: (data: T) => Promise<{ rev: string }>;

  /**
   * Function to update form state and local state with synced data
   */
  updateFormAndState: (data: T, rev: string) => void;

  /**
   * Conflict resolution strategy
   * - 'fallback-to-pod': Use for edit forms (handles fresh loads gracefully)
   * - 'strict-newer': Use for view pages (only apply if Pod is definitively newer)
   */
  conflictStrategy?: ConflictStrategy;

  /**
   * Optional merge function for CRDT-style conflict resolution.
   * When provided, called instead of simple replacement when pod data is applicable.
   * The result is saved locally and, if saveToPod is also provided, pushed back to
   * the pod so both peers converge to the same merged state.
   */
  mergeFunction?: (local: T, remote: T) => T;

  /**
   * Optional pod save function used to push merged results back after a merge.
   * Only called when mergeFunction is also provided.
   *
   * The push-back is made conditional (`onlyIfUnchanged`), so it can never
   * overwrite a change that landed on the pod while the merge was being
   * computed — see the call site.
   */
  saveToPod?: (data: T, options?: { onlyIfUnchanged?: boolean }) => Promise<boolean>;

  /**
   * Duration to show sync indicator (milliseconds)
   */
  syncIndicatorDuration?: number;
}

/**
 * State returned by sync coordinator
 */
export interface SyncCoordinatorState<T extends TimestampedData> {
  /**
   * Whether currently syncing from Pod (for UI indicator)
   */
  syncingFromPod: boolean;

  /**
   * Callback to handle successful sync from Pod
   */
  handleSyncSuccess: (data: T) => Promise<void>;

  /**
   * Callback to handle sync errors
   */
  handleSyncError: (error: string) => void;

  /**
   * Save data locally and to Pod with sync loop prevention
   * Returns the updated data with new revision
   */
  saveWithSyncPrevention: (
    data: T,
    saveToPod: (data: T) => Promise<boolean>
  ) => Promise<T | null>;
}

/**
 * Longest we'll hold work waiting for a paint that may never come — a hidden
 * tab gets no animation frames, and a saved happy still has to reach the pod.
 */
const AFTER_PAINT_FALLBACK_MS = 100;

/**
 * A copy without its `_rev`, for comparing two versions of the same thing.
 *
 * `_rev` identifies a revision inside one PouchDB. Leaving it in would make
 * every comparison differ and every poll re-render the page.
 */
function stripRev<T extends TimestampedData>(value: T): Omit<T, '_rev'> {
  const { _rev, ...rest } = value;
  void _rev;
  return rest;
}

/**
 * Run `callback` once the browser has had the chance to paint, or after
 * `AFTER_PAINT_FALLBACK_MS`, whichever comes first. The animation frame lands
 * before the paint, so the timer inside it is what puts the work after it.
 */
function afterNextPaint(callback: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    callback();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => setTimeout(run, 0));
  }
  setTimeout(run, AFTER_PAINT_FALLBACK_MS);
}

/**
 * Hook to coordinate bidirectional sync between local state, local DB, and Pod
 *
 * Handles:
 * - Conflict resolution using timestamps
 * - Sync loop prevention
 * - Focus preservation during updates
 * - UI feedback
 *
 * @example
 * const { syncingFromPod, handleSyncSuccess, saveWithSyncPrevention } = useSyncCoordinator({
 *   currentData: month,
 *   saveToLocalDb: async (data) => happyDb.saveMonth(data),
 *   updateFormAndState: (data, rev) => {
 *     setMonth({ ...data, _rev: rev });
 *     reset(data);
 *   },
 *   conflictStrategy: 'fallback-to-pod'
 * });
 */
export function useSyncCoordinator<T extends TimestampedData>(
  options: SyncCoordinatorOptions<T>
): SyncCoordinatorState<T> {
  const {
    currentData,
    saveToLocalDb,
    updateFormAndState,
    conflictStrategy = 'fallback-to-pod',
    mergeFunction,
    saveToPod: saveToPodOption,
    syncIndicatorDuration = 2000,
  } = options;

  // How long to suppress Pod updates after a local save completes
  const SYNC_PREVENTION_WINDOW_MS = 2000;

  const [syncingFromPod, setSyncingFromPod] = useState(false);

  // Track if we're currently handling a local change to prevent sync loops
  const isLocalChangeRef = useRef(false);

  // Callers pass saveToLocalDb as a fresh closure on every render; reading it
  // through a ref keeps saveWithSyncPrevention's identity stable so consumers
  // can safely use it in useCallback dependencies without churning.
  const saveToLocalDbRef = useRef(saveToLocalDb);
  saveToLocalDbRef.current = saveToLocalDb;

  // How many saves are in-flight. A save counts as in-flight from before its
  // first await until its background pod push settles, so overlapping saves
  // (two quick edits) can't clear the guard out from under each other.
  const savesInFlightRef = useRef(0);

  // Track the lastModified timestamp of the most recently saved data for echo detection
  const lastSavedTimestampRef = useRef<string | null>(null);

  // Track the last synced data to detect actual changes
  const lastSyncedDataRef = useRef<string | null>(null);

  // Track the highest timestamp ever seen (local or Pod) for monotonic timestamp generation
  const maxSeenTimestampRef = useRef<number>(0);

  /**
   * Preserve focus and selection during updates
   */
  const preserveFocusAndSelection = useCallback((callback: () => void) => {
    // Save the currently focused element
    const activeElement = document.activeElement as HTMLElement;
    const activeElementId = activeElement?.id;
    // Only text controls expose a selection API; on buttons/selects the
    // properties are undefined, and inputs like type="number" throw on access
    // in some browsers.
    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement
    ) {
      try {
        selectionStart = activeElement.selectionStart;
        selectionEnd = activeElement.selectionEnd;
      } catch {
        // Input type doesn't support selection — restore focus only
      }
    }

    // Execute the callback
    callback();

    // Restore focus after a brief delay to allow the DOM to update
    setTimeout(() => {
      if (activeElementId) {
        const elementToFocus = document.getElementById(activeElementId) as HTMLInputElement;
        if (elementToFocus) {
          elementToFocus.focus();
          if (
            selectionStart !== null &&
            selectionEnd !== null &&
            typeof elementToFocus.setSelectionRange === 'function'
          ) {
            try {
              elementToFocus.setSelectionRange(selectionStart, selectionEnd);
            } catch {
              // Element re-rendered as a type that doesn't support selection
            }
          }
        }
      }
    }, 0);
  }, []);

  /**
   * Determine if Pod data should be applied based on timestamps
   */
  const shouldApplyPodData = useCallback(
    (podData: T): boolean => {
      const podTime = podData.lastModified ? new Date(podData.lastModified).getTime() : 0;
      const localTime = currentData?.lastModified
        ? new Date(currentData.lastModified).getTime()
        : 0;

      if (conflictStrategy === 'fallback-to-pod') {
        // Pod wins if local has no timestamp OR Pod is newer
        return !currentData?.lastModified || podTime > localTime;
      } else {
        // Strict: Pod wins only if explicitly newer
        return podTime > localTime;
      }
    },
    [currentData, conflictStrategy]
  );

  /**
   * Handle successful sync from Pod
   */
  const handleSyncSuccess = useCallback(
    async (data: T) => {
      // Advance maxSeenTimestamp so subsequent saves are always strictly newer
      if (data.lastModified) {
        const podMs = new Date(data.lastModified).getTime();
        maxSeenTimestampRef.current = Math.max(maxSeenTimestampRef.current, podMs);
      }

      // Skip if a save operation is currently in-flight (set before first await)
      if (savesInFlightRef.current > 0) {
        console.log('Synced data from Pod - skipping because save is in-progress');
        return;
      }

      /*
       * Skip echoes: the pod handing back the copy we just pushed to it.
       *
       * Only meaningful without a merge function. With one, the timestamp is
       * not evidence of authorship — two writers can stamp the same
       * millisecond, and the merge below then never runs, so a *real* peer
       * change is dropped and stays dropped for as long as the stamps keep
       * matching. For a merged type the content answers the same question
       * exactly: an echo merges to no change and is skipped a few lines down,
       * and anything that is not an echo is data we need.
       */
      if (
        !mergeFunction &&
        data.lastModified &&
        data.lastModified === lastSavedTimestampRef.current
      ) {
        console.log('Synced data from Pod - skipping echo of our own last save');
        return;
      }

      // Only update if this isn't a local change we just made
      if (isLocalChangeRef.current) {
        console.log('Synced data from Pod - skipping because local change is in progress');
        return;
      }

      /*
       * Whether the pod's copy is worth applying.
       *
       * With a merge function there is no "who wins" question for a timestamp
       * to answer — the merge answers it per item — so the only question left
       * is whether merging would change anything. Gating this on the
       * document-level timestamp instead was a real data-loss path: a peer
       * whose document stamp was missing or behind had its items ignored
       * wholesale, even though each item carried its own stamp and the merge
       * would have kept them. The pod is the *other* writer here, not a cache.
       *
       * Without a merge function the document is owned by one writer at a time
       * and the timestamp is exactly the right question, so nothing changes
       * for those callers.
       */
      const merged: T | null = mergeFunction && currentData
        ? profile('sync.merge', () => mergeFunction(currentData, data))
        : null;

      if (merged !== null) {
        if (JSON.stringify(stripRev(merged)) === JSON.stringify(stripRev(currentData!))) {
          console.log('Synced data from Pod - merge changes nothing, keeping local');
          return;
        }
      } else if (!shouldApplyPodData(data)) {
        console.log('Synced data from Pod - local version is newer or same, keeping local', {
          localTime: currentData?.lastModified,
          podTime: data.lastModified,
        });
        return;
      }

      // Compare the incoming data with what we last synced (to avoid unnecessary re-renders)
      const incomingDataString = profile('sync.stringify', () => JSON.stringify(data));
      if (merged === null && lastSyncedDataRef.current === incomingDataString) {
        console.log('Synced data from Pod - timestamps indicate update, but data is identical (skipping re-render)');
        return;
      }

      console.log('Synced data from Pod - applying update', {
        hasTimestamp: !!data.lastModified,
        timestamp: data.lastModified,
        merged: merged !== null,
      });
      setSyncingFromPod(true);

      try {
        const resolved: T = merged ?? { ...data };

        // Remove _rev to avoid conflicts with local database version
        delete (resolved as Record<string, unknown>)._rev;

        // Save to local database to get the proper _rev
        const dbResult = await saveToLocalDbRef.current(resolved);

        const resolvedWithRev = { ...resolved, _rev: dbResult.rev } as T;

        // Update form and state with resolved data
        preserveFocusAndSelection(() => {
          updateFormAndState(resolved, dbResult.rev);
        });

        lastSyncedDataRef.current = JSON.stringify(resolvedWithRev);

        // Push the merged result back, so both peers converge on it rather
        // than taking turns overwriting each other.
        if (merged !== null && saveToPodOption) {
          const mergedTimestamp = resolved.lastModified;
          lastSavedTimestampRef.current = mergedTimestamp ?? null;
          isLocalChangeRef.current = true;
          // Conditional: this write is a merge of what the pod had, so pushing
          // it unconditionally would discard anything that arrived since the
          // read it was computed from. Refused writes are a no-op and the next
          // poll merges the newer copy instead — merging is commutative, so the
          // two peers still converge, just one tick later.
          saveToPodOption(resolvedWithRev, { onlyIfUnchanged: true }).finally(() => {
            setTimeout(() => { isLocalChangeRef.current = false; }, SYNC_PREVENTION_WINDOW_MS);
          });
        }

        // Show sync indicator briefly
        setTimeout(() => setSyncingFromPod(false), syncIndicatorDuration);
      } catch (err) {
        console.error('Error saving synced data to local database:', err);
        setSyncingFromPod(false);
      }
    },
    [
      currentData,
      updateFormAndState,
      shouldApplyPodData,
      preserveFocusAndSelection,
      syncIndicatorDuration,
      mergeFunction,
      saveToPodOption,
    ]
  );

  /**
   * Handle sync errors (silent by default to avoid noise)
   */
  const handleSyncError = useCallback((error: string) => {
    console.error('Sync error:', error);
    // Don't show toast for errors - too noisy for automatic sync
  }, []);

  /**
   * Save data locally and to Pod with sync loop prevention
   */
  const saveWithSyncPrevention = useCallback(
    async (data: T, saveToPod: (data: T) => Promise<boolean>): Promise<T | null> => {
      // Count the save as in-flight before any async work so handleSyncSuccess
      // cannot slip through the unguarded window before isLocalChangeRef is set.
      savesInFlightRef.current += 1;

      let savedData: T;
      try {
        // Add monotonically increasing timestamp for conflict resolution.
        // Uses max(wallClock, maxSeen+1) so that saves are always strictly newer
        // than any previously observed timestamp, protecting against clock skew.
        const nowMs = Date.now();
        const tsMs = Math.max(nowMs, maxSeenTimestampRef.current + 1);
        maxSeenTimestampRef.current = tsMs;
        const dataWithTimestamp = {
          ...data,
          lastModified: new Date(tsMs).toISOString(),
        } as T;

        // Record the timestamp so we can detect echoes from the Pod later
        lastSavedTimestampRef.current = dataWithTimestamp.lastModified!;

        // Save to local database first (guaranteed)
        const dbResult = await profile('save.localDb', () => saveToLocalDbRef.current(dataWithTimestamp));

        // Update with new revision
        savedData = {
          ...dataWithTimestamp,
          _rev: dbResult.rev,
        } as T;

        // Update the last synced data ref
        lastSyncedDataRef.current = JSON.stringify(savedData);
      } catch (err) {
        console.error('Error in saveWithSyncPrevention:', err);
        savesInFlightRef.current -= 1;
        return null;
      }

      // Push to the Pod in the background. The local database is the guaranteed
      // store and the caller renders from what we return here, so awaiting the
      // Pod would make every edit cost a network round trip on screen — several,
      // in fact, since a write resolves the Pod URL and checks the container
      // before it writes. Failures still reach the user: usePodSync reports them
      // through onSaveError.
      //
      // The save stays counted as in-flight until the push settles, so a Pod
      // poll landing in the meantime can't apply its now-stale copy on top of
      // the edit we have already shown.
      isLocalChangeRef.current = true;
      // Hold the push until the edit is on screen. Serialising the list to RDF
      // is a solid chunk of main-thread work, and running it before the browser
      // has painted is what makes a delete feel like a freeze rather than a
      // wait.
      afterNextPaint(() => {
        profile('save.pod', () => saveToPod(savedData))
          .catch((err: unknown) => {
            console.error('Error saving to Pod:', err);
            return false;
          })
          .finally(() => {
            savesInFlightRef.current -= 1;
            // Reset the flag after the sync prevention window
            setTimeout(() => {
              isLocalChangeRef.current = false;
            }, SYNC_PREVENTION_WINDOW_MS);
          });
      });

      return savedData;
    },
    []
  );

  return {
    syncingFromPod,
    handleSyncSuccess,
    handleSyncError,
    saveWithSyncPrevention,
  };
}
