/**
 * What the client sees when a route's own zod .parse() rejects a body.
 *
 * Bad shape is the caller's mistake, not ours, so it has to come back as a 400
 * with a code the client can branch on - never the generic 500 that a real
 * server fault gets.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { buildApp } from '../app.js';

describe('a route body that fails .parse()', () => {
  it('answers 400 with invalid_request, not the internal_error 500', async () => {
    const app = await buildApp();
    try {
      // /api/auth/register parses the body before it ever touches the
      // database, so this exercises the error handler without needing one.
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username: 123, password: true },
      });

      assert.equal(response.statusCode, 400);
      const body = response.json() as { code: string; message: string };
      assert.equal(body.code, 'invalid_request');
      assert.equal(typeof body.message, 'string');
      // The raw zod issue dump never reaches the client.
      assert.equal(body.message.includes('ZodError'), false);
      assert.equal(body.message.includes('invalid_type'), false);
    } finally {
      await app.close();
    }
  });
});
