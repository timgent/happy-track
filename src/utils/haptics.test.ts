import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ImpactStyle } from '@capacitor/haptics'

const mockImpact = vi.fn()
const mockIsNativePlatform = vi.fn()

vi.mock('@capacitor/haptics', async () => {
    const actual = await vi.importActual<typeof import('@capacitor/haptics')>('@capacitor/haptics')
    return {
        ImpactStyle: actual.ImpactStyle,
        Haptics: { impact: (...args: unknown[]) => mockImpact(...args) },
    }
})

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

import { tapFeedback } from './haptics'

describe('tapFeedback', () => {
    beforeEach(() => {
        mockImpact.mockReset().mockResolvedValue(undefined)
        mockIsNativePlatform.mockReset()
    })

    it('fires a light impact on a native build', () => {
        mockIsNativePlatform.mockReturnValue(true)

        tapFeedback()

        expect(mockImpact).toHaveBeenCalledWith({ style: ImpactStyle.Light })
    })

    it('does nothing on the web, where there is no haptics hardware to reach', () => {
        mockIsNativePlatform.mockReturnValue(false)

        tapFeedback()

        expect(mockImpact).not.toHaveBeenCalled()
    })

    it('swallows a failing haptic rather than letting it reject', async () => {
        mockIsNativePlatform.mockReturnValue(true)
        mockImpact.mockRejectedValue(new Error('no vibrator'))

        expect(() => tapFeedback()).not.toThrow()
        // Give the rejected promise a tick to surface as unhandled if uncaught
        await new Promise(resolve => setTimeout(resolve, 0))
    })

    it('does not throw when the plugin itself blows up synchronously', () => {
        mockIsNativePlatform.mockReturnValue(true)
        mockImpact.mockImplementation(() => { throw new Error('plugin missing') })

        expect(() => tapFeedback()).not.toThrow()
    })
})
