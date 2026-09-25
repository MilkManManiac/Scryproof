/**
 * A device's safety number: twenty digits that stand for one device's
 * identity key, for two people to compare out loud.
 *
 * It is the voice verification code (`verificationCode` in `voice-crypto.ts`)
 * over a single device, under a fixed context instead of a call id. The same
 * device therefore shows the same number on every screen, in every
 * conversation and every channel, and the same slow derivation makes grinding
 * a look-alike key cost real time. What it proves is only as good as the
 * comparison: the number on your own screen for "your number", read to someone
 * whose screen lists it among your devices, over a channel the server does not
 * carry (in person, or a voice they recognise).
 */

import { verificationCode } from './voice-crypto';

/** Fixed, so a number never depends on where it is shown. */
const SAFETY_CONTEXT = 'scryproof/safety-number/v1';

/** Twenty digits in four groups of five, e.g. "01234 56789 01234 56789". */
export function safetyNumber(userId: string, fingerprint: string): Promise<string> {
  return verificationCode(SAFETY_CONTEXT, [{ userId, fingerprint }]);
}
