# Activities

Activities are standalone browser games. Drain The Swamp is the first, single-player activity. The picker appears in the server rail and in the call dock. A player can stay in voice, share the Scryproof tab/window, and let other participants press **Watch** on the existing stream. Screen sharing stays in the existing per-sender E2EE call. Opening a game never shares a screen automatically. Back to Scryproof keeps the iframe alive and stops any share initiated by the Activities player before exposing chat; preexisting shares remain under their own controls.

## Isolation

The app embeds `https://activities.scryproof.com/drain-the-swamp/` in a sandboxed iframe. This hostname resolves to the same box, but is a different browser origin. Scripts and same-origin storage are allowed for Godot's engine and saves; top navigation, popups, forms, camera, microphone and capture are unavailable to the game. The app accepts only ready/error/ended messages from the exact game origin and its own iframe window. No call keys, member information or session tokens are sent into the game.

The static service is separate from Scryproof and has no backend or database. Root-owned files live in `/srv/sites/scryproof-activities/releases/` on the encrypted `/srv/sites` mount. The `scryproof-activities` user serves them read-only through its own nginx and unix socket. AppArmor is enforced; the service cannot access Scryproof's release, data, credentials, Git repository or home directories. Memory is capped at 64 MB and CPU at 25% of one core. The public router strips Cookie/Authorization, caps download concurrency and rate, and has no access log. Game simulation and rendering happen on the player's computer.

## Build and publish

Do not export or install Godot on the live box. Use Godot **4.6.3 stable**, and the official `web_nothreads_release.zip` template. Verify downloads against the official release asset SHA-256 digests first.

```sh
GODOT=/path/to/Godot_v4.6.3-stable_linux.x86_64 \
GODOT_WEB_TEMPLATE=/path/to/web_nothreads_release.zip \
python3 scripts/activities/build-drain-the-swamp.py ~/CodeProjects/DrainTheSwamp
python3 scripts/activities/test-release.py
bash scripts/activities/publish.sh
```

The builder uses a clean, committed checkout, copied to temporary storage. It makes a single-threaded export with PWA/service workers disabled, moves inline startup code into a file, and pins asset URLs to an immutable release. The manifest records the source revision and SHA-256 of every exported file. The installer rejects symlinks, paths outside the export, duplicate members, missing files, unexpected extensions, mismatched hashes and oversized exports before writing. It stages a complete release, sets root ownership/read-only permissions, and atomically replaces `current`. App and game deployments are independent. Each upload has a unique temporary directory, and a host lock serializes release installation.

The stable `/drain-the-swamp/` page is revalidated. Its assets use `/releases/<id>/drain-the-swamp/`, so an in-flight launch cannot mix files from two versions. Old releases remain available to active players. Saves remain in the game's browser IndexedDB at the stable game origin; they are device/browser-local, not cloud or account saves. Keep this hostname and game project identity stable. Do not promise GitHub Pages saves will carry over.

Publish prints the previous release. Roll back by replacing only the activities `current` symlink with that previous, verified release, using a temporary symlink and `mv -Tf`. No Scryproof restart is needed. Check `/health`, the hosted manifest, and launch in a browser afterward. Keep at least the current and previous releases; manually remove older root-owned release directories only after players have finished with them. Neither Scryproof's release pruning nor its database backup owns these files. After a server restore, reprovision and republish the export.

## Provision a fresh host

Add the hostname's DNS A record, copy `infra/activities/` to the box, and run `provision.sh` as root after unlocking the vault. It obtains a separate Let's Encrypt certificate using the existing account, installs the profile and resource-limited service, validates nginx before reloading, and installs a separate router file. It does not alter Scryproof's router, service, database or secrets. Normal certbot renewal covers this certificate too. The existing LiveKit renewal hook is narrowed to its own certificate lineage (with a backup retained), so renewing the game certificate reloads nginx without restarting calls.

Scryproof's web CSP must permit exactly `frame-src https://activities.scryproof.com`. This is in the app nginx template; an existing site's rendered nginx configuration must be updated/reapplied too. Do not broaden the app's script-src or connect-src. Its session cookie is host-only and never goes to the game hostname.

## Desktop release

Older shells prohibit all frames. Desktop 0.5.5 permits only the activities origin, denies game-frame device permissions and subframe navigation to other origins, and keeps the preload bridge in the main frame. The client checks this capability and offers browser play on older shells. A signed client update alone cannot change the shell CSP: Wes must build/sign/publish the **0.5.5 installer** with the existing workstation key. Never generate a replacement key or copy it onto the box. After the reviewed branch is merged and deployment is approved, Wes's existing Windows workstation workflow is:

```sh
cd desktop && npm run dist && cd ..
bash scripts/release.sh
bash scripts/publish-installer.sh
```

Before deploying, apply the app nginx template's two narrow `frame-src` additions to the existing rendered configuration, keep a backup, validate the per-site nginx configuration and reload it. The app build alone does not regenerate that configuration. Verify the served app CSP afterward.

## Local verification

```sh
# Separate local API, database and game origin:
DATA_DIR=/tmp/scryproof-activities-dev PORT=8797 PUBLIC_URL=http://localhost:5179 npm run dev --workspace server
SEED_BASE=http://127.0.0.1:8797 npm run seed --workspace server
API_PORT=8797 WEB_PORT=5179 VITE_ACTIVITIES_ORIGIN=http://localhost:5180 npm run dev --workspace web
python3 scripts/activities/dev-server.py
npm run dev:livekit
```

The dev server maps immutable asset paths from the export manifest. Browser verification must check real pixels at the watcher, not just published tracks or decoder statistics. Chrome's generic fake-media flag can select a fake screen or the desktop instead of a tab; select the player tab explicitly and assert `displaySurface === 'browser'`. Keep synthetic microphones and local test accounts confined to development.

### Reproduce browser checks

Install Playwright in a temporary tooling directory, or set `PLAYWRIGHT_MODULE` to an existing installation's absolute `index.mjs`. These checks use Chrome at `/usr/bin/google-chrome`; the call check needs a real display and selects the player tab explicitly. Start the local services above, then run:

```sh
node scripts/activities/check-call.mjs
node scripts/activities/check-hosted-game.mjs
node scripts/activities/check-desktop.mjs
```

The call check uses only the seeded local Wes/Alex accounts and synthetic microphones. It checks visible video pixels, E2EE, capture surface, share stop on return, frame preservation, an aborted engine download and retry, and recovery after quitting. The hosted check uses a test parent document intercepted at the Scryproof origin, with the **real HTTPS game** inside it; it checks isolation and writes nonzero played progress to IndexedDB before reopening. It does not represent a signed-in production Scryproof session. The desktop smoke requires a local Electron install and built `web/dist` with the production game origin.

### Verification recorded 2026-10-02

- Typecheck, server/web production builds, all 48 web test files, six adversarial export validation checks, and desktop permission tests passed.
- Two local browsers and local LiveKit carried real game pixels over the existing encrypted screen share. Returning stopped that share and kept voice connected; reopening retained the same game frame.
- Real HTTPS game origin blocked parent access, app API requests, camera/microphone capture and desktop bridge access. Nonzero played progress (0.105 water/drained) persisted; reopening offered Continue.
- An aborted WASM download recovered through Try again without dropping voice. Godot 4.6.3's title-screen Quit raises a browser audio cleanup error; the player catches it and offers a working retry.
- Actual Electron shell smoke verified the hosted game and frame isolation. Windows capture, installer signing, real phone play, and a two-person call on production remain unverified. The existing Linux native push-to-talk test needs display hardware information unavailable in this environment.

The static game is live at https://activities.scryproof.com/drain-the-swamp/. The browser Activities feature is live on Scryproof after Matt approved deployment on 2026-10-02; deployed source revision `fb40904326ee3f778dab17919deae4bfe0f88c5b`. The served bundle, health, and narrow frame policy were checked. Older desktop shells cannot embed it until Wes publishes the signed 0.5.5 installer and signed client using the existing workstation key.

## Mobile activity fixes (prepared 2026-10-02)

The player uses a compact toolbar for narrow windows and devices whose primary
pointer is touch. This stays compact when a phone rotates beyond chat's 640px
breakpoint, including tablet layouts. It uses the dynamic viewport height and
safe-area padding; a portrait hint recommends turning sideways. Extra controls
sit in Options, and Back closes that panel before minimizing the activity.
Rotation, menus, and returning to chat keep the same game iframe alive. Browsers
without screen capture show the reason instead of offering a broken share action.
An active screen share stays labeled in the compact toolbar.

The game also needs a source fix: its first touch disabled the mouse emulation
Godot's menu buttons rely on. Keeping emulation on fixes New Game, character
selection, HUD Menu and Resume. A separate mouse scoop binding, ignored while
touch controls are enabled, prevents arrow taps from scooping and keeps held
multi-touch actions independent. Touch players get touch instructions.

Matt's tested game source is preserved in his DrainTheSwamp checkout as
`fix/scryproof-mobile-activities` (`89f8505`, based on the hosted `b26ac6e`). The
local export tested here is `abfb48855954-6a9b4e6fd8e6`; the later commit adds only
the regression test. A separate upstream-based review branch contains just the
mobile fix: `/tmp/scryproof-mobile-game-pr`, `fix/mobile-touch-menus-review`.
Upstream master is older than the hosted source; rebuilding from it would remove
existing gameplay changes. Do not deploy that older base over the activity.

After Wes's review, publish the game from the preserved hosted-source branch
using the existing validated export/publish flow, and release the Scryproof
client normally. There is no desktop shell change and no new EXE requirement.
The source checkout used by the builder must be clean. A fresh temporary clone
with `--branch fix/scryproof-mobile-activities` avoids switching Matt's working
checkout. Production and the game save origin have not been changed.

### Mobile verification

With the local services described above, including the fixed game export:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs MOBILE_CALL=1 \
  node scripts/activities/check-mobile.mjs
```

This uses Chrome touch emulation and the seeded local account only. It exercises
actual Godot touch input through the separate-origin iframe, selects Piggy, moves
and scoops, opens the HUD menu, rotates through phone/tablet sizes, navigates Back
through Options and the end confirmation, and saves/reopens nonzero progress.
With local LiveKit it also checks the existing encrypted call stays connected.
The check covers 390×844, 844×390, 375×667, 667×375, 768×1024, 1024×768,
800×1280 and 1280×800 viewports. The capture-unavailable branch is simulated
because desktop Chrome still exposes that API during mobile emulation.

The actual two-browser sharing regression also passed: the watcher received game
pixels over encrypted media, returning stopped the owned share, and load failure,
retry and game-exit recovery kept the call connected. Typecheck, production web
build and all 49 web test files passed. Godot input regression passed on both the
hosted-source branch and the upstream review branch. Physical iPhone, iPad,
Android phone/tablet and home-screen PWA checks remain outstanding; desktop Chrome
emulation cannot prove browser chrome, safe-area dimensions, Safari audio or
native orientation behavior. Nothing from this mobile fix has been deployed.

The Scryproof changes are in [PR #5](https://github.com/MilkManManiac/Scryproof/pull/5).
A desktop mouse regression also exercised the actual local app: keyboard movement
followed by a held mouse click produced 0.030 water before the idle auto-scoop delay.
