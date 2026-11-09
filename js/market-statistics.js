/* QuantLab Market Statistics — cTrader M1 history, RTH/ETH, hierarchical volatility & empirical forecast. */
(function(){
  "use strict";
  const DB_NAME="quantlab_market_statistics_v1",DB_VER=2,DAY=86400000,MIN=60000,CHUNK_DAYS=28,MIN_DATE=Date.UTC(2000,0,1),ROW_STRIDE=5;
  const $m=id=>document.getElementById(id),core=()=>window.MarketStatsCore;
  const S={db:null,meta:null,symbol:null,result:null,mode:"RTH",level:"month",year:"",month:"",week:"",cancel:false,busy:false,cacheKey:null,rows:[],report:""};
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=(v,d=2)=>Number.isFinite(+v)?(+v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
  const pct=(v,d=1)=>Number.isFinite(+v)?num(v,d)+"%":"—";
  const fmtRange=v=>Number.isFinite(+v)?num(v,2)+" pt":"—";
  const stamp=ms=>new Date(ms).toLocaleString("vi-VN",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
  const monthName=m=>["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"][+m-1]||m;
  function setStatus(text,kind="info"){const e=$m("msStatus");if(e){e.textContent=text;e.dataset.kind=kind}}
  function setProgress(done,total,label){const b=$m("msProgressBar"),t=$m("msProgressText");if(b)b.style.width=(total?Math.max(0,Math.min(100,done/total*100)):0)+"%";if(t)t.textContent=label||"";}
  function openDB(){
    if(S.db)return Promise.resolve(S.db);
    if(!window.indexedDB)return Promise.reject(new Error("Trình duyệt không hỗ trợ IndexedDB để lưu lịch sử M1."));
    return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains("chunks")){const st=db.createObjectStore("chunks",{keyPath:"key"});st.createIndex("symbolId","symbolId",{unique:false});}if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"symbolId"});};r.onsuccess=()=>{S.db=r.result;resolve(S.db)};r.onerror=()=>reject(r.error||new Error("Không mở được kho dữ liệu."));});
  }
  function idbReq(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("IndexedDB error"));});}
  async function getMeta(symbolId){const db=await openDB(),tx=db.transaction("meta","readonly");return idbReq(tx.objectStore("meta").get(+symbolId));}
  async function putMeta(meta){const db=await openDB(),tx=db.transaction("meta","readwrite");tx.objectStore("meta").put(meta);return new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);});}
  async function putChunk(rec){const db=await openDB(),tx=db.transaction("chunks","readwrite");tx.objectStore("chunks").put(rec);return new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);});}
  async function getChunks(symbolId){const db=await openDB(),tx=db.transaction("chunks","readonly"),idx=tx.objectStore("chunks").index("symbolId");const a=await idbReq(idx.getAll(IDBKeyRange.only(+symbolId)));return a.sort((x,y)=>x.from-y.from);}
  async function deleteSymbol(symbolId){
    const db=await openDB();
    await new Promise((resolve,reject)=>{const tx=db.transaction(["chunks","meta"],"readwrite"),st=tx.objectStore("chunks"),req=st.index("symbolId").openCursor(IDBKeyRange.only(+symbolId));req.onsuccess=()=>{const cur=req.result;if(cur){cur.delete();cur.continue();}};tx.objectStore("meta").delete(+symbolId);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }
  function candidates(){
    if(!CT||!Array.isArray(CT.symbols))return [];
    const re=/(^|[^A-Z])(NQ|NAS100|NASDAQ100|NASDAQ|US100|USTEC|USTECH|NDX)([^A-Z]|$)/i;
    return CT.symbols.filter(x=>x&&x.enabled!==false&&re.test(String(x.symbolName||""))).sort((a,b)=>scoreSymbol(a)-scoreSymbol(b));
  }
  function scoreSymbol(s){const n=String(s.symbolName||"").toUpperCase();if(n==="NAS100")return 0;if(/^NAS100[._-]/.test(n))return 1;if(n==="NQ")return 2;if(/^NQ[._-]/.test(n))return 3;if(n.includes("US100"))return 4;if(n.includes("USTEC"))return 5;if(n.includes("NASDAQ"))return 6;return 7;}
  function fillSymbols(){
    const el=$m("msSymbol");if(!el)return;
    const L=candidates(),old=el.value;el.innerHTML=L.length?L.map(s=>`<option value="${+s.symbolId}">${esc(s.symbolName)}${s.symbolName.toUpperCase()==="NQ"?" · Futures":/NAS|USTEC|US100/i.test(s.symbolName)?" · Nasdaq feed":""}</option>`).join(""):'<option value="">Không tìm thấy mã NQ / NAS100</option>';
    if(L.some(s=>String(s.symbolId)===old))el.value=old;
    else if(L.length)el.value=String(L[0].symbolId);
    S.symbol=L.find(s=>String(s.symbolId)===el.value)||L[0]||null;
    return L;
  }
  function selectedSymbol(){const id=+$m("msSymbol")?.value;return candidates().find(s=>+s.symbolId===id)||null;}
  let brokerConnectPromise=null;
  async function ensureBroker(){
    if(CT.ready)return;
    if(CT.ep){try{await CT.ep}catch{}if(CT.ready)return;}
    if(!brokerConnectPromise)brokerConnectPromise=ctConnect().finally(()=>{brokerConnectPromise=null;});
    await brokerConnectPromise;
  }
  function decodeTB(tb){
    // cTrader trendbar timestamps are UTC minutes; OHLC is scaled by 1e5.
    // Volume is deliberately ignored: this module measures price range only.
    const t=Number(tb?.utcTimestampInMinutes)*MIN,lo=Number(tb?.low);
    if(!Number.isFinite(t)||!Number.isFinite(lo))return null;
    const p=x=>x/1e5;
    const row=[t,p(lo+(Number(tb.deltaOpen)||0)),p(lo+(Number(tb.deltaHigh)||0)),p(lo),p(lo+(Number(tb.deltaClose)||0))];
    return row.every(Number.isFinite)&&row[2]>=row[3]?row:null;
  }
  async function fetchRange(symbolId,from,to,depth=0){
    if(depth>16)throw new Error("Lịch sử M1 bị phân trang quá sâu; dừng để tránh tải thiếu.");
    const r=await ctHist(2137,{ctidTraderAccountId:CT.acc,symbolId:+symbolId,period:1,fromTimestamp:Math.floor(from),toTimestamp:Math.floor(to-1)},"bar");
    const got=(r.trendbar||[]).map(decodeTB).filter(x=>x&&x[0]>=from&&x[0]<to).sort((a,b)=>a[0]-b[0]);
    if(!r.hasMore)return got;
    if(to-from<=2*MIN)throw new Error("cTrader báo còn dữ liệu nhưng cửa sổ chỉ còn 1–2 phút. Đã dừng để không tạo bộ dữ liệu thiếu.");
    let mid=Math.floor(((from+to)/2)/MIN)*MIN;if(mid<=from)mid=from+MIN;if(mid>=to)mid=to-MIN;
    const [a,b]=await Promise.all([fetchRange(symbolId,from,mid,depth+1),fetchRange(symbolId,mid,to,depth+1)]);
    return a.concat(b);
  }
  function toFlat(bars){const a=new Float64Array(bars.length*ROW_STRIDE);let k=0;for(const b of bars)for(let j=0;j<ROW_STRIDE;j++)a[k++]=b[j];return a;}
  function normChunkBars(bars){const out=[];let last=-1;for(const b of bars){if(b[0]===last)continue;last=b[0];out.push(b);}return out;}

  function chartM1Rows(symbolId){
    if(typeof m1==="undefined"||!Array.isArray(m1)||!m1.length)return {rows:[],reason:"Chart chưa có nến M1 trong bộ nhớ. Hãy tải M1 trên Chart trước."};
    if(!CT?.sym||+CT.sym.id!==+symbolId)return {rows:[],reason:"Mã đang mở trên Chart khác mã thống kê. Hãy chọn cùng symbol trên Chart và Market Stats."};
    if(typeof s2u!=="function")return {rows:[],reason:"Thiếu bộ chuyển giờ server sang UTC; không thể nhập timestamp an toàn."};
    const rows=[];let prevServerSec=NaN,prevUtcSec=NaN,prevBarTime=NaN,needsSort=false;
    for(const b of m1){
      if(!Array.isArray(b)||b.length<5)continue;
      const serverSec=Number(b[0]);let utcSec=s2u(serverSec);
      // The broker's NY-close server clock repeats 08:00–08:59 when US DST ends.
      // In the first pass through that repeated hour, s2u() alone is ambiguous;
      // chronological Chart bars reveal it as +60m UTC jump while server time advances by 1m.
      const sd=serverSec-prevServerSec,ud=utcSec-prevUtcSec;
      if(Number.isFinite(prevServerSec)&&sd>=30&&sd<=90&&ud>=3300&&ud<=3900)utcSec-=3600;
      const t=Math.floor(utcSec/60)*MIN;
      const o=Number(b[1]),h=Number(b[2]),l=Number(b[3]),c=Number(b[4]);
      if(!Number.isFinite(t)||![o,h,l,c].every(Number.isFinite)||h<l)continue;
      if(Number.isFinite(prevBarTime)&&t<prevBarTime)needsSort=true;
      if(Number.isFinite(prevBarTime)&&t===prevBarTime)rows[rows.length-1]=[t,o,h,l,c];
      else rows.push([t,o,h,l,c]);
      prevBarTime=t;prevServerSec=serverSec;prevUtcSec=utcSec;
    }
    if(needsSort){rows.sort((a,b)=>a[0]-b[0]);let w=0;for(let i=0;i<rows.length;i++){if(w&&rows[i][0]===rows[w-1][0])rows[w-1]=rows[i];else rows[w++]=rows[i];}rows.length=w;}
    return {rows,reason:rows.length?"":"Không tìm thấy nến M1 OHLC hợp lệ trên Chart."};
  }
  async function importChartRows(sym){
    const cached=await getChunks(sym.symbolId);
    if(cached.length)return {imported:false,reason:"Đã có cache Market Stats; không nhập chồng dữ liệu Chart để tránh đếm trùng."};
    const source=chartM1Rows(sym.symbolId);if(!source.rows.length)return {imported:false,reason:source.reason};
    const rows=source.rows;let pos=0,chunks=0;
    while(pos<rows.length){
      const anchor=rows[pos][0],limit=anchor+CHUNK_DAYS*DAY;let end=pos+1;
      while(end<rows.length&&rows[end][0]<limit)end++;
      const part=rows.slice(pos,end),from=part[0][0],to=part[part.length-1][0]+MIN;
      await putChunk({key:`${+sym.symbolId}|${from}`,symbolId:+sym.symbolId,symbolName:sym.symbolName,from,to,count:part.length,stride:ROW_STRIDE,source:"chart-m1",values:toFlat(part)});
      pos=end;chunks++;setProgress(pos,rows.length,`Nhập M1 từ Chart: ${pos.toLocaleString("vi-VN")}/${rows.length.toLocaleString("vi-VN")} nến · ${chunks} lô`);
      if((chunks&3)===0)await new Promise(r=>setTimeout(r,0));
    }
    const meta={symbolId:+sym.symbolId,symbolName:sym.symbolName,source:"QuantLab Chart M1 buffer · converted to UTC · OHLC only",timeframe:"M1",mode:"partial",totalBars:rows.length,minTs:rows[0][0],maxTs:rows[rows.length-1][0],windows:0,importedChunks:chunks,updated:Date.now()};
    await putMeta(meta);S.meta=meta;S.symbol=sym;
    return {imported:true,count:rows.length,chunks,minTs:meta.minTs,maxTs:meta.maxTs};
  }
  async function downloadAll(){
    if(S.busy)return;S.cancel=false;S.busy=true;
    const btn=$m("msLoad"),stop=$m("msStop");if(btn)btn.disabled=true;if(stop)stop.hidden=false;
    try{
      setStatus("Đang kiểm tra kết nối cTrader…");await ensureBroker();
      const sym=selectedSymbol()||fillSymbols()?.[0];if(!sym)throw new Error("Broker không có mã NQ / NAS100. Kiểm tra symbol trong tài khoản cTrader.");S.symbol=sym;
      if(!window.indexedDB)throw new Error("Cần IndexedDB để lưu bộ lịch sử M1 dung lượng lớn. Hãy mở website trên trình duyệt không ở chế độ riêng tư.");
      setStatus("Đang kiểm tra lịch sử M1 đã lưu để tiếp tục tải…");
      const cached=await getChunks(sym.symbolId),oldMeta=await getMeta(sym.symbolId);
      if(oldMeta?.mode==="complete"&&cached.length){S.meta=oldMeta;S.symbol=sym;await analyzeCache(sym.symbolId);setStatus(`${sym.symbolName}: đã có toàn bộ phần lịch sử broker cung cấp (${oldMeta.totalBars?.toLocaleString("vi-VN")} nến). Không cần tải lại; xóa cache chỉ khi muốn tải mới từ đầu.` ,"ok");return;}
      if(!cached.length){
        const imported=await importChartRows(sym);
        if(imported.imported){await analyzeCache(sym.symbolId);setStatus(`Đã nhập ${imported.count.toLocaleString("vi-VN")} nến M1 OHLC từ Chart (${stamp(imported.minTs)} → ${stamp(imported.maxTs)} ET). Bấm “Tải / tiếp tục” lần nữa để lấy phần lịch sử cũ hơn nếu broker còn cung cấp.` ,"ok");return;}
      }
      const cacheNow=await getChunks(sym.symbolId),metaNow=await getMeta(sym.symbolId);
      let total=cacheNow.reduce((n,x)=>n+(+x.count||0),0),cursor=cacheNow.length?Math.min(...cacheNow.map(x=>x.from)):Math.floor(Date.now()/MIN)*MIN;
      const cachedForScan=cacheNow;
      const priorMeta=metaNow||oldMeta;
      let scanned=0,emptyRun=0,had=cachedForScan.length>0,windows=+priorMeta?.windows||0,minTs=priorMeta?.minTs??cursor,maxTs=priorMeta?.maxTs??0;
      const meta={...(priorMeta||{}),symbolId:+sym.symbolId,symbolName:sym.symbolName,source:priorMeta?.source?.startsWith("QuantLab Chart")?"QuantLab Chart M1 + cTrader historical M1 · OHLC only":(priorMeta?.source||"cTrader Open API · OHLC only"),timeframe:"M1",mode:"downloading",totalBars:total,minTs:had?minTs:null,maxTs:had?maxTs:null,updated:Date.now(),windows};await putMeta(meta);
      const chunkMs=CHUNK_DAYS*DAY;
      while(cursor>MIN_DATE&&!S.cancel&&windows<500){
        const from=Math.max(MIN_DATE,cursor-chunkMs),to=cursor;
        setStatus(`Đang tải ${sym.symbolName} M1 · quét lùi ${Math.round((Date.now()-from)/DAY).toLocaleString("vi-VN")} ngày lịch…`);
        const bars=normChunkBars(await fetchRange(sym.symbolId,from,to));
        windows++;scanned+=to-from;
        if(bars.length){
          const values=toFlat(bars),key=`${sym.symbolId}|${from}`;
          await putChunk({key,symbolId:+sym.symbolId,symbolName:sym.symbolName,from,to,count:bars.length,stride:ROW_STRIDE,source:"ctrader-m1",values});
          total+=bars.length;had=true;emptyRun=0;minTs=Math.min(minTs,bars[0][0]);maxTs=Math.max(maxTs,bars[bars.length-1][0]);
          meta.totalBars=total;meta.minTs=minTs;meta.maxTs=maxTs;meta.windows=windows;meta.updated=Date.now();await putMeta(meta);
        }else emptyRun+=to-from;
        cursor=from;
        setProgress(0,0,`${total.toLocaleString("vi-VN")} nến · ${windows} lô · đã quét ${(scanned/DAY).toFixed(0)} ngày`);
        if((had&&emptyRun>=90*DAY)||(!had&&emptyRun>=365*DAY))break;
        await new Promise(r=>setTimeout(r,0));
      }
      const hitSafetyLimit=windows>=500&&cursor>MIN_DATE;
      meta.mode=(S.cancel||hitSafetyLimit)?"partial":"complete";meta.totalBars=total;meta.minTs=had?minTs:null;meta.maxTs=had?maxTs:null;meta.windows=windows;meta.updated=Date.now();meta.scannedDays=Math.round(scanned/DAY);await putMeta(meta);S.meta=meta;
      if(S.cancel||hitSafetyLimit)setStatus(`${S.cancel?"Đã dừng tải":"Đã chạm giới hạn an toàn 500 lô"}. Đã lưu ${total.toLocaleString("vi-VN")} nến; có thể tiếp tục tải phần lịch sử cũ hơn.`,"warn");
      else if(total)setStatus(`Đã tải xong ${total.toLocaleString("vi-VN")} nến M1 từ ${stamp(minTs)} đến ${stamp(maxTs)} (giờ New York).`,"ok");
      else setStatus("Broker không trả về nến M1 cho mã đã chọn trong vùng lịch sử được quét.","bad");
      await analyzeCache(sym.symbolId);
    }catch(e){console.error("Market Statistics download",e);setStatus("Tải dữ liệu lỗi: "+(typeof why==="function"?why(e):e.message||e),"bad");}
    finally{S.busy=false;if(btn)btn.disabled=false;if(stop)stop.hidden=true;}
  }
  function mergeBucket(a,b){
    if(!a)return {...b};if(!b)return a;
    const first=Math.min(a.first,b.first),last=Math.max(a.last,b.last);
    return {open:a.first<=b.first?a.open:b.open,close:a.last>=b.last?a.close:b.close,high:Math.max(a.high,b.high),low:Math.min(a.low,b.low),bars:a.bars+b.bars,first,last,key:a.key,index:a.index,label:a.label||b.label,duration:a.duration||b.duration};
  }
  function mergeSessions(map,parts){
    for(const p of parts){let a=map.get(p.date);if(!a){map.set(p.date,{...p,hours:p.hours.slice(),windows20:p.windows20.slice(),macros:{...p.macros}});continue;}
      const first=Math.min(a.first,p.first),last=Math.max(a.last,p.last);
      a.open=a.first<=p.first?a.open:p.open;a.close=a.last>=p.last?a.close:p.close;a.first=first;a.last=last;a.high=Math.max(a.high,p.high);a.low=Math.min(a.low,p.low);a.bars+=p.bars;a.expected=Math.max(a.expected,p.expected);
      const mergeList=(x,y)=>{const m=new Map(x.map(z=>[String(z.key),z]));for(const z of y)m.set(String(z.key),mergeBucket(m.get(String(z.key)),z));return [...m.values()].sort((u,v)=>u.index-v.index);};
      a.hours=mergeList(a.hours,p.hours);a.windows20=mergeList(a.windows20,p.windows20);
      for(const [k,b] of Object.entries(p.macros))a.macros[k]=mergeBucket(a.macros[k],b);
      a.range=a.high-a.low;a.body=Math.abs(a.close-a.open);a.bodyEfficiency=a.range?a.body/a.range:0;a.coverage=a.bars/a.expected;a.up=a.close>a.open;a.down=a.close<a.open;
    }
  }
  async function analyzeCache(symbolId){
    const chunks=await getChunks(symbolId);if(!chunks.length){S.result=null;render();return;}
    setStatus("Đang dựng thống kê từ cache M1…");const map=new Map(),mode=S.mode;
    for(let i=0;i<chunks.length;i++){
      const rec=chunks[i],v=rec.values instanceof Float64Array?rec.values:new Float64Array(rec.values||[]),rows=[],stride=Number(rec.stride)||6;
      for(let k=0;k+4<v.length;k+=stride)rows.push([v[k],v[k+1],v[k+2],v[k+3],v[k+4]]);
      const part=core().buildSessions(rows,mode);mergeSessions(map,part);
      if((i&7)===0){setProgress(i+1,chunks.length,`Đang phân tích ${i+1}/${chunks.length} lô dữ liệu…`);await new Promise(r=>setTimeout(r,0));}
    }
    const sessions=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
    S.result=core().analyzeSessions(sessions,{mode,minCoverage:mode==="RTH"?+$m("msCoverage")?.value||.55:+$m("msCoverage")?.value||.5});
    S.rows=sessions;S.meta=await getMeta(symbolId);S.cacheKey=+symbolId;
    const dateSpan=S.meta?.minTs!=null&&S.meta?.maxTs!=null?` · ${stamp(S.meta.minTs)} → ${stamp(S.meta.maxTs)} ET`:"";
    setStatus(`${S.meta?.symbolName||"NQ"}: ${chunks.length} lô cache · ${S.meta?.totalBars?.toLocaleString("vi-VN")||"—"} nến M1${dateSpan} · ${S.result.sessions.length.toLocaleString("vi-VN")} phiên có dữ liệu.`,"ok");
    setProgress(chunks.length,chunks.length,"Phân tích hoàn tất");render();
  }
  function metric(label,value,sub=""){return `<div class="ms-kpi"><span>${esc(label)}</span><b>${value}</b><small>${esc(sub)}</small></div>`;}
  function table(headers,rows,empty="Chưa có dữ liệu."){
    if(!rows.length)return `<div class="ms-empty">${esc(empty)}</div>`;
    return `<div class="ms-table-wrap"><table class="ms-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }
  function summaryRow(r){return `<tr><td>${esc(r.label)}</td><td>${r.n}</td><td>${r.classifiedN??r.n}</td><td>${fmtRange(r.avg)}</td><td>${fmtRange(r.median)}</td><td>${fmtRange(r.p75)}</td><td>${r.strong}</td><td class="${r.strongPct>=30?"ms-hot":""}">${pct(r.strongPct)}</td><td>${r.light}</td><td>${pct(r.lightPct)}</td><td>${pct(r.bodyEfficiency*100)}</td><td>${pct(r.adrRatio*100)}</td></tr>`;}
  function getFiltered(includePartial=false){const year=S.year,month=S.month,week=S.week,source=includePartial?(S.result?.sessions||[]):(S.result?.statSessions||S.result?.sessions||[]);return core().filterSessions(source,year,month,week);}
  function updateFilters(){
    if(!S.result)return;
    const yEl=$m("msYear"),mEl=$m("msMonth"),wEl=$m("msWeek");
    const source=S.result.statSessions||S.result.sessions;
    const years=[...new Set(source.map(x=>x.date.slice(0,4)))].sort();
    const months=[...new Set(source.filter(x=>!S.year||x.date.startsWith(S.year)).map(x=>x.date.slice(5,7)))].sort();
    const weeks=[...new Set(source.filter(x=>(!S.year||x.date.startsWith(S.year))&&(!S.month||x.date.slice(5,7)===S.month)).map(x=>core().fmtWeek(x.date).key))].sort();
    if(yEl){yEl.innerHTML='<option value="">Tất cả năm</option>'+years.map(x=>`<option value="${x}">${x}</option>`).join("");yEl.value=S.year;}
    if(mEl){mEl.innerHTML='<option value="">Tất cả tháng</option>'+months.map(x=>`<option value="${x}">${monthName(x)}</option>`).join("");mEl.value=S.month;}
    if(wEl){wEl.innerHTML='<option value="">Tất cả tuần</option>'+weeks.map(x=>`<option value="${x}">${x}</option>`).join("");wEl.value=S.week;}
  }
  function renderOverview(){
    const r=S.result;if(!r||!r.sessions.length)return '<div class="ms-empty">Chưa có phiên đủ độ phủ để thống kê. Hãy tải M1 hoặc giảm ngưỡng độ phủ.</div>';
    const best=r.monthSeasonRows.slice().sort((a,b)=>b.avg-a.avg)[0],topHour=r.hourRows.slice().sort((a,b)=>b.avg-a.avg)[0],m=r.daily;
    return `<div class="ms-kpis">${metric("Phiên dùng thống kê",m.n.toLocaleString("vi-VN"),r.classificationFallback?`${r.allCount} phiên có dữ liệu · dưới 10 phiên đạt 95%, tạm dùng ngưỡng độ phủ đã chọn`:`${r.allCount} phiên có dữ liệu · loại ${r.excluded} thiếu độ phủ · bỏ ${r.partialCount||0} phiên chưa đạt 95%`)}${metric("ADR trung bình",fmtRange(m.avg),`Median ${fmtRange(m.median)} · P75 ${fmtRange(m.q75)}`)}${metric("Ngày biến động mạnh",pct(m.strongPct),`${m.strong} phiên · ngưỡng ${fmtRange(m.q75)}`)}${metric("Tháng biến động lớn nhất",best?best.label:"—",best?`${fmtRange(best.avg)} trung bình/ngày · ${pct(best.strongPct)} ngày mạnh · n=${best.n}`:"")}${metric("Khung giờ mạnh nhất",topHour?.label||"—",topHour?`${fmtRange(topHour.avg)} trung bình · ${topHour.n} mẫu`:"")}${metric("Volatility regime",m.latestRegime,`ADR20 / median lịch sử = ${num(m.latestRegimeRatio,2)}×`)}</div>`;
  }
  function renderForecast(){
    const f=S.result?.forecast;if(!f)return '<div class="ms-empty">Chưa có forecast.</div>';
    const best=f.best24;
    const headline=best?`Cửa sổ có xác suất biến động mạnh cao nhất trong 24 giờ tới: <b>${esc(best.label)}</b> · <b>${pct(best.prob*100)}</b> · median ${fmtRange(best.median)} · n=${best.sample}. Regime lấy từ phiên ${esc(f.regimeAsOf||"")}.`:`Chưa có khung sắp tới để dự báo trong cửa sổ đã chọn.`;
    const rows=f.candidates.slice(0,10).map(c=>`<tr><td>${esc(c.label)}</td><td>${pct(c.prob*100)}</td><td>${fmtRange(c.median)}</td><td>${c.sample}</td><td>${c.type==="macro"?"20 phút":"60 phút"}</td></tr>`);
    return `<div class="ms-forecast-head"><div><span class="ms-eyebrow">QUANTLAB · EMPIRICAL VOLATILITY FORECAST</span><h3>Forecast cửa sổ biến động kế tiếp</h3><p>${headline}</p></div><span class="ms-regime ${f.currentRegime.toLowerCase()}">${f.currentRegime} REGIME</span></div>${table(["Cửa sổ giờ New York","P mạnh lịch sử","Range median","Số mẫu","Loại"],rows,"Không tìm thấy khung tương lai trong lịch dự báo.")}<small class="ms-note">Xác suất là tần suất thực nghiệm theo khung giờ và regime của phiên hoàn chỉnh gần nhất, co rút mẫu nhỏ về nền 25%; không phải dự báo chắc chắn. Chưa điều chỉnh lịch nghỉ CME/tin tức.</small>`;
  }
  function renderWeekday(){
    const ss=getFiltered(),groups=core().groupDaily(ss,s=>String(s.weekday),k=>["CN","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"][+k]);
    const rows=groups.sort((a,b)=>+a.key-+b.key).map(x=>`<tr><td>${esc(x.label)}</td><td>${x.n}</td><td>${x.classifiedN}</td><td>${fmtRange(x.avg)}</td><td>${fmtRange(x.median)}</td><td>${pct(x.strongPct)}</td><td>${pct(x.lightPct)}</td></tr>`);
    return `<div class="ms-subhead"><h3>Seasonality theo thứ trong tuần</h3><small>Thay đổi theo bộ lọc năm / tháng / tuần đang chọn; ngày mạnh/yếu dùng cùng ngưỡng lịch sử.</small></div>${table(["Ngày","Số phiên","N phân loại","Range TB","Median","Ngày mạnh","Ngày nhẹ"],rows)}`;
  }
  function renderDetail(){
    const r=S.result,ss=getFiltered(),allss=getFiltered(true),visibleN=S.level==="day"?allss.length:ss.length;let rows=[],headers=[];
    if(S.level==="year"){
      headers=["Năm","Phiên","N phân loại","Range TB","Median","P75","Mạnh","Mạnh %","Nhẹ","Nhẹ %","Body/Range","Range/ADR20"];
      rows=core().groupDaily(ss,s=>s.date.slice(0,4)).map(summaryRow);
    }else if(S.level==="month"){
      headers=["Tháng","Phiên","N phân loại","Range TB","Median","P75","Mạnh","Mạnh %","Nhẹ","Nhẹ %","Body/Range","Range/ADR20"];
      const a=core().groupDaily(ss,s=>S.year?s.date.slice(0,7):s.date.slice(5,7),k=>S.year?k:monthName(k));
      rows=a.sort((x,y)=>S.year?x.key.localeCompare(y.key):(+x.key)-(+y.key)).map(summaryRow);
    }else if(S.level==="week"){
      headers=["Tuần","Phiên","N phân loại","Range TB","Median","P75","Mạnh","Mạnh %","Nhẹ","Nhẹ %","Body/Range","Range/ADR20"];
      rows=core().groupDaily(ss,s=>core().fmtWeek(s.date).key,(k,a)=>`${k} · ${core().fmtWeek(a[0].date).start}`).map(summaryRow);
    }else if(S.level==="day"){
      headers=["Ngày ET","Range","High","Low","Open → Close","ADR20","Range/ADR20","Body/Range","Phân loại","Độ phủ"];
      rows=allss.map(s=>`<tr><td>${esc(s.date)}</td><td><b>${fmtRange(s.range)}</b></td><td>${num(s.high)}</td><td>${num(s.low)}</td><td>${num(s.open)} → ${num(s.close)}</td><td>${fmtRange(s.adr20)}</td><td>${pct(s.adrRatio*100)}</td><td>${pct(s.bodyEfficiency*100)}</td><td><span class="ms-tag ${!s.qualified?"normal":s.strong?"hot":s.light?"cold":"normal"}">${!s.qualified?"ĐỘ PHỦ THẤP":s.strong?"MẠNH":s.light?"NHẸ":"BÌNH THƯỜNG"}</span></td><td>${pct(s.coverage*100)}</td></tr>`);
    }else if(S.level==="hour"){
      headers=["Giờ ET (theo phiên)","Số ngày","Range TB","Median","P75 riêng khung","Ngưỡng P75 giờ chung","Ngày mạnh","Mạnh %","Ngày nhẹ","Nhẹ %","Range / daily range","Range / ADR20"];
      const map=new Map();for(const s of allss)for(const h of s.hours){if(h.duration>0&&h.bars>=Math.ceil(h.duration*.95)){if(!map.has(h.key))map.set(h.key,[]);map.get(h.key).push({...h,date:s.date,dayRange:s.range,adr20:s.adr20,regime:s.regime});}}
      rows=[...map.entries()].sort((a,b)=>+a[0]-+b[0]).map(([k,a])=>{const vals=a.map(x=>x.high-x.low),q=core().quantile(vals,.75),q1=core().quantile(vals,.25),hot=a.filter(x=>x.high-x.low>=q).length,light=a.filter(x=>x.high-x.low<=q1).length,mean=core().mean(vals);return `<tr><td>${esc(a[0].label)}</td><td>${a.length}</td><td>${fmtRange(mean)}</td><td>${fmtRange(core().median(vals))}</td><td>${fmtRange(q)}</td><td>${fmtRange(r.forecast.hourThreshold)}</td><td>${hot}</td><td>${pct(hot/a.length*100)}</td><td>${light}</td><td>${pct(light/a.length*100)}</td><td>${pct(core().mean(a.map(x=>x.dayRange?100*(x.high-x.low)/x.dayRange:NaN)))}</td><td>${pct(core().mean(a.map(x=>x.adr20?100*(x.high-x.low)/x.adr20:NaN)))}</td></tr>`;});
    }else{
      headers=["ICT Macro (NY)","Số ngày","Range TB","Median","P75 20m baseline","Ngày mạnh","Mạnh %","Ngày nhẹ","Nhẹ %","Range / ADR20"];
      const pairs=[["m0950","09:50–10:10"],["m1050","10:50–11:10"]];
      rows=pairs.map(([key,label])=>{const a=allss.filter(s=>s.macros[key]&&s.macros[key].bars>=19).map(s=>({...s.macros[key],adr20:s.adr20}));if(!a.length)return "";const vals=a.map(x=>x.high-x.low),strong=Number.isFinite(r.forecast.twentyMinuteThreshold)?a.filter(x=>x.high-x.low>=r.forecast.twentyMinuteThreshold).length:0,light=Number.isFinite(r.forecast.twentyMinuteWeakThreshold)?a.filter(x=>x.high-x.low<=r.forecast.twentyMinuteWeakThreshold).length:0;return `<tr><td><b>${label}</b></td><td>${a.length}</td><td>${fmtRange(core().mean(vals))}</td><td>${fmtRange(core().median(vals))}</td><td>${fmtRange(r.forecast.twentyMinuteThreshold)}</td><td>${strong}</td><td>${pct(strong/a.length*100)}</td><td>${light}</td><td>${pct(light/a.length*100)}</td><td>${pct(core().mean(a.map(x=>x.adr20>0?100*(x.high-x.low)/x.adr20:NaN)))}</td></tr>`;}).filter(Boolean);
    }
    return `<div class="ms-subhead"><div><h3>${({year:"Theo năm",month:"Theo tháng",week:"Theo tuần",day:"Theo ngày",hour:"Theo giờ",macro:"ICT Macro · 20 phút"})[S.level]}</h3><small>${visibleN.toLocaleString("vi-VN")} phiên sau bộ lọc · ${r.classificationFallback?"mẫu có dưới 10 phiên đạt 95%, tạm dùng ngưỡng đã chọn":"xếp hạng chính dùng phiên đạt ≥95% độ phủ"} · range tính bằng point.</small></div><div class="ms-filters"><label>Năm<select id="msYear"><option value="">Tất cả năm</option></select></label><label>Tháng<select id="msMonth"><option value="">Tất cả tháng</option></select></label><label>Tuần<select id="msWeek"><option value="">Tất cả tuần</option></select></label></div></div>${table(headers,rows,"Không có dữ liệu cho bộ lọc này.")}`;
  }
  function render(){
    const r=S.result;
    if(!r||!r.sessions.length){$m("msOverview").innerHTML="";$m("msForecast").innerHTML="";$m("msDetail").innerHTML='<div class="ms-empty">Chưa có dữ liệu thống kê. Kết nối cTrader, chọn NAS100/NQ và bấm “Tải toàn bộ M1”.</div>';$m("msWeekday").innerHTML="";return;}
    $m("msOverview").innerHTML=renderOverview();$m("msForecast").innerHTML=renderForecast();$m("msWeekday").innerHTML=renderWeekday();$m("msDetail").innerHTML=renderDetail();updateFilters();
  }
  function setMode(mode){S.mode=mode==="ETH"?"ETH":"RTH";const s=selectedSymbol();if(s)analyzeCache(s.symbolId).catch(e=>setStatus(e.message,"bad"));}
  function exportCSV(){
    if(!S.result?.sessions?.length)return;
    const rows=[["date_ET","open","high","low","close","range_points","body_efficiency_pct","ADR20","range_ADR20_pct","strong_day","light_day","qualified_for_classification","coverage_pct","bars"]];
    for(const s of S.result.sessions)rows.push([s.date,s.open,s.high,s.low,s.close,s.range,s.bodyEfficiency*100,s.adr20,s.adrRatio*100,s.strong===true?1:0,s.light===true?1:0,s.qualified?1:0,s.coverage*100,s.bars]);
    const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`QuantLab_${S.symbol?.symbolName||"NQ"}_${S.mode}_daily_stats.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function refreshCache(){
    try{const s=selectedSymbol();if(!s){setStatus("Không có symbol NQ/NAS100 trong danh sách broker. Kết nối cTrader trước.","warn");return;}
      const meta=await getMeta(s.symbolId);S.meta=meta;S.symbol=s;S.cacheKey=+s.symbolId;
      if(meta){setStatus(`${meta.symbolName}: cache ${meta.totalBars?.toLocaleString("vi-VN")} nến M1 · ${meta.mode==="complete"?"đã tải hết phần broker cung cấp":meta.source?.startsWith("QuantLab Chart")?"đã nhập từ Chart; có thể tải thêm lịch sử cũ hơn":meta.mode==="partial"?"bản tải một phần":"đang tải"}.`,"ok");await analyzeCache(s.symbolId);}
      else {setStatus(`Đã nhận diện ${s.symbolName}; chưa có cache lịch sử M1.`,"info");render();}
    }catch(e){setStatus("Không đọc được cache: "+e.message,"bad");}
  }
  function bind(){
    if($m("msLoad"))$m("msLoad").onclick=downloadAll;
    if($m("msUseChart"))$m("msUseChart").onclick=async()=>{
      if(S.busy)return;const sym=selectedSymbol();if(!sym){setStatus("Chưa chọn được mã NQ/NAS100.","warn");return;}
      S.busy=true;const b=$m("msUseChart");if(b)b.disabled=true;
      try{setStatus("Đang nhập OHLC M1 đang có trên Chart…");const r=await importChartRows(sym);
        if(r.imported){await analyzeCache(sym.symbolId);setStatus(`Đã nhập ${r.count.toLocaleString("vi-VN")} nến M1 từ Chart. Dữ liệu thống kê chỉ dùng thời gian + OHLC; volume không được đọc.` ,"ok");}
        else setStatus(r.reason,"warn");
      }catch(e){setStatus("Không nhập được M1 từ Chart: "+(e.message||e),"bad");}
      finally{S.busy=false;if(b)b.disabled=false;}
    };
    if($m("msStop"))$m("msStop").onclick=()=>{S.cancel=true;setStatus("Đang dừng sau khi hoàn thành request hiện tại…","warn");};
    if($m("msSymbol"))$m("msSymbol").onchange=()=>{S.symbol=selectedSymbol();S.year=S.month=S.week="";refreshCache();};
    if($m("msMode"))$m("msMode").onchange=e=>{S.year=S.month=S.week="";setMode(e.target.value);};
    if($m("msCoverage"))$m("msCoverage").onchange=()=>{const s=selectedSymbol();if(s)analyzeCache(s.symbolId);};
    if($m("msLevel"))$m("msLevel").onchange=e=>{S.level=e.target.value;render();};
    const detail=$m("msDetail");if(detail)detail.addEventListener("change",e=>{if(e.target.id==="msYear"){S.year=e.target.value;S.month=S.week="";render();}else if(e.target.id==="msMonth"){S.month=e.target.value;S.week="";render();}else if(e.target.id==="msWeek"){S.week=e.target.value;render();}});
    if($m("msExport"))$m("msExport").onclick=exportCSV;
    if($m("msDelete"))$m("msDelete").onclick=async()=>{const s=selectedSymbol();if(!s)return;if(!confirm(`Xóa toàn bộ cache M1 của ${s.symbolName} trên trình duyệt này?`))return;await deleteSymbol(s.symbolId);S.result=null;S.meta=null;render();setStatus("Đã xóa cache M1 cục bộ.","ok");};
  }
  async function onOpen(){
    try{if(!CT.ready)await ensureBroker();}catch(e){/* vẫn cho xem cấu hình khi chưa kết nối */}
    const L=fillSymbols();if(!L.length){setStatus("Chưa thấy danh sách mã. Vào Kết nối cTrader trước.","warn");render();return;}
    const s=selectedSymbol();if(s)await refreshCache();
  }
  bind();window.MarketStatistics={onOpen,downloadAll,analyzeCache,chartM1Rows,decodeTrendbar:decodeTB,get state(){return S;}};
})();
