import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';

const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const temp = join('/tmp', `worker-test-${process.pid}.mjs`);
await writeFile(temp, source);
const { default: worker } = await import(pathToFileURL(temp).href);
let lastUpstream = null;
globalThis.fetch = async (url, init) => {
  lastUpstream = { url: String(url), init };
  return new Response(JSON.stringify({ code: '000000', data: { l: [] } }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
};
const origin = 'https://sample-user.github.io';
const env = { ALLOWED_ORIGINS: '*' };

let response = await worker.fetch(new Request('https://worker.example/api/health', { headers: { Origin: origin } }), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).ok, true);
assert.equal(response.headers.get('access-control-allow-origin'), '*');

response = await worker.fetch(new Request('https://worker.example/api/binance-stock-proxy/bapi/equity/v1/public/equity/option/chain-symbols?symbol=QQQ&rootSymbol=QQQ&expirationDate=2026-12-18', { headers: { Origin: origin } }), env);
assert.equal(response.status, 200);
assert.match(lastUpstream.url, /chain-symbols\?symbol=QQQ/);
assert.equal(new URL(lastUpstream.url).hostname, 'www.binance.com');

response = await worker.fetch(new Request('https://worker.example/api/binance-stock-proxy/bapi/equity/v1/friendly/equity/option/get-option-quote', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ occSymbols: ['QQQ  261218C00600000'] })
}), env);
assert.equal(response.status, 200);
assert.equal(lastUpstream.init.method, 'POST');
assert.match(lastUpstream.init.body, /QQQ/);

response = await worker.fetch(new Request('https://worker.example/api/binance-stock-proxy/https://evil.example/', { headers: { Origin: origin } }), env);
assert.equal(response.status, 403);

response = await worker.fetch(new Request('https://worker.example/api/binance-stock-proxy/bapi/equity/v1/public/equity/option/chain-symbols?symbol=AAPL&rootSymbol=AAPL&expirationDate=2026-12-18', { headers: { Origin: origin } }), env);
assert.equal(response.status, 400);

response = await worker.fetch(new Request('https://worker.example/api/binance-stock-proxy/bapi/equity/v1/friendly/equity/option/get-option-quote', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ occSymbols: ['QQQ  261218C00600000', 'GLD  261218C00600000'] })
}), env);
assert.equal(response.status, 400);

response = await worker.fetch(new Request('https://worker.example/api/binance-stock-proxy/bapi/equity/v1/public/equity/option/chain-symbols?symbol=QQQ&rootSymbol=QQQ&expirationDate=2026-12-18', { headers: { Origin: origin } }), { ALLOWED_ORIGINS: 'https://different.example' });
assert.equal(response.status, 403);

await unlink(temp);
console.log('Cloudflare Worker tests: 7 passed');
