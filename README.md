# Indicator Lab

Bản rút gọn của signal-bridge giữ **Chart**, **TPO Chart độc lập**, **Indicator** (kể cả Orderflow: Footprint, Big Trade, Statistic) và **kết nối cTrader Open API**. Không còn đăng nhập Discord, Journal, Lịch kinh tế, nhiều chart, đa ngôn ngữ hay worker.

## Chạy

Mở `index.html` trực tiếp, hoặc phục vụ qua một web server tĩnh cho tiện:

    python3 -m http.server 8000      # rồi mở http://localhost:8000

Cần Internet để tải thư viện lightweight-charts (CDN) và font.

## Kết nối cTrader

Vào mục **Kết nối**, nhập Client ID, Client Secret, Access Token (tuỳ chọn: Account ID, môi trường) rồi bấm **Lưu & kết nối**. Trình duyệt nối thẳng tới `wss://live|demo.ctraderapi.com:5036`, tự chọn máy chủ live/demo theo tài khoản của token. Key lưu trong `localStorage` (khoá `ct_cfg`) của trình duyệt này.

> Client Secret và Access Token nằm trong trình duyệt nên bản này chỉ dùng để test ở máy cá nhân, đừng đưa lên hosting công khai.

## Digital Time Theory (DTT) + Digital Root Engine

DTT đã được tích hợp thành **overlay JavaScript native** của web (không chạy Pine Script trực tiếp). Indicator chỉ vẽ lên canvas overlay `#dw`; không thêm/xóa series nến, không sửa OHLC, không đổi price scale/time scale và không can thiệp replay.

- Bật/tắt nhanh bằng nút **◉ DTT** trên thanh chart.
- Mở **Indicator** để chỉnh timezone, Tick Size, Tick Root Anchor, số ngày lịch sử, nhóm New York / Asia / London và từng model.
- Hiển thị các phiên, từng DTT model, inner-time markers, Root Candle rectangle kéo tới hết phiên chứa model, Weekly macro và Yearly macro trên D1.
- Digital Root dashboard tính Time Root, Quote OHLC Root, Tick OHLC Root, Shape Root (Range / Body / Upper Wick / Lower Wick), Composite Root và quan hệ Exact / Group / Cross-group.
- Cài đặt được lưu riêng trong `localStorage` (`tp_dtt_v1`); không ghi đè indicator hoặc drawings đang có.

**Lưu ý về dữ liệu và độ chính xác**

- Model time mặc định theo `America/New_York`, tự tính DST bằng IANA timezone. Có thể chọn timezone khác trong phần cài đặt; khi đổi timezone, các mốc model được diễn giải theo đồng hồ của timezone đã chọn.
- Root Candle lấy OHLC của cây nến chart chứa phút Root Candle. Trên M5/M15/H1, đây là cây nến timeframe hiện tại chứa thời điểm đó, không phải nến M1 gốc.
- Tick Size tự động mặc định bằng `10^-digits` vì chart cTrader hiện không cung cấp min-tick chuẩn cho tất cả symbol. Với Futures / CFD có bước giá khác độ chính xác hiển thị, hãy nhập Tick Size thủ công để Tick Root và Shape Root có ý nghĩa đúng.
- Weekly macro dùng khoảng Sunday 17:00 đến Friday 17:00 theo timezone model và các phân đoạn 0.1125 / 0.36 / 0.5625; phần này được đánh dấu xấp xỉ. Yearly model chỉ vẽ trên D1; các mốc ngày là cách diễn giải từ bản DTT đã tích hợp, không tự điều chỉnh lịch đặc biệt của mọi thị trường.
- Intraday history bị giới hạn tối đa 120 ngày để tránh tạo quá nhiều đối tượng canvas; có giới hạn số box/marker. Dữ liệu không được tải về thì indicator không thể vẽ lịch sử đó.

Kiểm thử phần DTT: `node tests/dtt.test.js`.

## Thêm indicator mới

Sửa `js/indicators-custom.js` (đã có sẵn một mẫu `IND.mine` và hướng dẫn cấu trúc ở đầu file), tải lại trang rồi thêm indicator ở mục **Indicator**. Các indicator có sẵn nằm ở `js/indicators-defs.js`, phần vẽ/tính toán ở `js/indicators-engine.js`.

## Cấu trúc

- `js/ctrader.js`: kết nối, đăng nhập, nến M1, tick, footprint
- `js/chart.js`, `js/candle-style.js`, `js/timezone.js`, `js/symbols.js`: chart, màu nến, múi giờ, chọn mã
- `js/indicators-*.js`, `js/volume-profile.js`, `js/orderflow-*.js`: indicator
- `js/kinematics.js`: phần tính của Kinematics (S = High − Low, V = ±S/Δt, a = ΔV/Δt, chỉ dùng OHLC). Ba chỉ báo khai báo ở cuối `js/indicators-custom.js`: `IND.kins` (S, đường đè lên chart như EMA), `IND.kinv` (V, histogram ở pane riêng), `IND.kina` (a, đường ở pane riêng như RSI)
- `js/orderflow-absorption.js`: Heavy Absorption (tính ngưỡng + vẽ marker); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.hab`)
- `js/orderflow-dom.js`: DOM / MBO (kênh depth cTrader, bảng bên phải + histogram thanh khoản ở mép phải chart); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.dom`)
- `js/hvn-profile.js`: HVN Profile (tính cụm HVN + vẽ canvas); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.hvn`)
- `js/dtt.js`: Digital Time Theory (DTT) + Digital Root Engine (overlay canvas; khung phiên/model, Root Candle, Weekly/Yearly macro, Quote/Tick/OHLC Root)
- `js/killzones.js`: Killzones & Pivots (tính phiên/pivot/level/D-W-M + vẽ canvas + bảng thống kê); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.kz`)
- `js/goldbach.js`: Goldbach Levels (tính PO3 + level + vẽ canvas); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.gb`)
- `js/qt.js`: Quarterly Theory (tính chu kỳ A-M-D-X + vẽ thanh các làn); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.qt`)
- `js/replay.js`: Replay để backtest (thanh điều khiển nổi, cắt/nối lại mảng `m1`); `RP` và `RPLIM()` khai báo ở đầu `js/chart.js`
- `js/drawings-*.js`, `js/mobile.js`: công cụ vẽ và cử chỉ cảm ứng
- `tests/`: `node tests/dtt.test.js`, `node tests/footprint.test.js`, `node tests/customtf.test.js`, `node tests/hvn.test.js`, `node tests/hab.test.js`, `node tests/dom.test.js`, `node tests/replay.test.js`, `node tests/killzones.test.js`, `node tests/goldbach.test.js`, `node tests/qt.test.js`, `node tests/kinematics.test.js`

## Replay (backtest)

Bấm **Replay** trên thanh chart, rồi chọn điểm bắt đầu: bấm vào một nến (rê chuột thấy đường cắt, phần bên phải bị làm mờ), hoặc dùng **Chọn nhanh…** (1 giờ … 1 tháng trước, đầu ngày hôm nay), **Chọn ngày**, **Ngẫu nhiên**. Chart chỉ còn quá khứ tới điểm đó; nến và mọi indicator được dựng lại như thật, không nhìn trộm tương lai.

| Nút / phím | Việc làm |
|---|---|
| ⏮ | Về điểm bắt đầu backtest |
| ◀| / |▶ (Shift+← / Shift+→) | Lùi / tiến 1 bước |
| ▶ / ⏸ (Shift+↓) | Phát / tạm dừng |
| ⏭ | Tua tới nến cuối có dữ liệu |
| Thanh tua | Kéo tới bất kỳ thời điểm nào; nhãn hiện giờ tại con trượt, cờ xanh là điểm bắt đầu |
| 0.1x … 120x | Số lần cập nhật mỗi giây |
| Mỗi nến … / Mỗi phút | Mỗi bước chạy hết 1 nến của khung đang xem hoặc 1 nến M1 |
| ✂ | Chọn lại điểm bắt đầu |
| ✕ | Thoát, về chart trực tiếp (tự bù nến mới) |

Thanh điều khiển kéo được bằng tay nắm bên trái. Có thể đổi khung giờ (từ M1 trở lên) và bật/tắt indicator trong lúc replay. Không giới hạn số ngày lùi: chọn mốc cũ hơn dữ liệu đã tải thì replay tự tải thêm M1 (tới khi broker hết dữ liệu); **Chọn nhanh → Đầu dữ liệu đã tải** về đúng đầu phần đã có. Giới hạn: không dùng khung giây; giá live bị tạm dừng; DOM/MBO là dữ liệu live nên không có ý nghĩa khi replay; tick footprint chỉ tải trong `FP_MAXD` ngày gần nhất.

## HVN Profile (v2)

Thêm ở mục **Indicator** → **HVN Profile** (nhóm Orderflow). Chia lịch sử thành các chu kỳ (1 phút … Tuần), dựng volume profile từng chu kỳ, tìm node volume dày (HVN) kèm POC, rồi kéo vùng sang phải đến khi giá dùng hết vùng. Đây là bản tự viết lại theo mô tả công khai của HVN Profile (ProfitPro, ATAS), không phải mã gốc.

- **Volume**: tick thật nếu đã tải (bật Footprint/Big Trade/Statistic), không thì ước lượng theo đường đi của giá trong nến M1.
- **Nhận diện**: "Đỉnh nổi bật" (mặc định) tìm cực đại cục bộ, lọc theo độ nổi bật, tách node kề nhau ở thung lũng; "Theo ngưỡng" là cách cũ.
- **Chất lượng**: mỗi vùng có % volume và độ mạnh (vùng mạnh đậm hơn); lọc vùng yếu và chu kỳ volume thấp bất thường.
- **Chạm vùng**: chạm mép / chạm POC / nến đóng cửa vào-vượt vùng; giá nhảy qua vùng (gap) cũng tính; phân loại giữ/phá; vùng dưới giá là hỗ trợ, trên giá là kháng cự; đếm vùng chồng nhau (×N).

## Heavy Absorption v2 (kết hợp HVN Profile)

Thêm ở mục **Indicator** → **Heavy Absorption** (nhóm Orderflow). Tự viết lại theo mô tả công khai của Heavy Absorption (ProfitPro, ATAS), không phải mã gốc. Nếu đã thêm bản v1, hãy xoá và thêm lại để nhận mặc định mới.

**Phát hiện**
- Print = volume Ask (mua) hoặc Bid (bán) tại một hàng giá trong một nến. Ngưỡng thích nghi tính từ mọi print trong `Lookback` nến, theo hai cách: *trung bình + k·độ lệch chuẩn* (như bản gốc) hoặc *theo log volume* (ổn định hơn vì volume từng mức giá có đuôi dài).
- Độ nhạy: Thấp / Vừa / Cao hoặc tự đặt hệ số k. Mặc định loại nến đang xét khỏi thống kê để print lớn của chính nó không tự nâng ngưỡng.
- Nến thiếu tick (độ phủ dưới 60%) bị loại khỏi thống kê và không có marker; cửa sổ phải đủ số print tối thiểu. Có lọc volume tối thiểu và tỉ trọng print trong nến. Bước giá có thể để tự động.

**Hấp thụ thật**
- Chỉ có lệnh lớn thì chưa đủ, giá còn phải bị chặn: phía mua bị hấp thụ khi đỉnh nến không vượt mép trên cụm quá dung sai, phía bán ở mép dưới (có chế độ chặt hơn yêu cầu đóng cửa phía bị chặn). Cụm mà giá chạy xuyên ngay trong nến bị loại.
- Các print đủ ngưỡng ở hàng kề nhau gộp thành cụm; marker đặt tại print lớn nhất, volume là tổng cụm.
- Theo dõi K nến sau marker: giữ được thì **xác nhận** (viền đậm), đang chờ thì vòng đứt nét, đóng cửa (hoặc râu) vượt mức thì **thất bại** (mờ đi). Mức hấp thụ được kẻ sang phải đến khi bị phá.
- Lưu ý: ẩn thất bại hoặc chỉ hiện xác nhận làm marker xuất hiện/biến mất sau vài nến vì trạng thái chỉ biết khi nến sau đã đóng. Marker nến đang chạy cũng có thể đổi theo từng tick.

**Kết hợp HVN Profile** (bật cả hai indicator)
- Đối chiếu theo thời gian: marker trong vùng HVN còn hiệu lực (nến chạm vùng vẫn tính) được viền nổi bật, có nhãn vai trò vùng (R kháng cự khi giá tới từ dưới, S hỗ trợ khi từ trên) và POC.
- Viền liền = đúng vai trò (mua bị hấp thụ tại kháng cự, bán bị hấp thụ tại hỗ trợ), viền đứt = ngược vai trò. Có chế độ chỉ hiện marker trong vùng hoặc chỉ hiện marker đúng vai trò.

**Hiển thị / cảnh báo**: cỡ vòng theo số lần ngưỡng (không đổi khi cuộn) hoặc theo marker lớn nhất đang thấy; chữ là volume, điểm σ hoặc cả hai; cảnh báo khi nến có marker đóng hoặc khi marker được xác nhận.

**Dữ liệu**: dùng tick (footprint) nên tự tải tick khi bật (3 ngày gần nhất). Với CFD là số ước lượng từ chuỗi báo giá bid/ask. Cần khung từ M1 trở lên. Không phải tín hiệu mua/bán độc lập.

## DOM / MBO

Thêm ở mục **Indicator** → **DOM / MBO** (nhóm Orderflow). Đăng ký kênh depth của cTrader Open API (`SubscribeDepthQuotes` 2156, nhận `DepthEvent` 2155, huỷ bằng 2158) cho mã đang xem; mỗi báo giá trong sổ có ID riêng nên giữ được từng lệnh (MBO).

- **Bảng DOM bên phải chart**: Bid | Giá | Ask | VP. Hàng chứa best bid / best ask được tô, ×N là số lệnh riêng lẻ ở mức đó, ô nháy khi size tăng (màu Bid) hoặc giảm (màu Ask) trong 1,2 giây gần nhất. Cuộn bằng bánh xe, nhấp đúp để căn giữa lại. Cột VP là volume đã khớp theo giá (từ tick footprint, nên bật nó sẽ tự tải tick).
- **Histogram thanh khoản ở mép phải vùng vẽ**: thanh ngang thẳng hàng với trục giá, đỏ là Ask, xanh là Bid, mỗi lệnh là một đoạn riêng (MBO). Mức có size vượt trung bình + k·độ lệch chuẩn của cả sổ được viền nổi, ghi nhãn "size @ giá" và kẻ đường ngang sang trái.
- **Đơn vị**: lot = size / lotSize của mã (size cTrader tính theo 1/100 đơn vị). Có thể đổi sang đơn vị hợp đồng hoặc số thô.
- **Heatmap lịch sử (tuỳ chọn, mặc định tắt)**: chụp sổ lệnh mỗi giây, tô nền chart theo size từng mức giá theo thời gian (đậm = dày; xanh Bid, đỏ Ask), kiểu Bookmap. Giữ 2–240 phút gần nhất trong bộ nhớ, đổi mã hoặc đổi mức gộp giá thì xoá lịch sử.

Giới hạn: với forex/CFD đây là thanh khoản tổng hợp do broker báo, không phải sổ lệnh tập trung như CME; giảm size không phân biệt được rút lệnh hay bị khớp; không có lịch sử depth từ trước (heatmap chỉ có từ lúc bật indicator và mất khi tải lại trang). Một số broker không bật depth, khi đó bảng báo lỗi đăng ký.

## Killzones & Pivots

Thêm ở mục **Indicator** → **Killzones & Pivots** (nhóm Orderflow). Port từ Pine Script "ICT Killzones & Pivots [TFO]" của tradeforopp (MPL-2.0) sang JS cho chart này. Chỉ vẽ trên khung từ M1 đến mức **Giới hạn khung giờ** (mặc định M30).

- **Killzones**: 6 phiên (ASIA 2000-0000, LNDN 0200-0500, NYAM 0930-1100, NYL 1200-1300 tắt, NYPM 1330-1600, RTH 0930-1600 tắt). Mỗi phiên tự đặt bật/tắt, tên, giờ `HHMM-HHMM` (qua nửa đêm được) và màu (tab Kiểu dáng). Giờ tính theo **Múi giờ** ở mục Toàn cục, mặc định America/New_York tự đổi giờ mùa; GMT±N là cố định.
- **Pivots**: High/Low của phiên kéo sang phải *đến khi bị phá* hoặc *qua cả điểm bị phá*, cho phiên gần nhất hoặc tất cả (đến khi bị Giới hạn số phiên loại). Có midpoint, nhãn (cuối hoặc đầu đường) và báo khi nến đang chạy phá pivot.
- **Range Levels** (mặc định tắt): giá mở cửa phiên ± hệ số × range trung bình / trung vị / độ lệch chuẩn của N phiên gần nhất. Nhập hệ số mỗi dòng một mức, tuỳ chọn màu (`1.5, purple`), dòng bắt đầu bằng `//` bị bỏ qua.
- **Ngày - Tuần - Tháng**: open, high/low/mid của kỳ trước, đường chia, nhãn thứ trong tuần. Ngày/tuần theo giờ server của app (cắt 17:00 New York). Nhãn trùng giá được gộp (vd. `D OPEN / W OPEN`).
- **Giá mở cửa theo giờ** và **Timestamp** (đường dọc): nhập mỗi dòng `giờ, màu, nhãn`. Giá mở cửa lấy từ nến M1 đúng phút đó nên đúng cả khi xem khung lớn hơn M1.
- **Bảng dữ liệu**: range hiện tại so với số đo, hit rate High/Low từng killzone, hit rate từng range level (trên/dưới), hit rate PD/PW/PM. Rê chuột lên ô để xem các lần gần nhất (🟩 trúng, 🟥 trượt); ô tô màu nghĩa là đã xảy ra ở phiên hiện tại. Vị trí và cỡ chữ chỉnh được.
- **Cutoff** (tuỳ chọn): pivot, midpoint, đường giá mở cửa và range level ngừng kéo dài ở giờ này; pivot bị phá lần đầu sau giờ cắt tính là trượt.

Khác bản Pine: tooltip trên nhãn trên chart được thay bằng tooltip của bảng; không có `alert()` của TradingView nên cảnh báo hiện ở thanh trạng thái kèm tiếng bíp. Khi replay, indicator chỉ thấy dữ liệu tới điểm đang xem. Hộp thoại cài đặt có thêm ô nhập chữ (`t`) và nhiều dòng (`ta`) cho các thông số dạng văn bản.

## Goldbach Levels (Trifecta)

Thêm ở mục **Indicator** → **Goldbach Levels (Trifecta)** (nhóm Orderflow). Port từ Pine Script "Goldbach Trifecta Style" (MPL-2.0) sang JS cho chart này, vẽ lên canvas cùng lớp với Killzones.

- **PO3 dealing range**: chọn PO3 (3, 9, 27, 81 ... 531441); giá được nhân **Decimate** rồi áp lưới PO3. Range chứa giá được vẽ đủ level `[03] [11] [17] [23] [29] [35] [41] [47] [50] [53] [59] [65] [71] [77] [83] [89] [97]` cùng High/Low `[81 L]` `[81 H]`; **Số range mở rộng** vẽ thêm các range phía trên và dưới (0 đến 5).
- **Màu theo nhóm**: Liquidity (03, 11, 89, 97) xanh lá, GIP (17, 83) cam, Flow (23-35, 65-77) xanh dương, Rebalance (41-59) hồng. Vùng tô OB `[03-11]/[89-97]`, LV/BR `[23-35]/[65-77]`, EQ `[41-59]` bật/tắt riêng.
- **Fractal Fib**: vẽ range con (PO3 / 3) chứa giá, có đủ level riêng. **Level giữa** thêm đường chấm giữa mỗi cặp level.
- **Mini Map**: cột range thu nhỏ bên phải nến cuối (hoặc ghim mép trái vùng đang xem), kèm đường giá.
- **PO3 tự động**: bật rồi chọn PO3 cho từng khung giờ (M1, M3-M9, M15-M30, H1, H4, Ngày, Tuần, Tháng, Quý, Năm).
- **Cơ bản**: Dịch range (0.5 = nửa range), Dùng giá lịch sử, Cập nhật mỗi tick (tắt = chỉ căn lại khi nến đóng).

Khác bản Pine: **Decimate = 0 (mặc định) là tự đoán** theo mã (Forex 10000, cặp JPY 100, vàng/chỉ số/crypto 1), nhập số khác 0 để tự đặt. Nhãn là viên thuốc theo màu nhóm, nhãn đè nhau được lược bớt (ưu tiên High/Low rồi EQ), màu theo theme sáng/tối. Giá nguồn là nến cuối khi đang replay, nên Goldbach chạy đúng trong backtest.

## Quarterly Theory [QT]

Thêm ở mục **Indicator** → **Quarterly Theory [QT]** (nhóm Orderflow). Port từ Pine Script "Quarterly Theory [QT]" (MPL-2.0).

- Mỗi chu kỳ chia 4 phần **A** (Accumulation), **M** (Manipulation), **D** (Distribution), **X** (Reversal / Continuation): **Năm** (4 quý), **Tháng** (4 tuần tính từ thứ Hai đầu tiên), **Tuần** (Thứ 2 = A đến Thứ 5 = X), **Ngày** (4 khối 6 giờ, bắt đầu 18:00 New York), **90 phút** (16 ô mỗi ngày), **22.5 phút** (tắt mặc định).
- Các làn xếp thành một thanh **dưới** (hoặc **trên**) chart, thẳng hàng với trục thời gian của nến, nên nhìn thấy nến đang nằm ở phần nào của từng chu kỳ. Ô hiện tại có viền nổi; có chú giải, tên làn, tên đầy đủ khi ô đủ rộng. Chỉnh được cỡ thanh, độ mờ, viền, nền, màu A/M/D/X và bật/tắt từng chu kỳ.
- Mọi mốc theo giờ New York (server = New York + 7 giờ). "Bây giờ" là nến cuối của chart nên đúng cả khi Replay.

Khác bản Pine: vẽ thành thanh trên chart thay vì mở pane riêng (cùng trục thời gian nên cuộn/zoom đồng bộ); tuần bắt đầu đúng 00:00 thứ Hai (bản Pine giữ nguyên giờ trong ngày); ngày giao dịch tính từ 18:00 nên sau 18:00 vẫn thấy ô đang chạy; tắt "chu kỳ lịch sử" vẫn giữ tháng trước để luôn thấy ô tháng hiện tại.

## Paper Trading v4 (Live + Replay, Netting)

- UI v4.3: nhãn lệnh có 3 chế độ (Đủ P/L, Gọn chỉ khối lượng, Ẩn) và dời ngang được (kéo tay nắm hoặc nút Trái/Giữa/Phải). UI v4.2: lệnh trên chart kiểu cTrader (đường entry luôn hiện, nhãn số lượng | P/L | ×, chip TP/SL nét đứt để thêm nhanh, kéo nhãn để chỉnh SL/TP). UI v4.1: ticket Sell/qty/Buy trên chart nhỏ gọn, kéo bằng tay nắm ⋮⋮, thu nhỏ bằng nút – (chip "Buy / Sell"), ẩn hẳn bằng nút Ticket ở panel; vị trí và trạng thái được nhớ (`gx_paper_ui`).

- Paper accounts are local simulations only and never submit orders to cTrader.
- `Live Paper` and `Replay Paper` use separate account books in localStorage (`gx_paper_live_v2` and `gx_paper_replay_v2`). Each mode supports multiple accounts, switching accounts, renaming, and resetting the selected account.
- Netting is enforced per symbol: same-direction fills increase the net position and weighted-average entry; opposite-direction fills reduce/close the current position and only reverse when the new order quantity is larger. It does not create simultaneous long and short positions for the same symbol in the same account.
- Replay Paper receives a callback from the replay engine on replay steps and uses replay OHLC/close only, never cTrader live Bid/Ask. If SL and TP are both touched within the same replay candle, SL is assumed first because OHLC data cannot determine intrabar ordering. Tick-level historical data is needed for more precise fills.
- Live Paper evaluates current quote/mark prices; Replay Paper uses candle-based approximations. This is educational simulation, not broker-grade execution: commission, swaps, margin rules, slippage and spread modelling are not fully implemented.

## Market Profile · TPO Chart (CBOT framework)

Mở **TPO Chart** ở thanh điều hướng bên trái, ngay dưới **Chart**. TPO là một workspace độc lập, không vẽ đè lên nến và không chiếm canvas chart. Bảng profile có trục giá cố định bên trái, bracket thời gian cuộn ngang, tiêu đề bracket đồng bộ và vùng giá cuộn dọc. Các thẻ POC, Value Area, Initial Balance, Fair Price và cấu trúc phiên nằm phía trên; thiết lập được gom vào các nhóm có thể thu gọn.

### Part I · Reading the Market Profile Graphic

- **TPO matrix**: một ô được ghi nhận một lần cho mỗi cặp *time bracket × price row*, dù trong cùng bracket có nhiều nến M1 chạm cùng mức giá. Mặc định bracket 30 phút. Với CBOT 24h, A–X ứng với 00:00–12:00, a–x ứng với 12:00–24:00 theo timezone đã chọn. Bracket khác dùng chuỗi ký tự A–Z, a–z.
- **Session / time zone**: New York, Chicago, London, UTC hoặc Việt Nam; có giờ bắt đầu và độ dài profile 1–24 giờ. Có thể xem phiên hiện tại hoặc trước. Mốc phiên dựa trên IANA timezone và DST. Với Forex/CFD, người dùng nên đặt giờ rollover phù hợp broker; một ngày lịch không nhất thiết là natural trading unit.
- **Price rows**: tự động chọn bước giá để giữ profile khoảng 70 hàng hoặc nhập thủ công. Có giới hạn an toàn 900 hàng.
- **POC / Value Area**: mặc định POC theo TPO count, Value Area có thể chọn 50–90%. Có lựa chọn M1 tick-volume proxy và quote-event proxy khi dữ liệu tồn tại. Đây là các thước đo khác nhau; 70% range trong LDB CBOT là theo nonspread contract volume, không đồng nghĩa TPO-count VA hay tick/quote proxy.
- **Fair Price / TPO imbalance**: trong VA, chọn giá có nhiều bracket nhất; nếu hòa, chọn mức gần midpoint toàn range nhất. Đếm hàng có ít nhất hai TPO trên/dưới Fair Price để ước lượng buyer/seller imbalance theo phương pháp Part I.
- **Initial Balance / Range Extension**: IB mặc định 60 phút (có thể chọn 30/60/90/100/120 phút), IBH/IBL, range extension lên/xuống và Pioneer Range.
- **Extremes / Single Prints**: tô hàng có một TPO; extreme trên/dưới cần ít nhất hai hàng single-print liên tiếp để xác nhận có cạnh tranh tiếp diễn. Đây là tiêu chí theo CBOT guide.
- **Day type**: Normal, Normal Variation, Trend, Neutral hoặc IB đang hình thành. Phân loại là phép suy ra theo IB/range extension, không phải tín hiệu vào lệnh.

### Parts II–V · Long-term auction, value, distribution and decisions

- **Long-Term Auction Chart (Part II)**: lịch sử nhiều phiên hiển thị range, VAH/VAL, POC/control price, value migration, opening location so với previous Value Area, failed range-extension candidate và trạng thái mỗi phiên. Bảng activity phân biệt hoạt động extreme, range extension và value area cho buyer/seller; mỗi vùng được gắn Initiating/Responsive/Within Value dựa trên quan hệ với previous Value.
- **70% range / value migration**: TPO-count Value Area dùng mở rộng từng hàng. Khi chọn M1 tick-volume hoặc quote-count proxy, Value Area dùng cách CBOT LDB mô tả: bắt đầu từ hàng có metric lớn nhất, so sánh tổng hai hàng kế tiếp phía trên với hai hàng phía dưới và mở rộng theo phía lớn hơn; nếu bằng nhau thì mở rộng hai phía. Đây vẫn là tick/quote proxy, không phải CBOT 70% contract-volume range. Bảng ghi rõ nguồn và phương pháp, phiên thiếu nguồn tự fallback về TPO.
- **Composite Profile (Part IV)**: cộng TPO theo hàng giá qua số phiên nhìn lại, tính composite POC, VAH/VAL và Fair Price. Có thêm bảng *Natural Trading Units* để nhóm các phiên quanh dấu hiệu directional move/value migration; hiển thị range, control price, developing value và phase. Ranh giới unit lấy từ dữ liệu M1 theo phiên, nên là approximation: tài liệu CBOT nhấn mạnh một new beginning có thể xuất hiện giữa phiên.
- **3-1-3 / 1-2-3 / 3-2-1**: 3-1-3 là phân phối cân bằng với volume/value base ở giữa; 1-2-3 bắt đầu bằng rotations rồi chuyển sang directional move; 3-2-1 bắt đầu directional rồi phát triển rotations. Khi có ma trận bracket, module kiểm tra sự đổi vùng giá hoạt động theo trình tự bracket để đánh dấu 1-2-3/3-2-1. Đây là TPO/price proxy; không thay thế volume futures thực. Hai J-shaped units liên tiếp có cấu trúc tương ứng được đánh dấu là composite candidate.
- **Price control / Activity control & Four-step behaviour**: theo dõi directional move → balance → test → continuation/change ở cấp phiên và thứ tự bracket bên trong phiên; bảng intraday hiển thị range, overlap và phase của tối đa 24 bracket gần nhất. Các nhãn là suy luận từ M1/TPO, không phải phân loại participant thật hay xác suất dự báo.
- **Part III · Perception of Value**: giá hiện tại được đối chiếu với composite Value. Trader có thể tự chọn Surprise, Unlikely hoặc Likely Event để hiển thị khuôn khổ near-/intermediate-/long-term của CBOT. Phần mềm không tự đọc tin tức hoặc đoán sự kiện fundamental từ biểu đồ.
- **Part V · Key reference points**: near-term control price = POC phiên mới nhất; intermediate-term control = trung bình các POC của 3/5/8/10 phiên được chọn; long-term control = composite POC. Hiển thị long-term high/low, composite VAH/VAL, current-unit high/low, developing VAH/VAL và control. Status phân biệt giá ở trên/dưới, đã test hoặc close đã cắt qua tham số.
- **Minus Development**: cho phép chọn trade location hoặc dùng close hiện tại, hướng lên/xuống/tự động và ngưỡng emerging activity 2–12 TPO (mặc định 4 TPOs across). Module đo khoảng thiếu phát triển giữa vị trí tham chiếu và hàng có đủ TPO; so sánh khoảng này với phiên trước. Nó không tự xác định điểm thoát lệnh.
- **Six-area activity matrix**: 12 cột: Seller/Buyer × Initiating/Responsive × Extreme/Range Extension/Value Area; hoạt động nằm trong previous Value được báo riêng là *Within value · judgment* thay vì ép phân loại.

### Part VI · Liquidity Data Bank / CTI

- Trang Data/LDB có **Activity by Price** với POC theo activity metric, phần trăm tổng tại từng mức giá, tỷ lệ nửa trên/nửa dưới, vị trí activity base và vùng 70% mở rộng theo thuật toán CBOT LDB (bắt đầu từ hàng cao nhất, so sánh hai hàng kế tiếp phía trên/dưới, mở rộng về phía có tổng lớn hơn).
- Nguồn có thể chọn: **Auto** ưu tiên quote profile khi độ phủ footprint >=75%, nếu không thì dùng M1 tick-volume proxy; **Footprint quote events** hoặc **M1 tick volume** có thể ép thủ công. Nếu quote coverage thấp, UI cảnh báo độ phủ; nếu M1 volume được dùng, mỗi phút được phân bổ đều trên các hàng giá chạm trong OHLC nên vị trí volume là ước lượng.
- Có so sánh facilitation proxy giữa hai phiên (hướng giá và thay đổi tổng activity) chỉ khi nguồn và độ phủ tương thích, phiên đã đóng và số phút dữ liệu đủ gần nhau. Không tự suy ra continuation/reversal.
- **Không thể tái tạo LDB/CTI thật từ cTrader Forex/CFD**: LDB trong tài liệu CBOT có volume hợp đồng theo giá và CTI1–CTI4 (nhóm participant). Feed cTrader trong dự án chứa thay đổi báo giá Bid/Ask, không có tape giao dịch futures tập trung hay phân loại CTI. Các con số quote là proxy hoạt động báo giá; không được gán thành số hợp đồng, delta khớp lệnh hoặc participation futures.

### Nguồn dữ liệu, Replay và giới hạn

- **M1 history**: TPO multi-session tải lịch sử M1 qua cTrader theo cửa sổ nhiều ngày, hiện tối đa khoảng 62 ngày để đáp ứng tối đa 30 phiên tùy session length. Dữ liệu này đủ để xây TPO/auction proxy dài hạn.
- **Footprint quote rows**: module dùng chung FPM với Footprint và chỉ có độ phủ lịch sử tick/quote trong giới hạn của bộ tải Footprint (hiện tối đa 3 ngày gần nhất). Khi FPM có dữ liệu, TPO ưu tiên các mức quote theo phút; khi không có sẽ fallback về High–Low của M1. Phần cũ hơn vì thế có thể dựa vào M1 range estimate.
- **Replay**: advanced TPO chỉ đọc M1 đã được cắt tới thời điểm Replay; không dùng FPM lịch sử để tránh nhìn trước tương lai. Khi Replay bật, không tự tải thêm lịch sử tương lai.
- **Đơn vị dữ liệu**: cTrader Forex/CFD không tương đương futures tập trung. OHLC range, tick volume và quote-event counts chỉ là proxy. Part VI đòi hỏi trade volume thật theo price; CTI yêu cầu feed có participant classification. Không có nguồn đó thì không được giả lập. Activity profile mới được thêm nhằm áp dụng phương pháp tổ chức của LDB lên proxy một cách minh bạch; nó không biến nguồn CFD thành volume futures.
- Market Profile là công cụ tổ chức và phân tích auction/value, không phải hệ thống phát lệnh mua/bán. Classification, natural units và event context vẫn cần trader xác nhận.

## Options · XAU Commodity Options (Binance) — WebSocket V3

Mục Options kết nối thẳng từ trình duyệt tới Binance WebSocket; không cần API Key, Worker hoặc Node.js.

### Các stream

- `xauusdt@optionMarkPrice` trên `/market/ws/`: dựng Option Chain, Mark Price, Mark IV, Delta, Gamma, Vega, Theta và Index Price.
- `!index@arr` trên `/market/ws/`: Index Price tổng hợp.
- `xauusdt@openInterest@YYMMDD` trên `/market/ws/`: Open Interest theo từng expiry, chu kỳ 60 giây. V3 mở stream cho **tất cả expiry đang xuất hiện trong Mark Price feed**, không chỉ expiry đang được chọn; việc này tránh dashboard bị rỗng khi expiry mặc định là kỳ hạn 0D chưa có OI.
- `xauusdt@optionTrade` trên `/public/ws/`: từng giao dịch mới phát sinh sau khi kết nối.
- `xauusdt@optionTickerYYMMDD` trên `/public/ws/`: số liệu ticker 24 giờ của từng expiry, gồm volume hợp đồng, quote volume và số lệnh. Đây là số liệu tổng hợp 24h, không phải danh sách giao dịch/tape.

### Cách xử lý dữ liệu

- OI được ghép theo `symbol` hợp đồng (ví dụ `XAU-YYMMDD-4000-C`) với Mark Price/Greeks cùng symbol.
- Khi expiry người dùng chưa tự chọn và expiry mặc định không có OI dương, module tự chuyển sang expiry gần nhất đã nhận được OI dương. Người dùng có thể chọn expiry thủ công; lựa chọn thủ công được giữ nguyên.
- OI chưa nhận bản tin sẽ hiển thị `—`, không nhầm với số 0. Binance OI stream có nhịp cập nhật 60 giây.
- Options Flow hiển thị live trade prints khi Binance phát trade. Khi chưa có print mới, bảng hiển thị thống kê 24h từ `optionTicker` nếu có. Binance trade stream không phát lịch sử trước thời điểm subscribe; ticker 24h chỉ gửi khi thống kê của symbol thay đổi.
- `window.optionsDebug()` trả trạng thái từng socket, URL, lỗi từ Binance, payload gần nhất, expiry codes, số bản tin OI/ticker/trade và danh sách symbol nhận được để chẩn đoán nếu một stream chưa có dữ liệu.

### Công thức và giới hạn

Delta Notional = Σ(Delta × OI × contract unit × S).

Gamma Exposure cho biến động 1% = Σ(Gamma × OI × contract unit × S² × 0.01).

Contract unit/multiplier của XAUUSDT là 1. Vega và Theta được cộng theo native units Binance phát; không tự ý đổi scale.

### Phần phân tích được bổ sung

- **Key Levels**: Call Wall, Put Wall (strike có trị tuyệt đối Call/Put GEX cao nhất), Gamma Flip (điểm cumulative GEX đổi dấu), Wall của metric đang chọn, OI Wall và Net Exposure của metric đang chọn.
- **Open Interest by Strike**: biểu đồ Call/Put OI, đánh dấu OI Wall và hiển thị số hợp đồng; **Theta by Strike**: Call/Put Theta × OI, có đường zero và Max |Theta|.
- **Exposure selector**: GEX, DEX, VEX, VGEX, CHEX, THEX. GEX/DEX/VGEX/THEX dựa trên Greeks Binance; VEX/CHEX là ước lượng Black–Scholes vì mark stream không cung cấp Vanna/Charm.
- **Copy Levels**: sao chép Spot, CW/PW, Gamma Flip, OI Wall, top 10 GEX strikes và các metric walls; thêm Net GEX/Net metric đang chọn.
- **Exposure Surface / Greek Surface**: mô phỏng strike × time-to-expiry bằng Three.js; có thể xoay bằng kéo, zoom bằng wheel/pinch và reset camera. Greek Surface chọn Greek và Call/Put riêng.
- **Surface Scenario Parameters**: thay đổi Spot (S), DTE, risk-free rate (r) và yield (q). Để trống dùng Spot/expiry/rate live và q = 0; Auto / Reset khôi phục chế độ này. Các giả định chỉ tác động Surface, không ghi đè dữ liệu realtime ở Option Chain, OI hay Exposure bars.
- Surface giữ Mark IV và OI cố định; Delta/Gamma/Vega/Theta được scale-calibrate theo mark Greeks Binance ở điều kiện live rồi mới chiếu sang kịch bản. Vanna/Charm vẫn là model estimate; expiry settlement time được ước tính theo ngày lịch vì feed không cung cấp timestamp settlement chính xác.


Open Interest không xác định bên Long/Short hay vị thế dealer. Exposure Scenario Long/Short chỉ là hai giả định đảo dấu trên cùng OI, không phải dealer positioning thật. XAU Commodity Options là hợp đồng European-style, USDT-settled; retail chỉ được mở vị thế mua.

### Vận hành

WebSocket tự reconnect khi socket đóng bất thường. Các raw stream được mở riêng theo market/public endpoints; module tự đóng socket khi rời trang Options. Trade prints là event-driven; 24h ticker là snapshot thống kê gộp được đẩy khi dữ liệu thay đổi. Dữ liệu phải được kiểm tra live trên trình duyệt người dùng; test mô phỏng payload chỉ xác nhận parser/render logic, không thay thế xác nhận từ Binance.

## Quant Lab · Statistical Data Explorer (MVP Phase 1)

Mục **Quant Lab** được thêm như một khu vực độc lập, không sửa Chart, Orderflow, Options, TPO hay Replay.

- **Import CSV**: hỗ trợ file có header, dấu phân cách comma / semicolon / tab, ô có dấu nháy kép; file dùng dấu `;` hoặc tab có thể dùng dấu phẩy thập phân.
- **Lấy M1 từ Chart**: nạp bản sao các nến M1 đang có trong bộ nhớ Chart. Nếu Replay đang bật, dữ liệu lấy theo phần lịch sử đang được Replay công khai, không tự lấy lại phần tương lai đã bị cắt.
- **Dữ liệu DEMO**: tạo chuỗi tổng hợp để thử giao diện và phép tính; không phải dữ liệu thị trường.
- **Descriptive Statistics**: count, mean, median, sample variance, sample standard deviation, min, Q1, Q3, max, skewness, excess kurtosis và số giá trị thiếu của biến được chọn.
- **Return Analysis**: simple return, log return và thống kê cơ bản.
- **Correlation Matrix**: Pearson correlation trên các quan sát hợp lệ theo cặp, tối đa 8 biến được chọn.
- Histogram, series plot và data preview.

Mở `http://localhost:8000/#quant` sau khi chạy web server tĩnh. Các phép tính hiện chạy ở trình duyệt; dữ liệu chưa được upload, lưu bền vững hoặc xử lý bằng backend. Test tính toán: `node tests/quant-stats.test.js`.

**Giới hạn dữ liệu:** cột Volume lấy từ cTrader trong bản này vẫn là tick-volume/quote proxy do broker cung cấp, không phải contract volume Futures tập trung.


## Gexadecimal Quant Lab (Phase 1–3)

Bản source hiện có Quant Lab cho Statistical Data Explorer, OLS Regression và Time Series. Đọc hướng dẫn tiếng Việt và báo cáo rà soát: `QUANTLAB_USER_GUIDE_VI.md`, `QUANTLAB_AUDIT_REPORT.md`, `QUANT_LAB_MVP.md`, `QUANT_PHASE3_GUIDE.md`. Quant Lab chạy client-side; không cần Python để sử dụng.


## Quant Lab Research Extensions 1.1 (05-11-2026)

Bản source này mở rộng Quant Lab Phase 1–3 với Data Quality Audit cho timestamp/timezone/duplicate/order/gaps; Return Distribution và quantiles; rolling volatility nhiều cửa sổ; Realized Volatility, Bipower Variation và Jump Variation ước lượng; ACF/Ljung–Box cho returns, absolute returns và squared returns; Lagged Return Regression; expanding-window Walk-forward so với naïve Random Walk; cùng phần Research Interpretation trong giao diện.

Xem `QUANTLAB_RESEARCH_EXTENSION_GUIDE_VI.md` để biết công thức, cách đọc kết quả, giả định và giới hạn. Các engine ARCH/GARCH, VAR/VECM, Cointegration, Granger, Bootstrap/Monte Carlo và Regime Detection nâng cao vẫn chưa được triển khai.
