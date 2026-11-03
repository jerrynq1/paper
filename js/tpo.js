/* ================= MARKET PROFILE / TPO CHART =================
   Standalone TPO profile. It only reads the existing M1/footprint feed and
   draws to the existing overlay canvas; it never changes candle series,
   price/time scales, chart data, replay state, or drawing objects.

   Source basis: CBOT Market Profile Study Guide (1996). Where only cTrader
   M1 OHLC is available, each minute's High-Low is used as an approximate
   traded range. Footprint price rows are preferred when available outside
   Replay. cTrader tick volume is a quote-count proxy, not exchange volume.
*/
const TPO_STORE_KEY="tp_tpo_v1",TPO_SCALE=1e5;
const TPO_DEFAULTS={
  enabled:false,timeZone:"America/New_York",sessionStart:"00:00",sessionHours:24,
  periodMin:30,letterMode:"cbot24",sessionPick:"current",rowStep:0,
  valueArea:70,valueMode:"tpo",ibMinutes:60,side:"r",widthPct:48,cellWidth:9,
  showValueArea:true,showIB:true,showSinglePrints:true,showStats:true,
  showPriceLabels:true,showCounts:false,showDayType:true,showFairPrice:true,
  showRangeExtension:true,showPioneerRange:false
};
function tpoLoadSettings(){
  let s={};try{s=JSON.parse(localStorage.getItem(TPO_STORE_KEY)||"{}")||{}}catch{}
  const o={...TPO_DEFAULTS,...s};
  if(!["America/New_York","America/Chicago","Etc/UTC","Europe/London","Asia/Ho_Chi_Minh"].includes(o.timeZone))o.timeZone=TPO_DEFAULTS.timeZone;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(o.sessionStart)))o.sessionStart=TPO_DEFAULTS.sessionStart;
  o.sessionHours=[1,2,3,4,6,8,12,24].includes(+o.sessionHours)?+o.sessionHours:24;
  o.periodMin=[1,5,10,15,30,60].includes(+o.periodMin)?+o.periodMin:30;
  o.letterMode=["cbot24","session"].includes(o.letterMode)?o.letterMode:"cbot24";
  o.sessionPick=o.sessionPick==="previous"?"previous":"current";
  o.rowStep=Math.max(0,Math.min(1e6,Number(o.rowStep)||0));
  o.valueArea=Math.max(50,Math.min(90,Math.round(+o.valueArea||70)));
  o.valueMode=o.valueMode==="tick"?"tick":"tpo";
  o.ibMinutes=[30,60,90,100,120].includes(+o.ibMinutes)?+o.ibMinutes:60;
  o.side=o.side==="l"?"l":"r";
  o.widthPct=Math.max(20,Math.min(80,Math.round(+o.widthPct||48)));
  o.cellWidth=Math.max(5,Math.min(18,Math.round(+o.cellWidth||9)));
  ["enabled","showValueArea","showIB","showSinglePrints","showStats","showPriceLabels","showCounts","showDayType","showFairPrice","showRangeExtension","showPioneerRange"].forEach(k=>o[k]=!!o[k]);
  return o;
}
const TPO={options:tpoLoadSettings(),cache:new Map(),last:null};
function tpoSave(){try{localStorage.setItem(TPO_STORE_KEY,JSON.stringify(TPO.options))}catch{}TPO.cache.clear();TPO.last=null;tpoSyncButton();if(!TPO.options.enabled)tpoHideDash();if(typeof dirty!=="undefined")dirty=true}
function tpoSyncButton(){const b=$("tpoBtn");if(!b)return;b.classList.toggle("on",!!TPO.options.enabled);b.setAttribute("aria-pressed",TPO.options.enabled?"true":"false")}
function tpoTimeParts(sec,tz){
  const d=new Date(sec*1000),p={};
  new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",second:"numeric",hourCycle:"h23"}).formatToParts(d).forEach(x=>{if(x.type!=="literal")p[x.type]=+x.value});
  p.hour=p.hour%24;return{year:p.year,month:p.month,day:p.day,hour:p.hour,minute:p.minute,second:p.second};
}
function tpoDateKey(y,m,d){return Math.floor(Date.UTC(y,m-1,d)/86400000)}
function tpoDateParts(key){const d=new Date(key*86400000);return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()}}
function tpoZonedEpoch(y,m,d,h,mi,tz){
  const wall=Date.UTC(y,m-1,d,h,mi,0,0);let guess=wall;
  for(let i=0;i<4;i++){
    const p=tpoTimeParts(guess/1000,tz),got=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const delta=wall-got;if(!delta)break;guess+=delta;
  }
  return Math.floor(guess/1000);
}
function tpoAddDate(key,n){return key+n}
function tpoSessionForKey(key,o){
  const d=tpoDateParts(key),hm=o.sessionStart.split(":").map(Number),start=tpoZonedEpoch(d.year,d.month,d.day,hm[0],hm[1],o.timeZone);
  let end;if(o.sessionHours===24){const nd=tpoDateParts(tpoAddDate(key,1));end=tpoZonedEpoch(nd.year,nd.month,nd.day,hm[0],hm[1],o.timeZone)}else end=start+o.sessionHours*3600;
  return{key,baseKey:key,start,end,label:`${String(d.day).padStart(2,"0")}/${String(d.month).padStart(2,"0")}/${d.year}`};
}
function tpoSessionForTimestamp(sec,o){
  const p=tpoTimeParts(sec,o.timeZone),minute=p.hour*60+p.minute,start=o.sessionStart.split(":").map(Number),startMin=start[0]*60+start[1];
  let key=tpoDateKey(p.year,p.month,p.day);if(minute<startMin)key--;
  const base=tpoSessionForKey(key,o);if(o.sessionHours===24)return base;
  const dur=o.sessionHours*3600,slot=Math.max(0,Math.floor((sec-base.start)/dur)),begin=base.start+slot*dur,sp=tpoTimeParts(begin,o.timeZone);
  return{key:key*100+slot,baseKey:key,start:begin,end:begin+dur,label:`${base.label} ${String(sp.hour).padStart(2,"0")}:${String(sp.minute).padStart(2,"0")}`};
}
function tpoPreviousSession(s,o){
  if(o.sessionHours===24)return tpoSessionForKey(s.baseKey-1,o);
  const start=s.start-o.sessionHours*3600,p=tpoTimeParts(start,o.timeZone),key=s.key-1;
  return{key,baseKey:s.baseKey,start,end:s.start,label:`${String(p.day).padStart(2,"0")}/${String(p.month).padStart(2,"0")}/${p.year} ${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`};
}
function tpoNiceStep(span,tick){
  if(!(span>0))return tick;const target=span/70,p=Math.pow(10,Math.floor(Math.log10(target))),m=target/p,k=m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10;
  return Math.max(tick,k*p);
}
function tpoLetter(periodIndex,minuteOfDay,periodMin,mode){
  const alpha="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  if(mode==="cbot24"&&periodMin===30){const q=Math.max(0,Math.min(47,Math.floor(minuteOfDay/30)));return q<24?String.fromCharCode(65+q):String.fromCharCode(97+q-24)}
  return alpha[periodIndex%52]+(periodIndex>=52?String(Math.floor(periodIndex/52)+1):"");
}
function tpoValueArea(metric,poc,targetPct){
  const n=metric.length;if(!n||poc<0||poc>=n)return{lo:0,hi:0,total:0,covered:0};
  let lo=poc,hi=poc,total=0;for(const v of metric)total+=Math.max(0,+v||0);
  const target=total*Math.max(1,Math.min(100,targetPct))/100;let covered=Math.max(0,+metric[poc]||0);
  while(covered+1e-9<target&&(lo>0||hi<n-1)){
    const a=hi+1<n?Math.max(0,+metric[hi+1]||0):-1;
    const b=lo>0?Math.max(0,+metric[lo-1]||0):-1;
    if(a<0&&b<0)break;
    if(a===b&&a>=0){hi++;lo--;covered+=a+b}
    else if(a>b){hi++;covered+=Math.max(0,a)}
    else{lo--;covered+=Math.max(0,b)}
  }
  return{lo,hi,total,covered};
}
function tpoFindFairPrice(counts,lo,hi,profileMid){
  let best=-1,pick=-1;
  for(let i=lo;i<=hi;i++)if(counts[i]>best||(counts[i]===best&&Math.abs(i-profileMid)<Math.abs(pick-profileMid))){best=counts[i];pick=i}
  return pick;
}
function tpoClassifyDay(P){
  if(!P||!P.ibReady||!(P.ibRange>0))return"IB đang hình thành";
  const up=Math.max(0,P.high-P.ibHigh),dn=Math.max(0,P.ibLow-P.low),full=P.high-P.low,inside=P.ibRange/Math.max(full,P.step);
  const eps=P.step*.51,upOn=up>eps,dnOn=dn>eps;
  if(upOn&&dnOn)return"Neutral";
  if(inside>=.85)return"Normal";
  const ext=Math.max(up,dn),closeAtEdge=upOn?(P.close>=P.high-Math.max(P.step*2,full*.05)):(P.close<=P.low+Math.max(P.step*2,full*.05));
  if(ext>2*P.ibRange&&closeAtEdge)return"Trend";
  return"Normal Variation";
}
function tpoLowerBoundUTC(arr,t){let lo=0,hi=arr.length;while(lo<hi){const m=(lo+hi)>>1;(typeof s2u==="function"?s2u(arr[m][0]):arr[m][0])<t?lo=m+1:hi=m}return lo}
function tpoCalcProfile(bars,o,session){
  if(!Array.isArray(bars)||!bars.length||!session||!(session.end>session.start))return null;
  const i0=tpoLowerBoundUTC(bars,session.start),i1=tpoLowerBoundUTC(bars,session.end);if(i0>=i1)return null;
  let min=Infinity,max=-Infinity,last=bars[i1-1],totalMinutes=0;
  const useFootprint=!(typeof RP!=="undefined"&&RP.on)&&typeof FPM!=="undefined"&&FPM instanceof Map&&FPM.size>0;
  for(let i=i0;i<i1;i++){
    const b=bars[i];if(!b||!Number.isFinite(+b[2])||!Number.isFinite(+b[3]))continue;
    min=Math.min(min,+b[3]);max=Math.max(max,+b[2]);totalMinutes++;
    // Include bid/ask quote rows too: they can sit just outside the candle's one-sided OHLC range.
    if(useFootprint){const rows=FPM.get(+b[0]);if(rows)for(const r of rows){const p=+r[0];if(Number.isFinite(p)){min=Math.min(min,p);max=Math.max(max,p)}}}
  }
  if(!Number.isFinite(min)||!Number.isFinite(max))return null;
  const tick=Math.pow(10,-Math.max(0,Math.min(8,typeof PDIG==="function"?PDIG():2)));let step=o.rowStep>0?Math.max(tick,o.rowStep):tpoNiceStep(Math.max(max-min,tick),tick),binI=Math.max(1,Math.round(step*TPO_SCALE));
  step=binI/TPO_SCALE;let baseI=Math.floor(Math.round(min*TPO_SCALE)/binI),topI=Math.floor(Math.round(max*TPO_SCALE)/binI),n=topI-baseI+1;
  if(n>900){const mult=Math.ceil(n/900);binI=Math.max(1,Math.round(step*mult*TPO_SCALE));step=binI/TPO_SCALE;baseI=Math.floor(Math.round(min*TPO_SCALE)/binI);topI=Math.floor(Math.round(max*TPO_SCALE)/binI);n=topI-baseI+1}
  const dur=session.end-session.start,periodSec=o.periodMin*60,nP=Math.max(1,Math.ceil(dur/periodSec)),cells=new Uint8Array(n*nP),metric=new Float64Array(n),counts=new Int32Array(n),rowOf=p=>Math.floor(Math.round(p*TPO_SCALE)/Math.max(1,Math.round(step*TPO_SCALE)))-baseI;
  let ibHigh=-Infinity,ibLow=Infinity,ibBars=0,ibEnd=session.start+o.ibMinutes*60,close=+last[4],fpmMins=0,pioneerHigh=-Infinity,pioneerLow=Infinity;
  for(let i=i0;i<i1;i++){
    const b=bars[i],serverTime=+b[0],t=typeof s2u==="function"?s2u(serverTime):serverTime;if(!(t>=session.start&&t<session.end))continue;
    const per=Math.floor((t-session.start)/periodSec);if(per<0||per>=nP)continue;
    const low=Math.min(+b[3],+b[2]),high=Math.max(+b[3],+b[2]);let touched=[];
    // FPM keys use the same server-time minute stamp as m1[i][0]; t is UTC only for session math.
    const fp=useFootprint?FPM.get(serverTime):null;
    if(fp&&fp.length){
      const seen=new Set();for(const r of fp){const p=+r[0];if(!Number.isFinite(p))continue;const q=rowOf(p);if(q>=0&&q<n)seen.add(q)}
      if(seen.size){touched=[...seen];fpmMins++}
    }
    if(!touched.length){let a=Math.max(0,rowOf(low)),z=Math.min(n-1,rowOf(high));for(let q=a;q<=z;q++)touched.push(q)}
    for(const q of touched){cells[q*nP+per]=1;}
    const v=Math.max(0,+b[5]||0);if(v>0&&touched.length){const share=v/touched.length;for(const q of touched)metric[q]+=share}
    if(t<session.start+periodSec){pioneerHigh=Math.max(pioneerHigh,high);pioneerLow=Math.min(pioneerLow,low)}
    if(t<ibEnd){ibHigh=Math.max(ibHigh,high);ibLow=Math.min(ibLow,low);ibBars++}
  }
  let totalTpo=0,mx=-1,poc=0;const mid=(n-1)/2;
  for(let q=0;q<n;q++){
    let c=0;for(let p=0;p<nP;p++)c+=cells[q*nP+p];counts[q]=c;totalTpo+=c;
  }
  let tickMetricTotal=0;for(const v of metric)tickMetricTotal+=Math.max(0,v);
  const valueModeUsed=o.valueMode==="tick"&&tickMetricTotal>0?"tick":"tpo";
  for(let q=0;q<n;q++){
    const val=valueModeUsed==="tick"?metric[q]:counts[q];
    if(val>mx+1e-9||(Math.abs(val-mx)<=1e-9&&Math.abs(q-mid)<Math.abs(poc-mid))){mx=val;poc=q}
  }
  const vaMetric=valueModeUsed==="tick"?metric:counts,va=tpoValueArea(vaMetric,poc,o.valueArea),fair=tpoFindFairPrice(counts,va.lo,va.hi,mid);
  let above=0,below=0;for(let q=0;q<n;q++)if(counts[q]>=2){if(q>fair)above++;else if(q<fair)below++}
  const imbalance=above<below?"Buyer":below<above?"Seller":"Balanced";
  let topSingles=0,botSingles=0;for(let q=n-1;q>=0&&counts[q]===1;q--)topSingles++;for(let q=0;q<n&&counts[q]===1;q++)botSingles++;
  const haveIB=ibBars>0&&ibHigh>-Infinity&&ibLow<Infinity,ibRange=haveIB?ibHigh-ibLow:0;
  const P={session,base:baseI*binI/TPO_SCALE,step,n,nP,periodMin:o.periodMin,periodSec,cells,counts,metric,totalTpo,poc,va,vaMetric,valueModeUsed,fair,above,below,imbalance,high:max,low:min,close,ibHigh:haveIB?ibHigh:null,ibLow:haveIB?ibLow:null,ibRange,ibBars,pioneerHigh:Number.isFinite(pioneerHigh)?pioneerHigh:null,pioneerLow:Number.isFinite(pioneerLow)?pioneerLow:null,rangeExtensionUp:haveIB?Math.max(0,max-ibHigh):null,rangeExtensionDown:haveIB?Math.max(0,ibLow-min):null,ibReady:haveIB&&(typeof s2u==="function"?s2u(last[0]):last[0])>=ibEnd,topSingles,botSingles,tickMinutes:fpmMins,totalMinutes,source:fpmMins?"M1 + footprint quote rows":"M1 OHLC High–Low",approx:true};
  P.pocPrice=P.base+(P.poc+.5)*step;P.vah=P.base+(P.va.hi+1)*step;P.val=P.base+P.va.lo*step;P.fairPrice=P.base+(P.fair+.5)*step;P.dayType=tpoClassifyDay(P);P.coverage=totalMinutes?fpmMins/totalMinutes:0;
  return P;
}
function tpoProfileForView(){
  const o=TPO.options;if(!o.enabled||typeof m1==="undefined"||!m1.length)return null;
  // Replay removes future M1 bars from m1 and restores them only when exiting replay.
  const last=m1.length-1;if(last<0)return null;
  const ts0=typeof s2u==="function"?s2u(m1[last][0]):m1[last][0],s0=tpoSessionForTimestamp(ts0,o),session=o.sessionPick==="previous"?tpoPreviousSession(s0,o):s0,tail=m1[m1.length-1];
  const fph=typeof FPH==="undefined"?0:FPH, fplv=typeof FPLV==="undefined"?0:FPLV, fpv=typeof FPV==="undefined"?0:FPV;
  const sig=[session.start,session.end,m1.length,tail[0],tail[2],tail[3],tail[4],tail[5],fph,fplv,fpv,JSON.stringify(o),typeof RP!=="undefined"&&RP.on?"replay":"live"].join("|");
  const c=TPO.cache.get("profile");if(c&&c.sig===sig)return c.P;
  const P=tpoCalcProfile(m1,o,session);TPO.cache.set("profile",{sig,P});TPO.last=P;if(TPO.cache.size>4)TPO.cache.delete(TPO.cache.keys().next().value);return P;
}
function tpoFmt(v){if(v==null||v===""||!Number.isFinite(Number(v)))return"—";return Number(v).toFixed(typeof PDIG==="function"?PDIG():2)}
function tpoDrawLine(y,w,color,dash,label,xText){
  if(y==null||!Number.isFinite(y))return;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.1;ctx.setLineDash(dash||[]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();ctx.setLineDash([]);
  if(label){ctx.font="600 9px 'Space Grotesk',sans-serif";ctx.textAlign="left";ctx.textBaseline="bottom";ctx.fillStyle=color;ctx.fillText(label,xText==null?4:xText,y-2)}ctx.restore();
}
function tpoEnsureDash(){
  if(TPO.dash)return TPO.dash;
  const el=document.createElement("div");el.id="tpoDash";el.className="tpo-dash";el.setAttribute("aria-label","Market Profile TPO summary");$("chart").appendChild(el);TPO.dash=el;return el;
}
function tpoHideDash(){if(TPO.dash)TPO.dash.style.display="none"}
function tpoRenderDash(profile){
  const o=TPO.options,el=tpoEnsureDash();if(!o.showStats||!profile){el.style.display="none";return}
  const fmt=tpoFmt,mode=profile.valueModeUsed==="tpo"? (o.valueMode==="tick"?"TPO count (no tick volume)":"TPO count") : "M1 tick-volume proxy";
  const html=`<div class="tpo-dash-head"><b>MARKET PROFILE · TPO</b><span>${profile.session.label} · ${o.periodMin}m</span></div>
    <div class="tpo-dash-row"><b>POC</b> ${fmt(profile.pocPrice)} <span>FAIR ${fmt(profile.fairPrice)}</span></div>
    <div class="tpo-dash-row"><b>VAH</b> ${fmt(profile.vah)} <span><b>VAL</b> ${fmt(profile.val)} · ${o.valueArea}% ${mode}</span></div>
    <div class="tpo-dash-row"><b>IBH</b> ${fmt(profile.ibHigh)} <span><b>IBL</b> ${fmt(profile.ibLow)} · RE↑ ${fmt(profile.rangeExtensionUp)} / RE↓ ${fmt(profile.rangeExtensionDown)}</span></div>
    <div class="tpo-dash-row"><b>${o.showDayType?profile.dayType:"TPO"}</b> <span>${profile.imbalance} · Double prints ↑${profile.above} / ↓${profile.below}</span></div>
    <div class="tpo-dash-foot">${profile.source}${profile.coverage?" · footprint coverage "+Math.round(profile.coverage*100)+"%":""} · Dữ liệu CFD/cTrader, không phải futures tape</div>`;
  if(el.dataset.html!==html){el.innerHTML=html;el.dataset.html=html}
  el.style.left=o.side==="r"?"54px":"auto";el.style.right=o.side==="l"?"54px":"auto";el.style.display="block";
}
function drawTPO(w,h){
  const o=TPO.options;if(!o.enabled||!agg.length||!m1.length){tpoHideDash();return}
  let saved=false;
  try{
    const profile=tpoProfileForView();if(!profile||!profile.totalTpo){tpoHideDash();return}
    tpoRenderDash(profile);
    const xMax=Math.max(0,w),wantW=xMax*o.widthPct/100,labelW=o.showPriceLabels?52:8,cell=Math.max(.2,Math.min(o.cellWidth,(wantW-labelW-12)/Math.max(1,profile.nP))),panelW=Math.min(xMax,Math.max(100,labelW+cell*profile.nP+12));
    const x0=o.side==="r"?Math.max(0,xMax-panelW):0,cellX=x0+labelW;
    const dark=typeof P!=="undefined"&&P.theme==="dark";
    ctx.save();saved=true;
    ctx.fillStyle=dark?"rgba(17,22,31,.88)":"rgba(255,252,244,.91)";ctx.strokeStyle=dark?"rgba(185,168,126,.28)":"rgba(101,78,36,.28)";ctx.lineWidth=1;ctx.fillRect(x0,2,panelW,Math.max(0,h-4));ctx.strokeRect(x0+.5,2.5,panelW-1,Math.max(0,h-5));
    const bin=Math.max(1,Math.round(profile.step*TPO_SCALE)),baseBin=Math.round(profile.base*TPO_SCALE);
    const ibHi=profile.ibHigh==null?null:Math.floor(Math.round(profile.ibHigh*TPO_SCALE)/bin)-Math.floor(baseBin/bin),ibLo=profile.ibLow==null?null:Math.floor(Math.round(profile.ibLow*TPO_SCALE)/bin)-Math.floor(baseBin/bin);
    // Very light column dividers help distinguish adjacent time brackets without hiding letters.
    for(let p=0;p<=profile.nP;p+=Math.max(1,Math.ceil(profile.nP/12))){const x=cellX+p*cell;ctx.strokeStyle=dark?"rgba(190,175,144,.10)":"rgba(108,88,54,.10)";ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x,2);ctx.lineTo(x,h-2);ctx.stroke()}
    // Profile rows map directly to Lightweight Charts' price scale and therefore follow zoom/pan.
    for(let q=0;q<profile.n;q++){
      const low=profile.base+q*profile.step,high=low+profile.step,y1=cs.priceToCoordinate(low),y2=cs.priceToCoordinate(high);if(y1==null||y2==null||!Number.isFinite(y1+y2))continue;
      const y=Math.min(y1,y2),hh=Math.max(1,Math.abs(y2-y1));if(y+hh<0||y>h)continue;
      const inVA=q>=profile.va.lo&&q<=profile.va.hi,isPoc=q===profile.poc,isSingle=profile.counts[q]===1,extUp=ibHi!=null&&q>ibHi&&profile.rangeExtensionUp>0,extDn=ibLo!=null&&q<ibLo&&profile.rangeExtensionDown>0;
      if(o.showRangeExtension&&extUp){ctx.fillStyle=dark?"rgba(56,181,145,.13)":"rgba(40,153,119,.10)";ctx.fillRect(x0,y,panelW,hh)}
      if(o.showRangeExtension&&extDn){ctx.fillStyle=dark?"rgba(224,99,99,.13)":"rgba(190,55,55,.10)";ctx.fillRect(x0,y,panelW,hh)}
      if(o.showValueArea&&inVA){ctx.fillStyle=dark?"rgba(53,166,220,.14)":"rgba(53,142,197,.12)";ctx.fillRect(x0,y,panelW,hh)}
      if(o.showSinglePrints&&isSingle){ctx.fillStyle=dark?"rgba(255,112,112,.17)":"rgba(190,55,55,.12)";ctx.fillRect(x0,y,panelW,hh)}
      if(isPoc){ctx.fillStyle=dark?"rgba(245,190,55,.25)":"rgba(245,190,55,.30)";ctx.fillRect(x0,y,panelW,hh)}
      ctx.strokeStyle=dark?"rgba(190,175,144,.08)":"rgba(108,88,54,.10)";ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(cellX,y+hh);ctx.lineTo(Math.min(x0+panelW,cellX+profile.nP*cell),y+hh);ctx.stroke();
      if(o.showPriceLabels&&(q===0||q===profile.n-1||q===profile.poc||q===profile.va.lo||q===profile.va.hi||q%Math.max(1,Math.round(profile.n/16))===0)){
        ctx.font=(isPoc?"700 ":"500 ")+"8px 'Space Grotesk',sans-serif";ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillStyle=isPoc?"#d49b22":dark?"#b9ad92":"#6e5a3a";ctx.fillText(tpoFmt(profile.base+(q+.5)*profile.step),x0+labelW-5,y+hh/2);
      }
      if(profile.counts[q]>0){
        for(let p=0;p<profile.nP;p++)if(profile.cells[q*profile.nP+p]){
          const x=cellX+p*cell;if(x+cell>x0+panelW)continue;
          const bp=tpoTimeParts(profile.session.start+p*profile.periodSec,o.timeZone),mins=bp.hour*60+bp.minute,label=tpoLetter(p,mins,profile.periodMin,o.letterMode),fs=Math.min(10,Math.max(6,Math.min(hh-1,cell*.78)));
          if(cell>=5.3&&hh>=7){ctx.font="600 "+fs.toFixed(1)+"px 'Space Grotesk',monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=isPoc?"#e0a91e":isSingle?(dark?"#ff8e8e":"#b23d3d"):dark?(inVA?"#d9e7ef":"#8e9aa6"):(inVA?"#234f6a":"#6a7075");ctx.fillText(label,x+cell/2,y+hh/2+.4)}
          else{ctx.fillStyle=isPoc?"#e0a91e":dark?"#81a9c0":"#557d96";ctx.fillRect(x,y,Math.max(.2,cell-.15),hh)}
        }
      }
      if(o.showCounts&&profile.counts[q]>0){ctx.font="8px 'Space Grotesk',sans-serif";ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillStyle=dark?"#a99c80":"#806d4c";ctx.fillText(String(profile.counts[q]),Math.min(x0+panelW-3,cellX+profile.nP*cell),y+hh/2)}
    }
    // Key levels and IB / range-extension references are separate from the profile cells.
    const lineY=price=>cs.priceToCoordinate(price);
    tpoDrawLine(lineY(profile.pocPrice),w,"#e9ad26",[],"POC",4);
    if(o.showValueArea){tpoDrawLine(lineY(profile.vah),w,"rgba(53,166,220,.95)",[5,4],"VAH",4);tpoDrawLine(lineY(profile.val),w,"rgba(53,166,220,.95)",[5,4],"VAL",4)}
    if(o.showFairPrice)tpoDrawLine(lineY(profile.fairPrice),w,"rgba(182,133,220,.95)",[2,4],"FAIR",4);
    if(o.showIB&&profile.ibHigh!=null){tpoDrawLine(lineY(profile.ibHigh),w,"rgba(44,180,133,.9)",[3,3],"IBH",4);tpoDrawLine(lineY(profile.ibLow),w,"rgba(226,105,105,.9)",[3,3],"IBL",4)}
    if(o.showPioneerRange&&profile.pioneerHigh!=null){tpoDrawLine(lineY(profile.pioneerHigh),w,"rgba(160,170,190,.85)",[1,4],"PION H",4);tpoDrawLine(lineY(profile.pioneerLow),w,"rgba(160,170,190,.85)",[1,4],"PION L",4)}
    if(o.showSinglePrints){
      const topSingleStart=Math.max(0,profile.n-profile.topSingles),botSingleEnd=Math.min(profile.n-1,profile.botSingles-1);
      if(profile.topSingles>=2){const yy=lineY(profile.base+(topSingleStart+.5)*profile.step);ctx.fillStyle="#df7777";ctx.font="600 9px 'Space Grotesk',sans-serif";ctx.textAlign="left";ctx.textBaseline="bottom";if(yy!=null)ctx.fillText("TOP SINGLE ×"+profile.topSingles,Math.max(4,x0-panelW*.18),yy-2)}
      if(profile.botSingles>=2){const yy=lineY(profile.base+(botSingleEnd+.5)*profile.step);ctx.fillStyle="#df7777";ctx.font="600 9px 'Space Grotesk',sans-serif";ctx.textAlign="left";ctx.textBaseline="top";if(yy!=null)ctx.fillText("BOT SINGLE ×"+profile.botSingles,Math.max(4,x0-panelW*.18),yy+2)}
    }
  }catch(e){if(typeof chErr==="function")chErr("TPO",e);else console.warn("TPO render",e)}
  finally{if(saved)ctx.restore()}
}
function tpoCheck(key,label,on){return`<label class="dtt-check"><input type="checkbox" data-tpo="${key}"${on?" checked":""}><span>${label}</span></label>`}
function tpoBuildSettings(){
  const el=$("tpoSettings");if(!el)return;const o=TPO.options;
  const opt=(list,v)=>list.map(([k,n])=>`<option value="${k}"${String(v)===String(k)?" selected":""}>${n}</option>`).join("");
  el.innerHTML=`<div class="dtt-head"><div><h2>Market Profile · TPO Chart <span class="pill">CBOT framework</span></h2><p class="msg">Biểu đồ Time/Price Opportunity độc lập. Một ký tự = một bracket thời gian mà giá đã giao dịch; có POC, Value Area, Initial Balance, single prints và thống kê cấu trúc phiên.</p></div><button type="button" class="btn sm ${o.enabled?"":"ghost"}" data-tpo="enabled">${o.enabled?"Đang bật":"Đang tắt"}</button></div>
  <div class="dtt-options">
    <label class="dtt-field">Múi giờ phiên<select data-tpo="timeZone">${opt([["America/New_York","New York"],["America/Chicago","Chicago"],["Europe/London","London"],["Asia/Ho_Chi_Minh","Việt Nam (UTC+7)"],["Etc/UTC","UTC"]],o.timeZone)}</select></label>
    <label class="dtt-field">Giờ bắt đầu phiên<input type="time" data-tpo="sessionStart" value="${o.sessionStart}"></label>
    <label class="dtt-field">Độ dài profile<select data-tpo="sessionHours">${opt([[1,"1 giờ"],[2,"2 giờ"],[3,"3 giờ"],[4,"4 giờ"],[6,"6 giờ"],[8,"8 giờ"],[12,"12 giờ"],[24,"24 giờ (CBOT/Globex)"]],o.sessionHours)}</select></label>
    <label class="dtt-field">Profile cần xem<select data-tpo="sessionPick">${opt([["current","Phiên hiện tại"],["previous","Phiên trước"]],o.sessionPick)}</select></label>
    <label class="dtt-field">TPO time bracket<select data-tpo="periodMin">${opt([[1,"1 phút"],[5,"5 phút"],[10,"10 phút"],[15,"15 phút"],[30,"30 phút (CBOT)"],[60,"60 phút"]],o.periodMin)}</select></label>
    <label class="dtt-field">Ký tự TPO<select data-tpo="letterMode">${opt([["cbot24","CBOT 24h: A–X / a–x"],["session","A–Z / a–z theo phiên"]],o.letterMode)}</select></label>
    <label class="dtt-field">Bước giá mỗi hàng (0 = tự động ~70 hàng)<input type="number" min="0" step="any" data-tpo="rowStep" value="${o.rowStep}"></label>
    <label class="dtt-field">Value Area (%)<input type="number" min="50" max="90" step="1" data-tpo="valueArea" value="${o.valueArea}"></label>
    <label class="dtt-field">Cách tính Value Area<select data-tpo="valueMode">${opt([["tpo","Theo số TPO (mặc định)"],["tick","Theo tick volume M1 (proxy)"]],o.valueMode)}</select></label>
    <label class="dtt-field">Initial Balance<select data-tpo="ibMinutes">${opt([[30,"30 phút"],[60,"60 phút (CBOT cơ bản)"],[90,"90 phút"],[100,"100 phút"],[120,"120 phút"]],o.ibMinutes)}</select></label>
    <label class="dtt-field">Vị trí profile<select data-tpo="side">${opt([["r","Bên phải"],["l","Bên trái"]],o.side)}</select></label>
    <label class="dtt-field">Bề rộng profile (% vùng chart)<input type="number" min="20" max="80" step="1" data-tpo="widthPct" value="${o.widthPct}"></label>
    <label class="dtt-field">Độ rộng mỗi cột (px)<input type="number" min="5" max="18" step="1" data-tpo="cellWidth" value="${o.cellWidth}"></label>
  </div>
  <div class="dtt-toggles">${tpoCheck("showValueArea","Tô vùng Value Area",o.showValueArea)}${tpoCheck("showIB","Hiện IBH / IBL",o.showIB)}${tpoCheck("showSinglePrints","Đánh dấu Single Prints và extreme ≥ 2 hàng",o.showSinglePrints)}${tpoCheck("showStats","Bảng thống kê profile",o.showStats)}${tpoCheck("showPriceLabels","Nhãn giá",o.showPriceLabels)}${tpoCheck("showCounts","Số bracket tại mỗi mức giá",o.showCounts)}${tpoCheck("showDayType","Phân loại Normal / Normal Variation / Trend / Neutral",o.showDayType)}${tpoCheck("showFairPrice","Đường Fairest Price / Imbalance",o.showFairPrice)}${tpoCheck("showRangeExtension","Tô vùng Range Extension trên / dưới IB",o.showRangeExtension)}${tpoCheck("showPioneerRange","Đánh dấu Pioneer Range (bracket đầu tiên)",o.showPioneerRange)}</div>
  <p class="msg dtt-note">Theo CBOT: bracket mặc định 30 phút; với profile 24 giờ, ký tự viết hoa A–X ứng với 00:00–12:00 và chữ thường a–x ứng với 12:00–24:00. Initial Balance là thời gian đầu phiên (thường 60 phút trong ví dụ CBOT), không phải quy tắc cố định cho mọi thị trường. Normal / Normal Variation / Trend / Neutral được suy ra từ range extension so với IB và vị trí đóng cửa. Fair price chọn mức có nhiều bracket nhất bên trong Value Area; số double prints ở hai phía được dùng để đọc imbalance theo cách CBOT. CBOT LDB trong phần phụ lục tính Value Area theo 70% nonspread contract volume; đây không phải thuật toán TPO-count. Tick volume cTrader chỉ là số lần cập nhật/báo giá, không phải volume futures tập trung. Khi có Footprint, module ưu tiên các mức giá từ FPM; khi không có, nó trải TPO qua High–Low M1 nên có thể bao gồm mức giá chỉ nằm trong râu nến. Bật TPO sẽ kích hoạt cơ chế tải tick cTrader dùng chung (tối đa 3 ngày gần nhất, như Footprint); nếu chưa kết nối hoặc không có tick, module tự fallback sang M1. Chế độ Replay chỉ dùng M1 để tránh đọc tick tương lai.</p>`;
}
function tpoSetValue(key,value){
  const o=TPO.options,checks=["enabled","showValueArea","showIB","showSinglePrints","showStats","showPriceLabels","showCounts","showDayType","showFairPrice","showRangeExtension","showPioneerRange"];
  if(checks.includes(key))o[key]=!!value;
  else if(key==="timeZone"){if(["America/New_York","America/Chicago","Etc/UTC","Europe/London","Asia/Ho_Chi_Minh"].includes(value))o.timeZone=value}
  else if(key==="sessionStart"){if(/^([01]\d|2[0-3]):[0-5]\d$/.test(value))o.sessionStart=value}
  else if(key==="sessionHours")o.sessionHours=[1,2,3,4,6,8,12,24].includes(+value)?+value:24;
  else if(key==="sessionPick")o.sessionPick=value==="previous"?"previous":"current";
  else if(key==="periodMin")o.periodMin=[1,5,10,15,30,60].includes(+value)?+value:30;
  else if(key==="letterMode")o.letterMode=value==="session"?"session":"cbot24";
  else if(key==="rowStep")o.rowStep=Math.max(0,Math.min(1e6,Number(value)||0));
  else if(key==="valueArea")o.valueArea=Math.max(50,Math.min(90,Math.round(+value||70)));
  else if(key==="valueMode")o.valueMode=value==="tick"?"tick":"tpo";
  else if(key==="ibMinutes")o.ibMinutes=[30,60,90,100,120].includes(+value)?+value:60;
  else if(key==="side")o.side=value==="l"?"l":"r";
  else if(key==="widthPct")o.widthPct=Math.max(20,Math.min(80,Math.round(+value||48)));
  else if(key==="cellWidth")o.cellWidth=Math.max(5,Math.min(18,Math.round(+value||9)));
  tpoSave();tpoBuildSettings();
}
const tpoPanel=$("tpoSettings");if(tpoPanel)tpoPanel.addEventListener("change",e=>{const t=e.target,k=t&&t.dataset&&t.dataset.tpo;if(!k)return;tpoSetValue(k,t.type==="checkbox"?t.checked:t.value)});
if(tpoPanel)tpoPanel.addEventListener("click",e=>{const b=e.target.closest("button[data-tpo='enabled']");if(b)tpoSetValue("enabled",!TPO.options.enabled)});
const tpoBtn=$("tpoBtn");if(tpoBtn)tpoBtn.addEventListener("click",()=>tpoSetValue("enabled",!TPO.options.enabled));
tpoSyncButton();tpoBuildSettings();
