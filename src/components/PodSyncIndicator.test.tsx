import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PodSyncIndicator } from './PodSyncIndicator'

describe('PodSyncIndicator', () => {
    it('says what is being waited for without taking over the page', () => {
        render(<PodSyncIndicator />)

        const indicator = screen.getByTestId('pod-sync-indicator')
        expect(indicator.textContent).toContain('Checking your Pod for changes')
        expect(indicator.getAttribute('aria-live')).toBe('polite')
    })

    it('names what is being checked when the page shows one thing', () => {
        render(<PodSyncIndicator subject="this list" />)

        expect(screen.getByTestId('pod-sync-indicator').textContent).toContain('Checking your Pod for changes to this list')
    })
})
