# Báo cáo rà soát Gexadecimal Quant Lab — Phase 1 đến Phase 3

Ngày rà soát: 05-11-2026
Bản nguồn rà soát: `gexadecimal-quant-lab-phase3.zip` (thư mục `paper-main`).

## 1. Kết luận điều hành

- Đã rà soát tích hợp Quant Lab trong `index.html`, `css/style.css`, `js/connection-ui.js`, `js/quant-lab.js` và ba engine thuần `js/quant-stats.js`, `js/quant-regression.js`, `js/quant-timeseries.js`.
- Đã rà soát tĩnh toàn bộ JavaScript trong source, kiểm tra các ID HTML, tham chiếu DOM của Quant Lab và chạy tất cả test Node.js hiện có.
- Đã sửa các lỗi ảnh hưởng đến dữ liệu/diễn giải thống kê, bổ sung Covariance Matrix, Rolling Statistics và chẩn đoán Ljung–Box cho phần dư ARMA/ARIMA.
- Không thực hiện viết lại Chart, Footprint, Options, TPO, Replay hoặc Paper Trading. Ngoài thay đổi nhỏ để phát lại resize khi mở Quant Lab và chỉnh nội dung footnote, các module giao dịch gốc được giữ nguyên.
- Đây là một MVP nghiên cứu chạy trong trình duyệt, chưa phải phần mềm kinh tế lượng đã được chứng nhận. Kết quả quan trọng cần được đối chiếu bằng statsmodels/R/Stata và kiểm định ngoài mẫu.

## 2. Các lỗi đã phát hiện và sửa

### Data parsing / Data integrity

1. Phần trăm ở cuối chuỗi, ví dụ `1.25%`, trước đây không được quy đổi nhất quán thành `0.0125`; parser hiện chuyển thành tỷ lệ thập phân.
2. CSV có header trùng hiện được đặt hậu tố `(2)`, `(3)` để tránh ghi đè cột.
3. CSV có dấu ngoặc kép chưa đóng hoặc số trường nhiều hơn header bị báo lỗi, không âm thầm cắt bỏ trường dư.
4. Nhận diện timestamp được thu hẹp theo danh sách alias; không nhầm header như `Update` là cột thời gian.
5. Parser timestamp hỗ trợ ISO/date-string, `YYYYMMDD`, Unix seconds và Unix milliseconds; ngày dạng `YYYYMMDD` được kiểm tra tính hợp lệ lịch.
6. Giá trị trống/null không còn bị coi là số 0 trong returns, ghép cặp correlation/covariance và chuỗi thời gian.
7. Cột thời gian dạng số không bị đề xuất nhầm làm biến hồi quy.
8. Timestamp lỗi không bị loại bỏ âm thầm; chỉ sắp xếp khi tất cả timestamp đều hợp lệ. Nếu có timestamp lỗi, giữ thứ tự CSV và hiển thị cảnh báo.
9. Rolling statistics chỉ tính khi toàn bộ cửa sổ có đủ quan sát hợp lệ.

### Statistical / Regression

1. Bổ sung Mode và tập hợp các mode đồng hạng; ghi rõ mode chỉ có ý nghĩa khi có giá trị lặp chính xác.
2. Bổ sung ma trận hiệp phương sai mẫu và giao diện Covariance Matrix.
3. Bổ sung giao diện Rolling Mean, Rolling Standard Deviation và Rolling Std. Dev. của log return.
4. Hồi quy OLS từ chối các cột Y/X không cùng độ dài thay vì âm thầm cắt ngắn và làm lệch quan sát.
5. Các ô null/trống bị coi là missing; OLS áp dụng listwise deletion trên toàn bộ Y và X được chọn.
6. Durbin–Watson không hiển thị nếu việc loại dòng làm đứt tính liền kề thời gian, hoặc mô hình fit hoàn hảo khiến SSE gần 0.
7. Ngưỡng perfect-fit và kiểm tra R² được điều chỉnh theo quy mô dữ liệu, tránh lỗi với log-return có trị tuyệt đối nhỏ.
8. Các diễn giải về HC1, F-test cổ điển, Jarque–Bera, Breusch–Pagan và VIF được nêu rõ hơn trong UI/docs.

### Time Series / Forecasting

1. Chuỗi thời gian từ chối giá trị thiếu/không hợp lệ thay vì chuyển thành 0 hoặc tự bỏ quan sát và phá cấu trúc lag.
2. ADF chọn lag trên cùng mẫu hiệu dụng giữa các ứng viên, sau đó ước lượng lại lag được chọn trên toàn bộ mẫu khả dụng. Kết quả được đối chiếu với statsmodels 0.14.6 trên chuỗi AR(1) tái lập bằng seed.
3. ADF hiển thị lag tối đa thực tế, lag chọn và thông tin mẫu dùng trong chọn lag.
4. ARIMA hỗ trợ trường hợp `ARIMA(0,d,0)` (mô hình hằng số trên chuỗi sai phân).
5. p/q/d được xác thực là số nguyên trong phạm vi hỗ trợ; không âm thầm clamp tham số sai.
6. Bỏ ngưỡng hệ số tùy tiện `abs(coef) <= 5`, thay bằng chặn giá trị không hữu hạn/quá lớn.
7. AIC/BIC tính thêm tham số phương sai nhiễu; burn-in được tách rõ giữa AR-only và các mô hình có MA.
8. RMSE `sqrt(SSE/N)` được tách khỏi Residual Standard Error `sqrt(SSE/df)`.
9. Bổ sung chẩn đoán nghiệm đa thức AR/MA sau ước lượng để cảnh báo tính dừng/khả nghịch.
10. Bổ sung Ljung–Box cho tự tương quan phần dư (lag tối đa 10, có hiệu chỉnh df theo p+q).
11. Khoảng dự báo được tính từ psi weights và tích phân theo bậc sai phân; tài liệu nêu rõ chưa tính bất định tham số.

## 3. Các giới hạn còn lại

### Data Center

- CSV numeric column phải có tối thiểu 2 giá trị số và tỷ lệ parse thành công tối thiểu 60% để được nhận diện là cột số.
- CSV nên dùng header rõ ràng; thời gian nên là ISO 8601 kèm `Z` hoặc UTC offset, hoặc Unix seconds/milliseconds. Không hỗ trợ Excel serial date một cách rõ ràng.
- Correlation/Covariance dùng các cặp complete-case theo từng cặp biến; N có thể khác nhau giữa từng ô ma trận. UI MVP hiện chưa đưa N pairwise vào từng ô.
- Correlation Matrix giới hạn tối đa 8 biến đầu tiên trong bộ chọn.
- Descriptive statistics bỏ giá trị thiếu/không hữu hạn cho từng biến. Regression loại dòng thiếu theo Y và tất cả X. Time Series từ chối chuỗi có missing để bảo toàn lag.
- Dữ liệu hiện chỉ ở bộ nhớ phiên trình duyệt; không có lưu trữ bền vững, lịch sử phiên hoặc multi-user database.

### Regression

- OLS dùng Householder QR, sai số chuẩn cổ điển hoặc HC1. HC1 không phải HAC/Newey–West, không xử lý tự tương quan, nội sinh, bỏ sót biến, sai dạng hàm hoặc non-stationarity.
- F-test tổng thể vẫn là F-test cổ điển kể cả khi người dùng bật HC1; chưa có robust Wald/F test.
- Jarque–Bera và Breusch–Pagan dùng phân phối tiệm cận.
- VIF là chỉ báo đa cộng tuyến; ngưỡng 5/10 chỉ mang tính heuristic.
- R² không chứng minh quan hệ nhân quả hoặc khả năng dự báo.

### Time Series

- ADF/PP critical values là mốc tiệm cận tham khảo, chưa có MacKinnon response-surface p-value/critical values theo finite sample.
- PP đã có Newey–West Bartlett long-run variance nhưng chưa được cross-check độc lập với một gói PP đã được chứng nhận trong môi trường này.
- AR-only dùng OLS; MA/ARMA dùng CSS + Nelder–Mead, không phải exact/maximum likelihood đầy đủ.
- Nghiệm AR/MA chỉ được chẩn đoán sau khi fit; chưa áp đặt ràng buộc trong quá trình tối ưu.
- AIC/BIC giữa model có burn-in khác nhau có thể không so sánh hoàn toàn tương thích; nên so sánh trên cùng sample window ở nghiên cứu chính thức.
- Ljung–Box là chẩn đoán gần đúng trên phần dư CSS, không thay thế chẩn đoán phần dư toàn diện.
- Khoảng dự báo dựa trên psi weights nhưng vẫn xấp xỉ; chưa cộng bất định tham số, chưa xử lý ARCH/GARCH hoặc đổi regime.
- Mô hình xem mỗi hàng là một bước thời gian bằng nhau. Cảnh báo timestamp chỉ giúp phát hiện vấn đề; không tự resample hoặc loại khoảng trống phiên.

### App / Security

- Quant Lab chạy client-side; không cần Python khi sử dụng. Live Server chỉ phục vụ file local.
- cTrader credentials trong ứng dụng hiện được lưu ở localStorage theo cấu hình hiện hữu (`ct_cfg`). Không nên triển khai nguyên trạng thành dịch vụ public multi-user trước khi chuyển secrets/token sang backend có kiểm soát truy cập.
- Môi trường thực hiện không cho phép browser automation truy cập localhost (bị chặn bởi policy), vì vậy chưa có xác minh end-to-end tương tác thực tế. Các hình trong PDF là sơ đồ/minh họa được dựng riêng, không phải screenshot phiên chạy live.

## 4. Kiểm thử và static validation

Kết quả lần rà soát cuối:

- 18/18 file test Node.js không rỗng chạy thành công.
- 58/58 file JavaScript vượt qua `node --check`.
- 168 ID trong `index.html`, không có ID trùng lặp.
- 59 tham chiếu DOM tĩnh `$q('...')` trong `quant-lab.js` đều có ID tương ứng trong HTML.
- ADF lag-selection được đối chiếu chéo với statsmodels 0.14.6 trên một chuỗi AR(1) deterministic seeded.
- ZIP source được đóng gói và kiểm tra integrity sau khi hoàn thiện.

Ghi chú: test harness của hai test cũ `hvn.test.js` và `price-variation.test.js` đã được chỉnh để kiểm tra module trong context hợp lệ/pure function. Việc này không đồng nghĩa mọi hành vi runtime của các module đó đã được audit đầy đủ.

## 5. Phần source thay đổi

- `index.html`: Quant Lab panels, Covariance/Rolling UI, footnote và các control.
- `css/style.css`: kiểu hiển thị Quant Lab.
- `js/connection-ui.js`: phát `resize` khi mở route Quant Lab để canvas có thể vẽ lại trong view vừa hiện.
- `js/quant-stats.js`: CSV, parsing, thống kê mô tả, returns, correlation/covariance, histogram, rolling, timestamp.
- `js/quant-regression.js`: OLS/QR, suy luận t/F, classical/HC1 covariance, VIF và residual diagnostics.
- `js/quant-timeseries.js`: ACF/PACF, ADF/PP, differencing, AR/MA/ARMA/ARIMA, root diagnostics, forecast intervals, Ljung–Box.
- `tests/quant-*.test.js`: test cho ba engine mới; test legacy harness có chỉnh sửa như nêu trên.

Các module giao dịch hiện có như Chart, Footprint, Options, TPO, Replay, Paper Trading không được viết lại trong đợt rà soát.

## 6. Khuyến nghị trước khi public

1. Smoke-test thủ công trong Chrome/Edge với cả Live Server và hosting.
2. Dùng bộ dữ liệu chuẩn đã có kết quả tham chiếu từ statsmodels/R/Stata để cross-check từng test và mô hình.
3. Với OLS/ARIMA, thêm train/test theo thời gian, rolling/expanding walk-forward, tránh look-ahead bias.
4. Bổ sung timestamp-aware resampling và chính sách session gaps rõ ràng cho dữ liệu giao dịch.
5. Trước khi hỗ trợ nhiều người dùng, thiết kế backend, auth, rate limits, secure credential storage và data warehouse.
6. Roadmap tại thời điểm báo cáo baseline Phase 1–3 (trước khi bổ sung Phase 4): phát triển ARCH/GARCH sau khi Data Foundation và kiểm định Phase 1–3 được smoke-test. Phase 4 hiện đã được triển khai trong bản cập nhật riêng, xem mục 8.

## 7. Audit bổ sung — Research Extensions 1.1 (05-11-2026)

### Các thay đổi

- Sửa Ljung–Box: thay multiplier sai `m(m+2)` bằng chuẩn `n(n+2)`; p-value dùng chi-square survival với df = m - p - q cho residual ARMA.
- Thêm timestamp metadata và UI cảnh báo timezone mơ hồ, timestamp lỗi, duplicate, thứ tự nguồn, gaps và timestamp cuối ở tương lai so với đồng hồ browser.
- Thêm Return Distribution: moments, Jarque–Bera asymptotic reference p-value và quantiles.
- Thêm rolling RV/BV/jump-variation estimates; chưa annualize.
- Thêm dependence diagnostics cho returns, absolute returns và squared returns.
- Thêm lagged return OLS: Y log return hiện tại, X changes được shift lùi; HC1 standard errors.
- Thêm expanding-window walk-forward checkpoint evaluation so với naïve random-walk baseline.
- Thêm UI Research Interpretation và tài liệu `QUANTLAB_RESEARCH_EXTENSION_GUIDE_VI.md`.

### Kiểm chứng thực hiện

- Tất cả `js/*.js` vượt qua `node --check`.
- Tất cả `tests/*.test.js` chạy thành công trong lượt kiểm tra này.
- Ljung–Box có test tính Q độc lập theo công thức chuẩn `n(n+2)Σρ²/(n-k)`.
- Return distribution, RV/BV, timestamp metadata, dependence diagnostics và walk-forward có test mới.
- ADF trên dữ liệu seeded đối chiếu với statsmodels 0.14.6; AR(1) OLS và ARIMA(1,1,0) AR-only trên sai phân khớp statsmodels AutoReg tới sai số số học.
- HTML có 186 ID, không trùng; 75 tham chiếu `$q(...)` trong `quant-lab.js` đều có ID. Có 19 file test và 39 file JavaScript trong source package.

### Giới hạn xác minh

- PP chưa được cross-check độc lập bằng package Phillips–Perron chuyên biệt.
- MA/ARMA CSS + Nelder–Mead không phải exact maximum likelihood; chưa được xác minh là tương đương statsmodels/R/Stata.
- Chưa có CSV XAUUSD M1 gốc để tái tạo kết quả từ PDF và chạy forecast validation trên dữ liệu thật.
- Browser E2E automation chưa hoàn tất trong môi trường đóng gói; cần smoke-test trên browser/hosting thật.
- Tại thời điểm Research Extensions 1.1: ARCH/GARCH, VAR/VECM, Cointegration, Granger, Bootstrap/Monte Carlo và Regime Detection nâng cao chưa triển khai. Phase 4 hiện đã bổ sung ARCH/GARCH-family; VAR/VECM, Cointegration, Granger, Bootstrap/Monte Carlo và Regime Detection nâng cao vẫn thuộc Phase 5/roadmap.


## 8. Audit bổ sung — Phase 4 ARCH/GARCH Volatility Laboratory (05-11-2026)

### Phạm vi thêm vào

- `js/quant-volatility.js`: engine browser-side cho ARCH(q), GARCH(1,1), EGARCH(1,1), GJR-GARCH(1,1), TARCH(1,1) theo Zakoian.
- `index.html`, `css/style.css`, `js/quant-lab.js`: panel Phase 4, controls, parameter/diagnostic tables, conditional volatility plot, forecast và export CSV.
- `tests/quant-volatility.test.js`: 12 nhóm test chuyển giá sang log returns, dữ liệu không hợp lệ, fit từng model, Gaussian/Student-t, điều kiện tham số, forecast, annualization và diagnostics.
- `QUANTLAB_PHASE4_ARCH_GARCH_GUIDE_VI.md`: công thức, thiết lập, diễn giải, giả định và giới hạn.

### Phương pháp và giới hạn

- Returns được tạo bằng `100 × ln(P_t/P_(t-1))`; mean equation là hằng số. ARCH/GARCH-family fit conditional likelihood với Gaussian QMLE hoặc standardized Student-t, tối ưu bằng Nelder–Mead.
- Phase 4 hiển thị conditional volatility, persistence, half-life, annualized volatility theo factor người dùng nhập, Ljung–Box trên standardized residual, ARCH LM trên standardized residual² và forecast volatility.
- EGARCH `exp(E[log h])` chỉ là median/plug-in proxy do Jensen inequality; không được gắn nhãn unconditional variance chính xác. TARCH-Zakoian mô hình hóa conditional standard deviation; forecast nhiều bước là plug-in approximation.
- Chưa có Hessian/parameter standard errors, ARMA mean + GARCH, skewed-t/GED, VaR/ES, stress test hoặc cross-validation tích hợp riêng cho GARCH.
- Chưa có benchmark trên CSV XAUUSD M1 gốc hoặc cross-check toàn bộ mô hình với `arch`/`rugarch`. Kết quả tối ưu và test trên dữ liệu mô phỏng không chứng minh hiệu năng ngoài mẫu.

### Kiểm chứng Phase 4

- `node tests/quant-volatility.test.js`: 12 nhóm kiểm thử thành công.
- Đã đối chiếu GARCH(1,1) Gaussian trên 900 returns mô phỏng có seed giữa engine JavaScript và SciPy/SLSQP độc lập. Sai lệch hệ số ước lượng tối đa xấp xỉ `1.2e-5`; sai khác negative log-likelihood trung bình xấp xỉ `2.7e-10`. Đây là kiểm tra một bộ synthetic fixture, không thay thế benchmark bằng package ARCH chuyên biệt trên dữ liệu thị trường.
- Đã thêm kiểm thử annualization factor tùy chọn, integer-only validation và đảm bảo EGARCH median proxy không bị coi là unconditional variance.
- Kiểm tra tĩnh mới nhất: 203 HTML IDs không trùng; 92 tham chiếu `$q(...)` trong `quant-lab.js` đều có ID; `quant-volatility.js` được nạp trước `quant-lab.js`. Có 40 file JavaScript ở thư mục `js/` và 20 file test trong `tests/`.
- Browser end-to-end trên hosting thật vẫn cần smoke-test thủ công.

### Phase tiếp theo

Phase 5 chưa được triển khai trong bản này. Các chủ đề được ghi nhận làm roadmap gồm VAR/VECM, Cointegration/Johansen, Granger Causality, Bootstrap/Monte Carlo và Regime Detection nâng cao; mỗi module cần đặc tả dữ liệu, kiểm định và benchmark riêng.
