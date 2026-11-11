/* ================= CROSS-ASSET ETF OPTIONS MAP =================
   Projects ETF option strikes from Binance QQQ / GLD into the live
   cTrader NAS100 / XAUUSD price space. All mapped prices are anchored
   to the two live underlyings; no fixed ETF-to-index conversion factor.
   This is an options-derived proxy, not target-instrument order flow.
*/
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const TARGET = {qqq:'NAS100',gld:'XAUUSD'};
  const SOURCE_NAME = {qqq:'QQQ',gld:'GLD'};
  const STORE_KEY = 'tp_cross_asset_map_v1';
  const readSaved = ()=>{try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{}}catch{return {}}};
  const saved = readSaved();
  const XMAP = window.XMAP = {
    enabled:false, source:saved.source==='gld'?'gld':saved.source==='qqq'?'qqq':(typeof C!=='undefined'&&C.sym==='XAUUSD'?'gld':'qqq'), metric:saved.metric==='gex'?'gex':'oi',
    heat:saved.heat!==false, walls:saved.walls!==false, bubbles:saved.bubbles!==false,
    opacity:Number.isFinite(+saved.opacity)?Math.max(.1,Math.min(.9,+saved.opacity)):.48,
    version:0, snapshot:null, error:'', started:false
  };
  const num = x => Number.isFinite(+x)?+x:null;
  const compact = x => {const v=+x;if(!Number.isFinite(v))return '—';const a=Math.abs(v);return a>=1e6?(v/1e6).toFixed(1)+'m':a>=1e3?(v/1e3).toFixed(1)+'k':String(Math.round(v));};
  const fmt = (x,d=2)=>Number.isFinite(+x)?(+x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const timestampMs = x => {const t=num(x);return t===null?null:(t<1e12?t*1000:t)};
  const ageLabel = ms => ms===null?'—':ms<60000?Math.max(0,Math.round(ms/1000))+'s':ms<3600000?Math.round(ms/60000)+'m':Math.round(ms/3600000)+'h';
  const save = ()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify({source:XMAP.source,metric:XMAP.metric,heat:XMAP.heat,walls:XMAP.walls,bubbles:XMAP.bubbles,opacity:XMAP.opacity}))}catch{}};
  const pair = ()=>TARGET[XMAP.source];
  const sourceSpot = ()=>num(XMAP.snapshot?.price);
  function targetSpot(){
    try{
      if(typeof CT!=='undefined'&&CT.sym&&CT.sym.req!==C.sym)return null;
      if(typeof CT!=='undefined'&&CT.bid>0&&CT.sym&&CT.sym.req===C.sym)return CT.bid/1e5;
    }catch{}
    try{const b=agg&&agg[agg.length-1];if(b&&Number.isFinite(+b.close))return +b.close}catch{}
    return null;
  }
  function currentMatchesTarget(){return String(C.sym||'').toUpperCase()===pair();}
  function mapStrike(sourceStrike,sourcePrice,targetPrice){
    const strike=num(sourceStrike),source=num(sourcePrice),target=num(targetPrice);
    if(!(strike>0&&source>0&&target>0))return null;
    return target*(strike/source);
  }
  window.crossAssetMapMath=Object.freeze({mapStrike});
  function mappedPrice(sourceStrike){return mapStrike(sourceStrike,sourceSpot(),targetSpot());}
  function setState(text,kind=''){
    const el=$('xmapState');if(!el)return;
    el.textContent=text;el.className='xmap-state'+(kind?' '+kind:'');
  }
  function updateTargetButton(){
    const b=$('xmapTarget');if(!b)return;
    const t=pair();b.textContent=currentMatchesTarget()?'Đang mở '+t:'Mở chart '+t;
    b.disabled=currentMatchesTarget();
  }
  function updateMeta(){
    const el=$('xmapMeta');if(!el)return;
    updateTargetButton();
    if(!XMAP.enabled){el.textContent='Tắt overlay. Bật để tải dữ liệu Option Chain từ Binance và vẽ các mức đã quy đổi.';setState('Tắt');return;}
    if(!currentMatchesTarget()){
      el.textContent=`Đang chọn ${SOURCE_NAME[XMAP.source]} → ${pair()}. Chart hiện tại là ${C.sym}; hãy mở chart ${pair()} để đặt các mức lên đúng trục giá.`;
      setState('Chờ chart đích','warn');return;
    }
    const s=XMAP.snapshot,sp=sourceSpot(),tp=targetSpot();
    syncExpiryControl(s);
    if(s?.error){el.textContent=`Binance ${SOURCE_NAME[XMAP.source]}: ${s.error}`;setState('Lỗi nguồn dữ liệu','warn');return;}
    if(!s||!sp){el.textContent=`Đang chờ giá underlying ${SOURCE_NAME[XMAP.source]} và Option Chain từ Binance…`;setState('Đang tải','loading');return;}
    if(!(tp>0)){el.textContent=`Đã có ${SOURCE_NAME[XMAP.source]} ${fmt(sp)} nhưng chart ${pair()} chưa có giá cTrader.`;setState('Chờ giá cTrader','warn');return;}
    const ratio=tp/sp;
    const coverage=Number.isFinite(s.coverage)?(s.coverage*100).toFixed(1)+'%':'—';
    const updated=s.updatedAt?new Date(s.updatedAt).toLocaleTimeString('vi-VN'):'—';
    const sourceTs=timestampMs(s.priceTime),sourceAge=sourceTs===null?null:Math.max(0,Date.now()-sourceTs);
    const targetAge=typeof CT!=='undefined'&&CT.lastSpot?Math.max(0,Date.now()-CT.lastSpot):null;
    const staleSource=sourceAge!==null&&sourceAge>15*60*1000,staleTarget=targetAge!==null&&targetAge>2*60*1000;
    const freshness=`ETF spot ${ageLabel(sourceAge)} · cTrader ${ageLabel(targetAge)}`;
    el.textContent=`${SOURCE_NAME[XMAP.source]} ${fmt(sp)} → ${pair()} ${fmt(tp)} · hệ số neo ${ratio.toFixed(5)} · expiry ${s.expiry||'—'} · OI coverage ${coverage} · OI cập nhật ${updated} · ${freshness}`;
    if(staleSource||staleTarget)setState(staleSource?'ETF spot cũ':'cTrader spot cũ','warn');else setState('Live proxy','ok');
  }
  function syncExpiryControl(snapshot){
    const select=$('xmapExpiry');if(!select)return;
    const expirations=Array.isArray(snapshot?.expirations)?snapshot.expirations:[];
    const key=expirations.map(x=>x.date).join(',');
    if(select.dataset.expiries!==key){
      select.dataset.expiries=key;
      select.innerHTML=expirations.length?expirations.map(x=>`<option value="${String(x.date).replace(/[^0-9-]/g,'')}">${String(x.date).replace(/[^0-9-]/g,'')} · ${String(x.root||'')}</option>`).join(''):'<option value="">Đang tải kỳ hạn…</option>';
    }
    if(snapshot?.expiry&&select.value!==snapshot.expiry)select.value=snapshot.expiry;
    select.disabled=!expirations.length;
  }
  function refreshSnapshot(){
    if(!XMAP.enabled)return;
    try{XMAP.snapshot=window.stockOptionsCrossAssetSnapshot?.(XMAP.source)||null;XMAP.error=''}catch(e){XMAP.error=e?.message||String(e)}
    XMAP.version++;updateMeta();
    try{if(typeof dirty!=='undefined')dirty=true}catch{}
  }
  window.crossAssetMapDataUpdated = key=>{if(XMAP.enabled&&key===XMAP.source)refreshSnapshot()};
  window.crossAssetMapRenderKey = ()=>XMAP.version+'|'+(XMAP.enabled?1:0)+'|'+C.sym;

  function start(){
    XMAP.enabled=true;XMAP.started=true;XMAP.error='';save();
    try{window.stockOptionsCrossAssetStart?.(XMAP.source)}catch(e){XMAP.error=e?.message||String(e)}
    refreshSnapshot();updateMeta();
    const b=$('xmapEnable');if(b)b.textContent='Tắt overlay';
  }
  function stop(){
    XMAP.enabled=false;XMAP.started=false;XMAP.snapshot=null;XMAP.version++;save();
    try{window.stockOptionsCrossAssetStop?.()}catch{}
    updateMeta();const b=$('xmapEnable');if(b)b.textContent='Bật overlay';
    try{if(typeof dirty!=='undefined')dirty=true}catch{}
  }
  function switchTarget(){
    const target=pair();
    if(C.sym!==target){C.sym=target;sv('tp_sym',target);$('sym').value=target;$('bid').textContent=$('ask').textContent='–';
      try{loadM1()}catch(e){XMAP.error=e?.message||String(e);updateMeta()}}
    else updateMeta();
  }
  function setSource(v){
    if(!TARGET[v])return;
    const wasOn=XMAP.enabled;XMAP.source=v;XMAP.snapshot=null;XMAP.version++;save();
    if(wasOn){try{window.stockOptionsCrossAssetStop?.()}catch{}start();}
    updateMeta();
  }
  function bind(){
    const toggle=$('xmapToggle'),panel=$('xmapPanel');
    toggle?.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)updateMeta()});
    $('xmapSource')?.addEventListener('change',e=>setSource(e.target.value));
    $('xmapExpiry')?.addEventListener('change',e=>{
      const expiry=e.target.value;if(!expiry)return;
      Promise.resolve(window.stockOptionsCrossAssetSetExpiry?.(XMAP.source,expiry)).then(()=>refreshSnapshot()).catch(err=>{XMAP.error=err?.message||String(err);updateMeta()});
    });
    $('xmapMetric')?.addEventListener('change',e=>{XMAP.metric=e.target.value==='gex'?'gex':'oi';XMAP.version++;save();try{if(typeof dirty!=='undefined')dirty=true}catch{}});
    $('xmapHeat')?.addEventListener('change',e=>{XMAP.heat=e.target.checked;XMAP.version++;save();try{if(typeof dirty!=='undefined')dirty=true}catch{}});
    $('xmapWalls')?.addEventListener('change',e=>{XMAP.walls=e.target.checked;XMAP.version++;save();try{if(typeof dirty!=='undefined')dirty=true}catch{}});
    $('xmapBubbles')?.addEventListener('change',e=>{XMAP.bubbles=e.target.checked;XMAP.version++;save();try{if(typeof dirty!=='undefined')dirty=true}catch{}});
    $('xmapOpacity')?.addEventListener('input',e=>{XMAP.opacity=Math.max(.1,Math.min(.9,(+e.target.value||48)/100));XMAP.version++;save();try{if(typeof dirty!=='undefined')dirty=true}catch{}});
    $('xmapEnable')?.addEventListener('click',()=>XMAP.enabled?stop():start());
    $('xmapTarget')?.addEventListener('click',switchTarget);
    if($('xmapSource'))$('xmapSource').value=XMAP.source;
    if($('xmapMetric'))$('xmapMetric').value=XMAP.metric;
    if($('xmapHeat'))$('xmapHeat').checked=XMAP.heat;
    if($('xmapWalls'))$('xmapWalls').checked=XMAP.walls;
    if($('xmapBubbles'))$('xmapBubbles').checked=XMAP.bubbles;
    if($('xmapOpacity'))$('xmapOpacity').value=Math.round(XMAP.opacity*100);
    updateMeta();
  }

  function drawLine(y,color,label,price,w,h){
    if(!Number.isFinite(y)||y<-30||y>h+30)return;
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.35;ctx.setLineDash([7,4]);ctx.beginPath();ctx.moveTo(0,Math.round(y)+.5);ctx.lineTo(w,Math.round(y)+.5);ctx.stroke();ctx.setLineDash([]);
    const text=`${label}  ${fmt(price,2)}`;ctx.font='600 10px "Space Grotesk",sans-serif';const tw=ctx.measureText(text).width+12,x=Math.max(4,w-tw-8);
    ctx.fillStyle='rgba(5,12,20,.78)';ctx.fillRect(x,y-9,tw,18);ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text,x+6,y);
    ctx.restore();
  }
  let lastMetaSymbol='';
  function drawCrossAssetMap(w,h){
    if(lastMetaSymbol!==C.sym){lastMetaSymbol=C.sym;updateMeta()}
    if(!XMAP.enabled||!XMAP.snapshot||!currentMatchesTarget())return;
    const s=XMAP.snapshot,sp=sourceSpot(),tp=targetSpot();
    if(!(sp>0&&tp>0)||!Array.isArray(s.dist)||!s.dist.length)return;
    const ratio=tp/sp,opacity=XMAP.opacity;
    const rows=s.dist.map(r=>({...r,target:mappedPrice(r.strike)})).filter(r=>Number.isFinite(r.target));
    if(!rows.length)return;
    let maxMetric=0;
    for(const r of rows){const v=XMAP.metric==='gex'?Math.abs(r.gex||0):(r.callOI||0)+(r.putOI||0);if(v>maxMetric)maxMetric=v;}
    if(XMAP.heat&&maxMetric>0){
      const candidates=rows.filter(r=>{const y=cs.priceToCoordinate(r.target);return Number.isFinite(y)&&y>=-30&&y<=h+30;})
        .sort((a,b)=>{const av=XMAP.metric==='gex'?Math.abs(a.gex||0):(a.callOI||0)+(a.putOI||0),bv=XMAP.metric==='gex'?Math.abs(b.gex||0):(b.callOI||0)+(b.putOI||0);return bv-av}).slice(0,64);
      const gaps=rows.slice(1).map((r,i)=>Math.abs(r.target-rows[i].target)).filter(v=>v>0).sort((a,b)=>a-b);
      const step=gaps.length?gaps[Math.floor(gaps.length/2)]:ratio*(XMAP.source==='qqq'?1:1);
      const ya=cs.priceToCoordinate(tp),yb=cs.priceToCoordinate(tp+step),rowH=Math.max(6,Math.min(24,Math.abs((ya??0)-(yb??0))||10));
      ctx.save();
      const x0=w*.48,xw=w*.50;
      for(const r of candidates){
        const val=XMAP.metric==='gex'?Math.abs(r.gex||0):(r.callOI||0)+(r.putOI||0);if(!(val>0))continue;
        const y=cs.priceToCoordinate(r.target);if(y==null)continue;
        const intensity=Math.min(1,Math.pow(val/maxMetric,.62));
        let color='64,174,221';
        if(XMAP.metric==='gex')color=(r.gex||0)>=0?'53,210,157':'235,83,123';
        else if((r.callOI||0)+(r.putOI||0)>0){const p=(r.callOI||0)/((r.callOI||0)+(r.putOI||0));color=p>=.62?'53,185,154':p<=.38?'218,83,129':'88,153,213';}
        ctx.fillStyle=`rgba(${color},${Math.min(.48,opacity*(.16+.6*intensity))})`;
        ctx.fillRect(x0,y-rowH/2,xw,rowH);
        ctx.fillStyle=`rgba(${color},${Math.min(.9,opacity*(.28+.58*intensity))})`;
        ctx.fillRect(x0,y-rowH/2,Math.max(2,xw*intensity),2);
      }
      ctx.restore();
    }
    if(XMAP.walls){
      const cwall=s.callWall?mappedPrice(s.callWall.strike):null,pwall=s.putWall?mappedPrice(s.putWall.strike):null,flip=s.flip?mappedPrice(s.flip):null;
      if(cwall!=null)drawLine(cs.priceToCoordinate(cwall),'#ff5c8a','CALL OI WALL',cwall,w,h);
      if(pwall!=null)drawLine(cs.priceToCoordinate(pwall),'#35d6b0','PUT OI WALL',pwall,w,h);
      if(flip!=null)drawLine(cs.priceToCoordinate(flip),'#ffc857','GAMMA FLIP',flip,w,h);
    }
    if(XMAP.bubbles){
      const vols=[];for(const r of rows){if((r.callVol||0)>0)vols.push({r,side:'C',v:r.callVol});if((r.putVol||0)>0)vols.push({r,side:'P',v:r.putVol});}
      const maxV=Math.max(0,...vols.map(x=>x.v));
      if(maxV>0){
        vols.sort((a,b)=>b.v-a.v);
        ctx.save();ctx.textBaseline='middle';
        for(const item of vols.slice(0,36)){
          const y=cs.priceToCoordinate(item.r.target);if(y==null||y<-22||y>h+22)continue;
          const radius=4+13*Math.sqrt(item.v/maxV),x=item.side==='C'?w*.70:w*.87,color=item.side==='C'?'#35e59a':'#ff536b';
          ctx.globalAlpha=.78;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.95;ctx.lineWidth=1.2;ctx.strokeStyle='rgba(5,12,20,.92)';ctx.stroke();
          if(radius>=8){ctx.font='700 9px "Space Grotesk",sans-serif';ctx.fillStyle='#071018';ctx.textAlign='center';ctx.fillText(item.side,x,y+.5);}
          ctx.globalAlpha=.95;ctx.font='600 9px \"Space Grotesk\",sans-serif';ctx.fillStyle=color;ctx.textAlign='left';ctx.fillText(compact(item.v),x+radius+3,y);
        }
        ctx.restore();
      }
    }
    // Small, persistent label so the reader never mistakes ETF options data for native CFD flow.
    ctx.save();ctx.font='600 10px "Space Grotesk",sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
    ctx.fillStyle='rgba(4,10,18,.72)';ctx.fillRect(8,8,Math.min(285,w-16),17);
    ctx.fillStyle='#a8d9e8';ctx.fillText(`${SOURCE_NAME[XMAP.source]} OPTIONS → ${pair()}  ·  ×${ratio.toFixed(4)}`,13,11);
    ctx.restore();
  }
  window.drawCrossAssetMap=drawCrossAssetMap;
  bind();
})();
