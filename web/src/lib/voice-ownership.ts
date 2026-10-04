/**
 * Asking the gateway for a call, and knowing whether it can answer.
 *
 * A gateway that implements call ownership answers a join with `voice_owned`
 * (or a `voice_replaced` / `voice_left` error) and the client waits for that
 * before it touches media. A gateway that does not (the deployed server runs
 * an older build) says nothing, ever, and a client that waited for it would
 * time out, tear the call down and re-announce itself every two seconds,
 * which every other participant sees as a membership change.
 *
 * So the difference is declared, not guessed: the `ready` frame of a gateway
 * that confirms ownership carries `voiceOwnership: true`. A timeout is never
 * the signal for "older gateway".
 */

import type { ClientEvent, ServerEvent } from '@scryproof/shared';
import { VoiceCallLeft, VoiceGatewayRefused, VoiceGatewayUnavailable, type CallPlace } from './voice-session';

export interface OwnershipGateway {
  readonly isOpen: boolean;
  send(event: ClientEvent): boolean;
}

export interface OwnershipDeps {
  gateway: () => OwnershipGateway | null | undefined;
  /**
   * What the connected gateway's `ready` frame said about confirming ownership:
   * true or false once it has arrived, undefined while this connection has not
   * had one yet (the capability is per connection and each reconnect brings a
   * fresh `ready`).
   */
  confirms: () => boolean | undefined;
  /** Hears every gateway event until the returned function is called. */
  listen: (listener: (event: ServerEvent) => void) => () => void;
  /** The `voice_state` payload for this request. */
  intent: (place: CallPlace, join: true | 'resume', requestId: string) => Extract<ClientEvent, { t: 'voice_state' }>['d'];
  /**
   * Only asked of a gateway that does not confirm ownership, and only for a
   * deliberate join. True when that gateway already holds this person in this
   * very room (a copy of the app on this account was bumped out of it, or this
   * device is taking it from another): the caller has dropped what it knew
   * about being there, so that the departure about to be announced is not
   * taken for being removed from the call being joined.
   *
   * Such a gateway changes a room's membership, and so its epoch, only when
   * the room changes. A join into a room it already holds gives the new call
   * no membership event and so no keys, ever. Leaving first makes the join a
   * real arrival.
   */
  leaveFirst?: (place: CallPlace) => boolean;
  newRequestId?: () => string;
  timeoutMs?: number;
}

/**
 * Tell the gateway this device is in the call, and resolve once the call is
 * this device's: true if so, false if another session holds it now. Rejects
 * with VoiceGatewayUnavailable (wait for the gateway; `ready` resumes the call),
 * VoiceGatewayRefused (a definite no) or VoiceCallLeft.
 */
export function requestVoiceOwnership(
  deps: OwnershipDeps,
  place: CallPlace,
  join: true | 'resume',
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const gateway = deps.gateway();
    if (!gateway?.isOpen) { reject(new VoiceGatewayUnavailable()); return; }
    const confirms = deps.confirms();
    // The socket is open but its `ready` has not arrived, so what this gateway
    // can do is not known yet. Say nothing to it: a join sent now would change
    // the call's membership before the client knows whether it can be answered.
    // `ready` resumes the call.
    if (confirms === undefined) { reject(new VoiceGatewayUnavailable()); return; }

    const requestId = (deps.newRequestId ?? (() => crypto.randomUUID()))();
    const payload = deps.intent(place, join, requestId);

    if (!confirms) {
      // An older gateway: the join is the whole conversation. It has no
      // `voice_owned` to send and no other session of this person to be
      // replaced by, so being sent is being owned.
      // Never for a resume: that would rotate the call's keys on every media blip.
      if (join === true && deps.leaveFirst?.(place)) gateway.send({ t: 'voice_state', d: { channelId: null } });
      if (!gateway.send({ t: 'voice_state', d: payload })) reject(new VoiceGatewayUnavailable());
      else resolve(true);
      return;
    }

    const finish = (): void => {
      clearTimeout(timer);
      stop();
    };
    const listen = (event: ServerEvent): void => {
      if (event.t === 'voice_owned' && event.d.requestId === requestId && event.d.roomId === place.id) { finish(); resolve(true); }
      if (event.t === 'error' && event.d.requestId === requestId) {
        finish();
        if (event.d.code === 'voice_replaced') resolve(false);
        else if (event.d.code === 'voice_left') reject(new VoiceCallLeft());
        else reject(new VoiceGatewayRefused(event.d.message));
      }
    };
    const stop = deps.listen(listen);
    const timer = setTimeout(() => {
      stop();
      reject(new VoiceGatewayUnavailable(gateway.isOpen));
    }, deps.timeoutMs ?? 10_000);
    if (!gateway.send({ t: 'voice_state', d: payload })) { finish(); reject(new VoiceGatewayUnavailable()); }
  });
}
