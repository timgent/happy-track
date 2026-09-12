import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Input } from './Input'

describe('Input', () => {
    it('associates the label with the input so the field has an accessible name', () => {
        render(<Input label="Your happy" placeholder="What made you happy today?" />)

        const input = screen.getByLabelText('Your happy')
        expect(input.tagName).toBe('INPUT')
        expect(input.getAttribute('placeholder')).toBe('What made you happy today?')
    })

    it('honours a caller-supplied id', () => {
        render(<Input label="Destination" id="destination-field" />)

        const input = screen.getByLabelText('Destination')
        expect(input.getAttribute('id')).toBe('destination-field')
    })

    it('gives each unlabelled-by-the-caller input its own id', () => {
        render(
            <>
                <Input label="Start date" />
                <Input label="End date" />
            </>
        )

        const start = screen.getByLabelText('Start date')
        const end = screen.getByLabelText('End date')
        expect(start.getAttribute('id')).toBeTruthy()
        expect(start.getAttribute('id')).not.toBe(end.getAttribute('id'))
    })

    it('renders without a label when none is given', () => {
        render(<Input placeholder="No label here" />)

        expect(screen.getByPlaceholderText('No label here')).toBeTruthy()
        expect(document.querySelector('label')).toBeNull()
    })
})
