/* =================== VSA WYCKOFF VOLUME ===========================
   Vẽ label phân tích VSA lên canvas chính (không thay đổi dữ liệu nến).
   Nhận diện các tín hiệu VSA Wyckoff kinh điển và ghi chú trực tiếp
   lên cây nến tương ứng.
   ================================================================= */

/* ---- Persistent settings ---- */
const VSA_STORE_KEY = "tp_vsa_v1";
const VSA_DEFAULTS = {
  enabled: true,
  maLen: 20,
  ratioUltra: 2.2,
  ratioVeryHigh: 1.8,
  ratioHigh: 1.2,
  ratioNormal: 0.8,
  ratioLow: 0.4,
  showLabels: true,
  showMA: true,
  lookback: 300       // số nến tối đa để vẽ label (tránh tắc canvas)
};
function vsaLoadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(VSA_STORE_KEY) || "{}") || {}; } catch {}
  const o = { ...VSA_DEFAULTS, ...s };
  ["maLen","lookback"].forEach(k => { o[k] = Math.max(2, Math.round(Number(o[k]) || VSA_DEFAULTS[k])); });
  ["ratioUltra","ratioVeryHigh","ratioHigh","ratioNormal","ratioLow"].forEach(k => {
    o[k] = Number.isFinite(+o[k]) && +o[k] > 0 ? +o[k] : VSA_DEFAULTS[k];
  });
  return o;
}
const VSA = { options: vsaLoadSettings(), cache: null, version: 0 };
function vsaSave() {
  try { localStorage.setItem(VSA_STORE_KEY, JSON.stringify(VSA.options)); } catch {}
  VSA.version++; VSA.cache = null;
  if (typeof dirty !== "undefined") dirty = true;
}

/* ---- Wilder MA (giống Pine: nz(ma[1]) + (vol - nz(ma[1])) / len) ---- */
function vsaWilderMA(arr, len) {
  const out = new Array(arr.length).fill(null);
  if (!arr.length) return out;
  let ma = null;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) { out[i] = ma; continue; }
    ma = ma === null ? v : ma + (v - ma) / len;
    out[i] = ma;
  }
  return out;
}

/* ---- Volume tier classification ---- */
function vsaTier(vol, ma, o) {
  if (!ma || !vol) return "veryLow";
  const r = vol / ma;
  if (r >= o.ratioUltra)    return "ultra";
  if (r >= o.ratioVeryHigh) return "veryHigh";
  if (r >= o.ratioHigh)     return "high";
  if (r >= o.ratioNormal)   return "normal";
  if (r >= o.ratioLow)      return "low";
  return "veryLow";
}

/* ---- Spread helpers ---- */
function vsaSpread(bar)  { return bar.high - bar.low; }
function vsaBody(bar)    { return Math.abs(bar.close - bar.open); }
// Vị trí đóng cửa trong spread: 0 = đáy, 1 = đỉnh
function vsaClosePos(bar) {
  const sp = vsaSpread(bar);
  return sp > 0 ? (bar.close - bar.low) / sp : 0.5;
}
function vsaIsUp(bar)    { return bar.close >= bar.open; }

/* ---- Core VSA pattern detect (1 bar, cần lookback context) ---- */
/*
  Trả về { id, label, color, side:"top"|"bot", priority:1-5 } hoặc null.
  priority 5 = quan trọng nhất, ưu tiên vẽ khi nhiều signal cùng bar.

  Tín hiệu được nhận biết:
  BULLISH:
  - STOPPING_VOL  : Ultra/VeryHigh vol, spread rộng XUỐNG, close ở trên giữa (supply bị hấp thụ)
  - SHAKEOUT      : Spike cực mạnh xuống rồi đóng trên giữa (spring)
  - NO_SUPPLY     : Spread hẹp XUỐNG, vol thấp/rất thấp (không còn supply)
  - TEST_SUPPLY   : Test lại vùng thấp, vol thấp, close ở cao (xác nhận cạn supply)
  - EFFORT_UP     : Vol cao + spread rộng LÊN + close gần đỉnh (effort to rise)

  BEARISH:
  - UPTHRUST      : Spread rộng LÊN, vol cao/ultra, close ở dưới giữa (demand bị reject)
  - NO_DEMAND     : Spread hẹp LÊN, vol thấp/rất thấp (không có demand)
  - SUPPLY_ENTER  : Vol ultra/veryHigh, spread vừa-rộng LÊN nhưng close thấp < 40% (supply xuất hiện)
  - EFFORT_DN     : Vol cao + spread rộng XUỐNG + close gần đáy (effort to fall)
  - CLIMAX        : Ultra vol bất kể chiều + spread rất rộng (buying/selling climax)
*/
function vsaDetect(bar, prev, tier, prevTier, avgSpread) {
  const cp   = vsaClosePos(bar);
  const sp   = vsaSpread(bar);
  const up   = vsaIsUp(bar);
  const wideSpread = sp >= avgSpread * 1.2;
  const narrowSpread = sp <= avgSpread * 0.6;
  const highVol   = tier === "ultra" || tier === "veryHigh" || tier === "high";
  const lowVol    = tier === "low" || tier === "veryLow";
  const ultraHigh = tier === "ultra" || tier === "veryHigh";

  // 1. CLIMAX (ưu tiên cao nhất — ultra vol + spread cực rộng)
  if (tier === "ultra" && sp >= avgSpread * 1.6) {
    return up
      ? { id:"BUYING_CLIMAX",  label:"🔺 BC",       color:"#ff4d4d", side:"top", priority:5 }
      : { id:"SELLING_CLIMAX", label:"🔻 SC",       color:"#26c882", side:"bot", priority:5 };
  }

  // 2. UPTHRUST — spread rộng lên, vol cao, close dưới 40%
  if (!up && wideSpread && highVol && cp < 0.40) {
    return { id:"UPTHRUST", label:"UT", color:"#ff6b35", side:"top", priority:4 };
  }
  // Variation: close hơi cao nhưng vẫn dưới 50%, ultra vol
  if (up && wideSpread && ultraHigh && cp < 0.50) {
    return { id:"UPTHRUST", label:"UT", color:"#ff6b35", side:"top", priority:4 };
  }

  // 3. STOPPING VOLUME / SPRING — spread rộng xuống, ultra/veryHigh vol, close trên 50%
  if (!up && wideSpread && ultraHigh && cp > 0.50) {
    const isShakeout = cp > 0.70 && prev && !vsaIsUp(prev);
    return isShakeout
      ? { id:"SHAKEOUT",      label:"SHK",  color:"#00e5ff", side:"bot", priority:5 }
      : { id:"STOPPING_VOL",  label:"SV",   color:"#26c882", side:"bot", priority:4 };
  }

  // 4. SUPPLY ENTERING — lên, ultra vol, close thấp < 40%
  if (up && ultraHigh && cp < 0.40) {
    return { id:"SUPPLY_ENTER", label:"SE", color:"#ff4d4d", side:"top", priority:4 };
  }

  // 5. EFFORT UP — vol cao, spread rộng lên, close > 65%
  if (up && wideSpread && highVol && cp > 0.65) {
    return { id:"EFFORT_UP", label:"EU", color:"#7fff6e", side:"top", priority:3 };
  }

  // 6. EFFORT DOWN — vol cao, spread rộng xuống, close < 35%
  if (!up && wideSpread && highVol && cp < 0.35) {
    return { id:"EFFORT_DN", label:"ED", color:"#ff6b35", side:"bot", priority:3 };
  }

  // 7. NO DEMAND — spread hẹp lên, vol thấp
  if (up && narrowSpread && lowVol) {
    return { id:"NO_DEMAND", label:"ND", color:"#ffb02e", side:"top", priority:2 };
  }

  // 8. NO SUPPLY — spread hẹp xuống (hoặc doji), vol thấp
  if (!up && narrowSpread && lowVol) {
    return { id:"NO_SUPPLY", label:"NS", color:"#35b6ff", side:"bot", priority:2 };
  }

  // 9. TEST SUPPLY — vol thấp, close > 60%, spread vừa/hẹp (giá test xuống rồi đóng cao)
  if (!up && lowVol && cp > 0.60) {
    return { id:"TEST_SUPPLY", label:"TS", color:"#35b6ff", side:"bot", priority:2 };
  }

  return null;
}

/* ---- Full text tooltip cho từng pattern ---- */
const VSA_DESC = {
  BUYING_CLIMAX:  "Buying Climax: Ultra vol, spread rộng lên nhưng đây là đỉnh — Smart Money đang bán cho đám đông. Cảnh báo đảo chiều giảm.",
  SELLING_CLIMAX: "Selling Climax: Ultra vol, spread rộng xuống — Smart Money đang mua hết supply. Dấu hiệu đáy tiềm năng.",
  UPTHRUST:       "Up Thrust: Spread rộng lên, vol cao, đóng thấp — demand bị reject, supply xuất hiện mạnh. Bearish.",
  SHAKEOUT:       "Shakeout / Spring: Spike xuống cực mạnh rồi đóng trên giữa — bẫy bear, fakeout xuống để bắt SL. Bullish reversal.",
  STOPPING_VOL:   "Stopping Volume: Ultra vol xuống, close trên 50% — supply đang bị hấp thụ, khả năng đáy ngắn hạn.",
  SUPPLY_ENTER:   "Supply Entering: Ultra vol lên nhưng đóng thấp — Smart Money đang bán vào rally. Bearish.",
  EFFORT_UP:      "Effort to Rise: Vol cao + spread rộng lên + close mạnh — lực mua thật, xác nhận uptrend.",
  EFFORT_DN:      "Effort to Fall: Vol cao + spread rộng xuống + close yếu — lực bán thật, xác nhận downtrend.",
  NO_DEMAND:      "No Demand: Spread hẹp lên, vol thấp — không có lực mua thật sau rally. Bearish / cảnh báo.",
  NO_SUPPLY:      "No Supply: Spread hẹp xuống, vol thấp — không có lực bán thật. Bullish / xác nhận tích lũy.",
  TEST_SUPPLY:    "Test: Vol thấp, giá test xuống rồi đóng cao — supply đã cạn, xác nhận nền tảng. Bullish."
};

/* ---- Build annotation cache ---- */
function vsaCacheKey() {
  if (!agg.length) return "";
  const last = agg[agg.length - 1];
  return [VSA.version, C.sym, C.tf, agg.length, last.st, JSON.stringify(VSA.options)].join("|");
}

function vsaBuildCache() {
  if (!agg.length) return [];
  const o = VSA.options;
  const len = o.maLen;
  const limit = Math.min(agg.length, o.lookback + len);
  const slice = agg.slice(Math.max(0, agg.length - limit));
  const vols = slice.map(b => b.vol != null ? b.vol : (b.high - b.low)); // fallback tick range
  const spreads = slice.map(b => b.high - b.low);
  const maArr = vsaWilderMA(vols, len);

  // Rolling avg spread (same Wilder approach)
  const maSpArr = vsaWilderMA(spreads, len);

  const out = [];
  for (let i = len; i < slice.length; i++) {
    const b = slice[i], prev = slice[i - 1];
    const ma = maArr[i], maSp = maSpArr[i];
    if (!ma || !maSp) continue;
    const tier = vsaTier(vols[i], ma, o);
    const prevTier = vsaTier(vols[i-1], maArr[i-1], o);
    const sig = vsaDetect(b, prev, tier, prevTier, maSp);
    if (sig) out.push({ bar: b, sig, ma, tier });
  }
  return out;
}

function vsaEnsureCache() {
  const key = vsaCacheKey();
  if (!VSA.cache || VSA.cache.key !== key) {
    VSA.cache = { key, data: vsaBuildCache() };
  }
  return VSA.cache.data;
}

/* ---- Canvas helpers (reuse dttX pattern) ---- */
function vsaX(bar) {
  try { return ts.logicalToCoordinate(s2l(bar.st)); } catch { return null; }
}
function vsaY(price) {
  try { return cs.priceToCoordinate(price); } catch { return null; }
}
function vsaRgba(hex, a) {
  const s = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map(x => x + x).join("") : s.slice(0, 6), 16);
  const alpha = Math.max(0, Math.min(1, a ?? 1));
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha})`;
}

/* ---- Main draw hook ---- */
function drawVSA(w, h) {
  if (!VSA.options.enabled) return;
  if (!agg.length) return;
  try {
    const annotations = vsaEnsureCache();
    if (!annotations.length) return;

    ctx.save();
    ctx.font = "bold 9px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = "center";

    for (const ann of annotations) {
      const { bar, sig } = ann;
      const x = vsaX(bar);
      if (x == null || !Number.isFinite(x) || x < 0 || x > w) continue;

      const yTop = vsaY(bar.high);
      const yBot = vsaY(bar.low);
      if (yTop == null || yBot == null) continue;

      const isTop = sig.side === "top";
      const y = isTop ? yTop - 14 : yBot + 14;
      if (y < 0 || y > h) continue;

      // Badge background
      const tw = ctx.measureText(sig.label).width + 8;
      const bx = x - tw / 2, by = isTop ? y - 10 : y - 1, bh = 12;
      ctx.fillStyle = vsaRgba(sig.color, 0.18);
      ctx.strokeStyle = vsaRgba(sig.color, 0.85);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, tw, bh, 3) : ctx.rect(bx, by, tw, bh);
      ctx.fill(); ctx.stroke();

      // Label text
      ctx.fillStyle = sig.color;
      ctx.textBaseline = isTop ? "bottom" : "top";
      ctx.fillText(sig.label, x, isTop ? by + bh : by);

      // Connector line from badge to bar H/L
      const lineY0 = isTop ? by + bh + 1 : by - 1;
      const lineY1 = isTop ? yTop : yBot;
      if (Math.abs(lineY1 - lineY0) > 2) {
        ctx.beginPath();
        ctx.strokeStyle = vsaRgba(sig.color, 0.4);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.moveTo(x, lineY0);
        ctx.lineTo(x, lineY1);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  } catch (e) {
    if (typeof chErr === "function") chErr("VSA", e);
  }
}

/* ---- Settings UI ---- */
function vsaBuildSettings() {
  const el = $("vsaSettings"); if (!el) return;
  const o = VSA.options;
  const chk = (key, label, val) =>
    `<label class="dtt-check"><input type="checkbox" data-vsa="${key}"${val ? " checked" : ""}><span>${label}</span></label>`;
  el.innerHTML = `
<div class="dtt-head">
  <div>
    <h2>VSA Wyckoff Volume <span class="pill">Volume Spread Analysis</span></h2>
    <p class="msg">Phân tích volume, spread và vị trí close để nhận diện hành động Smart Money (Wyckoff). Label được vẽ thẳng lên chart.</p>
  </div>
  <button type="button" class="btn sm ${o.enabled ? "" : "ghost"}" data-vsa="enabled">${o.enabled ? "Đang bật" : "Đang tắt"}</button>
</div>
<div class="dtt-options">
  <label class="dtt-field">Volume MA Length (Wilder)
    <input type="number" min="2" max="200" step="1" data-vsa="maLen" value="${o.maLen}">
  </label>
  <label class="dtt-field">Số nến tối đa hiển thị label
    <input type="number" min="20" max="1000" step="10" data-vsa="lookback" value="${o.lookback}">
  </label>
</div>
<div class="dtt-options">
  <label class="dtt-field">Ultra High Vol Ratio <input type="number" min="1" step="0.1" data-vsa="ratioUltra" value="${o.ratioUltra}"></label>
  <label class="dtt-field">Very High Vol Ratio  <input type="number" min="1" step="0.1" data-vsa="ratioVeryHigh" value="${o.ratioVeryHigh}"></label>
  <label class="dtt-field">High Vol Ratio       <input type="number" min="0.5" step="0.1" data-vsa="ratioHigh" value="${o.ratioHigh}"></label>
  <label class="dtt-field">Normal Vol Ratio     <input type="number" min="0.1" step="0.1" data-vsa="ratioNormal" value="${o.ratioNormal}"></label>
  <label class="dtt-field">Low Vol Ratio        <input type="number" min="0.1" step="0.1" data-vsa="ratioLow" value="${o.ratioLow}"></label>
</div>
<div class="dtt-toggles">
  ${chk("showLabels","Hiện label tín hiệu VSA trên chart", o.showLabels)}
</div>
<table class="vsa-legend">
  <tr><th colspan="3" style="padding-bottom:6px;font-size:11px;opacity:.7">Bảng tín hiệu VSA</th></tr>
  ${Object.entries(VSA_DESC).map(([id, desc]) => {
    const colors = {
      BUYING_CLIMAX:"#ff4d4d",SELLING_CLIMAX:"#26c882",UPTHRUST:"#ff6b35",
      SHAKEOUT:"#00e5ff",STOPPING_VOL:"#26c882",SUPPLY_ENTER:"#ff4d4d",
      EFFORT_UP:"#7fff6e",EFFORT_DN:"#ff6b35",NO_DEMAND:"#ffb02e",
      NO_SUPPLY:"#35b6ff",TEST_SUPPLY:"#35b6ff"
    };
    return `<tr>
      <td style="color:${colors[id]||'#fff'};font-weight:700;font-size:10px;white-space:nowrap;padding:3px 8px 3px 0">${id.replace(/_/g," ")}</td>
      <td style="font-size:10px;opacity:.8;padding:3px 0;line-height:1.4">${desc}</td>
    </tr>`;
  }).join("")}
</table>
<p class="msg dtt-note">VSA dùng tick volume của MT5 (hoặc biên độ nến nếu không có volume). Tín hiệu chỉ là gợi ý — luôn xác nhận với price action và context Wyckoff (accumulation / distribution phase).</p>`;
}

function vsaSetValue(key, value) {
  const o = VSA.options;
  if (key === "enabled" || key === "showLabels") o[key] = !!value;
  else if (["maLen","lookback"].includes(key)) o[key] = Math.max(2, Math.round(Number(value) || VSA_DEFAULTS[key]));
  else if (["ratioUltra","ratioVeryHigh","ratioHigh","ratioNormal","ratioLow"].includes(key)) o[key] = Math.max(0.1, Number(value) || VSA_DEFAULTS[key]);
  vsaSave();
  vsaBuildSettings();
}

/* ---- Event wiring ---- */
const vsaPanel = $("vsaSettings");
if (vsaPanel) {
  vsaPanel.addEventListener("change", e => {
    const t = e.target, key = t && t.dataset && t.dataset.vsa;
    if (!key) return;
    vsaSetValue(key, t.type === "checkbox" ? t.checked : t.value);
  });
  vsaPanel.addEventListener("click", e => {
    const t = e.target.closest("button[data-vsa='enabled']");
    if (t) vsaSetValue("enabled", !VSA.options.enabled);
  });
}
// Deep-link init (như DTT)
if ($("v-ind") && $("v-ind").classList && $("v-ind").classList.contains("on")) vsaBuildSettings();
