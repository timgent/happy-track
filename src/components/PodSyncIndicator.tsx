import { BriefcaseIcon } from '@heroicons/react/24/outline'

interface PodSyncIndicatorProps {
    /**
     * What is being checked, when the page is showing one thing rather than
     * everything — "this list", say. Omitted, the note stays general.
     */
    subject?: string
}

/**
 * A quiet note that what's on screen is the device's copy and the pod is still
 * being read.
 *
 * Pages render their local data immediately (see `useLocalFirstLoad`) rather
 * than waiting on the pod, so anything that appears or changes a moment later
 * needs to make sense. Deliberately a line of text rather than a spinner or an
 * overlay: nothing here is blocked on the pod, and the page must stay usable
 * while it answers.
 */
export function PodSyncIndicator({ subject }: PodSyncIndicatorProps) {
    return (
        <div
            data-testid="pod-sync-indicator"
            role="status"
            aria-live="polite"
            className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400"
        >
            <BriefcaseIcon aria-hidden="true" className="loading-suitcase h-4 w-4 shrink-0" />
            Checking your Pod for changes{subject ? ` to ${subject}` : ''}...
        </div>
    )
}
