# Quant Lab Phase 4 — ARCH/GARCH Family

**Ngày:** 05-11-2026  
**Base:** Research Extensions 1.1 (`Gexadecimal_QuantLab_Research_Extensions_1.1_2026-11-05.zip`)

## Added

- New browser-side engine `js/quant-volatility.js` (no DOM dependency).
- Log-return generation from selected positive price series: `100 * ln(P_t/P_(t-1))`.
- ARCH(q), q=1..5; GARCH(1,1); EGARCH(1,1); GJR-GARCH(1,1); TARCH(1,1) according to Zakoian.
- Gaussian conditional likelihood / QMLE and standardized Student-t likelihood (nu in (2.05, 200]).
- Nelder–Mead estimation with transformed parameters to enforce positivity and persistence constraints where applicable.
- Conditional variance/volatility path, persistence proxy, half-life, model-specific long-run volatility/median proxy, multi-step volatility forecast and user-controlled annualization factor (also applied to forecast rows).
- Diagnostics: Ljung–Box on standardized residuals and ARCH LM on squared standardized residuals.
- UI tables, in-sample conditional volatility chart, forecast table, research interpretation and CSV export.
- Vietnamese guide `QUANTLAB_PHASE4_ARCH_GARCH_GUIDE_VI.md`.

## Model naming note

GJR-GARCH threshold term is in the variance equation. TARCH (Zakoian) implemented separately using the conditional standard deviation equation. Some software packages use the word TGARCH differently; these two equations are not collapsed into one label.

## Not changed

Chart, cTrader, Footprint, Options, TPO, Replay and Paper Trading modules were not intentionally modified. No backend/database/Python service was added.

## Known limitations

- Constant mean only; no ARMA-GARCH joint estimation.
- No Hessian-based standard errors or parameter confidence intervals.
- EGARCH multi-step forecasts use a plug-in expected-log-variance approximation; `exp(E[log h])` is labeled as a median/plug-in proxy, not exact unconditional variance. TARCH multi-step forecasts use an expected-sigma plug-in, not exact expected variance.
- Annualization factor must match the user's real sampling and session calendar.
- Timestamp gaps/session breaks are not automatically resampled.
- One seeded synthetic GARCH(1,1) Gaussian fit was independently cross-checked against SciPy/SLSQP; coefficient max absolute difference ≈ 1.2e-5 and average negative log-likelihood difference ≈ 2.7e-10. This is not a full validation of all models/distributions.
- Requires independent cross-check against a specialist ARCH implementation (e.g. Python `arch` / R `rugarch`) and walk-forward validation on real data before trading use.

## Test summary

- 20/20 files in `tests/*.test.js` passed.
- 12 Phase 4-specific test groups passed.
- All 40 JavaScript files in `js/` passed `node --check`.
- 203 HTML IDs with no duplicates; all 92 static `$q(...)` references resolve; Phase 4 engine loads before the Quant Lab UI.
- Browser end-to-end on hosting is still a manual smoke-test step.
