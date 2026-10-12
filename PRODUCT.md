# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript, installable PWA (vite-plugin-pwa / Workbox). Local data in IndexedDB via Dexie. No backend. Hosting undecided (local repo only for now).

## Users

Privacy-minded people who don't want an account or a cloud notes service holding their writing. They capture quickly on a phone during the day (a task, a checklist item, a line of journal) and write longer entries when they have a quiet moment. Most daily use happens on a phone with the app installed to the home screen; desktop is secondary.

## Product Purpose

Journa is one private place for notes, tasks, checklists and a daily journal. It works fully offline, can be installed as an app, and keeps the user's data safe through export/import and automatic backups to a folder the user chooses (for example inside their Google Drive, OneDrive or Dropbox sync folder). It succeeds when someone uses it every day without thinking about it and never loses an entry.

## Positioning

- **No account needed.** Everything works without signing in. Data never leaves the device except to backup locations the user picks.
- **One place for four kinds of writing.** Notes, tasks, checklists and the daily journal live together, not in separate apps.
- **Own your backups.** Backups are plain JSON (and Markdown export) files in the user's own drive folder, restorable anywhere.
- **Fast and lightweight.** Opens instantly, small bundle, works on low-end phones.
- **Free.** No paid tier; writing, import/export and backups stay free. The source is private (closed source, private repository).

## Operating Context

- Installed PWA on a phone for quick daily capture; a desktop browser (Chrome/Edge) for longer writing and for setting up automatic folder backups.
- Often offline or on a flaky connection; the app must never depend on the network.
- Backups land in a folder that a desktop sync client (Google Drive, OneDrive, Dropbox) uploads. Restore = import a backup file.

## Capabilities and Constraints

- Entry types: note, task (done, due date, priority), checklist (items), journal (one per day).
- Tags, pinning, full-text search, Trash with restore.
- Export: lossless JSON and a Markdown zip. Import: validated, with merge (newest wins) or replace.
- Automatic folder backup uses the File System Access API: Chromium desktop only. Other browsers get manual export plus backup reminders.
- Browser storage can be evicted: request persistent storage, show backup status, encourage install on iOS.
- Optional passphrase encryption of backups (WebCrypto).
- **i18n from day 1:** English (default), Tamil, Hindi. All UI strings go through the i18n layer; dates and numbers use `Intl`. Tamil and Hindi translations need review by a native speaker.
- **No analytics, no tracking, no third-party requests** (no CDN fonts or scripts). System fonts only, so Tamil and Devanagari render with the device's fonts.
- **Optional sign-in is planned.** It must stay optional: every existing feature (writing, search, import/export, folder backups) keeps working signed out, and nothing is uploaded unless the user signs in and opts in. What sign-in enables (e.g. sync across devices) is undecided.
- Undecided: cloud-API backup targets (Dropbox/Google Drive/OneDrive), hosting, attachments, reminders.

## Brand Commitments

Name: Journa. No logo or other assets yet.

## Evidence on Hand

None. No users, testimonials, benchmarks or press. Do not invent any.

## Product Principles

1. **Never lose a word.** Saving is automatic and immediate; backups are visible and easy to verify.
2. **Private by construction.** Every core feature works without an account or network; sign-in, when it arrives, is opt-in; nothing is sent anywhere the user didn't choose.
3. **Capture first.** The fastest path is from opening the app to writing; organizing is optional.
4. **Light on the device.** Small, fast and readable on a cheap phone in any of the supported languages.

## Accessibility & Inclusion

WCAG 2.2 AA required: contrast, full keyboard use, screen-reader labels, visible focus, touch targets of at least 24px (44px preferred on phone). Respect `prefers-reduced-motion` and `prefers-color-scheme`. Layout and type must hold up with Tamil and Devanagari text, which run longer and taller than English.
