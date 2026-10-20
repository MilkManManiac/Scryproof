/**
 * Prove, in real browsers, the two paths the dev-channel screenshot did not:
 *
 *   1. a video sent in an encrypted channel shows "Play" to the reader,
 *      unlocks on press, and plays in place (the server only ever holds
 *      sealed.bin). Two devices, because a fresh encrypted channel refuses to
 *      send until the writer has let another device in.
 *   2. a YouTube link in a DM waits for "Show preview" and then draws the card
 *
 * Needs `npm run dev` and a seeded database.
 *
 *   node scripts/sealed-video-check.mjs path/to/clip.mp4
 */
import { Device, sleep } from './lib/check-device.mjs';

const clip = process.argv[2];
if (!clip) throw new Error('give a path to an mp4');
const stamp = Date.now().toString(36);
const NAME = `vault-${stamp}`;
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};

/** Open the lock panel and let in every device waiting there (as channel-check does). */
const letIn = async (device, names) => {
  await device.click('.channel-lock-button');
  const listed = await device.until(`(() => {
    const rows = Array.from(document.querySelectorAll('.modal .dm-warning')).map((el) => el.textContent);
    return ${JSON.stringify(names)}.every((name) => rows.some((row) => row.startsWith(name))) ? rows.length : 0;
  })()`);
  if (!listed) {
    await device.click('.modal button', 'Done');
    return false;
  }
  for (let row = 0; row < listed; row += 1) {
    const before = await device.evaluate(`document.querySelectorAll('.modal .dm-warning').length`);
    if (before === 0) break;
    await device.click('.modal .dm-warning button', 'Let in');
    await device.until(`document.querySelectorAll('.modal .dm-warning').length < ${before}`);
  }
  const cleared = await device.until(`document.querySelectorAll('.modal .dm-warning').length === 0`);
  await device.click('.modal button', 'Done');
  return Boolean(cleared);
};

const openChannel = async (device) => {
  const found = await device.until(`Array.from(document.querySelectorAll('.channel')).some((el) => el.textContent.includes(${JSON.stringify(NAME)}))`);
  return found ? device.click('.channel', NAME) : false;
};

const wes = new Device('wes', 'wes', 9461);
const alex = new Device('alex', 'alex', 9462);
try {
  await Promise.all([wes.open(), alex.open()]);
  await Promise.all([wes.signIn(), alex.signIn()]);

  /* 1 */
  const serverId = await wes.evaluate(`fetch('/api/servers', { credentials: 'include' }).then((r) => r.json()).then((b) => b.servers[0].id)`);
  const channelId = await wes.evaluate(`
    fetch('/api/servers/${serverId}/channels', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: ${JSON.stringify(NAME)}, type: 'text', encrypted: true }),
    }).then((r) => r.json()).then((b) => b.channel.id)
  `);
  check('Wes makes an encrypted channel', typeof channelId === 'string');
  check('Wes opens it', await openChannel(wes));
  check('Alex opens it', await openChannel(alex));
  check('Wes lets Alex in', await letIn(wes, ['Alex']));
  check('Alex lets Wes in', await letIn(alex, ['Wes']));

  await wes.attach([clip]);
  check('the clip is waiting, by its real name', Boolean(await wes.until(`Array.from(document.querySelectorAll('.pending-file')).some((el) => el.textContent.includes('clip.mp4'))`)));
  await wes.say(`clip-${stamp}`);
  check('Alex sees the message and it offers Play, not a download', Boolean(await alex.until(`Array.from(document.querySelectorAll('.dm-file')).some((el) => el.textContent.startsWith('Play clip.mp4'))`, 30_000)));
  const stored = await alex.evaluate(`fetch('/api/channels/${channelId}/messages', { credentials: 'include' }).then((r) => r.text())`);
  check('the server holds sealed.bin and never saw the name', stored.includes('sealed.bin') && !stored.includes('clip.mp4'));
  await alex.click('.dm-file', 'Play clip.mp4');
  const playing = await alex.until(`(() => { const v = document.querySelector('video.attachment-video'); return v && v.readyState >= 1 && v.duration > 3 ? v.duration : 0; })()`, 20_000);
  check('pressing Play unlocks it on Alex\'s side and the video loads (about 4 s long)', playing > 3 && playing < 5, `duration ${playing}`);
  await sleep(800);
  await alex.shot('docs/shots/sealed-video.png');

  /* 2 */
  check('Wes finds Alex in the member list', await wes.click('.member', 'Alex'));
  check('his card offers Message', await wes.click('.profile-card-actions button', 'Message'));
  check('the conversation opens encrypted', Boolean(await wes.until(`document.querySelector('.dm-lock') !== null`)));
  await wes.say(`watch this https://youtu.be/dQw4w9WgXcQ ${stamp}`);
  check('the link waits for Show preview', Boolean(await wes.until(`document.querySelector('.link-card-ask') !== null`)));
  await wes.click('.link-card-ask');
  const title = await wes.until(`document.querySelector('a.link-card .link-card-title')?.textContent ?? ''`, 20_000);
  check('pressing it draws the card from this box', typeof title === 'string' && title.includes('Never Gonna Give You Up'), title);
  const thumb = await wes.until(`(() => { const i = document.querySelector('a.link-card img'); return i && i.complete && i.naturalWidth > 0 ? i.getAttribute('src') : ''; })()`, 20_000);
  check('and the thumbnail is served by this box, loaded', typeof thumb === 'string' && thumb.startsWith('/api/link-preview/youtube/'), thumb);
  await wes.shot('docs/shots/dm-youtube-card.png');

  check('no uncaught errors in either browser', wes.complaints.length === 0 && alex.complaints.length === 0, [...wes.complaints, ...alex.complaints].join(' | '));
} finally {
  for (const device of [wes, alex]) {
    device.close();
    device.cleanUp();
  }
}
console.log(failures ? `\n${failures} failed.` : '\nAll sealed-video checks passed.');
process.exit(failures ? 1 : 0);
