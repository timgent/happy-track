import { useEffect, useId, useRef, useState } from 'react'
import { ArrowPathIcon, LightBulbIcon } from '@heroicons/react/24/outline'
import { Button } from './Button'
import { MoodPicker } from './MoodPicker'
import { TagInput } from './TagInput'
import { MAX_HAPPY_LENGTH } from '../happies/types'
import type { Happy, MoodValue } from '../happies/types'
import { promptForDay } from '../happies/prompts'
import { useIsDesktop } from '../hooks/useIsDesktop'

/** Kept in step with the `happy-card-arriving` animation in index.css. */
export const SAVE_FLOURISH_MS = 450

export interface ComposerDraft {
    text: string
    mood?: MoodValue
    tags: string[]
}

interface HappyComposerProps {
    /** The day this happy will be filed under, for the prompt and the label. */
    dateKey: string
    /** When editing, the happy being edited; absent when writing a new one. */
    editing?: Happy
    showMood: boolean
    showPrompt: boolean
    knownTags?: string[]
    onSave: (draft: ComposerDraft) => void | Promise<void>
    /** Shown only while editing — the way out without saving. */
    onCancel?: () => void
    /** Overrides the heading; the default asks the question. */
    heading?: string
    /** Autofocus the box on mount. Off by default — see the note below. */
    autoFocus?: boolean
}

/**
 * The box you type your happy into.
 *
 * The design brief for this one component is most of the app's:
 *
 * - **One required field.** Text. The mood and the tags are optional and are
 *   visibly marked so; nothing else is asked. A five-second capture is the
 *   whole product, and every extra required field is a day somebody does not
 *   bother.
 * - **Save is never a mystery.** It is disabled with an explanation while the
 *   box is empty, rather than silently doing nothing.
 * - **Autofocus is opt-in, and off on phones.** Focusing a textarea on mount
 *   throws up the on-screen keyboard over the content the user was about to
 *   read, and scrolls the page to somewhere they did not ask to be. On a
 *   desktop, where focus costs nothing, the caller can turn it on.
 * - **⌘/Ctrl+Enter saves; plain Enter does not.** A happy is often more than
 *   one line, and a textarea that submits on Enter cannot hold a second one.
 */
export function HappyComposer({
    dateKey,
    editing,
    showMood,
    showPrompt,
    knownTags = [],
    onSave,
    onCancel,
    heading,
    autoFocus = false,
}: HappyComposerProps) {
    const [text, setText] = useState(editing?.text ?? '')
    const [mood, setMood] = useState<MoodValue | undefined>(editing?.mood)
    const [tags, setTags] = useState<string[]>(editing?.tags ?? [])
    const [promptOffset, setPromptOffset] = useState(0)
    const [isSaving, setIsSaving] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const textareaId = useId()
    const isDesktop = useIsDesktop()

    const trimmed = text.trim()
    const canSave = trimmed.length > 0 && !isSaving

    // Grows with the text rather than scrolling inside a fixed box: a happy is
    // two or three lines and should be readable in one glance while it is
    // written. Runs on every change, because the height depends on the content.
    useEffect(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = 'auto'
        textarea.style.height = `${textarea.scrollHeight}px`
    }, [text])

    useEffect(() => {
        if (autoFocus && isDesktop) textareaRef.current?.focus()
    }, [autoFocus, isDesktop])

    const submit = async () => {
        if (!canSave) return
        setIsSaving(true)
        try {
            await onSave({ text: trimmed, mood, tags })
            // Cleared only for a new happy — an edit closes instead, and
            // clearing its fields first makes the panel flicker on the way out.
            if (!editing) {
                setText('')
                setMood(undefined)
                setTags([])
                setPromptOffset(0)
            }
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <form
            data-testid="happy-composer"
            onSubmit={event => { event.preventDefault(); void submit() }}
            className="rounded-2xl border border-primary-200 dark:border-primary-900/60 bg-white dark:bg-gray-900 p-4 shadow-soft sm:p-6"
        >
            <label htmlFor={textareaId} className="block text-lg font-bold text-gray-900 dark:text-gray-50 sm:text-xl">
                {heading ?? (editing ? 'Edit this happy' : 'What made you happy today?')}
            </label>

            {showPrompt && trimmed.length === 0 && !editing && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5">
                        <LightBulbIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
                        <span className="italic">{promptForDay(dateKey, promptOffset)}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setPromptOffset(offset => offset + 1)}
                        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-medium text-accent-700 dark:text-accent-300 underline transition-colors hover:no-underline"
                    >
                        <ArrowPathIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        Another idea
                    </button>
                </p>
            )}

            <textarea
                ref={textareaRef}
                id={textareaId}
                value={text}
                onChange={event => setText(event.target.value)}
                onKeyDown={event => {
                    // ⌘/Ctrl+Enter, not plain Enter — see the note above.
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        void submit()
                    }
                }}
                rows={2}
                maxLength={MAX_HAPPY_LENGTH}
                placeholder="A small good thing…"
                className="mt-3 w-full resize-none overflow-hidden rounded-xl border-2 border-primary-200 dark:border-primary-900 bg-white dark:bg-gray-950 px-4 py-3 text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-colors hover:border-primary-300 dark:hover:border-primary-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />

            {/* Only once it is nearly relevant: a character counter over an
                empty box is a warning about a problem nobody has. */}
            {text.length > MAX_HAPPY_LENGTH - 100 && (
                <p className="mt-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                    {MAX_HAPPY_LENGTH - text.length} characters left
                </p>
            )}

            {(showMood || tags.length > 0 || trimmed.length > 0) && (
                <div className="mt-4 space-y-4">
                    {showMood && <MoodPicker value={mood} onChange={setMood} />}
                    <TagInput tags={tags} onChange={setTags} knownTags={knownTags} />
                </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" disabled={!canSave}>
                    {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Save this happy'}
                </Button>
                {onCancel && (
                    <Button type="button" variant="subtle" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
                {/* Says why Save is unavailable, rather than leaving a dead
                    button to be poked at. */}
                {trimmed.length === 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        Write a few words first
                    </span>
                )}
            </div>
        </form>
    )
}
