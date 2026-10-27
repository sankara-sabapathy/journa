import { useId, type ReactElement, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'

type Props = Omit<ButtonProps, 'children' | 'aria-label'> & {
  /** Accessible name, also shown as a CSS tooltip on hover/focus. */
  label: string
  children: ReactNode
  /** Render as a link instead of a button. */
  href?: string
  /** Set false to keep the accessible name but skip the visual tooltip. */
  tooltip?: boolean
}

/** Icon-only control with an accessible name and a CSS-only tooltip. */
export function IconButton({
  label,
  children,
  href,
  tooltip = true,
  variant = 'ghost',
  size = 'icon-xl',
  ...props
}: Props): ReactElement {
  const tipId = useId()
  return (
    <>
      <Button
        variant={variant}
        size={size}
        aria-label={label}
        aria-describedby={tooltip ? tipId : undefined}
        data-tip={tooltip ? label : undefined}
        render={href ? <a href={href} /> : undefined}
        {...props}
      >
        {children}
      </Button>
      {tooltip && (
        <span role="tooltip" id={tipId} className="sr-only">
          {label}
        </span>
      )}
    </>
  )
}
