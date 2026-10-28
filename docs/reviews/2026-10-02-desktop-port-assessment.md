# What it takes to ship Scryproof on macOS, Windows and Linux

Extend the existing Electron app. It already packages the shared React client, including chat, calls, permissions and encryption. The substantial work is native desktop integration, platform installers and updates, and measured performance improvements. A complete client rewrite would add feature and cryptographic migration work before it could reach parity.

Evidence comes from local `main`, including notifications and cryptographic hardening. The checkout was preserved; no installations, benchmarks or production inspections ran.

Proposed desktop scope: macOS 15+ on Apple silicon and Intel, Windows 11 x64, Ubuntu 24.04 GNOME and Kubuntu 24.04 KDE, both X11 and Wayland. Wayland feature failures block its full-support claim. Phones are separate. Closing the window keeps calls and notifications running; Quit stops the app. Screen sharing should send the selected application's sound without other applications or call audio; whole-system sharing is an explicit alternative.

Most of the product can stay

Keep the self-hosted server, permissions, React interface and LiveKit server. Carry chat, encrypted conversations, uploads, reactions, search, group conversations, voice messages, calls, screen sharing, soundboard, voice effects, events, polls, games and notifications together.

The installed client prevents the server from replacing executable app code: it serves bundled files from `app://scryproof` and confines server responses. Client and shell updates are separately signed. Device keys live in IndexedDB, the local browser database. Preserve that origin, profile and signature checks through upgrades.

Source references below refer to inspected `main`, newer than the checkout. Trust-boundary code: `desktop/src/{main,forward-core,update-core}.js` and `web/src/lib/voice-identity.ts`.

The architecture choice

| Approach | Reuse | Additional work | Judgment |
|---|---|---|---|
| Extend Electron | Existing interface, client logic, encryption, media and most shell code | Platform integration, installers, updates and tuning | Recommended starting point for desktop parity |
| Tauri | React and much TypeScript | Replace the Electron shell; prove media, authentication and persistent keys in each system webview | Consider after a prototype proves the hard features |
| Native Swift for Mac | Server, protocols and behavioral specification | Rebuild the Mac interface, state, media control, storage and integrations; retain another client for Windows/Linux | Appropriate if native Mac controls become a firm requirement |
| Flutter | Server and protocols | Rebuild the client in Dart, including UI, crypto/storage, audio processing and desktop integrations | A larger cross-platform rewrite |

Electron supplies one Chromium media engine. Tauri uses different engines on Windows, Mac and Linux. Their ability to make calls does not prove encrypted calls work. Prove voice, camera and screen encryption, key rotation and wrong-key rejection on each engine. [Tauri engines](https://v2.tauri.app/reference/webview-versions/), [LiveKit encryption checks](https://github.com/livekit/client-sdk-js/blob/v2.22.3/src/e2ee/utils.ts).

LiveKit Swift supports Scryproof's key-derivation method, but its default differs. Native clients need encryption interoperability and device-trust tests. [Swift key-provider source](https://github.com/livekit/client-sdk-swift/blob/2.17.0/Sources/LiveKit/E2EE/KeyProvider.swift).

The work, in order

1. Prove the difficult integrations in a packaged Mac build and a named Linux environment.

The current capture picker offers sound only on Windows (`desktop/src/share-menu.js:23`). Modern Electron documents macOS system audio, but that does not establish that Scryproof's custom picker works. Test a signed build on macOS 15 or later using the native system picker first, with microphone, camera, screen and audio permission descriptions. A reported custom-picker failure can return an ended audio track even when permission is configured. Check received audio samples, rather than accepting successful permission prompts. [Electron capture documentation](https://www.electronjs.org/docs/latest/api/desktop-capturer), [reported custom-picker failure](https://github.com/electron/electron/issues/52738).

Selected-game audio needs capture adapters; today's picker requests whole-system audio. The client already requests `restrictOwnAudio`; Electron 44 honors it on Mac and Windows. Comments saying desktop necessarily includes the call are stale. Verify exclusion with distinct game and call sounds. Linux needs separate routing proof. [Tagged capture handler](https://github.com/electron/electron/blob/v44.4.3/shell/browser/electron_browser_context.cc#L866-L879).

Global push-to-talk uses `uiohook-napi`. Test physical press and release with a game in front. macOS needs input-permission handling. The Linux hook uses X11; Wayland needs a separate backend and held-key proof. Add required adapters behind the existing desktop bridge. [Wayland shortcut portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html).

2. Complete desktop behavior and connection recovery.

Implement Mac Dock/menu-bar behavior, notifications that reveal the hidden window, startup settings and permission repair. Existing startup settings say Windows. Fully quit desktop apps currently have no push wake-up path; that remains outside the proposed lifecycle.

Handle lock, sleep, wake, audio-device changes and network switches. Reset a held push-to-talk key when its release might have been lost. There is a concrete retry gap to reproduce: a final media disconnect marks the session failed, while joining the same remembered call returns immediately (`web/src/lib/voice-session.ts:1452`, `web/src/state/store.tsx:1682`). Gateway reconnect has a separate rejoin path, so test media and gateway failures independently.

3. Ship platform installers and safe updates.

The current build emits only Windows NSIS. The shell updater downloads an `.exe` and launches Windows installer flags (`desktop/package.json:14`, `desktop/src/main.js:350`, `desktop/src/main.js:384`). Add manifests selecting OS and processor architecture, compatible install flows, and rejection of incompatible artifacts. Preserve signature verification with private release keys kept off the server.

Produce Apple silicon and Intel Mac builds, with Developer ID signing and notarization. Use installed electron-builder 26 settings. Native-hook binaries already exist for Mac, Windows and Linux; verify loading inside packaged apps. Add Linux package targets and release checks on actual hosts. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [builder 26 notarization](https://www.electron.build/v26/docs/features/code-signing/notarization).

Verify installation and upgrade preserve encrypted history, device identity, accepted devices and remembered encryption state. Non-extractable WebCrypto keys cannot simply be moved to a new runtime. Recovery does not automatically cover every older message. A rewrite needs proven device-to-device migration or recovery coverage before the old client is retired.

4. Measure and improve performance.

Establish a baseline on an 8 GB Apple silicon Mac, Intel Mac and Windows/Linux PC. Use 10,000-message histories, four-person encrypted calls, two 1080p30 shares, large uploads and a concurrent game. Record startup, CPU, memory, GPU and media quality. Before tuning, fix numeric release budgets from these baselines. Proposed UI target: 60 fps scrolling on 60 Hz displays, with no sustained memory growth when repeating the same workload. Startup and resource budgets remain unmeasured. Connection-panel latency, jitter, loss and relay measurements separate network problems from client work.

The clearest code-backed risk is long chat: older pages accumulate, every loaded row renders, and rows consume the whole-store context (`MessageList.tsx:855`, `state/store.tsx:1898`). Profile narrower subscriptions and rendering only visible rows first. Bound decrypted-message and image caches next; large encrypted uploads also buffer whole files. Defer optional screens where startup profiles justify it. Unwatched streams are already not fetched, and background animation already stops when hidden. These are possible improvements, not measured speedups.

5. Prove full feature parity and cryptographic compatibility.

| Test target | Required proof |
|---|---|
| Apple silicon and Intel Mac | Install/update; permissions granted, denied and revoked; PTT under a foreground game; capture with sound; sleep/wake; notifications; historical decryption |
| Windows | Existing-install upgrade; normal and elevated games; PTT release across lock/sleep; capture sound without call feedback; device switching |
| Linux X11 | Named distributions; package/update; actual global PTT; capture/audio; tray/startup; historical decryption |
| Linux Wayland | Named GNOME/KDE environments; portal capture; held-key shortcuts; audio routing; explicit unsupported-case behavior |
| Mixed operating systems | Encrypted voice, video and simultaneous shares; membership key rotation; wrong-key frames decode nothing; network and device changes |
| Product parity on every platform | Chat/DMs, roles, mentions, search, uploads, encrypted history, reactions/replies, voice messages, soundboard/effects, events/polls and games; reuse existing tests and add packaged checks |
| Every release | Tampered/interrupted/incompatible updates rejected; local profile retained; no private content in OS notifications; no unexpected outbound services |

Existing browser and development-Electron tests are useful foundations. They do not prove packaged Mac behavior, physical background key events, or signed installer replacement. Run release-artifact checks without weakening shipping Electron security settings.

Start with packaged Mac encrypted calls, capture, background push-to-talk and profile-preserving upgrade. A rewrite needs either a measured limitation surviving focused fixes/native adapters, or a firm requirement for a native interface.
