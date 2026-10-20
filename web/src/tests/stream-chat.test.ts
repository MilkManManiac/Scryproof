import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CommentRate,
  KEEP,
  RECEIVE_GAP_MS,
  RECEIVE_WINDOW_MS,
  StreamComments,
  cleanComment,
  newCommentId,
  openStreamComment,
  readStreamComment,
  sealStreamComment,
} from '../lib/stream-chat';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const good = { stream: 'TR_screen1', id: '0123456789abcdef', text: 'nice shot' };

test('a comment packet is exactly three checked fields, and nothing oversized', () => {
  assert.deepEqual(readStreamComment(encode(good)), good);
  assert.equal(readStreamComment(new Uint8Array(2049)), null);
  assert.equal(readStreamComment(encode({ ...good, text: 'x'.repeat(1990) })), null);
  assert.equal(readStreamComment(new TextEncoder().encode('{')), null);
  assert.equal(readStreamComment(encode([good])), null);
  assert.equal(readStreamComment(encode({ ...good, userId: 'impersonated' })), null);
  assert.equal(readStreamComment(encode({ stream: good.stream, id: good.id })), null);
  assert.equal(readStreamComment(encode({ ...good, text: 7 })), null);
  assert.equal(readStreamComment(encode({ ...good, stream: 'bad sid!' })), null);
  assert.equal(readStreamComment(encode({ ...good, id: '0123456789ABCDEF' })), null);
  assert.equal(readStreamComment(encode({ ...good, id: '0123' })), null);
});

test('text is trimmed, 1 to 300 characters, with newlines and tabs flattened and other controls refused', () => {
  assert.equal(cleanComment('  hi\n\tthere \r\n'), 'hi there');
  assert.equal(cleanComment('one \n two'), 'one two');
  assert.equal(cleanComment('x'.repeat(300)), 'x'.repeat(300));
  assert.equal(cleanComment('x'.repeat(301)), null);
  assert.equal(readStreamComment(encode({ ...good, text: 'x'.repeat(301) })), null);
  assert.equal(cleanComment('   '), null);
  assert.equal(cleanComment('bell\u0007'), null);
  assert.equal(cleanComment('null\u0000'), null);
  assert.equal(cleanComment('\u202eevil'), null);
  // Characters, not UTF-16 units: 300 faces fit.
  assert.equal(cleanComment('\u{1F600}'.repeat(300))?.length, 600);
  assert.match(newCommentId(), /^[0-9a-f]{16}$/);
});

test('a sealed comment opens only for the sender, call and epoch it was sealed for', async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const other = crypto.getRandomValues(new Uint8Array(32));
  const context = { callId: 'room-1', sender: 'wes', epoch: 4 };
  const sealed = await sealStreamComment(key, context, good);
  assert.deepEqual(await openStreamComment(sealed, key, context), good);
  assert.equal(await openStreamComment(sealed, other, context), null, 'wrong key');
  assert.equal(await openStreamComment(sealed, null, context), null, 'no key');
  assert.equal(await openStreamComment(sealed, key, { ...context, sender: 'alex' }), null, 'relabelled sender');
  assert.equal(await openStreamComment(sealed, key, { ...context, epoch: 5 }), null, 'other epoch');
  assert.equal(await openStreamComment(sealed, key, { ...context, callId: 'room-2' }), null, 'other call');
  assert.equal(await openStreamComment(encode(good), key, context), null, 'a plain comment is not accepted');
  const envelope = JSON.parse(new TextDecoder().decode(sealed));
  const flipped = atob(envelope.box);
  const changed = btoa(String.fromCharCode(flipped.charCodeAt(0) ^ 1) + flipped.slice(1));
  assert.equal(await openStreamComment(encode({ ...envelope, box: changed }), key, context), null, 'changed byte');
  assert.equal(await openStreamComment(new Uint8Array(4097), key, context), null, 'oversized');
});

test('sending is one a second and five in ten seconds', () => {
  const rate = new CommentRate();
  assert.equal(rate.take('me', 0), true);
  assert.equal(rate.take('me', 500), false);
  assert.equal(rate.wait('me', 500), 500);
  for (const at of [1000, 2000, 3000, 4000]) assert.equal(rate.take('me', at), true);
  assert.equal(rate.take('me', 5000), false, 'a sixth inside ten seconds');
  assert.equal(rate.wait('me', 5000), 5000);
  assert.equal(rate.take('me', 10_000), true);
  assert.equal(rate.take('someone else', 10_000), true, 'counted per person');
});

test('receiving drops a flood from one sender but allows honest comments bunched by the network', () => {
  const rate = new CommentRate(RECEIVE_GAP_MS, RECEIVE_WINDOW_MS);
  assert.equal(rate.take('alex', 0), true);
  assert.equal(rate.take('alex', 600), true, 'two sent a second apart that arrived closer');
  assert.equal(rate.take('alex', 700), false);
  for (const at of [1200, 1800, 2400]) assert.equal(rate.take('alex', at), true);
  assert.equal(rate.take('alex', 3000), false, 'a sixth inside the window');
  rate.forget('alex');
  assert.equal(rate.take('alex', 3000), true);
});

test('each stream keeps its newest 50, ignores a repeated id, and empties when it ends', () => {
  const comments = new StreamComments();
  assert.equal(comments.add('TR_a', 'alex', '0000000000000001', 'first'), true);
  assert.equal(comments.add('TR_a', 'alex', '0000000000000001', 'again'), false, 'duplicate id');
  assert.equal(comments.add('TR_a', 'wes', '0000000000000001', 'same id, other person'), true);
  for (let i = 0; i < 60; i += 1) comments.add('TR_a', 'mara', i.toString(16).padStart(16, '0'), `line ${i}`);
  const list = comments.list('TR_a');
  assert.equal(list.length, KEEP);
  assert.equal(list.at(-1)?.text, 'line 59');
  assert.equal(list[0]?.text, 'line 10');
  const before = comments.list('TR_a');
  comments.add('TR_b', 'alex', '0000000000000002', 'other stream');
  assert.equal(comments.list('TR_a'), before, 'another stream does not change this one');
  assert.deepEqual(Object.keys(comments.all()).sort(), ['TR_a', 'TR_b']);
  assert.equal(comments.end('TR_a'), true);
  assert.deepEqual(comments.list('TR_a'), []);
  assert.equal(comments.add('TR_a', 'alex', '0000000000000001', 'a restarted share is a new sid anyway'), true);
  comments.clear();
  assert.deepEqual(comments.all(), {});
});
