/* QuantLab Market Statistics — pure calculations (New York exchange clock). */
(function (root) {
  "use strict";
  const DAY = 86400000, MIN = 60000;
  const ET = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23"
  });
  const WD = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const pad = n => String(n).padStart(2,"0");
  const dateKey = (y,m,d) => `${y}-${pad(m)}-${pad(d)}`;
  function etParts(ms) {
    const o = {};
    for (const p of ET.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = p.value;
    o.year=+o.year; o.month=+o.month; o.day=+o.day; o.hour=+o.hour; o.minute=+o.minute; o.second=+o.second;
    o.weekday=WD[o.weekday] ?? 0; o.date=dateKey(o.year,o.month,o.day); o.minuteOfDay=o.hour*60+o.minute;
    return o;
  }
  function addDate(date, n) {
    const [y,m,d]=date.split("-").map(Number), x=new Date(Date.UTC(y,m-1,d+n));
    return dateKey(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate());
  }
  function weekdayOfDate(date) { const [y,m,d]=date.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)).getUTCDay(); }
  function etLocalToUtcMs(date, minuteOfDay) {
    const [y,m,d]=date.split("-").map(Number), hh=Math.floor(minuteOfDay/60), mm=minuteOfDay%60;
    const target=Date.UTC(y,m-1,d,hh,mm), partsToMs=p=>Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    let guess=target;
    for(let i=0;i<4;i++){const p=etParts(guess),delta=target-partsToMs(p);if(!delta)break;guess+=delta;}
    return guess;
  }
  function sessionInfo(tsMs, mode) {
    const p=etParts(tsMs), m=p.minuteOfDay, d=p.weekday;
    if(mode==="RTH") return d>=1&&d<=5&&m>=570&&m<960 ? {date:p.date, minute:m, weekday:d, elapsed:m-570, expected:390} : null;
    // CME-style ETH proxy: trade date runs from prior-day 18:00 ET to trade-date 17:00 ET;
    // 17:00–18:00 is maintenance. Sunday 18:00 opens Monday's trade date; Friday 17:00 closes.
    if(d===6) return null;
    if(d===0) return m>=1080 ? {date:addDate(p.date,1),minute:m,weekday:1,elapsed:m-1080,expected:1380} : null;
    if(d>=1&&d<=5){
      if(m<1020) return {date:p.date,minute:m,weekday:d,elapsed:360+m,expected:1380};
      if(m>=1080&&d<5) return {date:addDate(p.date,1),minute:m,weekday:d+1,elapsed:m-1080,expected:1380};
    }
    return null;
  }
  function slotFor(info, mode) {
    const idx=Math.floor(info.elapsed/60), startElapsed=idx*60;
    const startMinute=mode==="RTH"?570+startElapsed:(1080+startElapsed)%1440;
    const duration=Math.min(60,info.expected-startElapsed);
    const endMinute=(startMinute+duration)%1440;
    return {key:String(idx),index:idx,startMinute,duration,label:`${pad(Math.floor(startMinute/60))}:${pad(startMinute%60)}–${pad(Math.floor(endMinute/60))}:${pad(endMinute%60)}`,expected:duration};
  }
  function slot20For(info) {
    const idx=Math.floor(info.elapsed/20), startElapsed=idx*20;
    const startMinute=info.expected===390?570+startElapsed:(1080+startElapsed)%1440;
    const duration=Math.min(20,info.expected-startElapsed), endMinute=(startMinute+duration)%1440;
    return {key:String(idx),index:idx,startMinute,duration,label:`${pad(Math.floor(startMinute/60))}:${pad(startMinute%60)}–${pad(Math.floor(endMinute/60))}:${pad(endMinute%60)}`,expected:duration};
  }
  function bucketAdd(b, row) {
    if(!b){return {open:row[1],high:row[2],low:row[3],close:row[4],volume:row[5]||0,bars:1,first:row[0],last:row[0]};}
    if(row[0]<b.first){b.first=row[0];b.open=row[1];} if(row[0]>b.last){b.last=row[0];b.close=row[4];}
    b.high=Math.max(b.high,row[2]);b.low=Math.min(b.low,row[3]);b.volume+=(row[5]||0);b.bars++;return b;
  }
  function buildSessions(rows, mode) {
    mode=mode==="ETH"?"ETH":"RTH";
    const map=new Map();
    for(const row of rows){
      if(!row||row.length<5)continue;
      const ts=+row[0],o=+row[1],h=+row[2],l=+row[3],c=+row[4],v=+row[5]||0;
      if(!Number.isFinite(ts)||!Number.isFinite(o)||!Number.isFinite(h)||!Number.isFinite(l)||!Number.isFinite(c)||h<l)continue;
      const info=sessionInfo(ts,mode);if(!info)continue;
      let s=map.get(info.date);
      if(!s){s={date:info.date,open:o,high:h,low:l,close:c,bars:0,volume:0,first:ts,last:ts,hours:{},windows20:{},macros:{},weekday:weekdayOfDate(info.date),expected:info.expected};map.set(info.date,s);}
      s.high=Math.max(s.high,h);s.low=Math.min(s.low,l);s.volume+=v;s.bars++;
      if(ts<s.first){s.first=ts;s.open=o;} if(ts>=s.last){s.last=ts;s.close=c;}
      const hs=slotFor(info,mode);s.hours[hs.key]=bucketAdd(s.hours[hs.key],[ts,o,h,l,c,v]);
      const ws=slot20For(info);s.windows20[ws.key]=bucketAdd(s.windows20[ws.key],[ts,o,h,l,c,v]);
      if(info.minute>=590&&info.minute<610)s.macros.m0950=bucketAdd(s.macros.m0950,[ts,o,h,l,c,v]);
      if(info.minute>=650&&info.minute<670)s.macros.m1050=bucketAdd(s.macros.m1050,[ts,o,h,l,c,v]);
    }
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(s=>{
      const hours=Object.entries(s.hours).map(([key,b])=>{const info={elapsed:+key*60,expected:s.expected};const sl=slotFor(info,mode);return {...b,key,index:+key,label:sl.label,duration:sl.duration};}).sort((a,b)=>a.index-b.index);
      const windows20=Object.entries(s.windows20).map(([key,b])=>{const elapsed=+key*20,info={elapsed,expected:s.expected};const sl=slot20For(info);return {...b,key,index:+key,label:sl.label,duration:sl.duration};}).sort((a,b)=>a.index-b.index);
      const macros={};for(const [k,b] of Object.entries(s.macros))macros[k]={...b};
      return {...s,hours,windows20,macros,range:s.high-s.low,body:Math.abs(s.close-s.open),bodyEfficiency:s.high>s.low?Math.abs(s.close-s.open)/(s.high-s.low):0,up:s.close>s.open,down:s.close<s.open,coverage:s.bars/s.expected};
    });
  }
  function quantile(values,q) {
    const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;
    const p=(a.length-1)*Math.max(0,Math.min(1,q)),lo=Math.floor(p),hi=Math.ceil(p);return a[lo]+(a[hi]-a[lo])*(p-lo);
  }
  const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN;
  const median=a=>quantile(a,.5);
  const fmtWeek=date=>{
    const [y,m,d]=date.split("-").map(Number),dt=new Date(Date.UTC(y,m-1,d));
    dt.setUTCDate(dt.getUTCDate()+4-(dt.getUTCDay()||7));const year=dt.getUTCFullYear();
    const jan1=new Date(Date.UTC(year,0,1));const week=Math.ceil((((dt-jan1)/DAY)+1)/7);
    const [wy,wm,wd]=[y,m,d],monday=new Date(Date.UTC(wy,wm-1,wd));monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
    const start=dateKey(monday.getUTCFullYear(),monday.getUTCMonth()+1,monday.getUTCDate());return {key:`${year}-W${pad(week)}`,week,start,end:addDate(start,6)};
  };
  function summarizeDaily(items) {
    const a=items,rs=a.map(x=>x.range),body=mean(a.map(x=>x.bodyEfficiency)),adr=mean(a.map(x=>x.adrRatio).filter(Number.isFinite));
    const classified=a.filter(x=>x.qualified!==false),strong=classified.filter(x=>x.strong===true).length,light=classified.filter(x=>x.light===true).length,up=a.filter(x=>x.up).length,down=a.filter(x=>x.down).length;
    return {n:a.length,classifiedN:classified.length,avg:mean(rs),median:median(rs),p75:quantile(rs,.75),strong,light,strongPct:classified.length?100*strong/classified.length:NaN,lightPct:classified.length?100*light/classified.length:NaN,upPct:a.length?100*up/a.length:0,downPct:a.length?100*down/a.length:0,bodyEfficiency:body,adrRatio:adr,coverage:mean(a.map(x=>x.coverage))};
  }
  function groupDaily(sessions, keyFn, labelFn) {
    const m=new Map();for(const s of sessions){const k=keyFn(s);if(!m.has(k))m.set(k,[]);m.get(k).push(s);}
    return [...m.entries()].map(([key,a])=>({key,label:labelFn?labelFn(key,a):key,...summarizeDaily(a),from:a[0].date,to:a[a.length-1].date}));
  }
  function makeFutureCandidates(mode, nowMs, countDays=5) {
    const now=nowMs??Date.now(),today=etParts(now).date,base=[];let daysAdded=0;
    for(let off=0;off<14&&daysAdded<countDays;off++){
      const tradeDate=addDate(today,off),wd=weekdayOfDate(tradeDate);if(wd<1||wd>5)continue;daysAdded++;
      if(mode==="RTH"){
        for(let i=0;i<7;i++){
          const elapsed=i*60,sm=570+elapsed,dur=Math.min(60,390-elapsed),start=etLocalToUtcMs(tradeDate,sm),end=etLocalToUtcMs(tradeDate,sm+dur);
          if(end>now&&start>=now)base.push({type:"hour",date:tradeDate,slot:String(i),start,end,label:`${tradeDate} · ${pad(Math.floor(sm/60))}:${pad(sm%60)}–${pad(Math.floor((sm+dur)/60))}:${pad((sm+dur)%60)}`});
        }
      }else{
        const prev=addDate(tradeDate,-1);
        for(let i=0;i<23;i++){
          const elapsed=i*60,sm=(1080+elapsed)%1440,startDate=sm>=1080?prev:tradeDate,dur=60,start=etLocalToUtcMs(startDate,sm),end=etLocalToUtcMs(addDate(startDate,Math.floor((sm+dur)/1440)),(sm+dur)%1440);
          if(end>now&&start>=now)base.push({type:"hour",date:tradeDate,slot:String(i),start,end,label:`${tradeDate} · ${pad(Math.floor(sm/60))}:${pad(sm%60)}–${pad((Math.floor((sm+dur)/60))%24)}:${pad((sm+dur)%60)}`});
        }
      }
      for(const [k,sm,em,label] of [["m0950",590,610,"Macro 09:50–10:10"],["m1050",650,670,"Macro 10:50–11:10"]]){
        const start=etLocalToUtcMs(tradeDate,sm),end=etLocalToUtcMs(tradeDate,em);if(end>now&&start>=now)base.push({type:"macro",date:tradeDate,slot:k,start,end,label:`${tradeDate} · ${label}`});
      }
    }
    return base.sort((a,b)=>a.start-b.start);
  }
  function analyzeSessions(rawSessions, options={}) {
    const mode=options.mode==="ETH"?"ETH":"RTH",minCoverage=options.minCoverage??(mode==="RTH"?.55:.5),completeCoverage=options.completeCoverage??.95;
    const all=rawSessions.slice().sort((a,b)=>a.date.localeCompare(b.date));
    const sessions=all.filter(s=>s.coverage>=minCoverage&&s.bars>0);
    if(!sessions.length)return {mode,allCount:all.length,sessions:[],error:"Không có phiên đủ dữ liệu theo ngưỡng độ phủ đã chọn."};
    // Full-session observations define strong/light thresholds whenever there are enough of them.
    // Partial sessions remain visible, but do not distort the classification or the next-session regime.
    const complete=sessions.filter(s=>s.coverage>=completeCoverage);
    const classificationFallback=complete.length<10,base=classificationFallback?sessions:complete;
    const r0=median((complete.length?complete:sessions).map(s=>s.range)),q25=quantile(base.map(s=>s.range),.25),q75=quantile(base.map(s=>s.range),.75);
    for(let i=0;i<sessions.length;i++){
      const s=sessions[i],prev=sessions.slice(0,i).filter(x=>x.coverage>=completeCoverage).slice(-20).map(x=>x.range);
      s.adr20=prev.length?mean(prev):NaN;
      s.adr20N=prev.length;
      s.adrRatio=s.adr20>0?s.range/s.adr20:NaN;
      s.regimeRatio=r0>0?s.adr20/r0:NaN;
      s.regime=!Number.isFinite(s.regimeRatio)?"UNKNOWN":s.regimeRatio>1.15?"HIGH":s.regimeRatio<.85?"LOW":"NORMAL";
      s.qualified=classificationFallback||s.coverage>=completeCoverage;
      s.strong=s.qualified?s.range>=q75:null;s.light=s.qualified?s.range<=q25:null;
    }
    const statSessions=classificationFallback?sessions:complete;
    const yearRows=groupDaily(statSessions,s=>s.date.slice(0,4));
    const monthRows=groupDaily(statSessions,s=>s.date.slice(0,7));
    const monthSeasonRows=groupDaily(statSessions,s=>s.date.slice(5,7),k=>["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"][+k-1]);
    const weekRows=groupDaily(statSessions,s=>fmtWeek(s.date).key,(k,a)=>`${k} · ${fmtWeek(a[0].date).start}`);
    const weekdayNames=["CN","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"];
    const weekdayRows=groupDaily(statSessions,s=>String(s.weekday),k=>weekdayNames[+k]);
    const hourObs=[];
    for(const s of sessions)for(const h of s.hours)if(h.duration>0&&h.bars>=Math.ceil(h.duration*.95))hourObs.push({...h,date:s.date,regime:s.regime,dayRange:s.range,adr20:s.adr20,adrRatio:s.adrRatio});
    const hourGroups=new Map();for(const h of hourObs){if(!hourGroups.has(h.key))hourGroups.set(h.key,[]);hourGroups.get(h.key).push(h);}
    const allHourRanges=hourObs.map(x=>x.high-x.low),globalHourThreshold=quantile(allHourRanges,.75),globalHourWeak=quantile(allHourRanges,.25);
    const hourRows=[];const hourForecast={};
    for(const [key,a] of hourGroups){
      const slotThreshold=quantile(a.map(x=>x.high-x.low),.75);
      const strongObs=a.filter(x=>(x.high-x.low)>=globalHourThreshold),weakObs=a.filter(x=>(x.high-x.low)<=globalHourWeak),row={key,index:a[0].index,label:a[0].label,n:a.length,avg:mean(a.map(x=>x.high-x.low)),median:median(a.map(x=>x.high-x.low)),p75:slotThreshold,globalThreshold:globalHourThreshold,weakThreshold:globalHourWeak,strong:strongObs.length,strongPct:100*strongObs.length/a.length,light:weakObs.length,lightPct:100*weakObs.length/a.length,dayPct:mean(a.map(x=>x.dayRange>0?100*(x.high-x.low)/x.dayRange:NaN)),adrPct:mean(a.map(x=>x.adr20>0?100*(x.high-x.low)/x.adr20:NaN))};
      hourRows.push(row);
      const byReg={};for(const reg of ["LOW","NORMAL","HIGH"]){const z=a.filter(x=>x.regime===reg),hits=z.filter(x=>(x.high-x.low)>=globalHourThreshold).length,baseRate=.25;byReg[reg]={n:z.length,hits,p:(hits+6*baseRate)/(z.length+6)};}
      hourForecast[key]={threshold:globalHourThreshold,slotThreshold,median:row.median,n:a.length,byReg,label:row.label};
    }
    hourRows.sort((a,b)=>a.index-b.index);
    const all20=sessions.flatMap(s=>s.windows20.filter(w=>w.duration===20&&w.bars>=19).map(w=>({...w,date:s.date,regime:s.regime,dayRange:s.range,adr20:s.adr20})));
    const win20Threshold=quantile(all20.map(x=>x.high-x.low),.75),win20Weak=quantile(all20.map(x=>x.high-x.low),.25);
    const macroRows=[],macroForecast={};
    for(const [key,label] of [["m0950","09:50–10:10"],["m1050","10:50–11:10"]]){
      const a=sessions.filter(s=>s.macros[key]&&s.macros[key].bars>=19).map(s=>({...s.macros[key],date:s.date,regime:s.regime,dayRange:s.range,adr20:s.adr20}));
      if(!a.length)continue;const strong=a.filter(x=>(x.high-x.low)>=win20Threshold).length,light=a.filter(x=>(x.high-x.low)<=win20Weak).length;
      const row={key,label,n:a.length,avg:mean(a.map(x=>x.high-x.low)),median:median(a.map(x=>x.high-x.low)),threshold:win20Threshold,weakThreshold:win20Weak,strong,strongPct:100*strong/a.length,light,lightPct:100*light/a.length,adrPct:mean(a.map(x=>x.adr20>0?100*(x.high-x.low)/x.adr20:NaN))};macroRows.push(row);
      const byReg={};for(const reg of ["LOW","NORMAL","HIGH"]){const z=a.filter(x=>x.regime===reg),hits=z.filter(x=>(x.high-x.low)>=win20Threshold).length;byReg[reg]={n:z.length,hits,p:(hits+6*.25)/(z.length+6)};}
      macroForecast[key]={byReg,median:row.median,n:row.n,label};
    }
    const latest=complete[complete.length-1]||sessions[sessions.length-1],currentRegime=latest.regime;
    const candidates=makeFutureCandidates(mode,options.now??Date.now(),5).map(c=>{
      let f;
      if(c.type==="hour"){const x=hourForecast[c.slot];f=x&&x.byReg[currentRegime];return {...c,prob:f?f.p:.25,sample:f?f.n:0,median:x?.median??NaN,threshold:x?.threshold??NaN,regime:currentRegime};}
      const x=macroForecast[c.slot];f=x&&x.byReg[currentRegime];return {...c,prob:f?f.p:.25,sample:f?f.n:0,median:x?.median??NaN,threshold:win20Threshold,regime:currentRegime};
    });
    const upcoming=candidates.slice(0,18),next24=candidates.filter(c=>c.start<= (options.now??Date.now())+DAY),best24=next24.length?next24.slice().sort((a,b)=>b.prob-a.prob||a.start-b.start)[0]:null;
    return {mode,allCount:all.length,excluded:all.length-sessions.length,partialCount:sessions.length-statSessions.length,completeCount:complete.length,classificationFallback,classificationBasis:classificationFallback?"minimum coverage fallback":"sessions >= 95% coverage",completeCoverage,sessions,statSessions,daily:{n:statSessions.length,classifiedN:base.length,avg:mean(statSessions.map(x=>x.range)),median:r0,q25,q75,strong:statSessions.filter(x=>x.strong===true).length,light:statSessions.filter(x=>x.light===true).length,strongPct:base.length?100*statSessions.filter(x=>x.strong===true).length/base.length:NaN,lightPct:base.length?100*statSessions.filter(x=>x.light===true).length/base.length:NaN,adr20:latest.adr20,latestDate:latest.date,latestRegime:currentRegime,latestRegimeRatio:latest.regimeRatio},yearRows,monthRows,monthSeasonRows,weekRows,weekdayRows,hourRows,macroRows,forecast:{currentRegime,regimeAsOf:latest.date,candidates:upcoming,best24,hourForecast,macroForecast,hourThreshold:globalHourThreshold,hourWeakThreshold:globalHourWeak,twentyMinuteThreshold:win20Threshold,twentyMinuteWeakThreshold:win20Weak}};
  }
  function filterSessions(sessions, year, month, week) {
    return sessions.filter(s=>(!year||s.date.startsWith(year))&&(!month||s.date.slice(5,7)===month)&&(!week||fmtWeek(s.date).key===week));
  }
  const api={etParts,addDate,weekdayOfDate,etLocalToUtcMs,sessionInfo,buildSessions,quantile,mean,median,fmtWeek,analyzeSessions,filterSessions,groupDaily,summarizeDaily,makeFutureCandidates};
  root.MarketStatsCore=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
