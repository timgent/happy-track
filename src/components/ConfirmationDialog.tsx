import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmationDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    /** Nodes rather than strings, so an icon can sit beside the words (#335). */
    title: ReactNode
    message: ReactNode
    confirmText?: ReactNode
    cancelText?: ReactNode
    confirmVariant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function ConfirmationDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmVariant = 'primary'
}: ConfirmationDialogProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-4">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{message}</p>
                <div className="flex gap-3 justify-end mt-6">
                    <Button variant="ghost" onClick={onClose}>
                        {cancelText}
                    </Button>
                    <Button variant={confirmVariant} onClick={onConfirm}>
                        {confirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
