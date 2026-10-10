/**
 * A 401 on an upload or a download reaches the same sign-out check as a 401
 * on a JSON request: the client probes `/api/auth/me`, and when that is 401
 * too, the listener set with `whenSessionGone` is told.
 */

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { api, ApiError, whenSessionGone } from '../lib/api';

const realFetch = globalThis.fetch;
let calls: string[] = [];

/** Every URL answers 401 with a JSON body, including the probe. */
function everything401(): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ code: 'unauthorized', message: 'Sign in.' }), { status: 401 });
  }) as typeof fetch;
}

/** The probe settles on a later microtask; wait for it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  whenSessionGone(null);
});

describe('api: a 401 off the JSON path still signs out', () => {
  it('a FormData upload answered 401 probes /api/auth/me and tells the listener', async () => {
    everything401();
    let gone = 0;
    whenSessionGone(() => { gone += 1; });

    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    await assert.rejects(api.upload('chan1', file), (problem: unknown) => {
      assert.ok(problem instanceof ApiError);
      assert.equal(problem.status, 401);
      assert.equal(problem.code, 'unauthorized');
      assert.equal(problem.message, 'Sign in.');
      return true;
    });
    await settle();

    assert.deepEqual(calls, ['/api/channels/chan1/attachments', '/api/auth/me']);
    assert.equal(gone, 1);
  });

  it('a sealed download answered 401 does the same, with the download fallback when the body is not JSON', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response('nope', { status: 401 });
    }) as typeof fetch;
    let gone = 0;
    whenSessionGone(() => { gone += 1; });

    await assert.rejects(api.downloadSealed('/api/channels/chan1/attachments/att1'), (problem: unknown) => {
      assert.ok(problem instanceof ApiError);
      assert.equal(problem.code, 'download_failed');
      assert.equal(problem.message, 'That file could not be fetched.');
      return true;
    });
    await settle();

    assert.deepEqual(calls, ['/api/channels/chan1/attachments/att1', '/api/auth/me']);
    assert.equal(gone, 1);
  });

  it('with no listener (the sign-in screen) an upload 401 probes nothing', async () => {
    everything401();
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    await assert.rejects(api.auth.uploadAvatar(file), ApiError);
    await settle();
    assert.deepEqual(calls, ['/api/auth/avatar']);
  });
});
