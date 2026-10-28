# Lane brief: the tests worth keeping, at the end of a wave

Read `docs/briefs/agent-channel/preamble.md` first. Its "you write no tests" rule is for build lanes; you are the exception it names. This build's rule (Trey, 2026-10-27): builders write only product code, and at the end of each wave a few lanes like you decide, with the `test-value-audit` skill, which few high-quality tests the new code actually needs, and write only those.

## Load the skill first

Load it with the `skill` tool: name `/Users/treygoff/Code/agent-estate/skills/test-value-audit` (an absolute path; if the tool cannot load it, `read` `/Users/treygoff/Code/agent-estate/skills/test-value-audit/SKILL.md` directly). You are in its **authoring gate** mode: every test you would add passes its four questions and none of its junk patterns, or you do not add it. Its audit and campaign modes are not your job, except where a test the builders broke is one to delete rather than repair.

## Your inputs

Your task names the slice or slices, their merged commits on `agent-channel`, and the builder reports. For each slice:

- the "Tests" list in its brief under `docs/briefs/agent-channel/`, and the phase's test list in `docs/agent-channel-spec.md` section 7;
- the builder's report: the existing tests its change deliberately broke, and the behaviours it thinks most deserve a test;
- the code itself (`git diff <base>..<merge>` for the slice).

Those lists are candidates, not a quota. The brief lists were written before the no-tests rule and are generous on purpose. The bar is the skill's: one owner test at the strongest real boundary for each contract worth protecting, a credible regression that would make it fail, and no second test for a contract another test already owns. Extend an existing table (the route-authorization matrix, an existing tokenizer table) rather than adding a file when a table is the owner. A security wall (who can reach what, what an agent can never do) and an invariant the whole app relies on (no HTML sink in the client) are the kinds of contract that clear the bar easily; a test that restates the code's own constants does not.

## The job

1. Repair the existing tests the builders broke on purpose: update each assertion to the behaviour the spec now asks for, or delete the test if the skill's retention bar says its contract is gone. Say which for each.
2. Run the authoring gate over every candidate. Write the ones that pass, at the strongest boundary the repo already uses (Fastify `inject` or real HTTP for routes, the real tokenizer for rendering, the built `scry` for CLI contract behaviour).
3. Red-proof every test you write: break the behaviour it guards in the product code, watch it fail for that reason, restore, watch it pass. Name the mutation in your report.
4. If a test exposes a real product bug, fix the product code when the fix is small and inside your slices, and say so; otherwise leave the test out of the commit, and report the bug with the failing test's text so the coordinator can route it.

Run only the files you touch and their neighbours, through `testrun scryproof unit-<your lane> -- …`, plus `npm run typecheck`. Not the whole suite and not the gate.

## Report

- A table of every candidate: written (file and test name), folded into another test (which), or rejected (which gate question it failed, in a few words).
- Existing tests repaired or deleted, with the reason.
- The red-proof mutation for each test written, and the exact output of your final runs.
- Product bugs found: fixed (commit) or reported (with the failing test).
- Test lines added and removed, separately from product lines.
