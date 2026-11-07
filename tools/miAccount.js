/**
 * Xiaomi account login + Mi Fitness "bound devices" lookup, mirroring the open
 * source AstroBox account module (AGPL-3.0, AstralSightStudios/AstroBox-NG-Module-Account,
 * src/xiaomi.rs) and its pending fix that queries every regional host.
 *
 * Pure helpers (hashing, RC4, signing, cookie jar, parsing) are exported for tests.
 * Network functions take a `fetchImpl` so tests can inject a fake server.
 * Node ≥ 22, no dependencies.
 */
import { createHash, randomBytes } from 'node:crypto';

export const SDK_VERSION = 'accountsdk-18.8.15';
export const HEALTH_SID = 'miothealth';
export const PASSPORT = 'https://account.xiaomi.com';
export const HEALTH_HOSTS = [
  'hlth.io.mi.com',
  'sg.hlth.io.mi.com',
  'de.hlth.io.mi.com',
  'ru.hlth.io.mi.com',
  'us.hlth.io.mi.com',
  'i2.hlth.io.mi.com'
];
export const DEFAULT_UA = 'MiFitness/4.6.0 (Linux; Android 14; Pixel 7) okhttp/4.12.0';

// ---------------------------------------------------------------- primitives

export function md5Upper(text) {
  return createHash('md5').update(text, 'utf8').digest('hex').toUpperCase();
}

export function stripPrefix(body) {
  const prefix = '&&&START&&&';
  return body.startsWith(prefix) ? body.slice(prefix.length) : body;
}

export function randomDeviceId() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += letters[bytes[i] % 26];
  return out;
}

/** 8 random bytes + 4-byte big-endian minutes since epoch, base64. */
export function generateNonce(millis = Date.now(), rand = randomBytes(8)) {
  const buf = Buffer.alloc(12);
  rand.copy(buf, 0, 0, 8);
  buf.writeUInt32BE(Math.floor(millis / 60000) >>> 0, 8);
  return buf.toString('base64');
}

/** base64(SHA256(b64dec(ssecurity) || b64dec(nonce))) */
export function signedNonce(ssecurity, nonce) {
  return createHash('sha256')
    .update(Buffer.from(ssecurity, 'base64'))
    .update(Buffer.from(nonce, 'base64'))
    .digest('base64');
}

/** base64(SHA1("METHOD&path&k=v&...&signedNonce")), keys in ASCII order. */
export function encSignature(urlPath, method, signed, params) {
  const keys = Object.keys(params).sort();
  const pieces = [method.toUpperCase(), urlPath];
  for (const k of keys) pieces.push(`${k}=${params[k]}`);
  pieces.push(signed);
  return createHash('sha1').update(pieces.join('&'), 'utf8').digest('base64');
}

/** Minimal RC4 keystream generator (OpenSSL 3 ships RC4 only in the legacy provider). */
export function createRc4(keyBytes, dropBytes = 0) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  let x = 0, y = 0;
  const apply = (data) => {
    const out = Buffer.alloc(data.length);
    for (let n = 0; n < data.length; n++) {
      x = (x + 1) & 0xff;
      y = (y + S[x]) & 0xff;
      [S[x], S[y]] = [S[y], S[x]];
      out[n] = data[n] ^ S[(S[x] + S[y]) & 0xff];
    }
    return out;
  };
  if (dropBytes > 0) apply(Buffer.alloc(dropBytes));
  return { apply };
}

/** Encrypt values with one continuous RC4 stream (1024 bytes dropped), ASCII key order. */
export function rc4EncryptParams(signed, params) {
  const rc4 = createRc4(Buffer.from(signed, 'base64'), 1024);
  const out = {};
  for (const k of Object.keys(params).sort()) {
    out[k] = rc4.apply(Buffer.from(params[k], 'utf8')).toString('base64');
  }
  return out;
}

export function rc4DecryptBody(signed, body) {
  const rc4 = createRc4(Buffer.from(signed, 'base64'), 1024);
  const data = Buffer.from(body.trim().replace(/^"|"$/g, ''), 'base64');
  return rc4.apply(data).toString('utf8');
}

export function healthRegionTag(host) {
  if (!host || !host.endsWith('.hlth.io.mi.com')) return 'cn';
  const tag = host.slice(0, -'.hlth.io.mi.com'.length);
  return tag && !tag.includes('.') ? tag : 'cn';
}

/** Builds the signed + encrypted form body for a Mi service call. */
export function buildEncryptedForm(urlPath, ssecurity, plainParams, nonce = generateNonce()) {
  const signed = signedNonce(ssecurity, nonce);
  const withHash = { ...plainParams, rc4_hash__: encSignature(urlPath, 'POST', signed, plainParams) };
  const encrypted = rc4EncryptParams(signed, withHash);
  encrypted.signature = encSignature(urlPath, 'POST', signed, encrypted);
  encrypted._nonce = nonce;
  return { form: encrypted, signed, nonce };
}

// ------------------------------------------------------------------ cookies

/** Tiny cookie jar: name → value per registrable domain, good enough for xiaomi.com / mi.com. */
export function createCookieJar() {
  const store = new Map(); // domain → Map(name → value)

  function domainOf(hostOrDomain) {
    const d = hostOrDomain.replace(/^\./, '').toLowerCase();
    const parts = d.split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : d;
  }
  function set(domain, name, value) {
    const key = domainOf(domain);
    if (!store.has(key)) store.set(key, new Map());
    if (value === '' || value === undefined) store.get(key).delete(name);
    else store.get(key).set(name, value);
  }
  function setFromHeaders(url, setCookieHeaders) {
    const host = new URL(url).hostname;
    for (const raw of setCookieHeaders || []) {
      const [pair, ...attrs] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const domAttr = attrs.map((a) => a.trim()).find((a) => /^domain=/i.test(a));
      set(domAttr ? domAttr.split('=')[1] : host, name, value);
    }
  }
  function headerFor(url) {
    const host = new URL(url).hostname;
    const m = store.get(domainOf(host));
    if (!m || !m.size) return '';
    return [...m.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  function get(name) {
    for (const m of store.values()) if (m.has(name)) return m.get(name);
    return undefined;
  }
  function importHeader(domain, cookieHeader) {
    for (const part of String(cookieHeader || '').split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) set(domain, part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  return { set, setFromHeaders, headerFor, get, importHeader };
}

function setCookiesOf(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

// ---------------------------------------------------------------- HTTP flow

async function fetchWithJar(fetchImpl, jar, url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const cookie = jar.headerFor(url);
  if (cookie) headers.Cookie = cookie;
  const response = await fetchImpl(url, { ...options, headers, redirect: 'manual' });
  jar.setFromHeaders(url, setCookiesOf(response));
  return response;
}

/** GET following redirects manually so every hop's Set-Cookie lands in the jar. */
async function getFollow(fetchImpl, jar, url, headers, maxHops = 10) {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    const response = await fetchWithJar(fetchImpl, jar, current, { method: 'GET', headers });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new Error('Quá nhiều lần chuyển hướng khi lấy serviceToken');
}

export function parseServiceLoginBody(text) {
  const json = JSON.parse(stripPrefix(text));
  if (json._sign) return { needCredential: true, sign: json._sign, json };
  return { needCredential: false, auth: json, json };
}

function headerValue(response, name) {
  const v = response.headers.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Logs in and returns { userId, deviceId, ssecurity, serviceToken, cUserId, passToken }.
 * Throws { code: 'TWO_FACTOR', url } when Xiaomi asks for verification.
 */
export async function loginMiAccount({ username, password, ua = DEFAULT_UA, deviceId, cookieHeader, fetchImpl = fetch, log = () => {} }) {
  const jar = createCookieJar();
  deviceId = deviceId || randomDeviceId();
  for (const d of ['mi.com', 'xiaomi.com']) {
    jar.set(d, 'sdkVersion', SDK_VERSION);
    jar.set(d, 'deviceId', deviceId);
  }
  if (cookieHeader) jar.importHeader('xiaomi.com', cookieHeader);

  const baseHeaders = { 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded' };

  // Step 1: _sign
  const step1 = await fetchWithJar(fetchImpl, jar, `${PASSPORT}/pass/serviceLogin?sid=${HEALTH_SID}&_json=true`, { method: 'GET', headers: baseHeaders });
  if (step1.status !== 200) throw new Error(`serviceLogin thất bại: HTTP ${step1.status}`);
  const s1 = parseServiceLoginBody(await step1.text());
  let auth;
  if (!s1.needCredential) {
    log('serviceLogin trả về phiên đã xác thực (cookie hợp lệ)');
    auth = s1.auth;
  } else {
    if (!password) throw new Error('Cần mật khẩu: cookie không đủ để đăng nhập');
    // Step 2: serviceLoginAuth2
    const form = new URLSearchParams({
      sid: HEALTH_SID,
      hash: md5Upper(password),
      callback: 'https://sts-hlth.io.mi.com/healthapp/sts',
      qs: '%3Fsid%3Dmiothealth%26_json%3Dtrue',
      user: username,
      _sign: s1.sign,
      _json: 'true'
    });
    const step2 = await fetchWithJar(fetchImpl, jar, `${PASSPORT}/pass/serviceLoginAuth2`, {
      method: 'POST',
      headers: { 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (step2.status !== 200) throw new Error(`serviceLoginAuth2 thất bại: HTTP ${step2.status}`);
    const s2 = parseServiceLoginBody(await step2.text());
    if (s2.needCredential) throw new Error('serviceLoginAuth2 vẫn yêu cầu đăng nhập lại (sai sid hoặc bị chặn)');
    auth = s2.auth;
    if (!auth.passToken) auth.passToken = headerValue(step2, 'passToken');
    if (!auth.cUserId) auth.cUserId = headerValue(step2, 'cUserId');
  }

  if (auth.code !== 0 && auth.code !== undefined) {
    if (auth.code === 70016) throw new Error('Đăng nhập thất bại: sai tên đăng nhập hoặc mật khẩu');
    throw new Error(`Đăng nhập thất bại: code=${auth.code} ${auth.description || auth.desc || ''}`);
  }
  if (auth.notificationUrl) {
    const err = new Error('Xiaomi yêu cầu xác minh hai bước');
    err.code = 'TWO_FACTOR';
    err.url = auth.notificationUrl;
    err.deviceId = deviceId;
    throw err;
  }
  if (!auth.ssecurity) throw new Error('Phản hồi đăng nhập thiếu ssecurity');
  if (!auth.location) throw new Error('Phản hồi đăng nhập thiếu location');

  // Step 3: follow location → serviceToken
  const step3 = await getFollow(fetchImpl, jar, auth.location, baseHeaders);
  if (step3.status !== 200) throw new Error(`Chuyển hướng location thất bại: HTTP ${step3.status}`);
  const serviceToken = headerValue(step3, 'serviceToken') || headerValue(step3, `${HEALTH_SID}_serviceToken`) ||
    jar.get('serviceToken') || jar.get(`${HEALTH_SID}_serviceToken`);
  if (!serviceToken) throw new Error('Không lấy được serviceToken sau khi đăng nhập');
  const cUserId = headerValue(step3, 'cUserId') || jar.get('cUserId') || auth.cUserId || '';

  return {
    userId: auth.userId ? String(auth.userId) : (jar.get('userId') || ''),
    deviceId,
    ssecurity: auth.ssecurity,
    serviceToken,
    cUserId,
    passToken: auth.passToken || jar.get('passToken') || ''
  };
}

/** One signed+encrypted POST to a Mi service URL; returns the decrypted JSON. */
export async function miServiceCall({ token, url, params, ua = DEFAULT_UA, fetchImpl = fetch }) {
  const u = new URL(url);
  const { form, signed } = buildEncryptedForm(u.pathname, token.ssecurity, params);
  const cookie = [
    `sdkVersion=${SDK_VERSION}`,
    'locale=en_us',
    token.deviceId ? `deviceId=${token.deviceId}` : null,
    token.userId ? `userId=${token.userId}` : null,
    token.cUserId ? `cUserId=${token.cUserId}` : null,
    `serviceToken=${token.serviceToken}`
  ].filter(Boolean).join('; ');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'User-Agent': ua,
      region_tag: healthRegionTag(u.hostname),
      HandleParams: 'true',
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(form).toString(),
    redirect: 'manual'
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  return JSON.parse(rc4DecryptBody(signed, body));
}

/** Queries every health host; returns { devices, perHost } with duplicates removed. */
export async function fetchBoundDevices({ token, ua = DEFAULT_UA, hosts = HEALTH_HOSTS, fetchImpl = fetch, log = () => {} }) {
  const devices = [];
  const perHost = {};
  const params = { data: JSON.stringify({ page_size: 50, status: 1 }) };
  for (const host of hosts) {
    try {
      const json = await miServiceCall({ token, url: `https://${host}/app/v1/source/get_source_list`, params, ua, fetchImpl });
      if (json.code !== 0) {
        perHost[host] = `code=${json.code} ${json.message || ''}`.trim();
        log(`${host}: ${perHost[host]}`);
        continue;
      }
      const list = (json.result && Array.isArray(json.result.list)) ? json.result.list : [];
      perHost[host] = `${list.length} thiết bị`;
      for (const d of list) if (!devices.some((k) => k.identifier === d.identifier)) devices.push(d);
    } catch (e) {
      perHost[host] = `lỗi: ${e.message}`;
    }
    log(`${host}: ${perHost[host]}`);
  }
  return { devices, perHost };
}

export function formatDevice(d) {
  const det = d.detail || {};
  return [
    `Tên:        ${d.name || '(không tên)'}`,
    `Model:      ${d.model || ''}`,
    `MAC:        ${det.mac || ''}`,
    `Firmware:   ${det.fw_ver || ''}`,
    `SN:         ${det.sn || ''}`,
    `Identifier: ${d.identifier || ''}`,
    `AuthKey:    ${det.encrypt_key || '(trống)'}`
  ].join('\n');
}
