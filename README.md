# Journa

Private notes, tasks, checklists and a daily journal in one installable web app. Works fully offline. No account, no server, no tracking.

- **Today**: write the day's journal entry; the month is drawn as a kolam, with each day you wrote looped into one line.
- **Notes, tasks, lists**: Markdown notes with tags and pinning; tasks with due dates and priority; checklists.
- **Search** across everything, in English, Tamil or Hindi. **Trash** with restore.
- **Backups you own**:
  - Export a lossless `.json` backup or a Markdown `.zip`, and import with merge or replace.
  - **Automatic backups** to a folder you pick (Chrome/Edge on desktop). Pick a folder inside your Google Drive, OneDrive or Dropbox sync folder and their app uploads every backup.
  - Optional passphrase encryption (AES-GCM).
- **Installable PWA** with an offline-first service worker; asks the browser to keep its storage persistent.

## Develop

```bash
npm install
npm run dev -- --host   # http://localhost:5173 and your LAN address
npm test                # unit tests (Vitest + fake-indexeddb)
npm run build           # typecheck + production build with service worker
npm run lint:ui         # lintapple across every screen (needs the dev server running; uses installed Edge/Chrome)
npm run icons           # regenerate icons from scripts/icon.mjs
```

Phones can only install the app or use it offline over HTTPS (or `localhost`); plain `http://192.168…` previews work but don't install.

## Stack

Vite, React, TypeScript, Dexie (IndexedDB), vite-plugin-pwa (Workbox), coss ui on Base UI + Tailwind v4, lucide icons, zod, fflate.

Design system: [DESIGN.md](DESIGN.md). Product context: [PRODUCT.md](PRODUCT.md).

## Translations

English, Tamil and Hindi live in `src/i18n/`. The Tamil and Hindi strings were machine-drafted and need review by native speakers.

## License

MIT
