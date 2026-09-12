import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsDesktop } from './useIsDesktop'

type Listener = () => void

function mockMatchMedia(initialMatches: boolean) {
    let matches = initialMatches
    const listeners = new Set<Listener>()
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        get matches() { return matches },
        media: query,
        addEventListener: (_: string, cb: Listener) => listeners.add(cb),
        removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    }))
    return {
        setMatches(value: boolean) {
            matches = value
            listeners.forEach(cb => cb())
        },
    }
}

describe('useIsDesktop', () => {
    beforeEach(() => vi.restoreAllMocks())

    it('returns true when the viewport is at least the sm breakpoint', () => {
        mockMatchMedia(true)
        const { result } = renderHook(() => useIsDesktop())
        expect(result.current).toBe(true)
    })

    it('returns false on narrow viewports', () => {
        mockMatchMedia(false)
        const { result } = renderHook(() => useIsDesktop())
        expect(result.current).toBe(false)
    })

    it('updates when the viewport crosses the breakpoint', () => {
        const media = mockMatchMedia(false)
        const { result } = renderHook(() => useIsDesktop())
        expect(result.current).toBe(false)
        act(() => media.setMatches(true))
        expect(result.current).toBe(true)
    })
})
