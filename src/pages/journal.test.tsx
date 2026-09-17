import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Happy, HappyMonth } from '../happies/types'

vi.mock('../hooks/useHappies', async () => {
    const actual = await vi.importActual<typeof import('../hooks/useHappies')>('../hooks/useHappies')
    return { ...actual, useHappies: vi.fn() }
})
vi.mock('../hooks/useHappySettings', () => ({ useHappySettings: vi.fn() }))
vi.mock('../components/ToastContext', () => ({ useToast: vi.fn() }))

import { useHappies } from '../hooks/useHappies'
import { useHappySettings } from '../hooks/useHappySettings'
import { useToast } from '../components/ToastContext'
import { JournalPage } from './journal'

const saveHappy = vi.fn().mockResolvedValue(undefined)
const deleteHappy = vi.fn().mockResolvedValue(undefined)

function happy(id: string, date: string, text: string): Happy {
    return {
        id,
        date,
        text,
        createdAt: `${date}T09:00:00.000Z`,
        lastModified: `${date}T09:00:00.000Z`,
    }
}

const MONTH = '2026-08'
const OLDER = happy('older', `${MONTH}-03`, 'Coffee on the balcony')
const NEWER = happy('newer', `${MONTH}-04`, 'The dog learned to sit')

// The journal reads newest day first, so `NEWER` is the card at index 0.
const NEWER_CARD = 0
const OLDER_CARD = 1

function renderJournal(happies: Happy[] = [OLDER, NEWER]) {
    const month: HappyMonth = { month: MONTH, happies, deletions: [] }
    vi.mocked(useHappies).mockReturnValue({
        months: [month],
        activeMonth: month,
        writtenDays: new Set(happies.map(entry => entry.date)),
        isLoading: false,
        isCheckingPod: false,
        syncingFromPod: false,
        saveHappy,
        deleteHappy,
        restoreHappy: vi.fn(),
    })
    return render(
        <MemoryRouter initialEntries={[`/journal/${MONTH}`]}>
            <Routes>
                <Route path="/journal/:month" element={<JournalPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

/** The kebab on the nth entry in the list. */
function actionsButton(index: number) {
    const item = screen.getAllByRole('listitem')[index]
    return within(item).getByRole('button', { name: /actions for this happy/i })
}

/** Opens the kebab on the nth entry and chooses Edit. */
function startEditing(index: number) {
    // Radix opens on pointerdown, not click.
    fireEvent.pointerDown(actionsButton(index), { button: 0, ctrlKey: false, pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit/i }), { button: 0 })
}

function composer() {
    return screen.getByTestId('happy-composer')
}

function editorText() {
    return (composer().querySelector('textarea') as HTMLTextAreaElement).value
}

describe('JournalPage — editing a happy', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useHappySettings).mockReturnValue({
            settings: { promptsEnabled: true, moodEnabled: true, onThisDayEnabled: true },
            isLoading: false,
            updateSettings: vi.fn(),
        })
        vi.mocked(useToast).mockReturnValue({ showToast: vi.fn(), dismissToast: vi.fn() })
    })

    // The journal is as long as the user's history, so an editor rendered at the
    // top of the page is off-screen for every happy but the first — and on a
    // phone nothing focuses it either, so Edit looks like a dead button (#1).
    it('opens the editor where the card was, not at the top of the page', () => {
        renderJournal()

        startEditing(OLDER_CARD)

        const items = screen.getAllByRole('listitem')
        expect(within(items[OLDER_CARD]).getByTestId('happy-composer')).toBeTruthy()
        expect(screen.getAllByTestId('happy-composer')).toHaveLength(1)
    })

    it('leaves the other happies on screen while one is being edited', () => {
        renderJournal()

        startEditing(OLDER_CARD)

        expect(screen.getByText(NEWER.text)).toBeTruthy()
        expect(screen.getAllByTestId('happy-card')).toHaveLength(1)
    })

    // A single editor at a fixed position is reconciled rather than remounted,
    // so its state survived a change of subject: the box kept the first happy's
    // text while Save wrote it over the second one.
    it('shows the second happy when Edit moves to it mid-edit', () => {
        renderJournal()

        startEditing(NEWER_CARD)
        expect(editorText()).toBe(NEWER.text)

        startEditing(OLDER_CARD)

        expect(editorText()).toBe(OLDER.text)
    })

    it('saves the happy that is actually being edited', async () => {
        renderJournal()

        startEditing(NEWER_CARD)
        startEditing(OLDER_CARD)
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(saveHappy).toHaveBeenCalledOnce())
        expect(saveHappy.mock.calls[0][0]).toMatchObject({ id: OLDER.id, text: OLDER.text })
    })

    it('puts focus back on the card it came from when the edit is saved', async () => {
        renderJournal()

        startEditing(OLDER_CARD)
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(screen.getAllByTestId('happy-card')).toHaveLength(2))
        expect(document.activeElement).toBe(actionsButton(OLDER_CARD))
    })

    it('puts focus back on the card it came from when the edit is cancelled', async () => {
        renderJournal()

        startEditing(OLDER_CARD)
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

        await waitFor(() => expect(screen.getAllByTestId('happy-card')).toHaveLength(2))
        expect(document.activeElement).toBe(actionsButton(OLDER_CARD))
    })

    // An editor outside the list outlived the list: searching or changing month
    // left it open with no card in sight, still pointed at a happy the reader
    // could no longer see.
    it('closes the editor when a search takes its happy off screen', async () => {
        renderJournal()

        startEditing(NEWER_CARD)
        fireEvent.change(screen.getByRole('searchbox', { name: /search your happies/i }), {
            target: { value: 'balcony' },
        })

        // The search is debounced on its way into the URL, which is what the
        // results are read from.
        await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
        expect(screen.queryByTestId('happy-composer')).toBeNull()
    })
})
