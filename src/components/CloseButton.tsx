import React from 'react'

interface CloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
}

export function CloseButton({ label, className, ...props }: CloseButtonProps) {
    return (
        <button
            type="button"
            aria-label={label}
            className={`
                inline-flex items-center justify-center
                w-8 h-8
                rounded-full
                text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800
                focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
                transition-colors duration-200
                ${className || ''}
            `}
            {...props}
        >
            <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                />
            </svg>
        </button>
    )
} 