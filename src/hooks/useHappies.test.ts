import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { HappyMonth } from '../happies/types'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../services/solidPod', async () => {
    const actual = await vi.importActual<typeof import('../services/solidPod')>('../services/solidPod')
    return {
        ...actual,
        resolvePodUrl: vi.fn(),
        loadRdfFromPod: vi.fn(),
        saveRdfToPod: vi.fn(),
    }
})

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { resolvePodUrl, loadRdfFromPod, saveRdfToPod } from '../services/solidPod'
import { useHappies, newHappy } from './useHappies'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockResolvePodUrl = vi.mocked(resolvePodUrl)
const mockLoadRdfFromPod = vi.mocked(loadRdfFromPod)
const mockSaveRdfToPod = vi.mocked(saveRdfToPod)

const POD_URL = 'https://pod.example/'

/** An in-memory stand-in for HappyTrackDatabase, keyed by month. */
function fakeDb() {
    const months = new Map<string, HappyMonth>()
    let revCounter = 0
    return {
        months,
        getMonth: vi.fn(async (monthKey: string) => months.get(monthKey) ?? null),
        saveMonth: vi.fn(async (month: HappyMonth) => {
            revCounter += 1
            const rev = `rev-${revCounter}`
            months.set(month.month, { ...month, _rev: rev })
            return { rev }
        }),
        getAllMonths: vi.fn(async () => [...months.values()]),
    }
}

describe('useHappies — pushing an edit to the Pod', () => {
    let db: ReturnType<typeof fakeDb>

    beforeEach(() => {
        vi.clearAllMocks()
        db = fakeDb()
        mockUseDatabase.mockReturnValue({ db: db as never, loginSyncVersion: 0, loginSyncInProgress: false })
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            isReconnecting: false,
            session: { fetch: fetch, info: { isLoggedIn: true, webId: 'https://pod.example/profile/card#me' } },
            sessionExpired: false,
            clearSessionExpired: vi.fn(),
            webId: 'https://pod.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockResolvePodUrl.mockResolvedValue({ podUrl: POD_URL })
        // The initial poll for the active month finds nothing yet — a silent 404.
        mockLoadRdfFromPod.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }))
        mockSaveRdfToPod.mockResolvedValue(undefined)
    })

    /**
     * `useHappies` is instantiated once per page with a single active month
     * (the one the journal or today's page is looking at) and polls the Pod
     * for that month only — see the module's own note on why. But an edit can
     * target *any* month: the journal lets you edit a happy from a month you
     * are not currently viewing as "active". The push straight after that
     * edit has to land on the edited happy's own month, not on whichever
     * month this hook instance happens to be polling — landing on the wrong
     * one overwrites that month's real Pod copy with a document that
     * describes a different one, and the active month's actual content is
     * gone from the Pod until the next full sync (if anything) rescues it.
     */
    it('pushes an edit to the happy\'s own month, not the hook\'s active month', async () => {
        const activeMonthKey = '2026-09'
        const otherMonthKey = '2026-08'

        // Seed both months locally, as if a previous sync had already pulled
        // them in.
        await db.saveMonth({ month: activeMonthKey, happies: [], deletions: [] })
        const oldHappy = newHappy(
            { text: 'An old happy from last month', date: `${otherMonthKey}-05` },
            new Date(`${otherMonthKey}-05T09:00:00.000Z`),
        )
        await db.saveMonth({ month: otherMonthKey, happies: [oldHappy], deletions: [] })
        db.saveMonth.mockClear()

        const { result } = renderHook(() => useHappies(activeMonthKey))
        await waitFor(() => expect(result.current.isLoading).toBe(false))

        await act(async () => {
            await result.current.saveHappy({ ...oldHappy, text: 'An old happy, edited' })
        })

        // The push after the edit is fired in the background, after a paint.
        await waitFor(() => expect(mockSaveRdfToPod).toHaveBeenCalled())

        const call = mockSaveRdfToPod.mock.calls[0][0]
        expect(call.fileUrl).toContain(`${otherMonthKey}.ttl`)
        expect(call.fileUrl).not.toContain(`${activeMonthKey}.ttl`)
    })
})
