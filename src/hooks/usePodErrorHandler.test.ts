import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const showToast = vi.fn()
vi.mock('../components/ToastContext', () => ({
  useToast: () => ({ showToast }),
}))

const reportError = vi.fn(() => 'formatted error details')
vi.mock('../errorReporting', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}))

import { usePodErrorHandler } from './usePodErrorHandler'
import { AuthenticationError } from '../services/solidPod'

describe('usePodErrorHandler', () => {
  beforeEach(() => {
    showToast.mockClear()
    reportError.mockClear()
  })

  it('reports the error and shows the fallback message', () => {
    const { result } = renderHook(() => usePodErrorHandler())
    const error = new Error('network down')

    result.current(error, 'Failed to create backup.')

    expect(reportError).toHaveBeenCalledWith(error, 'Pod operation error')
    expect(showToast).toHaveBeenCalledWith('Failed to create backup.', 'error', 'formatted error details')
  })

  it('shows the authentication error message instead of the fallback', () => {
    const { result } = renderHook(() => usePodErrorHandler())
    const error = new AuthenticationError('Session expired')

    result.current(error, 'Failed to create backup.')

    expect(reportError).toHaveBeenCalledWith(error, 'Pod operation error')
    expect(showToast).toHaveBeenCalledWith('Session expired', 'error', 'formatted error details')
  })
})
