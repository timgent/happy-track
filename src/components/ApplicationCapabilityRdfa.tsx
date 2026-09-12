import { capabilityDescription } from '../capability/document'

const PREFIX = [
    'ac: https://www.w3.org/ns/ac#',
    'as: https://www.w3.org/ns/activitystreams#',
    'odrl: http://www.w3.org/ns/odrl/2/',
    'hydra: http://www.w3.org/ns/hydra/core#',
    'dpv: https://w3id.org/dpv#',
    'ht: https://happy-track.app/vocab#',
].join(' ')

/**
 * The same Application Capability description served via content negotiation at
 * "/" (src/capability/document.ts, src/capability/negotiate.ts, /middleware.ts),
 * restated as RDFa attributes in the footer so a plain browser GET of the SPA's
 * HTML carries the triples too, with no Accept header gymnastics required
 * (https://dokieli.github.io/application-capability/).
 *
 * It is built from the same `capabilityDescription()` call that produces the
 * negotiated document, so the two cannot drift: there is only one description,
 * in two syntaxes. The origin comes from the browser, so a preview deployment
 * describes itself, exactly as the negotiated document does.
 *
 * Literal values use `<span property=… content=…/>` rather than `<meta>`:
 * React 19 auto-hoists `<meta>` into `<head>` wherever it's rendered, which
 * would pull it out from under its `typeof` ancestor and break the subject it's
 * meant to describe. `content` is a general RDFa attribute, not `<meta>`-
 * specific, so the empty `<span>` carries the same triple without being
 * hoisted. Every element here is otherwise empty, so this adds no visible
 * footprint to the footer. SHACL shapes aren't restated: ac:shape just points
 * at their fragment on the negotiated JSON-LD/Turtle document, which stays the
 * one place they're defined.
 */
export function ApplicationCapabilityRdfa() {
    // The deployment IRI this app is being served from — the same thing the
    // middleware derives from the request. Guarded because the Capacitor shell
    // and any non-browser render have no meaningful origin to describe.
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    if (!origin || origin === 'null') return null

    const { application, capabilities, invocations, requirements } = capabilityDescription(origin)
    const invocationById = new Map(invocations.map(invocation => [invocation.id, invocation]))

    return (
        <div prefix={PREFIX} typeof="ac:Application" resource={application.id}>
            <span property="as:name" content={application['as:name']} />

            {capabilities.map(capability => {
                const invocation = invocationById.get(capability.invocation)
                return (
                    <div key={capability.id} property="ac:capability" typeof="ac:Capability" resource={capability.id}>
                        <span property="ac:action" resource={capability.action} />
                        <span property="ac:output" content={capability.output} />
                        <link property="ac:resourceType" resource={capability.resourceType} />
                        {capability.shape && <link property="ac:shape" resource={capability.shape} />}
                        {invocation && (
                            <div property="ac:invocation" typeof="ac:UriTemplateInvocation" resource={invocation.id}>
                                <span property="hydra:template" content={invocation.template} />
                                {/* typeof="" with no resource is RDFa's way of
                                    saying "a blank node here", matching the
                                    inline mapping nodes in the JSON-LD. Without
                                    these a consumer reading only the HTML would
                                    have the template but not what its variable
                                    means. */}
                                {invocation.mapping?.map(mapping => (
                                    <div key={mapping.variable} property="hydra:mapping" typeof="">
                                        <span property="hydra:variable" content={mapping.variable} />
                                        <link property="hydra:property" resource={mapping.property} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}

            {requirements.map(requirement => (
                <div key={requirement.id} property="ac:requirement" typeof="ac:Requirement" resource={requirement.id}>
                    {requirement.cspDirective && (
                        <span property="ac:cspDirective" content={requirement.cspDirective} />
                    )}
                    {requirement.browserPermission && (
                        <span property="ac:browserPermission" content={requirement.browserPermission} />
                    )}
                    <span property="dpv:hasPurpose" resource={requirement.hasPurpose} />
                </div>
            ))}
        </div>
    )
}
