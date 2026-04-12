# Skill: macOS App Development

## Overview

`tonero-macos` is a **Tauri 2.0** app with a React/Vite frontend and a Rust backend.
It runs as a macOS menu bar agent that hooks keyboard events for in-place text rewriting.

## Requirements

- Rust toolchain — install from https://rustup.rs (`rustup` + `cargo`)
- Node.js 18+
- macOS 13+
- Accessibility permission (for the global keyboard hook)

## Local Development (Hot Reload)

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-macos
npm run dev      # alias for: npx tauri dev
```

Starts both the Vite dev server (React) and the Tauri Rust backend with hot reload.

---

## Fast Iteration: Debug Build + Reinstall

After Rust code changes, use `redeploy.sh` for the fastest test cycle:

```bash
# Step 1 — Build debug binary
cd /Users/antonlebedintsev/Documents/git/mine/tonero-macos
npx tauri build --debug

# Step 2 — Stop old app, reset Accessibility TCC, copy .app, launch
bash scripts/redeploy.sh
```

After launch: **System Settings → Privacy & Security → Accessibility → toggle Tonero ON**, then test.

`redeploy.sh` does:
1. `pkill tonero-macos`
2. `tccutil reset Accessibility app.tonero.macos`
3. Copy `src-tauri/target/debug/bundle/macos/Tonero.app` → `/Applications/Tonero.app`
4. Clear `/tmp/tonero_*.log`
5. `open /Applications/Tonero.app`

---

## Full Clean Reinstall

```bash
bash scripts/reinstall.sh
```

Does: debug build → full uninstall (TCC + keychain reset) → fresh install → launch.
Use this when `redeploy.sh` isn't enough (e.g., permission state is stuck).

---

## Release Packaging

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-macos

# Build current version from tauri.conf.json
bash scripts/package.sh

# Or override version
bash scripts/package.sh --version 1.2.3
```

Output at `dist/`:
- `Tonero-<version>-<arch>.dmg` — double-click installer
- `Tonero-<version>-<arch>.dmg.sha256`

---

## Uninstall

```bash
bash scripts/uninstall.sh
```

Removes `/Applications/Tonero.app`, resets Accessibility TCC, clears keychain entries.

---

## Key Paths

| Path | Description |
|---|---|
| `src/` | React frontend (Vite) |
| `src-tauri/` | Rust backend |
| `src-tauri/tauri.conf.json` | App config, `"version"`, window settings |
| `src-tauri/Cargo.toml` | Rust version + deps |
| `src-tauri/target/debug/bundle/macos/Tonero.app` | Debug build output |
| `src-tauri/target/release/bundle/macos/Tonero.app` | Release build output |
| `src-tauri/target/release/bundle/dmg/` | DMG from release build |
| `dist/` | Final packaged DMG for distribution |
| `scripts/` | Build/install helper scripts |

- **Bundle ID:** `app.tonero.macos`
- **Version:** set in `src-tauri/tauri.conf.json → "version"` (and `Cargo.toml`)

---

## Accessibility Permission

The app uses Accessibility APIs to monitor global keyboard events.
After **any** fresh install, the permission is reset and must be re-granted:

1. Open **System Settings → Privacy & Security → Accessibility**
2. Find **Tonero** in the list
3. Toggle it **ON**
4. Test with a keyboard shortcut in Notes.app or any text field

If Tonero doesn't appear in the list, launch the app and trigger the permission prompt first.
