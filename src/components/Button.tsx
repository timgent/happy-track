import React from 'react'

/**
 * A variant is a claim about importance, so a screen showing four filled
 * buttons is claiming four things are the most important thing on it — which
 * is how a screen comes to open with a row of loud pills above the content
 * they were less important than. The tiers, loudest first:
 *
 * - `primary`   — the one action the screen exists for
 * - `secondary` — the one that is nearly it
 * - `danger`    — the one that cannot be undone
 * - `subtle`    — everything occasional: a neutral box, still plainly a button
 * - `ghost`     — the same quiet tier, with no box at all
 *
 * `subtle` exists because `ghost` is primary-tinted: a row of ghost buttons
 * still reads teal, and a row of *occasional* actions should read as nothing
 * in particular.
 */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'subtle' | 'ghost'
}

export function Button({ variant = 'primary', ...props }: ButtonProps) {
    /*
     * `min-h-[44px]` is the same floor PeopleFilterBar's chips hold, and the
     * reason is the same: a 36px control is smaller than the finger going to
     * it. It needs the flex centring beside it, or the label sits at the top
     * of a box the minimum has stretched.
     *
     * The scale bounce is behind `motion-safe:` because "reduce motion" is an
     * accessibility setting people turn on for vestibular reasons, not a
     * preference about polish.
     */
    const baseStyles = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl font-semibold transition-all duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed motion-safe:transform motion-safe:hover:scale-105 motion-safe:active:scale-95'

    /*
     * The filled variants use the `-button` gradients, not the decorative ones.
     * White on `secondary-500` is 2.8:1 and on `primary-500` 2.5:1 — both far
     * under the 4.5:1 that 14px semibold text needs. The darker ends clear it.
     * See the note beside the tokens in `index.css`.
     */
    const variantStyles = {
        primary: 'bg-gradient-primary-button text-white shadow-soft hover:shadow-glow-primary focus:ring-primary-500',
        secondary: 'bg-gradient-secondary-button text-white shadow-soft hover:shadow-glow-secondary focus:ring-secondary-500',
        danger: 'bg-gradient-to-r from-danger-600 to-danger-700 text-white shadow-soft hover:shadow-lg focus:ring-danger-500',
        subtle: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 focus:ring-gray-400',
        ghost: 'text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/40 border-2 border-primary-200 dark:border-primary-800 hover:border-primary-400 dark:hover:border-primary-600 focus:ring-primary-500'
    }[variant]

    return (
        <button
            {...props}
            className={`${baseStyles} ${variantStyles} ${props.className || ''}`}
        >
            {props.children}
        </button>
    )
}
