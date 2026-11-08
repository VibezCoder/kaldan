// Quick reachability probe using Node's own TLS stack (not Windows schannel).
const URLS = [
  'https://www.kaldanhotels.com/',
  'https://www.kaldanhotels.com/accommodations',
];

for (const url of URLS) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const body = await res.text();
    console.log(`OK   ${res.status} ${url}`);
    console.log(`     final=${res.url}`);
    console.log(`     bytes=${body.length} ms=${Date.now() - t0}`);
    console.log(`     server=${res.headers.get('server')} type=${res.headers.get('content-type')}`);
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    console.log(`     title=${title ? title[1].trim().slice(0, 120) : '(none)'}`);
  } catch (err) {
    console.log(`FAIL ${url}`);
    console.log(`     ${err.name}: ${err.message}`);
    if (err.cause) console.log(`     cause: ${err.cause.code || ''} ${err.cause.message || err.cause}`);
  }
}
