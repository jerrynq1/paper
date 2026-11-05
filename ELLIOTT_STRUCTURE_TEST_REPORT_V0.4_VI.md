# Elliott Structure Lab v0.4 — Test Report

Ngày kiểm thử: 05-11-2026  
Engine: 0.4.0

## Elliott-specific regression

- Baseline Elliott suite: 10/10 nhóm pass.
- v0.4 new suite: 12/12 nhóm pass.
- Các nhóm v0.4 bao phủ:
  1. Version export.
  2. Impulse exact-touch tại origin W1 và W1/W4 boundary.
  3. Barrier Triangle với upper và lower boundary.
  4. Contracting/Expanding Diagonal và role ambiguity.
  5. Fibonacci observed ratio so với forward projection.
  6. Manual ABC origin pivot audit.
  7. Exact join W-X-Y và reject component rời.
  8. Recursive grammar matched không được gắn nhãn verified quá mức.
  9. Parent context Leading/Ending Diagonal evidence.
  10. Leading 5-3-5-3-5 so với Ending 3-3-3-3-3 grammar.
  11. As-of slicing trước khi detect để tránh lookahead.
  12. Snapshot lifecycle chỉ xét các bar sau As-of.

## Full regression

Kết quả `bash tests/run-all.sh`: **đạt** ở build v0.4. Các test files hiện có chạy qua, gồm chart data helpers, DOM, DTT, Elliott, Footprint, HVN, Killzones, Kinematics, Options, Price Variation, Quant Regression/Stats/Time Series/Volatility, Replay và TPO.

## Static validation

- `node --check` đã chạy trên toàn bộ **64 file JavaScript** trong source.
- HTML scan: **250 ID duy nhất**, không trùng; **8 view sections**; `v-elliott` độc lập với `v-quant`; Elliott scripts/styles được nạp riêng.
- ZIP integrity được kiểm tra sau khi đóng gói release.
- Chromium headless smoke test đã thử nhưng runner bị treo do ứng dụng có timer/runtime browser; không ghi nhận đây là browser UAT thành công. Vì vậy giao diện trên Safari/iOS vẫn cần kiểm tra thực tế.

## Giới hạn xác minh

Test pass chỉ chứng minh logic deterministic và regression fixtures đang chạy đúng. Nó **không** chứng minh parser đếm đúng mọi chart thực tế, không chứng minh xác suất/win rate, và không thay thế bộ dữ liệu wave-count do chuyên gia gán nhãn. Safari/iOS UAT và benchmark hiệu năng thiết bị thấp chưa được chạy trong môi trường này.
