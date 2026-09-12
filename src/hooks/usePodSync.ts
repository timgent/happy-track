import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SolidDataset } from '@inrupt/solid-client';
import { useSolidPod } from '../components/SolidPodContext';
import { resolvePodUrl, loadRdfFromPod, saveRdfToPod, lastSeenEtag, AuthenticationError, PodPreconditionFailedError, PodUrlUnavailableError, isRetryablePodUrlFailure } from '../services/solidPod';
import type { AppSession } from '../types/AppSession';
import { profile, profileEvent } from '../utils/profiling';

/**
 * Configuration for Pod file paths
 */
export interface PodPathConfig {
  /**
   * Container path within the Pod (e.g., 'happy-track/months/')
   */
  container: string;

  /**
   * Filename or function to generate filename
   * - string: static filename (e.g., 'settings.ttl')
   * - function: dynamic filename based on resource ID (e.g., (id) => `${id}.json`)
   */
  filename: string | ((resourceId: string) => string);

  /**
   * Optional resource ID (required when filename is a function)
   */
  resourceId?: string | null;

  /**
   * Override the pod URL — bypasses resolvePodUrl when set.
   * Use this to sync with a foreign user's pod (e.g. a shared list).
   */
  podUrl?: string;
}

export interface PodSyncOptions<T> {
  /**
   * Configuration for Pod file path
   */
  pathConfig: PodPathConfig;

  /**
   * RDF serialization/deserialization functions
   */
  rdf: {
    serialize: (data: T, datasetUrl: string) => SolidDataset;
    deserialize: (dataset: SolidDataset, url: string) => T;
  };

  /**
   * Polling interval in milliseconds (null/undefined to disable polling)
   */
  pollInterval?: number;

  /**
   * Sync once on mount even when pollInterval is not set.
   * Default: false (no breaking change for existing callers that rely on pollInterval).
   */
  syncOnMount?: boolean;

  /**
   * Callback when sync from Pod succeeds
   */
  onSyncSuccess?: (data: T) => void;

  /**
   * Callback when sync from Pod fails.
   * `cause` is the error itself, so callers can tell a Pod we couldn't reach
   * this second from a real fault worth reporting.
   */
  onSyncError?: (error: string, cause?: unknown) => void;

  /**
   * Callback when save to Pod succeeds
   */
  onSaveSuccess?: () => void;

  /**
   * Callback when save to Pod fails.
   * `cause` is the error itself — see `onSyncError`.
   */
  onSaveError?: (error: string, cause?: unknown) => void;

  /**
   * Whether sync is enabled
   */
  enabled?: boolean;
}

/** How a save should behave if the pod's copy has moved on since we read it. */
export interface SaveToPodOptions {
  /**
   * Refuse the write instead of applying it when the pod has changed since the
   * last read of this resource.
   *
   * For a write that is a *merge of what the pod had*: applying it blindly
   * would silently discard whatever arrived in between — including a write from
   * another Solid app, which has no local copy to heal from. A refused write
   * returns false and is not an error; the next poll re-reads, merges again,
   * and pushes that.
   */
  onlyIfUnchanged?: boolean;
}

export interface PodSyncState<T> {
  lastSync: Date | null;
  isSyncing: boolean;
  error: string | null;
  saveToPod: (data: T, options?: SaveToPodOptions) => Promise<boolean>;
  syncFromPod: () => Promise<void>;
}

/**
 * Where this user's Pod lives, or a `PodUrlUnavailableError` saying why we don't
 * know. Throwing rather than returning null keeps the reason attached all the
 * way to the callbacks, which is what lets a momentary blip stay out of the
 * user's face and out of Sentry.
 */
async function requirePodUrl(session: AppSession | null): Promise<string> {
  const { podUrl, reason } = await resolvePodUrl(session);
  if (!podUrl) {
    throw new PodUrlUnavailableError(reason ?? 'no-session');
  }
  return podUrl;
}

/**
 * Generic hook for automatic synchronization with Solid Pod
 * Polls the pod at regular intervals and provides manual sync functions
 *
 * @example
 * // For settings (static path)
 * usePodSync<HappySettings>({
 *   pathConfig: {
 *     container: POD_CONTAINERS.ROOT,
 *     filename: 'settings.ttl'
 *   },
 *   onSyncSuccess: (data) => console.log(data)
 * })
 *
 * @example
 * // For one month of happies (dynamic path based on the month key)
 * usePodSync<HappyMonth>({
 *   pathConfig: {
 *     container: POD_CONTAINERS.MONTHS,
 *     filename: (month) => `${month}.ttl`,
 *     resourceId: '2026-09'
 *   },
 *   onSyncSuccess: (data) => console.log(data)
 * })
 */
export function usePodSync<T>(options: PodSyncOptions<T>): PodSyncState<T> {
  const {
    pathConfig,
    rdf,
    pollInterval,
    syncOnMount = false,
    onSyncSuccess,
    onSyncError,
    onSaveSuccess,
    onSaveError,
    enabled = true,
  } = options;

  const { session, isLoggedIn } = useSolidPod();
  // lastSync/isSyncing are kept in refs, not state: background polling runs
  // every few seconds and updating state here would re-render the whole
  // consuming page on every poll even when nothing changed. The returned
  // values are snapshots from the last render.
  const lastSyncRef = useRef<Date | null>(null);
  const [error, setErrorState] = useState<string | null>(null);

  // Use ref to prevent concurrent syncs
  const isSyncingRef = useRef(false);

  // Only touch error state when the value actually changes, so a steady
  // error (or steady success) doesn't re-render consumers on every poll.
  const errorRef = useRef<string | null>(null);
  const setError = useCallback((value: string | null) => {
    if (errorRef.current !== value) {
      errorRef.current = value;
      setErrorState(value);
    }
  }, []);

  // Refs for callbacks so syncFromPod/saveToPod always call the latest version,
  // even when captured by a stale closure in the polling useEffect.
  const onSyncSuccessRef = useRef(onSyncSuccess);
  onSyncSuccessRef.current = onSyncSuccess;
  const onSyncErrorRef = useRef(onSyncError);
  onSyncErrorRef.current = onSyncError;
  const onSaveSuccessRef = useRef(onSaveSuccess);
  onSaveSuccessRef.current = onSaveSuccess;
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  // Create a stable key for pathConfig to use in useEffect dependencies
  // This prevents the interval from restarting when pathConfig object reference changes
  const pathConfigKey = useMemo(() => {
    const { container, filename, resourceId, podUrl } = pathConfig;
    const filenameKey = typeof filename === 'function' ? 'function' : filename;
    return `${container}:${filenameKey}:${resourceId || ''}:${podUrl || ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathConfig.container, pathConfig.filename, pathConfig.resourceId, pathConfig.podUrl]);

  // Read pathConfig/rdf through refs inside the callbacks below so their
  // identity only depends on the stable pathConfigKey — callers pass fresh
  // object literals on every render, and letting those churn saveToPod/
  // syncFromPod identity would cascade re-renders through consumers.
  const pathConfigRef = useRef(pathConfig);
  pathConfigRef.current = pathConfig;
  const rdfRef = useRef(rdf);
  rdfRef.current = rdf;

  /**
   * Resolve the full file URL from the path configuration
   */
  const getFileUrl = useCallback((podUrl: string): string | null => {
    const { container, filename, resourceId } = pathConfigRef.current;

    // If filename is a function, we need a resourceId
    if (typeof filename === 'function') {
      if (!resourceId) {
        return null;
      }
      return `${podUrl}${container}${filename(resourceId)}`;
    }

    // Static filename - could be full path or just filename
    // Handle both cases: 'happy-track/file.ttl' or just 'file.ttl'
    if (filename.includes('/')) {
      // Full path provided
      return `${podUrl}${filename}`;
    } else {
      // Just filename, append to container
      return `${podUrl}${container}${filename}`;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathConfigKey]);

  /**
   * Load data from the Pod
   */
  const syncFromPod = useCallback(async () => {
    const isForeignPod = !!pathConfigRef.current.podUrl
    if (!enabled || (!isLoggedIn && !isForeignPod) || isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    profileEvent('podSync.syncFromPod.start');
    setError(null);

    try {
      const podUrl = pathConfigRef.current.podUrl ?? await requirePodUrl(session);

      const fileUrl = getFileUrl(podUrl);

      if (!fileUrl) {
        // Missing required resourceId - silently skip
        return;
      }

      const data = await profile('podSync.syncFromPod.load', () => loadRdfFromPod<T>(session ?? null, fileUrl, rdfRef.current.deserialize), { fileUrl });

      lastSyncRef.current = new Date();

      if (onSyncSuccessRef.current) {
        onSyncSuccessRef.current(data);
      }
    } catch (err: unknown) {
      const statusCode = typeof err === 'object' && err !== null ? (err as { statusCode?: number }).statusCode : undefined
      // 404 on own pod = file not yet created (expected) → silent
      // 404 on foreign pod (pathConfig.podUrl set) = file missing or access denied → report
      const isSilentMiss = statusCode === 404 && !pathConfigRef.current.podUrl
      // Not knowing where the Pod is yet is not a failed sync, it is a sync that
      // hasn't started. This poll runs every few seconds, so the next one picks
      // it up — reporting it would mean an error per tick for a bad minute of
      // network. An account that declares no storage at all is not retryable and
      // still reports.
      if (isRetryablePodUrlFailure(err)) {
        console.warn('Skipping sync from Pod:', (err as Error).message)
      } else if (!isSilentMiss) {
        // Authentication errors use their own message
        const errorMessage = err instanceof AuthenticationError
          ? err.message
          : (err instanceof Error ? err.message : 'Failed to sync from Pod');
        setError(errorMessage);

        if (onSyncErrorRef.current) {
          onSyncErrorRef.current(errorMessage, err);
        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [enabled, isLoggedIn, session, getFileUrl, setError]);

  /**
   * Save data to the Pod
   */
  const saveToPod = useCallback(async (data: T, saveOptions?: SaveToPodOptions): Promise<boolean> => {
    const isForeignPod = !!pathConfigRef.current.podUrl
    if (!enabled || (!isLoggedIn && !isForeignPod)) {
      return false;
    }

    setError(null);
    profileEvent('podSync.saveToPod.start');

    try {
      const podUrl = pathConfigRef.current.podUrl ?? await requirePodUrl(session);

      const fileUrl = getFileUrl(podUrl);

      if (!fileUrl) {
        throw new Error('Cannot save: missing resource ID');
      }

      await profile('podSync.saveToPod.write', () => saveRdfToPod({
        session: isLoggedIn ? session! : null,
        fileUrl,
        data,
        serializer: rdfRef.current.serialize,
        // Undefined when nothing has been read from this URL yet, which makes
        // the write unconditional — correct, because there is then no copy we
        // could be overwriting unseen.
        ifMatch: saveOptions?.onlyIfUnchanged ? lastSeenEtag(fileUrl) : undefined,
      }), { fileUrl });

      lastSyncRef.current = new Date();

      if (onSaveSuccessRef.current) {
        onSaveSuccessRef.current();
      }

      return true;
    } catch (err: unknown) {
      // Not a failure: somebody else wrote first, so this copy is stale and
      // the next poll will merge theirs in. Reporting it would put "could not
      // save" in front of a user whose data is perfectly safe.
      if (err instanceof PodPreconditionFailedError) {
        console.warn('Skipping save to Pod: the Pod copy changed first', err.fileUrl);
        return false;
      }

      // Authentication errors use their own message
      const errorMessage = err instanceof AuthenticationError
        ? err.message
        : (err instanceof Error ? err.message : 'Failed to save to Pod');
      setError(errorMessage);

      if (onSaveErrorRef.current) {
        onSaveErrorRef.current(errorMessage, err);
      }

      return false;
    }
  }, [enabled, isLoggedIn, session, getFileUrl, setError]);

  /**
   * Sync on mount (and/or) set up polling interval.
   *
   * - syncOnMount: true  → performs one sync immediately on mount (no polling)
   * - pollInterval: N    → performs one sync immediately on mount AND polls every N ms
   * - both false/unset   → no automatic sync
   *
   * Existing callers that pass pollInterval retain their original behaviour.
   */
  useEffect(() => {
    if (!enabled || (!isLoggedIn && !pathConfig.podUrl)) {
      return;
    }

    // Check if we have required config for syncing
    const { filename, resourceId } = pathConfig;
    if (typeof filename === 'function' && !resourceId) {
      // Can't sync without resourceId
      return;
    }

    // Do an initial sync when syncOnMount is true OR polling is configured
    if (syncOnMount || pollInterval) {
      syncFromPod();
    }

    if (!pollInterval) {
      return;
    }

    // Set up the polling interval
    const interval = setInterval(() => {
      syncFromPod();
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
    // Note: syncFromPod is intentionally omitted from deps to prevent interval churn
    // pathConfigKey is a stable string representation of pathConfig to avoid object reference issues
    // The interval only needs to restart when the actual config values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isLoggedIn, syncOnMount, pollInterval, pathConfigKey]);

  return {
    lastSync: lastSyncRef.current,
    isSyncing: isSyncingRef.current,
    error,
    saveToPod,
    syncFromPod,
  };
}
