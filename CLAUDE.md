# CLAUDE.md

Happy Track is a front-end-only React app for keeping a journal of small good
things. Entries live on the device and in the user's own Solid Pod; there is no
Happy Track server. It ships as a web app on Vercel and as WebView apps for iOS
and Android via Capacitor.

It was built from [pack-me-up](https://github.com/timgent/pack-me-up)'s Solid
and offline infrastructure. Where a rule below cites a bug number, that number
is pack-me-up's — the bug was found and fixed there, and the invariant was
carried over rather than re-learned.

## Testing

Use TDD (red-green-refactor) when implementing new features.
Run tests: `npm test` — type checks first (`npm run typecheck`), then runs
vitest, so the persistence guard below fails the same command locally and in CI.
`npm run test:watch` skips the type check.

`npx playwright test` runs the end-to-end suite against a real Community Solid
Server, started and torn down by `e2e/global-setup.ts`. A real server rather
than a mock, because what is worth testing is exactly what a mock would get
wrong: the OIDC round trip, DPoP-bound tokens, ETags and conditional requests,
and CSS's own opinions about `PUT` and container creation.

### E2E pod isolation

Each suite that writes to a pod **must use its own dedicated pod user** — never
share `testuser` between suites that run concurrently. Add new user constants to
`playwright.config.ts` and create the account in `e2e/global-setup.ts`.

| Suite | Pod user   | Why |
|-------|------------|-----|
| a, d  | (none)     | signed out — no pod at all |
| b     | `buser`    | writes happies |
| e     | `testuser` | signs in and out; leaves nothing behind |
| f     | `fuser`    | writes, then asserts the bytes on the server |
| g     | `guser`    | cuts the network out from under a live session |
| h     | `huser`    | a seeded journal with history in it |
| i     | `liveuser` | app write + peer write + poll, interleaved |

Suite I has a pod of its own for a reason worth keeping: it is a deliberate
three-way interleaving, so a leftover document or an in-flight push-back from
another suite shows up as a phantom sync failure.

## Solid session

Never end a session because a request failed. `@uvdsl/solid-oidc-client-browser`'s
`SessionCore` ships no refresh lifecycle — that is this app's job, and it lives in
`ResilientSession` (`src/services/ResilientSession.ts`). Three rules it exists to
keep:

- **Only the provider may end a session.** `invalid_grant`/`invalid_client`, or a
  DPoP key that no longer matches, are terminal. Network errors, 5xx, 429, JWKS
  fetch failures and clock skew are retried. Never call the library's `logout()`
  in response to a 401 — it calls `database.clear()`, which deletes the refresh
  token and makes a recoverable session unrecoverable.
- **Bank a rotated refresh token before doing anything that can throw.**
  Providers treat a re-presented refresh token as a replay and revoke the whole
  grant, so a replacement that is received but not stored is a dead session.
- **Never let the app be a dynamic client in production.** The native shell is
  served from `https://localhost`, so it would fall through to dynamic client
  registration — and a registration the provider reclaims answers the next
  refresh with `invalid_client`, which is terminal. `solidClientIdentity.ts`
  decides this, and `public/client-id.json` must keep listing the native
  redirect URI or the mobile app cannot sign in at all.

A fourth rule follows from the first: **a session that cannot be reached is not a
session that has ended.** `isReconnecting` (`SolidPodContext`) is that state, and
while it holds, the app keeps the account on screen and opens the identity's own
PouchDB namespace from `rememberedSession.ts` rather than the empty local one —
otherwise being offline looks exactly like being signed out (#342).

`SolidPodContext.resilience.test.tsx`, `SolidPodContext.offline.test.tsx`,
`ResilientSession.test.ts` and e2e suite G pin the behaviour.

## Offline

The app is offline-first, and the claim is on the front page, so it is load-bearing:

- **Every read is local.** `useLocalFirstLoad` reads PouchDB on mount — which
  answers in milliseconds — and reads again if a sync brings something this
  device had never seen. Nothing on screen waits for the pod.
- **Every write is local first, pod second.** `useSyncCoordinator.saveWithSyncPrevention`
  stamps a monotonic `lastModified`, saves to PouchDB, and pushes to the pod
  after the next paint. A failed push is not a failed save, and is not reported
  to the user as one.
- **Reconnecting means reconciling.** `DatabaseContext.resync` runs the full
  two-way sync on sign-in *and* whenever the connection returns or the app comes
  back to the foreground. Without that last part a happy written on a train
  stayed on one device forever: the per-resource poll only reads, and the
  sign-in sync runs once per identity. It is the other half of what the offline
  banner promises in so many words.

One honest limitation: the **web** build ships no service worker, so a browser
with no connection cannot fetch the bundle and therefore cannot cold-start. The
native shells serve the bundle from the device, so for them only the pod is
missing. E2E suite G models the native case by blocking the pod origin rather
than all network (see `blockPod`).

## Sync: both sides are writable

A month document is a *set* the user adds to from whichever device is to hand,
and another Solid app may write to it too. So "the pod wins" — the strategy that
works for a document one device owns — loses whichever entry the other writer
made. Three rules keep that from happening:

- **Months are merged, never replaced.** `mergeHappyMonths` unions by id, takes
  the later `lastModified` per entry, and honours tombstones unless the entry
  was rewritten after its own deletion. It is commutative by construction (ties
  break on content), which is what lets two peers pushing merges at each other
  settle rather than alternate.
- **A deleted entry leaves a tombstone.** Without one, the device still holding
  a copy reads its absence from the pod as "not uploaded yet" and puts it back.
- **A merge is pushed back conditionally.** The push-back carries `If-Match` on
  the ETag the merge was computed from (`saveRdfToPod`'s `ifMatch`,
  `usePodSync`'s `onlyIfUnchanged`). A refused write is a no-op, not an error;
  the next poll re-reads and merges the newer copy. Without this the app's own
  merge could land on top of a write that arrived while it was being computed —
  and an external Solid app has no local copy to heal from, so that write was
  gone for good. E2E suite I pins it.

Two consequences worth remembering when changing `useSyncCoordinator`:

- With a merge function, **the decision to apply pod data is "would merging
  change anything", not a timestamp comparison.** Gating on the document
  timestamp discarded a peer's entries wholesale when its document stamp was
  missing or behind, even though every entry carried its own.
- With a merge function, **the timestamp echo guard is off.** A timestamp is not
  evidence of authorship: two writers can stamp the same millisecond, and the
  guard then drops a real peer change and keeps dropping it. Content answers the
  same question exactly.

## Data Access

Never call `db.*` (local PouchDB) and pod storage functions directly in the same
place. Use the established layers:

- **Write** (local + pod together):
  `useSyncCoordinator.saveWithSyncPrevention(data, saveToPod)`.
- **Pod path config**: `usePodSync` gives you `saveToPod` / `syncFromPod` for a
  resource path.
- **The happies themselves**: `useHappies` — every page reads and writes through
  it, so there is one place where local state, PouchDB and the pod are
  coordinated.
- **Sign-in sync** (pod → local): handled by `DatabaseContext` via
  `syncAllDataFromPod`; no per-page code needed.

### Persistence: adding a field to `Happy`, `HappyMonth` or `HappySettings`

Never persist a type by listing the fields to keep. `database.ts` builds each
PouchDB document with `toDocumentData(entity, [...keys the document owns])` — an
omit-list, so a new field is stored by default. Reads spread the whole stored
payload for the same reason. An allowlist has to be remembered every time a
field is added, and forgetting it drops the field silently: no type error, no
failing test, and the user only finds out after a reload, when what they wrote
is gone. pack-me-up lost three fields exactly that way (#260).

Two guards catch a repeat, and `npm test` runs both (CI included):

1. `src/test-utils/fullyPopulatedFixtures.ts` holds `Required<...>` fixtures with
   **every** field of these types populated. Adding an optional field to the type
   breaks the type check until the fixture covers it. (They live in `src`, not in
   a `.test.ts`, because `tsconfig.app.json` excludes test files from type
   checking.)
2. Round-trip tests assert those fixtures survive intact — through PouchDB
   (`database.test.ts` → "Field fidelity") and through the pod's RDF
   (`rdfSerialization.test.ts` → "Field fidelity"), the latter through real
   Turtle rather than an in-memory dataset.

So when the type check sends you to the fixtures, add the field with a
distinctive value and run the tests — don't reach for `as` or a partial fixture.
A field that genuinely must not leave the device belongs in
`happyLocalOnlyFields` with a comment saying why.

## Dates are calendar days, not instants

A happy belongs to the **writer's own** calendar day. Someone typing at 23:30
means that day, and an instant stored in UTC files it under the next one for
anybody reading from another timezone — including the same person on holiday.

So `Happy.date` is a plain `YYYY-MM-DD` string, written to RDF as a plain
string and never as `xsd:dateTime`, and all the arithmetic in
`src/happies/dates.ts` goes through the calendar parts rather than through
milliseconds — because a day is not always 24 hours long, and `+ 86_400_000` on
the morning the clocks go forward lands back where it started. `createdAt` and
`lastModified` are genuine instants and stay datetimes.

## Streaks are the only pressure this app applies

Which makes the wording as load-bearing as the counting. `src/happies/streak.ts`:

- **A day you have not written yet does not break the streak.** The run through
  yesterday still counts, and `atRisk` says the day is unclaimed. Telling
  someone at 9am they have lost a 40-day streak they could still keep by
  lunchtime is how you get them to stop opening the app.
- **A broken streak reports the longest run instead of zero.** "0 days" is a
  reproach; "best: 23 days" is a fact.
- **Celebrations are rare.** Ten milestones over three years, and nothing else
  in the app throws confetti. A celebration that happens daily is wallpaper.

The same principle applies to the insights page: it withholds any claim it does
not have the data for (`MIN_FOR_A_CLAIM`), and states counts rather than
percentages, because a percentage reads as a grade.

## Editing happens where the happy is

The composer that edits a happy renders in that happy's own place in the list,
not at the top of the page. Three things depend on that:

- **The editor has to be where the reader was looking.** The journal is as long
  as the user's history, so an editor above the day groups is off-screen for
  every entry but the first — and the composer declines to autofocus on a phone
  (deliberately: see `HappyComposer`), so nothing scrolled to it either. Edit
  looked like a dead button. An edit *is* now autofocused on every device,
  because the rule is about a box that grabs the keyboard on the way past, and
  someone who tapped Edit asked for it by name.
- **One editor per happy, inside the keyed `<li>`.** A single composer at a
  fixed position is reconciled rather than remounted when the subject changes,
  and the composer seeds its fields from `editing` on mount only. So choosing
  Edit on a second happy mid-edit left the first one's text in the box and
  wrote it over the second on save. Rendering the editor where the card was is
  what makes a change of subject a remount rather than a rename.
- **Closing an editor has to hand focus back.** The kebab that opened it lives
  on the card the editor replaced, so Radix has nothing to return focus to and
  it lands on `<body>`. `HappyCard.focusActions` is the handshake that puts it
  back on the card it came from.

An editor inside the list also cannot outlive the list: the journal closes one
whose happy a search or a month change has filtered out, rather than leaving it
to reappear half-typed when the filter clears.

`journal.test.tsx`, `today.test.tsx`, `HappyComposer.test.tsx` and e2e suite B's
small-screen test pin all of it.

## Charts

`src/components/Charts.tsx`. Every chart plots one series, so colour carries no
information and is not used to restate what a bar's length already shows. The
series colour is `#d97706` on light (3.19:1 on white) and `#f59e0b` on dark
(8.26:1 on `#111827`); `#f59e0b` on white is 2.15:1, which is why light mode
does not use it. Marks cap at 24px, round only at the data end, and are
separated by a 2px surface gap rather than a stroke. Every chart ships a table
of its numbers — the accessible equivalent, and what makes the deliberately
sub-3:1 de-emphasis gray in the weekday chart legitimate.

## Application Capability description

The app publishes a machine-readable description of itself at `/` — what it can
do, how another app invokes it, what it needs from its environment — per
[dokieli's Application Capability spec](https://dokieli.github.io/application-capability/).
It lives in `src/capability/`, is served by `middleware.ts` (Vercel only — it
does nothing under `npm run dev` or `vite preview`), and is restated as RDFa in
the footer.

Three rules it exists to keep:

- **Never advertise a capability the app can't honour.** Every invocation
  template must resolve to a real route. `document.test.ts` pins the template
  list; `#open={open}` is handled by `openInvocation.ts` and `/open`
  (`src/pages/open-resource.tsx`). Note that `openInvocationPath` refuses a
  resource in somebody else's pod: there is no viewer for another person's
  journal, and pretending otherwise would advertise what does not exist.
- **The JSON-LD and the Turtle are two syntaxes for one description.** They are
  hand-maintained separately, so `document.test.ts` parses both and compares
  canonical N-Quads. Change one, change the other, and let that test tell you.
- **Nothing hardcodes the deployment origin.** `capabilityDescription(origin)`
  builds every IRI from the origin the request arrived on, so a preview
  deployment describes itself.

`middleware.ts` sits outside `src/`, where neither `tsconfig.app.json` nor
`tsconfig.node.json` looks, so `tsconfig.middleware.json` exists purely to bring
it into `tsc -b`. Keep it referenced from `tsconfig.json` or the one file gating
the production homepage stops being type-checked.

Two more rules come from the deployment rather than the spec, and both were paid
for: the first production deploy answered **every** request to "/" with
`500 MIDDLEWARE_INVOCATION_FAILED` — not only the ones asking for RDF, because
what fails is loading the module, before the handler is ever called.

- **Relative imports in the middleware's module graph need an explicit `.js`.**
  Vercel does not bundle middleware. It compiles each `.ts` file to a `.js` file
  beside it, ships them, and lets the Edge runtime resolve the imports at run
  time — where `./src/capability/negotiate` resolves to nothing. So
  `tsconfig.middleware.json` uses `node16` module resolution, the same as
  Vercel's compile, and `npm run typecheck` fails with the same `TS2835` the
  build log shows rather than leaving it to the deployment. This is why
  `negotiate.ts` imports `./document.js`; Vite and vitest resolve the `.js`
  specifier back to the `.ts` without caring.
- **Nothing the middleware imports may touch a Node global.** `next` comes from
  `@vercel/functions/middleware`, not the package root: the root re-exports the
  whole package, including helpers written for the Node.js runtime, and one of
  those reads `process.env` as its module is evaluated. Type checking cannot see
  that, so `middleware.test.ts` bundles the real file and runs it in an Edge
  sandbox with no `process` in it.

The handler also falls back to serving the app if negotiation throws: the
description is optional, the homepage is not.

## Pull Requests

When raising a PR that addresses a GitHub issue, always reference the issue in
the PR description using `Closes #<issue-number>` or `Fixes #<issue-number>` so
GitHub automatically links and closes the issue on merge.
