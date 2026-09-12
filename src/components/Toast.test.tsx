import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Toast } from './Toast'

describe('Toast', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        })
    })

    it('does not show a copy button when no details are given', () => {
        render(<Toast message="Saved!" type="success" onClose={vi.fn()} />)

        expect(screen.queryByLabelText('Copy error details')).toBeNull()
    })

    it('copies the error details to the clipboard when the copy button is clicked', async () => {
        const details = 'Time: 2026-07-18T00:00:00.000Z\nError saving happy\nError: boom'
        render(
            <Toast
                message="Could not save your happy. Please try again."
                type="error"
                details={details}
                onClose={vi.fn()}
            />
        )

        fireEvent.click(screen.getByLabelText('Copy error details'))

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(details)
    })

    it('calls onClose when the dismiss button is clicked', () => {
        const onClose = vi.fn()
        render(<Toast message="Saved!" type="success" onClose={onClose} />)

        fireEvent.click(screen.getByLabelText('Dismiss'))

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
