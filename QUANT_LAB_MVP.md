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

No Python package or Python statistical runtime is required for Phase 1 or Phase 2; both are browser-side JavaScript. Serve the folder with the VS Code **Live Server** extension and open `index.html`, then navigate to **Quant Lab**. Alternatively, use any static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/#quant`, then use **Import CSV**, **Lấy M1 từ Chart**, **Dữ liệu DEMO**, or **Nạp OLS DEMO**.

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
- Phase 1 by itself did not include OLS. Regression/OLS and selected hypothesis tests were added in Phase 2 below. Still not included: ADF/PP/KPSS, ARIMA, VAR/VECM, ARCH/GARCH, walk-forward validation, multi-asset data storage, Python API, and Knowledge Map OCR of the textbook.


## Phase 2 — Regression Laboratory

Added to the Quant Lab view without changing Chart, Orderflow, TPO, Options, Replay, or Paper Trading modules.

### Included

- Simple and multiple linear regression estimated with OLS. The numerical core uses Householder QR decomposition rather than directly solving the normal equations.
- Intercept on/off. The default is an intercept. For no-intercept models, R-squared and adjusted R-squared use the uncentered convention; interpret them separately from the usual centered R-squared.
- Coefficient estimates, classical standard errors, t-statistics, two-sided Student-t p-values, and 95% confidence intervals.
- Optional HC1 heteroskedasticity-consistent covariance for coefficient standard errors and coefficient-level inference. The overall F-statistic and its p-value remain the classical OLS test even when HC1 is selected.
- Model summary: N, degrees of freedom, R-squared, adjusted R-squared, SSE, RMSE, residual standard error, F-statistic and its p-value.
- Diagnostics: Durbin–Watson statistic, Jarque–Bera normality diagnostic, Breusch–Pagan LM diagnostic, and VIF for each explanatory variable.
- Residuals-versus-fitted scatter plot, coefficient/model CSV export, listwise deletion for observations missing Y or any selected X.
- A 250,000-row safety limit for an in-browser estimation. Perfect multicollinearity / rank-deficient model matrices are rejected with an actionable message.

### How to use

1. Open Quant Lab and load a dataset using CSV, cTrader M1, the general DEMO dataset, or `Nạp OLS DEMO` (a synthetic teaching sample with target coefficients Intercept=0.25, X1=1.8 and X2=-0.7).
2. In Regression Laboratory, choose the dependent variable Y.
3. Select one or more explanatory variables X. Y is excluded from the X selector.
4. Keep `Include intercept` checked unless you have a justified model specification without a constant.
5. Optionally enable `HC1 robust standard errors`. This changes coefficient standard errors, t-statistics, p-values and confidence intervals; it does not change OLS coefficients or the displayed classical overall F-test.
6. Click `Estimate OLS`. Review coefficient table, model summary and residual diagnostics.
7. Click `Export results CSV` to download the model summary and coefficient results.

### Important interpretation limits

- OLS estimates association under the selected specification; it does not establish causality.
- Regressing a candle Close on Open/High/Low from that same candle is descriptive, not a valid real-time forecast: High/Low are only known after the candle forms. For predictive research, construct lagged features and use time-ordered out-of-sample / walk-forward validation.
- Classical standard errors rely on the relevant OLS assumptions. HC1 addresses heteroskedasticity-consistent covariance estimation but does not fix endogeneity, autocorrelation, omitted variables, poor specification, non-stationarity, or look-ahead bias. HC1 is not HAC/Newey–West.
- Breusch–Pagan and Jarque–Bera p-values use asymptotic approximations. Durbin–Watson is a diagnostic indicator, not a complete serial-correlation analysis. VIF thresholds such as 5 or 10 are heuristic, not hard statistical laws.
- Rows missing any selected Y/X field are excluded as complete cases. This can reduce N and can induce selection bias if missingness is not benign.
- The in-browser implementation is a research MVP, not a validated substitute for a full econometrics package. Cross-check important work against a trusted statistical package and known datasets.
- Not yet included: GLS/WLS, clustered or HAC/Newey–West standard errors, robust overall F/Wald test, functional-form specification tests, ADF/PP/KPSS, ARIMA, VAR/VECM, ARCH/GARCH, panel methods, and persistent data storage.

### Files and tests

- `js/quant-regression.js`: pure OLS, QR solver, Student-t/F probabilities, classical/HC1 covariance, VIF and residual diagnostics.
- `js/quant-lab.js`: UI, variable selection, results rendering, residual plot, CSV export.
- `tests/quant-regression.test.js`: regression-specific tests.

Run tests from the project directory:

```bash
node tests/quant-stats.test.js
node tests/quant-regression.test.js
```

---

## Phase 3 — Time Series Laboratory

Phase 3 adds ACF/PACF, ADF and Phillips–Perron tests, first/second differencing and AR/MA/ARMA/ARIMA CSS estimates. See `QUANT_PHASE3_GUIDE.md` for the full assumptions, limitations and user instructions. This remains a browser-only MVP; its asymptotic unit-root critical values and CSS model estimation should be cross-checked with mature econometrics software before research or trading decisions.
