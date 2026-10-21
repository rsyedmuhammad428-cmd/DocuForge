# Phase 1 - Foundation

**Status:** built. `npm run typecheck`, `npm run lint`, `npm test` (17 tests) and `npm run build`
pass. Not yet verified on Windows: opening the window with `npm run dev` and building the installer
with `npm run dist`.

## Goal

A secure, themed desktop shell that every later phase plugs into. No document tool works yet, and
every unfinished feature says "In development" in the app.

## How it works

1. **Main process** (`electron/main.ts`) creates the window. It enables context isolation and the
   sandbox, disables Node in the page, blocks navigation and pop-ups, denies permission prompts, and
   allows only one running instance.
2. **Preload** (`electron/preload.ts`) exposes `window.docuforge` with three methods:
   `app.getInfo`, `settings.get`, `settings.update`. It is one self-contained file because it runs
   in a sandbox.
3. **IPC** (`electron/ipc/register.ts`) registers each channel through one helper that checks the
   sender is the app's own page, validates the payload with zod, and returns a typed `IpcResult`
   (`ok: true` with data, or `ok: false` with an error code and message). Internal errors are logged
   and never sent to the page.
4. **Settings** (`electron/services/settings-store.ts`) keeps `settings.json` in the user data
   folder. Invalid or missing values fall back to defaults. Writes go to a temp file, then rename.
5. **Theme** works through Electron's `nativeTheme`. The CSS follows `prefers-color-scheme`, so the
   right theme shows on the first frame.
6. **UI** (`src/`) is React with a sidebar, top bar, status bar, Home, Settings, and a placeholder
   page for each unfinished feature. `src/features/registry.ts` is the single list of pages and
   their status (`available` or `in-development`).

## Key files

| File | Role |
|---|---|
| `shared/ipc.ts` | Channel names, `IpcResult`, and the `DocuForgeApi` interface shared by both sides |
| `shared/settings.ts` | Settings schema, defaults, and `parseSettings` |
| `electron/ipc/register.ts` | The one place IPC handlers are registered |
| `electron/security.ts` | "Is this URL our own page?" check |
| `src/lib/bridge.ts` | Typed wrapper around `window.docuforge` for the UI |
| `src/features/registry.ts` | Navigation and feature status |

## Handed to Phase 2

- The IPC pattern: add a channel name in `shared/ipc.ts`, extend `DocuForgeApi`, expose it in the
  preload, and register it with `registerHandler`. Every new channel gets the sender check and
  validation automatically.
- `SettingsStore` and `SettingsSchema`: Phase 2 adds fields such as default output folder here,
  each with a `.catch()` default.
- The feature registry: flipping a feature to `available` is how it stops showing the placeholder.
  **Important:** `src/app/App.tsx` only creates placeholder routes for `in-development` items. When
  a feature becomes `available`, add its route to `App.tsx`, or the link will redirect to Home.
- `electron/services/` as the home for new main-process services.

## Done when

- [x] Strict typecheck, lint, and tests pass.
- [x] UI and Electron code build.
- [ ] `npm run dev` opens the window with a correct light, dark, and system theme (needs a Windows
      check).
- [ ] `npm run dist` produces an installer that installs and launches (needs a Windows check).

## Known limitations

- Default Electron icon; installer is unsigned.
- The production Content Security Policy allows inline styles (scripts stay locked to bundled files).
- Changes under `electron/` or `shared/` need a restart of `npm run dev`.
