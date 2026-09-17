import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { pickClientIp } from '../lib/client-ip';

const NGINX = '127.0.0.1';

describe('pickClientIp', () => {
  it('reads the address nginx wrote', () => {
    assert.equal(pickClientIp('203.0.113.7', NGINX), '203.0.113.7');
  });

  it('ignores an address the visitor put in front', () => {
    // The attack: send your own X-Forwarded-For and let nginx append to it.
    assert.equal(pickClientIp('1.2.3.4, 203.0.113.7', NGINX), '203.0.113.7');
  });

  it('ignores any number of forged addresses', () => {
    assert.equal(pickClientIp('1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7', NGINX), '203.0.113.7');
  });

  it("skips bonesdeploy's unix-socket hop", () => {
    // Two nginx layers joined by a socket: the inner one appends "unix:".
    assert.equal(pickClientIp('1.2.3.4, 203.0.113.7, unix:', NGINX), '203.0.113.7');
  });

  it('skips a loopback hop', () => {
    assert.equal(pickClientIp('1.2.3.4, 203.0.113.7, 127.0.0.1', NGINX), '203.0.113.7');
  });

  it('is not fooled by a forged loopback address', () => {
    assert.equal(pickClientIp('127.0.0.1, 203.0.113.7', NGINX), '203.0.113.7');
  });

  it('skips junk that is not an address', () => {
    assert.equal(pickClientIp('203.0.113.7, <script>, ', NGINX), '203.0.113.7');
  });

  it('handles IPv6', () => {
    assert.equal(pickClientIp('1.2.3.4, 2001:db8::7', '::1'), '2001:db8::7');
  });

  it('does not believe the header when the peer is not this machine', () => {
    // Someone reached the app port directly. Their header is just text.
    assert.equal(pickClientIp('9.9.9.9', '198.51.100.20'), '198.51.100.20');
  });

  it('falls back to the peer when there is no header', () => {
    assert.equal(pickClientIp(undefined, NGINX), NGINX);
  });

  it('falls back to the peer when the header holds nothing usable', () => {
    assert.equal(pickClientIp('unix:, 127.0.0.1, nonsense', NGINX), NGINX);
  });

  it('copes with the header arriving as a list', () => {
    assert.equal(pickClientIp(['1.2.3.4', '203.0.113.7'], NGINX), '203.0.113.7');
  });
});
