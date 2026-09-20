import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { manifest } from './manifest'

const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8')

describe('manifest', () => {
    it('has the fields Android checks before offering the install prompt', () => {
        expect(manifest.name).toBeTruthy()
        expect(manifest.short_name).toBeTruthy()
        expect(manifest.start_url).toBe('/')
        expect(manifest.display).toBe('standalone')
        expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
        expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    })

    it('includes a 192 and a 512 icon Chrome can use for the install prompt and splash screen', () => {
        const sizes = (manifest.icons ?? []).map((icon) => icon.sizes)
        expect(sizes).toContain('192x192')
        expect(sizes).toContain('512x512')
    })

    it('has at least one non-maskable icon, so a maskable-only set is never all Android has to crop from', () => {
        const anyIcon = (manifest.icons ?? []).find((icon) => (icon.purpose ?? 'any').includes('any'))
        expect(anyIcon).toBeTruthy()
    })

    it('has a maskable icon so Android does not crop the plain icon to its own adaptive shape', () => {
        const maskable = (manifest.icons ?? []).find((icon) => icon.purpose?.includes('maskable'))
        expect(maskable).toBeTruthy()
        expect(maskable?.sizes).toBe('512x512')
    })

    it('matches the theme-color index.html sets before first paint, so the install splash and the OS chrome use one colour', () => {
        const match = indexHtml.match(/<meta name="theme-color" content="(#[0-9a-f]{6})"/i)
        expect(match).not.toBeNull()
        expect(manifest.theme_color).toBe(match![1])
        expect(manifest.background_color).toBe(match![1])
    })
})
