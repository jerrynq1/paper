/* ================= REPLAY: xem lại giá chạy để backtest (giống Replay của TradingView) =================
   Ý tưởng: chart chỉ dùng mảng `m1` (nến M1) làm gốc, mọi khung giờ và mọi indicator đều dựng từ nó. Nên replay chỉ cần
   CẮT m1 tại điểm bắt đầu: phần trước điểm cắt ở lại trong `m1` (chart + indicator chỉ thấy quá khứ, không nhìn trộm tương lai),
   phần sau cắt đưa vào RP.fut. Mỗi "bước" lấy thêm nến M1 từ RP.fut đẩy vào m1 (RP.fi = số nến đã lộ ra), lùi thì rút ngược lại.
   Nến của khung đang xem (M5, H1...) tự hình thành dần từ các nến M1 nên đúng như thật. Thoát replay: nối phần còn lại vào m1 rồi bù nến tới hiện tại.
   Trong lúc replay: giá/nến live bị tạm dừng (chart.js: poll, chartWatch, catchUp, loadM1 đều kiểm tra RP.on), không đổi sang khung giây.
   Dữ liệu: cần M1 từ điểm bắt đầu tới hiện tại (không giới hạn số ngày), tải theo từng đợt như khi kéo chart sang trái. Footprint / Big Trade / Statistic dùng tick
   tải theo vùng đang xem như bình thường. DOM/MBO là dữ liệu live nên không có ý nghĩa khi replay. */

/* ===== phần thuần (không đụng DOM, có test: tests/replay.test.js) ===== */
const RP_SPEEDS=[0.1,0.3,0.5,1,3,5,10,30,60,120],RP_MINPAST=20;   // không giới hạn số ngày: lùi tới đâu thì tải M1 tới đó (broker còn dữ liệu tới đâu)
function rpLower(A,t){let lo=0,hi=A.length;while(lo<hi){const m=(lo+hi)>>1;if(A[m][0]<t)lo=m+1;else hi=m}return lo}   // chỉ số nến đầu tiên có giờ >= t
/* 1 lần cập nhật tiến: "m1" = thêm 1 nến M1; "tf" = chạy tới hết nến của khung đang xem (đang dở giữa nến thì hoàn thành nến đó, không thì cả nến kế tiếp) */
function rpUnitEnd(fut,pos,unit,tf,bk){const n=fut.length;if(pos>=n)return n;if(unit==="m1")return pos+1;const k=bk(fut[pos][0],tf);let i=pos+1;while(i<n&&bk(fut[i][0],tf)===k)i++;return i}
/* 1 lần lùi: "m1" = bớt 1 nến M1; "tf" = bỏ toàn bộ phần đã lộ của nến khung hiện tại (không lùi quá điểm bắt đầu, pos=0) */
function rpUnitBack(fut,pos,unit,tf,bk){if(pos<=0)return 0;if(unit==="m1")return pos-1;const k=bk(fut[pos-1][0],tf);let i=pos-1;while(i>0&&bk(fut[i-1][0],tf)===k)i--;return i}
function rpStepN(fut,pos,n,dir,unit,tf,bk){let p=pos;for(let i=0;i<n;i++){const q=dir>0?rpUnitEnd(fut,p,unit,tf,bk):rpUnitBack(fut,p,unit,tf,bk);if(q===p)break;p=q}return p}
function rpMove(m1,fut,fi,pos){                           // đưa m1 từ trạng thái "đã lộ fi nến" sang "đã lộ pos nến"
  pos=Math.max(0,Math.min(fut.length,Math.round(pos)));
  if(pos>fi){for(let i=fi;i<pos;i++)m1.push(fut[i])}else if(pos<fi)m1.length-=fi-pos;
  return pos}
function rpCut(m1,st){const i=rpLower(m1,st);if(i>=m1.length)return{err:"after"};if(i<RP_MINPAST)return{err:"before",i};return{i}}
const rpPct=(a,b)=>b>0?Math.max(0,Math.min(100,a/b*100)):0;

/* ===== giao diện ===== */
Object.assign(RP,{on:false,pick:false,busy:false,cancel:false,fut:[],fi:0,tot:0,startSt:0,sym:"",playing:false,acc:0,t0:0,raf:0,sk:0,want:0,drag:false,hov:null,tfShown:0,
  speed:(()=>{const v=+ld("rp_speed",3);return RP_SPEEDS.includes(v)?v:3})(),unit:ld("rp_unit","tf")==="m1"?"m1":"tf"});
const rpSvgs={
  grip:'<svg viewBox="0 0 24 24"><g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g></svg>',
  rew:'<svg viewBox="0 0 24 24"><path d="M11 6 4 12l7 6z"/><path d="M20 6l-7 6 7 6z"/></svg>',
  start:'<svg viewBox="0 0 24 24"><path d="M5 5v14"/><path d="M20 7l-6 5 6 5"/><path d="M13 7l-6 5 6 5"/></svg>',
  back:'<svg viewBox="0 0 24 24"><path class="f" d="M18 6l-8 6 8 6z"/><path d="M6 6v12"/></svg>',
  fwd:'<svg viewBox="0 0 24 24"><path class="f" d="M6 6l8 6-8 6z"/><path d="M18 6v12"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path class="f" d="M7 4.5l12 7.5-12 7.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24"><rect class="f" x="6" y="5" width="4" height="14" rx="1"/><rect class="f" x="14" y="5" width="4" height="14" rx="1"/></svg>',
  end:'<svg viewBox="0 0 24 24"><path d="M4 7l6 5-6 5"/><path d="M11 7l6 5-6 5"/><path d="M20 5v14"/></svg>',
  cut:'<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>',
  x:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  cal:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  dice:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><g fill="currentColor" stroke="none"><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/><circle cx="15" cy="15" r="1.2"/></g></svg>',
  flag:'<svg viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/></svg>'};
const rpP2=n=>String(n).padStart(2,"0");
const rpFmtD=d=>{const o=lp(d);return rpP2(o.day)+"/"+rpP2(o.month)+"/"+String(o.year).slice(2)+" "+rpP2(o.hour)+":"+rpP2(o.minute)};   // d = giờ hiển thị (như disp())
const rpFmt=st=>rpFmtD(disp(st));
const rpTzl=()=>TZ==="srv"?"giờ server":lbl(tzOff(TZ,Date.now()));
function rpD2St(d){if(TZ==="srv")return d;let u=d-tzOff(TZ,d*1000);u=d-tzOff(TZ,u*1000);return u2s(u)}     // ngược lại của disp(): giờ hiển thị -> giờ server
const rpDays=()=>m1.length>1?Math.max(1,Math.round((m1[m1.length-1][0]-m1[0][0])/86400)):0;
const rpEsc=s=>String(s).replace(/[<>&"]/g,"");
const rpFut=()=>RP.fut;

function rpSay(t,bad){RP.msg=t||"";RP.msgBad=!!bad;const e=$("rpMsg");if(e){e.textContent=RP.msg;e.classList.toggle("bad",!!bad)}}
function rpActiveHtml(){
  const sp=RP_SPEEDS.map(v=>`<option value="${v}"${v===RP.speed?" selected":""}>${v}x</option>`).join("");
  return`<div class="rpr1"><span class="rpg" title="Kéo để di chuyển thanh công cụ" aria-label="Di chuyển">${rpSvgs.grip}</span>
<button type="button" class="rb" data-a="start" title="Về điểm bắt đầu backtest" aria-label="Về điểm bắt đầu backtest">${rpSvgs.start}</button>
<button type="button" class="rb" data-a="back" title="Lùi 1 bước (Shift+←)" aria-label="Lùi 1 bước">${rpSvgs.back}</button>
<button type="button" class="rb pp" data-a="play" id="rpPl" title="Phát (Shift+↓)" aria-label="Phát">${rpSvgs.play}</button>
<button type="button" class="rb" data-a="fwd" title="Tiến 1 bước (Shift+→)" aria-label="Tiến 1 bước">${rpSvgs.fwd}</button>
<button type="button" class="rb" data-a="end" title="Tua tới nến cuối (hiện tại)" aria-label="Tua tới nến cuối">${rpSvgs.end}</button><i class="rps"></i>
<label class="rsel" title="Tốc độ: số lần cập nhật mỗi giây"><select id="rpS" aria-label="Tốc độ">${sp}</select></label>
<label class="rsel" title="Mỗi lần cập nhật chạy thêm bao nhiêu"><select id="rpU" aria-label="Cập nhật theo"><option value="tf"${RP.unit==="tf"?" selected":""}>Mỗi nến ${tfName(C.tf)}</option><option value="m1"${RP.unit==="m1"?" selected":""}>Mỗi phút (M1)</option></select></label><i class="rps"></i>
<button type="button" class="rb" data-a="repick" title="Chọn lại điểm bắt đầu" aria-label="Chọn lại điểm bắt đầu">${rpSvgs.cut}</button>
<button type="button" class="rb x" data-a="exit" title="Thoát replay, về chart trực tiếp" aria-label="Thoát replay">${rpSvgs.x}</button></div>
<div class="rpr2"><span class="rpf" title="Điểm bắt đầu backtest">${rpSvgs.flag}<b id="rpA"></b></span><div class="rpsc"><input id="rpR" type="range" min="0" max="${RP.tot}" step="1" value="${RP.fi}" aria-label="Tua tới thời điểm"><div class="rpbub" id="rpBub"></div></div><span class="rpe" id="rpZ" title="Nến cuối có dữ liệu"></span></div>
<div class="rpr3"><span class="rpi" id="rpI"></span><span class="rpm" id="rpMsg"></span></div>`}
function rpPickHtml(){
  const q=RP.presets().map(p=>`<option value="${p[0]}">${p[1]}</option>`).join("");
  return`<div class="rpr1"><span class="rpg" title="Kéo để di chuyển thanh công cụ" aria-label="Di chuyển">${rpSvgs.grip}</span><b class="rpt">${rpSvgs.rew}Replay</b><span class="rph">Bấm vào một nến trên chart để bắt đầu từ nến đó · đã tải ${rpDays()} ngày, chọn mốc cũ hơn thì sẽ tải thêm</span>
<label class="rsel" title="Bắt đầu từ một mốc tính từ bây giờ"><select id="rpQ" aria-label="Chọn nhanh"><option value="">Chọn nhanh…</option>${q}</select></label>
<button type="button" class="rb t" data-a="date" title="Chọn ngày giờ">${rpSvgs.cal}<span>Chọn ngày</span></button>
<button type="button" class="rb t" data-a="rand" title="Một nến ngẫu nhiên trong dữ liệu đã tải">${rpSvgs.dice}<span>Ngẫu nhiên</span></button>
<button type="button" class="rb x" data-a="cancel" title="Huỷ" aria-label="Huỷ">${rpSvgs.x}</button></div>
<div class="rpd" id="rpD" hidden><input type="datetime-local" id="rpDt" aria-label="Ngày giờ bắt đầu"><button type="button" class="btn sm" data-a="dgo">Bắt đầu từ đây</button><small>Giờ theo múi giờ chart (${rpEsc(rpTzl())})</small></div>
<div class="rpr3"><span class="rpm" id="rpMsg"></span></div>`}
RP.presets=()=>[["first","Đầu dữ liệu đã tải"],["3600","1 giờ trước"],["14400","4 giờ trước"],["today","Đầu ngày hôm nay"],["86400","1 ngày trước"],["259200","3 ngày trước"],["604800","1 tuần trước"],["1209600","2 tuần trước"],["2592000","1 tháng trước"]];
function rpUi(){
  const T=$("rpT");if(!T)return;
  RP.tfShown=C.tf;
  if(!RP.on&&!RP.pick){T.style.display="none";T.innerHTML="";return}
  T.style.display="flex";T.innerHTML=RP.on?rpActiveHtml():rpPickHtml();
  $("rpMsg").textContent=RP.msg||"";$("rpMsg").classList.toggle("bad",!!RP.msgBad);
  rpTick();
}
function rpTick(){                               // cập nhật phần động (thanh tua, giờ, nút phát) mà không dựng lại toàn bộ để không làm mất ô chọn đang mở
  const card=$("chartCard");if(card)card.classList.toggle("rp-on",RP.on);if(card)card.classList.toggle("rp-pick",RP.pick);
  const b=$("rpB");if(b){b.classList.toggle("on",RP.on||RP.pick);b.setAttribute("aria-pressed",String(RP.on||RP.pick))}
  if(!RP.on)return;
  const R=$("rpR");if(!R)return;
  if(+R.max!==RP.tot)R.max=RP.tot;
  if(!RP.drag)R.value=RP.fi;
  R.style.setProperty("--p",rpPct(+R.value,RP.tot)+"%");
  const l=m1[m1.length-1],z=RP.fut[RP.tot-1];
  $("rpA").textContent=rpFmt(RP.startSt);$("rpZ").textContent=z?rpFmt(z[0]):"";
  $("rpI").textContent=l?rpFmt(l[0])+" · "+RP.fi.toLocaleString("vi-VN")+"/"+RP.tot.toLocaleString("vi-VN")+" nến M1 ("+Math.round(rpPct(RP.fi,RP.tot))+"%)":"";
  const pl=$("rpPl");if(pl){pl.innerHTML=RP.playing?rpSvgs.pause:rpSvgs.play;pl.title=RP.playing?"Tạm dừng (Shift+↓)":"Phát (Shift+↓)";pl.setAttribute("aria-label",RP.playing?"Tạm dừng":"Phát")}
}
function rpPrice(){const l=m1[m1.length-1];if(!l)return;$("bid").textContent=(+l[4]).toFixed(PDIG());$("ask").textContent="–"}

/* ---------- đường đánh dấu điểm bắt đầu + đường cắt khi chọn ---------- */
function rpMark(){
  const m=$("rpM");if(!m)return;
  if(!RP.on||!agg.length){m.style.display="none";return}
  const ts=chart.timeScale(),sp=ts.options().barSpacing||6,bk=disp(bucket(RP.startSt,C.tf));
  let x=null;
  if(idxOf(bk)>=0){const c=ts.timeToCoordinate(bk);if(c!=null)x=c-sp/2}                       // nến chứa điểm bắt đầu: mép trái nến
  else if(agg[agg.length-1].time<bk){const c=ts.timeToCoordinate(agg[agg.length-1].time);if(c!=null)x=c+sp/2}   // chưa có nến đó (đã lùi về điểm bắt đầu): mép phải nến cuối
  const w=$("chart").clientWidth-(chart.priceScale("right").width()||0);
  if(x==null||x<0||x>w){m.style.display="none";return}
  m.style.display="block";m.style.left=Math.round(x)+"px";m.firstElementChild.textContent="▶ Bắt đầu backtest · "+rpFmt(RP.startSt);
}
let rpMq=0;const rpMarkSoon=()=>{if(!rpMq)rpMq=requestAnimationFrame(()=>{rpMq=0;rpMark()})};
function rpHover(p){
  const o=$("rpO");if(!o)return;
  if(!RP.pick||RP.busy||!p||!p.point||p.time==null){o.style.display="none";RP.hov=null;return}
  const i=idxOf(p.time);if(i<0){o.style.display="none";RP.hov=null;return}
  const x=chart.timeScale().timeToCoordinate(p.time);if(x==null){o.style.display="none";return}
  RP.hov=agg[i].st;
  const W=$("chart").clientWidth-(chart.priceScale("right").width()||0),sp=chart.timeScale().options().barSpacing||6,L=Math.round(x-sp/2);
  o.style.display="block";o.firstElementChild.style.left=L+"px";o.firstElementChild.style.width=Math.max(0,W-L)+"px";
  const c=o.lastElementChild;c.style.left=L+"px";c.classList.toggle("fl",L>W-250);c.firstElementChild.textContent="✂ "+rpFmtD(agg[i].time)+" · bấm để bắt đầu từ nến này";
}
function rpClick(p){if(!RP.pick||RP.busy)return;if(RP.hov!=null)rpBegin(RP.hov);else rpSay("Hãy bấm vào một nến có dữ liệu.",true)}

/* ---------- vào / ra ---------- */
function rpToggle(){
  if(RP.busy){RP.cancel=true;rpSay("Đang huỷ…");return}
  if(RP.on){rpExit();return}
  if(RP.pick){rpPickEnd();return}
  if(typeof show==="function"&&cur!=="chart")show("chart");
  if(SUB()){status("Replay cần khung từ M1 trở lên (đang ở khung giây)","bad");return}
  if(!m1.length||!ctReady()){status("Chưa có dữ liệu để replay, hãy đợi chart tải xong","bad");return}
  RP.pick=true;RP.msg="";rpUi();rpTick();
}
function rpPickEnd(){RP.pick=false;RP.hov=null;RP.msg="";const o=$("rpO");if(o)o.style.display="none";rpUi();rpTick()}
function rpPause(){RP.playing=false;cancelAnimationFrame(RP.raf);RP.raf=0;if(RP.on)rpTick()}
function rpReset(){rpPause();RP.on=RP.pick=RP.busy=false;RP.fut=[];RP.fi=RP.tot=0;RP.msg="";RP.hov=null;
  allCh().forEach(c=>{try{c.applyOptions({timeScale:{rightOffset:0}})}catch{}});
  const o=$("rpO");if(o)o.style.display="none";const m=$("rpM");if(m)m.style.display="none";rpUi();rpTick()}
function rpAbort(){RP.cancel=true;rpReset()}      // đổi mã trong lúc replay: bỏ hẳn (loadM1 tải lại dữ liệu mã mới)
function rpExit(){
  const was=RP.on;rpPause();
  if(was){for(let i=RP.fi;i<RP.tot;i++)m1.push(RP.fut[i])}   // trả lại phần chưa chạy: m1 liền mạch tới lúc bắt đầu replay
  rpReset();
  if(was){
    CT.quoteDirty=true;CT.barDirty=true;rebuild(false);try{chart.timeScale().scrollToRealTime()}catch{}
    status(m1.length+" nến M1 · cTrader","ok");catchUp();            // bù các nến mới đóng trong lúc replay
  }
}
/* Tải lùi M1 tới khi mảng m1 phủ tới thời điểm target (giờ server); dùng chung biến m1Old/m1Span với fillLeft() của chart.js */
async function rpEnsureBack(target,g){
  while(!m1NoMore&&m1.length&&m1[0][0]>target){
    if(RP.cancel||g!==gen)return false;
    const top=m1Old,lo=top-m1Span;
    rpSay("Đang tải dữ liệu từ "+rpFmt(m1[0][0])+" lùi về "+rpFmt(target)+"…");
    const bars=await ctBars(lo,top);
    if(RP.cancel||g!==gen)return false;
    m1Old=lo;m1Span=Math.min(m1Span*2,M1_MAXSPAN);
    if(bars.length){m1Empty=0;m1=bars.concat(m1)}
    else{m1Empty+=top-lo;if(m1Empty>=M1_GIVEUP){m1NoMore=true;break}}
  }
  return true;
}
async function rpBegin(st){
  if(RP.busy)return;
  RP.busy=true;RP.cancel=false;$("rpT").classList.add("busy");
  for(let k=0;(fillBusy||loading)&&k<150;k++)await sleep(100);     // đợi tải dữ liệu chart đang chạy
  fillBusy=true;const g=gen;
  try{
    let note="";
    const ctx=Math.max(6*3600,C.tf*150);                           // nến bối cảnh phía trước điểm bắt đầu
    if(!(await rpEnsureBack(st-ctx,g))){if(g===gen)rpSay("Đã huỷ.");return}
    const cut=rpCut(m1,st);
    if(cut.err==="after"){rpSay("Không có dữ liệu nào sau thời điểm này (thị trường đóng cửa hoặc chưa tới).",true);return}
    if(cut.err==="before"){rpSay("Broker chỉ có dữ liệu từ "+rpFmt(m1[0][0])+" nên không đủ nến phía trước để bắt đầu từ đây.",true);return}
    if(m1.length-cut.i<2){rpSay("Phía sau điểm này gần như không có nến để chạy. Hãy chọn điểm sớm hơn.",true);return}
    RP.fut=m1.splice(cut.i);RP.fi=0;RP.tot=RP.fut.length;RP.startSt=RP.fut[0][0];RP.sym=C.sym;
    RP.on=true;RP.pick=false;RP.msg=note;RP.hov=null;
    const o=$("rpO");if(o)o.style.display="none";
    allCh().forEach(x=>{try{x.applyOptions({timeScale:{rightOffset:8}})}catch{}});
    try{baUpdate(C.sym,0,0)}catch{}                                   // ẩn đường Bid/Ask live
    rebuild(false);try{chart.timeScale().scrollToRealTime()}catch{}
    rpPrice();status("Replay · "+rpFmt(m1[m1.length-1][0]),"ok");rpUi();rpTick();rpMarkSoon();
  }catch(e){rpSay("Lỗi tải dữ liệu: "+why(e),true)}
  finally{fillBusy=false;RP.busy=false;$("rpT").classList.remove("busy");if(g===gen&&m1.length&&!RP.on)fillLeft()}
}

/* ---------- di chuyển điểm phát ---------- */
function rpFollow(){                                 // giữ nến mới nhất trong tầm nhìn (chỉ khi người dùng đang xem tới nến cuối)
  const ts=chart.timeScale(),r=ts.getVisibleLogicalRange();if(!r||!agg.length)return;
  const last=agg.length-1,pad=8;
  if(last+pad>r.to+.5||last<r.from+2){const w=r.to-r.from;try{ts.setVisibleLogicalRange({from:last+pad-w,to:last+pad})}catch{}}
}
function rpAfter(follow){
  if(follow)rpFollow();
  rpPrice();try{dirty=true;FPLV++}catch{}          // FPLV++: footprint / statistic của nến cuối tính lại theo phần tick đã lộ
  const l=m1[m1.length-1];if(l)status("Replay · "+rpFmt(l[0]),"ok");
  CHW.applied=Date.now();rpTick();rpMarkSoon();
  // Paper Trading receives one deterministic callback per replay seek/step; it must never use live cTrader quotes.
  try{if(typeof window.__paperReplayStep==="function"&&l)window.__paperReplayStep(l)}catch(e){console.warn("Paper Replay step failed",e)}
}
function rpSeek(pos){
  if(!RP.on)return;
  pos=Math.max(0,Math.min(RP.tot,Math.round(pos)));const d=pos-RP.fi;if(!d)return;
  const r=chart.timeScale().getVisibleLogicalRange(),follow=!r||agg.length-1<=r.to+.5;
  if(d>0&&d<=3){for(let i=0;i<d;i++)applyLive(RP.fut[RP.fi+i]);RP.fi=pos}      // vài nến: cập nhật nối tiếp (nhẹ, giống nến live)
  else{RP.fi=rpMove(m1,RP.fut,RP.fi,pos);rebuild(false)}                       // nhảy xa hoặc lùi: dựng lại từ m1
  rpAfter(follow);
}
const rpTf=()=>({tf:C.tf,unit:RP.unit});
function rpStep(dir,n){
  const q=rpTf(),p=rpStepN(RP.fut,RP.fi,n||1,dir,q.unit,q.tf,bucket);
  if(p===RP.fi&&dir>0&&RP.fi>=RP.tot)rpSay("Đã tới nến cuối cùng có dữ liệu. Bấm ✕ để quay về chart trực tiếp.");
  else rpSay("");
  rpSeek(p);
}
function rpPlay(){
  if(!RP.on||RP.playing)return;
  if(RP.fi>=RP.tot){rpSay("Đã tới nến cuối cùng có dữ liệu. Bấm ✕ để quay về chart trực tiếp.");return}
  rpSay("");RP.playing=true;RP.acc=0;RP.t0=performance.now();RP.raf=requestAnimationFrame(rpLoop);rpTick();
}
function rpLoop(now){
  if(!RP.playing)return;
  const dt=Math.min(250,now-RP.t0);RP.t0=now;RP.acc+=dt/1000*RP.speed;
  const n=Math.floor(RP.acc);
  if(n>=1){RP.acc-=n;try{rpStep(1,n)}catch(e){chErr("replay",e);rpPause();return}}
  if(RP.fi>=RP.tot){rpPause();rpSay("Đã tới nến cuối cùng có dữ liệu. Bấm ✕ để quay về chart trực tiếp.");return}
  RP.raf=requestAnimationFrame(rpLoop);
}
const rpToggleP=()=>RP.playing?rpPause():rpPlay();

/* ---------- chọn điểm bắt đầu bằng mốc thời gian ---------- */
function rpPreset(v){
  const now=Math.floor(Date.now()/1000);
  if(v==="first"&&m1.length)return m1[0][0]+Math.max(6*3600,C.tf*150)+RP_MINPAST*60;
  if(v==="today"){const d=disp(u2s(now));return rpD2St(Math.floor(d/86400)*86400)}
  return u2s(now-(+v||0));
}
function rpRandom(){
  const n=m1.length;if(n<RP_MINPAST+400){rpSay("Chưa đủ dữ liệu đã tải để chọn ngẫu nhiên, hãy kéo chart sang trái để tải thêm.",true);return}
  const i=RP_MINPAST+Math.floor(Math.random()*(n-RP_MINPAST-300));rpBegin(bucket(m1[i][0],C.tf));
}

/* ---------- gắn sự kiện + dựng DOM ---------- */
(function rpInit(){
  const card=$("chartCard"),ch=$("chart");if(!card||!ch)return;
  const T=document.createElement("div");T.id="rpT";T.setAttribute("role","toolbar");T.setAttribute("aria-label","Thanh điều khiển replay");T.style.display="none";card.appendChild(T);
  const o=document.createElement("div");o.id="rpO";o.innerHTML='<div class="rpsh"></div><div class="rpcu"><b></b></div>';ch.appendChild(o);
  const m=document.createElement("div");m.id="rpM";m.innerHTML="<span></span>";ch.appendChild(m);
  const btn=$("rpB");if(btn)btn.onclick=rpToggle;
  T.addEventListener("click",e=>{
    const b=e.target.closest("[data-a]");if(!b)return;const a=b.dataset.a;
    if(a==="exit")return rpExit();
    if(a==="cancel")return rpToggle();
    if(RP.busy)return;
    if(a==="start"){rpPause();rpSay("");rpSeek(0)}
    else if(a==="back"){rpPause();rpStep(-1)}
    else if(a==="fwd"){rpPause();rpStep(1)}
    else if(a==="play")rpToggleP();
    else if(a==="end"){rpPause();rpSeek(RP.tot);rpSay("Đã tua tới nến cuối cùng có dữ liệu.")}
    else if(a==="repick"){rpPause();const was=RP.fi;for(let i=was;i<RP.tot;i++)m1.push(RP.fut[i]);const keep=m1.length;RP.on=false;RP.fut=[];RP.fi=RP.tot=0;RP.pick=true;RP.msg="";rebuild(false);try{chart.timeScale().scrollToPosition(0,false)}catch{};rpUi();rpTick();rpMarkSoon()}
    else if(a==="date"){const d=$("rpD");if(d){d.hidden=!d.hidden;if(!d.hidden){const i=$("rpDt");if(!i.value&&m1.length)i.value=new Date((disp(m1[m1.length-1][0])-86400)*1000).toISOString().slice(0,16);i.focus()}}}
    else if(a==="dgo"){const v=$("rpDt").value,mt=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v||"");if(!mt){rpSay("Hãy chọn ngày giờ.",true);return}rpBegin(rpD2St(Date.UTC(+mt[1],+mt[2]-1,+mt[3],+mt[4],+mt[5])/1000))}
    else if(a==="rand")rpRandom();
  });
  T.addEventListener("change",e=>{
    const t=e.target;
    if(t.id==="rpS"){RP.speed=+t.value;sv("rp_speed",RP.speed)}
    else if(t.id==="rpU"){RP.unit=t.value==="m1"?"m1":"tf";sv("rp_unit",RP.unit)}
    else if(t.id==="rpQ"&&t.value){const v=t.value;t.value="";if(!RP.busy)rpBegin(rpPreset(v))}
  });
  /* thanh tua: kéo về trái tới hết = điểm bắt đầu backtest; kéo tới đâu chart chạy tới đó (rAF để không dựng lại quá dày) */
  T.addEventListener("input",e=>{
    if(e.target.id!=="rpR")return;
    rpPause();RP.drag=true;RP.want=+e.target.value;e.target.style.setProperty("--p",rpPct(RP.want,RP.tot)+"%");
    if(!RP.sk)RP.sk=requestAnimationFrame(()=>{RP.sk=0;rpSeek(RP.want)});
    rpBubble(e.target,RP.want);
  });
  const endDrag=()=>{if(RP.drag){RP.drag=false;if(RP.sk){cancelAnimationFrame(RP.sk);RP.sk=0;rpSeek(RP.want)}rpTick();const b=$("rpBub");if(b)b.style.display="none"}};
  T.addEventListener("pointerup",endDrag);T.addEventListener("pointercancel",endDrag);T.addEventListener("keyup",endDrag);
  T.addEventListener("pointermove",e=>{
    if(e.target.id!=="rpR")return;const r=e.target.getBoundingClientRect();
    rpBubble(e.target,Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*RP.tot));
  });
  T.addEventListener("pointerleave",()=>{if(!RP.drag){const b=$("rpBub");if(b)b.style.display="none"}});
  function rpBubble(inp,pos){                      // giờ tại vị trí con trượt/con trỏ
    const b=$("rpBub");if(!b||!RP.tot)return;
    const st=pos<=0?RP.startSt:RP.fut[Math.min(RP.tot,pos)-1][0];
    b.textContent=rpFmt(st);b.style.display="block";b.style.left=rpPct(pos,RP.tot)+"%";
  }
  /* kéo thanh công cụ */
  let dg=null;
  T.addEventListener("pointerdown",e=>{
    const g=e.target.closest(".rpg");if(!g)return;
    const r=T.getBoundingClientRect(),c=card.getBoundingClientRect();
    T.style.transform="none";T.style.left=(r.left-c.left)+"px";T.style.top=(r.top-c.top)+"px";
    dg={dx:e.clientX-r.left,dy:e.clientY-r.top};try{g.setPointerCapture(e.pointerId)}catch{}e.preventDefault();
  });
  T.addEventListener("pointermove",e=>{
    if(!dg)return;const c=card.getBoundingClientRect(),w=T.offsetWidth,h=T.offsetHeight;
    T.style.left=Math.max(4,Math.min(c.width-w-4,e.clientX-c.left-dg.dx))+"px";T.style.top=Math.max(4,Math.min(c.height-h-4,e.clientY-c.top-dg.dy))+"px";
  });
  const gEnd=()=>{dg=null};T.addEventListener("pointerup",gEnd);T.addEventListener("pointercancel",gEnd);
  /* chart: đường cắt khi chọn + đánh dấu điểm bắt đầu */
  chart.subscribeCrosshairMove(rpHover);
  chart.subscribeClick(rpClick);
  chart.timeScale().subscribeVisibleLogicalRangeChange(rpMarkSoon);
  try{new ResizeObserver(rpMarkSoon).observe(ch)}catch{}
  ch.addEventListener("pointerleave",()=>{if(RP.pick)rpHover(null)});
  setInterval(()=>{if(RP.on||RP.pick){rpMark();if(RP.on&&RP.tfShown!==C.tf&&!document.activeElement.closest?.("#rpT"))rpUi()}},300);
  /* phím tắt giống TradingView: Shift+→ tiến, Shift+← lùi, Shift+↓ phát / tạm dừng; Esc huỷ lúc đang chọn điểm bắt đầu */
  document.addEventListener("keydown",e=>{
    if(!(RP.on||RP.pick))return;
    const t=e.target,tag=t&&t.tagName;if(tag==="INPUT"&&t.type!=="range"||tag==="TEXTAREA"||tag==="SELECT"||t&&t.isContentEditable)return;
    if(e.key==="Escape"&&RP.pick&&!document.querySelector(".mdl")){rpToggle();return}
    if(!RP.on||!e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==="ArrowRight"){e.preventDefault();rpPause();rpStep(1)}
    else if(e.key==="ArrowLeft"){e.preventDefault();rpPause();rpStep(-1)}
    else if(e.key==="ArrowDown"){e.preventDefault();rpToggleP()}
  });
})();
