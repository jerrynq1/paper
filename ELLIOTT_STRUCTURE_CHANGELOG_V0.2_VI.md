# Elliott Structure Lab v0.2 — changelog

## Workspace / navigation
- Tách toàn bộ Elliott Structure Lab khỏi Quant Lab thành sidebar/view riêng: `Elliott Wave` (`v-elliott`).
- Quant Lab giữ nguyên khu vực thống kê/OLS/Time Series/Volatility; Elliott UI tiếp tục dùng cùng dữ liệu Chart/CSV/DEMO nhưng độc lập về layout.

## Count workflow
- Bổ sung Manual Count Builder: gán nhãn pivot đã xác nhận theo degree, lock/unlock nhãn, xem bảng nhãn, xóa từng nhãn/reset, chạy audit sequence cho impulse, ABC correction và WXY/WXYXZ.
- Audit nhắc các rule/subdivision cần kiểm tra nhưng không tự kết luận pattern hợp lệ khi chưa có recursive subwave evidence.

## Detector / model improvements
- Version engine nâng lên 0.2.0.
- Impulse candidate ghi nhận swing-segmentation proxy ở scale nhỏ theo từng wave; phân biệt extension dựa trên nested-subdivision proxy với chỉ độ dài nổi bật. Đây vẫn là assisted evidence, không phải recursive proof.
- Contracting triangle bổ sung nhận diện hình học barrier-like khi một boundary gần ngang; vẫn là subtype hình học, không tạo hard-rule class riêng.
- Pattern catalog bổ sung Extended Impulse và Barrier Triangle status.
- Giữ principle: Fibonacci và heuristic scores chỉ là guideline; chưa đủ dữ liệu con thì không khẳng định 5/3 grammar.

## Known limitations
- Recursive parser/constraint solver đầy đủ cho mọi degree chưa hoàn tất.
- Double/Triple Three và WXY/WXYXZ vẫn cần assisted/manual composition; audit sequence chưa xác minh internal 3-wave grammar.
- Manual count builder hiện gán nhãn theo pivot và audit sơ bộ, chưa hỗ trợ drag pivot trực tiếp trên chart hoặc lock/degree tree editor.
- Chưa có expert-labeled dataset, walk-forward pattern validation, Safari/iOS visual QA hoặc benchmark mobile.
