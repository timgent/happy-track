import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { profile, profileEvent, isProfilingEnabled, resetProfilingCache, getProfileEntries, clearProfileEntries } from './profiling'

const enable = () => {
    localStorage.setItem('happyTrack.profiling', '1')
    resetProfilingCache()
}

describe('profiling', () => {
    beforeEach(() => {
        localStorage.clear()
        resetProfilingCache()
        clearProfileEntries()
        vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('is off unless switched on', () => {
        expect(isProfilingEnabled()).toBe(false)

        profile('save', () => 'result')
        profileEvent('click')

        expect(getProfileEntries()).toEqual([])
    })

    it('returns the value of the measured function either way', async () => {
        expect(profile('sync', () => 41 + 1)).toBe(42)
        enable()
        expect(profile('sync', () => 41 + 1)).toBe(42)
        await expect(profile('async', async () => 'done')).resolves.toBe('done')
    })

    it('records a completed measurement once enabled', () => {
        enable()

        profile('save.localDb', () => 'saved', { listId: 'l1' })

        const [entry] = getProfileEntries()
        expect(entry.label).toBe('save.localDb')
        expect(entry.durationMs).toBeGreaterThanOrEqual(0)
        expect(entry.detail).toEqual({ listId: 'l1' })
    })

    it('waits for an async function to settle before recording it', async () => {
        enable()
        let release!: () => void
        const pending = new Promise<void>(resolve => { release = resolve })

        const measured = profile('pod.put', () => pending)
        expect(getProfileEntries()).toHaveLength(0)

        release()
        await measured

        expect(getProfileEntries().map(e => e.label)).toEqual(['pod.put'])
    })

    it('records a failure and lets the error through', async () => {
        enable()

        await expect(profile('pod.put', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')
        expect(() => profile('serialize', () => { throw new Error('bad data') })).toThrow('bad data')

        expect(getProfileEntries().map(e => e.detail)).toEqual([
            { failed: true },
            { failed: true },
        ])
    })
})
