# Worker 403 troubleshooting patch

This revision does not change the Cloudflare script filename requirement. If you use the Dashboard editor's default `worker.js`, paste the contents of `worker/index.js` into it and Save/Deploy.

The earlier Worker forwarded only a minimal set of headers. The supplied Binance HAR shows successful browser requests also carried `Accept-Language`, a browser `User-Agent`, `bnc-uuid`, `bnc-time-zone`, `x-trace-id`, and `x-ui-request-trace`. This revision adds those ordinary request headers, generating fresh UUID/trace IDs per upstream call. It intentionally does not store or replay cookies, `fvideo-token`, `device-info`, or other session/anti-fraud values from the HAR.

If Binance still responds 403, the updated Worker converts the upstream HTML error into JSON with `upstreamStatus`, `upstreamContentType`, `detail`, and `hint`. In that case the Worker route and GitHub Pages CORS have already passed; Binance is rejecting the Worker-originated upstream request. Changing `worker.js` to `index.js` will not solve that restriction. Do not copy session or anti-bot tokens from HAR into source code.
