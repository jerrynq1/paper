# Elliott Wave Detector v0.6.0 — Test Report

## Kết quả kiểm thử tự động

- Core Elliott structure tests: 10 nhóm.
- Historical/recursive/rule regression tests: 12 nhóm.
- Simplified detector + forecast tests: 8 nhóm.
- Full QuantLab regression: `bash tests/run-all.sh`.
- JavaScript parse validation: `node --check` trên toàn bộ các file `.js` trong `js/`.
- HTML static audit: kiểm tra ID trùng lặp, các control ATR/threshold người dùng và vùng dự báo.

## Các ca v0.6 mới

1. Mặc định phân tích dùng automatic swing settings; người dùng không cần truyền ATR/threshold.
2. Khi số pivot giữa các degree bằng nhau, lựa chọn tránh thiên lệch degree nhỏ nhất.
3. Developing Wave 5 hiển thị Fibonacci và historical Quant analog quantiles.
4. Completed impulse chỉ dùng impulse→correction pair ở quá khứ để thống kê Wave A.
5. Không lấy nhầm tỷ lệ Wave 5 lịch sử để dự báo Wave A.
6. Không ép mục tiêu kế tiếp khi candidate chưa có ngữ cảnh Elliott đủ phù hợp.
7. HTML không còn input ATR / threshold; vùng forecast và wave label được giữ trong workspace riêng.

## Giới hạn xác minh

- Đây là kiểm thử logic và cấu trúc source, không phải xác nhận độ chính xác Elliott trên thị trường thực.
- Chưa có bộ count được chuyên gia gán nhãn và chưa chạy walk-forward forecast-error benchmark.
- Chưa hoàn tất browser/device visual acceptance trên mọi trình duyệt và thiết bị di động.
- Sample analog có thể ít hoặc bằng 0 ở dữ liệu ngắn; khi đó hệ thống chỉ hiển thị Fibonacci hoặc thông báo thiếu ngữ cảnh.

Evidence Score và Quant P25–P75 không phải xác suất thành công hay cam kết giá.
