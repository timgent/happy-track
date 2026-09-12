import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

function setOnLine(value: boolean) {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('useOnlineStatus', () => {
    afterEach(() => {
        setOnLine(true)
        vi.restoreAllMocks()
    })

    it('reports the browser\'s current connectivity', () => {
        setOnLine(false)

        const { result } = renderHook(() => useOnlineStatus())

        expect(result.current).toBe(false)
    })

    it('follows the connection dropping and coming back', () => {
        setOnLine(true)
        const { result } = renderHook(() => useOnlineStatus())

        act(() => {
            setOnLine(false)
            window.dispatchEvent(new Event('offline'))
        })
        expect(result.current).toBe(false)

        act(() => {
            setOnLine(true)
            window.dispatchEvent(new Event('online'))
        })
        expect(result.current).toBe(true)
    })

    // A browser that cannot say is assumed connected: guessing "offline" would
    // put an offline notice in front of someone who is perfectly online.
    it('assumes online where the browser does not report it', () => {
        Object.defineProperty(navigator, 'onLine', { value: undefined, configurable: true })

        const { result } = renderHook(() => useOnlineStatus())

        expect(result.current).toBe(true)
    })
})
