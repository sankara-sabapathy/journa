// Generates Journa's icon SVGs and PNGs: a kolam knot (rice-flour line around pulli dots) on kaavi red.
// Usage: npm run icons
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'

const KAAVI = '#8a3324'
const RICE = '#fbf8f2'
const TURMERIC = '#e0a526'

function loop(cx, cy, r) {
  const k = r * 0.552
  return `M${cx} ${cy - r}C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy}C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r}C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy}C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r}Z`
}

/** `scale` shrinks the motif toward the centre (maskable icons need an 80% safe zone). */
function svg({ scale = 1, radius = 112 } = {}) {
  const c = 256
  const d = 92 * scale
  const outer = [
    [c, c - d],
    [c + d, c],
    [c, c + d],
    [c - d, c],
  ]
  const lines = [loop(c, c, 44 * scale), ...outer.map(([x, y]) => loop(x, y, 34 * scale))]
  // joins: from the centre loop out to each petal
  const joins = outer.map(([x, y]) => {
    const dx = Math.sign(x - c)
    const dy = Math.sign(y - c)
    const a = [c + dx * 44 * scale, c + dy * 44 * scale]
    const b = [x - dx * 34 * scale, y - dy * 34 * scale]
    return `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`
  })
  const dots = [[c, c], ...outer]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="${radius}" fill="${KAAVI}"/>
<g fill="none" stroke="${RICE}" stroke-width="${14 * scale}" stroke-linecap="round" stroke-linejoin="round">
${[...lines, ...joins].map((p) => `<path d="${p}"/>`).join('\n')}
</g>
${dots.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${(i === 0 ? 13 : 10) * scale}" fill="${i === 0 ? TURMERIC : RICE}"/>`).join('\n')}
</svg>`
}

const rounded = svg()
const square = svg({ radius: 0 })
const maskable = svg({ radius: 0, scale: 0.78 })

writeFileSync('public/favicon.svg', rounded)
const out = [
  ['public/pwa-192.png', square, 192],
  ['public/pwa-512.png', square, 512],
  ['public/pwa-maskable-512.png', maskable, 512],
  ['public/apple-touch-icon.png', square, 180],
]
for (const [file, src, size] of out) {
  await sharp(Buffer.from(src)).resize(size, size).png().toFile(file)
  console.log('wrote', file)
}
