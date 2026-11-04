# Phase 3 Changelog — Time Series Laboratory

## Added
- `js/quant-timeseries.js`: ACF, PACF (Durbin–Levinson), first/second differencing, ADF unit-root test, Phillips–Perron Z-tau/Z-rho with Newey–West Bartlett variance, and AR/MA/ARMA/ARIMA CSS estimation/forecasting.
- `tests/quant-timeseries.test.js`: deterministic synthetic tests for differencing, ACF/PACF, ADF, PP, AR, MA, ARMA and ARIMA.
- Quant Lab UI for correlograms, unit-root tests, model settings, parameter estimates, AIC/BIC and forecasts. A common burn-in is used for candidate AR/MA/ARMA orders.
- A `Time Series DEMO` dataset containing a simulated price-like random walk, stationary AR(1) series and random walk.
- `QUANT_PHASE3_GUIDE.md` with usage steps, assumptions and limitations.

## Existing modules
- Phase 1 Statistical Data Explorer and Phase 2 Regression Laboratory remain included.
- No intentional changes to Chart, cTrader, Options, Orderflow, TPO, Replay or Paper Trading behavior.

## Verification
- JavaScript syntax checks passed for `quant-lab.js` and `quant-timeseries.js`.
- Quant Time Series unit tests: 11 groups passed.
- Phase 1 Quant Stats tests: 7 groups passed.
- Phase 2 Quant Regression tests: 10 groups passed.
- Full existing Node test sweep: 2 pre-existing test files still fail in this environment (`hvn.test.js` missing `SMP` in test context and `price-variation.test.js` missing `GexPriceVariationMath` in test context); these failures are unrelated to Phase 3.
- Full interactive browser automation was not completed in this environment.
