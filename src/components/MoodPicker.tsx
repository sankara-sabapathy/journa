import { useId } from 'react'
import { FaceAngry, FaceGrinning, FaceNeutral, FaceSlightlyFrowning, FaceSlightlySmiling } from 'lucide-react'
import type { Mood } from '../db/types'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n/en'

interface MoodOption {
  value: Mood
  Icon: typeof FaceAngry
  key: MessageKey
}

export const MOODS: readonly MoodOption[] = [
  { value: 1, Icon: FaceAngry, key: 'mood.rough' },
  { value: 2, Icon: FaceSlightlyFrowning, key: 'mood.low' },
  { value: 3, Icon: FaceNeutral, key: 'mood.ok' },
  { value: 4, Icon: FaceSlightlySmiling, key: 'mood.good' },
  { value: 5, Icon: FaceGrinning, key: 'mood.great' },
]

export function moodOption(value: Mood): MoodOption {
  return MOODS.find((m) => m.value === value) ?? MOODS[2]
}

function MoodButton({
  Icon,
  label,
  selected,
  onToggle,
}: {
  Icon: typeof FaceAngry
  label: string
  selected: boolean
  onToggle: () => void
}) {
  const tipId = useId()
  return (
    <>
      <button
        type="button"
        className="mood"
        aria-pressed={selected}
        aria-label={label}
        aria-describedby={tipId}
        data-tip={label}
        onClick={onToggle}
      >
        <Icon aria-hidden size={20} />
      </button>
      <span role="tooltip" id={tipId} className="sr-only">
        {label}
      </span>
    </>
  )
}

/** One-tap mood check-in for a journal entry. Tapping the pressed face clears it. */
export function MoodPicker({ mood, onChange }: { mood: Mood | null; onChange: (m: Mood | null) => void }) {
  const { t } = useI18n()
  return (
    <div className="mood-picker" role="group" aria-label={t('today.mood')}>
      {MOODS.map(({ value, Icon, key }) => (
        <MoodButton
          key={value}
          Icon={Icon}
          label={t(key)}
          selected={mood === value}
          onToggle={() => onChange(mood === value ? null : value)}
        />
      ))}
    </div>
  )
}

/** Read-only mood, for lists and the entry read view. */
export function MoodMark({ mood }: { mood: Mood | null | undefined }) {
  const { t } = useI18n()
  if (!mood) return null
  const { Icon, key } = moodOption(mood)
  return (
    <span className="mood-mark">
      <Icon aria-hidden size={18} />
      <span className="sr-only">{t(key)}</span>
    </span>
  )
}

/** Read-only mood with its name in text, for the entry read view. */
export function MoodLabel({ mood }: { mood: Mood | null | undefined }) {
  const { t } = useI18n()
  if (!mood) return null
  const { Icon, key } = moodOption(mood)
  return (
    <span className="mood-label">
      <Icon aria-hidden size={18} />
      {t(key)}
    </span>
  )
}
