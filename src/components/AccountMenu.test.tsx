import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AccountMenu, ProfileBadge } from './AccountMenu'

const WEB_ID = 'http://localhost:4000/testuser/profile/card#me'

function renderMenu(overrides: Partial<Parameters<typeof AccountMenu>[0]> = {}) {
    const onLogout = vi.fn()
    render(
        <MemoryRouter>
            <AccountMenu webId={WEB_ID} displayName="Alice" photoUrl={null} onLogout={onLogout} {...overrides} />
        </MemoryRouter>
    )
    return { onLogout, trigger: screen.getByRole('button', { name: /account menu/i }) }
}

describe('ProfileBadge', () => {
    it('shows the profile photo when the card names one', () => {
        render(<ProfileBadge name="Alice" photoUrl="https://alice.example/me.png" />)

        expect(screen.getByTestId('profile-photo').getAttribute('src')).toBe('https://alice.example/me.png')
        expect(screen.getByText('Alice')).toBeTruthy()
    })

    it('falls back to a generic icon when the card has no photo', () => {
        render(<ProfileBadge name="testuser" photoUrl={null} />)

        expect(screen.queryByTestId('profile-photo')).toBeNull()
        expect(screen.getByTestId('profile-icon')).toBeTruthy()
        expect(screen.getByText('testuser')).toBeTruthy()
    })

    it('falls back to the icon when the photo fails to load', () => {
        render(<ProfileBadge name="Alice" photoUrl="https://alice.example/gone.png" />)

        fireEvent.error(screen.getByTestId('profile-photo'))

        expect(screen.queryByTestId('profile-photo')).toBeNull()
        expect(screen.getByTestId('profile-icon')).toBeTruthy()
    })
})

describe('AccountMenu', () => {
    it('names the signed-in user on the trigger rather than their WebID', () => {
        renderMenu()

        expect(screen.getByText('Alice')).toBeTruthy()
        expect(screen.queryByText(WEB_ID)).toBeNull()
    })

    it('keeps the panel shut until the trigger is used', () => {
        const { trigger } = renderMenu()

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByRole('link', { name: 'Backups' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull()
    })

    it('links to settings, so the theme choice is one hop from the nav bar it left', () => {
        const { trigger } = renderMenu()

        fireEvent.click(trigger)

        expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
    })

    it('holds the WebID, Backups and Logout once open', () => {
        const { trigger } = renderMenu()

        fireEvent.click(trigger)

        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText(WEB_ID)).toBeTruthy()
        expect(screen.getByText(/signed in as/i)).toBeTruthy()
        expect(screen.getByRole('link', { name: 'Backups' }).getAttribute('href')).toBe('/backups')
        expect(screen.getByRole('button', { name: 'Logout' })).toBeTruthy()
    })

    it('closes on Escape and puts focus back on the trigger', () => {
        const { trigger } = renderMenu()
        fireEvent.click(trigger)

        fireEvent.keyDown(screen.getByRole('button', { name: 'Logout' }), { key: 'Escape' })

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull()
        expect(document.activeElement).toBe(trigger)
    })

    it('closes on Escape from the trigger itself', () => {
        const { trigger } = renderMenu()
        fireEvent.click(trigger)

        fireEvent.keyDown(trigger, { key: 'Escape' })

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('closes when you click away from it', () => {
        const { trigger } = renderMenu()
        fireEvent.click(trigger)

        fireEvent.pointerDown(document.body)

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('logs out and closes when Logout is chosen', () => {
        const { trigger, onLogout } = renderMenu()
        fireEvent.click(trigger)

        fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

        expect(onLogout).toHaveBeenCalledOnce()
        expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('closes when a link inside it is followed', () => {
        const { trigger } = renderMenu()
        fireEvent.click(trigger)

        fireEvent.click(screen.getByRole('link', { name: 'Backups' }))

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
})
