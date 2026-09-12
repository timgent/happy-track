import { useId, useMemo, useRef, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { MAX_TAGS_PER_HAPPY, MAX_TAG_LENGTH, normaliseTag } from '../happies/types'

interface TagInputProps {
    tags: string[]
    onChange: (tags: string[]) => void
    /** Tags this journal already uses, most-used first, for the suggestions. */
    knownTags?: string[]
}

/**
 * Tags, as chips you type and Enter.
 *
 * Hand-rolled rather than a combobox library, because the interaction is small
 * and the two things that actually matter are hard to get from one:
 *
 * - **Comma and Enter both commit.** People type "family, dog" without
 *   thinking about it, and a field that swallows the comma into the tag is a
 *   field that quietly produces a tag called "family,".
 * - **Backspace on an empty box removes the last chip.** The standard gesture
 *   for a chip field; without it the only way to undo a tag is to find and hit
 *   its small × .
 *
 * Suggestions are the journal's existing tags, filtered as you type. They are
 * plain buttons rather than a listbox: there is no text-replacement or
 * inline-completion behaviour to announce, only "here are some you have used".
 */
export function TagInput({ tags, onChange, knownTags = [] }: TagInputProps) {
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const inputId = useId()
    const isFull = tags.length >= MAX_TAGS_PER_HAPPY

    const suggestions = useMemo(() => {
        const query = normaliseTag(draft)
        return knownTags
            .filter(tag => !tags.includes(tag))
            .filter(tag => query === '' || tag.includes(query))
            .slice(0, 6)
    }, [draft, knownTags, tags])

    const commit = (raw: string) => {
        const tag = normaliseTag(raw).slice(0, MAX_TAG_LENGTH)
        setDraft('')
        // Silently ignoring a duplicate is right here: the tag the user asked
        // for is on the happy either way, which is what they meant.
        if (!tag || tags.includes(tag) || isFull) return
        onChange([...tags, tag])
    }

    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Tags <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span>
            </label>

            {tags.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                    {tags.map(tag => (
                        <li key={tag}>
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 dark:bg-accent-900/50 py-1 pl-3 pr-1 text-sm font-medium text-accent-900 dark:text-accent-100">
                                {tag}
                                <button
                                    type="button"
                                    onClick={() => onChange(tags.filter(other => other !== tag))}
                                    aria-label={`Remove tag ${tag}`}
                                    className="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-accent-200 dark:hover:bg-accent-800"
                                >
                                    <XMarkIcon aria-hidden="true" className="h-3.5 w-3.5" />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <input
                ref={inputRef}
                id={inputId}
                type="text"
                value={draft}
                disabled={isFull}
                maxLength={MAX_TAG_LENGTH}
                placeholder={isFull ? `That's ${MAX_TAGS_PER_HAPPY} tags — plenty` : 'family, walk, work…'}
                onChange={event => {
                    // A pasted "a, b, c" commits everything before the last comma.
                    if (event.target.value.includes(',')) {
                        const parts = event.target.value.split(',')
                        for (const part of parts.slice(0, -1)) commit(part)
                        setDraft(parts[parts.length - 1].trimStart())
                        return
                    }
                    setDraft(event.target.value)
                }}
                onKeyDown={event => {
                    if (event.key === 'Enter') {
                        // The composer's own Enter-to-save must not also fire.
                        event.preventDefault()
                        commit(draft)
                        return
                    }
                    if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
                        onChange(tags.slice(0, -1))
                    }
                }}
                // Committing on blur saves the tag someone typed and then
                // reached straight for Save — the alternative is losing it
                // without a word.
                onBlur={() => commit(draft)}
                className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-colors hover:border-gray-300 dark:hover:border-gray-600 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            />

            {suggestions.length > 0 && !isFull && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Used before:</span>
                    {suggestions.map(tag => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => {
                                commit(tag)
                                inputRef.current?.focus()
                            }}
                            className="rounded-full border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:border-accent-400 hover:bg-accent-50 dark:hover:bg-accent-950/40"
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
