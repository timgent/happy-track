import { useEffect, useRef } from 'react'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { ActionMenu, ActionMenuItem } from './ActionMenu'
import { moodFor } from '../happies/types'
import type { Happy } from '../happies/types'

interface HappyCardProps {
    happy: Happy
    onEdit?: (happy: Happy) => void
    onDelete?: (happy: Happy) => void
    /** Plays the arrival flourish. Set only on a happy just written. */
    isNew?: boolean
    /** Turns a tag into a link into the journal, when the page has one to offer. */
    onTagClick?: (tag: string) => void
    /**
     * Takes focus on mount, onto the actions button.
     *
     * Set by a page handing focus back after this card's own editor closed:
     * editing replaces the card with the composer, so the button focus came
     * from no longer exists by the time the editor is done with it, and without
     * this focus lands on `<body>` and a keyboard user starts the list again.
     */
    focusActions?: boolean
    /** Called once focus has been taken, so the caller can stop asking. */
    onActionsFocused?: () => void
}

/** The time a happy was written, in the reader's own locale. */
function timeOf(createdAt: string): string {
    const date = new Date(createdAt)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    } catch {
        return ''
    }
}

/**
 * One happy, as it is read back.
 *
 * The text is the only thing given any weight. The mood, the time and the tags
 * are all metadata about it and are set in the quiet tier, because a page of
 * cards where every element competes is a page nobody re-reads — and re-reading
 * is the point of keeping a journal at all.
 *
 * The edit and delete actions sit behind a kebab menu rather than on the card.
 * They are used rarely, and a visible Delete on every card is a mis-tap waiting
 * to happen on a phone. `ActionMenu` is a real Radix `role="menu"`, so it comes
 * with roving arrow-key focus, Escape, outside-click and focus return.
 */
export function HappyCard({
    happy,
    onEdit,
    onDelete,
    isNew = false,
    onTagClick,
    focusActions = false,
    onActionsFocused,
}: HappyCardProps) {
    const mood = moodFor(happy.mood)
    const time = timeOf(happy.createdAt)
    const actionsRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!focusActions) return
        actionsRef.current?.focus()
        onActionsFocused?.()
    }, [focusActions, onActionsFocused])

    return (
        <article
            data-testid="happy-card"
            className={`group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft transition-shadow hover:shadow-md ${isNew ? 'happy-card-arriving' : ''}`}
        >
            <div className="flex items-start gap-3">
                {mood && (
                    // The label rather than aria-hidden: the face carries real
                    // information here, unlike the one in the picker where a
                    // written label sits beside it.
                    <span className="shrink-0 text-2xl leading-7" role="img" aria-label={mood.label}>
                        {mood.emoji}
                    </span>
                )}
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-base leading-7 text-gray-900 dark:text-gray-100">
                    {happy.text}
                </p>
                {(onEdit || onDelete) && (
                    <div className="shrink-0">
                        <ActionMenu label="Actions for this happy" triggerRef={actionsRef}>
                            {onEdit && (
                                <ActionMenuItem onSelect={() => onEdit(happy)} icon={<PencilIcon className="h-4 w-4" />}>
                                    Edit
                                </ActionMenuItem>
                            )}
                            {onDelete && (
                                <ActionMenuItem onSelect={() => onDelete(happy)} icon={<TrashIcon className="h-4 w-4" />}>
                                    Delete
                                </ActionMenuItem>
                            )}
                        </ActionMenu>
                    </div>
                )}
            </div>

            {(happy.tags?.length || time) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-0.5">
                    {time && (
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{time}</span>
                    )}
                    {happy.tags?.map(tag => (
                        onTagClick ? (
                            <button
                                key={tag}
                                type="button"
                                onClick={() => onTagClick(tag)}
                                className="rounded-full bg-accent-50 dark:bg-accent-950/50 px-2.5 py-0.5 text-xs font-medium text-accent-800 dark:text-accent-200 transition-colors hover:bg-accent-100 dark:hover:bg-accent-900"
                            >
                                {tag}
                            </button>
                        ) : (
                            <span
                                key={tag}
                                className="rounded-full bg-accent-50 dark:bg-accent-950/50 px-2.5 py-0.5 text-xs font-medium text-accent-800 dark:text-accent-200"
                            >
                                {tag}
                            </span>
                        )
                    ))}
                </div>
            )}
        </article>
    )
}
