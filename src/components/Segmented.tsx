import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** Single-choice switch on coss ToggleGroup; always keeps one option selected. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v) => {
        const next = (v as T[])[0]
        if (next) onChange(next)
      }}
      className={className ? `segmented-group ${className}` : 'segmented-group'}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="flex-1 px-3">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
