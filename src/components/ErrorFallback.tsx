import { Button } from './Button'

interface ErrorFallbackProps {
    resetError: () => void
}

export function ErrorFallback({ resetError }: ErrorFallbackProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 dark:from-primary-950/40 via-white to-accent-50 dark:to-accent-950/40 px-4">
            <div className="max-w-md w-full text-center bg-white dark:bg-gray-900 rounded-2xl shadow-soft p-8">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                    We've been notified about this error. A report dialog should appear where you can add details
                    about what happened — that helps us fix it faster.
                </p>
                <Button onClick={resetError}>Try again</Button>
            </div>
        </div>
    )
}
