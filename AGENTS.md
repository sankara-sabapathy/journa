# AGENTS.md

Guides AI agents working in this repo. Product context lives in `PRODUCT.md`, the visual world in `DESIGN.md`, setup and commands in `README.md`.

## Principles

- Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout.
- Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything.

## Workflow

- Route every string through `t()`; Tamil and Hindi must keep the same keys and variables.
- Verify with `npm run typecheck`, `npm test`, `npm run build`, and `npm run lint:ui` (needs the dev server running).
- Keep the app offline-first, dependency-light, and free of tracking or third-party requests.
