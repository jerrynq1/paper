# Elliott Wave Detector v0.6.0 — Changelog

## Mục tiêu phiên bản
Đơn giản hóa trải nghiệm sử dụng: mở workspace là tự nhận diện cấu trúc, không yêu cầu người dùng chọn ATR, threshold hoặc degree. Chart ưu tiên đường cấu trúc Elliott và nhãn sóng; dự báo đặt Fibonacci cạnh ước lượng thống kê từ QuantLab.

## Thay đổi chính
- Engine tự chọn độ nhạy swing nội bộ theo đặc tính chuỗi OHLC và tự chọn degree chính. Không có điều khiển ATR/threshold trên giao diện chính.
- Khi nhiều degree có số pivot gần như bằng nhau, engine ưu tiên degree giữa thay vì mặc định degree nhỏ nhất.
- Chart chỉ ghi nhãn cấu trúc `0–1–2–3–4–5`, `0–A–B–C`, `0–A–B–C–D–E`, `0–W–X–Y` hoặc `0–W–X–Y–X–Z`. Không vẽ tag H/L.
- Nhãn được bố trí tránh va chạm, có nền và đường nối nhỏ đến pivot; chart chỉ hiển thị tối đa một đường Quant trung tâm và một mốc Fibonacci tham chiếu.
- Thẻ Count hiện tại được rút gọn: tên cấu trúc, hướng, trạng thái và mốc invalidation chính. Điểm Evidence, hard-rule audit và degree details chuyển về phần chi tiết.
- Dự báo Wave 5 khi impulse đang phát triển và Wave A sau impulse hoàn chỉnh bằng các tỷ lệ Fibonacci.
- QuantLab bổ sung thống kê các cấu trúc lịch sử tương đồng: nearest analogs, trung vị tỷ lệ, P25–P75, số mẫu và độ lệch chuẩn. Chỉ dùng dữ liệu kết thúc trước count hiện tại.
- Không ép dự báo khi cấu trúc không đủ ngữ cảnh. Đặc biệt, một Zigzag/Flat độc lập chưa đủ để xác định chính xác nhịp kế tiếp ở degree lớn hơn.

## Giữ nguyên
- Elliott Wave là workspace/sidebar độc lập, không nằm trong Quant Lab.
- Replay/As-of cắt dữ liệu trước khi phát hiện pivot và candidate.
- Các pattern detector, rule audit, alternate counts, manual count và scenario lifecycle vẫn có trong phần nâng cao.
- Evidence Score tiếp tục là heuristic ranking, không phải xác suất hay win rate.

## Giới hạn
- ATR vẫn được dùng bên trong engine để chuẩn hóa swing, nhưng được tự động thiết lập; người dùng không cần cấu hình.
- Quant forecast là thống kê mô tả trên các mẫu tương đồng, chưa được hiệu chỉnh trên bộ Elliott count chuyên gia gán nhãn.
- Forecast hiện hỗ trợ Wave 5 đang phát triển và Wave A sau impulse hoàn tất; không tạo mục tiêu giả cho mọi dạng correction hoặc triangle.
- Full recursive K-best parser, database persistence và benchmark hiệu năng trên thiết bị cấu hình thấp vẫn chưa hoàn tất.
