import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { SolidProviderSelector, LAST_PROVIDER_KEY, normalizeIssuerUrl } from './SolidProviderSelector'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
}

// Queries that avoid role+name accessible-name computation (broken in happy-dom on Node 20
// for buttons whose accessible name comes from nested div children).
function optionNames(): string[] {
  return Array.from(document.querySelectorAll('button[data-provider-option]'))
    .map(b => b.querySelector('div.font-medium')?.textContent ?? '')
}

function clickOption(name: string) {
  const all = Array.from(document.querySelectorAll('button[data-provider-option]'))
  const btn = all.find(b => b.querySelector('div.font-medium')?.textContent === name)
  if (!btn) throw new Error(`Option "${name}" not found. Visible: ${optionNames().join(', ')}`)
  fireEvent.click(btn)
}

function searchBox(): HTMLInputElement {
  return screen.getByLabelText(/search providers or paste your pod url/i) as HTMLInputElement
}

function type(query: string) {
  fireEvent.change(searchBox(), { target: { value: query } })
}

function pressEnter() {
  fireEvent.keyDown(searchBox(), { key: 'Enter' })
}

describe('normalizeIssuerUrl', () => {
  it('defaults a scheme-less URL to https://', () => {
    expect(normalizeIssuerUrl('my-pod.example.org')).toBe('https://my-pod.example.org')
  })

  it('preserves an explicit http:// scheme', () => {
    expect(normalizeIssuerUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('preserves an explicit https:// scheme', () => {
    expect(normalizeIssuerUrl('https://my-pod.example.org')).toBe('https://my-pod.example.org')
  })

  it('keeps a path but drops a bare trailing slash', () => {
    expect(normalizeIssuerUrl('https://example.org/')).toBe('https://example.org')
    expect(normalizeIssuerUrl('https://example.org/solid')).toBe('https://example.org/solid')
  })

  it('rejects text that is not a URL', () => {
    expect(normalizeIssuerUrl('community')).toBeNull()
    expect(normalizeIssuerUrl('inrupt pod')).toBeNull()
    expect(normalizeIssuerUrl('   ')).toBeNull()
  })
})

describe('SolidProviderSelector', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('searching known providers', () => {
    it('lists every known provider when the search is empty', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      expect(optionNames()).toEqual(
        expect.arrayContaining(['Inrupt PodSpaces', 'solidcommunity.net', 'Private Data Pod'])
      )
    })

    it('filters the list live as you type', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      type('community')
      expect(optionNames()).toEqual(['solidcommunity.net'])
    })

    it('matches the issuer as well as the name, case-insensitively', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      type('LOGIN.INRUPT.COM')
      expect(optionNames()).toContain('Inrupt PodSpaces')
    })

    it('says so when nothing matches', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      type('nothing here')
      expect(optionNames()).toEqual([])
      expect(screen.getByText(/no matching providers/i)).toBeTruthy()
    })
  })

  describe('pasting a Pod URL', () => {
    it('offers the typed URL as an explicit option in the list', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      type('my-pod.example.org')
      expect(optionNames()).toContain('https://my-pod.example.org')
      expect(screen.getByText(/use this pod url/i)).toBeTruthy()
    })

    it('connects to the normalised URL when the option is clicked', () => {
      const onSelect = vi.fn()
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      type('my-pod.example.org')
      clickOption('https://my-pod.example.org')
      expect(onSelect).toHaveBeenCalledWith('https://my-pod.example.org')
    })

    it('preserves an explicit http:// URL', () => {
      const onSelect = vi.fn()
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      type('http://localhost:3000')
      clickOption('http://localhost:3000')
      expect(onSelect).toHaveBeenCalledWith('http://localhost:3000')
    })

    it('does not offer a URL option for a plain search term', () => {
      render(<SolidProviderSelector {...defaultProps} />)
      type('community')
      expect(screen.queryByText(/use this pod url/i)).toBeNull()
    })
  })

  describe('pressing Enter', () => {
    it('connects to the typed URL even when it substring-matches a known provider', () => {
      const onSelect = vi.fn()
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      // "inrupt.com" is a substring of Inrupt PodSpaces' issuer, so the provider still
      // shows in the results — but Enter must connect to the pod the user typed.
      type('inrupt.com')
      expect(optionNames()).toContain('Inrupt PodSpaces')
      pressEnter()
      expect(onSelect).toHaveBeenCalledWith('https://inrupt.com')
      expect(onSelect).not.toHaveBeenCalledWith('https://login.inrupt.com')
    })

    it('connects to the first match when the query is not a URL', () => {
      const onSelect = vi.fn()
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      type('community')
      pressEnter()
      expect(onSelect).toHaveBeenCalledWith('https://solidcommunity.net')
    })

    it('does nothing when the query matches nothing and is not a URL', () => {
      const onSelect = vi.fn()
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      type('nothing here')
      pressEnter()
      expect(onSelect).not.toHaveBeenCalled()
    })
  })

  describe('last-used provider', () => {
    it('is only written after a successful connection', async () => {
      const onSelect = vi.fn().mockRejectedValue(new Error('unreachable'))
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      type('typo.example.org')
      clickOption('https://typo.example.org')
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      expect(localStorage.getItem(LAST_PROVIDER_KEY)).toBeNull()
    })

    it('is written once the connection succeeds', async () => {
      const onSelect = vi.fn().mockResolvedValue(undefined)
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      clickOption('Inrupt PodSpaces')
      await waitFor(() =>
        expect(localStorage.getItem(LAST_PROVIDER_KEY)).toBe('https://login.inrupt.com')
      )
    })

    it('is offered first, badged, when the search is empty', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://solidcommunity.net')
      render(<SolidProviderSelector {...defaultProps} />)
      expect(optionNames()[0]).toBe('solidcommunity.net')
      expect(screen.getByText(/last used/i)).toBeTruthy()
    })

    it('remembers a self-hosted Pod URL that is not a known provider', () => {
      localStorage.setItem(LAST_PROVIDER_KEY, 'https://my-pod.example.org')
      render(<SolidProviderSelector {...defaultProps} />)
      expect(optionNames()[0]).toBe('https://my-pod.example.org')
    })
  })

  describe('connecting', () => {
    it('holds the modal open with a spinner while the redirect is in flight', async () => {
      const onClose = vi.fn()
      const onSelect = vi.fn().mockReturnValue(new Promise<void>(() => {}))
      render(<SolidProviderSelector {...defaultProps} onClose={onClose} onSelect={onSelect} />)
      clickOption('Inrupt PodSpaces')
      await waitFor(() => expect(screen.getByText(/connecting to inrupt podspaces/i)).toBeTruthy())
      expect(screen.getByRole('dialog')).toBeTruthy()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('reports a failed connection and lets you try again', async () => {
      const onSelect = vi.fn().mockRejectedValue(new Error('unreachable'))
      render(<SolidProviderSelector {...defaultProps} onSelect={onSelect} />)
      type('typo.example.org')
      clickOption('https://typo.example.org')
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/couldn't connect/i))
      expect(searchBox()).toBeTruthy()
    })
  })
})

describe('SolidProviderSelector – sign-in framing', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('titles the sign-in screen with the benefit rather than the mechanism', () => {
    render(<SolidProviderSelector {...defaultProps} />)
    expect(screen.getByText('Sync your happies')).toBeTruthy()
  })

  it('spells out the payoff of signing in', () => {
    render(<SolidProviderSelector {...defaultProps} />)
    expect(screen.getByText(/follow you to every device/i)).toBeTruthy()
  })

  it('says plainly that the app keeps no copy', () => {
    // The one claim a journal of personal entries has to make up front.
    render(<SolidProviderSelector {...defaultProps} />)
    expect(screen.getByText(/never holds a copy/i)).toBeTruthy()
  })

  it('keeps the "What is a Solid Pod?" explainer, collapsed behind a disclosure', () => {
    render(<SolidProviderSelector {...defaultProps} />)
    const details = document.querySelector('details')
    expect(details).toBeTruthy()
    expect(details!.open).toBe(false)
    expect(details!.querySelector('summary')!.textContent).toMatch(/what is a solid pod\?/i)
    expect(screen.getByText(/personal data storage that/i)).toBeTruthy()
  })
})
