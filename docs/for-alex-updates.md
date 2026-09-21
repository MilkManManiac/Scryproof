# Running log: things Alex may want to hear about

`docs/for-alex.md` is the note as it was sent on 2026-09-21. It stays as sent.
This file is what has happened since: anything we did around bonesdeploy that
he might want to know, whether a claim in the note turned out right or wrong
once it was actually run, and any place we touched something his tool manages.

Rules for this file:

- Write the entry when the thing happens, not at the end.
- Say whether it was run or only read. The note was all reading.
- If a claim in the note turns out wrong, say so here plainly. He should hear
  that from us before he spends time on it.
- Anything we change on the box that bonesdeploy owns (the router config, its
  units, its directories) gets an entry, with what we changed and why.

## 2026-09-21

- **Decided to run the CLI under WSL** rather than wait for an answer on item 9.
  Nothing of his is bypassed: it is his tool on Linux, which is the platform it
  targets. If he replies "use WSL", we already have. Worth telling him how it
  went either way, since the note asks whether anyone has done it.
- Nothing of bonesdeploy's has been run yet. Every item in the note is still
  unverified.

## Still to find out, and report back

- Item 9: does `cargo install` of the CLI succeed under WSL (Ubuntu), and does
  `native-mux` SSH work from WSL to the box with Wes's key?
- Item 1: do WebSockets really fail through the stock router? Test before
  touching the router. If they fail, stop and ask him before editing his file.
- Item 2: does a 2 MB upload really get a 413 from the router?
- Item 5: does argon2 fail to load under the stock AppArmor profile, or only in
  my reading of it?
- Item 6: does `init` overwrite `infra/custom/runtime.py` as read?
- The two open questions: 1 GB with swap off for `server setup` and the build;
  `/srv/sites` and `/srv/conf` pre-existing as bind mounts.
