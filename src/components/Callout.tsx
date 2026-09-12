import type { ReactNode } from 'react'
import { Button } from './Button'

interface CalloutProps {
    title: string
    /** A node, not a string, so a callout can carry a link in its prose. */
    description: ReactNode
    action?: {
        label: string
        onClick: () => void
    }
}

/**
 * A framed aside: an empty state's explanation, or an offer the page is making.
 *
 * Warm-tinted rather than neutral, because everything it is used for here is
 * an invitation ("nothing to add up yet — write one") rather than a warning.
 * Anything that *is* a warning belongs in a banner, where the colour says so.
 */
export function Callout({ title, description, action }: CalloutProps) {
    return (
        <div className="rounded-2xl border-2 border-primary-200 dark:border-primary-800 bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-950/40 dark:to-accent-950/40 p-6 shadow-soft">
            <h3 className="text-lg font-bold text-primary-900 dark:text-primary-200">{title}</h3>
            <div className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {description}
            </div>
            {action && (
                <div className="mt-4">
                    <Button type="button" onClick={action.onClick} variant="primary">
                        {action.label}
                    </Button>
                </div>
            )}
        </div>
    )
}
