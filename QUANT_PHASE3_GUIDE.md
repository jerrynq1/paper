# Gexadecimal Quant Lab — Phase 3 Guide

## Phạm vi đã thêm

Phase 3 adds a browser-side Time Series Laboratory to the existing Phase 1 + 2 Quant Lab. It is isolated from Chart, cTrader, Orderflow, TPO, Options, Replay and Paper Trading code.

### 1) Correlogram

- ACF using the demeaned sample autocovariance ratio with a common denominator.
- PACF calculated recursively using the Durbin–Levinson recursion.
- ACF/PACF can be calculated on level data, first differences or second differences.
- The displayed ±1.96/sqrt(N) lines are approximate white-noise reference bounds, not exact simultaneous confidence bands.

### 2) Unit-root tests

- ADF regression includes a choice of no constant/no trend, constant, or constant + trend.
- ADF lag length is selected by BIC from lag 0 through the user-specified maximum (the candidate maximum is capped by a Schwert-style sample-size rule and 20 lags). Candidate regressions use a common effective sample to make the information-criterion comparison more consistent.
- Phillips–Perron uses a Dickey–Fuller regression and a Newey–West Bartlett long-run variance estimate. The UI displays Z-tau and notes Z-rho as a supplementary statistic.
- The interface shows asymptotic reference critical values for the selected deterministic specification. It intentionally does not fabricate MacKinnon p-values or finite-sample interpolated critical values.
- H0 for both tests is a unit root. A statistic more negative than the selected critical value is evidence to reject H0.

### 3) Differencing

- First and second differences are available for correlogram inspection.
- ARIMA model order d supports 0, 1 or 2 differences; forecasts are integrated back to the original level.

### 4) AR / MA / ARMA / ARIMA estimation

- AR-only is estimated by OLS.
- MA and ARMA use Conditional Sum of Squares (CSS) with a Nelder–Mead optimizer.
- AIC and BIC are reported using a common five-observation burn-in sample across the supported p/q orders, so order-to-order comparisons use the same effective sample.
- Forecast horizon is configurable from 1 to 100 steps.
- The displayed forecast interval is a simple approximate band based on residual standard deviation and sqrt(h). It is not a full ARIMA forecast interval and excludes parameter uncertainty and conditional heteroskedasticity.
- The engine does not constrain AR roots to stationarity or MA roots to invertibility. It does not automatically select p, d, q or certify a model as adequate.

## Important data requirements

1. A time-series column must be numeric and have no missing/non-finite values. The engine refuses to silently drop missing observations because this would change lag adjacency.
2. Observations should be ordered and regularly spaced. The UI reports timestamp spacing, duplicate timestamps and large gaps when a time column is recognized; it does not automatically resample missing bars.
3. Trading data often contains overnight/session gaps. Select a consistent sampling interval or explicitly document the session convention before interpreting lag-based statistics.
4. ACF/PACF can be misleading for trending/nonstationary levels. Inspect the level series and first differences, then use unit-root tests with a suitable deterministic specification.
5. Results from CFD tick-volume or quote-derived feeds remain broker-specific proxies, not centralized Futures traded volume.

## How to use

1. Extract the ZIP and open `paper-main` in VS Code.
2. Start the site using the VS Code Live Server extension (no Python package or statistical package is required for this browser-only MVP).
3. Open Quant Lab in the application sidebar.
4. Click **Time Series DEMO** in Data Center. It loads 900 deterministic synthetic daily observations: `XAU_Close_SIM`, `Stationary_AR1`, and `RandomWalk`. These are synthetic data, not market prices.
5. Select `Stationary_AR1` or `RandomWalk` in **SERIES VARIABLE**.
6. Use **Update ACF/PACF**. Set difference to 0 to inspect levels, then 1 to inspect first differences.
7. In **Stationarity Tests**, choose deterministic terms, set the ADF maximum lag, and click **Run ADF + PP**.
8. In **Model Estimation**, select AR, MA, ARMA or ARIMA, set p/d/q and forecast horizon, then click **Estimate Model**.
9. To test actual data, import a CSV with a timestamp column (for example `Time`) and one or more numeric series columns. Avoid blanks in the selected series and verify that timestamps have a consistent interval.

## Suggested first experiments

- `Stationary_AR1`: ACF should decay; PACF should be strongest at lag 1; ADF/PP should generally provide evidence against a unit root in this seeded demonstration.
- `RandomWalk`: ACF of levels tends to decay slowly; differencing should make the series more stable; unit-root tests should generally be less likely to reject H0. In the current deterministic demo, the constant-specification ADF is about -2.76 and PP Z-tau about -2.74; both are above the 5% reference value -2.86, so the UI should say “Chưa bác bỏ H₀ @ 5%”.
- `Stationary_AR1`: in the current deterministic demo, ADF is about -12.12 and PP Z-tau about -12.30; both are far below the 1% reference value -3.43, so the UI should say “Bác bỏ H₀ @ 5%”.
- `XAU_Close_SIM`: it is a synthetic geometric random walk; do not interpret it as actual XAUUSD data.
- Fit AR(1) to `Stationary_AR1`, then compare it with ARMA(1,1) using AIC/BIC. Do not pick a model based only on the lowest in-sample criterion; reserve out-of-sample data for validation.

## Known limitations

- All calculations run synchronously in the browser; no Python backend, database, persistence, model service or background worker has been added.
- The CSS/browser implementation was syntax-checked and calculation engines were tested with Node.js unit tests. A full end-to-end browser interaction pass was not available in this build environment.
- Unit-root critical values are asymptotic reference values, not finite-sample response-surface values. Use a validated econometrics package for publication-grade inference.
- CSS/Nelder–Mead MA/ARMA estimation is an educational MVP implementation. Cross-check important research results against a mature package such as statsmodels, R `forecast`/`tseries`, or Stata before using them for decisions.

## Method reference used for PP implementation

The PP implementation follows the classical Dickey–Fuller regression with Newey–West Bartlett long-run variance correction and the Z-tau/Z-rho statistics. See the [Stata Phillips–Perron methods and formulas manual](https://www.stata.com/manuals/tspperron.pdf). This app displays asymptotic reference critical values and deliberately omits MacKinnon p-values.
