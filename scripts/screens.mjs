// Captures review screenshots of the main screens into .impeccable/review/.
// Usage: node scripts/screens.mjs [base-url]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5173/'
const out = '.impeccable/review'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }))
const shots = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, scheme: 'light', route: '#/today' },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, scheme: 'dark', route: '#/today' },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, scheme: 'light', route: '#/today' },
  { name: 'mobile-tasks', viewport: { width: 390, height: 844 }, scheme: 'light', route: '#/tasks' },
  { name: 'mobile-settings', viewport: { width: 390, height: 844 }, scheme: 'light', route: '#/settings' },
  { name: 'mobile-ta', viewport: { width: 390, height: 844 }, scheme: 'light', route: '#/today', locale: 'ta' },
]
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, colorScheme: s.scheme, reducedMotion: 'reduce', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(base)
  // Seed demo content so the screens show real states (labelled demo data, local to this browser profile).
  await page.evaluate(async (locale) => {
    localStorage.setItem('journa.locale', locale)
    const { repo } = await import('/src/db/repo.ts')
    const { addDays, toISODate } = await import('/src/db/date.ts')
    if ((await repo.list()).length) return
    const today = toISODate()
    const texts = ['Rain all morning. Finished the first draft of the budget sheet and walked to the market after it cleared.', 'Long call with Amma.', 'Quiet day.', 'Started reading again.']
    for (const off of [-11, -10, -9, -7, -6, -5, -4, -2, -1]) {
      const e = await repo.ensureJournal(addDays(today, off))
      await repo.update(e.id, { body: texts[Math.abs(off) % 4] })
    }
    await repo.create({ type: 'task', title: 'Pay electricity bill', due: today, priority: 1 })
    await repo.create({ type: 'task', title: 'Call Amma about Sunday', due: addDays(today, -1) })
    await repo.create({ type: 'task', title: 'Renew bus pass', due: addDays(today, 3) })
    await repo.create({ type: 'checklist', title: 'Groceries', items: [{ id: 'a', text: 'Tomatoes', done: true }, { id: 'b', text: 'Rice', done: true }, { id: 'c', text: 'Curd', done: true }, { id: 'd', text: 'Coriander', done: false }] })
    await repo.create({ type: 'note', title: "Wi-Fi setup for Appa's phone", body: 'Router is in the hall.', tags: ['home'], pinned: 1 })
  }, s.locale ?? 'en')
  await page.goto(base + s.route)
  await page.reload()
  await page.waitForSelector('main')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: true })
  console.log('wrote', `${out}/${s.name}.png`)
  await ctx.close()
}
await browser.close()
