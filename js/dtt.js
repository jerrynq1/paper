/* ================= DIGITAL TIME THEORY + DIGITAL ROOT ENGINE =================
   Native web implementation of the DTT TradingView overlay.
   Draws into the existing drawing canvas only: it never changes chart series,
   candle data, price scales, time scales, replay state, or drawing objects.
*/

/* ----- Pure Digital Root math (kept independent for unit tests) ----- */
function dttDR(value){
  const n=Math.abs(Math.trunc(Number(value)||0));
  if(!n)return 0;
  if(Number.isSafeInteger(n))return n%9===0?9:n%9;
  const s=String(n).replace(/\D/g,"");let sum=0;for(const c of s)sum+=c.charCodeAt(0)-48;
  return sum===0?0:(sum%9===0?9:sum%9);
}
function dttQuoteRoot(price,digits){
  const d=Math.max(0,Math.min(10,Math.trunc(Number(digits)||0)));
  const s=Math.abs(Number(price)||0).toFixed(d).replace(/\D/g,"");
  let sum=0;for(const c of s)sum+=c.charCodeAt(0)-48;
  return dttDR(sum);
}
function dttTickCount(price,tickSize,anchor=0){
  const t=Number(tickSize),p=Number(price),a=Number(anchor);
  if(!(t>0)||!Number.isFinite(p)||!Number.isFinite(a))return 0;
  return Math.round(Math.abs(p-a)/t);
}
function dttRootVector(bar,tickSize,anchor=0,digits=2){
  const q=[bar.open,bar.high,bar.low,bar.close].map(v=>dttQuoteRoot(v,digits));
  const tc=[bar.open,bar.high,bar.low,bar.close].map(v=>dttTickCount(v,tickSize,anchor));
  const tr=tc.map(dttDR);
  const div=tickSize>0?1/tickSize:0;
  const rt=dttDR(Math.round(Math.max(0,bar.high-bar.low)*div));
  const bt=dttDR(Math.round(Math.abs(bar.close-bar.open)*div));
  const ut=dttDR(Math.round(Math.max(0,bar.high-Math.max(bar.open,bar.close))*div));
  const lt=dttDR(Math.round(Math.max(0,Math.min(bar.open,bar.close)-bar.low)*div));
  return {quote:q,tickCounts:tc,tick:tr,shape:[rt,bt,ut,lt],quoteComposite:dttDR(q.reduce((a,b)=>a+b,0)),tickComposite:dttDR(tr.reduce((a,b)=>a+b,0)),shapeComposite:dttDR(rt+bt+ut+lt)};
}
function dttRootGroup(root){return root===3||root===6||root===9?"SCALER":root>=1&&root<=8?"VECTOR":"N/A"}
function dttRootState(root){return ({1:"Expansion",2:"Volatility",3:"Liquidity Raid",4:"Consolidation / Time Distortion",5:"Reversal / Mismatch",6:"Engineered Liquidity",7:"Retracement / MSS",8:"Expansion",9:"Peak Volatility / Hidden Liquidity"})[root]||"N/A"}
function dttRootRelation(a,b){return a==null||b==null?"N/A":a===b?"EXACT MATCH":dttRootGroup(a)===dttRootGroup(b)?"GROUP MATCH":"CROSS-GROUP"}
function dttHHMMRoot(hour,minute){return dttDR((Number(hour)||0)*100+(Number(minute)||0))}

/* ----- Model definitions: book-derived times, New York local clock ----- */
const DTT_MODEL_DEFS=[
  {id:"judas",name:"JUDAS",group:"ny",start:595,end:620,root:593,inner:[597,602,612],ss:570,se:960},
  {id:"m11",name:"MODEL 11",group:"ny",start:620,end:670,root:636,inner:[636,644,655],ss:570,se:960},
  {id:"m110",name:"MODEL 110",group:"ny",start:670,end:707,root:670,inner:[681,687,698],ss:570,se:960},
  {id:"m1001",name:"MODEL 1001",group:"ny",start:755,end:849,root:755,inner:[780,820,830],ss:570,se:960},
  {id:"m111",name:"MODEL 111",group:"ny",start:849,end:960,root:844,inner:[849,857,871],ss:570,se:960},
  {id:"damasu",name:"DAMASU",group:"asia",start:1080,end:1141,root:1087,inner:[1087,1102,1114],ss:1080,se:120},
  {id:"osaka",name:"OSAKA",group:"asia",start:1141,end:1274,root:1177,inner:[1156,1189,1216],ss:1080,se:120},
  {id:"kyoto",name:"KYOTO",group:"asia",start:1274,end:1384,root:1304,inner:[1286,1314,1336],ss:1080,se:120},
  {id:"nagasaki",name:"NAGASAKI",group:"asia",start:1384,end:120,root:4,inner:[1419,37,77],ss:1080,se:120},
  {id:"turncoat",name:"TURNCOAT",group:"london",start:120,end:235,root:192,inner:[151,172,221],ss:120,se:570},
  {id:"bishop",name:"BISHOP",group:"london",start:224,end:320,root:250,inner:[235,259,278],ss:120,se:570},
  {id:"knight",name:"KNIGHT",group:"london",start:320,end:399,root:329,inner:[329,348,364],ss:120,se:570},
  {id:"bigben",name:"BIG BEN",group:"london",start:399,end:570,root:418,inner:[418,461,495],ss:120,se:570}
];
const DTT_YEAR_DEFS=[
  {id:"hoodwink",name:"HOODWINK",sm:1,sd:1,em:2,ed:11,rm:1,rd:2},
  {id:"model33",name:"MODEL 33",sm:2,sd:13,em:5,ed:12,rm:2,rd:23},
  {id:"timedist",name:"TIME DISTORTION",sm:5,sd:12,em:7,ed:27,rm:5,rd:22},
  {id:"imp9",name:"IMP 9",sm:7,sd:27,em:1,ed:1,rm:7,rd:27}
];
const DTT_COLORS={ny:"#3882dc",asia:"#be8232",london:"#9664cd",macro:"#1e9b7d",root:"#f5be37",inner:"#c0c0c0"};

/* ----- Persistent user settings ----- */
const DTT_STORE_KEY="tp_dtt_v1";
const DTT_DEFAULTS={
  enabled:true,timeZone:"America/New_York",tickSize:0,tickAnchor:0,historyDays:365,
  showSessionBoxes:true,showModelBoxes:true,showRootBoxes:true,showInner:true,showLabels:true,
  showWeekly:true,showYearly:true,showDashboard:true,
  groups:{ny:true,asia:true,london:true},
  models:Object.fromEntries(DTT_MODEL_DEFS.map(x=>[x.id,true]))
};
function dttLoadSettings(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(DTT_STORE_KEY)||"{}")||{}}catch{}
  const out={...DTT_DEFAULTS,...saved};
  out.groups={...DTT_DEFAULTS.groups,...(saved.groups||{})};
  out.models={...DTT_DEFAULTS.models,...(saved.models||{})};
  if(!["America/New_York","Etc/UTC","Europe/London","Asia/Ho_Chi_Minh"].includes(out.timeZone))out.timeZone="America/New_York";
  out.tickSize=Number.isFinite(+out.tickSize)&&+out.tickSize>=0?+out.tickSize:0;
  out.tickAnchor=Number.isFinite(+out.tickAnchor)?+out.tickAnchor:0;
  out.historyDays=Math.max(30,Math.min(3650,Math.trunc(+out.historyDays||365)));
  return out;
}
const DTT={options:dttLoadSettings(),cache:null,version:0,dash:null};
function dttSave(){try{localStorage.setItem(DTT_STORE_KEY,JSON.stringify(DTT.options))}catch{}DTT.version++;DTT.cache=null;dttSyncButton();if(typeof dirty!=="undefined")dirty=true}
function dttSyncButton(){const b=$("dttBtn");if(!b)return;b.classList.toggle("on",!!DTT.options.enabled);b.setAttribute("aria-pressed",DTT.options.enabled?"true":"false")}

/* ----- Calendar/time conversion ----- */
function dttDayKey(p){return Math.floor(Date.UTC(p.year,p.month-1,p.day)/86400000)}
function dttDateFromKey(k){const d=new Date(k*86400000);return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()}}
function dttAddDays(k,n){return k+n}
function dttUtcAt(key,minute,tz){
  const d=dttDateFromKey(key),h=Math.floor(minute/60),m=minute%60;
  const wall=Date.UTC(d.year,d.month-1,d.day,h,m,0,0);
  let off=tzOff(tz,wall),utc=wall-off*1000;
  const off2=tzOff(tz,utc);if(off2!==off)utc=wall-off2*1000;
  return utc/1000;
}
function dttTimeParts(utcSec,tz){return parts(tz,utcSec*1000)}
function dttDateMinute(utcSec,tz){const p=dttTimeParts(utcSec,tz);return{key:dttDayKey(p),minute:p.hour*60+p.minute,parts:p}}
function dttStartEnd(key,start,end,tz){const a=dttUtcAt(key,start,tz),b=dttUtcAt(end<=start?key+1:key,end,tz);return[a,b]}
function dttRootTime(key,root,start,end,tz){
  // Chỉ chuyển sang ngày kế tiếp khi model thực sự chạy qua nửa đêm.
  // Ví dụ Model 111 có Root Candle 14:04 trước khi model bắt đầu 14:09,
  // nhưng vẫn nằm trong cùng ngày; Nagasaki 00:04 mới thuộc ngày kế.
  const overnight=end<=start,day=overnight&&root<end?key+1:key;
  return dttUtcAt(day,root,tz)
}

/* ----- Build cached drawing primitives from current chart bars ----- */
function dttLowerBound(bars,utc){let lo=0,hi=bars.length;while(lo<hi){const m=(lo+hi)>>1;if(bars[m].utc<utc)lo=m+1;else hi=m}return lo}
function dttRange(bars,start,end,tf){
  let i=Math.max(0,dttLowerBound(bars,start-tf));let hi=-Infinity,lo=Infinity,count=0,first=-1,last=-1;
  for(;i<bars.length&&bars[i].utc<end;i++){
    const b=bars[i];if(b.utc+tf<=start)continue;
    hi=Math.max(hi,b.high);lo=Math.min(lo,b.low);count++;if(first<0)first=i;last=i;
  }
  return count?{high:hi,low:lo,count,first,last}:null;
}
function dttBarAt(bars,utc,tf){
  let i=dttLowerBound(bars,utc+1)-1;
  if(i>=0&&bars[i].utc<=utc&&utc<bars[i].utc+tf)return bars[i];
  i=dttLowerBound(bars,utc);
  if(i<bars.length&&bars[i].utc-utc>=0&&bars[i].utc-utc<Math.min(tf,180))return bars[i];
  return null;
}
function dttBuildCache(){
  if(!agg.length)return{boxes:[],roots:[],markers:[],weekRoots:[],yearly:[]};
  const o=DTT.options,tf=Math.max(1,+C.tf||60),tz=o.timeZone;
  const last0=agg[agg.length-1];
  const days=tf>=86400?o.historyDays:Math.min(o.historyDays,120);
  const cutoff=s2u(last0.st)-days*86400;
  let from=0;while(from<agg.length&&s2u(agg[from].st)<cutoff)from++;
  const raw=agg.slice(from),bars=[];
  for(const b of raw){const utc=s2u(b.st);if(!Number.isFinite(utc))continue;bars.push({utc,st:b.st,open:b.open,high:b.high,low:b.low,close:b.close})}
  if(!bars.length)return{boxes:[],roots:[],markers:[],weekRoots:[],yearly:[]};
  const firstDay=dttDateMinute(bars[0].utc,tz).key,lastDay=dttDateMinute(bars[bars.length-1].utc,tz).key;
  const boxes=[],roots=[],markers=[],weekRoots=[],yearly=[];
  const addRangeBox=(name,start,end,color,alpha,kind)=>{const rg=dttRange(bars,start,end,tf);if(!rg)return;boxes.push({name,start,end,high:rg.high,low:rg.low,baseHigh:rg.high,baseLow:rg.low,color,alpha,kind})};
  const addRoot=(name,key,root,start,modelEnd,parentEnd,color)=>{
    const rt=dttRootTime(key,root,start,modelEnd,tz),bar=dttBarAt(bars,rt,tf);if(!bar)return;
    roots.push({name,start:bar.utc,end:parentEnd,high:bar.high,low:bar.low,baseHigh:bar.high,baseLow:bar.low,color:DTT_COLORS.root,kind:"root"});
  };
  // Intraday models and session overview. Include the prior local date for Asia windows crossing midnight.
  if(tf<86400){
    const dayModels=DTT_MODEL_DEFS.filter(m=>o.groups[m.group]&&o.models[m.id]);
    for(let key=Math.max(firstDay-1,lastDay-days-2);key<=lastDay;key++){
      if(o.showSessionBoxes){
        for(const s of [
          {name:"ASIA SESSION",group:"asia",start:1080,end:120,color:DTT_COLORS.asia},
          {name:"LONDON SESSION",group:"london",start:120,end:570,color:DTT_COLORS.london},
          {name:"NEW YORK SESSION",group:"ny",start:570,end:960,color:DTT_COLORS.ny}
        ]){
          if(!o.groups[s.group])continue;
          const [a,b]=dttStartEnd(key,s.start,s.end,tz);addRangeBox(s.name,a,b,s.color,.035,"session");
        }
      }
      for(const m of dayModels){
        const [a,b]=dttStartEnd(key,m.start,m.end,tz);
        if(o.showModelBoxes)addRangeBox(m.name,a,b,DTT_COLORS[m.group],.085,"model");
        if(o.showRootBoxes)addRoot(m.name+" ROOT",key,m.root,m.start,m.end,dttUtcAt(m.se===120?key+1:key,m.se,tz),DTT_COLORS.root);
        if(o.showInner)for(const minute of m.inner){
          const k=(m.start>m.end&&minute<m.end)||minute>=1440?key+1:minute<0?key-1:key,mm=((minute%1440)+1440)%1440;
          markers.push({time:dttUtcAt(k,mm,tz),name:m.name+" · "+String(Math.floor(mm/60)).padStart(2,"0")+":"+String(mm%60).padStart(2,"0"),color:DTT_COLORS.inner});
        }
      }
    }

  }

  // Weekly macro models are also available on D1; intraday models above remain intraday-only.
  // Weekly macro segments are approximate: Sunday 17:00 NY to Friday 17:00 NY,
  // divided by the fractions transcribed from the supplied book/Pine source.
  if(o.showWeekly&&tf<=86400){
    const firstWeek=firstDay-7;
    for(let k=firstWeek;k<=lastDay;k++){
      const d=dttDateFromKey(k);if(new Date(Date.UTC(d.year,d.month-1,d.day)).getUTCDay()!==0)continue;
      const ws=dttUtcAt(k,1020,tz),we=dttUtcAt(k+5,1020,tz),span=we-ws;if(!(span>0))continue;
      const f=[0,.1125,.36,.5625,1],names=["ISCARIOT","ARES","ASH WEDNESDAY","ICARUS"];
      if(o.showModelBoxes)for(let j=0;j<4;j++)addRangeBox(names[j],ws+span*f[j],ws+span*f[j+1],DTT_COLORS.macro,.075,"weekly");
      const boundaries=f.slice(1,4).map((x,j)=>({time:ws+span*x,name:names[j]+" / "+names[j+1],color:DTT_COLORS.macro}));markers.push(...boundaries);
      const rootAt=ws+span*.1125,bar=dttBarAt(bars,rootAt,tf);
      if(o.showRootBoxes&&bar)weekRoots.push({name:"WEEKLY ROOT",start:bar.utc,end:we,high:bar.high,low:bar.low,baseHigh:bar.high,baseLow:bar.low,color:DTT_COLORS.root,kind:"root"});
    }
  }
  // Yearly model windows are drawn only on D1, matching the TradingView script's daily-chart restriction.
  if(o.showYearly&&tf===86400){
    const years=new Set();for(const b of bars)years.add(dttTimeParts(b.utc,tz).year);
    for(const y of [...years].sort((a,b)=>a-b))for(const m of DTT_YEAR_DEFS){
      const sk=Math.floor(Date.UTC(y,m.sm-1,m.sd)/86400000);
      const ey=(m.em===1&&m.ed===1)?y+1:y,ek=Math.floor(Date.UTC(ey,m.em-1,m.ed)/86400000);
      const a=dttUtcAt(sk,0,tz),b=dttUtcAt(ek,0,tz);if(o.showModelBoxes)addRangeBox(m.name,a,b,DTT_COLORS.macro,.08,"yearly");
      if(o.showRootBoxes){const rk=Math.floor(Date.UTC(y,m.rm-1,m.rd)/86400000),rt=dttUtcAt(rk,720,tz),rb=dttBarAt(bars,rt,tf);
        if(rb)yearly.push({name:m.name+" ROOT",start:rb.utc,end:b,high:rb.high,low:rb.low,baseHigh:rb.high,baseLow:rb.low,color:DTT_COLORS.root,kind:"root"});}
    }
  }
  // Keep a hard ceiling on canvas objects so a long data history cannot stall the chart.
  const boxLimit=500,rootLimit=500,markerLimit=900;
  return{bars,boxes:boxes.slice(-boxLimit),roots:roots.slice(-rootLimit).concat(weekRoots.slice(-100),yearly.slice(-100)),markers:markers.slice(-markerLimit),tf,tz,from,sourceN:agg.length};
}
function dttCacheKey(){
  const last=agg[agg.length-1],first=agg[0];
  // Historical geometry is rebuilt on a new bar/settings change, not on every live tick.
  return [DTT.version,C.sym,C.tf,agg.length,first&&first.st,last&&last.st,PDIG(),JSON.stringify(DTT.options)].join("|");
}
function dttPatchLiveBar(data){
  const b=agg[agg.length-1];if(!b||!data)return;
  const utc=s2u(b.st),end=utc+Math.max(1,+C.tf||60),all=[...(data.boxes||[]),...(data.roots||[])];
  for(const box of all){
    if(box.kind==="root"){
      // Chỉ cập nhật biên Root Candle khi chính cây nến gốc vẫn đang hình thành.
      if(utc>=box.start&&utc<box.start+Math.max(1,+C.tf||60)){
        box.high=Math.max(box.baseHigh==null?box.high:box.baseHigh,b.high);
        box.low=Math.min(box.baseLow==null?box.low:box.baseLow,b.low);
      }
      continue;
    }
    if(utc<box.end&&end>box.start){
      box.high=Math.max(box.baseHigh==null?box.high:box.baseHigh,b.high);
      box.low=Math.min(box.baseLow==null?box.low:box.baseLow,b.low);
    }
  }
}
function dttEnsureCache(){const key=dttCacheKey();if(!DTT.cache||DTT.cache.key!==key)DTT.cache={key,data:dttBuildCache()};return DTT.cache.data}

/* ----- Canvas rendering helpers ----- */
function dttX(utcSec){
  try{const st=u2s(utcSec);return ts.logicalToCoordinate(s2l(st))}catch{return null}
}
function dttDrawBox(b,w,h){
  const x0=dttX(b.start),x1=dttX(b.end),y0=cs.priceToCoordinate(b.high),y1=cs.priceToCoordinate(b.low);
  if(x0==null||x1==null||y0==null||y1==null||![x0,x1,y0,y1].every(Number.isFinite))return;
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),bt=Math.max(y0,y1);
  if(r<0||l>w||bt<0||t>h)return;
  const fillAlpha=Number.isFinite(b.alpha)?b.alpha:(b.kind==="root"?.065:.05);
  ctx.save();ctx.fillStyle=dttRgba(b.color,fillAlpha);ctx.strokeStyle=dttRgba(b.color,b.kind==="root"?.95:b.kind==="session"?.42:.72);ctx.lineWidth=b.kind==="session"?1.4:1;
  ctx.fillRect(l,t,Math.max(1,r-l),Math.max(1,bt-t));ctx.strokeRect(l+.5,t+.5,Math.max(1,r-l-1),Math.max(1,bt-t-1));ctx.restore();
  if(DTT.options.showLabels&&b.kind!=="root"&&r-l>35&&t>10&&l<w-20){ctx.save();ctx.font="600 10px 'Space Grotesk',sans-serif";ctx.fillStyle=dttRgba(b.color,.95);ctx.textAlign="left";ctx.textBaseline="bottom";ctx.fillText(b.name,l+4,t-2);ctx.restore()}
  if(DTT.options.showLabels&&b.kind==="root"&&r-l>50&&t>12&&l<w-20){ctx.save();ctx.font="600 9px 'Space Grotesk',sans-serif";ctx.fillStyle="#f5be37";ctx.textAlign="left";ctx.textBaseline="bottom";ctx.fillText("ROOT",l+3,t-2);ctx.restore()}
}
function dttRgba(hex,a=1){const s=String(hex||"#ffffff").replace("#","");const n=parseInt(s.length===3?s.split("").map(x=>x+x).join(""):s.slice(0,6),16);const alpha=Number.isFinite(+a)?Math.max(0,Math.min(1,+a)):1;return`rgba(${n>>16&255},${n>>8&255},${n&255},${alpha})`}
function dttDrawMarkers(list,w,h){
  if(!DTT.options.showInner)return;
  ctx.save();ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.font="9px 'Space Grotesk',sans-serif";
  for(const m of list){const x=dttX(m.time);if(x==null||!Number.isFinite(x)||x<0||x>w)continue;ctx.strokeStyle=dttRgba(m.color,.8);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
    if(DTT.options.showLabels){ctx.fillStyle=dttRgba(m.color,.95);ctx.textAlign="center";ctx.textBaseline="top";ctx.fillText(m.name,x+1,3)}}
  ctx.restore();
}

/* ----- Price Root dashboard ----- */
function dttEnsureDash(){
  if(DTT.dash)return DTT.dash;
  const el=document.createElement("div");el.id="dttDash";el.className="dtt-dash";el.setAttribute("aria-label","Digital Root dashboard");$("chart").appendChild(el);DTT.dash=el;return el;
}
function dttHideDash(){if(DTT.dash)DTT.dash.style.display="none"}
function dttRenderDashboard(){
  const el=dttEnsureDash(),o=DTT.options;
  if(!o.enabled||!o.showDashboard||!agg.length){el.style.display="none";return}
  const b=agg[agg.length-1],dig=PDIG(),tick=o.tickSize>0?o.tickSize:Math.pow(10,-dig),v=dttRootVector(b,tick,o.tickAnchor,dig),utc=s2u(b.st),p=dttTimeParts(utc,o.timeZone),timeRoot=dttHHMMRoot(p.hour,p.minute),fmt=a=>a.join("/"),cls=r=>dttRootGroup(r),st=r=>dttRootState(r),rel=(a,b)=>dttRootRelation(a,b);
  const rows=[
    ["TIME ROOT",String(timeRoot),cls(timeRoot)+" · "+st(timeRoot)],
    ["QUOTE O/H/L/C",fmt(v.quote),"Close: "+cls(v.quote[3])+" · "+st(v.quote[3])],
    ["TICK O/H/L/C",fmt(v.tick),"Close: "+cls(v.tick[3])+" · "+st(v.tick[3])],
    ["SHAPE R/B/U/L",fmt(v.shape),"Range / Body / Wicks"],
    ["TICK OHLC COMP",String(v.tickComposite),cls(v.tickComposite)+" · "+st(v.tickComposite)],
    ["TIME ↔ TICK CLOSE",rel(timeRoot,v.tick[3]),"T"+timeRoot+" / P"+v.tick[3]],
    ["QUOTE ↔ TICK CLOSE",rel(v.quote[3],v.tick[3]),"Q"+v.quote[3]+" / P"+v.tick[3]],
    ["TICK BASIS",String(tick),"Anchor "+o.tickAnchor]
  ];
  const html=`<div class="dtt-dh"><b>DIGITAL ROOT ENGINE</b><span>${o.timeZone.replace("America/","NY · ").replace("Asia/Ho_Chi_Minh","Vietnam").replace("Etc/UTC","UTC").replace("Europe/London","London")}</span></div><table>${rows.map(r=>`<tr><th>${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>`;
  if(el.dataset.html!==html){el.innerHTML=html;el.dataset.html=html}
  el.style.display="block";
}

/* ----- Main render hook (called by the existing drawing canvas) ----- */
function drawDTT(w,h){
  if(!DTT.options.enabled||!agg.length){dttHideDash();return}
  try{
    const data=dttEnsureCache();dttPatchLiveBar(data);
    for(const b of data.boxes||[])dttDrawBox(b,w,h);
    for(const b of data.roots||[])dttDrawBox(b,w,h);
    dttDrawMarkers(data.markers||[],w,h);
    dttRenderDashboard();
  }catch(e){dttHideDash();if(typeof chErr==="function")chErr("DTT",e)}
}

/* ----- Indicator page settings ----- */
function dttBuildSettings(){
  const el=$("dttSettings");if(!el)return;const o=DTT.options;
  const check=(key,label,checked)=>`<label class="dtt-check"><input type="checkbox" data-dtt="${key}"${checked?" checked":""}><span>${label}</span></label>`;
  const modelRows=(group)=>DTT_MODEL_DEFS.filter(m=>m.group===group).map(m=>check("model:"+m.id,m.name,o.models[m.id])).join("");
  el.innerHTML=`<div class="dtt-head"><div><h2>Digital Time Theory <span class="pill">DTT + Digital Root Engine</span></h2><p class="msg">Khung model, Root Candle, inner markers và bộ tính Price Root. Vẽ trên canvas riêng của chart, không sửa dữ liệu nến.</p></div><button type="button" class="btn sm ${o.enabled?"":"ghost"}" data-dtt="enabled">${o.enabled?"Đang bật":"Đang tắt"}</button></div>
  <div class="dtt-options">
    <label class="dtt-field">Timezone model<select data-dtt="timeZone"><option value="America/New_York"${o.timeZone==="America/New_York"?" selected":""}>New York (mặc định)</option><option value="Etc/UTC"${o.timeZone==="Etc/UTC"?" selected":""}>UTC</option><option value="Europe/London"${o.timeZone==="Europe/London"?" selected":""}>London</option><option value="Asia/Ho_Chi_Minh"${o.timeZone==="Asia/Ho_Chi_Minh"?" selected":""}>Việt Nam</option></select></label>
    <label class="dtt-field">Tick Size (0 = tự động theo digits)<input type="number" min="0" step="any" data-dtt="tickSize" value="${o.tickSize}"></label>
    <label class="dtt-field">Tick Root Anchor<input type="number" step="any" data-dtt="tickAnchor" value="${o.tickAnchor}"></label>
    <label class="dtt-field">Lịch sử hiển thị (ngày)<input type="number" min="30" max="3650" step="30" data-dtt="historyDays" value="${o.historyDays}"></label>
  </div>
  <div class="dtt-toggles">${check("showSessionBoxes","Khung phiên tổng (Asia / London / New York)",o.showSessionBoxes)}${check("showModelBoxes","Khung từng model",o.showModelBoxes)}${check("showRootBoxes","Root Candle rectangle kéo đến hết phiên/model",o.showRootBoxes)}${check("showInner","Inner interval markers",o.showInner)}${check("showLabels","Tên model / Root label",o.showLabels)}${check("showWeekly","Weekly macro models (xấp xỉ)",o.showWeekly)}${check("showYearly","Yearly macro models (D1)",o.showYearly)}${check("showDashboard","Digital Root dashboard",o.showDashboard)}</div>
  <div class="dtt-groups"><section><h3>New York</h3>${check("group:ny","Bật nhóm New York",o.groups.ny)}${modelRows("ny")}</section><section><h3>Asia</h3>${check("group:asia","Bật nhóm Asia",o.groups.asia)}${modelRows("asia")}</section><section><h3>London</h3>${check("group:london","Bật nhóm London",o.groups.london)}${modelRows("london")}</section></div>
  <p class="msg dtt-note">Thời gian model được diễn giải theo timezone đã chọn; các mốc trong tài liệu được trích xuất từ PDF và một số weekly/yearly là xấp xỉ. Trên chart lớn hơn M1, Root Candle là cây nến chart chứa phút mục tiêu. Yearly chỉ vẽ trên D1. Tick Size tự động dùng 10^-digits nếu cTrader chưa cung cấp min tick riêng.</p>`;
}
function dttSetValue(key,value){
  const o=DTT.options;
  if(key.startsWith("model:")){const id=key.slice(6);if(id in o.models)o.models[id]=!!value}
  else if(key.startsWith("group:")){const id=key.slice(6);if(id in o.groups)o.groups[id]=!!value}
  else if(["enabled","showSessionBoxes","showModelBoxes","showRootBoxes","showInner","showLabels","showWeekly","showYearly","showDashboard"].includes(key))o[key]=!!value;
  else if(key==="timeZone")o.timeZone=value;
  else if(key==="tickSize")o.tickSize=Math.max(0,Number(value)||0);
  else if(key==="tickAnchor")o.tickAnchor=Number(value)||0;
  else if(key==="historyDays")o.historyDays=Math.max(30,Math.min(3650,Math.round(Number(value)||365)));
  dttSave();dttBuildSettings();
}
const dttPanel=$("dttSettings");
if(dttPanel)dttPanel.addEventListener("change",e=>{const t=e.target,key=t&&t.dataset&&t.dataset.dtt;if(!key)return;dttSetValue(key,t.type==="checkbox"?t.checked:t.value)});
if(dttPanel)dttPanel.addEventListener("click",e=>{const t=e.target.closest("button[data-dtt='enabled']");if(t){dttSetValue("enabled",!DTT.options.enabled)}});
const dttBtn=$("dttBtn");if(dttBtn)dttBtn.addEventListener("click",()=>{DTT.options.enabled=!DTT.options.enabled;dttSave();dttBuildSettings()});
dttSyncButton();
// Hỗ trợ deep-link trực tiếp tới #ind: init.js chạy trước file DTT.
if($("v-ind")&&$("v-ind").classList&&$("v-ind").classList.contains("on"))dttBuildSettings();
