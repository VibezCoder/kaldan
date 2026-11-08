import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequestHandler, createServer, DEFAULT_STATIC_ROOT, parseByteRange, validateEnquiry } from './server.mjs';

// Every HTTP connection in these tests goes to a temporary server on loopback.
// The real provider fetch is always replaced, even when testing missing configuration.
const CONFIG = { RESEND_API_KEY: 're_test_NOT_A_REAL_KEY', ENQUIRY_FROM: 'Hotel Reservations <sender@example.com>' };
const VALID = {
  name: 'Test Guest', email: 'guest@example.com', phone: '+91 98765 43210',
  interest: 'A palace stay', date: '2028-02-29', guests: '2',
  message: 'Please let me know about a palace stay.', consent: 'on', website: '',
};
const ACCEPTANCE = { id: '88fd287a-d601-4770-ad61-ef71f414a32c' };
let fixture;
let root;
let junctionAvailable = false;

before(async () => {
  fixture = await mkdtemp(path.join(tmpdir(), 'kaldan-server-test-'));
  root = path.join(fixture, 'dist');
  await Promise.all([
    mkdir(path.join(root, 'rooms', 'suite'), { recursive: true }),
    mkdir(path.join(root, 'assets'), { recursive: true }),
    mkdir(path.join(root, 'empty-directory'), { recursive: true }),
    mkdir(path.join(fixture, 'dist-private'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, 'index.html'), '<h1>Fixture home</h1>'),
    writeFile(path.join(root, 'rooms', 'suite', 'index.html'), '<h1>Fixture suite</h1>'),
    writeFile(path.join(root, 'assets', 'clip.mp4'), Buffer.from('0123456789')),
    writeFile(path.join(root, 'assets', 'empty.mp4'), Buffer.alloc(0)),
    writeFile(path.join(root, 'assets', 'space name.txt'), 'Space fixture'),
    writeFile(path.join(root, '.env'), 'FIXTURE_HIDDEN_SECRET'),
    writeFile(path.join(fixture, 'secret.txt'), 'FIXTURE_OUTSIDE_SECRET'),
    writeFile(path.join(fixture, 'dist-private', 'index.html'), 'FIXTURE_SIBLING_SECRET'),
    ...['css', 'js', 'json', 'svg', 'webp', 'avif', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'webm', 'pdf', 'bin'].map(extension =>
      writeFile(path.join(root, 'assets', `sample.${extension}`), `fixture-${extension}`)),
  ]);
  try {
    await symlink(path.join(fixture, 'dist-private'), path.join(root, 'escape'), 'junction');
    junctionAvailable = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
  }
});

after(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

function providerResponse(value = ACCEPTANCE, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

async function start(t, options = {}) {
  const server = createServer({
    root, env: {},
    fetch: async () => { throw new Error('Unexpected provider call; external network is disabled in tests.'); },
    ...options,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });
  return server;
}

function origin(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function request(server, { method = 'GET', target = '/', headers = {}, body, chunks, end = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1', port: server.address().port, method,
      // Deliberately use the raw request target: URL/fetch would normalize traversal paths.
      path: target, headers, agent: false,
    }, res => {
      const received = [];
      res.on('data', chunk => received.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const buffer = Buffer.concat(received);
        resolve({ status: res.statusCode, headers: res.headers, buffer, text: buffer.toString('utf8') });
        if (!end) req.destroy();
      });
    });
    req.on('error', reject);
    if (chunks) for (const chunk of chunks) req.write(chunk);
    if (body !== undefined) req.write(body);
    if (end) req.end();
    else req.flushHeaders();
  });
}

function submit(server, changes = {}, options = {}) {
  return request(server, {
    method: 'POST', target: '/api/enquiry', body: JSON.stringify({ ...VALID, ...changes }),
    ...options,
    headers: { Origin: origin(server), 'Content-Type': 'application/json', ...options.headers },
  });
}

function assertFailure(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers['content-type'], /^application\/json/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  const data = JSON.parse(response.text);
  assert.equal(data.ok, false);
  assert.equal(typeof data.message, 'string');
  assert.doesNotMatch(data.message, /sent successfully|successfully delivered|accepted by our email service|confirmed reservation/i);
  assert.doesNotMatch(response.text, /re_test_NOT_A_REAL_KEY|guest@example\.com|Test Guest|upstream-secret/);
  return data;
}

test('exports an import-relative static root and injectable handler', () => {
  assert.equal(DEFAULT_STATIC_ROOT, fileURLToPath(new URL('./dist/', import.meta.url)));
  assert.equal(typeof createRequestHandler({ root, env: {} }), 'function');
});

test('validation matches frontend strings and normalizes safe whitespace', () => {
  assert.deepEqual(validateEnquiry(VALID), VALID);
  const normalized = validateEnquiry({
    ...VALID, name: '  Zoë Guest  ', email: ' guest+stay@example.com ',
    phone: undefined, date: undefined, guests: undefined, website: undefined,
    message: '  First line of enquiry\r\nSecond line\twith a tab.  ',
  });
  assert.equal(normalized.name, 'Zoë Guest');
  assert.equal(normalized.email, 'guest+stay@example.com');
  assert.equal(normalized.message, 'First line of enquiry\nSecond line\twith a tab.');
  for (const key of ['phone', 'date', 'guests', 'website']) assert.equal(normalized[key], '');
  for (const interest of ['A palace stay', 'Dining', 'A wedding', 'An event or conference', 'An experience', 'Something else']) {
    assert.equal(validateEnquiry({ ...VALID, interest }).interest, interest);
  }
  assert.equal(validateEnquiry({ ...VALID, guests: '3000', message: 'x'.repeat(4000) }).guests, '3000');
});

test('validation rejects malformed, unbounded and injection-bearing fields', async t => {
  const cases = [
    ['missing name', { name: undefined }], ['blank name', { name: '  ' }],
    ['long name', { name: 'x'.repeat(101) }], ['non-string name', { name: {} }],
    ['name header injection', { name: 'Guest\r\nBcc: attacker@example.com' }],
    ['leading control stripped by trim', { name: '\nGuest' }],
    ['bidi controls', { name: 'Guest\u202e' }],
    ['missing email', { email: undefined }], ['email display name', { email: 'Guest <guest@example.com>' }],
    ['email header injection', { email: 'guest@example.com\r\nBcc: attacker@example.com' }],
    ['multiple email recipients', { email: 'guest@example.com,attacker@example.com' }],
    ['invalid domain', { email: 'guest@-example.com' }], ['local domain', { email: 'guest@localhost' }],
    ['local double dot', { email: 'gu..est@example.com' }], ['oversized local part', { email: `${'g'.repeat(65)}@example.com` }],
    ['long email', { email: 'g'.repeat(255) }], ['email null', { email: null }],
    ['invalid phone', { phone: '<script>alert(1)</script>' }], ['long phone', { phone: '1'.repeat(41) }],
    ['numeric phone', { phone: 1234567890 }], ['phone controls', { phone: '+91\n1234567890' }],
    ['unknown interest', { interest: 'Bcc: attacker@example.com' }], ['missing interest', { interest: undefined }],
    ['non-leap date', { date: '2027-02-29' }], ['impossible date', { date: '2028-04-31' }],
    ['bad month', { date: '2028-13-01' }], ['bad date format', { date: '01/01/2028' }],
    ['year zero', { date: '0000-01-01' }], ['timestamp date', { date: '2028-01-01T00:00:00Z' }],
    ['zero guests', { guests: '0' }], ['too many guests', { guests: '3001' }],
    ['negative guests', { guests: '-1' }], ['fractional guests', { guests: '1.5' }],
    ['exponent guests', { guests: '1e2' }], ['padded guests', { guests: '02' }], ['numeric guests', { guests: 2 }],
    ['missing message', { message: undefined }], ['short message', { message: 'Short' }],
    ['blank message', { message: ' '.repeat(30) }], ['long message', { message: 'x'.repeat(4001) }],
    ['message null byte', { message: 'Hello\u0000 there!' }], ['message bare CR', { message: 'Hello\r there!' }],
    ['missing consent', { consent: undefined }], ['boolean consent', { consent: true }], ['padded consent', { consent: 'on ' }],
    ['honeypot filled', { website: 'https://bot.example.com' }], ['honeypot whitespace', { website: ' ' }],
    ['honeypot wrong type', { website: [] }], ['recipient injection', { to: 'attacker@example.com' }],
    ['reply header override', { reply_to: 'attacker@example.com' }], ['subject override', { subject: 'Injected' }],
    ['HTML override', { html: '<img src=x>' }], ['prototype key', { constructor: 'bad' }],
  ];
  for (const [label, changes] of cases) {
    await t.test(label, () => assert.throws(() => validateEnquiry({ ...VALID, ...changes }), error => error.status === 400));
  }
  for (const input of [null, [], 'string', 123, true, JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => validateEnquiry(input), error => error.status === 400);
  }
  assert.equal({}.polluted, undefined);
});

test('serves clean nested routes, index files, query strings and HEAD without SPA fallback', async t => {
  const server = await start(t);
  for (const target of ['/', '/index.html', '/?utm_source=test']) {
    const res = await request(server, { target });
    assert.equal(res.status, 200);
    assert.equal(res.text, '<h1>Fixture home</h1>');
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  }
  for (const target of ['/rooms/suite', '/rooms/suite/', '/rooms/suite/index.html', '/rooms/suite?date=test']) {
    const res = await request(server, { target });
    assert.equal(res.status, 200);
    assert.equal(res.text, '<h1>Fixture suite</h1>');
  }
  const get = await request(server, { target: '/rooms/suite' });
  const head = await request(server, { method: 'HEAD', target: '/rooms/suite' });
  assert.equal(head.status, 200);
  assert.equal(head.buffer.length, 0);
  for (const key of ['content-length', 'content-type', 'last-modified', 'accept-ranges']) assert.equal(head.headers[key], get.headers[key]);
  const space = await request(server, { target: '/assets/space%20name.txt' });
  assert.equal(space.text, 'Space fixture');
  for (const target of ['/missing', '/missing.html', '/rooms', '/empty-directory/', '/assets/missing.js', '/index.html/']) {
    const res = await request(server, { target });
    assert.equal(res.status, 404, target);
    assert.doesNotMatch(res.text, /Fixture home|Fixture suite/);
  }
  const missingHead = await request(server, { method: 'HEAD', target: '/missing' });
  assert.equal(missingHead.status, 404);
  assert.equal(missingHead.buffer.length, 0);
});

test('serves asset MIME types including fonts, modern images and video', async t => {
  const server = await start(t);
  const expected = {
    css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', woff: 'font/woff', woff2: 'font/woff2',
    ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', webm: 'video/webm',
    pdf: 'application/pdf', bin: 'application/octet-stream',
  };
  for (const [extension, mime] of Object.entries(expected)) {
    const res = await request(server, { target: `/assets/sample.${extension}` });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], mime);
    assert.equal(res.text, `fixture-${extension}`);
  }
  const video = await request(server, { target: '/assets/clip.mp4' });
  assert.equal(video.headers['content-type'], 'video/mp4');
  assert.equal(video.headers['content-length'], '10');
});

test('rejects raw, encoded, double-encoded and Windows traversal paths', async t => {
  const server = await start(t);
  const targets = [
    '/../secret.txt', '/rooms/../../secret.txt', '/%2e%2e/secret.txt', '/%2E%2E/secret.txt',
    '/.%2e/secret.txt', '/%2e./secret.txt', '/rooms/%2e%2e/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt', '/%252e%252e/secret.txt', '/%252e%252e%252fsecret.txt',
    '/..\\secret.txt', '/..%5csecret.txt', '/%5c%5cserver/share', '//server/share',
    '/C:/secret.txt', '/C%3a/secret.txt', '/index.html::$DATA', '/index.html%3a%3a$DATA',
    '/index.html%00.css', '/.env', '/%2eenv', '/rooms/../index.html',
    '/rooms/%2f../index.html', '/index.html.', '/index.html%20', '/NUL', '/COM1.txt',
    '/%ZZ', '/%E0%A4%A', '/index.html#fragment',
  ];
  for (const target of targets) {
    const res = await request(server, { target });
    assert.equal(res.status, 400, target);
    assert.doesNotMatch(res.text, /FIXTURE_|Fixture home|Fixture suite/);
  }
});

test('does not follow symlinks or junctions out of the static root', async t => {
  if (!junctionAvailable) return t.skip('This platform does not permit creating test symlinks/junctions.');
  const server = await start(t);
  for (const target of ['/escape', '/escape/', '/escape/index.html']) {
    const res = await request(server, { target });
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /FIXTURE_SIBLING_SECRET/);
  }
});

test('only permits GET/HEAD static and POST on the exact enquiry endpoint', async t => {
  const server = await start(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const res = await request(server, { method });
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
  }
  for (const method of ['GET', 'HEAD', 'PUT', 'OPTIONS']) {
    const res = await request(server, { method, target: '/api/enquiry' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'POST');
    if (method === 'HEAD') assert.equal(res.buffer.length, 0);
    else assertFailure(res, 405);
  }
  assertFailure(await submit(server, {}, { target: '/api/enquiry/' }), 404);
  assertFailure(await request(server, { target: '/api/unknown' }), 404);
});

test('parses byte ranges safely, including integers beyond Number precision', () => {
  assert.deepEqual(parseByteRange('bytes=0-3', 10), { start: 0, end: 3 });
  assert.deepEqual(parseByteRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-9999999999999999999999999', 10), { start: 0, end: 9 });
  assert.deepEqual(parseByteRange('bytes=2-9999999999999999999999999', 10), { start: 2, end: 9 });
  for (const range of ['bytes=10-', 'bytes=8-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'bytes=abc-def', 'items=0-2', 'bytes=1.5-2', 'bytes=9999999999999999999999999-']) {
    assert.equal(parseByteRange(range, 10), null, range);
  }
  assert.equal(parseByteRange('bytes=0-0', 0), null);
});

test('streams exact byte ranges and reports 416 for unsupported or unsatisfiable ranges', async t => {
  const server = await start(t);
  const cases = [
    ['bytes=0-0', '0', 'bytes 0-0/10'], ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=-99', '0123456789', 'bytes 0-9/10'], ['bytes=8-999', '89', 'bytes 8-9/10'],
  ];
  for (const [range, text, contentRange] of cases) {
    const res = await request(server, { target: '/assets/clip.mp4', headers: { Range: range } });
    assert.equal(res.status, 206);
    assert.equal(res.text, text);
    assert.equal(res.headers['content-length'], String(Buffer.byteLength(text)));
    assert.equal(res.headers['content-range'], contentRange);
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.equal(res.headers['content-type'], 'video/mp4');
  }
  for (const range of ['bytes=10-', 'bytes=9-8', 'bytes=-0', 'bytes=0-1,4-5', 'invalid', 'bytes=9999999999999999999999-']) {
    const res = await request(server, { target: '/assets/clip.mp4', headers: { Range: range } });
    assert.equal(res.status, 416, range);
    assert.equal(res.headers['content-range'], 'bytes */10');
    assert.equal(res.headers['content-length'], String(res.buffer.length));
  }
  const empty = await request(server, { target: '/assets/empty.mp4' });
  assert.equal(empty.status, 200);
  assert.equal(empty.buffer.length, 0);
  const emptyRange = await request(server, { target: '/assets/empty.mp4', headers: { Range: 'bytes=0-0' } });
  assert.equal(emptyRange.status, 416);
  assert.equal(emptyRange.headers['content-range'], 'bytes */0');
});

test('HEAD ignores Range and If-Range mismatch returns the full representation', async t => {
  const server = await start(t);
  const full = await request(server, { target: '/assets/clip.mp4' });
  for (const range of ['bytes=0-2', 'bytes=99-']) {
    const res = await request(server, { method: 'HEAD', target: '/assets/clip.mp4', headers: { Range: range } });
    assert.equal(res.status, 200);
    assert.equal(res.buffer.length, 0);
    assert.equal(res.headers['content-length'], '10');
    assert.equal(res.headers['content-range'], undefined);
  }
  const matched = await request(server, {
    target: '/assets/clip.mp4', headers: { Range: 'bytes=0-2', 'If-Range': full.headers['last-modified'] },
  });
  assert.equal(matched.status, 206);
  const mismatch = await request(server, {
    target: '/assets/clip.mp4', headers: { Range: 'bytes=0-2', 'If-Range': 'Wed, 01 Jan 2020 00:00:00 GMT' },
  });
  assert.equal(mismatch.status, 200);
  assert.equal(mismatch.text, '0123456789');
});

test('requires a single, exact same-origin Origin and ignores forwarded origin claims', async t => {
  let calls = 0;
  const server = await start(t, {
    env: CONFIG, rateLimit: { maxRequests: 30 },
    fetch: async () => { calls += 1; return providerResponse(); },
  });
  const badOrigins = ['null', 'https://foreign.example', origin(server).replace('http:', 'https:'),
    `${origin(server)}.evil.example`, `${origin(server)}/`, `${origin(server)}/path`,
    `${origin(server)}?x=1`, `${origin(server)}#fragment`, `http://user@127.0.0.1:${server.address().port}`];
  for (const value of badOrigins) assertFailure(await submit(server, {}, { headers: { Origin: value } }), 403);
  assertFailure(await request(server, {
    method: 'POST', target: '/api/enquiry', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(VALID),
  }), 403);
  assertFailure(await submit(server, {}, { headers: { Origin: [origin(server), origin(server)] } }), 403);
  assertFailure(await submit(server, {}, {
    headers: { Origin: 'https://foreign.example', 'X-Forwarded-Host': 'foreign.example', 'X-Forwarded-Proto': 'https', Forwarded: 'host=foreign.example;proto=https' },
  }), 403);
  assert.equal(calls, 0);
  assert.equal((await submit(server)).status, 200);
  assert.equal(calls, 1);
});

test('supports an explicit HTTPS origin behind a reverse proxy without trusting forwarded headers', async t => {
  const server = await start(t, { env: { ...CONFIG, PUBLIC_ORIGIN: 'https://hotel.example.com' }, fetch: async () => providerResponse() });
  assert.equal((await submit(server, {}, { headers: { Origin: 'https://hotel.example.com' } })).status, 200);
  assertFailure(await submit(server, {}, { headers: { Origin: 'https://other.example.com', 'X-Forwarded-Host': 'hotel.example.com' } }), 403);
  assert.throws(() => createRequestHandler({ env: { PUBLIC_ORIGIN: 'https://hotel.example.com/' } }), TypeError);
});

test('validates content type, JSON shape, UTF-8 and fields before calling the provider', async t => {
  let calls = 0;
  const server = await start(t, {
    env: CONFIG, rateLimit: { maxRequests: 30 },
    fetch: async () => { calls += 1; return providerResponse(); },
  });
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'application/json; charset=latin1']) {
    assertFailure(await submit(server, {}, { headers: { 'Content-Type': contentType } }), 415);
  }
  assertFailure(await submit(server, {}, { headers: { 'Content-Encoding': 'gzip' } }), 415);
  for (const body of ['{', '', 'null', '[]', 'true', '"hello"', '{"__proto__":{"polluted":true}}', Buffer.from([0xff, 0xfe])]) {
    assertFailure(await submit(server, {}, { body }), 400);
  }
  assertFailure(await submit(server, { email: 'guest@example.com\r\nBcc: attacker@example.com' }), 400);
  assertFailure(await submit(server, { website: 'spam' }), 400);
  assertFailure(await submit(server, { consent: '' }), 400);
  assertFailure(await submit(server, { to: 'attacker@example.com' }), 400);
  assert.equal(calls, 0);
  assert.equal((await submit(server, {}, { headers: { 'Content-Type': 'application/json; charset=UTF-8' } })).status, 200);
});

test('enforces the body limit by declared length and actual chunked bytes', async t => {
  let calls = 0;
  const server = await start(t, { env: CONFIG, fetch: async () => { calls += 1; return providerResponse(); } });
  const large = Buffer.from(JSON.stringify({ ...VALID, message: 'x'.repeat(17000) }));
  assertFailure(await submit(server, {}, { body: large, headers: { 'Content-Length': String(large.length) } }), 413);
  assertFailure(await submit(server, {}, { body: undefined, chunks: [large.subarray(0, 9000), large.subarray(9000)] }), 413);
  // Count UTF-8 bytes, not UTF-16 string length.
  const multibyte = JSON.stringify({ ...VALID, extra: '界'.repeat(6000) });
  assert.ok(multibyte.length < 16384 && Buffer.byteLength(multibyte) > 16384);
  assertFailure(await submit(server, {}, { body: multibyte }), 413);
  assert.equal(calls, 0);
});

test('times out an unfinished request body without contacting the provider', async t => {
  let calls = 0;
  const server = await start(t, {
    env: CONFIG, bodyTimeoutMs: 50,
    fetch: async () => { calls += 1; return providerResponse(); },
  });
  const res = await submit(server, {}, { body: '{"name":', end: false });
  assertFailure(res, 408);
  assert.equal(res.headers.connection, 'close');
  assert.equal(calls, 0);
});

test('rate-limits attempts by socket IP, not attacker-controlled forwarding headers, and resets', async t => {
  let time = 100000;
  let calls = 0;
  const server = await start(t, {
    env: CONFIG, now: () => time, rateLimit: { maxRequests: 2, windowMs: 60000 },
    fetch: async () => { calls += 1; return providerResponse(); },
  });
  assertFailure(await submit(server, { consent: '' }, { headers: { 'X-Forwarded-For': '192.0.2.1' } }), 400);
  assert.equal((await submit(server, {}, { headers: { 'X-Forwarded-For': '192.0.2.2' } })).status, 200);
  const limited = await submit(server, {}, { headers: { 'X-Forwarded-For': '192.0.2.3', 'X-Real-IP': '192.0.2.4', Forwarded: 'for=192.0.2.5' } });
  assertFailure(limited, 429);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal(calls, 1);
  assert.equal((await request(server)).status, 200);
  time += 60000;
  assert.equal((await submit(server)).status, 200);
  assert.equal(calls, 2);
});

test('the default enquiry rate limit permits five attempts per ten minutes', async t => {
  const server = await start(t, { now: () => 100000 });
  for (let i = 0; i < 5; i += 1) assertFailure(await submit(server), 503);
  const limited = await submit(server);
  assertFailure(limited, 429);
  assert.equal(limited.headers['retry-after'], '600');
});

test('missing or unsafe configuration returns honest JSON 503 without fetching', async t => {
  const cases = [
    {}, { RESEND_API_KEY: CONFIG.RESEND_API_KEY }, { ENQUIRY_FROM: CONFIG.ENQUIRY_FROM },
    { ...CONFIG, RESEND_API_KEY: '' }, { ...CONFIG, ENQUIRY_FROM: '' },
    { ...CONFIG, RESEND_API_KEY: 're_key\r\nX-Secret: value' },
    { ...CONFIG, ENQUIRY_FROM: 'sender@example.com\r\nBcc: attacker@example.com' },
    { ...CONFIG, ENQUIRY_FROM: 'not-an-email' },
  ];
  for (const env of cases) {
    let calls = 0;
    const server = await start(t, { env, fetch: async () => { calls += 1; return providerResponse(); } });
    const data = assertFailure(await submit(server), 503);
    assert.match(data.message, /unavailable/i);
    assert.match(data.message, /reservations\.samudhra@kaldanhotels\.com/);
    assert.equal(calls, 0);
  }
});

test('only confirmed acceptance succeeds, with a fixed recipient, sender and subject and plaintext body', async t => {
  const calls = [];
  const server = await start(t, {
    env: CONFIG,
    fetch: async (url, options) => { calls.push({ url, options }); return providerResponse(); },
  });
  const message = 'Please discuss my stay.\nBcc: attacker@example.com\n<script>alert("test")</script>';
  const res = await submit(server, { message });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.text), {
    ok: true,
    message: 'Your enquiry was accepted by our email service for sending. This is not a confirmed reservation.',
  });
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, `Bearer ${CONFIG.RESEND_API_KEY}`);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.ok(options.signal instanceof AbortSignal);
  const email = JSON.parse(options.body);
  assert.deepEqual(Object.keys(email).sort(), ['from', 'reply_to', 'subject', 'text', 'to']);
  assert.deepEqual(email.to, ['reservations.samudhra@kaldanhotels.com']);
  assert.equal(email.from, CONFIG.ENQUIRY_FROM);
  assert.equal(email.reply_to, VALID.email);
  assert.equal(email.subject, 'Kaldan Samudhra Palace — Website enquiry');
  assert.ok(email.text.endsWith(message));
  assert.match(email.text, /Consent to be contacted: Yes/);
  assert.equal(email.html, undefined);
  assert.equal(email.cc, undefined);
  assert.equal(email.bcc, undefined);
  assert.doesNotMatch(JSON.stringify(options.headers), /guest@example\.com|attacker@example\.com/);
  assert.doesNotMatch(res.text, /guest@example\.com|re_test_NOT_A_REAL_KEY/);
});

test('accepts a bare configured sender address', async t => {
  const server = await start(t, {
    env: { ...CONFIG, ENQUIRY_FROM: 'sender@example.com' },
    fetch: async (_url, options) => {
      assert.equal(JSON.parse(options.body).from, 'sender@example.com');
      return providerResponse(ACCEPTANCE, 202);
    },
  });
  assert.equal((await submit(server)).status, 200);
});

test('provider rejection, transport errors and malformed responses never report success or expose upstream text', async t => {
  const cases = [
    ['HTTP rejection', () => providerResponse({ message: 'upstream-secret guest@example.com' }, 422)],
    ['rate limited provider', () => providerResponse({ message: 'upstream-secret' }, 429)],
    ['provider unavailable', () => providerResponse({ message: 'upstream-secret' }, 503)],
    ['redirect', () => providerResponse(ACCEPTANCE, 302)],
    ['transport failure', () => { throw new Error(`upstream-secret ${CONFIG.RESEND_API_KEY}`); }],
    ['invalid JSON', () => new Response('upstream-secret', { headers: { 'Content-Type': 'application/json' } })],
    ['wrong content type', () => new Response(JSON.stringify(ACCEPTANCE), { headers: { 'Content-Type': 'text/html' } })],
    ['empty body', () => new Response(null, { status: 204 })],
    ['empty object', () => providerResponse({})], ['null response', () => providerResponse(null)],
    ['array response', () => providerResponse([ACCEPTANCE])], ['empty id', () => providerResponse({ id: '' })],
    ['numeric id', () => providerResponse({ id: 123 })], ['unsafe id', () => providerResponse({ id: 'id\r\nInjected' })],
    ['overlong id', () => providerResponse({ id: 'x'.repeat(129) })],
    ['error alongside id', () => providerResponse({ ...ACCEPTANCE, error: 'upstream-secret' })],
    ['errors alongside id', () => providerResponse({ ...ACCEPTANCE, errors: [] })],
    ['oversized response', () => providerResponse({ ...ACCEPTANCE, padding: 'x'.repeat(9000) })],
    ['oversized declared response', () => new Response(JSON.stringify(ACCEPTANCE), {
      headers: { 'Content-Type': 'application/json', 'Content-Length': '9000' },
    })],
  ];
  for (const [label, fetch] of cases) {
    await t.test(label, async child => {
      const server = await start(child, { env: CONFIG, fetch });
      const data = assertFailure(await submit(server), 502);
      assert.match(data.message, /could not confirm/i);
    });
  }
});

test('provider timeout aborts fetch even if a mock ignores the abort signal', async t => {
  let signal;
  const server = await start(t, {
    env: CONFIG, providerTimeoutMs: 50,
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const res = await submit(server);
  assertFailure(res, 504);
  assert.equal(signal.aborted, true);
});

test('provider timeout includes stalled response-body reading', async t => {
  let cancelled = false;
  const server = await start(t, {
    env: CONFIG, providerTimeoutMs: 50,
    fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  assertFailure(await submit(server), 504);
  assert.equal(cancelled, true);
});

test('provider status and body must both be accepted, not just an id in a failed response', async t => {
  const server = await start(t, { env: CONFIG, fetch: async () => providerResponse(ACCEPTANCE, 500) });
  assertFailure(await submit(server), 502);
});
