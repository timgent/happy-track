import { Link } from 'react-router-dom'
import { ApplicationCapabilityRdfa } from './ApplicationCapabilityRdfa'

export const FEEDBACK_EMAIL = 'tim.happytrack@gmail.com'

const linkStyles = 'text-gray-500 dark:text-gray-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors duration-200'

/**
 * Where the things you need once belong — the policy, the data page, a way to
 * get in touch. None of them is an everyday link, and the top nav has three
 * everyday links to protect.
 *
 * "Your data" covers both halves of it here: what is exported and what is
 * deleted. Play Store review looks for a deletion route, and it is one click in
 * from this label.
 */
export function Footer() {
    return (
        <footer className="safe-area-bottom border-t border-primary-100 dark:border-primary-900 bg-white/40 dark:bg-gray-900/40">
            {/*
              * pb-24 on mobile keeps the last row above Sentry's fixed feedback
              * widget, which otherwise sits on top of the "Feedback" link once
              * you scroll to the end of the page. Desktop centres the row well
              * clear of the widget, so the extra space comes off again at md.
              */}
            <nav
                aria-label="Site information"
                className="container mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-5 pb-24 text-sm md:pb-5"
            >
                <Link to="/privacy-policy" className={linkStyles}>
                    Privacy policy
                </Link>
                <Link to="/your-data" className={linkStyles}>
                    Your data
                </Link>
                {/* The theme choice lives on /settings, and the footer is the
                    only place that is on every page in every auth state — a
                    signed-out desktop user has neither an account menu nor a
                    hamburger. */}
                <Link to="/settings" className={linkStyles}>
                    Settings
                </Link>
                <a href={`mailto:${FEEDBACK_EMAIL}`} className={linkStyles}>
                    Feedback
                </a>
            </nav>
            {/* Invisible: the app's Application Capability description as RDFa,
                so the triples travel with the HTML too. See
                ./ApplicationCapabilityRdfa.tsx. */}
            <ApplicationCapabilityRdfa />
        </footer>
    )
}
