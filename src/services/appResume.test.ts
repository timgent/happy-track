import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockIsNativePlatform = vi.fn(() => false)
const mockAddListener = vi.fn()
const mockRemove = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))

vi.mock('@capacitor/app', () => ({
    App: { addListener: (...args: unknown[]) => mockAddListener(...args) },
}))

const { onAppResumed } = await import('./appResume')

function fireAppStateChange(isActive: boolean) {
    const handler = mockAddListener.mock.calls.at(-1)?.[1] as (state: { isActive: boolean }) => void
    handler({ isActive })
}

/**
 * Coming back to the app is the moment a session most needs attention: the
 * device has been asleep, the access token has lapsed and the renewal timer did
 * not fire while the process was frozen.
 *
 * On the web `visibilitychange` says so. In the native shell it does not
 * reliably: an Android WebView whose activity is paused and resumed may never
 * report a visibility change, so the App plugin's own resume event is the one
 * signal that always arrives. Miss it and the app sits on an expired token until
 * the user touches something that happens to make a request.
 */
describe('onAppResumed', () => {
    beforeEach(() => {
        mockIsNativePlatform.mockReturnValue(false)
        mockAddListener.mockReset()
        mockAddListener.mockResolvedValue({ remove: mockRemove })
        mockRemove.mockReset()
    })

    it('fires when the tab becomes visible again', () => {
        const onResume = vi.fn()
        onAppResumed(onResume)

        document.dispatchEvent(new Event('visibilitychange'))

        expect(onResume).toHaveBeenCalledTimes(1)
    })

    it('does not fire when the tab is hidden', () => {
        const onResume = vi.fn()
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        onAppResumed(onResume)

        document.dispatchEvent(new Event('visibilitychange'))

        expect(onResume).not.toHaveBeenCalled()
    })

    it('stops firing once unsubscribed', () => {
        const onResume = vi.fn()
        onAppResumed(onResume)()

        document.dispatchEvent(new Event('visibilitychange'))

        expect(onResume).not.toHaveBeenCalled()
    })

    it('listens for the native resume event as well, which a WebView may not report as a visibility change', async () => {
        mockIsNativePlatform.mockReturnValue(true)
        const onResume = vi.fn()
        onAppResumed(onResume)
        await vi.waitFor(() => expect(mockAddListener).toHaveBeenCalledWith('appStateChange', expect.any(Function)))

        fireAppStateChange(true)

        expect(onResume).toHaveBeenCalledTimes(1)
    })

    it('ignores the native event for going into the background', async () => {
        mockIsNativePlatform.mockReturnValue(true)
        const onResume = vi.fn()
        onAppResumed(onResume)
        await vi.waitFor(() => expect(mockAddListener).toHaveBeenCalled())

        fireAppStateChange(false)

        expect(onResume).not.toHaveBeenCalled()
    })

    it('removes the native listener when unsubscribed', async () => {
        mockIsNativePlatform.mockReturnValue(true)
        const unsubscribe = onAppResumed(vi.fn())
        await vi.waitFor(() => expect(mockAddListener).toHaveBeenCalled())

        unsubscribe()

        await vi.waitFor(() => expect(mockRemove).toHaveBeenCalled())
    })

    it('does not subscribe to the plugin on the web', () => {
        onAppResumed(vi.fn())

        expect(mockAddListener).not.toHaveBeenCalled()
    })
})
