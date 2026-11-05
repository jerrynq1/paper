# Hướng dẫn sử dụng Gexadecimal Quant Lab — Phase 1 đến Phase 4

> Tài liệu này hướng dẫn bản Quant Lab đã được rà soát. Hình minh họa trong PDF là sơ đồ/mockup và biểu đồ dữ liệu mô phỏng, không phải ảnh chụp phiên chạy live. Quant Lab hiện tính toán trong trình duyệt, không cần cài Python.

## 1. Quant Lab là gì?

Quant Lab là khu vực phân tích định lượng được thêm vào Gexadecimal. Các phase hiện có gồm:

- **Phase 1 — Statistical Data Explorer:** nhập dữ liệu, xem thống kê mô tả, phân phối, lợi suất, tương quan, hiệp phương sai và rolling statistics.
- **Phase 2 — Regression Laboratory:** hồi quy OLS đơn/đa biến, kiểm định hệ số, kiểm định F cổ điển, confidence interval, HC1, VIF và chẩn đoán phần dư.
- **Phase 3 — Time Series Laboratory:** ACF/PACF, ADF/PP, sai phân, AR/MA/ARMA/ARIMA, dự báo và chẩn đoán phần dư/nghiệm.
- **Phase 4 — ARCH/GARCH Volatility Laboratory:** ARCH, GARCH, EGARCH, GJR-GARCH và TARCH-Zakoian; Gaussian/standardized Student-t; conditional volatility, persistence, diagnostics và volatility forecast.

Đây là MVP nghiên cứu/học tập, chưa phải bộ phần mềm econometrics được chứng nhận và chưa có backend hay database.

## 2. Chạy ứng dụng

1. Tải gói source ZIP đã rà soát và giải nén.
2. Mở thư mục `paper-main` bằng VS Code.
3. Cài extension **Live Server** nếu chưa có.
4. Mở `index.html`, nhấn **Go Live** ở thanh trạng thái VS Code.
5. Trình duyệt mở website local. Chọn **Quant Lab** trên sidebar.

Không cần cài Python, Node.js hoặc package thống kê để dùng giao diện. Node.js chỉ cần nếu muốn chạy test của source. Không nên mở trực tiếp file bằng `file://`; dùng Live Server giúp các script và module hoạt động theo cách nhất quán hơn.

## 3. Data Center — nạp dữ liệu

Có năm lựa chọn:

- **Import CSV:** chọn file `.csv` từ máy.
- **Lấy M1 từ Chart:** lấy những nến M1 đang có trong bộ nhớ Chart tại thời điểm bấm. Cần kết nối cTrader và tải M1 trước. Đây không phải lệnh tải toàn bộ tick history.
- **Dữ liệu DEMO:** bộ dữ liệu tổng hợp nhỏ để khám phá Statistics.
- **Time Series DEMO:** 900 quan sát tổng hợp theo ngày, gồm `XAU_Close_SIM`, `Stationary_AR1`, `RandomWalk`.
- **Tải CSV mẫu:** tải file mẫu để tham khảo header/format.

Bộ DEMO không phải giá thị trường và không dùng để đánh giá chiến lược.

### 3.1 Định dạng CSV khuyến nghị

Header ví dụ:

```csv
Time,Open,High,Low,Close,Volume
2026-01-05T00:00:00Z,2650.10,2652.00,2648.90,2651.30,120
2026-01-05T00:01:00Z,2651.30,2653.20,2650.80,2652.60,145
```

Quy tắc:

- Header phải nằm ở dòng đầu.
- Ưu tiên ISO 8601 có timezone, ví dụ `2026-01-05T00:01:00Z` hoặc `2026-01-05T07:01:00+07:00`.
- Hỗ trợ Unix timestamp seconds/milliseconds và `YYYYMMDD`.
- Bộ phân cách hỗ trợ comma, semicolon và tab. Với semicolon/tab, decimal comma được nhận diện, ví dụ `2651,30`.
- Trường có dấu phân cách bên trong cần đặt trong ngoặc kép.
- Số có ký hiệu `%` ở cuối được đổi thành tỷ lệ, ví dụ `1.5%` thành `0.015`.
- Cột số phải có ít nhất hai giá trị hợp lệ và tỷ lệ parse được tối thiểu 60% để được nhận diện.
- CSV lỗi ngoặc kép hoặc có trường dư so với header sẽ bị từ chối, không tự cắt bỏ.
- Tránh header trùng nhau; nếu trùng, hệ thống thêm hậu tố `(2)`, `(3)`.

### 3.2 Thiếu dữ liệu và timestamp

- Thống kê mô tả bỏ qua giá trị thiếu/không hữu hạn trong biến đang chọn.
- Correlation/Covariance dùng các cặp có đủ hai giá trị; số cặp hợp lệ có thể khác nhau giữa các cặp biến.
- OLS dùng listwise deletion: một dòng bị bỏ nếu thiếu Y hoặc bất kỳ X nào được chọn.
- Rolling chỉ cho kết quả khi toàn bộ cửa sổ đủ số quan sát hợp lệ.
- ACF/ADF/PP/ARIMA từ chối chuỗi có missing; không tự bỏ dòng vì sẽ làm sai khoảng cách lag.
- Nếu mọi timestamp hợp lệ, dữ liệu được sắp xếp tăng dần. Nếu có timestamp lỗi, hệ thống giữ thứ tự CSV và cảnh báo.
- Quant Lab hiển thị timestamp trùng, bước không tăng và khoảng trống lớn. Nó không tự resample hoặc tạo nến bị thiếu.

## 4. Phase 1 — Statistical Data Explorer

### 4.1 Chọn biến

Trong **Descriptive Statistics**, dùng danh sách `VARIABLE` để chọn cột số cần phân tích, ví dụ `Close`, `Volume`, `TickVolume`, `Return`.

### 4.2 Các thống kê

- **Observations (N):** số giá trị hợp lệ của biến.
- **Mean:** trung bình cộng.
- **Median:** trung vị theo nội suy quantile.
- **Mode:** giá trị có tần suất lặp cao nhất; chỉ hiển thị nếu có lặp chính xác. Có thể có nhiều mode đồng hạng.
- **Variance / Std. Dev.:** phương sai và độ lệch chuẩn mẫu, mẫu số N-1.
- **Min / Max:** giá trị nhỏ nhất/lớn nhất.
- **Q1 / Q3:** phân vị 25% và 75%, dùng nội suy tuyến tính.
- **Skewness:** moment coefficient bậc ba chuẩn hóa.
- **Excess Kurtosis:** moment coefficient bậc bốn chuẩn hóa trừ 3.

Skewness và Excess Kurtosis hiện chưa hiệu chỉnh độ chệch mẫu. Mode chỉ có nghĩa rõ ràng khi dữ liệu có giá trị lặp chính xác; dữ liệu giá liên tục thường có thể không có mode.

### 4.3 Histogram và chuỗi giá trị

Histogram chia dữ liệu thành tối đa 24 bins mặc định để quan sát hình dạng phân phối. Đường Price/Variable Series cho biết giá trị theo thứ tự quan sát, không tự suy ra một trục thời gian có tần suất đều.

### 4.4 Return Analysis

- Simple return: `P_t / P_(t-1) - 1`.
- Log return: `ln(P_t / P_(t-1))`.
- Log return chỉ hợp lệ nếu hai mức giá liên tiếp đều dương.
- Return Summary hiển thị mean, standard deviation, tỷ lệ return dương, return tốt/xấu nhất và số quan sát hợp lệ.

Không annualize volatility tự động. Muốn annualize, phải xác định đúng số kỳ quan sát trong năm theo tần suất và lịch giao dịch, ví dụ không áp dụng một hệ số chung cho mọi timeframe/thị trường.

### 4.5 Correlation và Covariance

Tick chọn tối đa tám cột ở **Correlation / Covariance**.

- Pearson correlation nằm trong [-1, 1], đo quan hệ tuyến tính.
- Covariance giữ nguyên đơn vị tích của hai biến, nên phụ thuộc scale.
- Ô ma trận dùng pairwise complete observations. N có thể khác nhau theo từng cặp; phiên bản UI chưa trình bày N cho từng ô.
- Correlation không chứng minh nhân quả. Chuỗi xu hướng/không dừng có thể tạo tương quan giả; cân nhắc phân tích return hoặc sai phân.

### 4.6 Rolling Statistics

1. Nhập `WINDOW SIZE` từ 2 đến 1.000.
2. Nhấn **Update Rolling Statistics**.
3. Xem tối đa 20 kết quả mới nhất.

Bảng hiển thị giá trị hiện tại, rolling mean, rolling std của mức giá/biến và rolling std của log return. Để tính rolling std của w returns cần w+1 mức giá. Volatility chưa annualize.

## 5. Phase 2 — Regression Laboratory (OLS)

### 5.1 Chuẩn bị dữ liệu

Mỗi hàng là một quan sát được đồng bộ theo thời gian hoặc theo đối tượng. Chọn một cột Y và một hay nhiều cột X. Không đưa timestamp dạng số epoch làm biến giải thích trừ khi thật sự muốn mô hình hóa xu hướng thời gian; Quant Lab đã loại cột được nhận diện là thời gian khỏi danh sách predictor.

### 5.2 Thao tác

1. Nạp CSV/Chart hoặc nhấn **Nạp OLS DEMO** để dùng bộ ví dụ.
2. Trong `DEPENDENT VARIABLE · Y`, chọn biến phụ thuộc.
3. Trong `INDEPENDENT VARIABLES · X`, chọn ít nhất một biến giải thích.
4. Để `Include intercept` bật nếu không có lý do lý thuyết để ép hồi quy qua gốc.
5. Có thể bật `HC1 robust standard errors`.
6. Nhấn **Estimate OLS**.
7. Đọc Coefficient Estimates, Model Summary, Residual Diagnostics và Residuals vs Fitted.
8. Nhấn **Export results CSV** để tải bảng kết quả.

OLS DEMO sinh 180 quan sát với mục tiêu gần: `Y = 0.25 + 1.8 X1 - 0.7 X2 + noise`. Đây là dữ liệu tổng hợp.

### 5.3 Công thức và cách đọc

OLS chọn vector beta để tối thiểu hóa tổng bình phương phần dư `SSE = Σ(y_i - ŷ_i)^2`. Engine dùng Householder QR có chuẩn hóa cột thiết kế để giải bài toán, tránh giải trực tiếp normal equations.

- **Coefficient:** mức thay đổi kỳ vọng của Y khi X tăng một đơn vị, giữ các X khác không đổi theo mô hình.
- **Std. Error:** độ bất định ước lượng của hệ số theo covariance estimator.
- **t-stat / p-value:** kiểm định H0: hệ số bằng 0, hai phía.
- **95% CI:** khoảng tin cậy cho hệ số.
- **R² / Adjusted R²:** tỷ lệ biến thiên phù hợp với mô hình theo quy ước centered/uncentered tương ứng.
- **F-statistic:** kiểm định ý nghĩa chung của các biến giải thích; trong MVP là F-test cổ điển.
- **SSE, RMSE:** sai số bình phương tổng; RMSE dùng sqrt(SSE/N).
- **Residual Std. Error:** sqrt(SSE / residual degrees of freedom), khác RMSE.

### 5.4 HC1 và chẩn đoán

HC1 thay ma trận phương sai-hiệp phương sai cổ điển bằng heteroskedasticity-consistent covariance HC1, làm thay đổi standard error, t, p-value và confidence interval; hệ số OLS không đổi. F-test tổng thể đang hiển thị vẫn là F-test cổ điển, HC1 không phải HAC/Newey–West và không sửa tự tương quan.

Chẩn đoán:

- **Durbin–Watson:** gần 2 thường là dấu hiệu sơ bộ ít tự tương quan bậc 1. Bị ẩn nếu listwise deletion làm đứt chuỗi dòng hoặc SSE gần 0.
- **Jarque–Bera:** kiểm tra lệch và độ nhọn phần dư; p-value xấp xỉ tiệm cận.
- **Breusch–Pagan LM:** kiểm tra phương sai thay đổi qua hồi quy phụ trợ; p-value xấp xỉ tiệm cận.
- **VIF:** mức độ đa cộng tuyến; ngưỡng 5/10 chỉ là heuristic.
- **Residuals vs Fitted:** tìm hình phễu, dạng cong, cụm hoặc điểm ngoại lệ bằng mắt.

OLS không chứng minh nhân quả. Hồi quy Close theo Open/High/Low của chính nến đó là mô tả sau khi nến kết thúc, không phải dự báo realtime vì High/Low chỉ biết sau khi nến hình thành. Muốn dự báo, cần feature trễ và chia dữ liệu theo thời gian.

## 6. Phase 3 — Time Series Laboratory

### 6.1 Chọn chuỗi và correlogram

1. Nạp **Time Series DEMO** hoặc CSV có timestamp và biến số.
2. Chọn `SERIES VARIABLE`.
3. Chọn `ACF/PACF DIFFERENCE`: d=0 level, d=1 first difference, d=2 second difference.
4. Chọn `MAX LAG` từ 1 đến 120.
5. Nhấn **Update ACF/PACF**.

ACF đo tương quan giữa chuỗi và bản trễ k. PACF đo tương quan riêng phần ở lag k sau khi kiểm soát các lag nằm giữa. Dạng ACF/PACF gợi ý cấu trúc, không tự động xác định mô hình cuối cùng.

Đường ±1.96/sqrt(N) là xấp xỉ tham khảo dưới white noise, không phải confidence band đồng thời chính xác. ACF level của chuỗi có xu hướng có thể giảm rất chậm và gây hiểu nhầm.

### 6.2 ADF và Phillips–Perron

1. Chọn `DETERMINISTIC TERMS`:
   - `No constant / no trend`: không hằng số, không xu hướng.
   - `Constant / drift`: có hằng số.
   - `Constant + trend`: có hằng số và xu hướng tuyến tính.
2. Chọn `ADF MAX LAG` (0-20; engine có thể cap theo cỡ mẫu).
3. `PP BANDWIDTH`: để trống cho quy tắc mặc định hoặc nhập bandwidth thủ công.
4. Nhấn **Run ADF + PP**.

H0 của cả hai kiểm định là có unit root. Nếu thống kê kiểm định âm hơn critical value ở mức 5%, có bằng chứng bác bỏ H0 ở mức tham khảo đó. Nếu không âm hơn, kết luận phải là “chưa bác bỏ H0”, không phải “chứng minh chuỗi có unit root”.

ADF thêm lag sai phân để xử lý tự tương quan. PP hiệu chỉnh thống kê bằng phương sai dài hạn Newey–West Bartlett. Critical value trong MVP là mốc tiệm cận thô; không có MacKinnon p-value/finite-sample interpolation. Lựa chọn deterministic term, lag, bandwidth, sample period và breaks có thể đổi kết luận.

### 6.3 Differencing

First difference: `Δy_t = y_t - y_(t-1)`. Second difference: `Δ²y_t = Δy_t - Δy_(t-1)`. Sai phân có thể làm chuỗi ổn định hơn nhưng cũng có thể over-difference; không nên đặt d=2 mặc định nếu không có lý do.

### 6.4 AR, MA, ARMA, ARIMA

- **AR(p):** giá trị hiện tại phụ thuộc các lag của chính chuỗi.
- **MA(q):** giá trị hiện tại phụ thuộc các cú sốc/phần dư trễ.
- **ARMA(p,q):** kết hợp AR và MA cho chuỗi dừng.
- **ARIMA(p,d,q):** sai phân d lần rồi mô hình hóa phần đã sai phân.

Trong UI, chọn MODEL và p/d/q. p/q từ 0–5, d từ 0–2; forecast horizon từ 1–100. Engine yêu cầu đủ mẫu và giới hạn 15.000 quan sát cho estimation để giảm nguy cơ treo trình duyệt.

AR-only dùng OLS. MA/ARMA dùng CSS + Nelder–Mead, không phải exact ML. `ARIMA(0,d,0)` được hỗ trợ như mô hình hằng số trên chuỗi sai phân.

### 6.5 Đọc model output

- **Observations:** số residual observations sau burn-in.
- **RMSE:** sqrt(SSE/N residual).
- **Residual S.E.:** sqrt(SSE/residual df).
- **AIC/BIC:** tiêu chí cân bằng độ khớp và số tham số; thấp hơn tốt hơn khi so sánh trên cùng dữ liệu và likelihood/sample quy ước tương thích.
- **AR roots:** mọi nghiệm cần nằm ngoài vòng tròn đơn vị để điều kiện dừng AR được thỏa.
- **MA roots:** mọi nghiệm cần nằm ngoài vòng tròn đơn vị để khả nghịch MA được thỏa.
- **Ljung–Box:** kiểm tra tự tương quan chung phần dư đến lag hiển thị; p nhỏ gợi ý còn cấu trúc serial correlation.
- **Forecast:** giá trị kỳ vọng dự báo theo từng bước; bảng có forecast SE và dải 95% xấp xỉ.

Nghiệm AR/MA chỉ được chẩn đoán sau fit, không bị ràng buộc trong quá trình tối ưu. Nếu optimizer không hội tụ, roots không đạt/chưa xác minh hoặc Ljung–Box có p nhỏ, không nên tin mô hình ngay.

Khoảng dự báo sử dụng psi weights và tích phân theo bậc d nhưng chưa tính bất định tham số. Ở baseline Phase 1–3, chưa có GARCH nên chưa mô hình hóa volatility clustering; Phase 4 hiện bổ sung ARCH/GARCH-family trong một panel riêng. AIC/BIC của ARIMA giữa mô hình có burn-in khác nhau có thể không hoàn toàn so sánh tương thích.

## 7. Workflow nghiên cứu thị trường gợi ý

1. Chọn symbol, timeframe, broker/source, loại dữ liệu và khoảng lịch sử.
2. Đưa dữ liệu về timezone thống nhất; xác minh timestamp, missing bars, duplicate và session gaps.
3. Phân biệt giá, tick volume, exchange volume, quote-derived metrics.
4. Khám phá descriptive stats, log returns, correlation/covariance và rolling volatility.
5. Kiểm tra stationarity trên đúng biến. Nhiều chuỗi giá level có xu hướng; return thường phù hợp hơn cho một số mô hình nhưng không phải luôn dừng.
6. Đặt mô hình dựa trên ACF/PACF và giả thuyết, không thử rất nhiều mô hình rồi chọn một kết quả đẹp duy nhất.
7. Kiểm tra phần dư, roots, Ljung–Box, ổn định tham số và tính kinh tế của dấu/hệ số.
8. Giữ nguyên thứ tự thời gian khi chia train/validation/test. Dùng rolling/expanding walk-forward.
9. Khi biến dự báo sang chiến lược, trừ spread, commission, slippage và kiểm tra execution constraints.
10. Lưu cấu hình, khoảng thời gian, nguồn dữ liệu, timezone và phiên bản source để tái lập.

## 8. Sự cố thường gặp

- **Không thấy Quant Lab:** chạy website bằng Live Server từ thư mục `paper-main`, refresh trang; xác minh `index.html` là entry point.
- **Không có dữ liệu M1:** vào Chart, kết nối cTrader và tải M1 trước rồi quay lại Quant Lab.
- **CSV không nhận cột số:** kiểm tra header, delimiter, decimal comma/dot và tỷ lệ dữ liệu parse được.
- **Không nhận timestamp:** đặt header `Time`, `Date`, `Timestamp`, `Datetime` hoặc `Time (UTC)`; ưu tiên ISO 8601.
- **ADF/PP báo không đủ quan sát:** cần ít nhất 30 quan sát; giảm ADF lag hoặc tăng dữ liệu nếu số tham số/lag quá lớn.
- **ARIMA báo thiếu mẫu:** dùng dữ liệu dài hơn hoặc giảm p/q/d.
- **Forecast cảnh báo timestamp:** kiểm tra timestamp trùng, ngược thứ tự hoặc gap; engine vẫn xem mỗi dòng là một bước bằng nhau.
- **Canvas hiển thị nhỏ/blank sau khi mở Quant Lab:** đổi kích thước cửa sổ hoặc chuyển sang tab khác rồi quay lại; route đã phát resize event nhưng cần kiểm tra trên trình duyệt/viewport thực tế.
- **Trang bị chậm:** giảm số quan sát; ARMA/ARIMA giới hạn 15.000, ACF/PACF tối đa 120 lag.

## 9. Giới hạn và an toàn

- Quant Lab tính trong trình duyệt, không gửi dữ liệu Quant Lab lên server và không lưu sau khi tải lại trang.
- App gốc hiện lưu cấu hình cTrader và token theo cơ chế localStorage hiện có; không public multi-user trước khi có backend bảo vệ secrets, authentication và access controls.
- CFD cTrader, tick volume và quote proxies không tương đương Futures centralized exchange volume.
- Bản baseline Phase 1–3 không hỗ trợ VAR/VECM, Cointegration, GARCH/EGARCH hoặc Bootstrap/Monte Carlo. Các phiên bản Research Extensions 1.1 và Phase 4 bổ sung walk-forward cơ bản cùng ARCH/GARCH-family; VAR/VECM, Cointegration/Johansen, Granger, Bootstrap/Monte Carlo, multi-asset sync backend và database persistent vẫn chưa triển khai.
- PDF hướng dẫn có hình minh họa vẽ lại; không nên hiểu là ảnh chụp UI hiện hành.

---

## 8. Bản cập nhật Research Extensions 1.1 (05-11-2026)

Quant Lab hiện bổ sung bảng Data quality check cho timezone/ordering/duplicate/gaps; Return Distribution (Jarque–Bera và quantiles); Rolling Realized Volatility (RV/BV/jump variation); ACF/Ljung–Box cho returns, absolute returns và squared returns; Lagged Return Regression dùng X lùi bar để giảm same-bar look-ahead; và expanding-window Walk-forward so với baseline Random Walk.

Đọc hướng dẫn chi tiết, công thức, cách diễn giải, giả định và giới hạn tại `QUANTLAB_RESEARCH_EXTENSION_GUIDE_VI.md` trong thư mục source.

Lưu ý kiểm chứng: ADF và phần AR-only đã có cross-check trên dữ liệu mô phỏng với statsmodels 0.14.6; PP chưa được đối chiếu bằng package PP chuyên biệt; MA/ARMA CSS/Nelder–Mead vẫn là ước lượng thử nghiệm. Không dùng một kết quả thống kê đơn lẻ làm tín hiệu giao dịch.

---

## 9. Phase 4 — ARCH / GARCH Volatility Laboratory

Phase 4 mô hình hóa **phương sai có điều kiện của Log Returns**; nó nghiên cứu mức độ biến động, không trực tiếp dự đoán hướng giá.

### 9.1 Chuẩn bị chuỗi

Chọn một cột giá dương (thường là Close). Engine tạo:

`r_t = 100 × ln(P_t / P_(t-1))`

Dữ liệu phải có ít nhất 100 returns; nên dùng 500–1.000 hoặc nhiều hơn. Không được có missing values. Chuỗi phải được sắp theo thời gian và cần xem Data Quality Check trước khi diễn giải lag.

### 9.2 Các mô hình

- **ARCH(q):** phương sai hiện tại phụ thuộc bình phương cú sốc quá khứ; q từ 1 đến 5.
- **GARCH(1,1):** `h_t = omega + alpha × epsilon_(t-1)^2 + beta × h_(t-1)`. Persistence thường là alpha + beta.
- **EGARCH(1,1):** mô hình hóa log variance; gamma mô tả hiệu ứng dấu, và forecast nhiều bước là plug-in approximation.
- **GJR-GARCH(1,1):** thêm `gamma × I(epsilon<0) × epsilon²` trong phương trình variance; gamma dương là bất đối xứng theo cú sốc âm.
- **TARCH(1,1) theo Zakoian:** mô hình hóa conditional standard deviation thay vì variance; không đồng nhất công thức này với GJR-GARCH.

Công thức, điều kiện tham số, likelihood, cách đọc và ví dụ đầy đủ nằm trong `QUANTLAB_PHASE4_ARCH_GARCH_GUIDE_VI.md`.

### 9.3 Gaussian và Student-t

Gaussian là giả định đơn giản. Standardized Student-t cho phép đuôi dày hơn và ước lượng degrees of freedom `nu > 2` (trong engine hiện tại giới hạn tới 200). Hãy đọc nu cùng skewness/kurtosis của returns; Student-t không tự đảm bảo forecast tốt hơn.

### 9.4 Output quan trọng

- Conditional volatility: độ lệch chuẩn có điều kiện theo % mỗi bar.
- Annualized volatility: phụ thuộc Annualization Factor do người dùng nhập; mặc định 362.880 bars/năm là quy ước gần đúng cho M1 liên tục, không phải lịch session thực tế của mọi broker.
- Persistence và Half-life: mô tả mức độ dai dẳng của phương sai/log variance/độ lệch chuẩn tùy mô hình; không phải thời gian giá quay lại mean.
- AIC/BIC và Log likelihood: chỉ so sánh các mô hình trên cùng biến, cùng sample window và phân phối.
- Ljung–Box trên standardized residual: kiểm tra tự tương quan còn lại.
- ARCH LM trên bình phương standardized residual: kiểm tra ARCH effect còn sót.

### 9.5 Cách diễn giải

Nếu ARCH LM p-value nhỏ, mô hình có thể chưa hấp thụ hết volatility clustering. Nếu Ljung–Box p-value nhỏ, phương trình mean hoặc cấu trúc độ trễ có thể chưa phù hợp. Optimizer hội tụ không chứng minh mô hình đúng.

Forecast Phase 4 là forecast volatility, không phải dự báo giá tăng/giảm, và không phải dải xác suất 95% của giá.

### 9.6 Giới hạn

Phase 4 dùng constant-mean equation, browser-side conditional likelihood và Nelder–Mead. Chưa có Hessian/standard errors của tham số, ARMA mean + GARCH, skewed-t/GED, VaR/ES hoặc backend. Chưa có cross-check đầy đủ với package ARCH chuyên biệt bằng dữ liệu thực. Cần kiểm tra ngoài mẫu và benchmark độc lập trước ứng dụng giao dịch.
