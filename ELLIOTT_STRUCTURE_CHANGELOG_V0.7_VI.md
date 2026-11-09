# Elliott Wave Detector v0.7.0 — Changelog

## Sửa lỗi logic quan trọng

- v0.6 có chạy detection ở nhiều scales và gọi recursive grammar, nhưng `recursiveGrammar` không lưu danh sách `legs`; bước scoring không thể đi ngược các child links. Đã bổ sung `legs` cùng `childCandidateKey`.
- v0.6 chỉ trả về `prim.map(...)` từ `addScaleAgreement`, khiến candidate ở các degree không phải primary bị loại khỏi bảng xếp hạng cuối. v0.7 giữ toàn bộ candidate forest.
- Candidate identity hiện có `candidateKey` kèm degree để phân biệt cùng một pattern/interval xuất hiện ở nhiều scales.

## Nâng cấp thuật toán

- Năm automatic swing scales nội bộ thay vì bốn, bao phủ chi tiết con đến cấu trúc lớn hơn.
- Bidirectional parent/child support: parent count dùng child grammar để xác nhận từng nhịp; child count ghi nhận parent interpretations đã sử dụng nó.
- `hierarchyScore` ưu tiên cấu trúc con/cha và độ đồng thuận scale, ngoài evidence/hard-rule/recency. Correction thiếu parent context và diagonal thiếu role context không còn được ưu tiên quá mức chỉ vì hình học đẹp.
- Interval index theo pattern/direction/degree giúp tìm các count gần nhau hiệu quả hơn việc quét toàn candidate forest.
- W-X-Y/Triple-combination adjacency lookup dùng nhóm theo start index và direction, tránh filter toàn danh sách lặp lại.

## Giao diện

- Auto-focus vào vùng count ưu tiên cùng ngữ cảnh hai bên, giúp tránh nhãn A/B/C dồn trong toàn chart.
- X-axis zoom 1×–10× và Fit All.
- Vẽ parent context mờ/nét đứt, child structures mờ và main count nổi bật; chỉ main count có nhãn chính.
- Tọa độ manual pivot drag được quy đổi theo vùng X hiện tại.
- JSON export bổ sung candidate hierarchy và recursive evidence.

## Không tuyên bố vượt quá dữ liệu

- Chưa có expert-labelled dataset hoặc kiểm định walk-forward accuracy.
- Hierarchy score là heuristic ranking, không phải probability.
- Recursive grammar chỉ được đánh dấu theo child candidates được tìm thấy; không coi đây là parser Elliott hoàn chỉnh.
