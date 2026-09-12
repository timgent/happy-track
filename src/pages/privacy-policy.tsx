import { Link } from 'react-router-dom'
import { FEEDBACK_EMAIL } from '../components/Footer'

/** Last time the substance of this page changed. */
const LAST_UPDATED = '12 September 2026'

const heading = 'mt-8 text-lg font-bold text-gray-900 dark:text-gray-50'
const body = 'mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300'

/**
 * The privacy policy.
 *
 * Written as prose a person can read rather than as clauses, because the whole
 * claim here is a simple one and dressing it up in legalese would make it look
 * like it was hiding something: there is no server, so there is nothing to
 * collect. The one exception — crash reports — is named, along with what is in
 * them.
 */
export function PrivacyPolicyPage() {
    return (
        <div className="mx-auto max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 sm:text-3xl">Privacy policy</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Last updated {LAST_UPDATED}</p>

            <p className="mt-6 rounded-2xl border-2 border-primary-200 dark:border-primary-900 bg-primary-50 dark:bg-primary-950/40 p-4 text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-200">
                Happy Track has no server and no account system. What you write is stored on your
                own device and, if you choose to sign in, in a Solid Pod that belongs to you. We
                never receive it and could not read it if we wanted to.
            </p>

            <h2 className={heading}>What is stored, and where</h2>
            <p className={body}>
                Your happies — the text, the optional mood, the optional tags, and the date and
                time — are written to your browser's own storage on the device you are using. If
                you sign in with a Solid Pod, a copy is written there too. That Pod is a service
                you chose and control; Happy Track is only a client of it, in exactly the same way
                your email program is a client of your mailbox.
            </p>

            <h2 className={heading}>What we collect</h2>
            <p className={body}>
                Nothing about you, and nothing you write. There is no analytics on your entries,
                no profile, no advertising, and no third party we hand anything to.
            </p>
            <p className={body}>
                Two exceptions, both about the software rather than about you:
            </p>
            <ul className="mt-2 space-y-2 pl-5 text-sm leading-relaxed text-gray-700 dark:text-gray-300 list-disc">
                <li>
                    <strong className="font-semibold">Crash reports.</strong> When the app fails, a
                    report goes to Sentry so the fault can be fixed. It contains the error, the
                    line of code, your browser version and the page you were on. It does not
                    contain your happies. If you send feedback through the crash dialog, whatever
                    you type into it goes too — so do not type anything there you would rather keep.
                </li>
                <li>
                    <strong className="font-semibold">Page views.</strong> The web version counts
                    visits through Vercel Analytics, which is cookie-free and records no
                    identifier that follows you between visits. The mobile apps do not do this.
                </li>
            </ul>

            <h2 className={heading}>Your Pod provider</h2>
            <p className={body}>
                Signing in sends you to whichever Pod provider you pick, and their terms and
                privacy policy apply to what they store for you. Happy Track sees only the access
                token that lets it read and write the <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">happy-track/</code>{' '}
                folder in your Pod. It asks for nothing else and touches nothing else.
            </p>

            <h2 className={heading}>Getting your data out, or destroying it</h2>
            <p className={body}>
                Both, any time, without asking anyone:{' '}
                <Link to="/your-data" className="font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline">
                    Your data
                </Link>{' '}
                will download everything as a file, and delete it from this device, from your Pod,
                or from both.
            </p>

            <h2 className={heading}>Children</h2>
            <p className={body}>
                The app is not aimed at children, and since it collects nothing there is nothing
                collected about them either. A Pod provider may set its own age limit.
            </p>

            <h2 className={heading}>Changes</h2>
            <p className={body}>
                If this policy changes, the date at the top changes with it. There is no mailing
                list to notify, because there is no list.
            </p>

            <h2 className={heading}>Getting in touch</h2>
            <p className={body}>
                <a
                    href={`mailto:${FEEDBACK_EMAIL}`}
                    className="font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline"
                >
                    {FEEDBACK_EMAIL}
                </a>
            </p>
        </div>
    )
}
