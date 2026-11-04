# Phase 3 Changelog — Time Series Laboratory (đã rà soát)

## Đã thêm
- `js/quant-timeseries.js`: ACF, PACF (Durbin–Levinson), sai phân bậc 1/2, ADF, Phillips–Perron Z-tau/Z-rho với Newey–West Bartlett variance, AR/MA/ARMA/ARIMA CSS và forecast.
- Kiểm tra nghiệm AR/MA sau ước lượng, chẩn đoán ACF(1) và Ljung–Box cho phần dư.
- Forecast interval xấp xỉ dựa trên psi weights và tích phân theo bậc sai phân; vẫn chưa tính bất định tham số.
- Hỗ trợ ARIMA(0,d,0), kiểm tra p/q/d và forecast horizon hợp lệ.
- Bộ Time Series DEMO 900 dòng daily tổng hợp để học và kiểm tra.
- Hướng dẫn đã cập nhật trong `QUANT_PHASE3_GUIDE.md` và `QUANTLAB_USER_GUIDE_VI.md`.

## Các điểm được rà soát/sửa
- ADF lag selection so sánh ứng viên trên cùng effective sample, sau đó refit lag thắng trên toàn bộ mẫu khả dụng.
- AIC/BIC tính cả tham số phương sai nhiễu; ghi chú burn-in thực tế khác nhau giữa AR-only và model có MA.
- Phân biệt RMSE `sqrt(SSE/N)` và Residual Standard Error `sqrt(SSE/df)`.
- Bỏ ngưỡng hệ số tuyệt đối tùy tiện; báo nghiệm AR/MA sau khi fit.
- Bổ sung Ljung–Box và kiểm tra forecast horizon không hợp lệ.

## Giới hạn
- ADF/PP critical values là mốc tiệm cận tham khảo; chưa có MacKinnon finite-sample p-values/critical values.
- AR-only dùng OLS; MA/ARMA dùng CSS + Nelder–Mead, chưa phải exact Maximum Likelihood.
- Nghiệm AR/MA chỉ được chẩn đoán sau fit, chưa bị ràng buộc khi tối ưu.
- AIC/BIC giữa model có effective sample/burn-in khác nhau cần được so sánh thận trọng.
- Khoảng dự báo chưa tính bất định tham số hoặc ARCH/GARCH.
- Môi trường build chưa chạy được browser end-to-end automation; cần smoke-test thủ công sau khi giải nén.
