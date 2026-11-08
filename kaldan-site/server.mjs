import { createServer as createHttpServer } from 'node:http';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_STATIC_ROOT = fileURLToPath(new URL('./dist/', import.meta.url));
const RECIPIENT = 'reservations.samudhra@kaldanhotels.com';
const SUBJECT = 'Kaldan Samudhra Palace — Website enquiry';
const PROVIDER_URL = 'https://api.resend.com/emails';
const BODY_LIMIT = 16 * 1024;
const PROVIDER_BODY_LIMIT = 8 * 1024;
const UNAVAILABLE = `Online enquiries are currently unavailable. Please email ${RECIPIENT} or contact reservations directly.`;
const UNCONFIRMED = 'We could not confirm that your enquiry was sent. Please contact reservations directly.';
const INTERESTS = new Set([
  'A palace stay', 'Dining', 'A wedding', 'An event or conference',
  'An experience', 'Something else',
]);
const FIELDS = new Set(['name', 'email', 'phone', 'interest', 'date', 'guests', 'message', 'consent', 'website']);
const SINGLE_LINE_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.ogv': 'video/ogg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function invalid(field) {
  throw new HttpError(400, `Please provide a valid ${field}.`);
}

function isEmail(value) {
  if (value.length > 254 || !/^[\x21-\x7e]+$/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  const labels = domain.split('.');
  return local.length >= 1 && local.length <= 64
    && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && labels.length >= 2
    && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    && /[a-z]/i.test(labels.at(-1));
}

// The browser's FormData-to-JSON conversion sends strings, including guest counts.
export function validateEnquiry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
      || Object.keys(input).some(key => !FIELDS.has(key))) {
    throw new HttpError(400, 'Please provide a valid enquiry object with only the supported fields.');
  }
  function field(key, max, required = false) {
    const value = input[key] === undefined && !required ? '' : input[key];
    if (typeof value !== 'string' || value.length > max || SINGLE_LINE_CONTROLS.test(value)) invalid(key);
    const trimmed = value.trim();
    if (required && !trimmed) invalid(key);
    return trimmed;
  }
  const name = field('name', 100, true);
  const email = field('email', 254, true);
  if (!isEmail(email)) invalid('email address');
  const phone = field('phone', 40);
  if (phone && (!/^\+?[0-9 ().-]+$/.test(phone) || !/^[0-9]{5,20}$/.test(phone.replace(/\D/g, '')))) invalid('telephone number');
  const interest = field('interest', 40, true);
  if (!INTERESTS.has(interest)) invalid('interest');
  const date = field('date', 10);
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) invalid('date');
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) invalid('date');
  }
  const guests = field('guests', 4);
  if (guests && (!/^[1-9]\d{0,3}$/.test(guests) || Number(guests) > 3000)) invalid('guest count');
  if (input.consent !== 'on') invalid('consent');
  if (input.website !== undefined && input.website !== '') invalid('enquiry');
  if (typeof input.message !== 'string' || input.message.length > 4000) invalid('message');
  const message = input.message.replace(/\r\n/g, '\n');
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(message)
      || message.trim().length < 10) invalid('message');
  return { name, email, phone, interest, date, guests, message: message.trim(), consent: 'on', website: '' };
}

function configuredSender(env) {
  const key = env.RESEND_API_KEY;
  const from = env.ENQUIRY_FROM;
  if (typeof key !== 'string' || !/^[a-z0-9_-]{1,256}$/i.test(key)
      || typeof from !== 'string' || from.length > 320 || SINGLE_LINE_CONTROLS.test(from)) return null;
  const sender = from.trim();
  const display = /^([^<>"\\,;]{1,100}) <([^<>]+)>$/.exec(sender);
  if (!isEmail(display ? display[2] : sender)) return null;
  return { key, from: sender };
}

function enquiryText(data) {
  return [
    'Kaldan Samudhra Palace — Website enquiry',
    'This is an enquiry, not a confirmed reservation.', '',
    `Name: ${data.name}`, `Telephone: ${data.phone || 'Not specified'}`,
    `Interest: ${data.interest}`, `Preferred date: ${data.date || 'Not specified'}`,
    `Guests: ${data.guests || 'Not specified'}`, 'Consent to be contacted: Yes',
    '', 'Message:', data.message,
  ].join('\n');
}

function send(req, res, status, message, json = false, headers = {}) {
  if (res.destroyed) return;
  const body = Buffer.from(json ? JSON.stringify({ ok: status === 200, message }) : `${message}\n`);
  // Early rejections must not leave an unbounded request body on a keep-alive socket.
  if (!req.complete) {
    headers.Connection = 'close';
    req.resume();
  }
  res.writeHead(status, {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Content-Length': body.length, 'Cache-Control': 'no-store', ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sameOrigin(req, publicOrigin) {
  const { origin, host } = req.headers;
  const count = name => req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length;
  if (count('origin') !== 1 || count('host') !== 1 || typeof origin !== 'string' || typeof host !== 'string'
      || /[\s/\\?#@%,]/.test(host)) return false;
  try {
    const parsed = new URL(origin);
    // Do not trust Forwarded or X-Forwarded-* for either origin or client identity.
    const expected = publicOrigin || new URL(`${req.socket.encrypted ? 'https' : 'http'}://${host}`).origin;
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && origin === parsed.origin && parsed.origin === expected;
  } catch {
    return false;
  }
}

function createRateLimiter({ maxRequests = 5, windowMs = 10 * 60 * 1000, maxEntries = 10000 } = {}, now) {
  for (const value of [maxRequests, windowMs, maxEntries]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid rate limit settings.');
  }
  const clients = new Map();
  return ip => {
    const time = now();
    let entry = clients.get(ip);
    if (entry && entry.resetAt <= time) {
      clients.delete(ip);
      entry = undefined;
    }
    if (!entry) {
      if (clients.size >= maxEntries) {
        for (const [key, value] of clients) if (value.resetAt <= time) clients.delete(key);
        if (clients.size >= maxEntries) return Math.ceil(windowMs / 1000);
      }
      entry = { count: 0, resetAt: time + windowMs };
      clients.set(ip, entry);
    }
    if (entry.count >= maxRequests) return Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
    entry.count += 1;
    return 0;
  };
}

function readJson(req, timeoutMs) {
  if (Number(req.headers['content-length']) > BODY_LIMIT) {
    throw new HttpError(413, 'The enquiry is too large. Please shorten your message.');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => finish(new HttpError(408, 'The enquiry request timed out.')), timeoutMs);
    function finish(error, value) {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('aborted', onAborted);
      req.off('error', onError);
      // A socket may subsequently emit an error after an early body rejection.
      req.once('error', () => {});
      if (error) reject(error);
      else resolve(value);
    }
    function onData(chunk) {
      bytes += chunk.length;
      if (bytes > BODY_LIMIT) finish(new HttpError(413, 'The enquiry is too large. Please shorten your message.'));
      else chunks.push(chunk);
    }
    function onEnd() {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
        finish(null, JSON.parse(text));
      } catch {
        finish(new HttpError(400, 'Please send a valid UTF-8 JSON enquiry.'));
      }
    }
    function onAborted() { finish(new HttpError(400, 'The enquiry request was interrupted.')); }
    function onError() { finish(new HttpError(400, 'The enquiry request could not be read.')); }
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('aborted', onAborted);
    req.once('error', onError);
  });
}

async function providerJson(response, signal) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')
      || Number(response.headers.get('content-length')) > PROVIDER_BODY_LIMIT || !response.body) throw new Error('Invalid provider response.');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PROVIDER_BODY_LIMIT) {
        cancel();
        throw new Error('Invalid provider response.');
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)));
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function deliver(data, config, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    await Promise.race([
      (async () => {
        const response = await fetchImpl(PROVIDER_URL, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: config.from, to: [RECIPIENT], reply_to: data.email,
            subject: SUBJECT, text: enquiryText(data),
          }),
        });
        if (!response.ok || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
          throw new Error('Provider rejected enquiry.');
        }
        const result = await providerJson(response, controller.signal);
        if (!result || typeof result !== 'object' || Array.isArray(result)
            || typeof result.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(result.id)
            || 'error' in result || 'errors' in result) throw new Error('Provider acceptance was not confirmed.');
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new HttpError(504, UNCONFIRMED));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 504) throw error;
    // Neither upstream bodies, submitted fields nor credentials belong in errors or logs.
    throw new HttpError(502, UNCONFIRMED);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function requestPath(target) {
  // Inspect the raw target before any URL parser can normalize away dot segments.
  if (typeof target !== 'string' || target.length > 4096 || !target.startsWith('/') || target.startsWith('//') || target.includes('#')) {
    throw new HttpError(400, 'Invalid request path.');
  }
  const raw = target.split('?')[0];
  if (/%(?:2f|5c)/i.test(raw)) throw new HttpError(400, 'Invalid request path.');
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { throw new HttpError(400, 'Invalid request path.'); }
  // Also reject double encodings, Windows separators, ADS, device names and aliases.
  if (/[\\%<>:"|?*\u0000-\u001f\u007f-\u009f]/u.test(decoded)
      || decoded.split('/').some(segment => segment.startsWith('.') || /[. ]$/.test(segment)
        || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment))) {
    throw new HttpError(400, 'Invalid request path.');
  }
  return decoded;
}

function withinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Only a single byte range is supported. Invalid/unsatisfiable/multipart ranges return null.
export function parseByteRange(header, size) {
  if (typeof header !== 'string' || !Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const total = BigInt(size);
  let start;
  let end;
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return null;
    start = suffix >= total ? 0n : total - suffix;
    end = total - 1n;
  } else {
    start = BigInt(match[1]);
    end = match[2] ? BigInt(match[2]) : total - 1n;
    if (start >= total || end < start) return null;
    if (end >= total) end = total - 1n;
  }
  return { start: Number(start), end: Number(end) };
}

async function serveStatic(req, res, root, pathname) {
  let handle;
  try {
    const canonicalRoot = await realpath(root);
    let candidate = path.resolve(canonicalRoot, `.${pathname}`);
    if (!withinRoot(canonicalRoot, candidate)) throw new HttpError(404, 'Not found.');
    candidate = await realpath(candidate);
    if (!withinRoot(canonicalRoot, candidate)) throw new HttpError(404, 'Not found.');
    const info = await stat(candidate);
    if (info.isDirectory()) {
      candidate = await realpath(path.join(candidate, 'index.html'));
      if (!withinRoot(canonicalRoot, candidate)) throw new HttpError(404, 'Not found.');
    } else if (pathname.endsWith('/')) {
      throw new HttpError(404, 'Not found.');
    }
    handle = await open(candidate, 'r');
    const file = await handle.stat();
    if (!file.isFile()) throw new HttpError(404, 'Not found.');
    const modified = file.mtime.toUTCString();
    let range;
    // HTTP Range applies only to GET; HEAD describes the complete representation.
    if (req.method === 'GET' && req.headers.range !== undefined
        && (req.headers['if-range'] === undefined || req.headers['if-range'] === modified)) {
      range = parseByteRange(req.headers.range, file.size);
      if (!range) {
        send(req, res, 416, 'Range not satisfiable.', false, { 'Content-Range': `bytes */${file.size}`, 'Accept-Ranges': 'bytes' });
        return;
      }
    }
    res.writeHead(range ? 206 : 200, {
      'Content-Type': MIME_TYPES[path.extname(candidate).toLowerCase()] || 'application/octet-stream',
      'Content-Length': range ? range.end - range.start + 1 : file.size,
      'Accept-Ranges': 'bytes', 'Last-Modified': modified, 'Cache-Control': 'no-cache',
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${file.size}` } : {}),
    });
    if (req.method === 'HEAD' || file.size === 0) res.end();
    else await pipeline(handle.createReadStream({ autoClose: false, ...range }), res);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP', 'ENAMETOOLONG'].includes(error.code)) throw new HttpError(404, 'Not found.');
    throw error;
  } finally {
    await handle?.close();
  }
}

export function createRequestHandler({
  root = DEFAULT_STATIC_ROOT, env = process.env, fetch: fetchImpl = globalThis.fetch,
  rateLimit, now = Date.now, providerTimeoutMs = 8000, bodyTimeoutMs = 10000,
} = {}) {
  for (const value of [providerTimeoutMs, bodyTimeoutMs]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid timeout settings.');
  }
  const staticRoot = path.resolve(root);
  const config = configuredSender(env);
  const publicOrigin = env.PUBLIC_ORIGIN;
  if (publicOrigin && (!/^https?:\/\//.test(publicOrigin) || new URL(publicOrigin).origin !== publicOrigin)) {
    throw new TypeError('PUBLIC_ORIGIN must be an exact HTTP or HTTPS origin without a trailing slash.');
  }
  const limit = createRateLimiter(rateLimit, now);
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    let isApi = req.url?.split('?')[0].startsWith('/api/');
    try {
      const pathname = requestPath(req.url);
      isApi = pathname === '/api' || pathname.startsWith('/api/');
      if (pathname === '/api/enquiry') {
        if (req.method !== 'POST') return send(req, res, 405, 'Use POST for enquiries.', true, { Allow: 'POST' });
        const retryAfter = limit(req.socket.remoteAddress || 'unknown');
        if (retryAfter) return send(req, res, 429, 'Too many enquiry attempts. Please try again later.', true, { 'Retry-After': String(retryAfter) });
        if (!sameOrigin(req, publicOrigin)) throw new HttpError(403, 'Enquiries must be submitted from this website.');
        if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(req.headers['content-type'] || '')
            || (req.headers['content-encoding'] && req.headers['content-encoding'].toLowerCase() !== 'identity')) {
          throw new HttpError(415, 'Please send an uncompressed application/json enquiry.');
        }
        const data = validateEnquiry(await readJson(req, bodyTimeoutMs));
        if (!config || typeof fetchImpl !== 'function') throw new HttpError(503, UNAVAILABLE);
        await deliver(data, config, fetchImpl, providerTimeoutMs);
        return send(req, res, 200, 'Your enquiry was accepted by our email service for sending. This is not a confirmed reservation.', true);
      }
      if (isApi) return send(req, res, 404, 'Not found.', true);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Method not allowed.', false, { Allow: 'GET, HEAD' });
      await serveStatic(req, res, staticRoot, pathname);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      send(req, res, error instanceof HttpError ? error.status : 500,
        error instanceof HttpError ? error.message : 'The request could not be completed.', isApi);
    }
  };
}

export function createServer(options) {
  const server = createHttpServer({
    requestTimeout: 15000, headersTimeout: 10000, keepAliveTimeout: 5000,
    maxHeaderSize: 16 * 1024,
  }, createRequestHandler(options));
  server.maxHeadersCount = 50;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portValue = process.env.PORT ?? '8899';
  const host = process.env.HOST || '127.0.0.1';
  if (!/^\d{1,5}$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) {
    process.stderr.write('PORT must be an integer between 1 and 65535.\n');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.on('error', () => {
      process.stderr.write('Unable to start the server. Check HOST, PORT and port availability.\n');
      process.exitCode = 1;
    });
    server.listen(Number(portValue), host, () => {
      process.stdout.write(`Kaldan server listening on port ${Number(portValue)}.\n`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
  }
}
