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
