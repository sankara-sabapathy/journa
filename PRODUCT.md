# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript, installable PWA (vite-plugin-pwa / Workbox). Local data in IndexedDB via Dexie. Optional AWS CDK serverless backend (Cognito, HTTP API, Lambda, DynamoDB, S3) for opt-in sign-in and multi-device sync. Deployed as two stacks: frontend hosting and backend. No backend required for core use.

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
- Signed-in cloud sync is end-to-end encrypted by device keys and works only after the user opts in; the app remains fully offline-capable otherwise.

## Capabilities and Constraints

- Entry types: note, task (done, due date, priority), checklist (items), journal (one per day).
- Journal days carry an optional one-tap mood (rough → great). A mood-only day still counts as written in the kolam; the mood travels with the entry through sync, JSON backups and the Markdown export.
- Tags, pinning, full-text search, Trash with restore.
- Export: lossless JSON and a Markdown zip. Import: validated, with merge (newest wins) or replace.
- Automatic folder backup uses the File System Access API: Chromium desktop only. Other browsers get manual export plus backup reminders.
- Browser storage can be evicted: request persistent storage, show backup status, encourage install on iOS.
- Optional passphrase encryption of backups (WebCrypto).
- **i18n from day 1:** English (default), Tamil, Hindi. All UI strings go through the i18n layer; dates and numbers use `Intl`. Tamil and Hindi translations need review by a native speaker.
- **No analytics, no tracking, no third-party requests** (no CDN fonts or scripts). System fonts only, so Tamil and Devanagari render with the device's fonts.
- **Optional, opt-in sign-in.** It must stay optional: every existing feature (writing, search, import/export, folder backups) keeps working signed out, and nothing is uploaded unless the user signs in and opts in. Sign-in enables email sign-in, cross-device sync, and optional cloud backups. Cloud sync is end-to-end encrypted with a per-user data key: each device holds its own keypair, new devices are approved from a trusted device or joined with a recovery key, and Journa cannot read, decrypt, or recover user content. The backup passphrase only encrypts local export files, never cloud sync. Before syncing conflicting edits made on different devices, prompt with a diff and ask which version to keep (or save the other for later).
- **Account creation.** Sign-up takes an email and a password; Cognito emails a confirmation code, so an account always belongs to an address the user controls. The password is kept in memory only until the account is confirmed, then discarded. Passkey sign-in is not wired up yet, so no passkey button is shown.
- **No raw errors.** Every failure — Cognito, the sync API, the network, a crash — is turned into a sentence from the message catalogue before it reaches the screen. The user never sees an error code, a stack trace or a backend message.
- Undecided: cloud-API backup targets (Dropbox/Google Drive/OneDrive), attachments, reminders. Hosting is two separate CDK stacks: frontend hosting and backend.

## Brand Commitments

Name: Journa. No logo or other assets yet.

## Evidence on Hand

None. No users, testimonials, benchmarks or press. Do not invent any.

## Product Principles

1. **Never lose a word.** Saving is automatic and immediate; backups are visible and easy to verify.
2. **Private by construction.** Every core feature works without an account or network; sign-in, when it arrives, is opt-in; nothing is sent anywhere the user didn't choose; signed-in cloud data is encrypted on the device and Journa cannot read it.
3. **Capture first.** The fastest path is from opening the app to writing; organizing is optional.
4. **Light on the device.** Small, fast and readable on a cheap phone in any of the supported languages.

## Accessibility & Inclusion

WCAG 2.2 AA required: contrast, full keyboard use, screen-reader labels, visible focus, touch targets of at least 24px (44px preferred on phone). Respect `prefers-reduced-motion` and `prefers-color-scheme`. Layout and type must hold up with Tamil and Devanagari text, which run longer and taller than English.
