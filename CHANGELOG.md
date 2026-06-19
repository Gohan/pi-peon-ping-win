# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project attempts to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
## [${version}]

### Added - for new features
### Changed - for changes in existing functionality
### Deprecated - for soon-to-be removed features
### Removed - for now removed features
### Fixed - for any bug fixes
### Security - in case of vulnerabilities

[${version}]: https://github.com/Gohan/pi-peon-ping-win/releases/tag/${tag}
-->

## [Unreleased]

### Changed

- Migrated pi package dependencies from `@mariozechner/*` to `@earendil-works/*` — the pi project renamed its packages and the old npm names are deprecated (`@mariozechner/pi-coding-agent` stays at 0.73.1 and no longer receives updates)
  - `package.json` peerDependencies: `@earendil-works/pi-coding-agent >=0.74.0`, `@earendil-works/pi-tui >=0.74.0` (covers every published `@earendil-works/*` release — all 21 versions from 0.74.0 to 0.79.7 expose the APIs we use: `getSessionName`, `BeforeAgentStartEvent.prompt`, `session_before_compact`, `keyHint`)
  - All TypeScript imports across `src/` updated accordingly
- Switched test framework from `bun:test` to [vitest](https://vitest.dev) — API-compatible (`describe`/`it`/`expect`/`vi.spyOn`/`vi.fn`). The project never actually used bun locally; `bun.lock` was inherited from upstream and `npm` + `package-lock.json` is the real workflow
- Switched CI (lint + test workflows) from `oven-sh/setup-bun` to `actions/setup-node` + `npm ci`, matching the local toolchain

### Removed

- Deleted `bun.lock` — stale, referenced the old `@mariozechner/*@0.54.0` versions and broke CI typecheck because the bundled `Keybindings` type no longer matched the upstream `EditorAction` shape
- Removed `@types/bun` devDependency, replaced with `@types/node`

### Fixed

- CI typecheck failure on `tui.select.cancel` — root cause was the stale `bun.lock` resolving to `@mariozechner/*@0.54.0` while local dev used 0.73.1; the migration above resolves it permanently

## [1.2.0] — 2026-06-19

### Added

- Three-row popup layout: **title / prompt / body** — the popup now echoes the user's current message (prefixed with `> `, markdown-quote style) between the project title and the assistant summary
- `before_agent_start` handler captures the user's prompt each turn and feeds it into the popup's prompt row on `agent_end` and `tool_execution_end`
- Form auto-sizes its height from content (no longer hardcoded); icon stays vertically centered on the whole text block
- Form widens 720 → 920, so each row fits ~36% more characters per line
- `NoActivateForm` subclass overrides `ShowWithoutActivation=true` so the popup no longer steals keyboard focus from the editor/terminal; `TopMost` still keeps it visually on top

### Changed

- All row heights are now measured by `TextRenderer.MeasureText`, not hardcoded — `AutoEllipsis` only renders the ellipsis glyph when `Size.Height >=` the `EndEllipsis` probe height; under-sizing silently drops the entire text (the prompt row was completely blank until the height was measured rather than guessed)
- `Add-Type -ReferencedAssemblies System.Windows.Forms` on the `NoActivateForm` C# subclass — required for the compiler to resolve the `Form` base class when the script runs via `-Command` (without it the popup silently fails to appear)

## [1.1.0] — 2026-06-18

### Added

- Event-aware notification content: title is now `<project> · <status>` (status: `done` / `error` / `compacting`) instead of the old hardcoded `pi · <folder>` + `Task complete`
- Project name priority chain: pi session name → git remote repo name → `basename(cwd)`
- Body pulls the assistant's last text response (truncated to ~120 chars at a word boundary) for `agent_end`; real tool error text formatted as `[<toolName>]: <message>` for `tool_execution_end`; fixed `Context compacting` body for `session_before_compact`
- Status-colored popup background, mirroring upstream peon-ping's `notify.sh` WinForms renderer:
  - `done` → blue `(30, 80, 180)`
  - `error` → red `(180, 0, 0)`
  - `compacting` → yellow `(200, 160, 0)`
- New event coverage: tool failures and context compaction now trigger desktop notifications (previously only `agent_end` did)

### Fixed

- WinForms popup never rendered on Windows: root cause was `child_process.spawn` using `detached: true`, which on Windows creates the child via `CREATE_NEW_PROCESS_GROUP` and breaks the desktop association needed by `Application.Run()`. Switched to `detached: false` on the Windows path (other platforms keep `detached: true` so short-lived notifiers like `osascript`/`notify-send` survive parent exit). Sound playback wasn't affected because `ffplay`/`mpv` are short-lived native media processes that don't need the message pump.
- Chinese characters clipped at the top of the body label: hardcoded `'Segoe UI'` font lacks CJK glyphs, forcing a font-link fallback to `Microsoft YaHei UI` whose ascent metrics differ. Switched to `SystemFonts.DefaultFont.FontFamily` so the system default UI font is used consistently (Flow-Launcher/Flow.Launcher#4373 has the same root cause)
- CI publish workflow now reliably publishes via npm OIDC Trusted Publishing: dropped `setup-node`'s `registry-url` (it injects an empty `NODE_AUTH_TOKEN` that suppresses OIDC), upgraded npm to ≥11.5.1 in the job (Trusted Publishing requires it; Node 22 LTS ships npm 10.x), and added `--provenance` to `npm publish`

## [1.0.0]

### Added

- Forked from [`pi-peon-ping`](https://github.com/joshuadavidthomas/pi-peon-ping) with **native Windows** support
- `"win"` platform branch with a three-tier audio fallback: `ffplay` → `mpv` → `winmm.dll PlaySound` (via PowerShell P/Invoke). The first two support volume control; the last needs no external deps
- `pwsh` preference — uses PowerShell 7 if installed, falling back to Windows PowerShell
- `playback_wait_seconds` config — makes the post-`Play()` sleep configurable (default 2s vs upstream's hardcoded 3s), reducing lingering processes during rapid events
- Default `volume` raised to `1.0` (upstream `0.5`) — peon-ping is an alert sound, and at 0.5 it's easy to miss on Windows
- Custom WinForms popup on Windows (multi-screen, icon + title + body, auto-dismiss), bypassing Windows Toast entirely — no AUMID registration, no Focus Assist suppression, more visually prominent

## [0.2.0]

### Added

- Added `task.error` sound on tool execution failures — listens for `tool_execution_end` events where `isError` is true
- Added [remote relay](https://github.com/PeonPing/peon-ping#remote-development-ssh--devcontainers--codespaces) support — sounds play on your local machine when pi runs over SSH, in a devcontainer, or in Codespaces
- Added `relay_mode` setting to `/peon` settings panel (`auto` / `local` / `relay`)
- Added `silent_window_seconds` config — suppress `task.complete` for tasks shorter than N seconds (default `0`)

### Changed

- Renamed `active_pack` config field to `default_pack` to match upstream peon-ping — existing configs are automatically migrated

## [0.1.0]

### Added

- Added pi extension for peon-ping sound notifications on lifecycle events (session start, task acknowledge, task complete, rapid prompt spam)
- Added `/peon` command with settings panel for toggling sounds, switching packs, adjusting volume, and enabling/disabling individual categories
- Added `/peon install` command to download sound packs from the peon-ping registry
- Added cross-platform audio playback (macOS `afplay`, Linux `pw-play`/`paplay`/`ffplay`/`mpv`/`play`/`aplay`, WSL PowerShell `MediaPlayer`)
- Added desktop notifications via OSC 777 on task completion
- Added pack preview when browsing packs in the settings panel
- Added spam detection (annoyed voice lines on ≥3 rapid prompts within 10s)
- Added legacy pack support from `~/.claude/hooks/peon-ping/`

[unreleased]: https://github.com/Gohan/pi-peon-ping-win/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Gohan/pi-peon-ping-win/releases/tag/v1.2.0
[1.1.0]: https://github.com/Gohan/pi-peon-ping-win/releases/tag/v1.1.0
[1.0.0]: https://github.com/Gohan/pi-peon-ping-win/releases/tag/v1.0.0
[0.2.0]: https://github.com/joshuadavidthomas/pi-peon-ping/releases/tag/v0.2.0
[0.1.0]: https://github.com/joshuadavidthomas/pi-peon-ping/releases/tag/v0.1.0
