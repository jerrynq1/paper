# Gexadecimal Quant Lab — Hướng dẫn phần mở rộng nghiên cứu

**Phiên bản:** Phase 1–3 + Research Extensions 1.1  
**Ngày cập nhật:** 05-11-2026  
**Phạm vi:** giải thích các phần mới được thêm vào source Quant Lab đã audit. Đây là hướng dẫn sử dụng và diễn giải, không phải cam kết hiệu quả giao dịch.

---

## 1. Những gì đã được bổ sung

Bản cập nhật giữ nguyên kiến trúc browser-only hiện tại và mở rộng thêm:

1. Kiểm tra chất lượng timestamp: timezone, thứ tự dòng, duplicate, khoảng trống và timestamp nằm quá xa trong tương lai so với đồng hồ trình duyệt.
2. Return Distribution: phân phối Log Return, Skewness, Excess Kurtosis, Jarque–Bera và quantile.
3. Rolling Realized Volatility: Rolling Return Std., Realized Volatility, Bipower Volatility và Jump Variation ước lượng.
4. Return & Volatility Dependence: ACF và Ljung–Box cho returns, absolute returns và squared returns.
5. Lagged Return Regression: hồi quy log return hiện tại theo thay đổi của các biến X ở những bar trước đó.
6. Expanding-window Walk-forward: đánh giá forecast một bước ở các checkpoint ngoài mẫu và so với baseline Random Walk.
7. Research Interpretation: hướng dẫn đọc kết quả, giả định, giới hạn và các phép kiểm tra tiếp theo.

Các phần trên chạy trong trình duyệt. Bản cập nhật không thêm backend, database hay dịch vụ Python.

## 2. Data Center — kiểm tra timestamp trước khi phân tích

Bảng **Data quality check** hiển thị nguồn, số dòng, khoảng thời gian, thời điểm nạp, timezone, timestamp lỗi, duplicate, dòng đảo thứ tự và số dòng đổi vị trí sau khi sắp xếp.

### 2.1 Định dạng thời gian nên dùng

Ưu tiên ISO 8601 có múi giờ rõ ràng, ví dụ:

```text
2026-11-05T07:32:00.000Z
2026-11-05T14:32:00+07:00
```

Unix timestamp giây hoặc mili-giây cũng được nhận diện theo quy tắc parser hiện tại. Chuỗi thời gian không có `Z` hoặc UTC offset bị đánh dấu là timezone chưa xác định; ngày chỉ có `YYYY-MM-DD` không cung cấp giờ trong ngày.

### 2.2 Sắp xếp và khoảng trống

- Nếu toàn bộ timestamp đều hợp lệ, Quant Lab sắp xếp tăng dần và giữ lại mọi dòng.
- Nếu có timestamp lỗi, hệ thống không tự bỏ dòng và không tự sắp xếp một phần.
- Duplicate timestamp và bước thời gian không tăng được báo cáo.
- Khoảng trống lớn được phát hiện so với khoảng cách dương trung vị. Đây chỉ là cảnh báo, không tự động chứng minh dữ liệu sai: thị trường có thể đóng cửa, nghỉ phiên hoặc thiếu bar.
- Hệ thống không tự tạo bar bị thiếu, không resample và không điều chỉnh session calendar.
- Nếu timestamp cuối cách đồng hồ trình duyệt hơn 5 phút về phía tương lai, bảng audit cảnh báo để kiểm tra timezone/đồng hồ broker.

**Ý nghĩa đối với mô hình:** ACF lag 1, ADF lag 1 hoặc ARIMA step 1 luôn là bước quan sát kế tiếp. Khi timestamp không đều, một lag không nhất thiết tương đương đúng một phút.

## 3. Return Distribution

Histogram mới dùng **Log Return** thay vì mức giá tuyệt đối.

Với giá dương:

\[
r_t=\ln(P_t/P_{t-1})
\]

### Các chỉ số

- **Mean:** log return trung bình trong mẫu.
- **Std. Dev.:** độ phân tán log return theo từng quan sát; chưa annualize.
- **Skewness:** độ bất đối xứng của phân phối.
- **Excess Kurtosis:** kurtosis trừ 3; bằng 0 là mốc của phân phối chuẩn về kurtosis.
- **Jarque–Bera:** kiểm định đồng thời skewness và excess kurtosis.
- **Quantiles:** phân vị 1%, 5%, 50%, 95%, 99% của lợi suất lịch sử.

Jarque–Bera được tính theo xấp xỉ:

\[
JB=\frac{n}{6}\left(S^2+\frac{K^2}{4}\right)
\]

Trong đó `S` là skewness, `K` là excess kurtosis. p-value hiển thị dùng xấp xỉ phân phối chi-square với 2 bậc tự do.

**Cách đọc:** p nhỏ (ví dụ dưới 0.05) là bằng chứng chống lại giả thuyết phân phối chuẩn trong mẫu. p lớn không chứng minh returns phân phối chuẩn. Các quantile là mô tả lịch sử, không phải VaR hay Expected Shortfall dự báo.

## 4. Rolling & Realized Volatility

### 4.1 Rolling Return Standard Deviation

Đây là độ lệch chuẩn mẫu của một cửa sổ Log Return. Giá trị lớn hơn nghĩa là các lợi suất trong cửa sổ phân tán mạnh hơn.

### 4.2 Realized Variance và Realized Volatility

Với `w` log returns trong cửa sổ:

\[
RV_t=\sum_{i=1}^{w}r_i^2,\qquad RealizedVol_t=\sqrt{RV_t}
\]

### 4.3 Bipower Variation

\[
BV_t=\frac{\pi}{2}\sum_{i=2}^{w}|r_i||r_{i-1}|,\qquad BipowerVol_t=\sqrt{BV_t}
\]

BV thường được dùng như ước lượng thành phần biến động liên tục trong các phương pháp high-frequency; cách tính trong MVP là bộ ước lượng thực nghiệm đơn giản, chưa điều chỉnh microstructure noise hay lịch giao dịch.

### 4.4 Jump Variation ước lượng

\[
JV_t=\max(RV_t-BV_t,0)
\]

Giá trị dương lớn có thể gợi ý một phần biến động bất thường/jump trong cửa sổ. Đây không phải kiểm định jump hoàn chỉnh và không khẳng định có tin tức hay giao dịch tổ chức.

**Nhiều chu kỳ trong giao diện:** nhập từ một đến bốn cửa sổ, phân tách bằng dấu phẩy, ví dụ `20,50,100`. Mỗi cửa sổ nhận từ 2 đến 1.000 bars. Điều này cho phép so sánh biến động ngắn, trung bình và dài hơn trên cùng một dataset mà không tự chọn một chu kỳ là tối ưu.

**Quan trọng:** RV/BV và rolling return volatility trong giao diện chưa annualize. Muốn quy đổi năm phải xác định số quan sát thực tế mỗi năm, lịch phiên, cuối tuần, ngày nghỉ và cách xử lý gaps. Với CFD/quote data, kết quả còn chịu ảnh hưởng của feed broker.

## 5. Return & Volatility Dependence

Quant Lab tính correlogram cho ba chuỗi:

1. `r_t`: Log Return nếu biến được chọn dương; nếu không dương thì dùng first difference.
2. `|r_t|`: trị tuyệt đối lợi suất.
3. `r_t²`: bình phương lợi suất.

ACF của returns yếu không có nghĩa volatility ổn định. Nếu ACF của `|r_t|` hoặc `r_t²` vẫn dương và kéo dài, đó là dấu hiệu phù hợp với **volatility clustering**: các giai đoạn biến động lớn có xu hướng xuất hiện gần nhau, tương tự các giai đoạn biến động nhỏ.

### Ljung–Box

Công thức đã sửa trong bản này:

\[
Q=n(n+2)\sum_{k=1}^{m}\frac{\hat{\rho}_k^2}{n-k}
\]

- `n`: số quan sát trong chuỗi được kiểm tra.
- `m`: số lag được đưa vào kiểm định.
- `ρ̂(k)`: autocorrelation tại lag k.

Đối với residual của ARMA, bậc tự do hiển thị được điều chỉnh bằng `m - p - q`.

- p nhỏ: có bằng chứng còn tự tương quan tới số lag đang kiểm tra.
- p lớn: chưa bác bỏ giả thuyết không có tự tương quan ở các lag đó; không có nghĩa đã chứng minh residual hoàn toàn white noise.

## 6. Lagged Return Regression

Đây là mô hình phụ để giảm lỗi dùng thông tin chưa có tại thời điểm ra quyết định (same-bar look-ahead).

- Y được chuyển thành Log Return hiện tại: `Δln(Y_t)`; Y phải dương ở hai quan sát liên tiếp.
- Mỗi X được chuyển thành Log Change nếu mọi giá trị hợp lệ đều dương; nếu không, dùng First Difference.
- X được dịch lùi theo số bar do người dùng chọn. Mặc định lag = 1, tức X từ bar trước được dùng để giải thích Y của bar hiện tại.
- Model dùng OLS và HC1 robust standard errors.

**Giới hạn:**

- Lag là số dòng/bar, không đảm bảo đúng số phút nếu có session gap.
- HC1 chỉ điều chỉnh ma trận sai số chuẩn cho heteroskedasticity; không sửa serial correlation.
- R² và p-value là kết quả in-sample, không tự chứng minh causality hay forecast skill.
- Cần walk-forward/holdout để đánh giá khả năng dự báo.

## 7. Walk-forward Validation — Expanding Window

### Cách hoạt động

1. Chọn tỷ lệ train ban đầu, mặc định 70%.
2. Phần còn lại được dùng làm vùng test ngoài mẫu.
3. Quant Lab chọn tối đa 30 checkpoint rải đều trên vùng test (mặc định 12).
4. Với mỗi checkpoint, mô hình được fit lại chỉ bằng các quan sát đứng trước target.
5. Mô hình dự báo một bước; kết quả được so với **Naive Random Walk**: forecast bằng giá trị cuối cùng của training window.

### Chỉ số

- **MAE:** trung bình sai số tuyệt đối.
- **RMSE:** căn bậc hai của trung bình bình phương sai số.
- **Directional Accuracy:** tỷ lệ dự báo đúng hướng so với giá trị cuối train.
- **RMSE vs Naive:** phần trăm RMSE cải thiện hoặc kém hơn baseline.

Nếu RMSE mô hình thấp hơn baseline, mô hình tốt hơn baseline trên các checkpoint được chọn trong mẫu đang xét. Điều đó chưa chứng minh lợi nhuận giao dịch. Checkpoint rải đều không phải kiểm định mọi bar; chưa tính spread, commission, slippage, latency, market impact hay bất định tham số.

## 8. Đọc kết quả theo quy trình nghiên cứu

Mỗi kết quả nên được kiểm tra qua sáu câu hỏi:

1. Kết quả đang mô tả level, return, volatility hay forecast?
2. Có bao nhiêu quan sát hợp lệ và các quan sát có đúng thứ tự thời gian không?
3. Chỉ số có phù hợp với giả định của kiểm định/mô hình không?
4. Residual có tự tương quan, heteroskedasticity hoặc cấu trúc còn sót lại không?
5. Mô hình có tốt hơn benchmark ngoài mẫu không?
6. Kết luận có còn đứng vững sau spread, commission, slippage và thay đổi regime không?

Không dùng một p-value, một R², một forecast hay một nhãn “stationary” làm tín hiệu Buy/Sell độc lập.

## 9. Trạng thái kiểm chứng và giới hạn còn lại

### Đã kiểm tra trong môi trường xây dựng

- Các file JavaScript đã vượt qua `node --check`.
- Các bài test hiện có trong `tests/*.test.js` chạy thành công, gồm test mới cho Ljung–Box, RV/BV, timestamp metadata, dependence diagnostics và walk-forward.
- ADF trên chuỗi mô phỏng có seed được đối chiếu với `statsmodels 0.14.6`.
- AR(1) OLS và ARIMA(1,1,0) trên chuỗi sai phân được đối chiếu với `statsmodels AutoReg` trên bộ dữ liệu mô phỏng; hệ số khớp tới sai số số học.
- Kiểm tra tĩnh cho thấy không có ID HTML trùng và không có tham chiếu `$q(...)` thiếu ID.

### Chưa thể xác nhận trong môi trường này

- PP chưa được cross-check độc lập với một package Phillips–Perron chuyên biệt. Giao diện hiển thị rõ giới hạn này.
- MA/ARMA CSS + Nelder–Mead chưa được chứng minh tương đương exact maximum likelihood của statsmodels/R/Stata.
- Forecast CSS chưa được xác minh trên CSV XAUUSD M1 gốc của người dùng vì bản cập nhật không có file dữ liệu đó.
- Browser end-to-end automation chưa hoàn tất; cần smoke-test thủ công trên Live Server/hosting thật.

### Chưa triển khai

ARCH/GARCH/EGARCH/TGARCH, VAR/VECM, Cointegration/Johansen, Granger Causality, Bootstrap/Monte Carlo, Regime Detection nâng cao, backend Python, database, authentication và multi-user storage vẫn là các hạng mục roadmap, không phải tính năng đã hoạt động.
