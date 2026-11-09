# Gexadecimal Elliott Wave Detector v0.7.0

## Mục tiêu

Giữ trải nghiệm sử dụng đơn giản: người dùng không cần thiết lập ATR, threshold hoặc degree. Phần phức tạp nằm trong engine, còn chart chỉ nhấn mạnh count chính, cấu trúc cha/con có liên quan và vùng dự báo.

## Kiến trúc nhận diện

1. Chuẩn hóa OHLC và cắt dữ liệu theo As-of trước khi tính bất kỳ pivot/candidate nào.
2. Tạo năm swing scales tự động từ một bộ ngưỡng nội bộ theo ATR Wilder; scale nhỏ bắt dao động con, scale lớn mô tả cấu trúc cha. Đây là tham số nội bộ, không có input người dùng.
3. Sinh candidate theo các mẫu đã hỗ trợ: Impulse/Developing Wave 5, Truncated Fifth, Diagonal candidate, Zigzag, Flat, Triangle và các combination W-X-Y / W-X-Y-X-Z ở mức hỗ trợ.
4. Match candidate degree lớn với child candidate ở degree thấp hơn theo hướng và interval của từng leg. Mỗi leg lưu `childCandidateKey`, kiểu cấu trúc con và trạng thái match.
5. Xây liên kết ngược từ child candidate lên các parent candidate đang sử dụng nó. Candidate forest giữ mọi degree, kể cả khi degree đó không phải primary degree.
6. Chấm `hierarchyScore` bằng tổ hợp explainable: evidence score, hard-rule quality, scale agreement, child support, parent support, recency và interval coverage. Corrections thiếu parent context và Diagonal thiếu role context bị giảm hạng.
7. Chọn count ưu tiên trong vùng gần cuối chart bằng hierarchy score trước, recency làm tie-breaker. Không tự coi score là xác suất.

## Bidirectional wave hierarchy

- Parent → child: mỗi nhịp của count cha tìm candidate tương ứng ở scale thấp hơn; motive leg tìm motive child, corrective leg tìm corrective child, hướng phải khớp.
- Child → parent: candidate con ghi lại các count cha đã dùng nó. Quan hệ này đóng góp vào hierarchy score của chính child candidate.
- Chart: parent context vẽ nét đứt, child structure vẽ mờ, main count dùng màu nổi và là cấu trúc duy nhất có nhãn lớn.
- Nếu thiếu child hoặc parent context, candidate vẫn có thể hiển thị ở trạng thái provisional; engine không cưỡng ép xác nhận.

## X-axis zoom

- Range 1×–10×, lấy tâm ở count đang chọn.
- Mặc định auto-fit vùng count hiện tại cùng ngữ cảnh hai bên để tránh bốn nhãn sóng bị dồn ở toàn bộ lịch sử.
- `Fit toàn bộ` trả view về toàn bộ OHLC.
- Manual pivot drag quy đổi tọa độ theo `viewStart`/`viewEnd`, không còn giả định toàn bộ dataset đang hiển thị.

## Export / diagnostics

JSON export có candidate hierarchy: `candidateKey`, degree, interval, hierarchy score, parent keys, recursive legs và match states. Candidate forest được giữ ở runtime để vẽ parent/child context và tính dự báo lịch sử.

## Giới hạn quan trọng

- Đây là multi-scale candidate graph + recursive grammar matching; chưa phải một parser ngữ pháp Elliott hoàn chỉnh có chứng minh tối ưu toàn cục.
- Internal 3/5 chỉ được xác minh khi tìm thấy child candidates đủ điều kiện; swing count đơn thuần vẫn là proxy.
- W-X-Y / W-X-Y-X-Z còn ở mức assisted composition.
- Evidence score và hierarchy score là thang xếp hạng heuristic, không phải xác suất, confidence, accuracy hoặc win rate.
- Chưa có bộ count do chuyên gia Elliott gán nhãn, inter-rater agreement, walk-forward accuracy calibration hay benchmark Safari/iOS trên thiết bị yếu.
- Fib/Quant forecast vẫn là kịch bản thống kê theo cấu trúc tương đồng; không đảm bảo giá chạm mục tiêu.
