# Gexadecimal Quant Lab — Phase 3 Guide (đã rà soát)

## Phạm vi

Phase 3 bổ sung Time Series Laboratory chạy trong trình duyệt: ACF/PACF, kiểm định ADF và Phillips–Perron, sai phân bậc 1/2, và ước lượng AR, MA, ARMA, ARIMA.

## 1. Correlogram

- ACF sử dụng tỷ lệ giữa tự hiệp phương sai mẫu tại độ trễ k và tự hiệp phương sai tại độ trễ 0, cùng mẫu số n.
- PACF được tính đệ quy Durbin–Levinson từ ACF.
- Có thể xem chuỗi mức (d=0), sai phân bậc một (d=1) hoặc bậc hai (d=2).
- Biên ±1.96/sqrt(N) chỉ là mốc tham khảo xấp xỉ dưới giả định white noise; không phải dải tin cậy đồng thời chính xác.

## 2. Kiểm định nghiệm đơn vị

### ADF

- Hồi quy ADF hỗ trợ ba cấu hình deterministic: không hằng số/không xu hướng, hằng số, hoặc hằng số + xu hướng.
- Lag được chọn bằng AIC hoặc BIC trong khoảng 0 đến lag tối đa được yêu cầu (giới hạn bởi quy tắc cỡ mẫu và 20 lag).
- Các ứng viên được so sánh trên cùng mẫu hiệu dụng để tránh ứng viên có nhiều lag bị so với mẫu khác.
- Sau khi chọn lag, hồi quy cuối cùng được ước lượng lại trên toàn bộ mẫu khả dụng cho lag đã chọn. Kiểm thử này đã được đối chiếu với statsmodels 0.14.6 trên chuỗi AR(1) tái lập bằng seed cố định.
- Kết quả hiển thị lag tối đa thực tế, lag được chọn, số quan sát, AIC/BIC của bước chọn.

### Phillips–Perron (PP)

- PP sử dụng hồi quy Dickey–Fuller không thêm lag sai phân và hiệu chỉnh thống kê bằng phương sai dài hạn Newey–West với kernel Bartlett.
- Hiển thị Z-tau, Z-rho và bandwidth.
- Bandwidth mặc định dùng quy tắc xấp xỉ; người dùng có thể nhập thủ công.

### Diễn giải và giới hạn

- H0 của ADF/PP là chuỗi có nghiệm đơn vị.
- Thống kê nhỏ hơn (âm hơn) critical value tương ứng là bằng chứng bác bỏ H0.
- Critical values trong MVP là mốc tiệm cận tham khảo cho ba cấu hình deterministic; không có MacKinnon p-value hoặc critical value nội suy theo kích thước mẫu. Không dùng riêng các con số này cho báo cáo học thuật/chính thức.

## 3. Sai phân

- ACF/PACF cho phép xem mức, sai phân bậc 1 và sai phân bậc 2.
- ARIMA hỗ trợ d = 0, 1, 2; dự báo được tích phân ngược về thang đo ban đầu.

## 4. AR / MA / ARMA / ARIMA

- AR-only được ước lượng bằng OLS.
- MA và ARMA được ước lượng bằng Conditional Sum of Squares (CSS) và tối ưu Nelder–Mead.
- AR-only dùng burn-in bằng p. Các mô hình có q > 0 dùng burn-in max(5,p,q).
- AIC/BIC được tính trên phần dư sau burn-in và tính cả tham số phương sai nhiễu. Vì burn-in có thể khác giữa AR-only và mô hình có MA, không nên xem AIC/BIC giữa mọi loại/bậc là so sánh hoàn toàn đồng nhất nếu mẫu hiệu dụng khác nhau.
- Có hỗ trợ ARIMA(0,d,0), tức mô hình chỉ có hằng số trên chuỗi sai phân.
- Bậc p/q bị giới hạn 0–5; d bị giới hạn 0–2. Dữ liệu tối đa 15.000 quan sát cho bước ước lượng mô hình trên trình duyệt.
- Hệ thống báo nghiệm AR và MA bằng kiểm tra nghiệm số: nghiệm AR phải nằm ngoài vòng tròn đơn vị để chuỗi AR dừng; nghiệm MA phải nằm ngoài vòng tròn đơn vị để khả nghịch. Việc ước lượng chưa áp đặt ràng buộc nghiệm, nên kết quả có thể không dừng/không khả nghịch.
- Chẩn đoán phần dư có ACF(1) và Ljung–Box ở số lag khả dụng (tối đa 10, có điều chỉnh bậc tự do theo p+q).
- RMSE = sqrt(SSE/N); Residual Standard Error = sqrt(SSE/df). Hai đại lượng này được báo riêng.
- Khoảng dự báo xấp xỉ dùng psi weights của mô hình ARMA và đã tích phân theo d. Khoảng này chưa tính bất định tham số, chưa mô hình hóa phương sai có điều kiện và dựa trên giả định nhiễu phù hợp.
- Nelder–Mead/CSS là triển khai MVP, không phải Maximum Likelihood đầy đủ. Kiểm tra trạng thái hội tụ và chẩn đoán nghiệm trước khi diễn giải.

## 5. Yêu cầu dữ liệu

1. Chuỗi được chọn phải có ít nhất 30 quan sát cho ADF/PP, tối thiểu 40 quan sát cho ước lượng ARMA/ARIMA theo giới hạn MVP, và không có giá trị thiếu/không hữu hạn. Engine không tự bỏ hàng thiếu trong chuỗi thời gian vì làm thay đổi adjacency của lag.
2. Quan sát cần sắp theo thời gian và có tần suất phù hợp. Nếu toàn bộ timestamp được nhận diện, Quant Lab sắp xếp theo timestamp; nếu có timestamp không hợp lệ thì giữ nguyên thứ tự CSV và cảnh báo, không tự bỏ hàng.
3. Công cụ phát hiện timestamp trùng, bước không tăng và các khoảng cách lớn. Nó không tự resample hoặc tự tạo nến bị thiếu.
4. Cuối tuần, qua đêm và ngắt phiên của thị trường có thể tạo khoảng trống hợp lệ về kinh tế nhưng không đều theo thời gian lịch. Chọn quy ước phiên/tần suất nhất quán trước khi diễn giải lag.
5. TickVolume của CFD/cTrader là tick-volume/quote proxy, không phải khối lượng hợp đồng Futures tập trung.

## 6. Cách sử dụng

1. Giải nén ZIP và mở thư mục `paper-main` trong VS Code.
2. Chạy bằng Live Server. Quant Lab hiện chạy browser-side, không cần cài Python package hoặc thư viện thống kê.
3. Chọn Quant Lab trên sidebar.
4. Nhấn **Time Series DEMO** để tải 900 quan sát tổng hợp có timestamp hàng ngày: `XAU_Close_SIM`, `Stationary_AR1`, `RandomWalk`. Đây là dữ liệu mô phỏng, không phải giá vàng thật.
5. Chọn `Stationary_AR1` hoặc `RandomWalk` trong **SERIES VARIABLE**.
6. Chọn difference = 0 để xem level; sau đó chọn 1 để xem first difference. Nhấn **Update ACF/PACF**.
7. Trong **Stationarity Tests**, chọn deterministic term và ADF max lag, sau đó nhấn **Run ADF + PP**.
8. Trong **Model Estimation**, chọn AR, MA, ARMA hoặc ARIMA; nhập p/d/q và forecast horizon; nhấn **Estimate Model**.
9. Đọc hệ số, AIC/BIC, RMSE, kiểm tra nghiệm AR/MA, Ljung–Box, forecast và khoảng dự báo.
10. Với dữ liệu thật, import CSV có cột thời gian (ví dụ `Time`) và cột số. Kiểm tra cảnh báo timestamp và không để trống chuỗi đang chọn.

## 7. Thí nghiệm gợi ý

- `Stationary_AR1`: ACF thường suy giảm; PACF nổi bật ở lag 1; ADF/PP trong mẫu DEMO thường cung cấp bằng chứng chống lại nghiệm đơn vị.
- `RandomWalk`: ACF level thường suy giảm chậm; sai phân bậc 1 có thể tạo chuỗi ổn định hơn; kiểm định thường khó bác bỏ H0.
- `XAU_Close_SIM`: chuỗi bước ngẫu nhiên nhân tạo, không phải XAUUSD thật.
- Fit AR(1) cho `Stationary_AR1`, sau đó thử ARMA(1,1). Không chọn mô hình chỉ bằng AIC/BIC in-sample; nên giữ lại đoạn dữ liệu cuối để đánh giá ngoài mẫu.

## 8. Giới hạn đã biết

- Mọi phép tính chạy đồng bộ trong browser; chưa có Python backend, database, persistence, job queue hay model service.
- ADF/PP critical values là tham khảo tiệm cận, không có MacKinnon p-value/critical values finite-sample.
- MA/ARMA dùng CSS + Nelder–Mead; nghiệm chỉ được chẩn đoán sau ước lượng, không bị ràng buộc trong quá trình fit.
- Khoảng dự báo chưa tính bất định tham số và không bao gồm biến động có điều kiện như GARCH.
- Kết quả quan trọng cần được đối chiếu với statsmodels, R hoặc Stata trước khi đưa vào nghiên cứu chính thức.
- Kiểm thử Node.js và kiểm tra cú pháp đã chạy; môi trường build không cho phép xác minh tương tác browser end-to-end nên người dùng vẫn cần smoke-test sau khi giải nén.
