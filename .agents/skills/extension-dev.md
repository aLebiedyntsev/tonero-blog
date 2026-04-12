# Skill: Browser Extension Development

## Overview

`tonero-extension` is a **Chrome Extension Manifest V3** — no build step required.
The directory is the extension; nothing needs to be compiled.

## Structure

```
manifest.json       MV3 manifest (version 1.1.1)
                    permissions: storage, tabs, alarms, notifications
                    host_permissions: http/https://api.tonero.app/*
background.js       Service worker — auth tokens, alarm scheduling, badge updates
content.js          Injected into all pages — intercepts keyboard shortcut, triggers rewrite
popup/              Popup UI (popup.html + CSS/JS)
_locales/           i18n strings (en, ru, ...)
icons/              icon16.png, icon32.png, icon48.png, icon128.png
store-assets/       Chrome Web Store screenshots and promo images
```

## Local Development

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer Mode** (toggle, top right)
3. Click **Load unpacked** → select the `tonero-extension/` directory
4. After any code change: click the **reload icon** on the extension card

### Debugging

- **background.js** (service worker): click the **Service Worker** link on the extension card in `chrome://extensions/` → opens dedicated DevTools
- **content.js**: open DevTools on any page → Console tab (filter by extension name)
- **popup/**: right-click the extension icon → Inspect popup

## Testing Checklist

- [ ] Log in via popup
- [ ] Rewrite triggers correctly in a text field (keyboard shortcut)
- [ ] Badge/notification updates work
- [ ] Alarms fire as expected (check background DevTools)

## Packaging for Store Submission

```bash
cd /Users/antonlebedintsev/Documents/git/mine

zip -r tonero-extension-<version>.zip tonero-extension/ \
  --exclude "tonero-extension/.git/*" \
  --exclude "tonero-extension/store-assets/*" \
  --exclude "tonero-extension/.agents/*"
```

Upload the zip to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

Current version: `1.1.1` (in `manifest.json → "version"`)

## Browser Compatibility

| Browser | Status | Notes |
|---|---|---|
| Chrome | ✅ Primary | Full support |
| Edge | ✅ Supported | Chromium-based, compatible |
| Opera | ✅ Supported | Chromium-based, compatible |
| Firefox | ❌ Not supported | Requires MV2 port |

## Updating Version

1. Edit `manifest.json` → `"version": "x.y.z"`
2. Commit + push
3. Zip and upload to Chrome Web Store
