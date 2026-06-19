# pi-peon-ping-win

> **Fork notice:** This is a fork of [`pi-peon-ping`](https://github.com/joshuadavidthomas/pi-peon-ping) that adds **native Windows** support. The upstream package only handles macOS, Linux, and WSL; on native Windows its `playSound` switch silently falls through and no sound plays. This fork adds:
>
> - A `"win"` platform branch with a **three-tier audio fallback**: `ffplay` → `mpv` → `winmm.dll PlaySound` (via PowerShell P/Invoke). The first two support volume control; the last needs no external deps.
> - **`pwsh` preference** — uses PowerShell 7 if installed, falling back to Windows PowerShell.
> - **`playback_wait_seconds` config** — makes the post-`Play()` sleep configurable (default 2s vs upstream's hardcoded 3s), reducing lingering processes during rapid events.
> - **Default `volume` raised to `1.0`** (upstream `0.5`) — peon-ping is an alert sound, and at 0.5 it's easy to miss on Windows.
> - **Why not WPF `MediaPlayer`?** Upstream WSL uses `System.Windows.Media.MediaPlayer`, but it silently fails to render audio in `-NonInteractive -Command` background processes (no WPF Dispatcher message pump). This fork replaces it on Windows.
> - **Custom WinForms popup** on Windows (multi-screen, icon + title + body, auto-dismiss). Upstream's corner-only Windows Toast needs a registered AUMID + Start Menu shortcut and is suppressed by Focus Assist; this fork bypasses all of that. Spawn uses `detached: false` — with `detached: true` Node creates the child via `CREATE_NEW_PROCESS_GROUP`, which breaks WinForms' desktop association (the PowerShell process runs but no window renders).
> - **Event-aware notification content.** Upstream's popup title/body are hardcoded per event; this fork mirrors the strategy of the [original peon-ping](https://github.com/PeonPing/peon-ping): title is `<project> · <status>` with `<project>` resolved via a priority chain (pi session name → git remote repo name → folder name), and body is event-specific (assistant's last response for `task.complete`, `<tool> failed` for `task.error`, etc.). See [Desktop notification content](#desktop-notification-content).
>
> Install `ffplay` for the best experience: `winget install Gyan.FFmpeg`.
>
> All credit for the original work goes to [joshuadavidthomas](https://github.com/joshuadavidthomas).

A [pi coding agent](https://github.com/earendil-works/pi) extension for [peon-ping](https://github.com/PeonPing/peon-ping) sound notifications. Plays themed audio clips on lifecycle events using [OpenPeon](https://github.com/PeonPing/og-packs) sound packs (Warcraft III Peon, GLaDOS, Duke Nukem, StarCraft, and more).

## Requirements

- [pi](https://github.com/earendil-works/pi) >= 0.74.0
- An audio player on your system (see [Platform support](#platform-support))

## Features

| Event | Sound category | Desktop notification |
|-------|---------------|----------------------|
| Session start | `session.start` — "Ready to work?" | — |
| Agent starts working | `task.acknowledge` — "Work, work." | — |
| Tool error | `task.error` — error sound | `error` — body names the failing tool |
| Rapid prompts (≥3 in 10s) | `user.spam` — annoyed voice line | — |
| Agent finishes | `task.complete` — completion sound | `done` — body shows the assistant's last response (truncated) |
| Context compaction | `resource.limit` — limit sound | `compacting` — body: "Context compacting" |

See [Desktop notification content](#desktop-notification-content) below for how title/body are built.

- `/peon` opens a settings panel to toggle sounds, switch packs, adjust volume, and enable/disable individual categories
- `/peon install` downloads the default 10 packs from the [peon-ping registry](https://peonping.github.io/registry/)
- Browsing packs previews each one as you scroll

## Installation

Install as a [pi package](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) globally:

```bash
pi install npm:pi-peon-ping
```

For project-local installation:

```bash
pi install -l npm:pi-peon-ping
```

To try without installing:

```bash
pi -e npm:pi-peon-ping
```

You can also use the repository URL:

```bash
pi install git:github.com/joshuadavidthomas/pi-peon-ping
# or the full URL
pi install https://github.com/joshuadavidthomas/pi-peon-ping
```

For manual installation:

```bash
git clone https://github.com/joshuadavidthomas/pi-peon-ping ~/.pi/agent/extensions/pi-peon-ping
```

## Usage

On first run, the extension will prompt you to install sound packs. You can also install them manually:

```
/peon install
```

Open the settings panel:

```
/peon
```

### Installing specific packs

`/peon install` without arguments installs the 10 default packs. To install one or more specific packs, pass their names:

```
/peon install peon_ru
/peon install peon_ru glados duke_nukem
```

Pack names come from the public [peon-ping registry](https://peonping.github.io/registry/index.json). Browse all 46+ packs (Warcraft, StarCraft, Portal, Red Alert, Dota 2, etc.) with previews at **[openpeon.com/packs](https://openpeon.com/packs)** — each pack's `name` field is what you pass to `/peon install`.

### Switching packs at runtime

Open `/peon` settings panel to:
- Switch the active pack
- Adjust volume
- Enable/disable individual sound categories (session start, task complete, etc.)
- Browse packs with audio preview as you scroll

## Platform support

| Platform | Player |
|----------|--------|
| macOS | `afplay` (built-in) |
| Linux | `pw-play`, `paplay`, `ffplay`, `mpv`, `play`, or `aplay` (first found) |
| WSL | PowerShell `MediaPlayer` |
| **Windows (native)** ⭐ | `ffplay` (recommended, `winget install Gyan.FFmpeg`) → `mpv` → `winmm.dll PlaySound` fallback (no volume control) |

## Desktop notification content

The popup title and body are generated per event, mirroring the strategy of the [original peon-ping](https://github.com/PeonPing/peon-ping):

**Title format:** `<project> · <status>`

`<project>` resolves via a priority chain:

1. pi session name (`pi.getSessionName()`)
2. git remote repo name (`git remote get-url origin`, last path segment minus `.git`)
3. `basename(cwd)` — folder name fallback

`<status>` labels the event type:

| Status | Event |
|--------|-------|
| `done` | `agent_end` (task complete) |
| `error` | `tool_execution_end` with `isError` |
| `compacting` | `session_before_compact` |

**Body** is event-specific:

- `done` → assistant's last text response, truncated to ~120 chars at a word boundary (so the popup tells you what actually happened, not just "Task complete")
- `error` → `<toolName> failed`
- `compacting` → `Context compacting`

On Windows the popup is a custom WinForms window (multi-screen, peon icon, auto-dismiss), not a Windows Toast — see the Fork notice at the top for rationale.

## Remote development

The extension auto-detects SSH sessions, devcontainers, and Codespaces, and routes audio through the peon-ping relay running on your local machine. See the [peon-ping remote development docs](https://github.com/PeonPing/peon-ping#remote-development-ssh--devcontainers--codespaces) for relay setup. The relay mode can be configured in `/peon` settings (`auto` / `local` / `relay`).

## Config and data

The extension also picks up existing packs from `~/.claude/hooks/peon-ping/` if you have a Claude Code installation. Config and state are stored in `~/.config/peon-ping/`.

### Configuration options

Edit `~/.config/peon-ping/config.json` or use the `/peon` settings panel:

| Option | Default | Description |
|--------|---------|-------------|
| `default_pack` | `"peon"` | Active sound pack |
| `volume` | `1.0` | Sound volume (0.0–1.0). Fork default is 1.0 (upstream uses 0.5). |
| `enabled` | `true` | Master on/off switch |
| `desktop_notifications` | `true` | Show system notifications on task complete |
| `silent_window_seconds` | `0` | Suppress `task.complete` for tasks shorter than N seconds |
| `annoyed_threshold` | `3` | Number of rapid prompts to trigger spam detection |
| `annoyed_window_seconds` | `10` | Time window for spam detection |
| `relay_mode` | `"auto"` | Relay mode: `"auto"`, `"local"`, or `"relay"` |
| `playback_wait_seconds` | `2` | **(Fork-added)** Seconds the PowerShell MediaPlayer process stays alive after `Play()`. Lowering this reduces lingering processes when sounds trigger rapidly. Upstream hardcodes `3`. |

> **Note:** If you have an existing config with `active_pack`, it will be automatically migrated to `default_pack` on next load.

## Development

```bash
npm install           # Install dependencies
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run typecheck     # Type check
```

To test the extension locally without conflicting with a globally installed copy:

```bash
pi -ne -e ./src/index.ts
```

`-ne` disables extension auto-discovery, `-e` loads only the local source.

## License

pi-peon-ping is licensed under the MIT license. See the [`LICENSE`](LICENSE) file for more information.
