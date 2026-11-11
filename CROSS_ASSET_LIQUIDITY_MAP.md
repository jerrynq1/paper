# Cross-Asset Liquidity Map — QQQ / GLD → NAS100 / XAUUSD

## What this adds

The chart toolbar now includes **Cross-Asset Map**. It projects Binance Stock Options data for:

- **QQQ Options → NAS100**
- **GLD Options → XAUUSD**

The overlay is drawn on the existing cTrader chart, using the selected chart's price scale.

## How to use

1. Configure and deploy the Binance Stock Options Cloudflare Worker as described in `BINANCE_STOCK_OPTIONS.md`.
2. Connect cTrader and open a chart for **NAS100** or **XAUUSD**. The broker must expose that symbol under a recognised name.
3. Click **Cross-Asset Map** in the chart toolbar.
4. Choose QQQ or GLD, select an expiry, choose OI or GEX for the heatmap, then click **Bật overlay**.
5. If the chart is on the other instrument, click **Mở chart ...** to switch the chart to the matching target.
6. Toggle heatmap, walls/Gamma Flip, and volume bubbles independently. Adjust opacity as needed.

The chosen source, metric, layer toggles and opacity are stored in browser local storage. The overlay itself starts disabled after reload.

## Price mapping

Each ETF strike is mapped using the live underlying and live target-chart price:

`mapped target price = target chart spot × (ETF option strike / ETF underlying spot)`

For example, if QQQ is 600 and NAS100 is 25,000, a QQQ strike of 630 maps to 26,250. If GLD is 400 and XAUUSD is 4,000, a GLD strike of 420 maps to 4,200.

This is a synchronized **relative-price anchor**, not a fixed contract multiplier. It preserves the percentage distance of an ETF strike from its underlying. It does not estimate a statistically fitted hedge ratio, futures fair value, or a time-varying beta. If either live price anchor is missing, the overlay does not draw synthetic levels.

## What each layer means

- **Heatmap — OI:** option open interest aggregated by strike. Color indicates Call/Put OI balance; brighter/longer bands indicate more OI relative to the selected expiry's largest strike.
- **Heatmap — GEX:** estimated gamma exposure from the supplied option Greeks, OI and contract multiplier. The app uses its existing Call-positive / Put-negative convention.
- **OI Walls:** the highest Call OI strike and highest Put OI strike for the selected expiry, mapped to the target chart.
- **Gamma Flip:** the strike where the cumulative signed GEX estimate crosses zero, if such a crossing can be calculated from the available quotes.
- **Volume bubbles:** Binance option-contract volume at each strike, split into Call and Put lanes. Bubble size is relative to the largest displayed volume in that expiry.

The volume field is a contract/strike aggregate, not a time-and-sales feed. Bubbles are placed in Call/Put lanes rather than at historical execution timestamps.

## Important limitations

This is an **ETF-options proxy overlay**, not native NAS100 futures / CFD or XAUUSD spot order flow:

- QQQ and GLD options are options on ETFs, not on NAS100 futures or spot gold. Their strikes can be projected into target price space, but the exposure is not interchangeable with target-market positioning.
- OI does not reveal whether the open contracts are customer/dealer long or short. Call-positive / Put-negative GEX is a convention, not observed dealer inventory.
- The map is expiry-specific. It does not combine the full expiration surface.
- Binance stock-option quote availability, delay, OI coverage and multiplier/Greek completeness can vary. The panel reports OI coverage; missing OI is not fabricated as zero exposure, while independently available volume can still be shown.
- The existing Binance ETF Kline module is live-stream only; this feature does not backfill historical ETF candles or create historical option-volume footprints.
- The target spot anchor comes from cTrader. A broker symbol mismatch or disconnected target feed prevents mapping.

Use these levels as contextual cross-market reference zones, not as a native liquidity heatmap or standalone entry signal.

## Files changed

- `index.html` — toolbar control and Cross-Asset Map panel; stylesheet/script includes.
- `css/cross-asset-map.css` — panel styles.
- `js/cross-asset-map.js` — strike mapping, data lifecycle, controls and chart drawing.
- `js/stock-options.js` — cross-asset data API, source-stream lifecycle and separate OI/volume aggregation when OI is missing.
- `js/drawings-interact.js` — overlay draw hook and render invalidation signature.
- `tests/cross-asset-map.test.js` — price mapping tests.
- `tests/stock-options-data.test.js` — missing-OI/volume aggregation regression test.
