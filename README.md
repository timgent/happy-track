# Happy Track

Write down one happy thing each day — or several. A small journal for the good
bits, built so that the writing takes five seconds and the reading back is worth
it a year later.

Your entries are stored on your device and, if you sign in, in **your own Solid
Pod**. There is no Happy Track server, so there is nowhere for us to keep a copy
even if we wanted to.

## What it does

- **Today** — a box, a sentence, done. Optionally a mood and some tags; never
  required.
- **Works with no signal.** Everything is written to the device first and synced
  when the connection comes back. Offline is a supported state, not an error.
- **A streak that is kind about it.** A day you have not written yet does not
  break it, and a broken run reports your best rather than zero.
- **On this day** — a happy from this date in an earlier year, resurfaced.
- **Journal** — read back by month, or search the lot.
- **Insights** — how often you write, how it tends to feel, what you tag.

## Getting started

```bash
npm install
npm run dev
```

To try it against a real Solid server, run one locally and point the app at it:

```bash
npx --yes @solid/community-server -p 4000
```

Then use `http://localhost:4000` as the Pod URL in the sign-in dialog.

## Tests

```bash
npm test          # type check, then unit tests
npx playwright test   # end-to-end, against a real Community Solid Server
```

The E2E suite starts and tears down its own Solid server, creates the accounts it
needs, and asserts against the actual Turtle the app writes to a pod — including
the two-device cases (a write arriving while the app is open) and the offline
ones (writing with no connection, and a cold start that cannot reach the pod).

## Installing on Android

The web build is a PWA: open it in Chrome on Android, then use the menu's
"Add to Home screen" (Chrome may also offer an install banner on its own). It
launches full-screen from the home screen icon and, once you've opened it
online at least once, works offline too. There's also a native Capacitor
build in `android/` for the Play Store; the PWA is the quicker way to get it
on your own phone.

## How it is put together

A front-end-only React app: Vite, TypeScript, Tailwind v4, PouchDB on the device,
RDF/Turtle in the pod, and Capacitor for the iOS and Android shells. The Solid
session handling, offline behaviour and sync design are documented in
[`CLAUDE.md`](./CLAUDE.md), which is worth reading before changing any of them —
most of the rules there exist because something went wrong first.

Your data in the pod lives under `happy-track/`, in a vocabulary another Solid
app can read: one document per month, `schema:text` for the words themselves.

## License

This project is licensed under the GNU Affero General Public License v3.0
(AGPL-3.0).
