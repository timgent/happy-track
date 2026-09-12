import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

export function Input({ label, ...props }: InputProps) {
    const generatedId = React.useId()
    const inputId = props.id ?? generatedId
    return (
        <div className="flex-1">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                    {label}
                </label>
            )}
            <input
                {...props}
                id={inputId}
                className={`
                    w-full
                    px-4
                    py-2.5
                    border-2
                    border-primary-200 dark:border-primary-800
                    rounded-xl
                    shadow-soft
                    text-gray-900 dark:text-gray-100
                    placeholder-gray-400
                    focus:outline-none
                    focus:ring-2
                    focus:ring-primary-500
                    focus:border-primary-500 dark:focus:border-primary-600
                    hover:border-primary-300 dark:hover:border-primary-700
                    transition-all
                    duration-200
                    ${props.className || ''}
                `}
            />
        </div>
    )
}
