import { useEffect, useMemo, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'

interface CelebrationBannerProps {
    /** The streak length reached. Always one of `MILESTONES`. */
    milestone: number
    onDismiss: () => void
}

const CONFETTI = ['🎉', '✨', '🌟', '🎊', '💛', '🧡']

/** How long the confetti falls for. Kept in step with `confetti-fall`. */
const CONFETTI_MS = 3000

function messageFor(milestone: number): { headline: string; note: string } {
    if (milestone >= 365) {
        return {
            headline: `A whole year. ${milestone} days.`,
            note: 'Three hundred and sixty-five small good things, written down by you.',
        }
    }
    if (milestone >= 100) {
        return {
            headline: `${milestone} days in a row`,
            note: 'This is a habit now, not an experiment.',
        }
    }
    if (milestone >= 30) {
        return {
            headline: `${milestone} days in a row`,
            note: 'A month of noticing. Have a scroll back through it.',
        }
    }
    if (milestone >= 14) {
        return {
            headline: `Two weeks running`,
            note: `${milestone} days. Whatever you are doing, keep doing it.`,
        }
    }
    if (milestone >= 7) {
        return {
            headline: 'A full week',
            note: 'Seven days, seven happies. Nicely done.',
        }
    }
    return {
        headline: `${milestone} days in a row`,
        note: 'The hardest part is the first few. You are past them.',
    }
}

/**
 * What appears when a streak reaches a milestone.
 *
 * Deliberately rare. `MILESTONES` is ten numbers over three years, and nothing
 * else in the app throws confetti — an ordinary save gets a card that arrives
 * with a small bounce and nothing more. A celebration that happens every day is
 * wallpaper, and the one that matters then goes unnoticed.
 *
 * It is a `role="status"`, not an alert: this is good news, and it must not
 * interrupt what a screen-reader user is doing. It is also dismissible and
 * self-clearing, because a banner that has to be dealt with is a chore.
 */
export function CelebrationBanner({ milestone, onDismiss }: CelebrationBannerProps) {
    const { headline, note } = messageFor(milestone)
    const [showConfetti, setShowConfetti] = useState(() => !prefersReducedMotion())

    useEffect(() => {
        if (!showConfetti) return
        const timer = setTimeout(() => setShowConfetti(false), CONFETTI_MS)
        return () => clearTimeout(timer)
    }, [showConfetti])

    // Positions fixed once per mount, so a re-render does not teleport the
    // pieces mid-fall.
    const confetti = useMemo(
        () => Array.from({ length: 18 }, (_, index) => ({
            emoji: CONFETTI[index % CONFETTI.length],
            left: `${(index * 5.5 + (index % 3) * 4) % 96}%`,
            delay: `${(index % 6) * 0.18}s`,
        })),
        [],
    )

    return (
        <>
            {showConfetti && (
                <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
                    {confetti.map((piece, index) => (
                        <span
                            key={index}
                            className="confetti-piece"
                            style={{ left: piece.left, animationDelay: piece.delay }}
                        >
                            {piece.emoji}
                        </span>
                    ))}
                </div>
            )}

            <div
                data-testid="celebration-banner"
                role="status"
                aria-live="polite"
                className="celebration-banner celebration-bg relative mb-6 overflow-hidden rounded-2xl px-5 py-4 text-white shadow-soft"
            >
                <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="text-3xl leading-none">🎉</span>
                    <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold">{headline}</p>
                        <p className="mt-0.5 text-sm text-white/90">{note}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onDismiss}
                        aria-label="Dismiss celebration"
                        className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/20"
                    >
                        <XMarkIcon aria-hidden="true" className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </>
    )
}
