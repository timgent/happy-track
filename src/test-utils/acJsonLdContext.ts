/**
 * A verbatim snapshot of the Application Capability JSON-LD context, as
 * published in §2.3 of the spec (Draft Community Group Report, 17 August 2026 —
 * https://dokieli.github.io/application-capability/).
 *
 * Tests need it because expanding src/capability/document.ts's JSON-LD means
 * resolving `https://www.w3.org/ns/ac.jsonld`, and a unit test does not reach
 * the network. The spec itself notes the context document is "temporarily
 * included" in the spec until it is published at that URI, so this snapshot is
 * the only copy there is to check against today.
 *
 * Test-only: nothing the app ships imports this. When the spec's context
 * changes, re-copy it here and let document.test.ts tell you what broke.
 */
export const AC_JSONLD_CONTEXT = {
    "@context": {
        "@version": 1.1,
        "@protected": true,
        "ac": "https://www.w3.org/ns/ac#",
        "as": "https://www.w3.org/ns/activitystreams#",
        "dpv": "https://w3id.org/dpv#",
        "hydra": "http://www.w3.org/ns/hydra/core#",
        "ldp": "http://www.w3.org/ns/ldp#",
        "oa": "http://www.w3.org/ns/oa#",
        "odrl": "http://www.w3.org/ns/odrl/2/",
        "id": "@id",
        "type": "@type",
        "Accept": "as:Accept",
        "accept": "ac:accept",
        "action": {
            "@id": "ac:action",
            "@type": "@id"
        },
        "actor": {
            "@id": "as:actor",
            "@type": "@id"
        },
        "browserPermission": "ac:browserPermission",
        "Capability": "ac:Capability",
        "capability": {
            "@id": "ac:capability",
            "@type": "@id"
        },
        "cspDirective": "ac:cspDirective",
        "destination": {
            "@id": "ac:destination",
            "@type": "@id"
        },
        "hasPurpose": {
            "@id": "dpv:hasPurpose",
            "@type": "@id"
        },
        "inbox": {
            "@id": "ldp:inbox",
            "@type": "@id"
        },
        "Invocation": "ac:Invocation",
        "invocation": {
            "@id": "ac:invocation",
            "@type": "@id"
        },
        "issuedPolicy": {
            "@id": "odrl:issuedPolicy",
            "@type": "@id"
        },
        "login": {
            "@id": "ac:login",
            "@type": "@id"
        },
        "mapping": "hydra:mapping",
        "object": {
            "@id": "as:object",
            "@type": "@id"
        },
        "open": {
            "@id": "ac:open",
            "@type": "@id"
        },
        "output": "ac:output",
        "property": {
            "@id": "hydra:property",
            "@type": "@id"
        },
        "proxy": {
            "@id": "ac:proxy",
            "@type": "@id"
        },
        "Reject": "as:Reject",
        "Request": "ac:Request",
        "Requirement": "ac:Requirement",
        "requirement": {
            "@id": "ac:requirement",
            "@type": "@id"
        },
        "resourceType": {
            "@id": "ac:resourceType",
            "@type": "@id"
        },
        "search": "ac:search",
        "selector": {
            "@id": "oa:hasSelector",
            "@type": "@id"
        },
        "state": {
            "@id": "oa:hasState",
            "@type": "@id"
        },
        "shape": {
            "@id": "ac:shape",
            "@type": "@id"
        },
        "summary": "as:summary",
        "template": "hydra:template",
        "UriTemplateInvocation": "ac:UriTemplateInvocation",
        "variable": "hydra:variable"
    }
}
