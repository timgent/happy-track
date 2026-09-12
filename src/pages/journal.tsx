import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDebounce } from 'use-debounce'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useHappies, editedHappy } from '../hooks/useHappies'
import { useHappySettings } from '../hooks/useHappySettings'
import { HappyCard } from '../components/HappyCard'
import { HappyComposer, type ComposerDraft } from '../components/HappyComposer'
import { MonthNavigator } from '../components/MonthNavigator'
import { LoadingState } from '../components/LoadingState'
import { PodSyncIndicator } from '../components/PodSyncIndicator'
import { Callout } from '../components/Callout'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { useToast } from '../components/ToastContext'
import { groupByDay, searchHappies } from '../happies/search'
import { tagCounts } from '../happies/insights'
import {
    formatDayHeading,
    formatMonthHeading,
    isMonthKey,
    thisMonthKey,
    todayKey,
} from '../happies/dates'
import type { Happy } from '../happies/types'

/** How long to wait after the last keystroke before filtering. */
const SEARCH_DEBOUNCE_MS = 200

/**
 * The journal: everything you have written, read back.
 *
 * The month is in the URL (`/journal/2026-08`) and the search and tag filters
 * are in the query string, so every view here is a link someone can bookmark or
 * come back to — which is also what lets the insights page's tag chips point at
 * it.
 *
 * Searching deliberately leaves the month behind (see `searchHappies`): a query
 * covers the whole journal, and the month navigator gives way to a result count
 * while one is active. Scoping a search to the month that happened to be on
 * screen is how someone concludes their holiday was never written down.
 */
export function JournalPage() {
    const { month: monthParam } = useParams<{ month?: string }>()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    const { showToast } = useToast()
    const today = todayKey()

    const { settings } = useHappySettings()
    const {
        months,
        writtenDays,
        isLoading,
        isCheckingPod,
        saveHappy,
        deleteHappy,
        restoreHappy,
    } = useHappies()

    // A month in the URL that is not a month — a hand-typed or stale link —
    // falls back to this one rather than rendering an empty page for
    // "/journal/september".
    const month = monthParam && isMonthKey(monthParam) ? monthParam : thisMonthKey()
    const tag = searchParams.get('tag') ?? undefined

    // The URL is the source of truth for the committed search; `query` is only
    // the half-typed input on its way there.
    //
    // That direction matters. Reading the URL once at mount instead left the
    // two able to disagree: this is a hash route, so navigating to
    // `/journal/2026-08` while a search was active did not remount the page,
    // and the stale query went on filtering a month the reader had deliberately
    // asked for — with the month navigator hidden, because the page still
    // thought it was searching.
    const urlQuery = searchParams.get('q') ?? ''
    const [query, setQuery] = useState(urlQuery)
    const [debouncedQuery] = useDebounce(query, SEARCH_DEBOUNCE_MS)
    const [editing, setEditing] = useState<Happy | null>(null)
    const [pendingDelete, setPendingDelete] = useState<Happy | null>(null)

    // What we last wrote to the URL ourselves, so the effect below can tell a
    // change we caused from one that arrived by navigation.
    const pushedQueryRef = useRef(urlQuery)

    // Typing → URL. On the debounced value, not every keystroke, or the history
    // fills with one entry per character.
    useEffect(() => {
        const trimmed = debouncedQuery.trim()
        pushedQueryRef.current = trimmed
        setSearchParams(previous => {
            const next = new URLSearchParams(previous)
            if (trimmed) next.set('q', trimmed)
            else next.delete('q')
            return next
        }, { replace: true })
    }, [debouncedQuery, setSearchParams])

    // URL → input, for a change this page did not make: a shared link, the back
    // button, or a navigation to another month.
    useEffect(() => {
        if (urlQuery !== pushedQueryRef.current) {
            pushedQueryRef.current = urlQuery
            setQuery(urlQuery)
        }
    }, [urlQuery])

    // The committed query, which is the URL's — see above.
    const activeQuery = urlQuery
    const isSearching = activeQuery.length > 0 || tag !== undefined

    const results = useMemo(
        () => searchHappies(months, { query: activeQuery, tag, month }),
        [months, activeQuery, tag, month],
    )
    const dayGroups = useMemo(() => groupByDay(results), [results])
    const knownTags = useMemo(() => tagCounts(months).map(entry => entry.tag), [months])
    const popularTags = useMemo(() => tagCounts(months).slice(0, 6), [months])

    const earliestMonth = months.find(candidate => candidate.happies.length > 0)?.month

    const clearFilters = () => {
        setQuery('')
        setSearchParams(previous => {
            const next = new URLSearchParams(previous)
            next.delete('q')
            next.delete('tag')
            return next
        }, { replace: true })
    }

    const setTag = (nextTag: string | undefined) => {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous)
            if (nextTag) next.set('tag', nextTag)
            else next.delete('tag')
            return next
        }, { replace: true })
    }

    const handleEdit = async (draft: ComposerDraft) => {
        if (!editing) return
        await saveHappy(editedHappy(editing, draft))
        setEditing(null)
        showToast('Happy updated', 'success')
    }

    const confirmDelete = async () => {
        const happy = pendingDelete
        setPendingDelete(null)
        if (!happy) return
        await deleteHappy(happy)
        showToast('Happy deleted', 'success', undefined, {
            label: 'Undo',
            onAction: () => { void restoreHappy(happy) },
        })
    }

    if (isLoading) {
        return <LoadingState message="Fetching your journal…" />
    }

    const hasAnyHappies = months.some(candidate => candidate.happies.length > 0)

    return (
        <div className="mx-auto max-w-2xl">
            <h1 className="sr-only">Your journal</h1>

            {/* Filters in one row above the content, per the search-and-filter
                convention: the controls that change what is below sit above it. */}
            <div className="mb-5 space-y-3">
                <div className="relative">
                    <MagnifyingGlassIcon
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search everything you have written…"
                        aria-label="Search your happies"
                        className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 pl-11 pr-4 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-colors hover:border-gray-300 dark:hover:border-gray-600 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>

                {popularTags.length > 0 && (
                    <div data-testid="tag-filters" className="flex flex-wrap items-center gap-1.5">
                        {popularTags.map(entry => (
                            <button
                                key={entry.tag}
                                type="button"
                                aria-pressed={tag === entry.tag}
                                // Spelled out, because the visible label is the
                                // tag immediately followed by its count — which
                                // a screen reader would otherwise read as one
                                // word, "bike12".
                                aria-label={`${entry.tag}, ${entry.count} happ${entry.count === 1 ? 'y' : 'ies'}`}
                                onClick={() => setTag(tag === entry.tag ? undefined : entry.tag)}
                                className={`min-h-9 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                                    tag === entry.tag
                                        ? 'border-accent-600 bg-accent-600 text-white'
                                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-accent-400 hover:bg-accent-50 dark:hover:bg-accent-950/40'
                                }`}
                            >
                                <span aria-hidden="true">{entry.tag}</span>
                                <span aria-hidden="true" className="ml-1.5 opacity-70 tabular-nums">{entry.count}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {isSearching ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <p aria-live="polite" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {results.length === 0
                            ? 'Nothing matched'
                            : `${results.length} happ${results.length === 1 ? 'y' : 'ies'}`}
                        {tag && <> tagged <span className="font-bold">{tag}</span></>}
                        {activeQuery && <> matching “{activeQuery}”</>}
                        <span className="font-normal text-gray-500 dark:text-gray-400"> — across your whole journal</span>
                    </p>
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline"
                    >
                        <XMarkIcon aria-hidden="true" className="h-4 w-4" />
                        Clear
                    </button>
                </div>
            ) : (
                <div className="mb-5">
                    <MonthNavigator
                        month={month}
                        earliestMonth={earliestMonth}
                        writtenDays={writtenDays}
                        onChange={next => navigate(`/journal/${next}${searchParams.toString() ? `?${searchParams}` : ''}`)}
                    />
                </div>
            )}

            {isCheckingPod && results.length === 0 && <PodSyncIndicator />}

            {editing && (
                <div className="mb-5">
                    <HappyComposer
                        dateKey={editing.date}
                        editing={editing}
                        showMood={settings.moodEnabled}
                        showPrompt={false}
                        knownTags={knownTags}
                        onSave={handleEdit}
                        onCancel={() => setEditing(null)}
                        autoFocus
                    />
                </div>
            )}

            {dayGroups.length === 0 ? (
                isSearching ? (
                    <Callout
                        title="Nothing matched"
                        description={
                            <p>
                                Try fewer words, or{' '}
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="font-semibold underline hover:no-underline"
                                >
                                    clear the search
                                </button>{' '}
                                to go back to browsing by month.
                            </p>
                        }
                    />
                ) : (
                    <Callout
                        title={hasAnyHappies
                            ? `Nothing written in ${formatMonthHeading(month)}`
                            : 'Your journal starts here'}
                        description={
                            <p>
                                {hasAnyHappies
                                    ? 'Use the arrows above to look at another month, or '
                                    : 'Nothing written down yet. '}
                                <Link to="/today" className="font-semibold underline hover:no-underline">
                                    write today's happy
                                </Link>
                                .
                            </p>
                        }
                    />
                )
            ) : (
                <div className="space-y-6">
                    {dayGroups.map(group => (
                        <section key={group.date} aria-labelledby={`day-${group.date}`}>
                            <h2
                                id={`day-${group.date}`}
                                className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                            >
                                {formatDayHeading(group.date, today)}
                            </h2>
                            <ul className="space-y-3">
                                {group.happies.map(happy => (
                                    <li key={happy.id}>
                                        <HappyCard
                                            happy={happy}
                                            onEdit={setEditing}
                                            onDelete={setPendingDelete}
                                            onTagClick={setTag}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
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
