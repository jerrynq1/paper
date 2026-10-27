# Indicator Lab

Bản rút gọn của signal-bridge chỉ giữ **chart**, **indicator** (kể cả Orderflow: Footprint, Big Trade, Statistic) và **kết nối cTrader Open API**. Không còn đăng nhập Discord, Journal, TPO, Lịch kinh tế, nhiều chart, đa ngôn ngữ hay worker.

## Chạy

Mở `index.html` trực tiếp, hoặc phục vụ qua một web server tĩnh cho tiện:

    python3 -m http.server 8000      # rồi mở http://localhost:8000

Cần Internet để tải thư viện lightweight-charts (CDN) và font.

## Kết nối cTrader

Vào mục **Kết nối**, nhập Client ID, Client Secret, Access Token (tuỳ chọn: Account ID, môi trường) rồi bấm **Lưu & kết nối**. Trình duyệt nối thẳng tới `wss://live|demo.ctraderapi.com:5036`, tự chọn máy chủ live/demo theo tài khoản của token. Key lưu trong `localStorage` (khoá `ct_cfg`) của trình duyệt này.

> Client Secret và Access Token nằm trong trình duyệt nên bản này chỉ dùng để test ở máy cá nhân, đừng đưa lên hosting công khai.

## Thêm indicator mới

Sửa `js/indicators-custom.js` (đã có sẵn một mẫu `IND.mine` và hướng dẫn cấu trúc ở đầu file), tải lại trang rồi thêm indicator ở mục **Indicator**. Các indicator có sẵn nằm ở `js/indicators-defs.js`, phần vẽ/tính toán ở `js/indicators-engine.js`.

## Cấu trúc

- `js/ctrader.js`: kết nối, đăng nhập, nến M1, tick, footprint
- `js/chart.js`, `js/candle-style.js`, `js/timezone.js`, `js/symbols.js`: chart, màu nến, múi giờ, chọn mã
- `js/indicators-*.js`, `js/volume-profile.js`, `js/orderflow-*.js`: indicator
- `js/orderflow-absorption.js`: Heavy Absorption (tính ngưỡng + vẽ marker); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.hab`)
- `js/orderflow-dom.js`: DOM / MBO (kênh depth cTrader, bảng bên phải + histogram thanh khoản ở mép phải chart); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.dom`)
- `js/hvn-profile.js`: HVN Profile (tính cụm HVN + vẽ canvas); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.hvn`)
- `js/killzones.js`: Killzones & Pivots (tính phiên/pivot/level/D-W-M + vẽ canvas + bảng thống kê); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.kz`)
- `js/goldbach.js`: Goldbach Levels (tính PO3 + level + vẽ canvas); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.gb`)
- `js/qt.js`: Quarterly Theory (tính chu kỳ A-M-D-X + vẽ thanh các làn); khai báo thông số ở cuối `js/indicators-custom.js` (`IND.qt`)
- `js/replay.js`: Replay để backtest (thanh điều khiển nổi, cắt/nối lại mảng `m1`); `RP` và `RPLIM()` khai báo ở đầu `js/chart.js`
- `js/drawings-*.js`, `js/mobile.js`: công cụ vẽ và cử chỉ cảm ứng
- `tests/`: `node tests/footprint.test.js`, `node tests/customtf.test.js`, `node tests/hvn.test.js`, `node tests/hab.test.js`, `node tests/dom.test.js`, `node tests/replay.test.js`, `node tests/killzones.test.js`, `node tests/goldbach.test.js`, `node tests/qt.test.js`

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
