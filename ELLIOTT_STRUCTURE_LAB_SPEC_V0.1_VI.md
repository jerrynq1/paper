# Gexadecimal Elliott Structure Lab — Đặc tả triển khai v0.1

**Ngày:** 05-11-2026  
**Phạm vi:** QuantLab Phase 5 extension — Elliott Structure Lab MVP  
**Trạng thái:** Đã tích hợp engine + UI nghiên cứu độc lập; chưa phải automated trading signal. Bản build đã bổ sung candidate de-duplication, alternate-count interval matching và test đối xứng bullish/bearish.

## 1. Mục tiêu sản phẩm

Structure Lab chuyển kiến thức Elliott Wave thành một hệ thống phân tích có thể kiểm tra và giải thích. Sản phẩm không có mục tiêu “đoán đúng sóng” bằng một nhãn duy nhất. Nó phải:

1. Nhận diện các swing/pivot có ý nghĩa trên nhiều thang biến động.
2. Tạo các cấu trúc Elliott ứng viên từ những pivot đã xác nhận.
3. Loại ứng viên vi phạm hard rules của pattern tương ứng.
4. Tách riêng hard rules, guidelines và phần chưa thể xác minh.
5. Giữ nhiều candidate/alternate count thay vì ép một kết luận.
6. Tạo Fibonacci projection và channel projection có điều kiện.
7. Lưu dấu vết để người dùng biết vì sao một count được xếp hạng cao hơn.
8. Không tự biến Evidence Score thành xác suất hoặc tín hiệu mua/bán.

## 2. Phạm vi v0.1

### 2.1 Đã triển khai

- Nhận dữ liệu OHLCV từ Chart timeframe hiện tại, Chart M1, dữ liệu DEMO tổng hợp hoặc CSV OHLC.
- Kiểm tra dữ liệu tối thiểu, timestamp tăng nghiêm ngặt, tính hợp lệ của High/Low/Open/Close.
- Wilder ATR.
- Close-confirmed ATR-normalized Directional Change pivots.
- Multi-scale pivots với threshold factors mặc định `0.70, 1.00, 1.45, 2.05` nhân với ATR threshold cơ sở.
- Pivot persistence theo sự lặp lại của cùng loại pivot ở các scale gần nhau.
- Liên kết pivot nhỏ vào khoảng giữa hai pivot của primary degree dưới dạng parent-leg proxy.
- Candidate geometry cho Impulse, Impulse Wave 5 developing, Truncated Fifth, Zigzag, Regular/Expanded/Running Flat, Contracting/Expanding Triangle và Diagonal Candidate.
- Hard-rule filtering, guideline evidence scoring, scale agreement.
- Fibonacci projection cho Wave 5 developing và Wave C của Zigzag/Flat.
- Parallel channel projection cho Impulse hoàn chỉnh/developing.
- Structural invalidation levels cho developing Impulse.
- Candidate list, rule audit, guideline evidence, scale summary, pivot audit và JSON export.
- De-duplicate candidate cùng pattern/direction có vùng thời gian chồng lấn quá lớn; vẫn giữ các pattern khác nhau trên cùng nhịp để làm giả thuyết thay thế.
- `alternates` chỉ gồm cách đếm có điểm đầu/cuối gần Preferred Count; candidate ở vùng giá khác vẫn nằm trong thư viện candidates, không bị gọi nhầm là alternate cùng cấu trúc.
- Engine thuần JavaScript không phụ thuộc DOM; Node.js unit tests.

### 2.2 Chưa triển khai tự động trong v0.1

- Double Three `W-X-Y` và Triple Three `W-X-Y-X-Z`.
- Tự xác định Leading Diagonal hay Ending Diagonal theo vị trí trong chu kỳ lớn hơn. V0.1 chỉ phát ra `Diagonal Candidate` và các role có thể có.
- Phân loại đầy đủ các biến thể Triangle như Barrier, Running và các cấu trúc có E-wave overshoot/undershoot.
- Xác minh recursive internal count `5-3-5-3-5`, `5-3-5`, `3-3-5`, `3-3-3-3-3` bằng cấu trúc con đã được xác định độc lập. Swing nhỏ chỉ là proxy, không phải bằng chứng đủ.
- Manual count builder/drag label trên chart giao dịch chính.
- Fibonacci Pinball, Previous Fourth Wave zones, time relationships đầy đủ.
- Orderflow, CVD, Footprint, TPO, GEX integration.
- Automated C-Wave entry/exit playbooks.
- Calibrated statistical probability, ML classification hoặc giao dịch tự động.

## 3. Kiến trúc

```text
OHLCV Source
  ├─ Chart timeframe / M1
  ├─ CSV import
  └─ Synthetic demo
        ↓
Data Validation & Normalization
        ↓
Wilder ATR
        ↓
ATR-normalized Directional Change
        ↓
Multi-scale Pivot Layers
        ├─ Fine pivots
        ├─ Primary pivots
        └─ Coarse pivots
        ↓
Pattern Candidate Enumeration
        ├─ Impulse / Developing Impulse / Truncated Fifth
        ├─ Zigzag / Flat subtypes
        ├─ Triangle candidates
        └─ Diagonal candidate
        ↓
Hard-rule Constraint Filter
        ↓
Guideline Evidence Scoring + Scale Agreement
        ↓
Preferred Candidate + Alternate Candidates
        ├─ Fibonacci projection
        ├─ Channel projection
        ├─ Structural invalidation
        └─ Rule / Guideline audit
        ↓
Structure Lab UI (isolated research canvas)
```

### 3.1 Module boundaries

- `js/elliott-structure-engine.js`: pure computation, UMD export `ElliottStructure`; no DOM, chart renderer or network dependency.
- `js/elliott-structure-ui.js`: data source adapter, controls, tables, research canvas, export JSON.
- `css/elliott-structure.css`: scoped styles prefixed `e-`.
- `index.html`: one Structure Lab panel inside Quant Lab and script/style loading.
- `tests/elliott-structure.test.js`: deterministic test fixtures for engine behavior.

Engine does not mutate `chart`, `cs`, `agg`, `m1`, Footprint, Options, TPO or Replay. Chart data is read-only. The research plot is an independent canvas to reduce regression risk.

## 4. Thuật toán phát hiện pivot

### 4.1 Wilder ATR

True Range:

\[
TR_t=\max(H_t-L_t, |H_t-C_{t-1}|, |L_t-C_{t-1}|)
\]

Wilder smoothing:

\[
ATR_t=\frac{(n-1)ATR_{t-1}+TR_t}{n}
\]

ATR dùng làm chuẩn hóa biến động, không phải hướng xu hướng.

### 4.2 Directional Change

Ngưỡng đảo chiều tại pivot ứng viên:

\[
\theta_i=\max(\text{minMove}, ATR_i\times k, |P_i|\times p)
\]

Trong đó `k` là ATR multiplier và `p` là percent threshold tùy chọn. V0.1 mặc định `p=0`, `minMove=0`.

- Khi đang tăng, giữ close cao nhất đã quan sát. Chỉ xác nhận pivot High khi một close sau đó giảm khỏi close cực trị ít nhất `theta`.
- Khi đang giảm, giữ close thấp nhất đã quan sát. Chỉ xác nhận pivot Low khi một close sau đó tăng khỏi close cực trị ít nhất `theta`.
- `pivot.index/time` là thời điểm cực trị; `confirmationIndex/time` là thời điểm hệ thống thực sự có đủ dữ liệu để xác nhận pivot.
- Điểm cực trị cuối cùng chưa có reversal đủ ngưỡng chỉ xuất hiện trong `active` (unconfirmed) và không được dùng để tạo count.

**Trade-off:** v0.1 dùng close-confirmed pivot để ưu tiên tính nhân quả và xác định thời điểm xác nhận rõ ràng. Nó bảo thủ hơn wick-based pivot. Không được trộn pivot close-confirmed với pivot lấy High/Low mà không đánh dấu nguồn.

### 4.3 Multi-scale

Cùng một chuỗi OHLC được xử lý với nhiều threshold. Scale thấp hơn thường tạo nhiều pivot hơn; scale cao hơn loại nhiễu nhỏ hơn. Một pivot có `scalePersistence` cao nếu loại và thời điểm pivot đó lặp lại ở nhiều scale gần nhau.

`scalePersistence` và `scaleAgreement` là thước đo ổn định khi đổi tham số, không phải xác suất đúng.

`parentLegs` hiện gắn pivot ở fine scale vào khoảng giữa hai pivot primary. Đây là liên kết hình học ban đầu, chưa phải một Elliott Degree được chứng minh bằng recursive grammar. Candidate deduplication chỉ loại các sliding windows gần trùng nhau của cùng pattern và cùng hướng; khác pattern trên cùng khu vực vẫn được giữ để so sánh.

## 5. Pattern rules và giới hạn nhận diện

| Pattern | Hard rules / điều kiện hình học trong v0.1 | Guidelines được chấm | Giới hạn |
|---|---|---|---|
| Impulse | Wave 2 không vượt origin Wave 1; Wave 3 vượt end Wave 1; Wave 3 không ngắn nhất trong 1/3/5; Wave 4 không overlap vùng Wave 1 | Alternation; Fibonacci W2/W3/W4/W5; cross-scale agreement | Nội bộ 5-3-5-3-5 chưa được xác minh đầy đủ |
| Truncated Fifth | Các kiểm tra Wave 2/3/4; Wave 5 không vượt Wave 3 được ghi `unverified`, không giả vờ là impulse thông thường | Wave 3 extension; Fibonacci | Hiếm; cần momentum/context và mẫu dữ liệu được gắn nhãn |
| Impulse · W5 developing | Kiểm tra W2, W3, W4; kiểm tra W3 not-shortest là `unverified` vì W5 chưa hình thành | Fibonacci W2/W3/W4; alternation tạm thời | Không được kết luận rule W3 non-shortest trước khi W5 xuất hiện |
| Zigzag | B không vượt origin A | B retracement; C/A ratio | Internal 5-3-5 chưa xác minh |
| Regular Flat | B retrace >= 90% A; B gần origin A; C vượt end A | B/A và C/A | Vùng “near origin” là heuristic subtype threshold, sẽ cần calibration |
| Expanded Flat | B vượt origin A; C vượt end A; B/A >= 90% | B/A, C/A | Internal 3-3-5 chưa xác minh |
| Running Flat | B vượt origin A; C không vượt end A; B/A >= 90% | B/A, C/A | Hiếm; không nên xếp hạng cao chỉ bằng hình học |
| Contracting Triangle | 3 highs giảm dần và 3 lows tăng dần | Leg size, time balance | Internal A-E dạng 3 chưa xác minh; E overshoot chưa xử lý |
| Expanding Triangle | 3 highs tăng dần và 3 lows giảm dần | Leg size, time balance | Cần bộ test/benchmark riêng vì pattern hiếm |
| Diagonal Candidate | Wave 4 overlap Wave 1; hình học nêm được chấm | Co hẹp biên độ, độ dài leg | Chưa biết Leading/Ending; internal grammar còn phụ thuộc tác giả/variant |
| Double Three W-X-Y | Definition only | — | Chưa tự động phát hiện |
| Triple Three W-X-Y-X-Z | Definition only | — | Chưa tự động phát hiện |

**Lưu ý quy tắc:** Impulse overlap rule không được áp dụng cho Diagonal. Fibonacci, alternation, channeling và wave personality là guidelines, không phải hard rules. Running Flat/Truncated Fifth cần được gắn cờ hiếm và không được giả định là cấu trúc mặc định.

## 6. Candidate scoring

Mỗi guideline được chuẩn hóa về `[0,1]` và kết hợp bằng trung bình có trọng số:

\[
EvidenceScore=100\times\frac{\sum_j w_j s_j}{\sum_j w_j}
\]

`EvidenceScore` chỉ là heuristic ranking. Các score chưa được fit/calibrate trên tập nhãn expert và chưa được đánh giá calibration/Brier score/reliability curve. Vì vậy UI không gọi nó là Probability, Confidence of success hoặc Win rate. Trước khi chọn candidate, engine loại các hard-rule violation; sau khi xếp hạng, engine làm đa dạng danh sách để tránh một chuỗi sliding windows gần như giống nhau chiếm hết bảng. `alternates` chỉ khớp các candidate có điểm đầu/cuối gần Preferred Count, không lấy một mô hình ở đoạn giá khác làm alternate cùng cấu trúc.

Hard-rule violation loại candidate khỏi bảng kết quả; guideline yếu chỉ làm giảm rank. Các trạng thái:

- `rules-passed`: các rule được kiểm tra đều pass và không còn internal uncertainty được khai báo.
- `provisional`: còn rule unverified hoặc internal count chưa chứng minh.
- `rejected`: có hard-rule failure; candidate bị loại khỏi kết quả được hiển thị.
- `No Clear Count`: không có candidate đủ điều kiện; đây là kết quả hợp lệ.

## 7. Fibonacci và Channel

### 7.1 Fibonacci

- Wave 5 developing: chiếu từ điểm cuối Wave 4 theo `0.618`, `1.0`, `1.618 × Wave 1`; nếu Wave 3 đã extended, hiển thị thêm phép chiếu net Wave 1–3 × 0.618.
- Zigzag/Flat: chiếu Wave C từ điểm cuối B theo `0.618`, `1.0`, `1.618 × Wave A`.

Các tỷ lệ trên được dùng làm vùng tham khảo/score guideline. Chưa triển khai cluster confluence nhiều degree hay Fibonacci Pinball trong v0.1.

### 7.2 Impulse Channel

Dựng đường cơ sở qua pivot Wave 2 và Wave 4, sau đó dịch song song qua pivot Wave 3. Với Wave 5 đang phát triển, chiếu channel thêm một khoảng thời gian tham chiếu lấy từ thời lượng Wave 1 và Wave 3; với impulse hoàn chỉnh, so sánh tại pivot Wave 5 thực tế.

Channel chỉ là guideline. Nếu pivot thay đổi sau dữ liệu mới, channel có thể được cập nhật; không được dùng channel được dựng từ dữ liệu tương lai làm tín hiệu quá khứ.

## 8. Invalidation và event time

Đối với Impulse đang phát triển, v0.1 hiển thị:

- Wave 1 overlap boundary: nếu giá vượt vào vùng overlap, phải xem xét lại giả thuyết Impulse tiêu chuẩn (có thể là Diagonal hoặc cấu trúc khác).
- Wave 1 origin: phá origin làm count bullish/bearish đang xét mất hiệu lực.

Các mức này là điều kiện cấu trúc, **không phải lệnh Stop Loss**.

Mỗi pivot mang `confirmationIndex` và `confirmationTime`. Trong replay/backtest, một count chỉ được coi là đã biết tại thời điểm mọi pivot thành phần đã được xác nhận. Không được dùng `pivot.time` thay cho `confirmationTime` khi kiểm tra tín hiệu lịch sử. Việc chạy phân tích trên toàn bộ lịch sử rồi gắn tín hiệu trở lại thời điểm pivot sẽ tạo look-ahead bias.

## 9. Dữ liệu và tích hợp QuantLab

- Chart timeframe hiện tại lấy từ `agg`.
- Chart M1 lấy từ `m1`.
- Replay phân tích phần dữ liệu đang hiển thị tại thời điểm Replay; không truy cập phần tương lai trong `RP.fut`.
- CSV phải có cột `Time, Open, High, Low, Close`; Volume tùy chọn.
- Browser v0.1 giới hạn 30.000 nến mỗi lần phân tích.
- Nguồn dữ liệu hiển thị trong UI để tránh nhầm tick/CFD data với centralized futures tape.

Module được nạp sau `quant-lab.js`. Nó chỉ đọc Chart data và phát event `gx:elliott:analysis` với summary. Không gọi `setData`, `update`, `setMarkers` hoặc sửa series chart gốc.

## 10. Nguồn kiến thức đã đối chiếu

Nguồn được nhóm theo nội dung để tạo code logic; tên sách/tài liệu được giữ nguyên trong workbook Knowledge-to-Code Matrix:

- *Elliott Wave Principle* / tài liệu Frost–Prechter: nguyên lý motive/corrective, ba hard rules, degree, alternation, channels, alternate counts.
- *Mastering Elliott Wave Principle* — Constance Brown: swing/pivot, cách gom swing, phân cấp và cách tránh gắn nhãn mọi dao động nhỏ thành Elliott Wave.
- *Elliott Waves: A Comprehensive Course on the Wave Principle* và *Elliott Wave Basics*: cấu trúc pattern, internal counts, Fibonacci và channel.
- *Practical Elliott Wave Trading Strategies* — Robert Miner: bối cảnh giao dịch, xác nhận, invalidation và quản lý setup.
- *The Best of Trader’s Classroom* — Jeffrey Kennedy: quá trình chuẩn bị, xác nhận và thực thi; playbook là lớp sau Structure Lab.
- Tài liệu Myles Wilson Walker về C-Wave/high-profit Elliott Wave trades: C-Wave setup và alternate count; được ghi nhận cho phase Trading Playbooks, chưa biến thành entry tự động ở v0.1.
- Elliott Wave Notes, slide tiếng Việt Bài 1–5 và tài liệu TraderViet: đối chiếu impulse, diagonal, zigzag, flat, triangle, WXY/WXYXZ, truncated fifth và các biến thể.

Một vài biến thể và guideline có cách diễn giải khác nhau giữa tác giả. V0.1 áp dụng định nghĩa kinh điển thận trọng làm mặc định, ghi rõ phần chưa xác minh và không hợp thức hóa biến thể bằng cách nới hard rules ngầm.

## 11. Kiểm thử

`node tests/elliott-structure.test.js` chạy 10 nhóm kiểm thử của engine, bao gồm:

1. OHLC normalization, timestamp ordering, object timestamp alias, candle integrity và volume validation.
2. Wilder ATR và causal close-confirmed Directional Change.
3. Multi-scale pivots, persistence và parent-leg hierarchy.
4. Impulse hard rules đối xứng bullish/bearish và internal-count uncertainty.
5. Zigzag B-wave rule hai hướng.
6. Regular / Expanded / Running Flat geometry hai hướng.
7. Contracting / Expanding Triangle geometry.
8. Diagonal overlap và role ambiguity.
9. Developing Wave 5 Fibonacci, invalidation, channel, candidate diversity và alternate matching.
10. End-to-end analysis và Evidence Score semantics.

Toàn bộ 21 file test hiện có trong QuantLab đã chạy qua trong lần regression cuối; toàn bộ `js/*.js` cũng vượt `node --check`. Có thể chạy lại bằng `bash tests/run-all.sh`. Unit tests không thay thế kiểm chứng trên dữ liệu broker thật và bộ Elliott counts được chuyên gia gắn nhãn.

## 12. Roadmap

### v0.2 — Manual / Assisted Count

- Manual pivot editing và wave labels trong research canvas.
- Kéo anchor, khóa/mở pivot, đổi degree.
- Rule audit live khi thay nhãn.
- Previous Fourth Wave zone.
- Pattern-specific invalidation đầy đủ.
- Pattern grammar cho nested 3/5 internal count.

### v0.3 — Hierarchical Search

- K-best / beam search trên cây candidate thay vì chỉ sliding windows.
- Parent-child wave grammar và context-aware leading/ending diagonal.
- Double/Triple Three và triangle variants.
- Robustness profile theo threshold, timeframe và market session.

### v0.4 — Research & Confirmation

- Replay event-time count snapshots.
- Pattern outcome database và walk-forward validation.
- Footprint/CVD/TPO/GEX confirmation layer độc lập.
- So sánh hiệu quả theo symbol/timeframe/session/data source.

### Production gate

Không công bố xác suất, performance claim hoặc automated entry trước khi có tập dữ liệu được gắn nhãn, benchmark độc lập, event-time backtest không look-ahead, và cross-market out-of-sample validation.
