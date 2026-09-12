# What Happy Track puts in your Pod

Everything the app stores lives under `happy-track/` in the pod root. It is
plain RDF, in a vocabulary chosen so that another Solid app can read it without
knowing anything about this one.

```
happy-track/
  months/
    2026-09.ttl      one document per month
    2026-08.ttl
  settings.ttl       a handful of preferences
```

## Why a month is the unit

Per-entry files would mean a request per happy — a thousand a year — and
per-day files a request per day. A month is one small document, twelve a year,
and it is also the span the journal and the insights page read at a time.

It has a cost: two devices writing in the same month are writing to the same
document. That is what `mergeHappyMonths` and the conditional write exist for;
see `CLAUDE.md`.

## A month document

```turtle
@prefix ht: <https://happy-track.app/vocab#> .
@prefix schema: <https://schema.org/> .
@prefix dc: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<2026-09.ttl> a ht:HappyMonth ;
    ht:monthKey "2026-09" ;
    dc:modified "2026-09-12T14:03:11.004Z"^^xsd:dateTime ;
    ht:hasHappy <2026-09.ttl#happy-0c8f…> ;
    ht:hasDeletion <2026-09.ttl#deleted-4b21…> .

<2026-09.ttl#happy-0c8f…> a ht:Happy ;
    schema:text "The dog worked out how to open the back door" ;
    ht:happyDate "2026-09-12" ;
    dc:created "2026-09-12T14:02:58.117Z"^^xsd:dateTime ;
    ht:happyLastModified "2026-09-12T14:02:58.117Z"^^xsd:dateTime ;
    ht:mood 4 ;
    ht:tag "dog", "family" .

<2026-09.ttl#deleted-4b21…> a ht:HappyDeletion ;
    ht:deletedHappyId "4b21…" ;
    ht:happyDeletedAt "2026-09-11T20:14:02.881Z"^^xsd:dateTime .
```

Four things about that are deliberate:

- **`schema:text` for the words.** A standard term, so a pod browser that has
  never heard of Happy Track still shows the entry rather than an opaque blob.
  `dc:created` and `dc:modified` are standard for the same reason. Only what has
  no standard equivalent — the mood scale, the calendar day — gets an `ht:` term.
- **`ht:happyDate` is a plain string, not `xsd:date`.** A happy belongs to the
  *writer's* calendar day. Someone typing at 23:30 means that day, and a
  timezone-bearing value comes back on the wrong side of midnight for a reader
  somewhere else.
- **The mood is the number 1–5, not the emoji.** The faces are presentation and
  may be restyled; the ordering is the data. A value outside 1–5 is ignored on
  read rather than trusted — a pod is writable by anything its owner authorises.
- **A deleted happy leaves a tombstone.** Without it, a device still holding a
  copy reads the entry's absence as "never uploaded" and puts it back.

An entry's id is the fragment (`#happy-<id>`), so identity survives reordering
and is what the merge reconciles on.

## The settings document

```turtle
<settings.ttl> a ht:Settings ;
    schema:name "Sam" ;
    ht:promptsEnabled true ;
    ht:moodEnabled true ;
    ht:onThisDayEnabled true ;
    dc:modified "2026-09-12T14:03:11.004Z"^^xsd:dateTime .
```

Last write wins on this one — they are independent switches, and the most
recent answer to "show the mood picker?" simply is the current answer. A setting
absent from the document falls back to the app's default rather than to `false`,
so a file written before a feature existed does not silently turn it off.

## Reading it yourself

Nothing here needs the app. `curl` it with a token, or point any Solid browser
at the container. The app's own
[Application Capability description](https://dokieli.github.io/application-capability/)
— served at `/` under content negotiation, and restated as RDFa in the footer —
publishes SHACL shapes for `ht:HappyMonth`, `ht:Happy` and `ht:Settings`, so a
consumer can check its understanding against what the app claims to write.
