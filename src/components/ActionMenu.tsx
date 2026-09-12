import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'

/**
 * The actions a page has but rarely needs, behind one control.
 *
 * A page's header is read on the way to its content, so what sits there is
 * charged against the content. Actions taken once a trip — share it, pull in
 * the latest questions — do not earn a filled button each; they earn a place
 * that is quiet until asked, which is this.
 *
 * The same kebab, and the same Radix menu, that the list cards already use for
 * their own actions (`HappyCard`'s menu): a menu of actions on a happy should
 * be the same object wherever a happy is looked at. Radix is
 * what makes it a real `role="menu"` — roving arrow-key focus, typeahead,
 * Escape, outside-click, focus returned to the trigger — none of which a
 * hand-rolled panel of buttons gets for free.
 */
export function ActionMenu({ label, children }: {
    /** What the trigger is, for the people who cannot see three dots. */
    label: string
    /** `ActionMenuItem`s. */
    children: ReactNode
}) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    aria-label={label}
                    title={label}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                    </svg>
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="w-64 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 py-1 z-50"
                >
                    {children}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}

/** One row of an `ActionMenu`, so the items in a panel agree with each other. */
export function ActionMenuItem({ onSelect, disabled, icon, children }: {
    onSelect: () => void
    disabled?: boolean
    /** Decorative — the label is what names the action. */
    icon?: ReactNode
    children: ReactNode
}) {
    return (
        <DropdownMenu.Item
            onSelect={onSelect}
            disabled={disabled}
            className="flex min-h-[44px] items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-default outline-none data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent"
        >
            {icon && <span aria-hidden="true" className="shrink-0 text-base leading-none">{icon}</span>}
            <span className="min-w-0">{children}</span>
        </DropdownMenu.Item>
    )
}
