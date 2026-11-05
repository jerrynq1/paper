# Elliott Structure Lab v0.4 — Changelog

Ngày: 05-11-2026  
Engine: `0.4.0`

## 1. Tách workspace Elliott khỏi Quant Lab

- Elliott Wave là một view độc lập `#v-elliott`, có nút **Elliott Wave** riêng trên sidebar.
- Sidebar có nhóm **STRUCTURE WORKSPACE**, tách trực quan khỏi **RESEARCH & TOOLS / Quant Lab**.
- Engine, UI và CSS vẫn nằm trong namespace/file riêng: `elliott-structure-*`.
- Quant Lab không còn chứa hoặc render panel Elliott.

## 2. Pattern detection được bổ sung và phân loại rõ hơn

- **Impulse / Truncated Fifth / Developing Wave 5**: tiếp tục kiểm tra W2 không vượt origin W1, W3 vượt W1, W3 không ngắn nhất khi W5 hoàn tất, W4 không overlap W1; trạng thái W5 chưa vượt W3 được giữ provisional/UNKNOWN thay vì ép thành impulse chuẩn.
- **Extended Impulse candidate**: bổ sung giả thuyết riêng khi lower-scale swings cho thấy nested subdivision proxy. Cảnh báo rõ rằng 9/13/17 không phải điều kiện bắt buộc và proxy chưa thay thế parse 5/3.
- **Diagonal**: tách geometric candidate co hẹp và mở rộng; W4 overlap không bị áp nhầm hard rule của Impulse. Candidate giữ đồng thời khả năng Leading/Ending cho đến khi có parent context.
- **Contextual Diagonal**: nếu được ghép trong parent count có vị trí xác định, Wave 1/A gợi ý Leading; Wave 5/C gợi ý Ending. Engine chỉ ghi contextual evidence, không tự tuyên bố source profile đã được xác minh.
- **Triangle**: contracting, barrier (biên trên hoặc dưới gần ngang) và expanding được tách thành candidate riêng.
- **Zigzag / Regular Flat / Expanded Flat / Running Flat**: giữ rule hình học và guideline Fibonacci tách biệt.
- **Double/Triple Zigzag và Double/Triple Three**: ghép từ corrective components W-X-Y(-X-Z); mọi component phải nối chính xác bằng cùng pivot boundary. Không nối bằng sai số thời gian để tránh dựng tổ hợp từ các khoảng rời.

## 3. Manual Count Builder và degree hierarchy

- Giữ add / move / drag / delete / lock / unlock pivot; gán nhãn; gán degree và parent degree; audit lại khi nhãn/pivot thay đổi.
- Kiểm tra parent degree phải cao hơn child degree theo convention trong UI (Degree 1 nhỏ nhất, Degree 4 cao hơn).
- Chuỗi `A-B-C` thiếu origin pivot trả `REVIEW`; chỉ `0-A-B-C` mới được kiểm tra B-wave so với origin A.
- Manual pivot edits được cách ly theo source, symbol, timeframe, interval, độ dài, mốc đầu và hash OHLC; tránh tái sử dụng count thủ công khi dữ liệu đầu vào thay đổi.

## 4. Fibonacci và Replay / As-of

- Wave 5 đang phát triển: output là projection có giá, vùng ATR-width và công thức.
- Impulse / Zigzag / Flat đã hoàn tất: chỉ ghi tỷ lệ đã quan sát; không gọi tỷ lệ lịch sử là target tương lai.
- Triangle: tỷ lệ các leg là observed; thrust chỉ là conditional sau breakout và lưu độ rộng, không hiển thị như target đã xác nhận.
- As-of slice được áp dụng trước khi tìm pivot/candidate. Replay cursor phân tích phần M1 đã hiển thị; nến tương lai ẩn không tham gia tạo count.
- Scenario snapshots giữ nguyên count tại mốc As-of; các nến sau chỉ có thể thêm sự kiện invalidation, không sửa nội dung count lịch sử.
- Lifecycle chỉ xét nến có timestamp lớn hơn mốc snapshot.

## 5. Siết logic recursive grammar

- Child candidate phải khớp khoảng pivot, cùng hướng với leg cha, thuộc nhóm motive/corrective tương ứng và không có hard-rule FAIL.
- `matched` nghĩa là đã tìm được child candidate phù hợp; **không đồng nghĩa `verified`**.
- Chỉ `verified` khi child grammar cũng đã được xác minh đệ quy. Swing-count tại lower scale đơn thuần vẫn là proxy.
- Leading/Ending Diagonal sử dụng expected grammar khác nhau theo parent role trong canonical profile; các biến thể nguồn khác vẫn được đánh dấu context/profile-dependent.

## 6. Logic / engineering fixes

- Cho phép exact-touch tại ranh giới origin W1 và ranh giới vùng Wave 1/Wave 4; actual penetration vẫn vi phạm.
- Pivot threshold metadata dùng close của pivot đang biểu diễn.
- Candidate combination chỉ nối exact pivot boundary.
- Evidence Score tiếp tục được chuẩn hóa theo evidence families; không phải xác suất, win rate hay confidence đã hiệu chỉnh.
- `PATTERN_CATALOG` bỏ duplicate Double Three definition.

## 7. Không thay đổi

- Không sửa chart candle renderer, cTrader connection, Options, TPO, Footprint hoặc các module Quant khác ngoài sidebar integration.
- Không tạo tín hiệu Buy/Sell, không tự đặt SL/TP.
- Không tuyên bố engine tự động đếm Elliott hoàn chỉnh cho mọi thị trường.
