# Elliott Structure Lab — Changelog

## v0.1.0 — 05-11-2026

### Added
- Pure JS `ElliottStructure` engine, độc lập DOM và chart renderer.
- OHLCV validation, Wilder ATR, close-confirmed ATR-normalized Directional Change pivots.
- Multi-scale pivot layers, scale persistence và parent-leg linking.
- Candidate detection: Impulse, developing Wave 5, Truncated Fifth, Zigzag, Flat subtypes, Triangle variants và generic Diagonal candidate.
- Separate hard-rule checks / guideline evidence score; unverified internal structure remains explicitly provisional.
- Fibonacci Wave 5 / Wave C projections, parallel impulse channel projection và developing-Impulse invalidation levels.
- QuantLab UI: Chart timeframe, Chart M1, synthetic DEMO, CSV import, candidate selection, chart canvas, rule audit, pivot audit, pattern coverage, JSON export.
- Dedicated CSS file scoped to Structure Lab.
- 10 deterministic Elliott engine test groups; full regression across all 21 existing QuantLab test files passes.
- Candidate de-duplication for near-identical sliding windows; explicit same-interval alternate-count matching.
- Symmetric bullish/bearish regression coverage for Impulse, Zigzag and Flat rules; OHLC object timestamp aliases and non-negative volume validation.

### Safety / research notes
- Không sửa chart series gốc, Footprint, Options, TPO, Replay hoặc Paper Trading.
- Pivot được xác nhận sau reversal; không dùng pivot chưa xác nhận để tạo candidate.
- Evidence Score không phải probability.
- Internal 3/5 grammar chưa được chứng minh bởi số swing proxy.
- Leading/Ending Diagonal được giữ ở trạng thái context-required.
- WXY/WXYXZ hiện chỉ có trong catalog/knowledge spec, chưa tự động phát hiện.
