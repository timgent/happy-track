import { describe, it, expect, beforeEach, vi } from 'vitest'
import { logAuthEvent, getAuthLog, formatAuthLog, resetAuthLogCacheForTests } from './authLog'

describe('authLog', () => {
    beforeEach(() => {
        localStorage.clear()
        resetAuthLogCacheForTests()
    })

    it('keeps getAuthLog oldest first, so the log reads top-to-bottom as it happened', () => {
        vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000).mockReturnValueOnce(3_000)

        logAuthEvent('first')
        logAuthEvent('second')
        logAuthEvent('third')

        expect(getAuthLog().map(e => e.event)).toEqual(['first', 'second', 'third'])
    })

    it('formats the log most-recent first, so a pasted bug report opens on what just happened', () => {
        vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000).mockReturnValueOnce(3_000)

        logAuthEvent('first')
        logAuthEvent('second')
        logAuthEvent('third')

        const lines = formatAuthLog().split('\n')
        expect(lines).toHaveLength(3)
        expect(lines[0]).toContain('third')
        expect(lines[1]).toContain('second')
        expect(lines[2]).toContain('first')
    })
})
