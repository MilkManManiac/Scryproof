# Scryproof for the Mac: build spec

Written 2026-10-02 by Wren (Fable 5.1, devbox) from the six Mac spikes in
`docs/spikes/2026-10-02-mac-desktop-spikes.md` and the code on `main`. For
Trey and Opus to execute by hand; the plan is written in the plan grammar so
it lints and can be compiled later if wanted, but nothing here is launched.

## Goal lock

**Outcome.** A Mac app for Apple silicon that Wes's friends install from a
DMG, that is signed and notarized so macOS opens it without a fight and keeps
its permission grants across updates, and that updates itself the way the
Windows app does: client code through the existing signed bundle, the shell
through a signed, notarized zip the app verifies against Wes's update key
before swapping itself. Windows keeps shipping unchanged. The three defects
the spikes found ship as fixes for every platform where they apply.

**Rulings already made (Trey, 2026-10-02, in `#scryproof-mac` and in chat):**
Mac only; Matt owns Linux. Mac shell auto-update is in scope ("yes I want the
updates"). Every general fix found during the spikes ships. Gatekeeper on and
notarization yes. Spike results are the evidence base.

**Rulings made here (Wren), announced so Trey can overrule:**
- Apple silicon only. Intel is a build flag (`--x64`) added when a named
  person needs it; nobody has asked.
- Mac keeps the in-app share picker; no share-with-sound on Mac in this
  release (spike 2: Apple's picker offers no audio, the loopback option is
  Windows-only in Electron 44).
- The Mac shell updater is ours, not `electron-updater`: same trust model as
  Windows (Ed25519 manifest signed off the box, hash over the exact bytes),
  zip artifact, bundle swap, relaunch. Windows manifest format is untouched so
  installed 0.5.x apps keep updating.
- First install is a DMG; updates are a zip. Both notarized and stapled by
  electron-builder.
- Mac releases are built on Trey's Mac (the Developer ID identity lives
  there). Who signs the update manifest is checkpoint C1.
- Nothing publishes to scryproof.com without Wes (checkpoint C3).

**Not in scope.** Linux. Intel. Performance baselines. Share-with-sound on
Mac. The same-account two-device call bug (identity is the account id; fixing
it touches sender-key rotation; recorded for `docs/BUILD-ORDER.md`). Push
notifications for a quit app.

**Ceremony level: 2.** Irreversible effects (notarization sends bytes to
Apple; publishing to the box), one contract seam (download route and manifest
format between server and shell). One architect pass is this document; one
adversarial plan review is Opus's first read. No G1/G2 gates beyond the three
checkpoints below.

```toml plan
name = "scryproof-mac-desktop"
repo = "~/Code/Scryproof"
project_gate = "npm run typecheck && npm test && npm test --prefix desktop"

[regimes.standard]
lanes = 2
min_families = 2
fix_rounds = 1
re_review = "scoped"
adjudicate = true
severity_floor = "major"
max_task_calls = 12

[regimes.prose]
lanes = 1
min_families = 1
fix_rounds = 0
re_review = "none"
adjudicate = false
severity_floor = "major"
max_task_calls = 8

[regimes.critical]
lanes = 3
min_families = 3
fix_rounds = 2
re_review = "scoped"
adjudicate = true
severity_floor = "major"
max_task_calls = 24
```

```toml routing
[executor]
routes = [{engine="claude", model="opus", effort="high", mode="work"}, {engine="codex", model="luna", effort="xhigh", mode="work"}]

[reviewer]
routes = [{engine="claude", model="opus", effort="high", mode="work"}, {engine="codex", model="sol", effort="xhigh", mode="work"}, {engine="omp", model="glm", effort="high", mode="work"}]

[integrator]
routes = [{engine="codex", model="luna", effort="medium", mode="work"}]

[adjudicator]
routes = [{engine="claude", model="opus", effort="high", mode="work"}]

[verifier]
routes = [{engine="codex", model="luna", effort="xhigh", mode="work"}]

[fixer]
routes = [{engine="claude", model="opus", effort="high", mode="work"}]

[attacker]
routes = [{engine="grok", model="grok-4.7", effort="high", mode="work"}, {engine="codex", model="sol", effort="xhigh", mode="work"}]
```

## Findings

Everything a lane acts on, with where it came from. Spike citations are to
`docs/spikes/2026-10-02-mac-desktop-spikes.md` (Cairn, 2026-10-02, Trey
driving the app by hand on a Mac16,5 M4 Max, macOS 26 build 26A434).

```toml findings
[F1]
claim = "The packaged Electron app runs on darwin unchanged: app://scryproof origin, cookie jar, forwarder, gateway, and an encrypted voice join all worked in an ad-hoc signed build."
source = "Spike 1 result: panel read 'Voice connected', 'Encrypted · only you here', RTT 35 ms, TURN no; evidence/s1-desktop-in-call-panel.png"

[F2]
claim = "A hardened-runtime Mac build without com.apple.security.device.audio-input and device.camera entitlements gets no microphone and no prompt."
source = "Spike 1 addendum: tccd log 'requires entitlement com.apple.security.device.audio-input but it is missing', 'Policy disallows prompt'; fixed by desktop/assets/entitlements.mac.plist (committed on spike/mac-desktop)"

[F3]
claim = "The shell updater is not platform-gated: on Mac it downloads the Windows installer and shows 'Restart to install' on every relaunch."
source = "desktop/src/main.js line 69: INSTALLER_URL = app.isPackaged ? `${SERVER.origin}/download/` : ''; line 350 downloads 'Scryproof-Setup.exe'; spike 1 result observed Scryproof-Setup-0.5.5.exe (117 MB) in shell-update/"

[F4]
claim = "Push-to-talk misses a key release when the person Cmd-Tabs away while holding the key; the page is left believing the key is held (hot mic)."
source = "Spike 3 result: key '/', hold, Cmd-Tab, release: speaking ring stayed lit. desktop/src/push-to-talk-core.js holdTracker clears held only on a keyup for the same keycode"

[F5]
claim = "holdTracker already receives repeated keydown events while a key is held on Windows and passes on only changes."
source = "desktop/src/push-to-talk-core.js holdTracker comment: 'Windows repeats key-down while a key is held; only changes are passed on.'"

[F6]
claim = "macOS delivers key-repeat keydown events through uiohook-napi while a key is physically held."
inference = "macOS auto-repeat is generated at the HID event layer and CGEventTap sees repeats; not yet observed through uiohook on darwin. M1 verifies before relying on it."

[F7]
claim = "The global key hook needs the Accessibility permission on macOS; push-to-talk does nothing until the switch is on, and ad-hoc builds lose the grant on every rebuild because it is pinned to the binary hash."
source = "Spike 3: tccd Modify event for kTCCServiceAccessibility on com.scryproof.desktop; spike 2b: re-prompt on a rebuilt ad-hoc app"

[F8]
claim = "An ad-hoc signed Mac build re-prompts for Keychain access (twice) after every rebuild; the same binary relaunched does not."
source = "Spike 1 addendum: securityd 'user approved allow' twice for the new process; relaunch of the same binary showed no prompt"

[F9]
claim = "Share-with-sound has no Mac path in Electron 44: the loopback audio option is Windows-only, and Apple's system picker (useSystemPicker, macOS 15+) offered no audio option, collapsed to an unclickable row, and timed out the capture."
source = "Electron session docs: 'Specifying a loopback device will capture system audio, and is currently only supported on Windows'; spike 2 result"

[F10]
claim = "Window capture on a 5K display loads WindowServer to 50-69% and 2.2-2.4 GB whichever picker starts it; the share quality preset is untested as a lever."
source = "Spike 2b result: top samples with Apple's picker and ours on the same window"

[F11]
claim = "Mac builds need --config.mac.identity=- (ad-hoc) when unsigned; CSC_IDENTITY_AUTO_DISCOVERY=false alone produces a binary the kernel kills with 'Code Signature Invalid'. electron-builder auto-finds the Developer ID in the keychain otherwise."
source = "Spike 1 result, builds 1-3"

[F12]
claim = "A Developer ID Application identity for team LRU27MC63Q exists in Trey's Mac keychain; Gatekeeper is off on his Mac."
source = "Spike 1 result: electron-builder signed build 1 with it; spctl --status 'assessments disabled'"

[F13]
claim = "electron-builder 26 signs, notarizes and staples DMG and ZIP targets itself when mac.notarize = true and credentials come from APPLE_KEYCHAIN_PROFILE + APPLE_TEAM_ID (or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD, or an API key)."
source = "https://www.electron.build/v26/docs/features/code-signing/notarization, fetched 2026-10-02"

[F14]
claim = "The Windows shell-update manifest is {version, sha256, size, signature}, Ed25519 over 'scryproof/desktop-installer/v1\\n<version>\\n<sha256>', file name Scryproof-Setup-<version>.exe; installed apps verify with the baked public key desktop/src/update-key.pub.pem."
source = "desktop/src/installer-core.js: CONTEXT, signedBytes, installerFileName, readInstallerManifest"

[F15]
claim = "The Ed25519 update key lives at ~/.scryproof/update-key.pem on Wes's PC and nowhere else; sign-installer.mjs reads the built .exe from desktop/release to hash it."
source = "desktop/scripts/signing-key.mjs line 17 (keyPath); desktop/scripts/sign-installer.mjs reads join(release, installerFileName(version))"

[F16]
claim = "The box serves only two download names, from <DATA_DIR>/downloads: Scryproof-Setup.exe and installer.json. Anything else is 404."
source = "server/src/routes/downloads.ts DOWNLOADS map"

[F17]
claim = "scripts/publish-installer.sh copies the .exe and installer.json to the box over ssh (installer first, manifest second) and checks the served hashes afterwards."
source = "scripts/publish-installer.sh"

[F18]
claim = "The web client links to /download/Scryproof-Setup.exe in two places and the update banner says 'Restart to install' for a pending shell update; the tray menu says 'Start with Windows (in the tray)'."
source = "web/src/components/ThemePicker.tsx:114, web/src/components/VoicePanel.tsx:665, web/src/App.tsx:126-141, desktop/src/main.js trayMenu"

[F19]
claim = "The tray icon is the color assets/icon.png resized to 16 px, no template image; no mac icon (build.mac.icon) is configured so the Dock shows Electron's default."
source = "desktop/src/main.js createTray; spike 1 result; evidence/s1-tray-dark.png"

[F20]
claim = "Closing the window hides it; window-all-closed quits; there is no app 'activate' handler, so a Dock click after close does nothing on Mac."
source = "desktop/src/main.js win.on('close') preventDefault+hide; app.on('window-all-closed', app.quit); rg -n activate desktop/src/main.js returns nothing"

[F21]
claim = "The preload bridge exposes server, gateway, shell, update and shell-update calls, push-to-talk watch/hold, zoom, and share picker calls; the page's types for it are in web/src/lib/desktop.ts with every newer call optional."
source = "desktop/src/preload.cjs exposeInMainWorld('scryproofDesktop', ...); web/src/lib/desktop.ts DesktopBridge"

[F22]
claim = "The client self-updater works on darwin: on first launch the packaged app fetched, verified and stored a signed client.bin from the live server."
source = "Spike 1 result, 'Updates on darwin': client-update/ folder under ~/Library/Application Support/scryproof-desktop with a manifest matching the live one"

[F23]
claim = "macOS lets a running .app bundle be renamed or moved, and an app can replace itself by swapping bundles and relaunching; this is how Sparkle updates work."
inference = "Sparkle's documented install path (rename old bundle aside, move new into place, relaunch). Not yet done in our code; M2's verify row proves it on a real build."

[F24]
claim = "Electron on macOS exposes systemPreferences.isTrustedAccessibilityClient(prompt) and getMediaAccessStatus('screen' | 'microphone' | 'camera'), and app.getLoginItemSettings().wasOpenedAtLogin."
inference = "From the Electron API surface as I know it for v44; M3 confirms each against the installed Electron's typings before use."

[F25]
claim = "Desktop unit tests run with node --test over desktop/test/*.test.mjs (605 lines across six files); the Electron-driven check is scripts/desktop-check.mjs against a seeded local API."
source = "desktop/package.json scripts.test; root package.json test:desktop; wc -l desktop/test/*.mjs"

[F26]
claim = "Wes: nothing deploys without asking him first."
source = "docs/HANDOFF.md, repeated in the 2026-09-24 and 2026-09-23 sections"
```

## Scope fence

In: the `desktop/` shell for darwin, its tests and release scripts; the
server's download allow-list; the web client's platform-aware copy and
permission explanations; the push-to-talk watchdog on every platform; one
signed, notarized 0.6.0 Mac release and its publication with Wes's go.

Out: Linux, Intel, share-with-sound on Mac, performance work beyond spike S1's
measurement, the same-account call identity bug, push notifications for a
quit app, any change to the Windows manifest format or NSIS installer path,
any change to the E2EE or client-update code.

## Acceptance demo

Trey, on his Mac with Gatekeeper on, downloads `Scryproof.dmg` from
scryproof.com in a fresh user account, drags it to Applications, opens it
with no "Open Anyway" dance, signs in, joins a voice channel with Wes on
Windows, holds push-to-talk with a game in front and is heard, Cmd-Tabs away
while holding and the mic closes on its own, shares a window and Wes sees it,
closes the window and the call keeps going, clicks the Dock icon and the
window is back. Then a 0.6.1 zip and manifest go on the box; his app shows
"A new version of the app is ready", he clicks Restart to install, and the
app comes back as 0.6.1, still signed in, with no permission prompt.

## Interfaces

Shared names, so lanes do not invent their own.

**Mac shell-update manifest** (`installer-core.js`, new):

```
file name       Scryproof-<version>-mac-arm64.zip
manifest name   installer-mac-arm64.json
manifest        { version, arch: "arm64", sha256, size, signature }
signed bytes    "scryproof/desktop-installer-mac/v1\n<arch>\n<version>\n<sha256>"
```

A Windows manifest cannot verify as a Mac one or vice versa: different
context strings. `readInstallerManifest` keeps its v1 behavior for Windows;
`readMacInstallerManifest(raw, publicKeyPem)` is the new reader and returns
`null` for anything that is not a Mac manifest signed by the key.

**Download names the box serves** (`downloads.ts`), added:

```
Scryproof.dmg                       application/x-apple-diskimage
Scryproof-<version>-mac-arm64.zip   application/zip   (served as Scryproof-mac-arm64.zip)
installer-mac-arm64.json            application/json
```

The box serves the zip under the fixed name `Scryproof-mac-arm64.zip` the same
way it serves `Scryproof-Setup.exe` without a version: the manifest carries
the version.

**Preload bridge additions** (`preload.cjs`, typed in `desktop.ts`):

```
platform: 'darwin' | 'win32' | 'linux'
permissionState(): Promise<{ accessibility: boolean; screen: 'granted' | 'denied' | 'not-determined' | 'unknown' }>
openPermissionSettings(which: 'accessibility' | 'screen'): Promise<void>
```

`watchPushKey(code)` on darwin resolves `false` when Accessibility is not
granted, after prompting once through `isTrustedAccessibilityClient(true)`.
The page reads `permissionState()` to explain why and offers
`openPermissionSettings`.

**Hold tracker contract** (`push-to-talk-core.js`):

`holdTracker(keycode, onChange, { now, releaseAfterMs })` releases on its own
when no keydown for the key has arrived for `releaseAfterMs` while held;
`tick()` on the returned function drives the check so the test is clockless.
Default `releaseAfterMs` is set from what M1 measures on darwin (the longest
gap between auto-repeat keydowns, with margin).

## Tasks

```toml task
id = "M1"
title = "Push-to-talk releases itself when key-repeat stops"
delivers = "A held push-to-talk key that misses its key-up (Cmd-Tab, lock screen, UAC) releases on its own once auto-repeat keydowns stop arriving; the page is told released exactly once. Edits desktop/src/push-to-talk-core.js and desktop/src/push-to-talk.js; adds cases to desktop/test/push-to-talk.test.mjs."
kind = "build"
findings = ["F4", "F5", "F6", "F25"]
blocked_by = []
acceptance = "node --test desktop/test/push-to-talk.test.mjs passes with new cases: (a) keydown, repeats, silence past releaseAfterMs -> onChange(false) once; (b) keydown, repeats continuing -> no release; (c) a late keyup after a watchdog release -> no second onChange. The darwin repeat interval is measured in a packaged build with the hook attached (M4's dir build) and recorded in the file header as the basis for releaseAfterMs. Green does not prove the hot mic is closed on the wire; that is C4."
role = "executor"
persona = "minimalist-implementer"
skills = ["debugging-systematic"]
owned_files = ["desktop/src/push-to-talk-core.js", "desktop/src/push-to-talk.js", "desktop/test/push-to-talk.test.mjs"]
invariants = ["A real keyup still releases immediately; the watchdog only ever shortens a hold, never lengthens it", "Keys other than the watched one are still dropped in the main process"]
verify = [{run = "node --test desktop/test/push-to-talk.test.mjs", expect = "exit 0"}]
reversibility = "reversible"
effects = ["code"]

[review]
personas = ["refuter", "test-skeptic"]
```

If darwin does not deliver repeats through the hook (F6 false), the watchdog
has nothing to watch. uiohook cannot be asked whether a key is down, so the
fallback is two lesser guards: release when the app's own window loses focus
to another app (`app.on('browser-window-blur')` fires for Cmd-Tab away from
Scryproof, not for every switch) and a hard cap on how long one hold can last.
Say which path shipped, and the measured repeat interval or its absence, in
the file header.

```toml task
id = "M3"
title = "Mac desktop integration: menu bar, Dock, login item, permission states"
delivers = "On darwin: a monochrome template menu-bar icon; a Dock click reopens the hidden window (app activate); window-all-closed does not quit on darwin; the tray item reads 'Start at login' and starting at login opens hidden; the preload bridge gains platform, permissionState and openPermissionSettings; watchPushKey on darwin prompts for Accessibility once and resolves false until granted. Edits desktop/src/main.js (tray, lifecycle, login item, permission IPC), desktop/src/preload.cjs, and adds desktop/assets/trayTemplate.png and trayTemplate@2x.png."
kind = "build"
findings = ["F7", "F19", "F20", "F21", "F24"]
blocked_by = []
acceptance = "In a dir build on the Mac: menu-bar icon renders monochrome in light and dark bars (two screenshots in docs/spikes/evidence/); red-button close then Dock click reopens the window; Cmd-Q quits; with Accessibility off, choosing push-to-talk shows the macOS prompt and the page receives watchPushKey=false and permissionState.accessibility=false; after granting, watchPushKey=true. node --test desktop/test/*.test.mjs still passes. Green does not prove the login-item hidden start, which only a real login tests (V1)."
role = "executor"
persona = "minimalist-implementer"
skills = ["debugging-systematic"]
owned_files = ["desktop/src/main.js", "desktop/src/preload.cjs", "desktop/assets/trayTemplate.png", "desktop/assets/trayTemplate@2x.png"]
invariants = ["Windows behavior is byte-for-byte the same path as before: every darwin branch is behind process.platform === 'darwin'", "The permission IPC answers only our own page (the existing ours(event) check)"]
verify = [{run = "node --test desktop/test/*.test.mjs", expect = "exit 0"}, {run = "rg -n \"process.platform === 'darwin'\" desktop/src/main.js", expect = "darwin"}]
reversibility = "reversible"
effects = ["code"]

[review]
personas = ["refuter", "conventions"]
```

```toml task
id = "M2"
title = "Shell updates by platform: Windows unchanged, Mac zip swap"
delivers = "The shell updater runs the Windows path only on win32 and a new Mac path only on darwin (nothing elsewhere). Mac path: fetch installer-mac-arm64.json, verify with readMacInstallerManifest, download Scryproof-mac-arm64.zip with the existing size-capped download, verify sha256 and size, extract with ditto into <userData>/shell-update/staging, check codesign --verify --deep --strict and that the Team ID equals the running app's, then on 'Restart to install': rename the running bundle to <name>.old beside itself, move the new bundle into place, app.relaunch(), app.quit(); the next launch deletes .old. If the app's parent folder is not writable, the banner instead offers the DMG download link. Edits desktop/src/installer-core.js (adds the Mac manifest reader and names), adds desktop/src/shell-update-mac.js, edits desktop/src/main.js (platform gate and Mac wiring), adds desktop/test/shell-update-mac.test.mjs, extends desktop/test/installer.test.mjs."
kind = "build"
findings = ["F3", "F14", "F22", "F23", "F25"]
blocked_by = ["M3"]
acceptance = "node --test desktop/test/*.test.mjs passes with: a Windows manifest rejected by readMacInstallerManifest and a Mac manifest rejected by readInstallerManifest (cross-platform substitution impossible); a Mac manifest with wrong arch, wrong size, or tampered signature rejected; the bundle swap planner (pure function: given app path, staging path, writable yes/no) returns the exact rename/move sequence or the 'offer DMG' outcome. On the Mac, a dir build of version N with a locally served manifest for N+1 downloads, verifies, swaps and relaunches as N+1 with login intact (recorded in docs/spikes/ as m2-swap.md with the ls -la before and after). Green on the unit tests does not prove the swap; the Mac run does."
role = "executor"
persona = "minimalist-implementer"
skills = ["debugging-systematic"]
owned_files = ["desktop/src/installer-core.js", "desktop/src/shell-update-mac.js", "desktop/src/main.js", "desktop/test/shell-update-mac.test.mjs", "desktop/test/installer.test.mjs"]
invariants = ["No file that failed a check is ever executed or moved into place; it is deleted", "The Windows manifest format and context string are unchanged, so installed 0.5.x Windows apps keep updating", "Forward only: a manifest whose version is not newer than the running app is ignored", "The update key is the baked public key; nothing fetched from the server can change which key verifies"]
verify = [{run = "node --test desktop/test/*.test.mjs", expect = "exit 0"}, {run = "rg -n 'scryproof/desktop-installer/v1' desktop/src/installer-core.js", expect = "desktop-installer/v1"}]
reversibility = "reversible"
effects = ["code", "filesystem"]

[review]
personas = ["attacker", "refuter", "3am-ops"]
```

Why not `electron-updater`: it would verify a sha512 from `latest-mac.yml`
but not Wes's Ed25519 signature, so the box could serve any notarized bundle.
Our path keeps the rule from GAMEPLAN 1b finding 2: the server hands out
updates and cannot make one.

```toml task
id = "M4"
title = "Mac packaging, signing, notarization and release scripts"
delivers = "cd desktop && npm run dist:mac on Trey's Mac produces desktop/release/Scryproof.dmg and Scryproof-<version>-mac-arm64.zip, both Developer ID signed with the hardened runtime and desktop/assets/entitlements.mac.plist, notarized and stapled through a keychain profile, plus Scryproof-<version>-mac-arm64.zip.sha256 (sha256 and size, one line). npm run sign-installer -- --mac signs installer-mac-arm64.json from that sidecar when the key is present (so the holder of the update key can sign without the 300 MB zip). scripts/publish-mac.sh sends the DMG, the zip (as Scryproof-mac-arm64.zip) and the manifest to the box, zip and DMG before the manifest, and checks the served hashes. The dev-only ad-hoc recipe is a script too: npm run dist:mac:adhoc. Edits desktop/package.json (build.mac, build.dmg, scripts), desktop/scripts/sign-installer.mjs, adds desktop/assets/icon.icns, scripts/publish-mac.sh, and a Mac section in docs/HANDOFF.md."
kind = "build"
findings = ["F2", "F11", "F12", "F13", "F14", "F15", "F17"]
blocked_by = []
acceptance = "On Trey's Mac with the keychain profile present: npm run dist:mac exits 0; codesign --verify --deep --strict and spctl -a -t exec -vv on the extracted app report accepted, source=Notarized Developer ID; xcrun stapler validate passes on the DMG and on the app inside the zip; the sidecar's hash equals sha256sum of the zip. npm run sign-installer -- --mac with a throwaway key writes a manifest that readMacInstallerManifest accepts and readInstallerManifest rejects. Windows dist is untouched: npm run dist still names only nsis. Green does not prove a friend's Mac opens it; V1 does."
role = "executor"
persona = "minimalist-implementer"
skills = ["house-bar"]
owned_files = ["desktop/package.json", "desktop/scripts/sign-installer.mjs", "desktop/assets/icon.icns", "scripts/publish-mac.sh", "docs/HANDOFF.md"]
invariants = ["No Apple ID password, app-specific password, or update key appears in the repo, in an env file, or in a commit; notarization credentials are a keychain profile referenced by name", "publish-mac.sh refuses to publish when the manifest's hash does not equal the zip's"]
verify = [{run = "node -e \"const p=require('./desktop/package.json');if(!p.build.mac||!p.build.mac.notarize||!p.scripts['dist:mac'])process.exit(1)\"", expect = "exit 0"}, {run = "rg -n 'APPLE_APP_SPECIFIC_PASSWORD=|update-key.pem' desktop/package.json desktop/scripts scripts/publish-mac.sh; test $? -eq 1", expect = "exit 0"}]
reversibility = "reversible"
effects = ["code", "credentials"]

[review]
personas = ["attacker", "3am-ops", "conventions"]
```

```toml task
id = "M5"
title = "Server serves the Mac downloads"
delivers = "GET /download/Scryproof.dmg, /download/Scryproof-mac-arm64.zip and /download/installer-mac-arm64.json are served from <DATA_DIR>/downloads with the content types in Interfaces; every other name stays 404. Edits server/src/routes/downloads.ts and its test."
kind = "build"
findings = ["F16"]
blocked_by = []
acceptance = "The server test suite passes with new cases: the three Mac names 200 with the right Content-Type and Content-Disposition (attachment for dmg and zip, none for json), Cache-Control no-store; 'installer-mac-arm64.json.bak' and '../installer.json' 404."
role = "executor"
persona = "minimalist-implementer"
skills = ["house-bar"]
owned_files = ["server/src/routes/downloads.ts", "server/src/tests/downloads.test.ts"]
invariants = ["Only allow-listed names are served; the list is the only way a file under downloads/ becomes reachable"]
verify = [{run = "npm test --workspace server", expect = "exit 0"}]
reversibility = "reversible"
effects = ["code"]

[review]
personas = ["attacker", "refuter"]
```

```toml task
id = "M6"
title = "Web client knows it is on a Mac"
delivers = "Platform-aware desktop copy and links: the two download links offer the DMG on a Mac browser and the .exe elsewhere; the update banner reads 'Restart to install' on both platforms but the Mac shell-ready state can be 'needs the DMG' (not writable), shown with the link; the push-to-talk key picker warns when a modifier key is chosen ('Cmd-Tab and other shortcuts will fight this key'); when the desktop bridge reports Accessibility not granted, the voice panel's push-to-talk row explains it in one sentence with an 'Open System Settings' button; when screen permission is not granted, the share picker says so with the same button; Walkthrough and changelog get the Mac sentence. Edits web/src/lib/desktop.ts (bridge types from Interfaces), web/src/components/ThemePicker.tsx, VoicePanel.tsx, SharePicker.tsx, the push-to-talk key picker component, App.tsx (banner), Walkthrough.tsx, changelog.ts, and their tests."
kind = "build"
findings = ["F7", "F18", "F21"]
blocked_by = []
acceptance = "npm test --workspace web and npm run typecheck pass; new tests cover: download link chooses DMG when navigator.platform starts with Mac; modifier-key warning appears for MetaLeft/AltRight and not for Slash; permission explanation renders when permissionState resolves accessibility=false and does not when true. Green does not prove the real prompt flow; V1 does."
role = "executor"
persona = "minimalist-implementer"
skills = ["house-bar"]
owned_files = ["web/src/lib/desktop.ts", "web/src/components/ThemePicker.tsx", "web/src/components/VoicePanel.tsx", "web/src/components/SharePicker.tsx", "web/src/components/PushToTalkKey.tsx", "web/src/App.tsx", "web/src/components/Walkthrough.tsx", "web/src/changelog.ts", "web/src/tests/desktop-platform.test.ts"]
invariants = ["Every new bridge call is optional in DesktopBridge and guarded, so a 0.5.x shell loading a newer client never throws", "The browser (no bridge) sees no desktop-only copy"]
verify = [{run = "npm test --workspace web", expect = "exit 0"}, {run = "npm run typecheck", expect = "exit 0"}]
reversibility = "reversible"
effects = ["code"]

[review]
personas = ["refuter", "conventions"]
```

The push-to-talk key picker's real file name is whatever `rg -n "watchPushKey"
web/src` lands on; M6 owns that file and corrects the name in its first
commit message.

```toml task
id = "C1"
title = "Where the update key signs Mac manifests"
delivers = "Trey and Wes's decision: either Wes signs each Mac manifest from the .sha256 sidecar Trey sends him (key stays on Wes's PC only), or Trey holds a copy of the update key on his Mac (a second place the key lives, in the password manager too)."
kind = "checkpoint"
blocked_by = []
acceptance = "The decision is written at the top of the Mac section of docs/HANDOFF.md with who signs and the exact command they run."
assignee = "trey"
gate = "judgment"
because = "a second copy of the key that can ship code to every installed app is a trust decision for its owners, not a build step"
```

Wren's recommendation: Wes signs from the sidecar. It costs one message per
Mac shell release, keeps the key where GAMEPLAN says it lives, and the
sidecar path is built either way.

```toml task
id = "C2"
title = "Trey's Mac is ready to notarize and to test like a friend's Mac"
delivers = "On Trey's Mac: xcrun notarytool store-credentials has created a keychain profile named scryproof-notary for team LRU27MC63Q; Gatekeeper is on (spctl --status: assessments enabled); a second macOS user account exists for the fresh-user test."
kind = "checkpoint"
blocked_by = []
acceptance = "xcrun notarytool history --keychain-profile scryproof-notary exits 0; spctl --status prints 'assessments enabled'; the second user account is listed in System Settings > Users & Groups."
assignee = "trey"
gate = "completion"
because = "the Apple ID password, sudo, and a new user account are Trey's to enter; nobody else can do these steps"
discharged_by = "the three command outputs pasted into docs/spikes/2026-10-02-mac-desktop-spikes.md under Spike 4"
```

```toml task
id = "R1"
title = "First signed, notarized Mac release built"
delivers = "Version 0.6.0: desktop/package.json version bumped, changelog entry written, npm run dist:mac run on Trey's Mac with the real profile, artifacts and sidecar in desktop/release/, and the Mac manifest signed by whoever C1 named. Nothing published. Edits desktop/package.json (version) and desktop/src/client-version.json through the existing release flow."
kind = "build"
findings = ["F13", "F15"]
blocked_by = ["M1", "M2", "M3", "M4", "M5", "M6", "C1", "C2"]
acceptance = "spctl -a -t exec -vv on the app from the DMG and from the zip both report source=Notarized Developer ID; the signed installer-mac-arm64.json verifies with readMacInstallerManifest against desktop/src/update-key.pub.pem and its sha256 equals the zip's; the Windows installer for 0.6.0 is also built and signed by Wes so both platforms move together (or the Mac release is 0.6.0 and Windows stays 0.5.x with the version gap written in HANDOFF)."
role = "executor"
persona = "minimalist-implementer"
skills = ["house-bar"]
owned_files = ["desktop/package.json", "desktop/src/client-version.json", "web/src/changelog.ts"]
invariants = ["The release commit contains no artifact over 1 MB and no key material"]
verify = [{run = "node -e \"const v=require('./desktop/package.json').version;if(!/^0\\.6\\./.test(v))process.exit(1)\"", expect = "exit 0"}, {run = "git -C . diff --cached --stat | rg -v 'release/'; true", expect = "exit 0"}]
reversibility = "costly"
effects = ["code", "network"]

[review]
personas = ["3am-ops", "conventions"]
```

Notarization is a send to Apple of the app's bytes; Trey authorized it on
2026-10-02 ("yes for both"). It is `costly`, not irreversible: a bad release
is never published without C3.

```toml task
id = "V1"
title = "Mac verification runbook, on the real release"
delivers = "The decision this settles: whether 0.6.0 is fit to publish (C3) or needs fixes first. docs/spikes/2026-10-02-mac-desktop-spikes.md gains the Spike 4 and Spike 6 results and an 'R1 verification' section, each row observed on Trey's Mac with the 0.6.0 artifacts: fresh user account opens the DMG with Gatekeeper on (step count, screenshots); the notarized app keeps Accessibility and Keychain grants across a rebuild (build 0.6.0 twice, compare prompts); mic prompt appears once; screen permission explanation and button work; push-to-talk with Cmd-Tab releases on its own within the watchdog window (ring goes dark); lid close mid-call for two minutes then wake: panel state and rejoin; red-button close with audio playing keeps audio (or records that it does not); Dock click reopens; Cmd-Q quits; Start at login opens hidden after a real logout/login; shell update from a locally served 0.6.1 zip swaps and relaunches with the login intact; the 117 MB Windows installer is no longer downloaded on Mac (shell-update/ stays empty of .exe)."
kind = "spike"
findings = ["F7", "F8", "F20", "F22"]
blocked_by = ["R1"]
acceptance = "Every row above has an observed result or an explicit 'not observed: <reason>'; each result names its instrument (screenshot path, log line, ls output). A row that fails becomes a bead or a fix commit before C3, never a note."
role = "executor"
persona = "repro-first-writer"
skills = ["debugging-systematic"]
owned_files = ["docs/spikes/2026-10-02-mac-desktop-spikes.md", "docs/spikes/evidence"]
invariants = ["No screenshot committed shows friends' message text"]
verify = [{run = "rg -c 'R1 verification' docs/spikes/2026-10-02-mac-desktop-spikes.md", expect = "1"}]
reversibility = "reversible"
effects = ["docs"]

[review]
personas = ["stranger"]
```

```toml task
id = "C3"
title = "Wes says publish"
delivers = "Wes's go to put the Mac DMG, zip and manifest on scryproof.com and to ship the 0.6.0 client and Windows installer alongside."
kind = "checkpoint"
blocked_by = ["V1"]
acceptance = "Wes's message saying go, quoted in docs/HANDOFF.md with the date, and the version he approved."
assignee = "trey"
gate = "judgment"
because = "nothing deploys to Wes's box without his word (HANDOFF, every section since 2026-09-23)"
```

```toml task
id = "R2"
title = "Published: Mac downloads live on scryproof.com"
delivers = "scripts/publish-mac.sh run against the box; https://scryproof.com/download/Scryproof.dmg, /download/Scryproof-mac-arm64.zip and /download/installer-mac-arm64.json serve the exact hashes built in R1; the DMG hash and the update-key hash posted where the box cannot change them (the GitHub release notes or a message by hand, per publish-installer.sh); docs/HANDOFF.md records the live versions."
kind = "build"
findings = ["F16", "F17", "F26"]
blocked_by = ["C3"]
acceptance = "curl -fsS https://scryproof.com/download/installer-mac-arm64.json | node -e '...readMacInstallerManifest...' prints the 0.6.0 manifest; sha256 of the served zip equals the manifest's; a Mac on 0.6.0 built before publish shows 'A new version of the app is ready' only when a newer manifest is served (none yet, so no banner); HANDOFF updated."
role = "executor"
persona = "minimalist-implementer"
skills = ["house-bar"]
owned_files = ["docs/HANDOFF.md"]
invariants = ["Artifacts go up before the manifest, so no app ever reads a manifest for a file that is not there yet"]
verify = [{run = "curl -fsS https://scryproof.com/download/installer-mac-arm64.json | rg -q '\"arch\": \"arm64\"'", expect = "exit 0"}]
reversibility = "irreversible"
effects = ["network", "docs"]

[review]
personas = ["3am-ops", "stranger"]
```

```toml task
id = "C4"
title = "The parked second-participant checks"
delivers = "One call with Wes or Matt on Windows and Trey on the Mac release, running the packet-counter checks parked in spikes 1-3: call audio both ways; push-to-talk held and released (counter climbs, then flat); the Cmd-Tab stuck key now goes flat within the watchdog window; a window share's video frames arrive; whether the share carries call audio (it should not, since Mac sends no share audio)."
kind = "checkpoint"
blocked_by = ["R2"]
acceptance = "The five counter readings written under 'C4' in docs/spikes/2026-10-02-mac-desktop-spikes.md, each as the number before and after."
assignee = "trey"
gate = "completion"
because = "a second account in Wes's server is Wes's to lend; the readings need two people"
discharged_by = "the five readings in the spike file"
```

```toml task
id = "S1"
title = "Does the lowest share-quality preset tame the 5K capture load?"
delivers = "The decision this settles: whether share quality is the lever for the 5K capture load. Spike 2b repeated on the Mac release at the lowest share quality preset, same window, same display, same four top samples, written beside the 2b numbers with a one-line conclusion: lever or not."
kind = "spike"
findings = ["F10"]
blocked_by = ["V1"]
acceptance = "The four samples and the conclusion are in the spike file under 'S1'; the conclusion names what to change next (a default preset on darwin, a capture-size cap, or nothing) or says the numbers are too close to call."
role = "executor"
persona = "repro-first-writer"
skills = ["debugging-systematic"]
owned_files = ["docs/spikes/2026-10-02-mac-desktop-spikes.md"]
invariants = ["Nothing in the client changes as part of this spike"]
verify = [{run = "rg -c '## S1' docs/spikes/2026-10-02-mac-desktop-spikes.md", expect = "1"}]
reversibility = "reversible"
effects = ["docs"]

[review]
personas = ["stranger"]
```

## Wave map

Quoted for readers; `blocked_by` is the authority.

- Wave 1: M1, M3, M4, M5, M6, C1, C2 (all independent; M3 before M2 because both edit `main.js`)
- Wave 2: M2
- Wave 3: R1
- Wave 4: V1
- Wave 5: C3, S1
- Wave 6: R2
- Wave 7: C4

For Trey and Opus working by hand, the natural sequence is M1 → M3 → M2 on
the desktop side while M5 and M6 land in parallel, then M4 on the Mac, then
R1 onward. V1 and S1 each need the Mac and Trey's hands.

## Invariant → verify table

| Task | Invariant | Verify row that proves it |
|---|---|---|
| M1 | A real keyup still releases immediately; the watchdog only ever shortens a hold | `node --test desktop/test/push-to-talk.test.mjs`, case: keyup before the window elapses releases at once |
| M1 | Other keys are still dropped in the main process | same file, existing case: events for another keycode produce no onChange |
| M3 | Windows path unchanged; every darwin branch is behind a platform check | `rg -n "process.platform === 'darwin'" desktop/src/main.js` plus `node --test desktop/test/*.test.mjs` |
| M3 | Permission IPC answers only our own page | `node --test desktop/test/*.test.mjs`, case: a foreign-origin event gets null |
| M2 | A file that failed a check is never executed or moved; it is deleted | `desktop/test/shell-update-mac.test.mjs`: tampered zip leaves staging empty and no swap plan |
| M2 | Windows manifest format and context unchanged | `rg -n 'scryproof/desktop-installer/v1' desktop/src/installer-core.js` and the existing installer tests |
| M2 | Forward only | `desktop/test/installer.test.mjs`: equal or older Mac manifest returns null from the planner |
| M2 | Only the baked key verifies | `desktop/test/shell-update-mac.test.mjs`: manifest signed by another key is null |
| M4 | No credential or key in the repo | the `rg ... ; test $? -eq 1` verify row |
| M4 | publish-mac.sh refuses a hash mismatch | V1 row: run publish-mac.sh with a doctored sidecar against a dry-run target and read the refusal |
| M5 | Only allow-listed names are served | `npm test --workspace server`: the two 404 cases |
| M6 | New bridge calls optional and guarded | `npm run typecheck` (all new DesktopBridge members are `?:`) and the browser-render test with no bridge |
| M6 | Browser sees no desktop-only copy | `npm test --workspace web`: render with `window.scryproofDesktop` undefined |
| R1 | Release commit carries no artifact or key | the `git diff --cached --stat` verify row |
| V1 | No screenshot shows friends' text | reviewer (stranger) reads every committed image |
| R2 | Artifacts before manifest | `scripts/publish-mac.sh` order, read by the 3am-ops reviewer, and the served-hash check |
| S1 | Nothing in the client changes | `git status --porcelain web/ desktop/src` empty at S1's close |

## Merge gate

The coordinator (Opus, in this case) runs `npm run typecheck && npm test &&
npm test --prefix desktop` once on the integrated branch before R1, and
`npm run test:desktop` against the seeded local API on at least one platform.
The Mac-only rows in V1 are the acceptance for the release itself; no test on
the devbox or Wes's PC can stand in for them.

## What stays open after this plan

- Share-with-sound on Mac: tracks Electron's loopback support on darwin.
- Two devices on one account in one call (identity is the account id).
  Recorded for `docs/BUILD-ORDER.md`; touches sender-key rotation.
- Intel Macs: `--x64` and a second zip/manifest pair when someone needs it.
- Linux: Matt.
