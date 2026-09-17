import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import type { Happy } from '../happies/types'

vi.mock('../hooks/useIsDesktop', () => ({ useIsDesktop: vi.fn() }))

import { useIsDesktop } from '../hooks/useIsDesktop'
import { HappyComposer } from './HappyComposer'

const EXISTING: Happy = {
    id: 'existing',
    date: '2026-08-03',
    text: 'Coffee on the balcony',
    createdAt: '2026-08-03T09:00:00.000Z',
    lastModified: '2026-08-03T09:00:00.000Z',
}

function renderComposer(props: Partial<React.ComponentProps<typeof HappyComposer>> = {}) {
    const { container } = render(
        <HappyComposer
            dateKey="2026-08-03"
            showMood={false}
            showPrompt={false}
            onSave={vi.fn()}
            autoFocus
            {...props}
        />,
    )
    // Not `getByRole('textbox')`: the tag input is one too, once there is text.
    return container.querySelector('textarea') as HTMLTextAreaElement
}

describe('HappyComposer autofocus', () => {
    beforeEach(() => vi.clearAllMocks())

    // A box that grabs the keyboard on the way past covers the page someone was
    // reading and scrolls them somewhere they did not ask to be.
    it('leaves a new happy unfocused on a phone', () => {
        vi.mocked(useIsDesktop).mockReturnValue(false)

        const textarea = renderComposer()

        expect(document.activeElement).not.toBe(textarea)
    })

    it('focuses a new happy on a desktop, where focus costs nothing', () => {
        vi.mocked(useIsDesktop).mockReturnValue(true)

        const textarea = renderComposer()

        expect(document.activeElement).toBe(textarea)
    })

    // An edit is the opposite case: the user asked for this box by name, so the
    // keyboard is what they came for — and on a phone, nothing focusing it is
    // exactly what made Edit look like a dead button.
    it('focuses an edit even on a phone', () => {
        vi.mocked(useIsDesktop).mockReturnValue(false)

        const textarea = renderComposer({ editing: EXISTING })

        expect(document.activeElement).toBe(textarea)
    })

    it('puts the caret after the existing text rather than in front of it', () => {
        vi.mocked(useIsDesktop).mockReturnValue(true)

        const textarea = renderComposer({ editing: EXISTING })

        expect(textarea.selectionStart).toBe(EXISTING.text.length)
        expect(textarea.selectionEnd).toBe(EXISTING.text.length)
    })

    it('stays unfocused when the caller did not ask for focus', () => {
        vi.mocked(useIsDesktop).mockReturnValue(true)

        const textarea = renderComposer({ editing: EXISTING, autoFocus: false })

        expect(document.activeElement).not.toBe(textarea)
    })
})
