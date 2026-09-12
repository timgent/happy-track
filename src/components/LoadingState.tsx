interface LoadingStateProps {
    /** What is being waited for, as a sentence. Announced, so make it useful. */
    message: string
    /** How many placeholder rows to draw. Roughly match the real content. */
    rows?: number
}

/**
 * Waiting, with the shape of what is coming.
 *
 * A spinner says "something is happening"; a skeleton says "three cards are
 * about to be here", which is the more useful sentence and stops the page
 * jumping when they arrive. The sun rocking above it is the app's own motion
 * rather than a generic throbber — and it holds still for anyone who asked for
 * reduced motion (see `.loading-sun` in index.css).
 */
export function LoadingState({ message, rows = 3 }: LoadingStateProps) {
    return (
        <div data-testid="loading-state" role="status" aria-live="polite" className="py-4">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                <span aria-hidden="true" className="loading-sun text-lg leading-none">☀️</span>
                {message}
            </p>
            {/* Decorative: the message above is what gets announced. */}
            <div aria-hidden="true" className="space-y-3">
                {Array.from({ length: rows }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
                    >
                        <div className="loading-skeleton-bar h-4 w-3/4 rounded-full" />
                        <div className="loading-skeleton-bar mt-2.5 h-3 w-1/3 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}
