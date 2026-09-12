import { useCallback } from 'react';
import { useToast } from '../components/ToastContext';
import { AuthenticationError } from '../services/solidPod';
import { reportError } from '../errorReporting';

/**
 * Custom hook for handling Pod operation errors in a consistent way
 * Automatically detects authentication errors and shows appropriate messages
 *
 * @example
 * const handlePodError = usePodErrorHandler();
 *
 * try {
 *   await saveMultipleFilesToPod(...);
 * } catch (error) {
 *   handlePodError(error, 'Failed to save to Pod');
 * }
 */
export function usePodErrorHandler() {
  const { showToast } = useToast();

  return useCallback((error: unknown, fallbackMessage: string) => {
    const details = reportError(error, 'Pod operation error');

    if (error instanceof AuthenticationError) {
      // Use the specific authentication error message
      showToast(error.message, 'error', details);
    } else {
      // Use the fallback message for other errors
      showToast(fallbackMessage, 'error', details);
    }
  }, [showToast]);
}
