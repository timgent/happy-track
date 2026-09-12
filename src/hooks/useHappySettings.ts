import { useCallback, useState } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { useLocalFirstLoad } from './useLocalFirstLoad'
import { useSolidPod } from '../components/SolidPodContext'
import { usePodSync } from './usePodSync'
import { useSyncCoordinator } from './useSyncCoordinator'
import { POD_CONTAINERS } from '../services/solidPod'
import { datasetToSettings, settingsToDataset } from '../services/rdfSerialization'
import { DEFAULT_SETTINGS } from '../happies/types'
import type { HappySettings } from '../happies/types'

export interface UseHappySettingsState {
    settings: HappySettings
    /** True until the first local read comes back. */
    isLoading: boolean
    /** Merges a change in and saves it locally, then to the pod. */
    updateSettings: (change: Partial<HappySettings>) => Promise<void>
}

/**
 * The user's preferences, local-first like everything else.
 *
 * Last write wins here, unlike the happies: these are a handful of independent
 * switches and the most recent answer to "show the mood picker?" simply *is*
 * the current answer. There is nothing to merge, so no merge function is
 * passed.
 *
 * Not polled. A preference changes when the person changes it, and a switch
 * that flips under the reader's hand mid-page would be worse than a slightly
 * stale one; the sign-in sync brings a change made on another device.
 */
export function useHappySettings(): UseHappySettingsState {
    const { db } = useDatabase()
    const { isLoggedIn } = useSolidPod()
    const [settings, setSettings] = useState<HappySettings>(DEFAULT_SETTINGS)
    const [hasRead, setHasRead] = useState(false)

    useLocalFirstLoad(async () => {
        try {
            setSettings((await db.getSettings()) ?? DEFAULT_SETTINGS)
        } finally {
            setHasRead(true)
        }
    }, [db])

    const { saveToPod } = usePodSync<HappySettings>({
        pathConfig: { container: POD_CONTAINERS.ROOT, filename: POD_CONTAINERS.SETTINGS },
        rdf: { serialize: settingsToDataset, deserialize: datasetToSettings },
        enabled: isLoggedIn,
    })

    const { saveWithSyncPrevention } = useSyncCoordinator<HappySettings>({
        currentData: settings,
        saveToLocalDb: next => db.saveSettings(next),
        updateFormAndState: (next, rev) => setSettings({ ...next, _rev: rev }),
    })

    const updateSettings = useCallback(async (change: Partial<HappySettings>) => {
        // Read back rather than trusting state, so two quick toggles cannot
        // save on top of each other's revision.
        const current = (await db.getSettings()) ?? DEFAULT_SETTINGS
        const saved = await saveWithSyncPrevention({ ...current, ...change }, saveToPod)
        if (saved) setSettings(saved)
    }, [db, saveWithSyncPrevention, saveToPod])

    return { settings, isLoading: !hasRead, updateSettings }
}
