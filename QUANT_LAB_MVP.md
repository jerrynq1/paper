# Quant Lab MVP — Phase 1

This iteration adds an isolated **Quant Lab** view to the existing browser application.

## Included

- CSV import (comma, semicolon, or tab separator; quoted cells; decimal comma in semicolon/tab files).
- Import the currently loaded cTrader M1 bars from the Chart (`Time, Open, High, Low, Close, TickVolume`). During Replay, the currently exposed `m1` history is used, so bars hidden by Replay are not imported.
- Synthetic DEMO dataset for learning and UI checks. It is not a market feed and must not be used as trading evidence.
- Numeric-column discovery and simple time-column detection/sorting.
- Descriptive statistics: count, mean, median, sample variance, sample standard deviation, min, quartiles, max, skewness, excess kurtosis, and missing count.
- Simple and log returns for the selected variable.
- Pearson correlation matrix (up to the first eight numeric columns selected by the user).
- Histogram, series plot, and 12-row data preview.
- Pure statistical functions are separated into `js/quant-stats.js` and tested in `tests/quant-stats.test.js`.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/#quant`, then use **Import CSV**, **Lấy M1 từ Chart**, or **Dữ liệu DEMO**.

## Data format

CSV needs a header row. For market data, preferred fields are `Time, Open, High, Low, Close, Volume` (or `TickVolume`). Timestamp strings should be ISO-8601 or otherwise parseable by the browser's `Date.parse`.

## Important limitations

- All calculations in this MVP run in the browser. Data is not uploaded to a backend and is not persisted after closing/reloading the page.
- This is an exploratory/statistics MVP, not a verified investment signal or a full econometrics package.
- Missing values are excluded from each statistic; correlation uses pairwise valid observations.
- Skewness and excess kurtosis use population standardized central moments; sample variance/std-dev use `n - 1`.
- Log returns are computed only when adjacent prices are positive.
- Timestamp sorting is performed only when at least 60% of rows have parseable timestamps.
- cTrader volume in this app is a broker-provided tick/quote measure, not centralized exchange-traded Futures contract volume.
- Not yet included: regression/OLS, statistical hypothesis tests, robust standard errors, ADF/PP/KPSS, ARIMA, VAR/VECM, ARCH/GARCH, walk-forward validation, multi-asset data storage, Python API, and Knowledge Map OCR of the textbook.
