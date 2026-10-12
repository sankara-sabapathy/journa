import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/** coss checkbox at a 24px touch size, tinted leaf green when done. */
export function TaskCheck({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  className?: string
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => onChange(Boolean(v))}
      aria-label={label}
      className={cn('task-check size-6 rounded-md sm:size-6', className)}
    />
  )
}
