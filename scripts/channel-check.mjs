/**
 * Prove, with real browsers, that an encrypted channel is readable by the
 * people in it and by nothing in between. `npm test` covers the crypto in Node
 * with a lying server; this covers keys made and kept by real browsers, and
 * the screens.
 *
 *   1. Wes makes an encrypted channel. Wes, Alex and Mara open it; it says so
 *   2. Wes writes. All three read exactly that; the server holds no text
 *   3. Alex replies to it, mentioning Wes. Wes sees the reply, its quote, and a ping
 *   4. Wes edits his message. The others see the edit, the server still no text
 *  4b. Wes sends a picture and a text file. Alex sees the picture and the file's
 *      name; the server holds sealed.bin twice and never saw either name
 *   5. Wes removes Mara from the server. The next message moves the channel to
 *      a new key, locked for Wes and Alex only
 *   6. Alex signs in on a second device. It shows the history as locked, and
 *      its owner's panel says why
 *   7. Wes accepts it from the lock panel. The history opens there, all of it,
 *      including what came before the new key
 *   8. the new device can send once it believes the device that made the key
 *   9. /roll is refused here with a reason, and nothing is sent
 *  10. Wes switches a plain channel with a message in it to encrypted. The old
 *      message stays, a line marks the switch, and what follows is sealed
 *
 * Needs `npm run dev` and a freshly seeded database.
 *
 *   npm run test:channels
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Device, makePng, sleep } from './lib/check-device.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};

const stamp = Date.now().toString(36);
const NAME = `vault-${stamp}`;
const SECRET = `secret-${stamp} the key is under the juniper`;
const EDITED = `edited-${stamp} the key is under the oak`;
const REPLY = `reply-${stamp} which juniper`;
const AFTER = `after-${stamp} just us two now`;
const FROM_PHONE = `phone-${stamp} hello from the new device`;

const wes = new Device('wes', 'wes', 9351);
const alex = new Device('alex', 'alex', 9352);
const mara = new Device('mara', 'mara', 9353);
const alexPhone = new Device('alex-phone', 'alex', 9354);
const everyone = [wes, alex, mara, alexPhone];

/** Everything the server hands back for this channel's messages, raw. */
const rawMessages = (device, channelId) =>
  device.evaluate(`fetch('/api/channels/${channelId}/messages', { credentials: 'include' }).then((r) => r.text())`);

const openChannel = async (device) => {
  const found = await device.until(`Array.from(document.querySelectorAll('.channel')).some((el) => el.textContent.includes(${JSON.stringify(NAME)}))`);
  if (!found) return false;
  return device.click('.channel', NAME);
};

try {
  await Promise.all([wes.open(), alex.open(), mara.open()]);
  await Promise.all([wes.signIn(), alex.signIn(), mara.signIn()]);

  /* 1 */
  const serverId = await wes.evaluate(`fetch('/api/servers', { credentials: 'include' }).then((r) => r.json()).then((b) => b.servers[0].id)`);
  const channelId = await wes.evaluate(`
    fetch('/api/servers/${serverId}/channels', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: ${JSON.stringify(NAME)}, type: 'text', encrypted: true }),
    }).then((r) => r.json()).then((b) => b.channel.id)
  `);
  check('Wes makes an encrypted channel', typeof channelId === 'string');
  for (const device of [wes, alex, mara]) {
    check(`${device.label} opens it`, await openChannel(device));
  }
  check('the header says it is encrypted', Boolean(await wes.until(`document.querySelector('.channel-lock-button') !== null`)));
  check('and so does the start of the channel', Boolean(await wes.until(`document.querySelector('.channel-intro')?.textContent.includes('end-to-end encrypted')`)));

  /* 2 */
  await wes.say(SECRET);
  {
    const saw = Boolean(await wes.sees(SECRET));
    check('Wes sees his own message, opened from the sealed copy', saw, saw ? '' : (await wes.screenText()).slice(-400));
  }
  check('Alex reads exactly what Wes wrote', Boolean(await alex.sees(SECRET)));
  check('Mara reads it too', Boolean(await mara.sees(SECRET)));
  {
    const raw = await rawMessages(alex, channelId);
    check('the server returned sealed bytes and a signature', raw.includes('"ciphertext":"') && raw.includes('"signature":"'));
    check('what the server holds does not contain the text', !raw.includes('juniper') && !raw.includes(stamp), raw.slice(0, 200));
    check('its content column is empty', JSON.parse(raw).messages.every((message) => message.content === null));
  }

  /* 3 */
  await alex.act(SECRET, 'Reply');
  await alex.until(`document.querySelector('.composer-reply') !== null`);
  await alex.say(REPLY);
  check('Wes sees the reply', Boolean(await wes.sees(REPLY)));
  check(
    'with the message it answers quoted above it',
    Boolean(await wes.until(`Array.from(document.querySelectorAll('.reply-line')).some((el) => el.textContent.includes('under the juniper'))`)),
  );
  check('and it pings Wes, named by the sender, not read by the server', Boolean(await wes.until(`document.querySelector('.message.pings-me') !== null`)));

  /* 4 */
  await wes.act(SECRET, 'Edit');
  await wes.until(`document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value.includes('secret-')`);
  await wes.evaluate(`document.activeElement.select()`);
  await wes.send('Input.insertText', { text: EDITED });
  await wes.pressEnter();
  check('Alex sees the edit', Boolean(await alex.sees(EDITED)));
  check('and the old wording is gone', !(await alex.screenText()).includes(SECRET));
  check('the server still holds no text', !(await rawMessages(alex, channelId)).includes('oak'));

  /* 4b */
  {
    const folder = mkdtempSync(join(tmpdir(), 'scryproof-channel-files-'));
    const picture = join(folder, 'vault-map.png');
    const notes = join(folder, 'vault-notes.txt');
    writeFileSync(picture, makePng(96));
    writeFileSync(notes, `the vault is under the ${stamp} juniper`);
    await wes.attach([picture, notes]);
    check('both files are locked and waiting, by their real names', Boolean(await wes.until(
      `(() => { const t = Array.from(document.querySelectorAll('.pending-file')).map((el) => el.textContent).join(' '); return t.includes('vault-map.png') && t.includes('vault-notes.txt'); })()`,
    )));
    await wes.say(`files-${stamp}`);
    check('Alex sees the picture, opened in his browser', Boolean(await alex.until(`(() => {
      const img = document.querySelector('img.attachment-image');
      return img && img.src.startsWith('blob:') && img.naturalWidth === 96;
    })()`)));
    check('and the text file, by its name', Boolean(await alex.until(`Array.from(document.querySelectorAll('.dm-file')).some((el) => el.textContent.includes('vault-notes.txt'))`)));
    const raw = await rawMessages(alex, channelId);
    check('the server was never told their names', !raw.includes('vault-map') && !raw.includes('vault-notes'));
    const held = await alex.evaluate(`(async () => {
      const { messages } = await fetch('/api/channels/${channelId}/messages', { credentials: 'include' }).then((r) => r.json());
      const files = messages.flatMap((m) => m.attachments);
      const out = [];
      for (const file of files) {
        const bytes = new Uint8Array(await fetch(file.url, { credentials: 'include' }).then((r) => r.arrayBuffer()));
        out.push({ name: file.filename, type: file.contentType, text: Array.from(bytes).map((b) => String.fromCharCode(b)).join('') });
      }
      return out;
    })()`);
    check('it holds two files called sealed.bin', held.length === 2 && held.every((file) => file.name === 'sealed.bin' && file.type === 'application/octet-stream'), JSON.stringify(held.map((f) => f.name)));
    check('neither is a picture or readable text', held.every((file) => !file.text.includes('PNG') && !file.text.includes('juniper')));
  }

  /* 5 */
  const maraId = await mara.evaluate(`fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()).then((b) => b.user.id)`);
  const kicked = await wes.evaluate(`fetch('/api/servers/${serverId}/members/${maraId}', { method: 'DELETE', credentials: 'include' }).then((r) => r.status)`);
  check('Wes removes Mara from the server', kicked === 200, String(kicked));
  await alex.say(AFTER);
  check('Alex and Wes carry on', Boolean(await wes.sees(AFTER)) && Boolean(await alex.sees(AFTER)));
  check('Mara never sees it', !(await mara.screenText()).includes(AFTER));
  const epochs = await wes.evaluate(`fetch('/api/channels/${channelId}/messages', { credentials: 'include' }).then((r) => r.json()).then((b) => b.messages.map((m) => m.keyEpoch))`);
  check('the message after she left is under a new key', epochs.at(-1) === 2 && epochs[0] === 1, JSON.stringify(epochs));
  const maraAsks = await mara.evaluate(`fetch('/api/channels/${channelId}/messages', { credentials: 'include' }).then((r) => r.status)`);
  check('and the server no longer gives her the channel', maraAsks === 404, String(maraAsks));

  /* 6 */
  await alexPhone.open();
  await alexPhone.signIn();
  check("Alex's second device opens the channel", await openChannel(alexPhone));
  check(
    'it shows the history as locked, not as text',
    Boolean(await alexPhone.until(`Array.from(document.querySelectorAll('.sealed-problem')).some((el) => el.textContent.startsWith('Locked.'))`)),
  );
  check('and not a word of it', !(await alexPhone.screenText()).includes('juniper'));
  await alexPhone.shot('docs/shots/channel-locked-new-device.png');

  /* 7 */
  await wes.click('.channel-lock-button');
  check(
    "Wes's lock panel says Alex signed in somewhere new",
    Boolean(await wes.until(`document.querySelector('.dm-warning')?.textContent.includes('signed in somewhere new')`)),
  );
  check(
    'and lists who holds the key, without Mara',
    Boolean(await wes.until(`(() => { const t = document.querySelector('.lock-holders')?.textContent ?? ''; return t.includes('Alex') && t.includes('(you)') && !t.includes('Mara'); })()`)),
  );
  await wes.shot('docs/shots/channel-lock-panel.png');
  await wes.click('.dm-warning button', 'Accept');
  check('the warning goes once accepted', Boolean(await wes.until(`document.querySelector('.dm-warning') === null`)));
  await wes.click('.modal button', 'Done');
  check('the new device reads the history from before it existed', Boolean(await alexPhone.sees(EDITED, 30_000)));
  check('including what came before the new key, and after', Boolean(await alexPhone.sees(REPLY)) && Boolean(await alexPhone.sees(AFTER)));

  /* 8 */
  await alexPhone.say(FROM_PHONE);
  {
    const refused = await alexPhone.until(`document.querySelector('.composer .error')?.textContent.includes('not accepted')`, 8000);
    if (refused) {
      check('the new device will not send under a key made by a device it has not accepted', true);
      await alexPhone.click('.channel-lock-button');
      await alexPhone.until(`document.querySelector('.dm-warning') !== null`);
      check('its panel offers its owner the device that made it', await alexPhone.click('.dm-warning button', 'Accept'));
      await alexPhone.until(`document.querySelector('.dm-warning') === null`);
      await alexPhone.click('.modal button', 'Done');
      // The refused message went back into the box, as it should. Send that.
      check('the refused message went back into the box', await alexPhone.evaluate(`document.querySelector('.composer-input').value === ${JSON.stringify(FROM_PHONE)}`));
      await alexPhone.evaluate(`document.querySelector('.composer-input').focus()`);
      await alexPhone.pressEnter();
    }
    check('once it does, it sends, and Wes reads it', Boolean(await wes.sees(FROM_PHONE)));
    check('once', !(await wes.screenText()).includes(FROM_PHONE + FROM_PHONE));
  }

  /* 9 */
  await wes.say('/roll 2d6');
  check(
    '/roll is refused here with a reason',
    Boolean(await wes.until(`document.querySelector('.composer .error')?.textContent.includes('cannot read this channel')`)),
  );
  await wes.shot('docs/shots/channel-encrypted.png');

  /* 10 */
  {
    const LORE = `lore-${stamp}`;
    const OLD = `old-${stamp} said in the open`;
    const NEW = `new-${stamp} said under lock`;
    const loreId = await wes.evaluate(`
      fetch('/api/servers/${serverId}/channels', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: ${JSON.stringify(LORE)}, type: 'text' }),
      }).then((r) => r.json()).then((b) => b.channel.id)
    `);
    await wes.until(`Array.from(document.querySelectorAll('.channel')).some((el) => el.textContent.includes(${JSON.stringify(LORE)}))`);
    await wes.click('.channel', LORE);
    await wes.say(OLD);
    check('a plain channel, with a message in it', Boolean(await wes.sees(OLD)));
    const switched = await wes.evaluate(`
      fetch('/api/channels/${loreId}', {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encrypted: true }),
      }).then((r) => r.json()).then((b) => b.channel.encrypted)
    `);
    check('Wes switches it to encrypted', switched === true);
    check('a line marks where it started', Boolean(await wes.until(`document.querySelector('.sealed-line')?.textContent.includes('turned on')`)));
    await wes.say(NEW);
    check('what follows is sent sealed and reads fine', Boolean(await wes.sees(NEW)));
    await alex.click('.channel', LORE);
    check('Alex reads both', Boolean(await alex.sees(NEW)) && Boolean(await alex.sees(OLD)));
    const raw = await rawMessages(alex, loreId);
    check('the server holds the old one as text and the new one not at all', raw.includes('said in the open') && !raw.includes('under lock'));
    await wes.shot('docs/shots/channel-switched-on.png');
  }

  for (const device of everyone) {
    check(`${device.label}: no uncaught errors`, device.complaints.length === 0, device.complaints.join('\n      '));
  }
} catch (problem) {
  failures += 1;
  console.error(`FAIL  ${problem.message}`);
} finally {
  for (const device of everyone) device.close();
  await sleep(500);
  for (const device of everyone) device.cleanUp();
}

console.log(failures === 0 ? '\nAll encrypted channel checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
