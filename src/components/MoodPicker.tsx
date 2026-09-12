import { MOODS } from '../happies/types'
import type { MoodValue } from '../happies/types'

interface MoodPickerProps {
    value: MoodValue | undefined
    onChange: (mood: MoodValue | undefined) => void
    /** Names the group for a screen reader; defaults to a sensible question. */
    legend?: string
}

/**
 * The optional mood, as a row of five faces.
 *
 * Three decisions worth keeping:
 *
 * - **A radio group, not five buttons.** Arrow keys move between the faces and
 *   Tab leaves the group, which is what a single choice from a short list
 *   should do. Five tabbable buttons would put four extra stops between the
 *   textarea and Save.
 * - **Picking the selected face again clears it.** The field is optional, so
 *   there has to be a way back out of having answered — and reaching for a
 *   separate "clear" control for a five-item row would cost more than it saves.
 *   (Real radios cannot be unchecked by clicking, hence the explicit handler.)
 * - **The chosen face is named in words underneath.** A 🤩 without its label
 *   means whatever the reader thinks it means; the word is also what makes the
 *   selection legible to anyone who has emoji rendering turned off.
 */
export function MoodPicker({ value, onChange, legend = 'How did it feel?' }: MoodPickerProps) {
    const selected = MOODS.find(mood => mood.value === value)

    return (
        <fieldset>
            <legend className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {legend}{' '}
                <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span>
            </legend>
            <div className="flex flex-wrap items-center gap-1">
                {MOODS.map(mood => {
                    const isSelected = mood.value === value
                    return (
                        <button
                            key={mood.value}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={mood.label}
                            // One tab stop for the group: the selected face, or
                            // the first when nothing is picked yet.
                            tabIndex={isSelected || (!selected && mood.value === MOODS[0].value) ? 0 : -1}
                            onClick={() => onChange(isSelected ? undefined : mood.value)}
                            onKeyDown={event => {
                                const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
                                    : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
                                        : 0
                                if (step === 0) return
                                event.preventDefault()
                                const from = selected ? MOODS.indexOf(selected) : -1
                                const next = MOODS[(from + step + MOODS.length) % MOODS.length]
                                onChange(next.value)
                            }}
                            className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-all duration-150 motion-safe:hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                                isSelected
                                    ? 'bg-primary-100 dark:bg-primary-900/50 ring-2 ring-primary-600 dark:ring-primary-400 scale-110'
                                    : 'opacity-60 hover:opacity-100'
                            }`}
                        >
                            <span aria-hidden="true">{mood.emoji}</span>
                        </button>
                    )
                })}
                {/* Reserves its line whether or not anything is picked, so the
                    form below does not jump when a face is chosen. */}
                <span
                    aria-live="polite"
                    className="ml-2 min-w-28 text-sm font-medium text-gray-600 dark:text-gray-400"
                >
                    {selected?.label ?? ''}
                </span>
            </div>
        </fieldset>
    )
}
