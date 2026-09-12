/**
 * The app's Application Capability description, served at "/" via content
 * negotiation instead of the SPA when a client asks for `application/ld+json`
 * or `text/turtle` (see /middleware.ts and ./negotiate.ts), and restated as
 * RDFa in the footer (src/components/ApplicationCapabilityRdfa.tsx).
 *
 * The spec is Application Capability, Draft Community Group Report 17 August
 * 2026 (https://dokieli.github.io/application-capability/). It describes an app
 * as: what it can do (Capabilities), how another agent triggers those actions
 * (Invocations, as RFC 6570 URI Templates resolved against the app's own
 * deployment IRI), and what it needs from its environment (Requirements: CSP
 * directives and browser permissions, each annotated with a DPV purpose).
 *
 * Everything here is checked against something real:
 *
 * - Every term comes from the spec's own JSON-LD context (§2.3), and every
 *   value from a vocabulary the spec's examples use. `odrl:display` is the
 *   action its open/view examples use; `dpv:ServiceProvision` is the purpose
 *   its Requirement examples use; `clipboard-write` is a Permissions API name.
 *   The one term the spec does not supply is a "create" action — ODRL 2.2 has
 *   no such action — so the creation capability uses `as:Create` from the
 *   Activity Vocabulary, whose prefix the spec's context already binds.
 * - Every invocation template resolves to a route that exists. `#open={open}`
 *   is handled by ./openInvocation.ts and src/pages/open-resource.tsx;
 *   `#/today` and `#/journal` are routes in src/App.tsx.
 * - The vocabulary (`ht:`) and the SHACL shapes are cross-checked against
 *   src/services/rdfVocab.ts and src/services/rdfSerialization.ts, so a shape
 *   describes what the app actually writes to a pod.
 *
 * Two representations are hand-maintained here — JSON-LD (the spec's preferred
 * format) and Turtle — and MUST describe the same triples. `document.test.ts`
 * parses both and compares the canonicalised quads, so they cannot drift.
 *
 * Nothing here hardcodes where the app is deployed: every IRI is built from the
 * origin the request arrived on, so a Vercel preview describes itself and not
 * production.
 */

/** Trailing slashes off, so `${origin}/#i` is well-formed for any input. */
function normaliseOrigin(origin: string): string {
    return origin.replace(/\/+$/, '')
}

export interface CapabilityNode {
    id: string
    type: string
    action: string
    output: string
    resourceType: string
    shape?: string
    invocation: string
}

export interface InvocationNode {
    id: string
    type: string
    template: string
    mapping?: { variable: string; property: string }[]
}

export interface RequirementNode {
    id: string
    type: string
    cspDirective?: string
    browserPermission?: string
    hasPurpose: string
}

export interface ApplicationNode {
    id: string
    type: string
    'as:name': string
    capability: string[]
    requirement: string[]
}

export interface CapabilityDescription {
    application: ApplicationNode
    capabilities: CapabilityNode[]
    invocations: InvocationNode[]
    requirements: RequirementNode[]
    jsonld: Record<string, unknown>
    turtle: string
}

/**
 * Local context extension on top of https://www.w3.org/ns/ac.jsonld, which
 * defines every `ac:`/`hydra:`/`dpv:` term used below and marks them
 * `@protected`. Only the terms this document adds are declared here. SHACL
 * terms are added as their own compact-IRI keys (e.g. "sh:targetClass") rather
 * than bare aliases like "targetClass", so nothing here can collide with an
 * ac.jsonld term.
 */
const CONTEXT = [
    'https://www.w3.org/ns/ac.jsonld',
    {
        ht: 'https://happy-track.app/vocab#',
        schema: 'https://schema.org/',
        dcterms: 'http://purl.org/dc/terms/',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        sh: 'http://www.w3.org/ns/shacl#',
        'sh:targetClass': { '@type': '@id' },
        'sh:path': { '@type': '@id' },
        'sh:class': { '@type': '@id' },
        'sh:datatype': { '@type': '@id' },
        'sh:nodeKind': { '@type': '@id' },
    },
]

export function capabilityDescription(rawOrigin: string): CapabilityDescription {
    const origin = normaliseOrigin(rawOrigin)

    // ── Invocations ──────────────────────────────────────────────────────────

    /**
     * The spec's canonical open invocation (§5.3.1): one query-form variable in
     * the fragment carrying the full IRI of the resource to open. The fragment
     * keeps that IRI client-side — it never reaches this app's host, which for
     * a journal of personal entries is the whole reason to use the fragment.
     *
     * Both "view" capabilities share this one invocation by reference, the way
     * the spec's own two-capabilities-one-invocation example does: the app works
     * out from the IRI itself whether it was handed a month of happies or the
     * settings document. src/capability/openInvocation.ts does that resolution.
     */
    const invokeOpen: InvocationNode = {
        id: `${origin}/#invoke-open`,
        type: 'UriTemplateInvocation',
        template: '#open={open}',
        mapping: [{ variable: 'open', property: 'ac:open' }],
    }

    const invokeWriteHappy: InvocationNode = {
        id: `${origin}/#invoke-write-happy`,
        type: 'UriTemplateInvocation',
        template: '#/today',
    }

    const invokeBrowseJournal: InvocationNode = {
        id: `${origin}/#invoke-browse-journal`,
        type: 'UriTemplateInvocation',
        template: '#/journal',
    }

    // ── Capabilities ─────────────────────────────────────────────────────────

    /**
     * Open one month of happies by IRI.
     *
     * Only the signed-in person's own months resolve to a route — the app has
     * no viewer for somebody else's journal, and `openInvocationPath` refuses
     * one. Advertising more than that would be advertising a capability the app
     * cannot honour.
     */
    const capabilityViewMonth: CapabilityNode = {
        id: `${origin}/#capability-view-month`,
        type: 'Capability',
        action: 'odrl:display',
        output: 'text/html',
        resourceType: 'ht:HappyMonth',
        shape: `${origin}/#HappyMonthShape`,
        invocation: invokeOpen.id,
    }

    /** Open the preferences document by IRI. */
    const capabilityViewSettings: CapabilityNode = {
        id: `${origin}/#capability-view-settings`,
        type: 'Capability',
        action: 'odrl:display',
        output: 'text/html',
        resourceType: 'ht:Settings',
        shape: `${origin}/#SettingsShape`,
        invocation: invokeOpen.id,
    }

    /**
     * Write today's happy. There is no target resource yet, so the invocation
     * takes no variables — but the capability still declares the type of
     * resource it ends up producing.
     */
    const capabilityWriteHappy: CapabilityNode = {
        id: `${origin}/#capability-write-happy`,
        type: 'Capability',
        action: 'as:Create',
        output: 'text/html',
        resourceType: 'ht:Happy',
        invocation: invokeWriteHappy.id,
    }

    /** Read back the journal, month by month. */
    const capabilityBrowseJournal: CapabilityNode = {
        id: `${origin}/#capability-browse-journal`,
        type: 'Capability',
        action: 'odrl:display',
        output: 'text/html',
        resourceType: 'ht:HappyMonth',
        shape: `${origin}/#HappyMonthShape`,
        invocation: invokeBrowseJournal.id,
    }

    // ── Requirements ─────────────────────────────────────────────────────────

    const requirementScripts: RequirementNode = {
        id: `${origin}/#requirement-scripts`,
        type: 'Requirement',
        cspDirective: "script-src 'self'",
        hasPurpose: 'dpv:ServiceProvision',
    }

    /**
     * Solid pods are arbitrary, user-chosen HTTPS origins (any Community Solid
     * Server, Inrupt PodSpaces, or self-hosted pod a person points the app at),
     * so this cannot be a fixed allowlist the way script-src can. Sentry error
     * reporting (src/sentry.ts) also needs an origin here, but it is covered by
     * the same https: wildcard so is not called out separately.
     */
    const requirementConnect: RequirementNode = {
        id: `${origin}/#requirement-connect`,
        type: 'Requirement',
        cspDirective: "connect-src 'self' https:",
        hasPurpose: 'dpv:ServiceProvision',
    }

    /**
     * navigator.clipboard.writeText — copying error details (Toast.tsx) and
     * copying the sign-in log (SignInHistory.tsx).
     */
    const requirementClipboard: RequirementNode = {
        id: `${origin}/#requirement-clipboard`,
        type: 'Requirement',
        browserPermission: 'clipboard-write',
        hasPurpose: 'dpv:ServiceProvision',
    }

    // ── Application ──────────────────────────────────────────────────────────

    const capabilities = [
        capabilityWriteHappy,
        capabilityViewMonth,
        capabilityBrowseJournal,
        capabilityViewSettings,
    ]

    const invocations = [invokeOpen, invokeWriteHappy, invokeBrowseJournal]

    const requirements = [requirementScripts, requirementConnect, requirementClipboard]

    const application: ApplicationNode = {
        id: `${origin}/#i`,
        type: 'ac:Application',
        'as:name': 'Happy Track',
        capability: capabilities.map(c => c.id),
        requirement: requirements.map(r => r.id),
    }

    // ── SHACL shapes ─────────────────────────────────────────────────────────
    //
    // Not exhaustive — each covers the predicates that define the type (present
    // on every instance, or structurally load-bearing), not every optional
    // field HT_NS carries. Cross-checked against happyMonthToDataset /
    // settingsToDataset in src/services/rdfSerialization.ts.

    const happyMonthShape = {
        id: `${origin}/#HappyMonthShape`,
        type: 'sh:NodeShape',
        'sh:targetClass': 'ht:HappyMonth',
        'sh:property': [
            { 'sh:path': 'ht:monthKey', 'sh:datatype': 'xsd:string', 'sh:minCount': 1, 'sh:maxCount': 1 },
            { 'sh:path': 'dcterms:modified', 'sh:datatype': 'xsd:dateTime', 'sh:maxCount': 1 },
            { 'sh:path': 'ht:hasHappy', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'ht:Happy' },
            { 'sh:path': 'ht:hasDeletion', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'ht:HappyDeletion' },
        ],
    }

    const happyShape = {
        id: `${origin}/#HappyShape`,
        type: 'sh:NodeShape',
        'sh:targetClass': 'ht:Happy',
        'sh:property': [
            { 'sh:path': 'schema:text', 'sh:datatype': 'xsd:string', 'sh:minCount': 1, 'sh:maxCount': 1 },
            // A calendar day in the writer's own timezone, so a plain string
            // rather than xsd:date — see the note in rdfVocab.ts.
            { 'sh:path': 'ht:happyDate', 'sh:datatype': 'xsd:string', 'sh:minCount': 1, 'sh:maxCount': 1 },
            { 'sh:path': 'dcterms:created', 'sh:datatype': 'xsd:dateTime', 'sh:minCount': 1, 'sh:maxCount': 1 },
            { 'sh:path': 'ht:happyLastModified', 'sh:datatype': 'xsd:dateTime', 'sh:minCount': 1, 'sh:maxCount': 1 },
            { 'sh:path': 'ht:mood', 'sh:datatype': 'xsd:integer', 'sh:maxCount': 1 },
            { 'sh:path': 'ht:tag', 'sh:datatype': 'xsd:string' },
        ],
    }

    const settingsShape = {
        id: `${origin}/#SettingsShape`,
        type: 'sh:NodeShape',
        'sh:targetClass': 'ht:Settings',
        'sh:property': [
            { 'sh:path': 'schema:name', 'sh:datatype': 'xsd:string', 'sh:maxCount': 1 },
            { 'sh:path': 'ht:promptsEnabled', 'sh:datatype': 'xsd:boolean', 'sh:maxCount': 1 },
            { 'sh:path': 'ht:moodEnabled', 'sh:datatype': 'xsd:boolean', 'sh:maxCount': 1 },
            { 'sh:path': 'ht:onThisDayEnabled', 'sh:datatype': 'xsd:boolean', 'sh:maxCount': 1 },
            { 'sh:path': 'dcterms:modified', 'sh:datatype': 'xsd:dateTime', 'sh:maxCount': 1 },
        ],
    }

    const jsonld = {
        '@context': CONTEXT,
        '@graph': [
            application,
            capabilityWriteHappy,
            capabilityViewMonth,
            capabilityBrowseJournal,
            capabilityViewSettings,
            invokeOpen,
            invokeWriteHappy,
            invokeBrowseJournal,
            requirementScripts,
            requirementConnect,
            requirementClipboard,
            happyMonthShape,
            happyShape,
            settingsShape,
        ],
    }

    // Hand-maintained Turtle of the exact same triples — see the module comment,
    // and document.test.ts, which is what actually holds the two together.
    const turtle = `@prefix ac: <https://www.w3.org/ns/ac#> .
@prefix as: <https://www.w3.org/ns/activitystreams#> .
@prefix hydra: <http://www.w3.org/ns/hydra/core#> .
@prefix odrl: <http://www.w3.org/ns/odrl/2/> .
@prefix dpv: <https://w3id.org/dpv#> .
@prefix ht: <https://happy-track.app/vocab#> .
@prefix schema: <https://schema.org/> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

<${origin}/#i> a ac:Application ;
    as:name "Happy Track" ;
    ac:capability
        <${origin}/#capability-write-happy>,
        <${origin}/#capability-view-month>,
        <${origin}/#capability-browse-journal>,
        <${origin}/#capability-view-settings> ;
    ac:requirement
        <${origin}/#requirement-scripts>,
        <${origin}/#requirement-connect>,
        <${origin}/#requirement-clipboard> .

# Write today's happy. No target resource yet, so no variables.
<${origin}/#capability-write-happy> a ac:Capability ;
    ac:action as:Create ;
    ac:output "text/html" ;
    ac:resourceType ht:Happy ;
    ac:invocation <${origin}/#invoke-write-happy> .

# Open one month of happies by IRI — the signed-in person's own.
<${origin}/#capability-view-month> a ac:Capability ;
    ac:action odrl:display ;
    ac:output "text/html" ;
    ac:resourceType ht:HappyMonth ;
    ac:shape <${origin}/#HappyMonthShape> ;
    ac:invocation <${origin}/#invoke-open> .

# Read back the journal, month by month.
<${origin}/#capability-browse-journal> a ac:Capability ;
    ac:action odrl:display ;
    ac:output "text/html" ;
    ac:resourceType ht:HappyMonth ;
    ac:shape <${origin}/#HappyMonthShape> ;
    ac:invocation <${origin}/#invoke-browse-journal> .

# Open the preferences document by IRI.
<${origin}/#capability-view-settings> a ac:Capability ;
    ac:action odrl:display ;
    ac:output "text/html" ;
    ac:resourceType ht:Settings ;
    ac:shape <${origin}/#SettingsShape> ;
    ac:invocation <${origin}/#invoke-open> .

# Shared by both "open by IRI" capabilities: the app resolves the IRI it is handed.
<${origin}/#invoke-open> a ac:UriTemplateInvocation ;
    hydra:template "#open={open}" ;
    hydra:mapping [ hydra:variable "open" ; hydra:property ac:open ] .

<${origin}/#invoke-write-happy> a ac:UriTemplateInvocation ;
    hydra:template "#/today" .

<${origin}/#invoke-browse-journal> a ac:UriTemplateInvocation ;
    hydra:template "#/journal" .

<${origin}/#requirement-scripts> a ac:Requirement ;
    ac:cspDirective "script-src 'self'" ;
    dpv:hasPurpose dpv:ServiceProvision .

# Solid pods are arbitrary, user-chosen HTTPS origins, so this can't be a
# fixed allowlist. Sentry error reporting is covered by the same https: wildcard.
<${origin}/#requirement-connect> a ac:Requirement ;
    ac:cspDirective "connect-src 'self' https:" ;
    dpv:hasPurpose dpv:ServiceProvision .

# navigator.clipboard.writeText — copying error details or the sign-in log.
<${origin}/#requirement-clipboard> a ac:Requirement ;
    ac:browserPermission "clipboard-write" ;
    dpv:hasPurpose dpv:ServiceProvision .

<${origin}/#HappyMonthShape> a sh:NodeShape ;
    sh:targetClass ht:HappyMonth ;
    sh:property
        [ sh:path ht:monthKey ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ],
        [ sh:path dcterms:modified ; sh:datatype xsd:dateTime ; sh:maxCount 1 ],
        [ sh:path ht:hasHappy ; sh:nodeKind sh:IRI ; sh:class ht:Happy ],
        [ sh:path ht:hasDeletion ; sh:nodeKind sh:IRI ; sh:class ht:HappyDeletion ] .

<${origin}/#HappyShape> a sh:NodeShape ;
    sh:targetClass ht:Happy ;
    sh:property
        [ sh:path schema:text ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ],
        [ sh:path ht:happyDate ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ],
        [ sh:path dcterms:created ; sh:datatype xsd:dateTime ; sh:minCount 1 ; sh:maxCount 1 ],
        [ sh:path ht:happyLastModified ; sh:datatype xsd:dateTime ; sh:minCount 1 ; sh:maxCount 1 ],
        [ sh:path ht:mood ; sh:datatype xsd:integer ; sh:maxCount 1 ],
        [ sh:path ht:tag ; sh:datatype xsd:string ] .

<${origin}/#SettingsShape> a sh:NodeShape ;
    sh:targetClass ht:Settings ;
    sh:property
        [ sh:path schema:name ; sh:datatype xsd:string ; sh:maxCount 1 ],
        [ sh:path ht:promptsEnabled ; sh:datatype xsd:boolean ; sh:maxCount 1 ],
        [ sh:path ht:moodEnabled ; sh:datatype xsd:boolean ; sh:maxCount 1 ],
        [ sh:path ht:onThisDayEnabled ; sh:datatype xsd:boolean ; sh:maxCount 1 ],
        [ sh:path dcterms:modified ; sh:datatype xsd:dateTime ; sh:maxCount 1 ] .
`

    return { application, capabilities, invocations, requirements, jsonld, turtle }
}
