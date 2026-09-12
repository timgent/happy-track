/**
 * A button's variant is a claim about how important it is, and the styles are
 * where that claim either holds or quietly stops holding. These pin the three
 * things that went wrong once: a filled variant with unreadable text on it, a
 * tap target smaller than a fingertip, and a bounce that plays for people who
 * asked the OS for no bouncing.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

const classesOf = (name: string) => screen.getByRole('button', { name }).className

describe('emphasis', () => {
    it('gives the occasional action a neutral box rather than a filled one', () => {
        render(<Button variant="subtle">Share</Button>)

        const classes = classesOf('Share')
        expect(classes).toContain('bg-gray-100')
        // The whole point of the variant: it must not reach for either brand
        // gradient, because those are how a page says "this one".
        expect(classes).not.toContain('bg-gradient-secondary')
        expect(classes).not.toContain('bg-gradient-primary')
    })

    it('keeps the filled variants on the gradients built for white text', () => {
        render(
            <>
                <Button variant="primary">Go</Button>
                <Button variant="secondary">Also go</Button>
            </>
        )

        // `-button` and not the bare `gradient-primary`: the decorative
        // gradient is two shades too light to carry a word.
        expect(classesOf('Go')).toContain('bg-gradient-primary-button')
        expect(classesOf('Also go')).toContain('bg-gradient-secondary-button')
    })
})

describe('reachable by hand and by eye', () => {
    it('is at least as tall as a fingertip', () => {
        render(<Button>Tap</Button>)

        // 44px, the same floor the people chips hold themselves to.
        expect(classesOf('Tap')).toContain('min-h-[44px]')
    })

    it('holds its label centred once a minimum height stretches the box', () => {
        render(<Button>Tap</Button>)

        expect(classesOf('Tap')).toContain('items-center')
        expect(classesOf('Tap')).toContain('justify-center')
    })

    it('does not bounce at somebody who asked for no motion', () => {
        render(<Button>Tap</Button>)

        const classes = classesOf('Tap')
        expect(classes).toContain('motion-safe:hover:scale-105')
        expect(classes).toContain('motion-safe:active:scale-95')
        // The unguarded forms are the bug, not merely the old spelling.
        expect(classes).not.toMatch(/(^|\s)hover:scale-105/)
        expect(classes).not.toMatch(/(^|\s)active:scale-95/)
    })
})
