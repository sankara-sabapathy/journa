// Runs lintapple over every Journa screen, viewport and colour scheme.
// Uses the locally installed Edge/Chrome (no Playwright browser download).
// Usage: npm run lint:ui [-- http://localhost:5173/]
import { checkPage } from 'lintapple'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:5173/'
const policy = JSON.parse(readFileSync('ui-policy.json', 'utf8'))
const routes = ['#/today', '#/notes', '#/tasks', '#/lists', '#/search', '#/settings', '#/trash']
const channel = process.env.LINT_UI_CHANNEL ?? 'msedge'

const browser = await chromium.launch({ channel }).catch(() => chromium.launch({ channel: 'chrome' }))
let total = 0
try {
  for (const viewport of policy.viewports) {
    for (const colorScheme of policy.colorSchemes) {
      const ctx = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      for (const route of routes) {
        await page.goto(base + route)
        await page.waitForSelector('main')
        await page.waitForTimeout(300)
        const report = await checkPage(page, { ...policy, viewports: [viewport], colorSchemes: [colorScheme] })
        for (const f of report.findings) {
          total++
          console.log(`[${viewport.width} ${colorScheme} ${route}] ${f.rule}: ${f.selector}\n  ${f.message}\n  Fix: ${f.fix}`)
        }
      }
      await ctx.close()
    }
  }
  // Tamil and Hindi run longer than English: check the phone layout in each.
  for (const locale of ['ta', 'hi']) {
    const viewport = policy.viewports[0]
    const ctx = await browser.newContext({ viewport, colorScheme: 'light', reducedMotion: 'reduce' })
    await ctx.addInitScript((l) => localStorage.setItem('journa.locale', l), locale)
    const page = await ctx.newPage()
    for (const route of routes) {
      await page.goto(base + route)
      await page.waitForSelector('main')
      await page.waitForTimeout(300)
      const report = await checkPage(page, { ...policy, viewports: [viewport], colorSchemes: ['light'] })
      for (const f of report.findings) {
        total++
        console.log(`[${viewport.width} ${locale} ${route}] ${f.rule}: ${f.selector}
  ${f.message}
  Fix: ${f.fix}`)
      }
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(total ? `\n${total} finding(s).` : 'lintapple: no findings.')
process.exit(total ? 1 : 0)
