# ETF Options Liquidity Map — QQQ / GLD → NAS100 / XAUUSD

## Native indicator

The Cross-Asset map is now a native indicator named **ETF Options Liquidity Map** in **Indicator Store → Orderflow**. Add it to the active chart, then use its eye button in the chart legend to show/hide it. Use the gear button to open settings. Removing the indicator stops its source session; re-adding it restores the last saved settings.

Supported source/target pairs:

- **QQQ Options → NAS100**
- **GLD Options → XAUUSD**

Indicator settings include source ETF, heatmap metric (Net GEX / OI / Volume), heatmap visibility and opacity, volume bubbles and bubble count, Call/Put OI Walls, Gamma Flip, provider Vol Trigger, Max Pain, number of ranked GEX levels (0–10), and source-status tag.

The toolbar's **Cross-Asset Map** button opens a small status/help panel. It is not a second overlay switch. Use the indicator eye to turn the chart layer on or off.

## QQQ / GLD Option Chain loading

Both QQQ Options and GLD Options have a **Hiển thị Strike** selector with 5, 10, 15, 20, 30, 50, 100, or All. The selected number controls how many strikes are rendered in the Option Chain table, centered around the live ETF underlying price (ATM). The selection is remembered independently for QQQ and GLD.

For faster first paint, the app requests the selected ATM strikes first, renders them, then hydrates the remaining contracts in the background. Full-expiry OI/GEX/Max Pain calculations become available only after that background load completes. The quote cache remains separate from the table display limit, so selecting 5 rows does not discard the rest of the loaded chain. A periodic refresh updates the whole expiry in the background while keeping the most recent complete data visible.

## Key levels and calculations

- **GEX 1–10:** strikes ranked by descending absolute net gamma exposure, not by ascending strike. The indicator setting chooses how many of the ten are drawn. QQQ and GLD Option pages show the ranked levels in their Key Levels panel.
- **Gamma Flip:** current implementation reports the crossing in the cumulative Call-positive / Put-negative GEX-by-strike profile. It is an estimate, not a dealer-inventory observation.
- **Max Pain:** minimizes the OI-weighted intrinsic payout across listed strikes. It is shown only after the full expiry has loaded and every contract has usable OI and multiplier; otherwise it stays unavailable rather than treating missing OI or multiplier as zero/one.
- **Vol Trigger:** shown only when the source quote payload includes a distinct provider field (`vt`, `volTrigger`, or `volatilityTrigger`). Binance Stock Options quote responses do not consistently expose this field; in that case the app says it is not supplied and draws no Vol Trigger line. Gamma Flip is not substituted for Vol Trigger.
- **Call / Put OI Walls:** highest Call OI and Put OI strikes for the chosen expiry.
- **Volume bubbles:** per-strike option contract volume, split into Call and Put bubbles. This is not time-and-sales data.

## Price mapping

Each ETF strike is mapped using the live ETF underlying and live target-chart price:

`mapped target price = target chart spot × (ETF option strike / ETF underlying spot)`

For example, if QQQ is 600 and NAS100 is 25,000, a QQQ strike of 630 maps to 26,250. If GLD is 400 and XAUUSD is 4,000, a GLD strike of 420 maps to 4,200.

This is a synchronized **relative-price anchor**, not a fixed contract multiplier. It preserves the percentage distance of an ETF strike from its underlying. It does not estimate a statistically fitted hedge ratio, futures fair value, or a time-varying beta. If either live price anchor is missing, the overlay does not draw synthetic levels.

## Important limitations

This is an **ETF-options proxy indicator**, not native NAS100 futures / CFD or XAUUSD spot order flow:

- QQQ and GLD options are options on ETFs, not on NAS100 futures or spot gold. Their strikes can be projected into target price space, but the exposure is not interchangeable with target-market positioning.
- OI does not reveal whether the open contracts are customer/dealer long or short. Call-positive / Put-negative GEX is a convention, not observed dealer inventory.
- The map is expiry-specific. It does not combine the full expiration surface.
- Binance stock-option quote availability, delay, OI coverage and multiplier/Greek completeness can vary. Missing OI is not fabricated as zero exposure; independently available volume can still be shown.
- The initial ATM subset is rendered first, but the remaining contracts are still needed for complete expiry analytics. The display selector controls table rows, not the analytical universe.
- The existing Binance ETF Kline module is live-stream only; this feature does not backfill historical ETF candles or create historical option-volume footprints.
- The target spot anchor comes from cTrader. A broker symbol mismatch or disconnected target feed prevents mapping.

Use these levels as contextual cross-market reference zones, not as a native liquidity heatmap or standalone entry signal.

## Main files changed for this feature

- `index.html` — status/help panel and script/style references.
- `css/cross-asset-map.css` — panel/level styling.
- `js/indicators-custom.js` — native Orderflow indicator definition and settings.
- `js/indicators-engine.js` — synchronizes its lifecycle when the indicator is added, hidden, shown, configured, or removed.
- `js/cross-asset-map.js` — strike mapping, data lifecycle and canvas rendering for the native indicator.
- `js/stock-options.js` — QQQ/GLD chain strike selector, progressive chain hydration, level calculations, snapshots and live refresh.
- `tests/cross-asset-map.test.js` — price mapping and GEX ranking tests.
- `tests/stock-options-data.test.js` — quote parsing, OI/volume separation, Vol Trigger, GEX ranking and Max Pain validation.
