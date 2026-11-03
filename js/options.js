/* ================= BINANCE XAU COMMODITY OPTIONS =================
   Public market-data endpoints only. No API key is required.
   Exposure is an explicitly labelled scenario model because public OI
   does not reveal which participant is long/short each option contract.
*/
(function(){
  'use strict';
  const API='https://eapi.binance.com';
  const UNDERLYING='XAUUSDT';
  const $o=id=>document.getElementById(id);
  const state={active:false,busy:false,timer:null,contracts:[],marks:new Map(),oi:new Map(),index:null,expiry:null,mode:'long',exposureMetric:'gamma',lastExchange:0,lastOI:0,lastUpdate:0,error:'',oiSource:'',ticker:new Map()};
  const n=x=>{if(x===null||x===undefined||x==='')return null;const v=Number(x);return Number.isFinite(v)?v:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const compact=x=>x==null||!Number.isFinite(Number(x))?'—':Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(Number(x));
  const dateLabel=ts=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(ts));
  const expiryParam=ts=>new Date(ts).toISOString().slice(2,10).replace(/-/g,'');
  const getExpiryTs=c=>n(c.expiryDate)||(()=>{const m=String(c.symbol||'').match(/^XAU-(\d{6})-/);if(!m)return null;const s=m[1];return Date.UTC(2000+Number(s.slice(0,2)),Number(s.slice(2,4))-1,Number(s.slice(4,6)));})();
  const sideName=s=>String(s||'').toUpperCase()==='CALL'?'C':'P';
  async function api(path,params={}){
    const u=new URL(API+path);Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v))});
    const r=await fetch(u.toString(),{cache:'no-store',headers:{'Accept':'application/json'}});
    let data;try{data=await r.json()}catch{throw new Error('Binance trả về dữ liệu không phải JSON (HTTP '+r.status+').')}
    if(!r.ok)throw new Error((data&&data.msg)||('HTTP '+r.status));
    if(data&&typeof data==='object'&&Number(data.code)<0)throw new Error(data.msg||('Binance API error '+data.code));
    return data;
  }
  function setStatus(text,kind=''){
    const el=$o('optStatus');if(!el)return;el.textContent=text;el.className='opt-status'+(kind?' '+kind:'');
  }
  function selectedContracts(){return state.contracts.filter(c=>getExpiryTs(c)===Number(state.expiry));}
  function numberFrom(obj,key){return n(obj&&obj[key])}
  function markFor(symbol){return state.marks.get(symbol)||{symbol};}
  async function loadExchange(force=false){
    if(!force&&state.contracts.length&&Date.now()-state.lastExchange<300000)return;
    const data=await api('/eapi/v1/exchangeInfo');
    const all=Array.isArray(data.optionSymbols)?data.optionSymbols:[];
    state.contracts=all.filter(c=>{
      const sym=String(c.symbol||'');
      const underlying=String(c.underlying||'').toUpperCase();
      const commodity=String(c.underlyingType||'').toUpperCase()==='COMMODITY';
      const tradfi=String(c.contractType||'').toUpperCase()==='TRADFI_OPTIONS';
      return /^XAU-/.test(sym)&&(underlying===UNDERLYING||commodity||tradfi);
    }).filter(c=>getExpiryTs(c)&&getExpiryTs(c)>=Date.now()-86400000&&String(c.status||'').toUpperCase()!=='CLOSE');
    state.lastExchange=Date.now();
    const expiries=[...new Set(state.contracts.map(getExpiryTs).filter(Boolean))].sort((a,b)=>a-b);
    if(!expiries.includes(Number(state.expiry)))state.expiry=expiries[0]||null;
    renderExpiryOptions(expiries);
  }
  function renderExpiryOptions(expiries){
    const el=$o('optExpiry');if(!el)return;
    const old=String(state.expiry||'');
    el.innerHTML=expiries.length?expiries.map(ts=>`<option value="${ts}" ${String(ts)===old?'selected':''}>${esc(dateLabel(ts))} · ${Math.max(0,Math.ceil((ts-Date.now())/86400000))}D</option>`).join(''):'<option value="">Không có kỳ hạn</option>';
  }
  async function loadOpenInterest(force=false){
    if(!force&&Date.now()-state.lastOI<60000)return;
    state.oi.clear();state.oiSource='';
    const exp=Number(state.expiry);if(!exp)return;
    const expiration=expiryParam(exp);
    // Binance docs show an underlyingAsset such as ETH/BTC. Try the commodity
    // quote form first, then common base/symbol aliases for account-region variants.
    const candidates=['XAU/USDT','XAU','XAUUSDT'];
    let lastError=null;
    for(const asset of candidates){
      try{
        const rows=await api('/eapi/v1/openInterest',{underlyingAsset:asset,expiration});
        const arr=Array.isArray(rows)?rows:(rows&&Array.isArray(rows.data)?rows.data:(rows&&rows.symbol?[rows]:[]));
        if(arr.length){
          arr.forEach(x=>state.oi.set(x.symbol,{qty:numberFrom(x,'sumOpenInterest'),usd:numberFrom(x,'sumOpenInterestUsd'),time:numberFrom(x,'timestamp')}));
          state.oiSource=asset;state.lastOI=Date.now();return;
        }
      }catch(e){lastError=e}
    }
    state.lastOI=Date.now();
    if(lastError)state.error='Open Interest: '+lastError.message;
  }
  async function refresh(force=false){
    if(state.busy)return;state.busy=true;state.error='';
    setStatus('Đang đồng bộ Binance…','loading');
    const refreshBtn=$o('optRefresh');if(refreshBtn)refreshBtn.disabled=true;
    try{
      await loadExchange(force);
      if(!state.contracts.length){state.index=null;state.marks.clear();render();setStatus('Không tìm thấy hợp đồng XAU đang niêm yết','bad');return;}
      const symbols=new Set(state.contracts.map(c=>c.symbol));
      const [markData,indexData]=await Promise.all([
        api('/eapi/v1/mark'),
        api('/eapi/v1/index',{underlying:UNDERLYING}).catch(e=>({__error:e.message}))
      ]);
      const marks=Array.isArray(markData)?markData:(markData&&Array.isArray(markData.data)?markData.data:[markData]);
      state.marks=new Map(marks.filter(x=>x&&symbols.has(x.symbol)).map(x=>[x.symbol,x]));
      state.index=numberFrom(indexData,'indexPrice');
      await loadOpenInterest(force||!state.oi.size);
      state.lastUpdate=Date.now();render();
      const oiOk=state.oi.size>0;
      setStatus('Binance API · '+state.contracts.length+' contracts · '+(oiOk?'OI synced':'OI unavailable'),'ok');
    }catch(e){
      state.error=e&&e.message?e.message:String(e);renderError(state.error);
      setStatus('Không tải được dữ liệu','bad');
    }finally{state.busy=false;if(refreshBtn)refreshBtn.disabled=false;}
  }
  function makeRows(){
    const cs=selectedContracts(),map=new Map();
    cs.forEach(c=>{
      const strike=numberFrom(c,'strikePrice');if(strike==null)return;
      const side=sideName(c.side),m=markFor(c.symbol),oi=state.oi.get(c.symbol)||{};
      if(!map.has(strike))map.set(strike,{strike,call:null,put:null});
      const obj={contract:c,mark:m,oi:n(oi.qty),oiUsd:n(oi.usd),delta:numberFrom(m,'delta'),gamma:numberFrom(m,'gamma'),vega:numberFrom(m,'vega'),theta:numberFrom(m,'theta'),iv:numberFrom(m,'markIV'),bidIV:numberFrom(m,'bidIV'),askIV:numberFrom(m,'askIV'),price:numberFrom(m,'markPrice')};
      map.get(strike)[side==='C'?'call':'put']=obj;
    });
    return [...map.values()].sort((a,b)=>a.strike-b.strike);
  }
  function aggregate(rows){
    const sign=state.mode==='short'?-1:1,spot=state.index;
    const sum={callOI:0,putOI:0,delta:0,gamma:0,gex:0,vega:0,theta:0,callVol:0,putVol:0,hasOI:false};
    rows.forEach(r=>['call','put'].forEach(k=>{
      const x=r[k];if(!x||x.oi==null)return;sum.hasOI=true;
      if(k==='call')sum.callOI+=x.oi;else sum.putOI+=x.oi;
      const unit=n(x.contract.unit)||1,oi=x.oi;
      if(x.delta!=null&&spot!=null)sum.delta+=sign*x.delta*oi*unit*spot;
      if(x.gamma!=null&&spot!=null){const g=sign*x.gamma*oi*unit*spot*spot*.01;sum.gamma+=sign*x.gamma*oi*unit;sum.gex+=g;r[k].gex=g}
      if(x.vega!=null)sum.vega+=sign*x.vega*oi*unit;
      if(x.theta!=null)sum.theta+=sign*x.theta*oi*unit;
    }));
    sum.pc=sum.callOI>0?sum.putOI/sum.callOI:null;
    return sum;
  }
  function maxPain(rows){
    const strikes=rows.map(r=>r.strike);if(!strikes.length)return null;
    let best=null;
    strikes.forEach(price=>{
      let payout=0;
      rows.forEach(r=>{
        if(r.call&&r.call.oi!=null)payout+=Math.max(0,price-r.strike)*r.call.oi*(n(r.call.contract.unit)||1);
        if(r.put&&r.put.oi!=null)payout+=Math.max(0,r.strike-price)*r.put.oi*(n(r.put.contract.unit)||1);
      });
      if(best==null||payout<best.payout)best={strike:price,payout};
    });return best;
  }
  function metric(label,value,sub,cls=''){
    return `<div class="opt-metric"><span>${label}</span><strong class="${cls}">${value}</strong><small>${sub||''}</small></div>`;
  }
  function greekCell(x,key,d=4){return x&&x[key]!=null?fmt(x[key],d):'—'}
  function render(){
    const root=$o('optMetrics');if(!root)return;
    const rows=makeRows(),a=aggregate(rows),pain=a.hasOI?maxPain(rows):null,spot=state.index;
    const atm=rows.reduce((best,r)=>{const dist=Math.abs(r.strike-(spot??r.strike));return !best||dist<best.dist?{r,dist}:best},null);
    const atmValues=atm?[atm.r.call&&atm.r.call.iv,atm.r.put&&atm.r.put.iv].filter(x=>x!=null):[];const atmIV=atmValues.length?atmValues.reduce((s,x)=>s+x/atmValues.length,0):null;
    root.innerHTML=[
      metric('XAU INDEX',spot==null?'—':'$'+fmt(spot,2),'Binance underlying index'),
      metric('ATM IMPLIED VOL',atmIV==null?'—':fmt(atmIV*100,2)+'%','Mark IV · nearest strike'),
      metric('CALL OPEN INTEREST',compact(a.callOI),'Selected expiry'),
      metric('PUT OPEN INTEREST',compact(a.putOI),'Selected expiry'),
      metric('PUT / CALL',a.pc==null?'—':fmt(a.pc,3),'OI ratio'),
      metric('MAX PAIN',pain?'$'+fmt(pain.strike,2):'—','OI-weighted expiry estimate')
    ].join('');
    renderExposure(rows,a);renderGreeks(a);renderChain(rows,spot);renderMeta(rows,a);
  }
  function renderExposure(rows,a){
    const el=$o('optExposure');if(!el)return;
    const metric=state.exposureMetric;
    const labels={gamma:['Gamma Exposure by Strike','USDT / 1% XAU move'],delta:['Delta Exposure by Strike','USDT notional'],vega:['Vega Exposure by Strike','Binance native units'],theta:['Theta Exposure by Strike','Binance native units']};
    const title=$o('optExposureTitle'),units=$o('optExposureUnits');
    if(title)title.textContent=labels[metric][0];if(units)units.textContent=labels[metric][1];
    if(!a.hasOI||state.index==null){el.innerHTML='<div class="opt-empty">Chưa có Open Interest hoặc Underlying Index cho kỳ hạn này. Không thể tính Exposure đáng tin cậy.</div>';return;}
    const sign=state.mode==='short'?-1:1,spot=state.index;
    const value=x=>{
      if(!x||x.oi==null)return 0;
      const unit=n(x.contract.unit)||1,oi=x.oi;
      if(metric==='delta')return x.delta==null?0:sign*x.delta*oi*unit*spot;
      if(metric==='gamma')return x.gamma==null?0:sign*x.gamma*oi*unit*spot*spot*.01;
      if(metric==='vega')return x.vega==null?0:sign*x.vega*oi*unit;
      return x.theta==null?0:sign*x.theta*oi*unit;
    };
    const series=rows.map(r=>({strike:r.strike,value:value(r.call)+value(r.put)}));
    const max=Math.max(1e-9,...series.map(x=>Math.abs(x.value)));
    el.innerHTML=series.map(x=>{
      const width=Math.max(1,Math.abs(x.value)/max*100),negative=x.value<0;
      return `<div class="opt-gex-row"><span class="opt-gex-strike">${fmt(x.strike,0)}</span><div class="opt-gex-track"><i class="${negative?'neg':'pos'}" style="width:${width}%"></i></div><b class="${negative?'neg-t':'pos-t'}">${compact(x.value)}</b></div>`;
    }).join('')||'<div class="opt-empty">Không có strike trong kỳ hạn đã chọn.</div>';
  }
  function renderGreeks(a){
    const el=$o('optGreeks');if(!el)return;
    if(!a.hasOI){el.innerHTML='<div class="opt-empty">Không có OI. Dữ liệu Greeks đơn lẻ vẫn có thể xem trong Option Chain.</div>';return;}
    el.innerHTML=`<div class="opt-greek-line"><span>Delta Notional</span><b>${fmt(a.delta,2)} USDT</b></div>
      <div class="opt-greek-line"><span>Gamma Exposure · 1% move</span><b>${fmt(a.gex,2)} USDT</b></div>
      <div class="opt-greek-line"><span>Aggregate Gamma</span><b>${fmt(a.gamma,6)}</b></div>
      <div class="opt-greek-line"><span>Vega · Binance native units</span><b>${fmt(a.vega,2)}</b></div>
      <div class="opt-greek-line"><span>Theta · Binance native units</span><b>${fmt(a.theta,2)}</b></div>
      <p class="opt-footnote">Tổng hợp Greeks × OI × contract unit. Gamma Exposure = Γ × OI × unit × S² × 1%. Dấu +/- thay đổi theo giả định vị thế đang chọn.</p>`;
  }
  function renderChain(rows,spot){
    const body=$o('optChainBody');if(!body)return;
    body.innerHTML=rows.map(r=>{
      const atm=spot!=null&&Math.abs(r.strike-spot)<=Math.max(1,spot*.0015);
      return `<tr class="${atm?'atm':''}">
        <td class="strike">${fmt(r.strike,2)}${atm?'<small>ATM</small>':''}</td>
        <td>${greekCell(r.call,'price',3)}</td><td>${r.call&&r.call.oi!=null?compact(r.call.oi):'—'}</td>
        <td>${greekCell(r.call,'delta',4)}</td><td>${greekCell(r.call,'gamma',6)}</td><td>${greekCell(r.call,'vega',3)}</td><td>${greekCell(r.call,'theta',3)}</td><td>${r.call&&r.call.iv!=null?fmt(r.call.iv*100,2)+'%':'—'}</td>
        <td>${greekCell(r.put,'price',3)}</td><td>${r.put&&r.put.oi!=null?compact(r.put.oi):'—'}</td>
        <td>${greekCell(r.put,'delta',4)}</td><td>${greekCell(r.put,'gamma',6)}</td><td>${greekCell(r.put,'vega',3)}</td><td>${greekCell(r.put,'theta',3)}</td><td>${r.put&&r.put.iv!=null?fmt(r.put.iv*100,2)+'%':'—'}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="15" class="opt-empty">Không có Option Chain cho kỳ hạn này.</td></tr>';
  }
  function renderMeta(rows,a){
    const el=$o('optMeta');if(!el)return;
    const expiry=state.expiry?dateLabel(Number(state.expiry)):'—';
    const oiText=state.oi.size?'OI source: '+esc(state.oiSource)+' · '+state.oi.size+' contracts':'Open Interest chưa khả dụng';
    el.innerHTML=`<span>Expiry: ${esc(expiry)}</span><span>${rows.length} strikes</span><span>${state.marks.size} mark records</span><span>${oiText}</span><span>Updated: ${state.lastUpdate?new Date(state.lastUpdate).toLocaleTimeString('vi-VN'):'—'}</span>`;
  }
  function renderError(message){
    const el=$o('optErrors');if(!el)return;
    el.hidden=false;el.textContent='Binance API: '+message+' · Kiểm tra mạng, CORS hoặc tình trạng API rồi thử làm mới.';
  }
  function clearError(){const e=$o('optErrors');if(e){e.hidden=true;e.textContent=''}}
  function activate(on){
    state.active=!!on;
    if(state.timer){clearInterval(state.timer);state.timer=null}
    if(state.active){refresh(false);state.timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh(false)},30000)}
  }
  function init(){
    if(!$o('v-options'))return;
    const expiry=$o('optExpiry');if(expiry)expiry.addEventListener('change',()=>{state.expiry=Number(expiry.value)||null;state.oi.clear();state.lastOI=0;refresh(true)});
    const mode=$o('optMode');if(mode)mode.addEventListener('change',()=>{state.mode=mode.value==='short'?'short':'long';if(state.contracts.length)render()});
    const ref=$o('optRefresh');if(ref)ref.addEventListener('click',()=>{state.lastOI=0;refresh(true)});
    const info=$o('optExplain');if(info)info.addEventListener('click',()=>{$o('optMethod').hidden=!$o('optMethod').hidden});
    const exposure=$o('optExposureMetric');if(exposure)exposure.addEventListener('change',()=>{state.exposureMetric=['delta','gamma','vega','theta'].includes(exposure.value)?exposure.value:'gamma';if(state.contracts.length)render()});
    clearError();
  }
  window.optionsSetActive=activate;
  window.optionsRefresh=refresh;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
