# Gexadecimal Quant Lab — Research Extensions 1.1

**Ngày:** 05-11-2026  
**Base source:** `gexadecimal-quant-lab-audited-phase1-3.zip` (bản Phase 1–3 đã audit hôm 04-11-2026)

## Thay đổi chính

### Priority 1 — Audit & Fix

- Sửa Ljung–Box từ hệ số sai `m(m+2)` thành công thức chuẩn `n(n+2)`.
- Với residual ARMA/ARIMA, bậc tự do được hiệu chỉnh `m - p - q`.
- Giới hạn số lag Ljung–Box theo số autocorrelation thực sự tính được đối với chuỗi ngắn.
- Data Quality Check: timezone mơ hồ, timestamp invalid, duplicate, đảo thứ tự trong file gốc, số dòng đã được sắp xếp, khoảng trống lớn và timestamp cuối ở tương lai so với đồng hồ trình duyệt.
- Chỉ tự sắp xếp khi tất cả timestamp hợp lệ; không xóa dòng lỗi hoặc tạo dữ liệu giả.
- Bổ sung cảnh báo rằng gap có thể là session break hoặc missing bar; không tự resample.
- Ghi rõ giới hạn xác minh ADF, PP, AR-only và MA/ARMA trong giao diện/tài liệu.

### Priority 2 — Research Foundation

- Return Distribution trên Log Return: mean, standard deviation, skewness, excess kurtosis, Jarque–Bera và quantiles 1/5/50/95/99%.
- Rolling Statistics nhiều cửa sổ (1–4 cửa sổ, ví dụ `20,50,100`).
- Realized Variance/Volatility (RV), Bipower Variation/Volatility (BV) và Jump Variation ước lượng `max(RV-BV,0)`.
- ACF và Ljung–Box cho returns, absolute returns và squared returns.
- Lagged Return Regression: Y là log return hiện tại, X được biến đổi thành log change/first difference và shift lùi theo số bar, có HC1 robust standard errors.
- Expanding-window one-step walk-forward trên các checkpoint rải đều, so sánh với Naive Random Walk baseline.

### Research Interpretation

- Thêm khối hướng dẫn 6 câu hỏi nghiên cứu ngay trong giao diện Quant Lab.
- Thêm tài liệu `QUANTLAB_RESEARCH_EXTENSION_GUIDE_VI.md` với công thức, cách đọc, ví dụ, giả định và giới hạn.
- Cập nhật `QUANTLAB_USER_GUIDE_VI.md`, `QUANTLAB_AUDIT_REPORT.md` và README.

## Phạm vi không thay đổi

Không viết lại Chart, cTrader, Footprint, Options, TPO, Replay hoặc Paper Trading. Không thêm backend, Python service, database hoặc user authentication.

## Phase 4 — ARCH/GARCH Volatility Laboratory (05-11-2026)

- Thêm engine browser-side cho ARCH(q=1..5), GARCH(1,1), EGARCH(1,1), GJR-GARCH(1,1) và TARCH(1,1) theo Zakoian.
- Thêm Gaussian conditional likelihood/QMLE và standardized Student-t likelihood (ν trong miền 2.05–200).
- Thêm conditional volatility series, persistence, half-life, long-run volatility theo đặc tả, volatility forecast và annualization factor do người dùng chọn.
- Thêm Ljung–Box trên standardized residual và ARCH LM trên bình phương standardized residual.
- Thêm giải thích trong giao diện về từng mô hình, leverage/asymmetry, persistence, half-life và giới hạn forecast.
- Thêm tài liệu `QUANTLAB_PHASE4_ARCH_GARCH_GUIDE_VI.md` và test `tests/quant-volatility.test.js`.
- Giữ Phase 4 ở phạm vi constant-mean equation; chưa có ARMA-mean+GARCH, Hessian/standard errors, skewed-t/GED hoặc VaR/ES.
- Phân biệt GJR-GARCH (threshold trong phương trình variance) với TARCH theo Zakoian (threshold trong phương trình standard deviation); không gộp hai công thức thành một.

## Chưa triển khai — Phase 5 / roadmap sau

VAR/VECM; Cointegration/Johansen; Granger Causality; Bootstrap/Monte Carlo; Regime Detection nâng cao; backend Python/database và multi-user storage.
