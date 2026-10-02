# Signing & Notarization (macOS)

DSH-Desktop needs a valid bundle signature for two reasons:

1. **System notifications** — macOS registers an app in `System Settings → Notifications`
   and accepts `UNUserNotificationCenter` requests only when the app has a real bundle
   signature. Without one, `Notification.show()` is rejected and the banner never appears.
   See "Why ad-hoc signing still works" below for the exact boundary.
2. **Gatekeeper** — a Developer ID signed + notarized build downloads and launches without
   the right-click → Open / `xattr -dr com.apple.quarantine` workaround.

## Why ad-hoc signing still works (and why the old build didn't)

An **ad-hoc deep signature** is enough for notifications — the app shows up in
`System Settings → Notifications` and banners appear. What is *not* enough is the
**linker signature** Electron ships with by default:

| Build | `codesign -dv` shows | System banner |
| --- | --- | --- |
| Default (no signing) | `Identifier=Electron`, `Info.plist=not bound`, `Sealed Resources=none` | rejected |
| Ad-hoc deep signed | `Identifier=com.justgenius.dshdesktop`, `Sealed Resources version=2`, `flags=adhoc` (+`runtime`) | shows |

Verified on macOS 26.4 / Electron 43.4.0 — the rejected case logs this in
`log show --predicate 'process == "usernotificationsd"'`:

```
[Electron] Entitlement 'com.apple.private.usernotifications.bundle-identifiers' required to request user notifications
[Electron] addRequest not allowed: com.justgenius.dshdesktop
```

The build config therefore pins `"identity": "-"` (ad-hoc) instead of `null`
(which skips signing entirely). `hardenedRuntime` must stay `true` alongside
`identity: "-"` — an ad-hoc + hardened-runtime bundle needs
`com.apple.security.cs.disable-library-validation` or Electron cannot load its own
frameworks (both entitlement plists are checked in under `build/`).

## Prerequisites

- An [Apple Developer Program](https://developer.apple.com/programs/) membership.
- A **Developer ID Application** certificate installed in the keychain
  (`security find-identity -v -p codesigning` should list it).
- (Optional) An App Store Connect **app-specific password** for notarization.

## Configuration

The electron-builder `mac` options in `package.json` are already set up:

```json
"mac": {
  "icon": "build/icon.icns",
  "extendInfo": { "NSUserNotificationAlertStyle": "alert" },
  "category": "public.app-category.developer-tools",
  "target": ["dmg", "zip"],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "notarize": true
}
```

- `identity: "-"` ad-hoc deep-signs the bundle. Required for system notifications;
  `null` skips signing and leaves Electron's linker signature, which macOS rejects.
- `hardenedRuntime: true` is required by Apple for notarization. It is compatible with
  `identity: "-"` as long as `build/entitlements.mac.plist` grants
  `com.apple.security.cs.disable-library-validation`.
- `entitlements` / `entitlementsInherit` point at the checked-in plists in `build/`.
- `notarize` is `false` in the repo config; it only takes effect with credentials present
  and a Developer ID identity. Notarization is *not* required for notification banners —
  a valid ad-hoc deep signature is enough.

`@electron/notarize` is a `devDependency`.

## Build & notarize

Set the notarization credentials (either Apple ID or an API key) and run `dist:mac`:

### Option A — Apple ID (app-specific password)

```sh
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
npm run dist:mac
```

### Option B — App Store Connect API key

```sh
export APPLE_API_KEY="/path/to/AuthKey_XXXX.p8"
export APPLE_API_KEY_ID="XXXX"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
npm run dist:mac
```

## Verify

After a successful build, confirm the app is properly signed and notarized:

```sh
# Ad-hoc build: expect Identifier=com.justgenius.dshdesktop and Sealed Resources version=2
codesign -dv --verbose=4 /Applications/DSH-Desktop.app
# Developer ID build only: expect "accepted, source=Notarized Developer ID"
spctl -a -vv /Applications/DSH-Desktop.app
```

Then check `System Settings → Notifications → DSH-Desktop` — it should appear, and
notifications from the `dsh-notification` plugin should show as banners.

The decisive check is the unified log. `addRequest not allowed` means the signature is
wrong; `Presenting ... as banner` means the banner was really shown:

```sh
log show --last 3m --predicate 'process == "usernoted"' --style compact \
  | grep -i justgenius | grep -iE 'Presenting|not allowed'
```

## Local dev (`npm start`)

`npm start` runs the Electron binary in `node_modules`, which carries only the linker
signature — so system banners do **not** work there, and `notify.show()` now honestly
returns `{ shown: false }`. To exercise the real path, pack and run the signed bundle:

```sh
./node_modules/.bin/electron-builder --mac dir --arm64
open release/mac-arm64/DSH-Desktop.app
```
