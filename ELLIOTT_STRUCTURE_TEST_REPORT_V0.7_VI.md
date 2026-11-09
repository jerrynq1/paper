# Elliott Wave Detector v0.7.0 — Test Report

## Kết quả

- `bash tests/run-all.sh`: PASS (toàn bộ các test files trong project).
- Elliott hierarchy v0.7: 3 nhóm test PASS.
- Elliott v0.6 feature regression: 8 nhóm test PASS.
- Elliott Structure regression: 10 nhóm test PASS.
- Elliott v0.4 compatibility/regression: 12 nhóm test PASS.
- JavaScript syntax validation: kiểm tra riêng ở bước package.

## v0.7-specific coverage

1. Candidate forest giữ cả degree nhỏ và lớn.
2. Parent candidate lưu child candidate key ở từng leg.
3. Child candidate truy ngược parent candidate keys.
4. Hierarchy score được tính cho mọi degree và finite trên fixture.
5. End-to-end fixture có cả parent support và child support.
6. X-axis zoom có slider và Fit All.
7. Manual pivot drag sử dụng viewStart/viewEnd khi zoom.
8. Chart render parent context/child structure nhẹ hơn main count.

## Giới hạn kiểm thử

- Fixture tổng hợp không chứng minh độ chính xác Elliott trên thị trường thật.
- Chưa có chuyên gia gán nhãn độc lập làm ground truth.
- Chưa chạy browser screenshot/e2e thật trên Safari iOS hoặc Android; ảnh tham chiếu được dùng để xác định lỗi UX, không phải làm bộ dữ liệu dự báo.
- Chưa có benchmark hiệu năng trên điện thoại cấu hình thấp với dữ liệu 30.000 nến.
