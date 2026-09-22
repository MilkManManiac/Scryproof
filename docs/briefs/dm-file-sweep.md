# Sweep unclaimed DM uploads

Read `docs/briefs/README.md` first.

## The job

`server/src/services/upload-sweep.ts` deletes channel attachments
(`attachments` table) that were uploaded but never attached to a message
within the grace period. DM uploads (`dmFiles` in `server/src/db/schema.ts`,
written by `server/src/routes/dms.ts`) have the same `messageId`-is-null
state and the same leak, and nothing sweeps them.

Extend `sweepUnclaimedUploads()` so one pass covers both tables, with the
same cutoff, the same `deleteObject` tolerance, and one log line that says
how many of each were removed. The return value stays a number: the total.

## Files

- `server/src/services/upload-sweep.ts`
- `server/src/tests/upload-sweep.test.ts`: add the DM case the same way the
  attachment cases are written (unclaimed old row goes, unclaimed fresh row
  stays, claimed old row stays).

## Not the job

Changing how DM files are uploaded or claimed. Changing the grace period.
Touching the client.
