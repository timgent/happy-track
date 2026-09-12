import { useEffect, useState } from 'react';
import { XMarkIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error';

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
    duration?: number;
    details?: string;
    /** Takes back what the toast is reporting — see `action` in ToastContext. */
    action?: { label: string; onAction: () => void };
}

export function Toast({ message, type, onClose, duration = 3000, details, action }: ToastProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const styles = type === 'success'
        ? 'bg-gradient-to-r from-success-500 to-success-600 shadow-glow-primary'
        : 'bg-gradient-to-r from-danger-500 to-danger-600 shadow-lg';

    const handleCopy = () => {
        if (!details) return;
        navigator.clipboard.writeText(details).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className={`fixed top-4 right-4 ${styles} text-white px-6 py-4 rounded-2xl flex items-center gap-3 min-w-[250px] animate-slide-down backdrop-blur-sm`}>
            <span className="flex-1 font-semibold">{message}</span>
            {action && (
                <button
                    onClick={() => { action.onAction(); onClose(); }}
                    className="rounded-lg bg-white/20 px-3 py-1 text-sm font-bold transition-colors hover:bg-white/30"
                >
                    {action.label}
                </button>
            )}
            {details && (
                <button
                    onClick={handleCopy}
                    aria-label={copied ? 'Error details copied' : 'Copy error details'}
                    title={copied ? 'Copied!' : 'Copy error details'}
                    className="hover:scale-110 transition-transform duration-200"
                >
                    {copied
                        ? <ClipboardDocumentCheckIcon className="h-5 w-5" />
                        : <ClipboardDocumentIcon className="h-5 w-5" />}
                </button>
            )}
            <button
                onClick={onClose}
                aria-label="Dismiss"
                className="hover:scale-110 transition-transform duration-200"
            >
                <XMarkIcon className="h-5 w-5" />
            </button>
        </div>
    );
}
