import { createContext, useContext, useState, ReactNode } from 'react';
import { Toast, ToastType } from './Toast';

/**
 * An action offered alongside the message — in practice, taking back what the
 * message is reporting. A bulk change is safe to offer without a confirmation
 * dialog when it can be undone afterwards; a dialog met often is a dialog
 * dismissed without reading.
 */
export interface ToastAction {
    label: string;
    onAction: () => void;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType, details?: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<{ message: string; type: ToastType; details?: string; action?: ToastAction } | null>(null);

    const showToast = (message: string, type: ToastType, details?: string, action?: ToastAction) => {
        setToast({ message, type, details, action });
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    details={toast.details}
                    action={toast.action}
                    // Long enough to be noticed and taken; an undo that has gone
                    // by the time you look up is not an undo.
                    duration={toast.action ? 8000 : undefined}
                    onClose={() => setToast(null)}
                />
            )}
        </ToastContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}