import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  md5Upper,
  stripPrefix,
  randomDeviceId,
  generateNonce,
  signedNonce,
  encSignature,
  createRc4,
  rc4EncryptParams,
  rc4DecryptBody,
  healthRegionTag,
  buildEncryptedForm,
  createCookieJar,
  parseServiceLoginBody,
  loginMiAccount,
  miServiceCall,
  fetchBoundDevices,
  formatDevice,
  HEALTH_HOSTS
} from '../../tools/miAccount.js';
import { parseArgs } from '../../tools/mi-authkey.js';

test('md5Upper and stripPrefix', () => {
  assert.equal(md5Upper('password'), '5F4DCC3B5AA765D61D8327DEB882CF99');
  assert.equal(stripPrefix('&&&START&&&{"a":1}'), '{"a":1}');
  assert.equal(stripPrefix('{"a":1}'), '{"a":1}');
});

test('randomDeviceId is 6 lowercase letters', () => {
  for (let i = 0; i < 20; i++) assert.match(randomDeviceId(), /^[a-z]{6}$/);
});

test('generateNonce = 8 random bytes + minutes since epoch (big endian)', () => {
  const rand = Buffer.from('0102030405060708', 'hex');
  const nonce = generateNonce(90 * 60000 + 5, rand);
  const buf = Buffer.from(nonce, 'base64');
  assert.equal(buf.length, 12);
  assert.deepEqual([...buf.subarray(0, 8)], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(buf.readUInt32BE(8), 90);
});

test('signedNonce = base64(sha256(b64dec(ssecurity) || b64dec(nonce)))', () => {
  const ss = Buffer.from('secret-security-key-1234').toString('base64');
  const nonce = Buffer.from('nonce-bytes-12').toString('base64');
  const expected = createHash('sha256').update(Buffer.from('secret-security-key-1234')).update(Buffer.from('nonce-bytes-12')).digest('base64');
  assert.equal(signedNonce(ss, nonce), expected);
});

test('encSignature sorts keys in ASCII order and joins with &', () => {
  const sig = encSignature('/app/v1/x', 'post', 'SN', { b: '2', a: '1' });
  const expected = createHash('sha1').update('POST&/app/v1/x&a=1&b=2&SN').digest('base64');
  assert.equal(sig, expected);
});

test('RC4 matches the classic test vector', () => {
  const rc4 = createRc4(Buffer.from('Key'));
  assert.equal(rc4.apply(Buffer.from('Plaintext')).toString('hex'), 'bbf316e8d940af0ad3');
  const rc4b = createRc4(Buffer.from('Secret'));
  assert.equal(rc4b.apply(Buffer.from('Attack at dawn')).toString('hex'), '45a01f645fc35b383552544b9bf5');
});

test('rc4EncryptParams uses one continuous keystream after dropping 1024 bytes', () => {
  const signed = Buffer.alloc(32, 7).toString('base64');
  const enc = rc4EncryptParams(signed, { data: 'hello', rc4_hash__: 'abc' });
  const ref = createRc4(Buffer.from(signed, 'base64'), 1024);
  assert.equal(enc.data, ref.apply(Buffer.from('hello')).toString('base64'));
  assert.equal(enc.rc4_hash__, ref.apply(Buffer.from('abc')).toString('base64'));
});

test('rc4DecryptBody strips quotes and decrypts with a fresh dropped keystream', () => {
  const signed = Buffer.alloc(32, 9).toString('base64');
  const cipher = createRc4(Buffer.from(signed, 'base64'), 1024).apply(Buffer.from('{"code":0}')).toString('base64');
  assert.equal(rc4DecryptBody(signed, `"${cipher}"\n`), '{"code":0}');
});

test('healthRegionTag follows the host prefix', () => {
  assert.equal(healthRegionTag('hlth.io.mi.com'), 'cn');
  assert.equal(healthRegionTag('sg.hlth.io.mi.com'), 'sg');
  assert.equal(healthRegionTag('i2.hlth.io.mi.com'), 'i2');
  assert.equal(healthRegionTag('sts-hlth.io.mi.com'), 'cn');
  assert.equal(healthRegionTag(undefined), 'cn');
});

test('buildEncryptedForm produces rc4_hash__, signature and _nonce that verify', () => {
  const ss = Buffer.alloc(32, 1).toString('base64');
  const nonce = generateNonce(0, Buffer.alloc(8, 2));
  const { form, signed } = buildEncryptedForm('/app/v1/source/get_source_list', ss, { data: '{"page_size":50,"status":1}' }, nonce);
  assert.equal(form._nonce, nonce);
  assert.deepEqual(Object.keys(form).sort(), ['_nonce', 'data', 'rc4_hash__', 'signature']);
  // signature is over the encrypted params (without signature/_nonce)
  const { signature, _nonce, ...encrypted } = form;
  assert.equal(signature, encSignature('/app/v1/source/get_source_list', 'POST', signed, encrypted));
  // decrypting data + rc4_hash__ in order yields the plaintext and the inner hash
  const rc4 = createRc4(Buffer.from(signed, 'base64'), 1024);
  assert.equal(rc4.apply(Buffer.from(encrypted.data, 'base64')).toString(), '{"page_size":50,"status":1}');
  const innerHash = rc4.apply(Buffer.from(encrypted.rc4_hash__, 'base64')).toString();
  assert.equal(innerHash, encSignature('/app/v1/source/get_source_list', 'POST', signed, { data: '{"page_size":50,"status":1}' }));
});

test('cookie jar groups by registrable domain and parses Set-Cookie attributes', () => {
  const jar = createCookieJar();
  jar.set('xiaomi.com', 'deviceId', 'abcdef');
  jar.setFromHeaders('https://account.xiaomi.com/pass/x', ['passToken=PT; Domain=.xiaomi.com; Path=/; HttpOnly', 'userId=42; Path=/']);
  jar.setFromHeaders('https://sts-hlth.io.mi.com/healthapp/sts', ['serviceToken=ST; Path=/']);
  assert.equal(jar.headerFor('https://account.xiaomi.com/pass/y'), 'deviceId=abcdef; passToken=PT; userId=42');
  assert.equal(jar.headerFor('https://sts-hlth.io.mi.com/a'), 'serviceToken=ST');
  assert.equal(jar.headerFor('https://example.com/'), '');
  assert.equal(jar.get('serviceToken'), 'ST');
  jar.importHeader('xiaomi.com', 'a=1; b=2');
  assert.equal(jar.get('b'), '2');
});

test('parseServiceLoginBody distinguishes credential challenge from authenticated session', () => {
  assert.deepEqual(parseServiceLoginBody('&&&START&&&{"_sign":"S","qs":"x"}').sign, 'S');
  const a = parseServiceLoginBody('{"code":0,"ssecurity":"x","location":"https://sts"}');
  assert.equal(a.needCredential, false);
  assert.equal(a.auth.location, 'https://sts');
});

test('formatDevice prints the AuthKey', () => {
  const text = formatDevice({ name: 'Band 11', model: 'miwear.watch.q66gl', identifier: 'blt.1', detail: { mac: 'AA:BB', fw_ver: '4.1', sn: 'SN1', encrypt_key: 'KEY123' } });
  assert.match(text, /AuthKey:\s+KEY123/);
  assert.match(text, /miwear\.watch\.q66gl/);
});

test('parseArgs handles user, cookie, hosts and rejects unknown options', () => {
  const o = parseArgs(['--user', 'me@x.com', '--cookie=userId=1; passToken=p', '--hosts=sg.hlth.io.mi.com,hlth.io.mi.com', '--json']);
  assert.equal(o.user, 'me@x.com');
  assert.equal(o.cookie, 'userId=1; passToken=p');
  assert.deepEqual(o.hosts, ['sg.hlth.io.mi.com', 'hlth.io.mi.com']);
  assert.equal(o.json, true);
  assert.deepEqual(parseArgs([]).hosts, HEALTH_HOSTS);
  assert.equal(parseArgs(['--cookie']).cookie, 'ask');
  assert.equal(parseArgs(['--cookie', '--json']).cookie, 'ask');
  assert.equal(parseArgs(['--cookie', 'a=1']).cookie, 'a=1');
  assert.throws(() => parseArgs(['--nope']), /không hợp lệ/);
});

// ------------------------------------------------------------- fake server

const SSECURITY = Buffer.alloc(32, 0x5a).toString('base64');

function makeResponse(status, body, headers = {}, setCookies = []) {
  const h = new Headers(headers);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (n) => h.get(n),
      getSetCookie: () => setCookies
    },
    text: async () => body
  };
}

function createFakeXiaomi({ devicesByHost = {}, require2fa = false, cookieLogin = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const cookie = options.headers?.Cookie || '';
    calls.push({ url, method: options.method || 'GET', headers: options.headers || {}, body: options.body, cookie });
    assert.equal(options.redirect, 'manual', 'redirects are followed manually');

    if (u.pathname === '/pass/serviceLogin') {
      assert.match(cookie, /sdkVersion=accountsdk-18\.8\.15/);
      assert.match(cookie, /deviceId=[a-z]{6}/);
      if (cookieLogin && /passToken=GOODPASS/.test(cookie)) {
        return makeResponse(200, '&&&START&&&' + JSON.stringify({ code: 0, ssecurity: SSECURITY, location: 'https://sts-hlth.io.mi.com/healthapp/sts?d=1', userId: 777, cUserId: 'CU', passToken: 'GOODPASS', nonce: 5 }));
      }
      return makeResponse(200, '&&&START&&&{"_sign":"SIGN1","qs":"x"}');
    }
    if (u.pathname === '/pass/serviceLoginAuth2') {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('sid'), 'miothealth');
      assert.equal(form.get('_sign'), 'SIGN1');
      assert.equal(form.get('_json'), 'true');
      assert.equal(form.get('callback'), 'https://sts-hlth.io.mi.com/healthapp/sts');
      if (form.get('hash') !== md5Upper('pw123') || form.get('user') !== 'me') {
        return makeResponse(200, '&&&START&&&' + JSON.stringify({ code: 70016, description: 'bad password', result: 'error', location: '', pwd: 1, child: 0, securityStatus: 0 }));
      }
      const body = { code: 0, ssecurity: SSECURITY, location: 'https://sts-hlth.io.mi.com/healthapp/sts?a=1', userId: 777, cUserId: 'CU', passToken: 'PT', nonce: 5, result: 'ok', pwd: 1, child: 0, securityStatus: 0 };
      if (require2fa) body.notificationUrl = 'https://account.xiaomi.com/fe/service/identity/authStart?x=1';
      return makeResponse(200, '&&&START&&&' + JSON.stringify(body), {}, ['passToken=PT; Domain=.xiaomi.com; Path=/', 'userId=777; Domain=.xiaomi.com; Path=/']);
    }
    if (u.hostname === 'sts-hlth.io.mi.com') {
      assert.match(cookie, /sdkVersion/, 'sts hop gets mi.com cookies');
      return makeResponse(302, '', { location: 'https://hlth.io.mi.com/healthapp/landing' }, ['serviceToken=STOKEN; Path=/', 'cUserId=CU2; Path=/']);
    }
    if (u.pathname === '/healthapp/landing') {
      assert.match(cookie, /serviceToken=STOKEN/, 'serviceToken cookie re-sent on the redirect target');
      return makeResponse(200, 'ok');
    }
    if (u.pathname === '/app/v1/source/get_source_list') {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.HandleParams, 'true');
      assert.equal(options.headers.region_tag, healthRegionTag(u.hostname));
      assert.match(cookie, /serviceToken=STOKEN/);
      assert.match(cookie, /userId=777/);
      const form = new URLSearchParams(options.body);
      const signed = signedNonce(SSECURITY, form.get('_nonce'));
      // verify outer signature
      const encrypted = { data: form.get('data'), rc4_hash__: form.get('rc4_hash__') };
      assert.equal(form.get('signature'), encSignature(u.pathname, 'POST', signed, encrypted));
      const rc4 = createRc4(Buffer.from(signed, 'base64'), 1024);
      const data = rc4.apply(Buffer.from(encrypted.data, 'base64')).toString();
      assert.deepEqual(JSON.parse(data), { page_size: 50, status: 1 });
      const list = devicesByHost[u.hostname];
      const reply = list === 'error' ? { code: 401, message: 'auth' } : { code: 0, message: 'ok', result: { list: list === undefined ? null : list } };
      const out = createRc4(Buffer.from(signed, 'base64'), 1024).apply(Buffer.from(JSON.stringify(reply))).toString('base64');
      return makeResponse(200, `"${out}"`);
    }
    return makeResponse(404, 'not found');
  };
  return { fetchImpl, calls };
}

const BAND = { sid: 'x', identifier: 'blt.3.abc', name: 'Xiaomi Smart Band 11', model: 'miwear.watch.q66gl', status: 1, create_time: 1, update_time: 2, detail: { mac: 'AA:BB:CC:DD:EE:FF', encrypt_key: '0123456789abcdef0123456789abcdef', fw_ver: '4.100.139', sn: 'SN' } };

test('loginMiAccount: full password flow yields a token with serviceToken from the sts redirect', async () => {
  const { fetchImpl } = createFakeXiaomi();
  const token = await loginMiAccount({ username: 'me', password: 'pw123', fetchImpl, deviceId: 'abcdef' });
  assert.equal(token.serviceToken, 'STOKEN');
  assert.equal(token.ssecurity, SSECURITY);
  assert.equal(token.userId, '777');
  assert.equal(token.cUserId, 'CU2');
  assert.equal(token.deviceId, 'abcdef');
  assert.equal(token.passToken, 'PT');
});

test('loginMiAccount: wrong password surfaces Xiaomi code 70016', async () => {
  const { fetchImpl } = createFakeXiaomi();
  await assert.rejects(loginMiAccount({ username: 'me', password: 'nope', fetchImpl }), /sai tên đăng nhập hoặc mật khẩu/);
});

test('loginMiAccount: two-factor challenge is reported with the verification url', async () => {
  const { fetchImpl } = createFakeXiaomi({ require2fa: true });
  await assert.rejects(loginMiAccount({ username: 'me', password: 'pw123', fetchImpl, deviceId: 'qwerty' }), (e) => {
    assert.equal(e.code, 'TWO_FACTOR');
    assert.match(e.url, /authStart/);
    assert.equal(e.deviceId, 'qwerty');
    return true;
  });
});

test('loginMiAccount: verified cookies skip the password step', async () => {
  const { fetchImpl, calls } = createFakeXiaomi({ cookieLogin: true });
  const token = await loginMiAccount({ username: '', cookieHeader: 'userId=777; passToken=GOODPASS', fetchImpl });
  assert.equal(token.serviceToken, 'STOKEN');
  assert.ok(!calls.some((c) => c.url.includes('serviceLoginAuth2')));
});

test('fetchBoundDevices: CN answers null, SG has the band, errors are tolerated, duplicates removed', async () => {
  const { fetchImpl } = createFakeXiaomi({ devicesByHost: { 'sg.hlth.io.mi.com': [BAND], 'de.hlth.io.mi.com': 'error', 'us.hlth.io.mi.com': [BAND] } });
  const token = await loginMiAccount({ username: 'me', password: 'pw123', fetchImpl });
  const logs = [];
  const { devices, perHost } = await fetchBoundDevices({ token, fetchImpl, log: (m) => logs.push(m) });
  assert.equal(devices.length, 1);
  assert.equal(devices[0].detail.encrypt_key, BAND.detail.encrypt_key);
  assert.equal(perHost['hlth.io.mi.com'], '0 thiết bị');
  assert.equal(perHost['sg.hlth.io.mi.com'], '1 thiết bị');
  assert.match(perHost['de.hlth.io.mi.com'], /code=401/);
  assert.equal(logs.length, HEALTH_HOSTS.length);
});

test('miServiceCall decrypts the RC4 response body', async () => {
  const { fetchImpl } = createFakeXiaomi({ devicesByHost: { 'hlth.io.mi.com': [] } });
  const token = await loginMiAccount({ username: 'me', password: 'pw123', fetchImpl });
  const json = await miServiceCall({ token, url: 'https://hlth.io.mi.com/app/v1/source/get_source_list', params: { data: '{"page_size":50,"status":1}' }, fetchImpl });
  assert.deepEqual(json, { code: 0, message: 'ok', result: { list: [] } });
});
