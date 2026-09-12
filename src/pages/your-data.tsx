import { useMemo, useState } from 'react'
import { ArrowDownTrayIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { useHappies } from '../hooks/useHappies'
import { useToast } from '../components/ToastContext'
import { usePodErrorHandler } from '../hooks/usePodErrorHandler'
import { Button } from '../components/Button'
import { LoadingState } from '../components/LoadingState'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { exportEverything, exportFilename, toPlainText } from '../services/happyExport'
import { deleteAllLocalData, deleteAllPodData } from '../services/dataDeletion'
import { getPrimaryPodUrl, friendlyPodName } from '../services/solidPod'
import { exportFile } from '../utils/exportFile'
import { allHappies } from '../happies/insights'

/**
 * Your data: what is stored, how to take it away, how to destroy it.
 *
 * Three things a journal of personal entries owes its owner, in the order they
 * are most likely to be wanted. Export comes first and delete last, with the
 * export offered *inside* the delete confirmation too — the one thing worse
 * than not being able to delete your data is deleting it when you meant to keep
 * a copy.
 */
export function YourDataPage() {
    const { db } = useDatabase()
    const { session, isLoggedIn, isReconnecting, webId, logout } = useSolidPod()
    const { months, isLoading } = useHappies()
    const { showToast } = useToast()
    const handlePodError = usePodErrorHandler()

    const [isExporting, setIsExporting] = useState(false)
    const [deleteScope, setDeleteScope] = useState<'device' | 'everywhere' | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const happyCount = useMemo(() => allHappies(months).length, [months])

    const download = async (kind: 'json' | 'text') => {
        setIsExporting(true)
        try {
            if (kind === 'json') {
                const data = await exportEverything(db)
                await exportFile({
                    data: JSON.stringify(data, null, 2),
                    filename: exportFilename(),
                    mimeType: 'application/json',
                })
            } else {
                await exportFile({
                    data: toPlainText(months),
                    filename: exportFilename().replace(/\.json$/, '.txt'),
                    mimeType: 'text/plain',
                })
            }
            showToast('Downloaded', 'success')
        } catch (error) {
            handlePodError(error, 'Could not build the download')
        } finally {
            setIsExporting(false)
        }
    }

    const runDelete = async () => {
        const scope = deleteScope
        setDeleteScope(null)
        if (!scope) return
        setIsDeleting(true)
        try {
            if (scope === 'everywhere' && session) {
                const podUrl = await getPrimaryPodUrl(session)
                if (!podUrl) {
                    // Deleting the device copy while leaving the pod copy
                    // behind would be the worst of both: the user thinks it is
                    // gone, and the next sign-in brings it all back.
                    showToast("Couldn't reach your Pod, so nothing was deleted. Try again when you are back online.", 'error')
                    return
                }
                await deleteAllPodData(session, podUrl)
            }
            await deleteAllLocalData()
            if (scope === 'everywhere') await logout()
            // A full reload, not a re-render: every cached database handle and
            // every piece of React state is now describing data that no longer
            // exists, and the cheapest way to be sure of that is to start again.
            window.location.replace('/')
        } catch (error) {
            handlePodError(error, 'Could not delete everything. Nothing may have been removed.')
        } finally {
            setIsDeleting(false)
        }
    }

    if (isLoading) return <LoadingState message="Looking at what you have stored…" rows={1} />

    return (
        <div className="mx-auto max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 sm:text-3xl">Your data</h1>

            <section aria-labelledby="where-heading" className="mt-6">
                <h2 id="where-heading" className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Where it lives
                </h2>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft">
                    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        You have written <strong className="font-bold">{happyCount}</strong>{' '}
                        happ{happyCount === 1 ? 'y' : 'ies'} across{' '}
                        <strong className="font-bold">{months.filter(m => m.happies.length > 0).length}</strong>{' '}
                        month{months.filter(m => m.happies.length > 0).length === 1 ? '' : 's'}.
                    </p>
                    <ul className="mt-3 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                        <li>
                            <strong className="font-semibold">On this device</strong> — in the browser's own
                            storage, which is what makes the app work with no signal.
                        </li>
                        <li>
                            <strong className="font-semibold">In your Pod</strong> —{' '}
                            {webId
                                ? <>at {friendlyPodName(webId)}{isReconnecting && ' (out of reach right now)'}.</>
                                : 'not yet. Sign in and a copy goes to storage you control.'}
                        </li>
                        <li>
                            <strong className="font-semibold">On our servers</strong> — nowhere. There is no
                            Happy Track server; the app runs entirely in your browser.
                        </li>
                    </ul>
                </div>
            </section>

            <section aria-labelledby="export-heading" className="mt-6">
                <h2 id="export-heading" className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Take a copy
                </h2>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        Everything you have written, as a file. The JSON keeps the moods, tags and
                        timestamps; the text version is for reading.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Button variant="primary" disabled={isExporting || happyCount === 0} onClick={() => void download('json')}>
                            <ArrowDownTrayIcon aria-hidden="true" className="h-5 w-5" />
                            Download JSON
                        </Button>
                        <Button variant="subtle" disabled={isExporting || happyCount === 0} onClick={() => void download('text')}>
                            <ArrowDownTrayIcon aria-hidden="true" className="h-5 w-5" />
                            Download as text
                        </Button>
                    </div>
                    {happyCount === 0 && (
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Nothing to download yet.
                        </p>
                    )}
                </div>
            </section>

            <section aria-labelledby="delete-heading" className="mt-6">
                <h2 id="delete-heading" className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Delete it
                </h2>
                <div className="rounded-2xl border border-danger-200 dark:border-danger-900 bg-white dark:bg-gray-900 p-4 shadow-soft">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        There is no undo and no copy kept anywhere. Take a download first if you
                        want one.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <Button variant="subtle" disabled={isDeleting} onClick={() => setDeleteScope('device')}>
                            Delete from this device
                        </Button>
                        {(isLoggedIn || isReconnecting) && (
                            <Button variant="danger" disabled={isDeleting} onClick={() => setDeleteScope('everywhere')}>
                                Delete everywhere, Pod included
                            </Button>
                        )}
                    </div>
                    {(isLoggedIn || isReconnecting) && (
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                            Deleting only from this device leaves the copy in your Pod, so the next
                            sign-in brings it back. That is the one to use for a shared computer.
                        </p>
                    )}
                </div>
            </section>

            <ConfirmationDialog
                isOpen={deleteScope !== null}
                title={
                    <span className="flex items-center gap-2">
                        <ExclamationTriangleIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-danger-600" />
                        {deleteScope === 'everywhere' ? 'Delete everything, everywhere?' : 'Delete from this device?'}
                    </span>
                }
                message={
                    deleteScope === 'everywhere'
                        ? `All ${happyCount} of your happies will be removed from this device and from your Pod, and you will be signed out. This cannot be undone.`
                        : `All ${happyCount} of your happies will be removed from this device.${isLoggedIn || isReconnecting ? ' The copy in your Pod is left alone, so signing in again will bring them back.' : ' There is no other copy — this is permanent.'}`
                }
                confirmText={isDeleting ? 'Deleting…' : 'Yes, delete'}
                cancelText="Keep my data"
                confirmVariant="danger"
                onConfirm={() => void runDelete()}
                onClose={() => setDeleteScope(null)}
            />
        </div>
    )
}
