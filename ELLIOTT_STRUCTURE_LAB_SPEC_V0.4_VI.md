# Gexadecimal Elliott Structure Lab v0.4 — Đặc tả triển khai

**Release:** 0.4.0 · **Ngày:** 05-11-2026  
**Vị trí:** Sidebar riêng `Elliott Wave` → `Structure Lab`  
**Tính chất:** Research / candidate detection / manual validation; không phải hệ thống giao dịch tự động.

## 1. Mục tiêu và nguyên tắc

Structure Lab chuyển nội dung trong bộ tài liệu Elliott người dùng cung cấp thành taxonomy, cấu trúc hình học, rule, guideline, Fibonacci, điều kiện xác nhận/vô hiệu hóa và quy trình kiểm thử.

Nguyên tắc cốt lõi:

1. Hard rule được đánh giá trước evidence score. Vi phạm hard rule không thể được bù bằng điểm Fibonacci hoặc volume.
2. Guideline chỉ xếp hạng/giải thích, không tự biến thành luật cứng.
3. Giữ Preferred Count, Alternate Counts và No Clear Count; không ép phải có nhãn sóng.
4. Không dùng dữ liệu tương lai để dựng count tại một mốc As-of.
5. Degree là quan hệ lồng nhau giữa các interval; không ánh xạ cứng một timeframe thành một degree Elliott.
6. Candidate hình học không đồng nghĩa count đã chứng minh internal grammar.

## 2. Phân tách giao diện

- Sidebar có nút riêng **Elliott Wave** trong nhóm **STRUCTURE WORKSPACE**.
- View `v-elliott` nằm ngoài `v-quant`; Quant Lab giữ nguyên panel và luồng làm việc riêng.
- Mọi file Elliott được quản lý riêng: `js/elliott-structure-engine.js`, `js/elliott-structure-ui.js`, `css/elliott-structure.css`.
- Engine chỉ nhận OHLC chuẩn hóa và trả dữ liệu; UI chịu trách nhiệm chart overlay, candidate list, manual pivot, audit và snapshot.

## 3. Input và bảo vệ dữ liệu

Hỗ trợ Chart timeframe, M1, synthetic DEMO, CSV OHLC. CSV cần `Time, Open, High, Low, Close`; Volume tùy chọn.

Data gate kiểm tra:

- Timestamp hữu hạn và tăng nghiêm ngặt; timestamp trùng hoặc ngược thứ tự bị từ chối.
- High phải bao trùm Open/Close; Low phải bao trùm Open/Close; High ≥ Low.
- Volume hữu hạn, không âm.
- Không âm thầm sort, drop, fill hoặc tạo nến thay người dùng.

## 4. Pivot / swing / degree engine

- True Range và Wilder ATR.
- Directional Change (DC) dùng ATR threshold để xác nhận pivot sau khi giá đảo chiều đủ ngưỡng.
- Lưu `extreme time` riêng với `confirmation time`; pivot không được coi là đã biết trước lúc xác nhận.
- Bốn threshold scales tạo các pivot set đa cấp; scale persistence đo mức đồng thuận giữa các threshold.
- Parent-child hierarchy dựa trên interval lồng nhau; các swing có amplitude, duration, slope và ATR-normalized amplitude.

## 5. Pattern catalogue và trạng thái phát hiện

| Nhóm | Các candidate | Mức xử lý trong v0.4 | Lưu ý |
|---|---|---|---|
| Motive | Impulse | Candidate engine | Hard rules W2/W3/W4/W5; internal 5-3-5-3-5 còn cần child grammar |
| Motive variant | Extended Impulse | Assisted | Dựa trên nested lower-scale swing proxy; chưa xác minh 9/13/17 grammar |
| Motive variant | Truncated / Failed Fifth | Candidate engine | W5 không vượt W3 giữ provisional nếu internal five chưa xác minh |
| Motive developing | Impulse đến hết W4 | Candidate engine | W5 targets chỉ là projection có điều kiện |
| Diagonal | Contracting / Expanding Diagonal Candidate | Assisted/context-aware | W4 overlap được phép; parent position quyết định Leading/Ending |
| Correction | Zigzag | Candidate engine | A-B-C geometry, B không vượt origin A; 5-3-5 cần lower degree |
| Correction | Regular / Expanded / Running Flat | Candidate engine | 3-3-5; subtype theo vị trí B và C; Running Flat là hiếm |
| Correction | Contracting Triangle | Candidate engine | A-B-C-D-E geometry; 3-3-3-3-3 chưa tự động chứng minh |
| Correction | Barrier Triangle | Assisted geometric subtype | Biên trên hoặc dưới gần ngang và biên đối diện co lại |
| Correction | Expanding Triangle | Candidate engine | Rare; cần xác nhận cấu trúc con để tránh nhầm volatility noise |
| Combination | Double/Triple Zigzag | Assisted | Ghép corrective components và connector đúng hướng, exact join |
| Combination | Double/Triple Three | Assisted | Ghép corrective components W-X-Y(-X-Z), không gộp thành một Zigzag |

### 5.1 Impulse rules

Với hướng tăng:

- W2 không xuyên xuống dưới điểm bắt đầu W1.
- W3 phải vượt đầu W1 theo hướng motive.
- Khi W5 hoàn tất, W3 không được là sóng ngắn nhất trong W1/W3/W5.
- W4 không đi vào price territory W1 trong profile Impulse chuẩn.
- W5 thông thường vượt extremum W3; nếu không vượt thì chỉ là giả thuyết Truncated Fifth và cần cấu trúc con xác nhận.

Với hướng giảm, điều kiện được đảo dấu tương ứng. Exact touch tại ranh giới được chấp nhận; vượt qua ranh giới vẫn bị fail. Diagonal không kế thừa quy tắc no-overlap của Impulse.

### 5.2 Corrective rules

- Zigzag: B không vượt origin A; B/A và C/A là guideline Fibonacci.
- Flat: B retrace tối thiểu khoảng 90% A theo classifier baseline; Regular/Expanded/Running phân biệt bằng quan hệ B với origin A và C với end A. Internal 3-3-5 là điều kiện phải xác nhận ở degree nhỏ hơn.
- Triangle: 5 legs A-E. Contracting, barrier và expanding được phân biệt theo biên high/low. Triangle shape không chứng minh 5 nhịp corrective three.

### 5.3 Diagonal roles

- Geometry có thể là wedge contracting hoặc expanding; W4 overlap được phép.
- Nếu parent context là Wave 1/A, engine lưu `leading_diagonal` role evidence.
- Nếu parent context là Wave 5/C, engine lưu `ending_diagonal` role evidence.
- Default canonical internal grammar: Leading 5-3-5-3-5; Ending 3-3-3-3-3. Các tài liệu/biến thể khác nhau được giữ dưới dạng profile/variant, không tự trộn.

### 5.4 Combinations

- Double Three / Double Zigzag: W-X-Y.
- Triple Three / Triple Zigzag: W-X-Y-X-Z.
- Các component phải nối tại cùng pivot index; X đảo hướng với W, Y cùng hướng với W; X2 đảo hướng với Y; Z cùng hướng với W.
- Độ phù hợp component vẫn cần lower-degree grammar; thuật toán ghép là assisted search, chưa phải full grammar parser.

## 6. Recursive grammar và manual count

- Child candidate phải khớp khoảng thời gian của leg cha trong tolerance, có hướng trùng leg và thuộc motive/corrective class đúng với grammar.
- Kết quả `matched` chỉ chứng minh tìm được candidate con phù hợp; nó chưa chứng minh child candidate đó có internal grammar hoàn chỉnh.
- `verified` chỉ được dùng khi child grammar cũng được verified đệ quy. Pivot swing count đơn thuần luôn là proxy.
- Manual Count Builder hỗ trợ add, drag/move, delete, lock/unlock, label, degree và parent degree.
- Manual audit chạy lại theo sequence. Với ABC, phải có pivot origin (0-A-B-C) để đánh giá rule B; A-B-C không có origin chỉ trả REVIEW.
- Parent degree phải lớn hơn child degree theo convention Degree 1 nhỏ nhất → Degree 4 cao hơn.

## 7. Evidence / Fibonacci / channel

- Evidence Score là tổng hợp heuristic theo evidence families; không phải probability, confidence, win rate hoặc expected return.
- Fibonacci ratios được chia nhóm guideline theo nguồn, không dùng một ratio để phân loại pattern.
- Developing Wave 5: W5 projection từ W1, net W1-W3, W2 retracement, W3 extension, W4 retracement.
- Completed Impulse / Zigzag / Flat: hiển thị observed ratios, không đánh nhãn đó là forward target.
- Triangle: observed leg ratios; post-triangle thrust chỉ là conditional theo breakout, dùng widest width.
- Impulse channel là guideline hình học; không phải luật cứng.

## 8. Historical As-of, Replay và scenario lifecycle

- As-of bars được cắt trước pivot/candidate detection.
- Replay Cursor chỉ dùng M1 bars đang được Replay expose tại thời điểm cursor.
- Snapshot lưu candidate + source + As-of; later bars chỉ dùng để cập nhật trạng thái active/invalidated.
- Lifecycle chỉ quét `bar.time > snapshot.asOfTime`.
- Dataset identity chứa source, symbol, timeframe, bar interval, độ dài và hash OHLC để không tái dùng manual pivot/snapshot trên feed khác.

## 9. Kiểm thử

`tests/elliott-structure-v04.test.js` kiểm tra: exact-boundary impulse rules; barrier triangles hai biên; expanding diagonal; Fibonacci observed/projection semantics; manual ABC origin; exact WXY join; recursive matched-vs-verified; parent-context Leading/Ending role; grammar 5-3-5-3-5 vs 3-3-3-3-3; As-of no-lookahead; scenario lifecycle.

`bash tests/run-all.sh` chạy tất cả test files trong QuantLab và các module liên quan.

## 10. Giới hạn còn lại

- Chưa có full recursive grammar parser/DP trên toàn bộ parse tree; chưa có globally optimal K-best search.
- Manual Count Builder hỗ trợ pivot và label, nhưng chưa phải giao diện chỉnh sửa parse tree đầy đủ theo từng subwave/component.
- Leading/Ending Diagonal có contextual role evidence nhưng chưa tự động chốt mọi variant theo từng tác giả.
- Extended Impulse là assisted candidate dựa trên lower-scale segmentation proxy.
- Chưa có expert-labelled benchmark, inter-annotator agreement, out-of-sample/walk-forward count validation hoặc Bayesian/probability calibration.
- Không có kiểm định lợi nhuận; không phát tín hiệu giao dịch.
- Browser UAT trên Safari/iOS và benchmark thiết bị cấu hình thấp cần được kiểm tra ở môi trường triển khai.

**Kết luận:** v0.4 là một advanced assisted Elliott Structure Lab, mở rộng đáng kể khả năng phát hiện và audit; nó không thay thế chuyên gia đếm sóng và không nên được hiểu là Elliott auto-count oracle.
