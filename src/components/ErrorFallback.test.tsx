import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ErrorFallback } from './ErrorFallback'

describe('ErrorFallback', () => {
  it('shows an apology message and calls resetError when retrying', () => {
    const resetError = vi.fn()
    render(<ErrorFallback resetError={resetError} />)

    expect(screen.getByText('Something went wrong')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(resetError).toHaveBeenCalledTimes(1)
  })
})
