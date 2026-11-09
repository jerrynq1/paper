# QQQ / GLD Binance Stock Options — GitHub Pages + Cloudflare Workers

This build keeps the website static on **GitHub Pages**. It first tries Binance `chain-symbols` directly from the browser (the supplied HAR shows wildcard CORS for this public GET). Cloudflare Worker remains the quote POST bridge because Binance restricts that endpoint CORS origin to `www.binance.com`.

## What is included

- Existing XAUUSDT Options workspace is kept.
- Independent QQQ Options and GLD Options workspaces remain in the sidebar.
- Expiry/OCC discovery (`chain-symbols`) is fetched directly from Binance in the browser.
- Option quote POST (`get-option-quote`) still passes through Cloudflare Worker.
- OI, IV, Bid/Ask, Volume, multiplier and Greeks are read from Binance responses. Missing `oi: null` remains missing and is not converted to zero.
- Underlying prices and live candles use Binance Equity WebSocket directly from the browser; no Worker WebSocket proxy is needed.
- Worker only allows the QQQ/GLD public options page, chain/config endpoints and quote endpoint. It cannot proxy arbitrary URLs.

## Part A — Deploy the Cloudflare Worker (one-time setup)

### Option 1: Cloudflare Dashboard (no terminal required)

1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Open **Workers & Pages**.
3. Select **Create application** → **Create Worker**.
4. Name it `paper-binance-stock-proxy` (or another name) and deploy the starter Worker.
5. Open the new Worker and select **Edit Code**.
6. Replace the editor contents with the complete contents of `worker/index.js` from this ZIP, then **Save and Deploy**.
7. Open **Settings** → **Variables and Secrets** (or the equivalent settings section for your Worker). Add a plain-text variable:
   - Name: `ALLOWED_ORIGINS`
   - Value: `*`

   `*` allows any website to call this read-only, QQQ/GLD-only proxy. For tighter access, replace it with your GitHub Pages origin, for example `https://YOUR-USERNAME.github.io` (do not append the repository path). The Worker checks the browser origin when this variable is restricted.
8. Open your Worker URL. It will look like:
   `https://paper-binance-stock-proxy.YOUR-SUBDOMAIN.workers.dev`
9. Verify the health endpoint by opening:
   `https://paper-binance-stock-proxy.YOUR-SUBDOMAIN.workers.dev/api/health`

   It should return JSON containing `"ok":true`.

Cloudflare's current Dashboard flow is documented at https://developers.cloudflare.com/workers/get-started/dashboard/.

### Option 2: Deploy with Wrangler CLI

From the folder containing `wrangler.toml`:

```bash
npx wrangler deploy
```

Then set the `ALLOWED_ORIGINS` variable in the Cloudflare Dashboard as described above, or put the intended value in `wrangler.toml` before deployment and deploy again. The `wrangler.toml` in this ZIP uses `*` by default so the first deployment works without needing to know your GitHub Pages username/repository.

## Part B — Connect GitHub Pages to the Worker

1. In the project, open `js/stock-options-config.js`.
2. Replace the empty string with your deployed Worker origin. Example:

   ```js
   window.BINANCE_STOCK_PROXY = 'https://paper-binance-stock-proxy.YOUR-SUBDOMAIN.workers.dev';
   ```

   Use only the base URL. Do not add `/api/health` or `/api/binance-stock-proxy`.
3. Commit and push the project files to the GitHub repository used by GitHub Pages.
4. Wait for GitHub Pages to publish, then reload the website (hard refresh if the old JS is cached).
5. Open **QQQ Options** or **GLD Options**. The expiry list should load directly from Binance; the quote table is then requested through the Worker.

## Quick troubleshooting

- **`/api/health` does not return `ok:true`:** check that the Worker is deployed and that you copied its exact `workers.dev` URL.
- **Browser reports CORS / Origin not allowed:** set `ALLOWED_ORIGINS` to `*` temporarily, or set it to the exact GitHub Pages origin, such as `https://YOUR-USERNAME.github.io`.
- **Worker HTTP 403 with JSON body:** the requested path/symbol is not in the Worker allow-list, or the origin is not allowed.
- **Expiry list loads but quote POST fails with upstream 403:** direct browser access to `chain-symbols` is working, but Binance blocks the Worker quote request. The next fallback is the local Node.js proxy (provided in the next fallback build). Do not copy cookies, `fvideo-token`, or other session tokens from the HAR into source code.
- **Expiry list fails with browser CORS:** Binance has changed its CORS behavior or your region/network blocks direct access; use the Node.js proxy fallback.
- **Binance upstream error / HTTP 4xx:** Binance may have changed or regionally restricted its endpoint, or the endpoint may require an entitlement. The Worker does not bypass Binance account/data entitlements.
- **QQQ/GLD chart has no old candles:** Binance's public stream provides live Kline updates; this integration does not fabricate historical candles. The chart begins filling when live candle updates arrive.
- **Some OI cells are blank:** Binance can return a null OI for individual contracts; those rows are excluded from OI exposure calculations rather than treated as zero.

## Security and limitations

- No Binance API key, cookies, Authorization header, session token or user login is stored or forwarded.
- This is a public-data relay, not a trading API and not a private account proxy.
- The Worker exposes only a fixed allow-list for QQQ and GLD; it rejects arbitrary URL paths, unsupported symbols, mixed-symbol quote batches and quote batches larger than 100 contracts.
- `ALLOWED_ORIGINS = "*"` means the public endpoint can be called by other websites too, but only for the allow-listed public data. Restrict it to your GitHub Pages origin when possible.
- Binance may delay Stock Options quotes depending on market-data entitlement; deploying a Worker does not remove a Binance-imposed delay.
- The Worker does not create historical candles, option flow prints, Vanna or Charm if Binance's source response does not provide them.
- Cloudflare manages the Worker runtime. You do not run `node server.js` and do not need a VPS.

## Data methodology

- Contract list: `GET /bapi/equity/v1/public/equity/option/chain-symbols`.
- Option quote: `POST /bapi/equity/v1/friendly/equity/option/get-option-quote`.
- Stock last price: Binance Equity WebSocket `EQ_QQQ@symbol_price` / `EQ_GLD@symbol_price`.
- Candles: Binance Equity WebSocket `SYMBOL@kline_INTERVAL` (5m, 1h, 1d, 1w, 1M).
- GEX per 1% move: `Gamma × OI × multiplier × Spot² × 0.01` (Call positive, Put negative).
- DEX notional: `Delta × OI × multiplier × Spot`.
- VGEX/THEX: `Vega/Theta × OI × multiplier`.
- Missing OI or multiplier is excluded from affected exposure calculations and reported in coverage/status.
