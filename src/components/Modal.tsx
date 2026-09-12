import { ReactNode } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    /**
     * A node, not a string, so a header can carry an icon element beside its
     * words. Callers used to smuggle a warning glyph into the string itself
     * because this was the only way to get one in — see #335.
     */
    title: ReactNode;
    children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
                <div className="fixed inset-0 bg-gray-500/75 dark:bg-black/70 transition-opacity" onClick={onClose} />

                <div role="dialog" aria-modal="true" className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-900 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 w-full sm:max-w-lg sm:p-6">
                    <div className="absolute right-0 top-0 pr-4 pt-4">
                        <button
                            type="button"
                            className="rounded-md bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 focus:outline-none"
                            onClick={onClose}
                        >
                            <span className="sr-only">Close</span>
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="sm:flex sm:items-start">
                        <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                            <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-gray-100 mb-4">
                                {title}
                            </h3>
                            <div className="mt-2">
                                {children}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 