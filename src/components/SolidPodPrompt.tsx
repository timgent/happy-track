import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { SolidProviderSelector } from './SolidProviderSelector'
import { useSolidPod } from './SolidPodContext'

export interface PodBenefit {
  label: string
  text: string
}

const DEFAULT_BENEFITS: PodBenefit[] = [
  { label: 'Free', text: 'All major Pod providers are free to sign up' },
  { label: 'Every device', text: 'Write on your phone, read back on your laptop' },
  { label: 'You own your data', text: 'Your happies stay in your personal storage' },
  { label: 'Never lose your work', text: 'Safe even if you clear browser data' },
  { label: 'Privacy-focused', text: 'You control who can access your data' },
]

interface SolidPodPromptProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  /** Heading above the benefits list */
  benefitsTitle?: string
  /** Override the benefits when the prompt is framed around a specific payoff */
  benefits?: PodBenefit[]
  /** Label of the button that starts the sign-in flow */
  confirmLabel?: string
  /** Label of the dismiss button */
  dismissLabel?: string
  /** Runs just before the redirect to the provider — record what to resume here */
  onBeforeLogin?: () => void
}

/**
 * Reusable component for prompting users to set up their Solid Pod
 * Shows benefits and integrates with the provider selector
 */
export function SolidPodPrompt({
  isOpen,
  onClose,
  title,
  message,
  benefitsTitle = 'What signing in unlocks:',
  benefits = DEFAULT_BENEFITS,
  confirmLabel = 'Sync my happies',
  dismissLabel = 'Maybe Later',
  onBeforeLogin,
}: SolidPodPromptProps) {
  const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
  const { login } = useSolidPod()

  const handleGetStarted = () => {
    setIsProviderSelectorOpen(true)
  }

  const handleProviderSelect = (issuer: string) => {
    onBeforeLogin?.()
    onClose()
    return login(issuer)
  }

  const handleMaybeLater = () => {
    onClose()
  }

  const handleCloseProviderSelector = () => {
    setIsProviderSelectorOpen(false)
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleMaybeLater} title={title}>
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{message}</p>

          <div className="bg-gradient-to-br from-primary-50 dark:from-primary-950/40 to-accent-50 dark:to-accent-950/40 border-2 border-primary-200 dark:border-primary-800 rounded-xl p-4 space-y-2">
            <h4 className="font-bold text-primary-900 dark:text-primary-200 text-sm">{benefitsTitle}</h4>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 ml-4 list-disc">
              {benefits.map(benefit => (
                <li key={benefit.label}>
                  <strong>{benefit.label}</strong> - {benefit.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={handleGetStarted}
              variant="primary"
              className="flex-1"
            >
              {confirmLabel}
            </Button>
            <Button
              type="button"
              onClick={handleMaybeLater}
              variant="ghost"
              className="flex-1"
            >
              {dismissLabel}
            </Button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            You can always set this up later from the navigation menu
          </p>
        </div>
      </Modal>

      <SolidProviderSelector
        isOpen={isProviderSelectorOpen}
        onClose={handleCloseProviderSelector}
        onSelect={handleProviderSelect}
      />
    </>
  )
}
