# Activities desktop release for Wes

Browser Activities is live at https://scryproof.com. This PR supplies the desktop shell support needed to embed Drain The Swamp. Older installed shells prohibit frames and cannot gain this capability through a client update alone.

The 0.5.5 shell permits only the isolated game origin, grants devices only to the main app frame, blocks game navigation outside that origin, and keeps the preload bridge out of subframes. The existing update public key is unchanged. No signed update or installer is included in this PR.

## Build and publish on your existing Windows workstation

Merge this PR, pull main, and use the existing signing key and deployment setup. From the repository root in your normal Git Bash environment:

```sh
npm ci
npm ci --prefix desktop
cd desktop && npm run dist && cd ..
bash scripts/release.sh
bash scripts/publish-installer.sh
```

`npm run dist` builds and signs the client, builds the 0.5.5 Windows installer, and signs its manifest. `scripts/release.sh` commits the signed client and deploys it through your existing WSL workflow. `scripts/publish-installer.sh` publishes the matching installer and manifest. If releasing on a later day, update the release note date first: the release script requires today's notes.

Do not generate another signing key or put the private key on the server. The browser feature and game are already deployed; their frame policy is already configured. Installed clients must receive the signed client and install the new shell to play inside the desktop app.

## Verify before calling the desktop release complete

1. Open the 0.5.5 installer on Windows, sign in, and open Activities → Drain The Swamp. Confirm the game loads and accepts keyboard input.
2. Join a call with a second person. Choose Share gameplay, select the Scryproof window, and have the second person press Watch. Confirm visible gameplay, encrypted call status, and no call echo if sound sharing is enabled.
3. Use Back to Scryproof. Confirm the gameplay share stops before chat appears, voice stays connected, and Return to Drain The Swamp restores the same game state.
4. Play long enough for the 30-second autosave, close and reopen the game, and confirm Continue resumes progress. Saves are local to this device.
5. On an older installation, verify the signed installer update is offered and installs successfully. Confirm the Activities browser fallback is replaced by an enabled Play button afterward.

Local permission tests and an actual Linux Electron smoke passed against the hosted game. Two local browser clients received real game pixels through encrypted sharing. Windows capture/sound, installer delivery, and an authenticated production two-person call still need the checks above. Godot's Quit currently raises an audio cleanup error in the browser; Activities catches it and offers a verified working retry. The existing Linux native push-to-talk test requires display hardware information unavailable in the build environment.
