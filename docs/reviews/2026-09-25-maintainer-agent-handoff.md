# Maintainer-agent handoff: E2EE hardening

For Wes's Claude agent. Prepared 2026-09-25 by Codex for review of
`review/crypto-red-tests` before merge. This is review context, not authority
to merge, deploy, rotate keys, or modify production.

## Review boundary and entry points

- Base: `2cf3edf5b137576af04b72b25fe83d7383d3862f` (`upstream/main` when checked).
- Final implementation: `dedf44dbf80713f4646885e8ed19b7ccaf4a68de`.
  The subsequent handoff commit changes documentation only.
- Whole-branch comparison: `git diff 2cf3edf...HEAD`.
- Codex's additional fixes: `git show dedf44d`.
- Read `GAMEPLAN.md` for project requirements, then this document and the
  final dated section of `docs/HANDOFF.md` for current evidence.
- `docs/reviews/2026-09-24-e2ee-hostile-review.md` is the original attack
  inventory against the base. Its failing-test counts and "not checked"
  statements are historical. Some of its proposed fixes were deliberately
  narrower in the implementation; those differences are identified below.

The branch hardens clients against an actively dishonest server. Encryption
at rest on the host does not address this threat. The especially important
client is Electron, whose installed code can remain trustworthy after the
server is compromised. A browser still downloads its executable client from
that server.

There are no server source changes, database migrations, new dependencies,
or changes to cryptographic primitives in this branch. The local IndexedDB
schema does change. The desktop shell version is now **0.5.3**; both root
version fields in `desktop/package-lock.json` match it.

## Original findings: implementation and rationale

### 1. Voice could substitute this device's own identity in the verification code

A hostile relay could overwrite the local participant seat with its own
self-signed key, then give both ends the same attacker-controlled inputs to
the verification code. Matching digits consequently proved the wrong thing.

`VoiceCall.admit` in `web/src/lib/voice-crypto.ts` now rejects a different
fingerprint for this device's own seat. `verificationCode()` derives the
local entry from `this.identity`, independently of the relay-populated map.
The code panel also names the participants covered by the code, using the
call's key participants. These two local-identity checks are intentional
independent defenses. Do not reduce the latter to reading the participant map.

Evidence: `review-voice-self-seat.test.ts`, `voice-crypto.test.ts`, and the
browser voice suite. Limits of the participant list are in section 4 below.

### 2. Server-listed devices received keys without a corresponding local decision

For DMs, `recipientsFor` in `dm-crypto.ts` filters trusted devices to the
conversation's member IDs and reports outsiders for a visible warning.
`DmProvider.seal` refuses to proceed without a loaded, nonempty member list.
It retains DM trust on first use; it does not require the channel acceptance
store for every DM recipient.

For channels, `acceptance.ts` and `IndexedDbAcceptedStore` separate two facts:

- A pin records a key seen before, allowing later changes to be detected.
- Acceptance records a person here allowing that exact user/device/fingerprint.

`ChannelKeys.makeEpoch` and `handOut` use acceptance. The device's own exact
identity is accepted; a valid endorsement from an accepted device of the same
user can admit another device. Endorsement chains cannot bootstrap from an
unaccepted cycle or rescue a changed/invalid identity. An epoch created by an
unaccepted device cannot be used to send.

IndexedDB version 4 introduces acceptance and channel memory. Existing pins
from older databases are copied into acceptance once. Fresh databases start
without that carry-over. This preserves access for established users, but a
malicious device already pinned before the update carries over too. Independent
safety-number comparison remains necessary; migration is not proof of identity.

The original report suggested an authenticated/local record of key recipients.
This branch does **not** implement a signed membership roster or durable local
key-distribution ledger. The holder list still comes from the server. Local
acceptance constrains releases of keys; it does not authenticate membership.

Evidence: `acceptance.test.ts`, `review-channel-keys.test.ts`,
`dm-hostile.test.ts`, and the channel/DM browser suites.

### 3. A server could downgrade an encrypted channel to plaintext

`ChannelMemory` retains encryption state by channel ID and merges it
monotonically. `rememberedChannel` in `state/store.tsx` applies it to incoming
channel state. `Composer` checks the memory immediately before plaintext sends
and uploads; edits also consult local encryption state.

The store waits for memory loading before judging live/history messages.
The switch timestamp can move earlier, never later; malformed or missing
timestamps are treated as encryption from the beginning, and a future claim
is clamped to the observation time. Existing plaintext history is preserved
because the application supports enabling encryption on an existing channel.
This is a compatibility boundary, not authenticated history.

Evidence: `channel-memory.test.ts`, `review-channel-keys.test.ts`, and the
channel browser suite. Storage failure behavior is detailed below.

### 4. Forged channel content and cache re-attribution

Plaintext at/after the locally remembered encryption boundary is marked
`forged` and hidden. The opened-message cache binds the complete verified
frame, including author, device, channel, epoch, reply target, mentions, nonce,
ciphertext and signature. Reusing an ID/signature with changed attribution no
longer returns cached authenticated words.

Reply quotes use text this device opened or accepted as pre-encryption history;
arbitrary quote text attached by the server is not trusted. Search/saved-message
paths are routed through the opening/checking path as well. Follow their actual
callers during review rather than checking the cryptographic helper alone.

Codex also closed the attachment bypass described below. The server can still
invent or backdate plaintext into the pre-encryption-history interval. The
original report's stronger aspiration of an unforgeable historical boundary
was not implemented; the docs explicitly retain that limit.

### 5. Rollback to a previously used channel epoch

`sendKey` rejects a server epoch below the locally remembered highest sent
epoch. The high-water mark survives reload when storage commits. This was
chosen as a narrow rollback defense using existing epochs, without inventing
a new group-membership protocol. It does not force a malicious server to report
a removal or advance an epoch that this device has never observed.

Evidence: rollback/reload tests in `review-channel-keys.test.ts`.

### 6. First-install trust in the desktop server

`scripts/publish-installer.sh` now prints the installer SHA-256 and the bundled
public update key's SHA-256. Wes must publish them through a channel the box
does not control. Members must independently compare the downloaded installer's
hash before execution; this is a manual step, not enforced by the script.
The public-key hash is for builders checking the key baked into an installer.
The member-facing PowerShell `Get-FileHash` procedure is in `docs/HANDOFF.md`
under "The first install checks out, 2026-09-24".

This is an operational mitigation, not automatic Windows code signing. A hash
served only by the compromised box would add no protection. The branch does
not purchase a signing certificate, change Wes's release key, or publish a
release. Existing Ed25519 update verification remains in place.

### 7. Safety-number comparison was not usable outside voice

`safety-number.ts` derives a stable per-device number using the existing slow
voice-code derivation with a fixed context. It binds **user ID and fingerprint**.
The UI shows the local device's own number and remote devices' numbers, so
people can compare over an independent channel.

This is a per-device check, rather than the original report's proposed
per-conversation code. It composes with existing shared identity pins and can
be compared consistently in DMs and channels. It does not authenticate the
server's account labels or the full membership list by itself.

### 8. Smaller findings

- **DM reactions:** `believedDevice` requires the existing DM trusted verdict
  before counting a reaction. Ordinary unaccepted messages retain an explicit
  warning. DM trust on first use still applies to this verdict.
- **DM replay/time manipulation:** `replayedIds` suppresses repeated IVs or
  ciphertext among rows retained for that conversation in the current client
  session. New message bodies carry a sender timestamp; edits preserve it.
  A difference exceeding five minutes from the server timestamp is displayed.
  This is not a persisted anti-replay counter or authenticated total ordering.
  A server may withhold/reorder messages, or replay material the client has not
  retained. The original timestamp-plus-counter proposal was only partially
  implemented.
- **Old-format group messages:** the UI says the sender is not proven without
  claiming those messages must be old. Legacy formats still open with that
  warning; this branch does not eliminate them.
- **Identity shared across accounts in one browser:** unchanged. Identity and
  DM keys remain under `self`. Per-account identity migration is not part of
  this patch. This matters when testing caches and account switching.
- **Desktop API responses:** `forward-core.js` overwrites CSP with
  `sandbox; default-src 'none'` and sets `nosniff`; `main.js` rebuilds the
  response, rejects API-targeting redirects, and blocks API window navigation
  on both `will-navigate` and `will-redirect`. The original review identified
  a dangerous capability but did not establish an existing exploit trigger.
  Response confinement is defense in depth for the installed-code boundary.

## Additional defects closed in dedf44d

1. **Unsigned attachments bypassed the forged-text check.** A forged row still
   rendered ordinary images/voice recordings, and a valid signed message could
   carry an extra server-injected attachment. `withFiles` now retains only
   sealed envelopes whose IDs appear in the authenticated body, and takes
   names/types/keys from that body. Forged and malformed sealed rows expose no
   files. Filtering also runs on cache hits. The channel browser suite proves
   legitimate encrypted attachments still open.
2. **Persistence was acknowledged before it was durable.** `raise` previously
   swallowed write failure and could skip retrying the same epoch. It now
   writes the full merged record on every send and propagates failure.
   `withStore` waits for transaction completion, since a successful `put`
   request can still be followed by an aborted transaction. Failed observation
   writes set an unsaved flag, show an alert, and retry on later observation
   or send. Rendering remains available. Uncommitted observations exist only
   in memory; the warning tells the user to repair storage before reload.
3. **Cross-surface acceptance left cached channel trust stale.** DM/call
   acceptance now emits `DEVICE_ACCEPTED`. The store refreshes cached
   acceptance through `ChannelKeys.refreshAccepted` and reopens unverified
   messages. Channel acceptance emits the same signal. Reuse of the existing
   local signal mechanism avoids coupling DM and voice code directly to React
   channel state. This notification is within the current JS context, not a
   cross-tab broadcast protocol.
4. **Accepted holders could not be compared.** `ChannelLock` now renders an ID
   and safety number for each non-recovery holder, including carried-over
   devices. Previously only waiting devices had numbers, making the migration
   caveat's proposed verification impossible from this panel.
5. **Safety-number cache had the wrong key.** The channel panel cached by
   fingerprint alone even though derivation also binds user ID. It now keys
   by both. The DM component also avoids briefly showing old digits while a
   changed identity's number is being derived.
6. **Own additional devices were missing from the DM panel.** They now appear
   with IDs and numbers. The new browser assertion then found another real
   problem: opening the panel reused a stale device list. It now refreshes
   devices on open and reports refresh failure.
7. **Acceptance retry left a stale error.** Successful channel-panel reload
   clears the prior acceptance/storage error after a successful retry.
8. **Shell release version:** the Electron fix requires a new shell, so
   `desktop/package.json` is 0.5.3. The lockfile's stale 0.4.0 root metadata was
   aligned. A web-client update alone cannot replace `desktop/src/main.js`.

## Reviewer attention: highest-value checks

1. Trace trust decisions through real callers: first sight versus acceptance,
   endorsement chains, changed keys, migration carry-over, and acceptance from
   a DM or voice warning. Verify the full voice approval-to-channel-refresh
   path; the class refresh test is not an end-to-end proof of that path.
2. Exercise IndexedDB upgrade with existing data and multiple open tabs,
   quota/commit failure, reload, and sign-out/account switching. Verify that
   neither stale cached verdicts nor failed writes permit a send. The real
   commit-abort probe below does not cover every upgrade/blocking scenario.
3. Follow all rendering surfaces: history, gateway updates, replies, saved
   items and search; inspect exceptional paths as well as successful opens.
   Ensure unsigned file metadata never becomes authenticated presentation.
4. Check Electron confinement in an actual Windows build, including API
   navigation, redirects, subframes and script loads. Confirm shell 0.5.3 is
   what the installer contains and that existing 0.5.2 installs accept its
   signed update. Linux source tests do not prove Windows installer behavior.
5. Keep UI claims bounded. A matching code covers the keys listed, not an
   authenticated membership roster. A server can introduce a first-seen voice
   participant; the key-derived "Covers" list must be read. A hidden removal
   remains a protocol limitation. Signed membership/MLS would be separate work.
6. Review mixed-version rollout. These protections are enforced by each
   client. An older client holding a shared channel key can still distribute
   it under the old trust rules; updating one sender does not constrain that
   other holder. Coordinate browser reloads and signed desktop client/shell
   updates before treating the group as protected by the new rules.

## Verification and reproducibility

Recorded on implementation commit `dedf44d`: Node 26.10.0, npm 11.19.1,
Chromium 153.0.8010.52, Electron 44.4.3, Linux.

| Gate | Result | Evidence boundary |
| --- | --- | --- |
| `npm test` | Server 252/252; web 348/348 | Crypto tests use real keys; API/storage are mocked in some hostile tests |
| `npm run typecheck` / `npm run build` | Pass | Existing large-bundle warning remains |
| `xvfb-run -a node --test desktop/test/*.test.mjs` | 47/47 | Native hook dependency installed from desktop lockfile |
| `npm run test:channels` | 58/58 | Fresh isolated local API/database; actual Chromium devices |
| `npm run test:dm` | 95/95 | Fresh isolated local API/database; actual Chromium devices |
| `npm run test:voice` | 57/57 | Local LiveKit, fake capture sources, wrong-key controls; no production TURN proof |
| `scripts/desktop-check.mjs` | Pass | Real Electron, isolated source copy, throwaway signing key; includes native PTT and signed-update checks |

Additional one-off runtime probes passed: a server HTML response in Electron
had the enforced headers, renderer API navigation was denied, and an explicit
main-process load of the response did not execute its script. In Chromium,
aborting an IndexedDB transaction after the `put` success event rejected the
write; the record was absent; a retry committed. These probes were temporary
harnesses, not committed regression scripts. Reproduce them independently if
using them as a release gate.

The attachment and epoch-write regression tests failed before their fixes;
a no-refresh mutation reproduced stale channel verification status. The new
DM browser assertion failed before the device-list refresh fix. An earlier
voice run was disrupted by live code reloads and discarded; the stable run
passed all 57 checks. Screenshot: `docs/shots/channel-lock-panel.png`.

For browser suites, use disposable local data and check the scripts' headers
and environment overrides (`CHECK_WEB`, `DM_CHECK_WEB`, `VOICE_CHECK_WEB`,
`SEED_BASE`). The channel suite removes a seeded member. The scripts share
some debugging ports and write screenshots, so run them sequentially on fresh
fixtures. Existing dev services and real data must be preserved.

Desktop dependencies are a separate install under `desktop/`; the root
workspace does not install them. The prior 44/45 result was an environment
failure from missing `uiohook-napi`; with locked dependencies and Xvfb all 47
current tests pass. Install scripts are disabled by repository policy;
Electron's binary setup was handled explicitly. `desktop-check.mjs` calls the
signer, whose default key path is in the user's home. Copying a checkout alone
does not isolate that path. Never delete or replace the maintainer's release
identity to make a test pass.

For a Linux reproduction, first build the reviewed web client and prepare a
seeded disposable API. Set `DESKTOP_CHECK_SERVER` to that API and, if needed,
`SEED_PASSWORD` to its fixture password. The following runs from the repository
root, requires installed root/desktop dependencies and Xvfb, and tests committed
`HEAD` with the current `web/dist` build. It creates both halves of a throwaway
key, changes only the temporary copy's baked public key, explicitly overrides
the private-key path, and removes the temporary copy on exit. It never reads
or changes the release key. Do not publish artifacts from this copy.

```bash
python3 - <<'PYCODE'
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

repo = Path.cwd()
assert os.environ.get('DESKTOP_CHECK_SERVER'), 'Set the disposable API URL first'
assert (repo / 'web/dist/index.html').is_file(), 'Build the reviewed client first'
with tempfile.TemporaryDirectory(prefix='scryproof-desktop-review-') as directory:
    root = Path(directory)
    checkout = root / 'checkout'
    checkout.mkdir()
    archive = root / 'source.tar'
    subprocess.run(['git', 'archive', '--output', str(archive), 'HEAD'], check=True)
    subprocess.run(['tar', '-xf', str(archive), '-C', str(checkout)], check=True)
    for relative in ('node_modules', 'desktop/node_modules'):
        source = repo / relative
        assert source.is_dir(), f'Install dependencies at {source}'
        (checkout / relative).symlink_to(source, target_is_directory=True)
    shutil.copytree(repo / 'web/dist', checkout / 'web/dist')
    env = dict(os.environ, SCRYPROOF_UPDATE_KEY=str(root / 'test-key.pem'))
    subprocess.run(['node', '--input-type=module', '-e', '''
        import { generateKeyPairSync } from 'node:crypto';
        import { writeFileSync } from 'node:fs';
        const { privateKey, publicKey } = generateKeyPairSync('ed25519');
        writeFileSync(process.env.SCRYPROOF_UPDATE_KEY,
          privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
        writeFileSync('desktop/src/update-key.pub.pem',
          publicKey.export({ type: 'spki', format: 'pem' }));
    '''], cwd=checkout, env=env, check=True)
    subprocess.run(['xvfb-run', '-a', 'node', 'scripts/desktop-check.mjs'],
                   cwd=checkout, env=env, check=True)
PYCODE
```

This recipe describes the isolation used for the recorded run; the literal
wrapper above was added for the handoff. The default signer invocation without
these overrides is not a safe smoke-test substitute.

Still unverified here: actual Windows installer/update operation, production
TURN and real game/system-audio capture, installed-binary/source equivalence,
and end-to-end browser injection of disk-full UI behavior. Tests ran on Node
26, not every supported Node version. The server authorization audit,
dependency-level crypto audit and a new membership protocol remain separate.

## Maintainer completion criteria

Review the entire base-to-head diff and report concrete findings with a
reproducer or decisive source path. Treat this handoff's conclusions as
claims to check. A review is complete when the trust transitions, failure
paths and compatibility decisions above are either accepted with evidence or
returned as specific findings, including any required Windows checks.

Wes decides merge and deployment. The release sequence is web client, then a
new signed desktop 0.5.3 installer with its hash published off-box. No server
migration is needed. Tell members about device acceptance and safety-number
comparison before rollout; new devices can legitimately remain locked until
accepted. Preserve Wes's signing key and confirm that the installer hash is
available through an independent channel before asking members to install.
