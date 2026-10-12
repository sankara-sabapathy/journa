import { useId, type ReactElement, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip'

type Props = Omit<ButtonProps, 'children' | 'aria-label'> & {
  /** Accessible name, also shown as the tooltip. */
  label: string
  children: ReactNode
  /** Render as a link instead of a button. */
  href?: string
}

/** Icon-only control with a coss tooltip that names it on hover and keyboard focus. */
export function IconButton({ label, children, href, variant = 'ghost', size = 'icon-xl', ...props }: Props): ReactElement {
  const tipId = useId()
  const button = (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      data-ui-tooltip={tipId}
      render={href ? <a href={href} /> : undefined}
      {...props}
    >
      {children}
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup id={tipId} role="tooltip" portalProps={{ keepMounted: true }}>
        {label}
      </TooltipPopup>
    </Tooltip>
  )
}
