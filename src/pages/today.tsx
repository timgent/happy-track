import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useHappies, newHappy, editedHappy } from '../hooks/useHappies'
import { useHappySettings } from '../hooks/useHappySettings'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { HappyComposer, type ComposerDraft } from '../components/HappyComposer'
import { HappyCard } from '../components/HappyCard'
import { StreakBadge } from '../components/StreakBadge'
import { CelebrationBanner } from '../components/CelebrationBanner'
import { OnThisDayCard } from '../components/OnThisDayCard'
import { LoadingState } from '../components/LoadingState'
import { PodSyncIndicator } from '../components/PodSyncIndicator'
import { SyncAcrossDevicesPrompt } from '../components/SyncAcrossDevicesPrompt'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { computeStreak, isMilestone } from '../happies/streak'
import { happiesOnDay } from '../happies/mergeMonths'
import { sameDayInEarlierYears, todayKey } from '../happies/dates'
import { tagCounts } from '../happies/insights'
import type { Happy } from '../happies/types'
import { tapFeedback } from '../utils/haptics'

/** How many years back "On this day" looks. */
const ON_THIS_DAY_YEARS = 5

/** A greeting that matches the clock, because "Good morning" at 11pm is wrong. */
function greeting(now: Date = new Date()): string {
    const hour = now.getHours()
    if (hour < 5) return 'Still up?'
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
}

/**
 * Today: the page the app is for.
 *
 * Everything here is arranged around one move — write a line, save it — and
 * the order of the page is the order of that move:
 *
 *   greeting → streak → the box → what you have written today → on this day
 *
 * The streak sits *above* the box and "on this day" *below* it, deliberately.
 * The streak is context for the thing you are about to do; the memory is a
 * reward for having done it. Reversing them would make the page about the past.
 */
export function TodayPage() {
    const navigate = useNavigate()
    const today = todayKey()
    const { isLoggedIn, isReconnecting } = useSolidPod()
    const { showToast } = useToast()
    const { settings, isLoading: isLoadingSettings } = useHappySettings()
    const {
        months,
        writtenDays,
        isLoading,
        isCheckingPod,
        saveHappy,
        deleteHappy,
        restoreHappy,
    } = useHappies()

    const [editing, setEditing] = useState<Happy | null>(null)
    // See `HappyCard.focusActions`: editing swaps the card for the composer, so
    // the kebab that opened the editor no longer exists when it closes.
    const [focusAfterEdit, setFocusAfterEdit] = useState<string | null>(null)
    const [pendingDelete, setPendingDelete] = useState<Happy | null>(null)
    const [justSavedId, setJustSavedId] = useState<string | null>(null)
    const [isComposerOpen, setIsComposerOpen] = useState(true)
    const [celebrating, setCelebrating] = useState<number | null>(null)

    const todaysHappies = useMemo(() => happiesOnDay(months, today), [months, today])
    const streak = useMemo(() => computeStreak(writtenDays, today), [writtenDays, today])
    const knownTags = useMemo(() => tagCounts(months).map(entry => entry.tag), [months])

    const onThisDay = useMemo(() => {
        if (!settings.onThisDayEnabled) return []
        const keys = sameDayInEarlierYears(today, ON_THIS_DAY_YEARS)
        return keys.flatMap(key => happiesOnDay(months, key))
    }, [months, settings.onThisDayEnabled, today])

    // Once today has something in it the box folds away, so the page settles
    // into "here is what you wrote" rather than still asking. It reopens on
    // demand — several happies a day is a first-class case, not an edge one.
    useEffect(() => {
        if (!isLoading) setIsComposerOpen(todaysHappies.length === 0)
    }, [isLoading, todaysHappies.length])

    const handleSave = async (draft: ComposerDraft) => {
        const happy = newHappy({ ...draft, date: today })
        const streakBefore = streak.current
        await saveHappy(happy)
        tapFeedback()
        setJustSavedId(happy.id)

        // The milestone is judged on what the streak becomes, and only when the
        // day was not already claimed: a second happy on the same day does not
        // advance a streak, so it must not re-fire the confetti.
        if (!streak.writtenToday) {
            const after = streakBefore + 1
            if (isMilestone(after)) setCelebrating(after)
        }
    }

    const closeEditor = () => {
        setFocusAfterEdit(editing?.id ?? null)
        setEditing(null)
    }

    const handleEdit = async (draft: ComposerDraft) => {
        if (!editing) return
        await saveHappy(editedHappy(editing, draft))
        closeEditor()
        showToast('Happy updated', 'success')
    }

    const confirmDelete = async () => {
        const happy = pendingDelete
        setPendingDelete(null)
        if (!happy) return
        await deleteHappy(happy)
        // Undo rather than a second confirmation: the dialog already asked, and
        // this is the safety net for the answer given too quickly.
        showToast('Happy deleted', 'success', undefined, {
            label: 'Undo',
            onAction: () => { void restoreHappy(happy) },
        })
    }

    if (isLoading || isLoadingSettings) {
        return <LoadingState message="Opening your journal…" rows={2} />
    }

    return (
        <div className="mx-auto max-w-2xl">
            {celebrating !== null && (
                <CelebrationBanner milestone={celebrating} onDismiss={() => setCelebrating(null)} />
            )}

            <header className="mb-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 sm:text-3xl">
                    {greeting()}
                </h1>
                <div className="mt-1.5">
                    <StreakBadge streak={streak} />
                </div>
            </header>

            {/* Only worth showing to someone with something to lose. */}
            {!isLoggedIn && !isReconnecting && months.length > 0 && <SyncAcrossDevicesPrompt />}

            {isCheckingPod && todaysHappies.length === 0 && <PodSyncIndicator subject="today" />}

            {isComposerOpen ? (
                <HappyComposer
                    dateKey={today}
                    showMood={settings.moodEnabled}
                    showPrompt={settings.promptsEnabled}
                    knownTags={knownTags}
                    onSave={handleSave}
                    onCancel={todaysHappies.length > 0 ? () => setIsComposerOpen(false) : undefined}
                    heading={todaysHappies.length > 0 ? 'What else made you happy?' : undefined}
                />
            ) : (
                <Button variant="ghost" onClick={() => setIsComposerOpen(true)} className="w-full">
                    <PlusIcon aria-hidden="true" className="h-5 w-5" />
                    Add another happy
                </Button>
            )}

            {todaysHappies.length > 0 && (
                <section aria-labelledby="today-heading" className="mt-8">
                    <h2 id="today-heading" className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Today{todaysHappies.length > 1 ? ` · ${todaysHappies.length} happies` : ''}
                    </h2>
                    <ul className="space-y-3">
                        {todaysHappies.map(happy => (
                            <li key={happy.id}>
                                {editing?.id === happy.id ? (
                                    <HappyComposer
                                        dateKey={happy.date}
                                        editing={happy}
                                        showMood={settings.moodEnabled}
                                        showPrompt={false}
                                        knownTags={knownTags}
                                        onSave={handleEdit}
                                        onCancel={closeEditor}
                                        autoFocus
                                    />
                                ) : (
                                    <HappyCard
                                        happy={happy}
                                        isNew={happy.id === justSavedId}
                                        onEdit={setEditing}
                                        onDelete={setPendingDelete}
                                        // A tag does the same thing wherever it
                                        // is shown: it takes you to everything
                                        // carrying it.
                                        onTagClick={tag => navigate(`/journal?tag=${encodeURIComponent(tag)}`)}
                                        focusActions={focusAfterEdit === happy.id}
                                        onActionsFocused={() => setFocusAfterEdit(null)}
                                    />
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {onThisDay.length > 0 && (
                <div className="mt-8">
                    <OnThisDayCard happies={onThisDay} today={today} />
                </div>
            )}

            {months.length > 0 && (
                <p className="mt-8 text-center text-sm">
                    <Link
                        to="/journal"
                        className="font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline"
                    >
                        Read back through your journal
                    </Link>
                </p>
            )}

            <ConfirmationDialog
                isOpen={pendingDelete !== null}
                title="Delete this happy?"
                message={pendingDelete ? `"${pendingDelete.text}"` : ''}
                confirmText="Delete"
                cancelText="Keep it"
                confirmVariant="danger"
                onConfirm={confirmDelete}
                onClose={() => setPendingDelete(null)}
            />
        </div>
    )
}
