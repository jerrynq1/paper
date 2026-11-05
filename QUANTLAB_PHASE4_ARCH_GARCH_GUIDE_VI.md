# Gexadecimal Quant Lab — Phase 4: ARCH / GARCH Volatility Laboratory

**Phiên bản:** Quant Lab Phase 1–4 · Research Extensions 1.1 + Phase 4  
**Ngày:** 05-11-2026  
**Phạm vi:** mô hình phương sai có điều kiện trên chuỗi log returns. Đây là browser-side research MVP, không phải phần mềm econometrics được chứng nhận và không tạo tín hiệu Buy/Sell.

---

## 1. Phase 4 giải quyết câu hỏi gì?

Phase 1 mô tả dữ liệu; Phase 2 nghiên cứu quan hệ tuyến tính; Phase 3 mô hình hóa cấu trúc trung bình và sự phụ thuộc theo thời gian. Phase 4 chuyển sang một câu hỏi khác:

> Mức độ biến động ở bar tiếp theo có thể thay đổi như thế nào khi biết các cú sốc và mức biến động trước đó?

Giá có thể không có tự tương quan đáng kể ở returns, nhưng độ lớn của returns vẫn có thể phụ thuộc vào quá khứ. Một cú sốc lớn thường được theo sau bởi các bar có biến động lớn; giai đoạn yên tĩnh thường nối tiếp bởi giai đoạn yên tĩnh. Hiện tượng này thường được gọi là **volatility clustering**.

ARCH/GARCH-family mô hình hóa phương sai có điều kiện \(h_t=\sigma_t^2\), không trực tiếp dự đoán giá chắc chắn tăng hay giảm.

## 2. Dữ liệu đầu vào và chuẩn bị

### 2.1 Từ giá sang lợi suất

Người dùng chọn một cột giá. Cột phải là số dương và không có missing value. Quant Lab chuyển giá thành phần trăm log return:

\[
r_t=100\ln(P_t/P_{t-1})
\]

Ví dụ: giá từ 4.000 lên 4.004 tạo log return xấp xỉ +0,09995%. Việc nhân 100 giúp hệ số và phương sai dễ đọc hơn; nó không làm thay đổi cấu trúc thống kê của mô hình.

Mỗi dòng phải theo đúng thời gian. Timestamp gaps có thể là session break hoặc missing bar; Phase 4 không tự resample và không tự tạo dữ liệu.

### 2.2 Phương trình trung bình

Bản hiện tại dùng phương trình trung bình hằng số:

\[
r_t=\mu+\varepsilon_t,\quad \varepsilon_t=\sigma_t z_t
\]

Trong đó \(\mu\) là mean return ước lượng, \(\varepsilon_t\) là innovation/residual, \(\sigma_t\) là conditional standard deviation, và \(z_t\) là cú sốc đã chuẩn hóa có kỳ vọng 0 và phương sai 1.

Nếu returns có tự tương quan trong mean, chỉ fit variance equation có thể chưa đủ. Hãy kiểm tra Phase 3 ACF/PACF và standardized residual diagnostics; mô hình mean ARMA + GARCH là phần mở rộng sau, chưa có ở Phase 4 này.

## 3. Innovation distribution

### Gaussian / Normal

Giả định \(z_t\sim N(0,1)\). Đây là lựa chọn đơn giản, nhưng đuôi phân phối chuẩn có thể quá mỏng đối với returns tài chính.

### Standardized Student-t

Student-t cho phép đuôi dày hơn. Engine dùng biến Student-t được chuẩn hóa để phương sai bằng 1 và ước lượng \(\nu>2\) bậc tự do:

\[
z_t=\sqrt{\frac{\nu-2}{\nu}}T_\nu
\]

Trong UI, \(\nu\) được giới hạn trong miền số của optimizer (2,05 đến 200). \(\nu\) gần 200 gần với Gaussian; \(\nu\) thấp hơn mô tả đuôi dày hơn. Điều này không tự chứng minh Student-t là phân phối thật của thị trường.

## 4. Mô hình có trong Phase 4

Ký hiệu: \(\omega\) là intercept phương sai/độ lệch chuẩn tùy model; \(\alpha\) đo phản ứng với cú sốc; \(\beta\) đo độ dai dẳng; \(\gamma\) mô tả bất đối xứng.

### 4.1 ARCH(q)

\[
h_t=\omega+\sum_{i=1}^{q}\alpha_i\varepsilon_{t-i}^2
\]

- \(\omega>0\), \(\alpha_i\ge0\).
- Chỉ dùng bình phương cú sốc quá khứ, không có lag phương sai riêng.
- UI cho q từ 1 đến 5.
- Persistence proxy là \(\sum_i\alpha_i\); điều kiện tổng dưới 1 là điều kiện dừng bậc hai đủ thường dùng.

ARCH bậc cao có thể cần nhiều tham số. GARCH thường mô tả sự dai dẳng bằng ít tham số hơn.

### 4.2 GARCH(1,1)

\[
h_t=\omega+\alpha\varepsilon_{t-1}^2+\beta h_{t-1}
\]

- \(\alpha\): phản ứng phương sai trước cú sốc mới.
- \(\beta\): phần phương sai quá khứ được duy trì.
- Với đặc tả chuẩn, điều kiện đủ thường dùng: \(\omega>0\), \(\alpha\ge0\), \(\beta\ge0\), và \(\alpha+\beta<1\).
- Persistence = \(\alpha+\beta\).

Nếu \(\alpha+\beta\) gần 1, volatility có tính dai dẳng cao và cú sốc có thể mất nhiều bar mới suy giảm. Gần 1 không đồng nghĩa mô hình dự báo tốt.

### 4.3 EGARCH(1,1)

\[
\ln h_t=\omega+\alpha(|z_{t-1}|-E|z|)+\gamma z_{t-1}+\beta\ln h_{t-1}
\]

- Mô hình log variance nên phương sai luôn dương sau phép exp.
- \(\alpha\) mô tả phản ứng với độ lớn cú sốc.
- \(\gamma\) mô tả hiệu ứng dấu. Với đúng quy ước công thức này, \(\gamma<0\) thường có nghĩa cú sốc âm làm log variance tăng hơn cú sốc dương cùng độ lớn.
- \(\beta\) mô tả persistence của log variance; cần \(|\beta|<1\) cho động học ổn định cơ bản.

Dự báo nhiều bước trong MVP dùng plug-in trên log variance. \(\exp(E[\ln h])\) không bằng chính xác \(E[h]\) do Jensen; xem forecast EGARCH như median/plug-in proxy, không phải kỳ vọng phương sai chính xác.

### 4.4 GJR-GARCH(1,1)

\[
h_t=\omega+\alpha\varepsilon_{t-1}^2+\gamma I(\varepsilon_{t-1}<0)\varepsilon_{t-1}^2+\beta h_{t-1}
\]

- \(I(\varepsilon<0)=1\) khi shock âm, bằng 0 nếu không.
- \(\gamma>0\) nghĩa cú sốc âm nhận thêm tác động lên variance so với cú sốc dương cùng độ lớn.
- Với giả định innovation đối xứng, persistence tham khảo: \(\alpha+\beta+\gamma/2\).
- Engine ràng buộc các thành phần phương sai không âm và persistence dưới 1 trong quá trình tối ưu.

### 4.5 TARCH(1,1) theo Zakoian

\[
\sigma_t=\omega+\alpha|\varepsilon_{t-1}|+\gamma I(\varepsilon_{t-1}<0)|\varepsilon_{t-1}|+\beta\sigma_{t-1}
\]

Đây là phương trình cho **conditional standard deviation** \(\sigma_t\), không phải variance \(h_t\). Điều kiện positivity gồm \(\omega>0\), \(\alpha\ge0\), \(\alpha+\gamma\ge0\), \(\beta\ge0\). Persistence kỳ vọng dùng standardized innovation:

\[
\beta+E|z|\frac{2\alpha+\gamma}{2}<1
\]

Tên gọi threshold/TGARCH có thể khác giữa các phần mềm. GJR-GARCH và TARCH theo Zakoian là hai phương trình khác nhau; Phase 4 triển khai chúng thành hai lựa chọn riêng.

## 5. Ước lượng

Engine tối thiểu hóa negative conditional log-likelihood bằng optimizer Nelder–Mead. Gaussian dùng Gaussian conditional likelihood (QMLE khi Normal là giả định xấp xỉ); Student-t dùng standardized t likelihood.

Gaussian negative log-likelihood:

\[
-\ell=\frac12\sum_t\left[\ln(2\pi)+\ln h_t+\frac{\varepsilon_t^2}{h_t}\right]
\]

Student-t standardized likelihood dùng \(\nu>2\):

\[
\ell=\sum_t\left[\ln\frac{\Gamma((\nu+1)/2)}{\sqrt{\pi(\nu-2)}\Gamma(\nu/2)}-\frac12\ln h_t-\frac{\nu+1}{2}\ln\left(1+\frac{\varepsilon_t^2}{h_t(\nu-2)}\right)\right]
\]

Optimizer dùng biến đổi tham số để duy trì miền hợp lệ: omega dương ở ARCH/GARCH/GJR/TARCH; alpha/beta không âm ở các mô hình variance tiêu chuẩn; persistence dưới 1; EGARCH dùng beta bị chặn về trị tuyệt đối dưới 1. Việc optimizer hội tụ chỉ nói rằng tiêu chí dừng số đã đạt; không chứng minh mô hình đúng.

Engine chưa tính Hessian/covariance matrix của ước lượng, nên UI không cung cấp standard error, z/t-statistic hay confidence interval cho tham số.

## 6. Điều khiển giao diện

| Điều khiển | Cách dùng |
|---|---|
| PRICE SERIES | Chọn cột giá dương. Close thường là lựa chọn tự nhiên khi nghiên cứu returns. |
| MODEL | ARCH(q), GARCH(1,1), EGARCH(1,1), GJR-GARCH(1,1), TARCH(1,1). |
| INNOVATION DISTRIBUTION | Gaussian hoặc standardized Student-t. |
| ARCH ORDER q | Chỉ áp dụng ARCH; q từ 1 đến 5. |
| FORECAST STEPS | Số bar dự báo volatility, từ 1 đến 100. |
| ANNUALIZATION FACTOR | Số bar trong một năm dùng quy đổi: annualized volatility = per-bar volatility × căn bậc hai của factor. Phải điều chỉnh theo lịch phiên/tần suất dữ liệu. |
| Estimate Volatility Model | Ước lượng và hiển thị kết quả. |
| Export Phase 4 CSV | Xuất thông số mô hình và forecast. |

Engine cần ít nhất 100 returns và khuyến nghị 500–1.000 trở lên. Browser MVP giới hạn 30.000 returns mỗi lần fit.

## 7. Đọc kết quả

- **Conditional volatility (%/bar):** độ lệch chuẩn có điều kiện theo từng bar, không phải biên độ High–Low.
- **Annualized volatility:** quy đổi theo annualization factor người dùng nhập; không có ý nghĩa nếu factor không phù hợp lịch giao dịch.
- **Persistence:** mức độ dai dẳng theo đặc tả. GARCH = alpha + beta; GJR = alpha + beta + gamma/2 (đối xứng); ARCH = tổng alpha; TARCH = kỳ vọng persistence của sigma; EGARCH = beta của log variance.
- **Half-life:** \(\ln(0.5)/\ln(persistence)\) bars khi persistence nằm giữa 0 và 1. Đây là cách diễn giải giảm một nửa của thành phần dai dẳng, không phải thời gian giá quay về mean.
- **Long-run volatility:** ARCH/GARCH/GJR dùng căn bậc hai của unconditional variance theo đặc tả đối xứng; TARCH-Zakoian hiển thị mean long-run conditional standard deviation theo phương trình sigma; EGARCH chỉ hiển thị median/plug-in proxy `exp(E[log h]/2)`, không gọi là unconditional standard deviation chính xác.
- **Log likelihood, AIC, BIC:** dùng để so sánh các model fit trên cùng một biến, cùng mẫu, cùng quy ước phân phối và sample window. Không chọn mô hình chỉ vì AIC thấp khi các mẫu/điều kiện khác nhau.
- **Ljung–Box standardized residual:** kiểm tra tự tương quan còn lại trong residual đã chuẩn hóa. p nhỏ gợi ý phương trình mean/độ trễ chưa đủ.
- **ARCH LM on standardized residual²:** kiểm tra còn ARCH-effect trong bình phương standardized residual. p nhỏ gợi ý variance equation có thể chưa hấp thụ hết volatility clustering.

## 8. Forecast

Forecast Phase 4 là forecast conditional variance/volatility. Mean return forecast trong phiên bản này chỉ là mean hằng số đã ước lượng. Không có forecast hướng tăng/giảm giá hoặc confidence interval của giá.

GARCH/GJR/ARCH multi-step forecast thay các shock chưa biết bằng kỳ vọng có điều kiện. TARCH-Zakoian dùng plug-in của kỳ vọng conditional standard deviation; bình phương kỳ vọng không bằng chính xác kỳ vọng variance. EGARCH multi-step forecast dùng log-variance plug-in và chịu Jensen bias. Cột annualized volatility của forecast sử dụng đúng annualization factor do người dùng chọn. Các đường forecast không được xem là xác suất bảo đảm hay mức stop-loss tự động.

## 9. Quy trình nghiên cứu đề xuất

1. Data Center: xác nhận timestamp, timezone, thứ tự, duplicate, gaps và tần suất bar.
2. Phase 1: kiểm tra log return distribution, skewness, kurtosis và quantiles.
3. Phase 3: kiểm tra ACF của returns; nếu mean còn tự tương quan, ghi nhận hạn chế mean-equation constant của Phase 4.
4. So sánh ACF returns với ACF absolute returns/squared returns. Nếu returns ít tự tương quan nhưng |r|/r² còn tự tương quan, đó là bằng chứng thực nghiệm để thử volatility models.
5. Fit một số cấu trúc có lý do: GARCH(1,1) làm benchmark, sau đó thử Student-t, EGARCH/GJR/TARCH khi có giả thuyết bất đối xứng.
6. Kiểm tra optimizer, standardized-residual Ljung–Box, ARCH LM, persistence và dấu leverage.
7. Đánh giá ngoài mẫu/walk-forward; so sánh với baseline biến động đơn giản. Không dùng AIC in-sample thay cho validation.
8. Trước ứng dụng trading, tính spread, commission, slippage, execution latency và kiểm tra nhiều regime.

## 10. Giới hạn đã biết

- Browser-side implementation; không có Python service/backend hoặc persistent database.
- Constant mean only; chưa tích hợp ARMA-in-mean + GARCH.
- Nelder–Mead và conditional likelihood là MVP; chưa tính parameter standard errors/Hessian.
- GARCH(1,1) Gaussian đã được cross-check một fixture mô phỏng có seed với tối ưu SciPy/SLSQP độc lập; chưa cross-check tất cả model/distribution với `arch`/`rugarch` hoặc dataset thị trường độc lập. Cần benchmark trước khi dùng nghiên cứu chính thức.
- Student-t innovations là symmetric; chưa có skewed-t, GED hoặc distribution tùy biến.
- GJR persistence dùng giả định symmetry; TARCH dùng E|z| theo distribution được chọn.
- EGARCH multi-step forecast là plug-in approximation, không exact conditional expectation; `exp(E[log h])` là median proxy do Jensen inequality. TARCH multi-step dùng plug-in trên expected sigma, không phải exact expected variance.
- Timestamp gaps/session calendar không được tự điều chỉnh.
- Không có VaR/ES, stress test, model comparison automation hoặc volatility regime detection trong Phase 4.
- Một mô hình volatility không dự báo hướng thị trường và không phải chiến lược giao dịch.

## 11. Tài liệu công thức tham khảo

- MathWorks, *Maximum Likelihood Estimation for Conditional Variance Models*: Gaussian và standardized Student-t likelihood, mô hình conditional variance.
- MathWorks, *Specify EGARCH Models*: log variance, standardized innovation và Jensen inequality trong forecast.
- EViews, *Additional ARCH Models*: GJR/TARCH threshold specifications.
- `arch` Python package documentation: reference implementation ecosystem cho ARCH-family models.

Các tài liệu trên là nguồn tham khảo công thức; chúng không có nghĩa engine browser MVP này đã được đối chiếu hoàn chỉnh với những package đó.
