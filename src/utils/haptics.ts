import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

/**
 * A light tap of physical feedback for a small "that's done" moment.
 *
 * Fire-and-forget by design: the caller must never wait on it, and anywhere
 * without haptics hardware to reach — the browser, a device with the motor
 * disabled, a native build where the plugin failed to load — is a silent no-op
 * rather than an error. Feedback is a bonus; it is never worth a broken tap.
 */
export function tapFeedback(): void {
    if (!Capacitor.isNativePlatform()) return
    try {
        void Haptics.impact({ style: ImpactStyle.Light }).catch(() => { })
    } catch {
        // Plugin missing or misregistered — nothing to do but carry on quietly
    }
}
