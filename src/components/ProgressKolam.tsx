/** Checklist progress drawn the kolam way: dots, with done ones joined by a line. */
export function ProgressKolam({ done, total }: { done: number; total: number }) {
  const n = Math.min(total, 8)
  if (n === 0) return null
  const on = Math.round((done / total) * n)
  const gap = 12
  const w = (n - 1) * gap + 8
  let d = ''
  for (let i = 1; i < on; i++) {
    const x1 = 4 + (i - 1) * gap
    const x2 = x1 + gap
    d += `M${x1} 8C${x1 + 4} ${i % 2 ? 1 : 15} ${x2 - 4} ${i % 2 ? 1 : 15} ${x2} 8`
  }
  return (
    <svg className="progress-kolam" width={w} height={16} viewBox={`0 0 ${w} 16`} aria-hidden>
      {d && <path d={d} />}
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={4 + i * gap} cy={8} r={3} className={i < on ? 'on' : undefined} />
      ))}
    </svg>
  )
}
