"use client"

import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children' | 'value'> {
  checked?: boolean
  defaultChecked?: boolean
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/** Plain button-based checkbox (no runtime dependency). Mirrors the base-ui props we use. */
export function Checkbox({
  className,
  checked,
  defaultChecked,
  indeterminate = false,
  onCheckedChange,
  disabled,
  ...props
}: CheckboxProps) {
  const isChecked = checked ?? defaultChecked ?? false
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : isChecked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      data-state={isChecked ? 'checked' : 'unchecked'}
      data-checked={isChecked ? '' : undefined}
      data-indeterminate={indeterminate ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-slot="checkbox"
      className={cn(
        "relative inline-flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-[.25rem] border border-input bg-background not-dark:bg-clip-padding shadow-xs/5 outline-none transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[3px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-disabled:opacity-64 dark:not-data-checked:bg-input/32",
        className,
      )}
      onClick={(e) => {
        if (disabled) return
        props.onClick?.(e)
        onCheckedChange?.(!isChecked)
      }}
      {...props}
    >
      <span
        data-slot="checkbox-indicator"
        className="absolute -inset-px items-center justify-center rounded-[.25rem] text-primary-foreground data-checked:bg-primary data-indeterminate:text-foreground flex"
        data-checked={isChecked ? '' : undefined}
        data-unchecked={!isChecked ? '' : undefined}
        data-indeterminate={indeterminate ? '' : undefined}
        aria-hidden
      >
        {(isChecked || indeterminate) && (
          <svg
            aria-hidden="true"
            className="size-3.5 sm:size-3"
            fill="none"
            height="24"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            {indeterminate ? <path d="M5.252 12h13.496" /> : <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />}
          </svg>
        )}
      </span>
    </button>
  )
}
