# Báo cáo kiểm thử — Elliott Structure Lab v0.1

**Ngày kiểm thử:** 05-11-2026  
**Phạm vi:** QuantLab source bundle sau khi thêm Elliott Structure Lab.

## Kết quả

- **21/21** file `tests/*.test.js` chạy hoàn tất, không có test script thất bại.
- **10 nhóm** kiểm thử chuyên biệt trong `tests/elliott-structure.test.js` đạt.
- **42/42** file `js/*.js` vượt `node --check`.
- **225 HTML IDs** trong `index.html`; không phát hiện ID trùng.
- Các ID điều khiển và vùng hiển thị của Structure Lab đều xuất hiện đúng một lần.

Có thể chạy lại toàn bộ bằng:

```bash
bash tests/run-all.sh
for f in js/*.js; do node --check "$f"; done
```

## Phạm vi kiểm thử Elliott

1. Chuẩn hóa OHLC, timestamp tăng nghiêm ngặt, alias `timestamp`, candle integrity và volume không âm.
2. Wilder ATR và Directional Change pivot chỉ xác nhận sau reversal.
3. Multi-scale pivot, persistence và parent-leg hierarchy.
4. Impulse hard rules ở cả hướng tăng và giảm; internal count được đánh dấu chưa xác minh.
5. Zigzag B-wave rule ở cả hai hướng.
6. Regular, Expanded và Running Flat ở cả hai hướng.
7. Contracting và Expanding Triangle candidate.
8. Diagonal overlap và role ambiguity.
9. Developing Wave 5: Fibonacci, invalidation, channel projection, candidate deduplication và alternate-count matching.
10. End-to-end analysis, Evidence Score không bị gắn nhãn Probability.

## Những gì chưa được xác minh

- Chưa có kiểm thử giao diện trực quan đầy đủ trên Safari/iOS và trình duyệt production của người dùng.
- Chưa benchmark trên tập dữ liệu thị trường thật có Elliott counts được chuyên gia gắn nhãn.
- Chưa có kiểm định out-of-sample, walk-forward performance hoặc calibration xác suất.
- Chưa có kiểm thử hiệu năng trên toàn bộ giới hạn 30.000 nến ở thiết bị di động cấu hình thấp.

Vì vậy, kết quả hiện tại xác minh tính nhất quán của code và không gây thất bại cho bộ regression test hiện có; chưa chứng minh chất lượng dự báo giao dịch.
