import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { Happy, HappyMonth } from '../happies/types'
import { todayKey } from '../happies/dates'

vi.mock('../hooks/useHappies', async () => {
    const actual = await vi.importActual<typeof import('../hooks/useHappies')>('../hooks/useHappies')
    return { ...actual, useHappies: vi.fn() }
})
vi.mock('../hooks/useHappySettings', () => ({ useHappySettings: vi.fn() }))
vi.mock('../components/ToastContext', () => ({ useToast: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))

import { useHappies } from '../hooks/useHappies'
import { useHappySettings } from '../hooks/useHappySettings'
import { useToast } from '../components/ToastContext'
import { useSolidPod } from '../components/SolidPodContext'
import { TodayPage } from './today'

const saveHappy = vi.fn().mockResolvedValue(undefined)
const TODAY = todayKey()

function happy(id: string, text: string, minute: string): Happy {
    return {
        id,
        date: TODAY,
        text,
        createdAt: `${TODAY}T${minute}:00.000Z`,
        lastModified: `${TODAY}T${minute}:00.000Z`,
    }
}

// Today reads in the order it was written, so these are the cards at 0 and 1.
const FIRST = happy('first', 'Coffee on the balcony', '09:00')
const SECOND = happy('second', 'The dog learned to sit', '17:00')

function renderToday() {
    const month: HappyMonth = { month: TODAY.slice(0, 7), happies: [FIRST, SECOND], deletions: [] }
    vi.mocked(useHappies).mockReturnValue({
        months: [month],
        activeMonth: month,
        writtenDays: new Set([TODAY]),
        isLoading: false,
        isCheckingPod: false,
        syncingFromPod: false,
        saveHappy,
        deleteHappy: vi.fn(),
        restoreHappy: vi.fn(),
    })
    render(
        <MemoryRouter>
            <TodayPage />
        </MemoryRouter>,
    )
}

function actionsButton(index: number) {
    const item = screen.getAllByRole('listitem')[index]
    return within(item).getByRole('button', { name: /actions for this happy/i })
}

function startEditing(index: number) {
    fireEvent.pointerDown(actionsButton(index), { button: 0, ctrlKey: false, pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('menuitem', { name: /edit/i }), { button: 0 })
}

describe('TodayPage — editing a happy', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useHappySettings).mockReturnValue({
            settings: { promptsEnabled: true, moodEnabled: true, onThisDayEnabled: true },
            isLoading: false,
            updateSettings: vi.fn(),
        })
        vi.mocked(useToast).mockReturnValue({ showToast: vi.fn(), dismissToast: vi.fn() })
        vi.mocked(useSolidPod).mockReturnValue({
            isLoggedIn: false,
            isReconnecting: false,
            session: null,
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('opens the editor on the card, not above the day', () => {
        renderToday()

        startEditing(1)

        const items = screen.getAllByRole('listitem')
        expect(within(items[1]).getByTestId('happy-composer')).toBeTruthy()
        expect(screen.getAllByTestId('happy-composer')).toHaveLength(1)
    })

    // The editor used to be a single box at a fixed position, so moving to a
    // second happy reconciled it rather than remounting it: the text stayed
    // behind and Save wrote it over the happy that had just been chosen.
    it('saves the happy that is actually being edited', async () => {
        renderToday()

        startEditing(0)
        startEditing(1)
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => expect(saveHappy).toHaveBeenCalledOnce())
        expect(saveHappy.mock.calls[0][0]).toMatchObject({ id: SECOND.id, text: SECOND.text })
    })

    it('puts focus back on the card the edit came from', async () => {
        renderToday()

        startEditing(1)
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

        await waitFor(() => expect(screen.getAllByTestId('happy-card')).toHaveLength(2))
        expect(document.activeElement).toBe(actionsButton(1))
    })
})
