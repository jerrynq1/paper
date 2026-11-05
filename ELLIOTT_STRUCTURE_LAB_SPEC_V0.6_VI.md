# Gexadecimal Elliott Wave Detector v0.6.0

## 1. Cách sử dụng

1. Mở sidebar **Elliott Wave**.
2. Chọn timeframe hiện tại hoặc M1, hoặc dùng Import CSV.
3. Nhấn **Tự nhận diện sóng**. Không cần đặt ATR period, ATR multiplier, threshold hay degree.
4. Xem count được ưu tiên trên chart. Chọn một count thay thế trong phần **Chi tiết và công cụ nâng cao** khi cần so sánh.
5. Đọc dự báo Fibonacci và QuantLab nếu cấu trúc đủ điều kiện.

## 2. Chart

Chart hiển thị giá đóng cửa, đường nối các điểm của count được chọn và nhãn sóng. Các loại nhãn gồm:

- Impulse: `0–1–2–3–4–5` (hoặc `0–1–2–3–4` khi Wave 5 đang phát triển).
- Zigzag / Flat: `0–A–B–C`.
- Triangle: `0–A–B–C–D–E`.
- Double correction: `0–W–X–Y`.
- Triple correction: `0–W–X–Y–X–Z`.

Chart không vẽ tag H/L. Các điểm cực trị vẫn là dữ liệu cấu trúc ở phía engine; Pivot Audit trong phần nâng cao có thể hiển thị loại pivot để phục vụ kiểm tra.

Nhãn dùng vị trí trên/dưới theo loại pivot, dịch chuyển khi phát hiện va chạm và có nền để dễ đọc. Trên chart tối đa có một mốc Quant trung tâm và một mốc Fibonacci đại diện nhằm tránh tạo quá nhiều đường ngang.

## 3. Tự động nhận diện swing

ATR và Directional Change vẫn được sử dụng nội bộ vì cần một ngưỡng chuẩn hóa biến động giữa các sản phẩm và timeframe. Tuy nhiên, toàn bộ tham số được engine lựa chọn tự động:

- ATR period thay đổi theo độ dài dữ liệu trong giới hạn kỹ thuật.
- Threshold multiplier nội bộ thay đổi theo mức hiệu quả chuyển động / độ nhiễu của chuỗi.
- Một ngân hàng degree được chạy song song.
- Degree chính được chọn theo số pivot phù hợp với độ dài mẫu; nếu hòa điểm, ưu tiên scale giữa để tránh thiên lệch về degree nhỏ nhất.

Người dùng không cần hiểu hoặc chỉnh các tham số này. Các thông số vẫn được lưu trong kết quả xuất JSON nhằm tái lập và debug.

## 4. Candidate và count

Engine tiếp tục tìm các hình thái đã có trong v0.5: Impulse, Extended Impulse proxy, Truncated Fifth, Developing Wave 5, Diagonal candidates, Zigzag, các loại Flat, các loại Triangle và combination W-X-Y / W-X-Y-X-Z ở chế độ assisted.

Count ưu tiên là giả thuyết hình học có độ mới nhất phù hợp, không phải nhãn chắc chắn. Một pattern chỉ được đánh dấu verified khi rule và yêu cầu child-grammar tương ứng được thỏa mãn; đếm số swing ở degree nhỏ hơn chỉ là proxy, không phải bằng chứng đủ cho cấu trúc 3/5.

## 5. Dự báo Fibonacci

### Wave 5 đang phát triển

Với count đã có các điểm 0–1–2–3–4:

- `W5 = 0.618 / 1.0 / 1.618 × W1` tính từ điểm kết thúc Wave 4.
- `W5 = 0.382 / 0.618 / 1.0 × net(W1→W3)` là nhóm tham chiếu bổ sung.

### Wave A sau impulse hoàn chỉnh

Với impulse đủ 6 điểm 0–1–2–3–4–5:

- Wave A được tham chiếu bằng retracement `0.382 / 0.5 / 0.618` của biên độ impulse 0→5, chiếu ngược hướng impulse.

Các ratio là kịch bản tham khảo, không phải hard rule. Forecast không được tạo nếu loại count hoặc bối cảnh không phù hợp.

## 6. QuantLab analog forecast

QuantLab không thay Elliott count và không tự xác định hướng sóng. Nó chỉ thống kê biên độ của các mẫu đã hoàn tất trong quá khứ:

- Wave 5: tỷ lệ `W5/W1` của các impulse cùng hướng, đã kết thúc trước điểm bắt đầu count hiện tại.
- Wave A: tỷ lệ `Wave A / full impulse range` từ các cặp impulse hoàn tất và correction bắt đầu đúng tại điểm kết thúc impulse, cũng nằm hoàn toàn trong quá khứ.
- Mẫu được xếp hạng theo khoảng cách của các đặc trưng `W2/W1`, `W3/W1`, `W4/W3`; tối đa 24 analog gần nhất được dùng.
- Kết quả gồm P10/P25/P50/P75/P90, trung bình, độ lệch chuẩn, sample count và vùng giá quy đổi.
- Nếu QuantStats của QuantLab có sẵn, engine dùng hàm quantile/statistics của module đó; nếu không, dùng hàm thống kê nội bộ tương đương.

P25–P75 là vùng chứa phần giữa của các tỷ lệ mẫu tương đồng, không được diễn giải là xác suất giá sẽ chạm vùng này. Với ít hơn 5 mẫu, độ tin cậy mô tả rất thấp; không có mẫu thì chỉ hiển thị Fibonacci.

## 7. Replay và tránh nhìn trước dữ liệu

As-of index/time được áp dụng lên OHLC trước khi tính ATR, pivot và candidate. Pivot chỉ được tính là đã xác nhận sau thời điểm directional change xác nhận nó. Mọi analog trong Quant forecast phải kết thúc trước khi count hiện tại bắt đầu. Replay dùng đúng dữ liệu đã lộ tại cursor; dữ liệu phía sau cursor không được sử dụng để dựng count.

## 8. Các giới hạn cần hiểu

- Đây là công cụ nghiên cứu / hỗ trợ đọc cấu trúc, không phải tín hiệu Buy/Sell.
- Evidence Score là điểm xếp hạng heuristic, không phải xác suất đúng, confidence đã hiệu chuẩn hay win rate.
- CFD OHLC/volume proxy có thể khác futures centralized volume; chất lượng count và analog phụ thuộc dữ liệu, timeframe và broker.
- Chưa có expert-labelled gold dataset, inter-rater agreement hoặc walk-forward calibration của các ratio analog.
- Chưa có unrestricted recursive grammar / global dynamic-programming K-best parser cho mọi degree.
- Forecast hiện triển khai có kiểm soát cho Wave 5 đang phát triển và Wave A sau impulse hoàn tất. Những dạng correction độc lập cần parent-degree context trước khi suy ra nhịp kế tiếp.
- Manual Count Builder và snapshot history chưa được lưu vào database; hãy Export JSON để lưu trữ.

## 9. Files chính

- `js/elliott-structure-engine.js`: tự động swing detection, candidate rules, Fibonacci và historical analog forecast.
- `js/elliott-structure-ui.js`: workspace, chart labels, forecast, Replay/As-of và Manual Count Builder.
- `css/elliott-structure.css`: giao diện Elliott riêng.
- `tests/elliott-simple-v06.test.js`: kiểm tra tự động, forecast và giao diện rút gọn.
- `tests/elliott-structure-v04.test.js`: regression rules / replay / recursive grammar.
- `tests/elliott-structure.test.js`: core detection.
