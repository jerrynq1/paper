# Elliott Structure Lab v0.2 — kiểm thử

## Kiểm tra thực hiện
- `node --check` trên các JavaScript source.
- `bash tests/run-all.sh` regression suite hiện có.
- Elliott engine tests giữ kiểm tra OHLC validation, ATR, causal pivots, multi-scale hierarchy, impulse rules, Zigzag/Flat/Triangle/Diagonal, projection, candidate ranking.
- HTML ID uniqueness / required Elliott controls.
- ZIP integrity.

## Diễn giải
Bộ test kiểm tra tính nhất quán logic và regression, không chứng minh khả năng dự báo hay lợi nhuận. Manual Count Builder audit là checklist hỗ trợ, không thay thế recursive count verification.
