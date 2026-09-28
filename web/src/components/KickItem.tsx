/*
 * Kick, on the member list's menu and a call's right-click menu (Wes,
 * 2026-09-27: "add an ability to kick someone from the server"). Two clicks,
 * since the second is the one that throws someone out: the first only asks.
 *
 * What a kick does is the server's (routes/servers.ts): out of the server,
 * and every invite made before it stops working for them, so only a new one
 * brings them back.
 */

import { useState } from 'react';

import { MenuItem } from './Menu';

export function KickItem({ name, onKick }: { name: string; onKick: () => void }) {
  const [sure, setSure] = useState(false);
  return sure ? (
    <MenuItem danger note="Invites they already have stop working for them." onClick={onKick}>
      Yes, kick {name}
    </MenuItem>
  ) : (
    <MenuItem danger note="Out of the server until someone sends them a new invite." onClick={() => setSure(true)}>
      Kick from server
    </MenuItem>
  );
}

/**
 * The host's version, reaching past this server: out of every server, signed
 * out everywhere, and the account cannot sign in again (routes/host.ts).
 */
export function RemoveFromAppItem({ name, onRemove }: { name: string; onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  return sure ? (
    <MenuItem danger note="Signed out now, out of every server, and can't sign in again." onClick={onRemove}>
      Yes, remove {name} from Scryproof
    </MenuItem>
  ) : (
    <MenuItem danger note="Every server, not just this one. Only you, as host, see this." onClick={() => setSure(true)}>
      Remove from Scryproof
    </MenuItem>
  );
}
