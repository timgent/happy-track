import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { ApplicationCapabilityRdfa } from './ApplicationCapabilityRdfa'
import { capabilityDescription } from '../capability/document'

/** happy-dom's default location, which is the origin the component describes. */
const ORIGIN = window.location.origin
const { application, capabilities, requirements } = capabilityDescription(ORIGIN)

describe('ApplicationCapabilityRdfa', () => {
    afterEach(() => {
        cleanup()
    })

    it('declares the vocabulary prefixes the markup below relies on', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        const root = container.querySelector('[typeof="ac:Application"]')!
        expect(root.getAttribute('prefix')).toContain('ac: https://www.w3.org/ns/ac#')
        expect(root.getAttribute('prefix')).toContain('ht: https://happy-track.app/vocab#')
    })

    it('identifies the application by the origin it is being served from', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        const root = container.querySelector('[typeof="ac:Application"]')!
        expect(root.getAttribute('resource')).toBe(`${ORIGIN}/#i`)
        expect(root.getAttribute('resource')).toBe(application.id)
        expect(container.querySelector('[property="as:name"]')?.getAttribute('content')).toBe('Happy Track')
    })

    it('restates every capability from the negotiated document as ac:Capability', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        expect(container.querySelectorAll('[property="ac:capability"]').length).toBe(capabilities.length)

        for (const capability of capabilities) {
            const node = container.querySelector(`[typeof="ac:Capability"][resource="${capability.id}"]`)
            expect(node).not.toBeNull()
            expect(node!.querySelector('[property="ac:action"]')?.getAttribute('resource')).toBe(capability.action)
            expect(node!.querySelector('[property="ac:output"]')?.getAttribute('content')).toBe(capability.output)
            expect(node!.querySelector('link[property="ac:resourceType"]')?.getAttribute('resource')).toBe(capability.resourceType)
        }
    })

    it('nests each capability\'s invocation as an ac:UriTemplateInvocation with its hydra:template', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        const capability = capabilities.find(c => c.id.endsWith('capability-view-month'))!
        const capabilityNode = container.querySelector(`[resource="${capability.id}"]`)!
        const invocationNode = capabilityNode.querySelector('[typeof="ac:UriTemplateInvocation"]')!

        expect(invocationNode.getAttribute('resource')).toBe(capability.invocation)
        expect(invocationNode.querySelector('[property="hydra:template"]')?.getAttribute('content')).toBe('#open={open}')
    })

    it('says what the open invocation\'s variable means, not just its template', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        const mapping = container.querySelector('[property="hydra:mapping"]')!
        expect(mapping.getAttribute('typeof')).toBe('')
        expect(mapping.querySelector('[property="hydra:variable"]')?.getAttribute('content')).toBe('open')
        expect(mapping.querySelector('[property="hydra:property"]')?.getAttribute('resource')).toBe('ac:open')
    })

    it('only points ac:shape at capabilities that actually declare a shape', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        const withShape = capabilities.find(c => c.shape)!
        const withoutShape = capabilities.find(c => !c.shape)!

        expect(container.querySelector(`[resource="${withShape.id}"] link[property="ac:shape"]`)).not.toBeNull()
        expect(container.querySelector(`[resource="${withoutShape.id}"] link[property="ac:shape"]`)).toBeNull()
    })

    it('restates every requirement as an ac:Requirement with its purpose', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        for (const requirement of requirements) {
            const node = container.querySelector(`[typeof="ac:Requirement"][resource="${requirement.id}"]`)
            expect(node).not.toBeNull()
            expect(node!.querySelector('[property="dpv:hasPurpose"]')?.getAttribute('resource')).toBe(requirement.hasPurpose)
        }
    })

    it('renders nothing visible, since every element is empty', () => {
        const { container } = render(<ApplicationCapabilityRdfa />)

        expect(container.textContent).toBe('')
    })
})
