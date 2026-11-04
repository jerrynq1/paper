# Gexadecimal Quant Lab — Phase 2 changelog

## Added

- OLS Regression Laboratory embedded in the existing Quant Lab view.
- Simple and multiple OLS through a column-normalized Householder QR solver.
- Intercept toggle; classical covariance; optional HC1 heteroskedasticity-consistent covariance for coefficient inference.
- Coefficient estimates, standard errors, Student-t statistics/p-values, and 95% confidence intervals.
- R-squared, adjusted R-squared, SSE, RMSE, residual standard error, overall classical F-statistic and p-value.
- Durbin–Watson, Jarque–Bera, Breusch–Pagan LM, VIF, residual-vs-fitted scatter plot.
- Complete-case filtering, actionable errors for insufficient observations and singular design matrices, 250k row safety limit.
- CSV export for model, coefficient and selected diagnostic results.
- Synthetic OLS teaching dataset with known target coefficients.

## Kept isolated

No changes to Chart, cTrader connector, Options, Footprint, DOM, TPO, Replay, Paper Trading or existing indicators. New numerical code is in `js/quant-regression.js`; UI is added in `js/quant-lab.js` and `index.html`.

## Verification

- `node --check js/quant-regression.js` — passed.
- `node --check js/quant-lab.js` — passed.
- `node tests/quant-stats.test.js` — 7 groups passed.
- `node tests/quant-regression.test.js` — 10 groups passed.
- HTML parser check — all required Quant regression IDs exist; no duplicate IDs; script order is correct.
- All existing test files: 16 passed, 2 pre-existing failures (`hvn.test.js` missing `SMP` in its VM test context; `price-variation.test.js` missing `GexPriceVariationMath` in its test context). These are outside the new Quant Lab code.

## Known limitations

This is a browser-side research MVP, not a full econometrics system. The HC1 option only changes coefficient covariance/inference; the displayed overall F-test remains classical. No HAC/Newey–West, WLS/GLS, robust Wald/F test, stationarity diagnostics, time-series models, persistent storage or Python backend yet. Statistical diagnostics are approximations and do not prove causality or forecastability.
