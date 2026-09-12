import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useSolidPod } from './SolidPodContext';
import { SolidProviderSelector } from './SolidProviderSelector';

export function SessionExpiredBanner() {
    const { sessionExpired, isLoggedIn, clearSessionExpired, login } = useSolidPod();
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false);

    if (!sessionExpired || isLoggedIn) return null;

    return (
        <>
            <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between">
                <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
                    Your session has expired. Your data is saved locally.
                </p>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsProviderSelectorOpen(true)}
                        className="text-sm font-semibold text-amber-900 dark:text-amber-200 underline hover:no-underline"
                    >
                        Log in again
                    </button>
                    <button onClick={clearSessionExpired} aria-label="Dismiss">
                        <XMarkIcon className="h-4 w-4 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200" />
                    </button>
                </div>
            </div>
            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={(issuer) => login(issuer)}
            />
        </>
    );
}
