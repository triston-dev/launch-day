import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginUrl, readAssertion, SteamAuthError } from '../src/steamAuth.js';

const BASE = 'http://localhost:4310';
const ID = '76561197960287930';

const answer = (overrides = {}) =>
  new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.return_to': `${BASE}/auth/steam/return?state=abc`,
    'openid.response_nonce': '2026-10-06T21:30:00Zxyz',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...overrides,
  });

test('loginUrl sends people to Steam with our return address and state', () => {
  const url = new URL(loginUrl(BASE, 'abc'));
  assert.equal(url.origin + url.pathname, 'https://steamcommunity.com/openid/login');
  assert.equal(url.searchParams.get('openid.mode'), 'checkid_setup');
  assert.equal(url.searchParams.get('openid.realm'), BASE);
  assert.equal(url.searchParams.get('openid.return_to'), `${BASE}/auth/steam/return?state=abc`);
});

test('readAssertion returns the SteamID from a well-formed answer', () => {
  assert.equal(readAssertion(answer(), BASE), ID);
});

test('readAssertion rejects answers that are not for us or not from Steam', () => {
  const bad = [
    answer({ 'openid.mode': 'cancel' }),
    answer({ 'openid.op_endpoint': 'https://evil.example/openid/login' }),
    answer({ 'openid.return_to': 'https://evil.example/auth/steam/return?state=abc' }),
    answer({ 'openid.claimed_id': 'https://evil.example/openid/id/76561197960287930' }),
    answer({ 'openid.identity': 'https://steamcommunity.com/openid/id/76561197960287931' }),
  ];
  for (const params of bad) assert.throws(() => readAssertion(params, BASE), SteamAuthError);
});
