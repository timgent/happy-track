import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
    ArrowRightIcon,
    ChartBarIcon,
    CloudIcon,
    LockClosedIcon,
    PencilSquareIcon,
} from '@heroicons/react/24/outline'
import { useSolidPod } from '../components/SolidPodContext'
import { SolidProviderSelector } from '../components/SolidProviderSelector'
import { Button } from '../components/Button'

const POINTS = [
    {
        icon: PencilSquareIcon,
        title: 'One line a day',
        body: 'A box, a sentence, done. Add a mood or a tag if you feel like it — or do not.',
    },
    {
        icon: CloudIcon,
        title: 'Works with no signal',
        body: 'Everything is written to your device first. On a train, on a plane, in a basement: it just works, and syncs when you are back.',
    },
    {
        icon: LockClosedIcon,
        title: 'Stored in your own Pod',
        body: 'Sign in with a Solid Pod and your journal lives there — your storage, your rules. Happy Track keeps no copy, because there is no server to keep one on.',
    },
    {
        icon: ChartBarIcon,
        title: 'Nice to read back',
        body: 'Streaks, months at a glance, and a happy from this day last year, resurfaced.',
    },
] as const

/**
 * The front door, for someone who has not used the app before.
 *
 * The first CTA is **"Start writing", not "Sign in".** Nothing here needs an
 * account: the app is fully usable signed out, on the device, and asking for an
 * identity provider before somebody has written a word is the fastest way to
 * lose them. Signing in is offered underneath as what it is — the thing that
 * gets your happies onto your other devices.
 *
 * Anyone already signed in never sees this page: `DefaultRedirect` sends them
 * to Today.
 */
export function LandingPage() {
    const { login, isLoggedIn, isReconnecting } = useSolidPod()
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const showsAsSignedIn = isLoggedIn || isReconnecting

    return (
        <div className="mx-auto max-w-3xl">
            <section className="text-center">
                <p className="text-5xl sm:text-6xl" aria-hidden="true">☀️</p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
                    Write down one happy thing
                    <span className="block bg-gradient-sunrise bg-clip-text text-transparent">
                        every day
                    </span>
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-lg text-gray-700 dark:text-gray-300">
                    A tiny journal for the good bits. It takes five seconds, works offline,
                    and the entries are yours — kept in your own storage, not ours.
                </p>

                <div className="mt-7 flex flex-col items-center gap-3">
                    <Link to="/today">
                        <Button variant="primary" className="px-6 py-3 text-base">
                            {showsAsSignedIn ? 'Write today’s happy' : 'Start writing — no account needed'}
                            <ArrowRightIcon aria-hidden="true" className="h-5 w-5" />
                        </Button>
                    </Link>

                    {!showsAsSignedIn && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Got a Solid Pod?{' '}
                            <button
                                type="button"
                                onClick={() => setIsProviderSelectorOpen(true)}
                                className="font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline"
                            >
                                Sign in to sync across your devices
                            </button>
                        </p>
                    )}
                </div>
            </section>

            <section aria-labelledby="how-heading" className="mt-14">
                <h2 id="how-heading" className="sr-only">How it works</h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                    {POINTS.map(point => (
                        <li
                            key={point.title}
                            className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-soft"
                        >
                            <point.icon
                                aria-hidden="true"
                                className="h-6 w-6 text-primary-600 dark:text-primary-400"
                            />
                            <h3 className="mt-2.5 text-base font-bold text-gray-900 dark:text-gray-50">
                                {point.title}
                            </h3>
                            <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                                {point.body}
                            </p>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-12 rounded-2xl border-2 border-primary-200 dark:border-primary-900 bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-950/40 dark:to-accent-950/40 p-6 text-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                    Why bother?
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    Because a good day is easy to forget and a bad one is hard to. Writing the
                    good bit down takes a moment, and a year later you have a hundred of them to
                    read back.
                </p>
                <div className="mt-5">
                    <Link to="/today">
                        <Button variant="primary">Write your first one</Button>
                    </Link>
                </div>
            </section>

            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={issuer => login(issuer, '/today')}
            />
        </div>
    )
}
