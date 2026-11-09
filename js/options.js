/* ================= BINANCE XAU COMMODITY OPTIONS =================
   Public Binance market data: WebSocket streams + REST Open Interest snapshots.
   No API key or private account data. Public OI is non-directional: Long/Short
   are scenario assumptions only.
*/
(function(){
  'use strict';
  const WS_BASES={market:'wss://fstream.binance.com/market/ws/',public:'wss://fstream.binance.com/public/ws/'};
  const UNDERLYING='XAUUSDT';
  const OPTIONS_REST_BASE='https://eapi.binance.com';
  const OI_POLL_MS=60000;
  const $o=id=>document.getElementById(id);
  const state={
    active:false, sockets:new Map(), reconnects:new Map(), reconnectDelay:new Map(),
    rotateTimer:null, healthTimer:null, renderTimer:null, surfaceRenderTimer:null, oiPollTimer:null, expiry:null,
    contracts:[], marks:new Map(), oi:new Map(), tickers:new Map(), index:null, trades:[],
    oiPollSignature:'', oiPollGeneration:0, oiRestInFlight:new Map(), oiRestByExpiry:new Map(), oiRestStatus:'idle',
    oiRestLastError:'', oiRestLastUpdate:0, oiRestMessages:0,
    mode:'long', exposureMetric:'gamma', surfaceMetric:'gamma', greekMetric:'delta', greekSide:'C', surfaceRenderers:{exposure:null,greek:null}, riskFreeRate:.04, lastMarkTime:0, lastIndexTime:0,
    lastOIUpdate:0, lastTradeTime:0, lastTickerUpdate:0, oiExpiryCodes:[],
    expiryManual:false, status:'idle', error:'', socketErrors:new Map(), lastPayloads:new Map(),
    markCount:0, oiCount:0, tickerCount:0, oiMessages:0, tradeMessages:0, tickerMessages:0
  };
  const n=x=>{if(x===null||x===undefined||x==='')return null;const v=Number(x);return Number.isFinite(v)?v:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const compact=x=>x==null||!Number.isFinite(Number(x))?'—':Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(Number(x));
  const dateLabel=ts=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(ts));
  const expiryParam=ts=>new Date(ts).toISOString().slice(2,10).replace(/-/g,'');
  const parseSymbol=s=>{
    const m=String(s||'').toUpperCase().match(/^XAU-(\d{6})-(\d+(?:\.\d+)?)-(C|P)$/);
    if(!m)return null;
    const y=2000+Number(m[1].slice(0,2)),mo=Number(m[1].slice(2,4))-1,d=Number(m[1].slice(4,6));
    const expiry=Date.UTC(y,mo,d);
    return {symbol:String(s),expiryDate:expiry,strikePrice:Number(m[2]),side:m[3]==='C'?'CALL':'PUT',unit:1};
  };
  const expiryOf=c=>n(c&&c.expiryDate);
  const activeExpiryContracts=()=>state.contracts.filter(c=>expiryOf(c)===Number(state.expiry));
  const currentOISocket=()=>state.sockets.get('oi:'+expiryParam(Number(state.expiry)))||[...state.sockets].find(([k])=>k.startsWith('oi:'))?.[1]||null;
  const YEAR_MS=365*24*60*60*1000;
  // The stream exposes an expiry date, not a precise settlement timestamp. Use a date-based
  // estimate (at least one day) only for scenario projections; live Greeks still come from Binance.
  function timeToExpiryYears(expiry=state.expiry){
    if(!expiry)return null;
    const d=new Date(Number(expiry));
    const end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1);
    return Math.max(1/365,(end-Date.now())/YEAR_MS);
  }
  function surfaceParams(){
    const read=id=>n($o(id)?.value);
    const baseT=timeToExpiryYears(),spotInput=read('optModelSpot'),dteInput=read('optModelDte'),rateInput=read('optModelRate'),yieldInput=read('optModelYield');
    const S=spotInput>0?spotInput:state.index,T=dteInput>0?Math.max(.001,dteInput)/365:baseT;
    const rate=rateInput!==null?rateInput/100:state.riskFreeRate,q=yieldInput!==null?yieldInput/100:0;
    return S>0&&T>0?{S,T,rate:Number.isFinite(rate)?rate:.04,q:Number.isFinite(q)?q:0,manual:{spot:spotInput>0,dte:dteInput>0,rate:rateInput!==null,yield:yieldInput!==null}}:null;
  }
  function resetSurfaceParams(){
    ['optModelSpot','optModelDte','optModelRate','optModelYield'].forEach(id=>{const el=$o(id);if(el)el.value='';});
    scheduleSurfaceRender();
  }
  const pdf=x=>Math.exp(-.5*x*x)/Math.sqrt(2*Math.PI);
  function cdf(x){
    const t=1/(1+.2316419*Math.abs(x)),p=pdf(x)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
    return x>0?1-p:p;
  }
  function bsGreeks(side,S,K,T,iv,rate=.04,q=0){
    const sigma=Math.max(1e-6,Number(iv)||0),sqrtT=Math.sqrt(Math.max(1e-8,T));
    if(!(S>0&&K>0&&T>0&&sigma>0))return {delta:0,gamma:0,vega:0,theta:0,vanna:0,charm:0};
    const d1=(Math.log(S/K)+(rate-q+sigma*sigma/2)*T)/(sigma*sqrtT),d2=d1-sigma*sqrtT;
    const eq=Math.exp(-q*T),p=pdf(d1),call=side==='C';
    const delta=call?eq*cdf(d1):-eq*cdf(-d1);
    const gamma=eq*p/(S*sigma*sqrtT);
    const vega=S*eq*p*sqrtT;
    const base=-S*eq*p*sigma/(2*sqrtT);
    const theta=(call?base-rate*K*Math.exp(-rate*T)*cdf(d2)+q*S*eq*cdf(d1):base+rate*K*Math.exp(-rate*T)*cdf(-d2)-q*S*eq*cdf(-d1))/365;
    const vanna=-eq*p*d2/sigma;
    const charmBase=-eq*p*(2*(rate-q)*T-d2*sigma*sqrtT)/(2*T*sigma*sqrtT);
    const charm=call?charmBase+q*eq*cdf(d1):charmBase-q*eq*cdf(-d1);
    return {delta,gamma,vega,theta,vanna,charm};
  }
  const ensureNumber=(obj,keys)=>{for(const k of keys){const v=n(obj&&obj[k]);if(v!==null)return v}return null};
  function setStatus(text,kind=''){
    const el=$o('optStatus');if(!el)return;el.textContent=text;el.className='opt-status'+(kind?' '+kind:'');
  }
  function clearError(){const el=$o('optErrors');if(el){el.hidden=true;el.textContent=''}}
  function showError(message){const el=$o('optErrors');if(el){el.hidden=false;el.textContent=message}}
  function scheduleRender(){
    if(state.renderTimer)return;
    state.renderTimer=setTimeout(()=>{state.renderTimer=null;if(state.active)render()},180);
  }
  function statusTick(){
    if(!state.active)return;
    const now=Date.now(),markFresh=state.lastMarkTime&&now-state.lastMarkTime<12000;
    const indexFresh=state.lastIndexTime&&now-state.lastIndexTime<12000;
    if(markFresh){
      const oiFresh=state.lastOIUpdate&&now-state.lastOIUpdate<150000;
      setStatus('Live · '+state.contracts.length+' contracts'+(oiFresh?' · OI live':' · OI chờ cập nhật'),'ok');
    }else{
      const connected=[...state.sockets.values()].some(ws=>ws.readyState===WebSocket.OPEN);
      setStatus(connected?'Đã kết nối · chờ dữ liệu':'Đang kết nối Binance WebSocket…','loading');
    }
    const meta=$o('optMeta');
    if(meta&&state.contracts.length){
      const bits=[];
      bits.push(`<span>Mark: ${markFresh?'Live':'Stale / waiting'}</span>`);
      bits.push(`<span>Index: ${indexFresh?'Live':'Mark fallback / waiting'}</span>`);
      const socketState=ws=>!ws?'not started':ws.readyState===WebSocket.OPEN?'connected':ws.readyState===WebSocket.CONNECTING?'connecting':ws.readyState===WebSocket.CLOSING?'closing':'reconnecting';
      const oiKeys=[...state.sockets.keys()].filter(k=>k.startsWith('oi:'));
      const tickerKeys=[...state.sockets.keys()].filter(k=>k.startsWith('ticker:'));
      const oiOpen=oiKeys.filter(k=>state.sockets.get(k)?.readyState===WebSocket.OPEN).length;
      const tradeWs=state.sockets.get('trade');
      const oiSource=state.oiRestStatus==='live'?'REST snapshot + WebSocket':state.oiRestStatus==='error'?'WebSocket · REST lỗi':state.oiRestStatus==='empty'?'WebSocket · REST trống':'WebSocket + REST snapshot';
      bits.push(`<span>OI: ${state.oi.size} records · ${oiOpen}/${oiKeys.length} WS · ${oiSource} · ${state.lastOIUpdate?new Date(state.lastOIUpdate).toLocaleTimeString('vi-VN'):'waiting first payload'}</span>`);
      bits.push(`<span>24h ticker: ${state.tickers.size} records · ${tickerKeys.length} expiry streams</span>`);
      bits.push(`<span>Flow: ${state.trades.length} live trades · ${socketState(tradeWs)}</span>`);
      bits.push(`<span>Updated: ${state.lastMarkTime?new Date(state.lastMarkTime).toLocaleTimeString('vi-VN'):'—'}</span>`);
      meta.innerHTML=bits.join('');
    }
  }
  function closeSocket(key,manual=true){
    const ws=state.sockets.get(key);if(ws){ws.__manual=manual;try{ws.close(1000,'module inactive / reconnect')}catch{}state.sockets.delete(key)}
    const timer=state.reconnects.get(key);if(timer){clearTimeout(timer);state.reconnects.delete(key)}
  }
  function closeAll(){
    for(const key of [...state.sockets.keys()])closeSocket(key,true);
    for(const [key,t] of state.reconnects){clearTimeout(t);state.reconnects.delete(key)}
    if(state.rotateTimer){clearTimeout(state.rotateTimer);state.rotateTimer=null}
    if(state.oiPollTimer){clearTimeout(state.oiPollTimer);state.oiPollTimer=null}
    state.oiPollGeneration++;state.oiPollSignature='';state.oiRestInFlight.clear();state.oiRestByExpiry.clear();
  }
  function scheduleReconnect(key,stream,delay){
    if(!state.active||state.reconnects.has(key))return;
    const next=Math.min(30000,Math.max(1000,delay||1000));
    state.reconnects.set(key,setTimeout(()=>{
      state.reconnects.delete(key);if(state.active)connectStream(key,stream);
    },next));
    state.reconnectDelay.set(key,Math.min(30000,next*2));
  }
  function connectStream(key,stream){
    if(!state.active||typeof WebSocket==='undefined')return;
    closeSocket(key,true);
    const delay=state.reconnectDelay.get(key)||1000;
    let ws;
    const endpoint=(key==='trade'||key.startsWith('ticker:'))?'public':'market';
    try{ws=new WebSocket(WS_BASES[endpoint]+stream)}catch(e){
      state.error=`Không thể tạo WebSocket ${stream}: ${e.message||e}`;
      scheduleReconnect(key,stream,delay);return;
    }
    ws.__manual=false;state.sockets.set(key,ws);
    ws.onopen=()=>{
      state.reconnectDelay.set(key,1000);
      state.socketErrors.delete(key);
      if(key==='mark')clearError();
      statusTick();
    };
    ws.onmessage=ev=>{
      let payload;try{payload=JSON.parse(ev.data)}catch(err){state.lastPayloads.set(key,{parseError:String(err),sample:String(ev.data).slice(0,300)});return}
      // Combined streams wrap payload as {stream, data}; raw streams don't.
      if(payload&&payload.data!==undefined&&payload.stream)payload=payload.data;
      state.lastPayloads.set(key,payload);
      if(payload&&typeof payload==='object'&&payload.code!==undefined&&payload.msg){
        const message=`${key} Binance stream error ${payload.code}: ${payload.msg}`;state.socketErrors.set(key,message);state.error=message;showError(message);statusTick();return;
      }
      try{handleStream(key,payload)}catch(err){state.error=`${key}: ${err.message||err}`;state.socketErrors.set(key,state.error);showError(state.error)}
    };
    ws.onerror=()=>{
      // onclose performs the reconnect; do not create duplicate sockets here.
      state.socketErrors.set(key,'WebSocket transport error');
      if(key==='mark'&&!state.lastMarkTime)statusTick();
    };
    ws.onclose=event=>{
      if(state.sockets.get(key)===ws)state.sockets.delete(key);
      if(!ws.__manual&&event&&event.code!==1000)state.socketErrors.set(key,`closed ${event.code}: ${event.reason||'no reason'}`);
      if(state.active&&!ws.__manual)scheduleReconnect(key,stream,delay);
      statusTick();
    };
    // Rotate before Binance's 24-hour connection lifetime.
    if(key==='mark'&&!state.rotateTimer){
      state.rotateTimer=setTimeout(()=>{
        state.rotateTimer=null;if(state.active)connectStream('mark','xauusdt@optionMarkPrice');
      },23*60*60*1000+50*60*1000);
    }
  }
  function ensureExpiryStreams(expiries){
    // Subscribe to OI and 24h ticker for every expiry visible in the Mark Price feed,
    // not only the default first expiry (often today's 0D contract).
    const codes=[...new Set((expiries||[]).map(expiryParam))].filter(Boolean).sort();
    const wantedOI=new Set(codes.map(code=>'oi:'+code));
    const wantedTicker=new Set(codes.map(code=>'ticker:'+code));
    for(const key of [...state.sockets.keys()]){
      if(key.startsWith('oi:')&&!wantedOI.has(key)){closeSocket(key,true);}
      if(key.startsWith('ticker:')&&!wantedTicker.has(key)){closeSocket(key,true);}
    }
    codes.forEach(code=>{
      const oiKey='oi:'+code,tickerKey='ticker:'+code;
      if(!state.sockets.has(oiKey))connectStream(oiKey,`xauusdt@openInterest@${code}`);
      if(!state.sockets.has(tickerKey))connectStream(tickerKey,`xauusdt@optionTicker${code}`);
    });
    state.oiExpiryCodes=codes;
    ensureOIPolling(codes);
  }
  // Binance's OI WebSocket is documented at ~60s cadence. Fetch the public REST
  // snapshot immediately as a fallback so the dashboard does not wait for the
  // first push (or stay empty if a stream is connected but silent).
  function ensureOIPolling(codes){
    if(typeof fetch!=='function'){
      state.oiRestStatus='unavailable';
      state.oiRestLastError='Trình duyệt không hỗ trợ Fetch API.';
      return;
    }
    const signature=(codes||[]).join(',');
    if(!signature||signature===state.oiPollSignature)return;
    if(state.oiPollTimer){clearTimeout(state.oiPollTimer);state.oiPollTimer=null;}
    state.oiPollSignature=signature;
    state.oiRestByExpiry.clear();
    const generation=state.oiPollGeneration;
    state.oiRestStatus='loading';state.oiRestLastError='';
    state.oiPollTimer=setTimeout(()=>{
      state.oiPollTimer=null;
      pollOpenInterest(codes.slice(),signature,generation);
    },0);
  }
  async function fetchExpiryOI(code,generation){
    if(state.oiRestInFlight.get(code)===generation)return;
    state.oiRestInFlight.set(code,generation);
    try{
      const params=new URLSearchParams({underlyingAsset:UNDERLYING,expiration:code});
      const response=await fetch(`${OPTIONS_REST_BASE}/eapi/v1/openInterest?${params.toString()}`,{method:'GET',cache:'no-store',headers:{Accept:'application/json'}});
      if(!response||!response.ok)throw new Error(`HTTP ${response?.status??'network error'}`);
      const payload=await response.json();
      if(!state.active||generation!==state.oiPollGeneration)return;
      if(payload&&typeof payload==='object'&&!Array.isArray(payload)&&payload.code!==undefined&&payload.msg){
        throw new Error(`${payload.code}: ${payload.msg}`);
      }
      const items=records(payload);
      const applied=items.length?handleOI(items,'rest'):0;
      state.oiRestMessages++;
      state.oiRestLastUpdate=Date.now();
      state.oiRestByExpiry.set(code,{status:items.length?(applied?'live':'received'):'empty',updatedAt:Date.now(),error:''});
    }catch(error){
      if(!state.active||generation!==state.oiPollGeneration)return;
      const message=String(error?.message||error).slice(0,240);
      state.oiRestByExpiry.set(code,{status:'error',updatedAt:Date.now(),error:message});
    }finally{
      if(state.oiRestInFlight.get(code)===generation)state.oiRestInFlight.delete(code);
    }
  }
  async function pollOpenInterest(codes,signature,generation){
    await Promise.all(codes.map(code=>fetchExpiryOI(code,generation)));
    if(!state.active||generation!==state.oiPollGeneration||signature!==state.oiPollSignature)return;
    const results=codes.map(code=>state.oiRestByExpiry.get(code)).filter(Boolean);
    const hasData=results.some(x=>x.status==='live'||x.status==='received');
    const errors=results.filter(x=>x.status==='error');
    state.oiRestStatus=hasData?'live':errors.length===codes.length?'error':errors.length?'partial-error':'empty';
    state.oiRestLastError=errors.map(x=>x.error).filter(Boolean).join(' · ').slice(0,240);
    statusTick();scheduleRender();
    state.oiPollTimer=setTimeout(()=>{
      state.oiPollTimer=null;
      pollOpenInterest(codes,signature,generation);
    },OI_POLL_MS);
  }
  function handleStream(key,payload){
    if(key==='mark')handleMark(payload);
    else if(key==='index')handleIndex(payload);
    else if(key==='oi'||key.startsWith('oi:'))handleOI(payload);
    else if(key==='trade')handleTrade(payload);
    else if(key.startsWith('ticker:'))handleTicker(payload);
  }
  function records(payload){
    if(Array.isArray(payload))return payload;
    if(payload&&Array.isArray(payload.data))return payload.data;
    if(payload&&Array.isArray(payload.result))return payload.result;
    return payload&&typeof payload==='object'?[payload]:[];
  }
  function handleMark(payload){
    const items=records(payload);if(!items.length)return;
    let changed=false;
    items.forEach(raw=>{
      if(!raw||!raw.s)return;
      const symbol=String(raw.s).toUpperCase();if(!symbol.startsWith('XAU-'))return;
      const contract=parseSymbol(symbol);if(!contract)return;
      const mark={
        symbol,markPrice:ensureNumber(raw,['mp','markPrice','p']),
        markIV:ensureNumber(raw,['vo','markIV','iv']),bidIV:ensureNumber(raw,['b','bidIV']),askIV:ensureNumber(raw,['a','askIV']),
        delta:ensureNumber(raw,['d','delta']),gamma:ensureNumber(raw,['g','gamma']),vega:ensureNumber(raw,['v','vega']),theta:ensureNumber(raw,['t','theta']),riskFreeRate:ensureNumber(raw,['rf','riskFreeInterest']),
        indexPrice:ensureNumber(raw,['i','indexPrice']),bidPrice:ensureNumber(raw,['bo','bidPrice']),askPrice:ensureNumber(raw,['ao','askPrice']),
        eventTime:ensureNumber(raw,['E','eventTime'])||Date.now()
      };
      state.marks.set(symbol,mark);if(mark.riskFreeRate!==null&&mark.riskFreeRate>-1&&mark.riskFreeRate<1)state.riskFreeRate=mark.riskFreeRate;changed=true;
      const ix=mark.indexPrice;if(ix!==null&&ix>0){state.index=ix;state.lastIndexTime=Date.now()}
    });
    if(!changed)return;
    state.lastMarkTime=Date.now();state.markCount=state.marks.size;
    const oldExpiry=state.expiry;
    const contracts=[...state.marks.keys()].map(parseSymbol).filter(Boolean);
    contracts.sort((a,b)=>a.expiryDate-b.expiryDate||a.strikePrice-b.strikePrice||a.side.localeCompare(b.side));
    state.contracts=contracts;
    const expiries=[...new Set(contracts.map(c=>c.expiryDate))].sort((a,b)=>a-b);
    if(!expiries.includes(Number(state.expiry)))state.expiry=expiries[0]||null;
    renderExpiryOptions(expiries);
    if(state.expiry&&Number(state.expiry)!==Number(oldExpiry))state.expiryManual=false;
    ensureExpiryStreams(expiries);
    statusTick();scheduleRender();
  }
  function handleIndex(payload){
    records(payload).forEach(raw=>{
      if(!raw)return;
      const sym=String(raw.s||raw.symbol||raw.underlying||'').toUpperCase();
      if(sym&&sym!=='XAUUSDT'&&sym!=='XAU/USDT'&&sym!=='XAU')return;
      const value=ensureNumber(raw,['i','indexPrice','p','price']);if(value!==null&&value>0){state.index=value;state.lastIndexTime=Date.now()}
    });
    statusTick();scheduleRender();
  }
  function handleOI(payload,source='websocket'){
    const items=records(payload);if(!items.length)return 0;
    let received=0;
    items.forEach(raw=>{
      if(!raw)return;
      const symbol=String(raw.s||raw.symbol||'').toUpperCase();if(!symbol.startsWith('XAU-'))return;
      const qty=ensureNumber(raw,['o','sumOpenInterest','openInterest','oi']);
      const usd=ensureNumber(raw,['h','sumOpenInterestUsd','openInterestUsd','oiUsd']);
      if(qty!==null){
        const time=ensureNumber(raw,['E','timestamp','T'])||Date.now(),previous=state.oi.get(symbol);
        // Do not let a delayed REST snapshot overwrite a newer WebSocket update.
        if(!previous||time>=previous.time)state.oi.set(symbol,{qty,usd,time,source});
        received++;
      }
    });
    if(received){
      if(source==='websocket')state.oiMessages++;
      state.lastOIUpdate=Date.now();state.oiCount=state.oi.size;
      // If the initial default is today's expiry and it has no OI, select the
      // nearest expiry with a real non-zero OI snapshot until the user chooses manually.
      if(!state.expiryManual){
        const currentHasOI=activeExpiryContracts().some(c=>(state.oi.get(c.symbol)?.qty||0)>0);
        if(!currentHasOI){
          const candidates=[...new Set(state.contracts.map(c=>c.expiryDate))].sort((a,b)=>a-b);
          const withOI=candidates.find(exp=>state.contracts.some(c=>c.expiryDate===exp&&(state.oi.get(c.symbol)?.qty||0)>0));
          if(withOI){state.expiry=withOI;renderExpiryOptions(candidates);}
        }
      }
      statusTick();scheduleRender();
    }
    return received;
  }
  function handleTicker(payload){
    const items=records(payload);if(!items.length)return;
    let received=0;
    items.forEach(raw=>{
      if(!raw)return;
      const symbol=String(raw.s||raw.symbol||'').toUpperCase();if(!symbol.startsWith('XAU-'))return;
      state.tickers.set(symbol,{
        lastPrice:ensureNumber(raw,['c','lastPrice','price']),
        volume:ensureNumber(raw,['v','volume']),
        quoteVolume:ensureNumber(raw,['q','quoteVolume']),
        trades:ensureNumber(raw,['n','count','tradeCount']),
        changePct:ensureNumber(raw,['P','priceChangePercent']),
        high:ensureNumber(raw,['h','highPrice']),low:ensureNumber(raw,['l','lowPrice']),
        openTime:ensureNumber(raw,['O','openTime']),closeTime:ensureNumber(raw,['C','closeTime']),
        time:ensureNumber(raw,['E','eventTime'])||Date.now()
      });received++;
    });
    if(received){state.tickerMessages++;state.lastTickerUpdate=Date.now();state.tickerCount=state.tickers.size;statusTick();scheduleRender();}
  }
  function handleTrade(payload){
    records(payload).forEach(raw=>{
      if(!raw)return;
      const symbol=String(raw.s||raw.symbol||'').toUpperCase();if(!symbol.startsWith('XAU-'))return;
      const contract=parseSymbol(symbol);if(!contract)return;
      const buyerMaker=raw.m===true||raw.m==='true';
      const price=ensureNumber(raw,['p','price']),qty=ensureNumber(raw,['q','qty','quantity']);
      const direction=String(raw.S||raw.side||'').toUpperCase();
      const side=direction==='BUY'?'BUY':direction==='SELL'?'SELL':buyerMaker?'SELL':'BUY';
      const trade={symbol,side,price,qty,type:String(raw.X||raw.type||'MARKET').toUpperCase(),time:ensureNumber(raw,['T','E','tradeTime','timestamp'])||Date.now(),id:raw.t||raw.id||''};
      state.trades.unshift(trade);if(state.trades.length>40)state.trades.length=40;
    });
    if(state.trades.length){state.tradeMessages++;state.lastTradeTime=Date.now();scheduleRender();statusTick()}
  }
  function renderExpiryOptions(expiries){
    const el=$o('optExpiry');if(!el)return;
    const value=String(state.expiry||'');
    el.innerHTML=expiries.length?expiries.map(ts=>`<option value="${ts}" ${String(ts)===value?'selected':''}>${esc(dateLabel(ts))} · ${Math.max(0,Math.ceil((ts-Date.now())/86400000))}D</option>`).join(''):'<option value="">Đang chờ hợp đồng XAU…</option>';
    el.value=value;
  }
  function selectedContracts(){return activeExpiryContracts()}
  function makeRows(){
    const map=new Map(),spot=state.index,T=timeToExpiryYears();
    selectedContracts().forEach(c=>{
      const strike=c.strikePrice;if(!Number.isFinite(strike))return;
      const side=c.side==='CALL'?'call':'put',right=c.side==='CALL'?'C':'P',m=state.marks.get(c.symbol)||{},oi=state.oi.get(c.symbol)||{};
      const item={contract:c,mark:m,oi:n(oi.qty),oiUsd:n(oi.usd),delta:n(m.delta),gamma:n(m.gamma),vega:n(m.vega),theta:n(m.theta),iv:n(m.markIV),bidIV:n(m.bidIV),askIV:n(m.askIV),price:n(m.markPrice)};
      item.model=spot&&T&&item.iv!=null?bsGreeks(right,spot,strike,T,item.iv,state.riskFreeRate,0):null;
      if(!map.has(strike))map.set(strike,{strike,call:null,put:null});
      map.get(strike)[side]=item;
    });
    return [...map.values()].sort((a,b)=>a.strike-b.strike);
  }
  function aggregate(rows){
    const sign=state.mode==='short'?-1:1,spot=state.index;
    const sum={callOI:0,putOI:0,delta:0,gamma:0,gex:0,vega:0,theta:0,vanna:0,charm:0,hasOI:false};
    rows.forEach(r=>['call','put'].forEach(k=>{
      const x=r[k];if(!x||x.oi==null)return;sum.hasOI=true;
      if(k==='call')sum.callOI+=x.oi;else sum.putOI+=x.oi;
      const oi=x.oi;
      if(x.delta!=null&&spot!=null)sum.delta+=sign*x.delta*oi*spot;
      if(x.gamma!=null&&spot!=null){const g=sign*x.gamma*oi*spot*spot*.01;sum.gamma+=sign*x.gamma*oi;sum.gex+=g;x.gex=g}
      if(x.vega!=null)sum.vega+=sign*x.vega*oi;
      if(x.theta!=null)sum.theta+=sign*x.theta*oi;
      if(x.model){sum.vanna+=sign*x.model.vanna*oi;sum.charm+=sign*x.model.charm*oi;}
    }));
    sum.pc=sum.callOI>0?sum.putOI/sum.callOI:null;return sum;
  }
  function maxPain(rows){
    const strikes=rows.map(r=>r.strike);if(!strikes.length)return null;
    let best=null;strikes.forEach(price=>{let payout=0;rows.forEach(r=>{
      if(r.call&&r.call.oi!=null)payout+=Math.max(0,price-r.strike)*r.call.oi;
      if(r.put&&r.put.oi!=null)payout+=Math.max(0,r.strike-price)*r.put.oi;
    });if(best==null||payout<best.payout)best={strike:price,payout}});return best;
  }
  function metric(label,value,sub,cls=''){return `<div class="opt-metric"><span>${label}</span><strong class="${cls}">${value}</strong><small>${sub||''}</small></div>`}
  function greekCell(x,key,d=4){return x&&x[key]!=null?fmt(x[key],d):'—'}
  function render(){
    const root=$o('optMetrics');if(!root)return;
    const rows=makeRows(),a=aggregate(rows),pain=a.hasOI?maxPain(rows):null,spot=state.index;
    const atm=rows.reduce((best,r)=>{const dist=Math.abs(r.strike-(spot??r.strike));return !best||dist<best.dist?{r,dist}:best},null);
    const atmValues=atm?[atm.r.call&&atm.r.call.iv,atm.r.put&&atm.r.put.iv].filter(x=>x!=null):[];
    const atmIV=atmValues.length?atmValues.reduce((s,x)=>s+x/atmValues.length,0):null;
    root.innerHTML=[
      metric('XAU INDEX',spot==null?'—':'$'+fmt(spot,2),'Binance underlying index'),
      metric('ATM IMPLIED VOL',atmIV==null?'—':fmt(atmIV*100,2)+'%','Mark IV · nearest strike'),
      metric('CALL OPEN INTEREST',a.hasOI?compact(a.callOI):'—',a.hasOI?'Selected expiry':'Waiting for Binance OI update'),
      metric('PUT OPEN INTEREST',a.hasOI?compact(a.putOI):'—',a.hasOI?'Selected expiry':'Waiting for Binance OI update'),
      metric('PUT / CALL',a.pc==null?'—':fmt(a.pc,3),'OI ratio'),
      metric('MAX PAIN',pain?'$'+fmt(pain.strike,2):'—','OI-weighted expiry estimate')
    ].join('');
    renderLevels(rows,a);renderExposure(rows,a);renderGreeks(a);renderOIChart(rows);renderThetaChart(rows);renderChain(rows,spot);renderFlow();renderMeta(rows,a);scheduleSurfaceRender();
  }
  const METRIC_INFO={
    gamma:{short:'GEX',title:'Gamma Exposure by Strike',unit:'USDT / 1% XAU move',wall:'Gamma Wall'},
    delta:{short:'DEX',title:'Delta Exposure by Strike',unit:'USDT notional',wall:'Delta Wall'},
    vanna:{short:'VEX',title:'Vanna Exposure by Strike',unit:'Model units · Vanna × OI',wall:'Vanna Wall'},
    vega:{short:'VGEX',title:'Vega Exposure by Strike',unit:'Binance native units',wall:'Vega Wall'},
    charm:{short:'CHEX',title:'Charm Exposure by Strike',unit:'Model units · Charm × OI',wall:'Charm Wall'},
    theta:{short:'THEX',title:'Theta Exposure by Strike',unit:'Binance native units',wall:'Theta Wall'}
  };
  function optionExposure(x,metric,spot){
    if(!x||x.oi==null)return 0;
    const oi=x.oi;
    if(metric==='gamma')return x.gamma==null||spot==null?0:x.gamma*oi*spot*spot*.01;
    if(metric==='delta')return x.delta==null||spot==null?0:x.delta*oi*spot;
    if(metric==='vega')return x.vega==null?0:x.vega*oi;
    if(metric==='theta')return x.theta==null?0:x.theta*oi;
    if(metric==='vanna')return x.model?x.model.vanna*oi:0;
    if(metric==='charm')return x.model?x.model.charm*oi:0;
    return 0;
  }
  function strikeMetrics(rows,metric='gamma'){
    const sign=state.mode==='short'?-1:1,spot=state.index;
    return rows.map(r=>{
      const call=sign*optionExposure(r.call,metric,spot),put=sign*optionExposure(r.put,metric,spot);
      return {strike:r.strike,call,put,value:call+put};
    });
  }
  function gammaFlip(series){
    let cumulative=0,prev=null;
    for(const x of series.slice().sort((a,b)=>a.strike-b.strike)){
      const next=cumulative+x.value;
      if(prev&&prev.c!==0&&next!==0&&Math.sign(prev.c)!==Math.sign(next)){
        const ratio=Math.abs(prev.c)/(Math.abs(prev.c)+Math.abs(next));
        return prev.strike+(x.strike-prev.strike)*ratio;
      }
      cumulative=next;prev={strike:x.strike,c:next};
    }
    return null;
  }
  function renderLevels(rows,a){
    const el=$o('optLevels');if(!el)return;
    if(!a.hasOI){el.innerHTML='<div class="opt-empty">Đang chờ bản tin Open Interest đầu tiên từ Binance.</div>';return;}
    const g= strikeMetrics(rows,'gamma'),selected=strikeMetrics(rows,state.exposureMetric);
    const callWall=g.reduce((best,x)=>Math.abs(x.call)>Math.abs(best.value)?{strike:x.strike,value:x.call}:best,{value:0,strike:null});
    const putWall=g.reduce((best,x)=>Math.abs(x.put)>Math.abs(best.value)?{strike:x.strike,value:x.put}:best,{value:0,strike:null});
    const metricWall=selected.reduce((best,x)=>Math.abs(x.value)>Math.abs(best.value)?x:best,{value:0,strike:null});
    let oiWall={qty:0,strike:null,side:'—'};
    rows.forEach(r=>['call','put'].forEach(side=>{const oi=r[side]?.oi;if(oi!=null&&oi>oiWall.qty)oiWall={qty:oi,strike:r.strike,side:side==='call'?'CALL':'PUT'};}));
    const net=selected.reduce((sum,x)=>sum+x.value,0),flip=gammaFlip(g),lab=METRIC_INFO[state.exposureMetric]||METRIC_INFO.gamma;
    const card=(label,value,sub,cls='')=>`<div class="opt-level ${cls}"><span>${label}</span><b>${value}</b><small>${sub||''}</small></div>`;
    el.innerHTML=[
      card('CALL WALL',callWall.strike!=null?'$'+fmt(callWall.strike,2):'—',callWall.strike!=null?compact(callWall.value)+' Call GEX · max |exposure|':'Chưa có Call OI','positive'),
      card('PUT WALL',putWall.strike!=null?'$'+fmt(putWall.strike,2):'—',putWall.strike!=null?compact(putWall.value)+' Put GEX · max |exposure|':'Chưa có Put OI','negative'),
      card('GAMMA FLIP',flip==null?'—':'$'+fmt(flip,2),flip==null?'Không có điểm đổi dấu cumulative GEX':'Cumulative GEX = 0','accent'),
      card(lab.wall.toUpperCase(),metricWall.strike==null?'—':'$'+fmt(metricWall.strike,2),metricWall.strike==null?'No level':compact(metricWall.value)+' '+lab.short,'accent'),
      card('OI WALL',oiWall.strike==null?'—':'$'+fmt(oiWall.strike,2),oiWall.strike==null?'Chưa có OI':oiWall.side+' · '+compact(oiWall.qty)+' contracts'),
      card('NET '+lab.short,(net>=0?'+':'')+compact(net),'Tổng '+lab.short+' tất cả strike',net>=0?'positive':'negative')
    ].join('');
  }
  function renderExposure(rows,a){
    const el=$o('optExposure');if(!el)return;
    const metricKey=state.exposureMetric,info=METRIC_INFO[metricKey]||METRIC_INFO.gamma;
    const title=$o('optExposureTitle'),units=$o('optExposureUnits');if(title)title.textContent=info.title;if(units)units.textContent=info.unit;
    if(!a.hasOI||(metricKey!=='vanna'&&metricKey!=='charm'&&state.index==null)){
      const oiFresh=state.lastOIUpdate&&Date.now()-state.lastOIUpdate<150000;
      el.innerHTML=`<div class="opt-empty">${!a.hasOI?(oiFresh?'Đang đợi dữ liệu OI đồng bộ…':'Đang chờ Open Interest.'):'Đang chờ Underlying Index.'} Exposure sẽ tự tính khi đủ dữ liệu.</div>`;return;
    }
    const series=strikeMetrics(rows,metricKey),max=Math.max(1e-9,...series.map(x=>Math.abs(x.value)));
    el.innerHTML=series.map(x=>{const width=Math.max(.3,Math.abs(x.value)/max*100),negative=x.value<0;return `<div class="opt-gex-row" title="Strike ${fmt(x.strike,2)} · Call ${fmt(x.call,4)} · Put ${fmt(x.put,4)} · Net ${fmt(x.value,4)}"><span class="opt-gex-strike">${fmt(x.strike,0)}</span><div class="opt-gex-track"><i class="${negative?'neg':'pos'}" style="width:${width}%"></i></div><b class="${negative?'neg-t':'pos-t'}">${compact(x.value)}</b></div>`}).join('')||'<div class="opt-empty">Không có strike trong kỳ hạn đã chọn.</div>';
  }
  function svgChartFrame(width,height,body){return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Options chart" preserveAspectRatio="xMidYMid meet">${body}</svg>`;}
  function renderOIChart(rows){
    const el=$o('optOIChart');if(!el)return;
    const points=rows.filter(r=>r.call?.oi!=null||r.put?.oi!=null);
    if(!points.length){el.innerHTML='<div class="opt-empty">Binance chưa gửi OI cho expiry này. OI cập nhật theo chu kỳ khoảng 60 giây.</div>';return;}
    const W=Math.max(320,el.clientWidth||560),H=260,ml=48,mr=12,mt=20,mb=32,pw=W-ml-mr,ph=H-mt-mb;
    const max=Math.max(1,...points.flatMap(r=>[r.call?.oi||0,r.put?.oi||0])),top=max*1.12;
    let wall={qty:0,strike:null,side:''};
    points.forEach(r=>{[['call','CALL'],['put','PUT']].forEach(([key,side])=>{const qty=r[key]?.oi||0;if(qty>wall.qty)wall={qty,strike:r.strike,side};});});
    const wallEl=$o('optOIWall');if(wallEl)wallEl.textContent=wall.strike==null?'OI Wall: —':`OI Wall: $${fmt(wall.strike,2)} · ${wall.side} ${compact(wall.qty)}`;
    const xStep=pw/Math.max(1,points.length),barW=Math.max(2,Math.min(16,xStep*.34));
    const X=i=>ml+(i+.5)*xStep,Y=v=>mt+ph-v/top*ph;
    let g='';
    for(let i=0;i<=4;i++){const v=top*i/4,y=Y(v);g+=`<line x1="${ml}" x2="${W-mr}" y1="${y}" y2="${y}" class="opt-svg-grid"/><text x="${ml-7}" y="${y+3}" text-anchor="end">${esc(compact(v))}</text>`;}
    const stride=Math.max(1,Math.ceil(points.length/9));
    points.forEach((r,i)=>{
      const x=X(i),c=r.call?.oi||0,p=r.put?.oi||0;
      const callWall=wall.strike===r.strike&&wall.side==='CALL',putWall=wall.strike===r.strike&&wall.side==='PUT';
      g+=`<rect x="${x-barW-1}" y="${Y(c)}" width="${barW}" height="${Math.max(0,mt+ph-Y(c))}" rx="2" class="opt-svg-call"${callWall?' stroke="currentColor" stroke-width="1.5"':''}><title>${fmt(r.strike,2)} · Call OI ${fmt(c,2)}</title></rect>`;
      g+=`<rect x="${x+1}" y="${Y(p)}" width="${barW}" height="${Math.max(0,mt+ph-Y(p))}" rx="2" class="opt-svg-put"${putWall?' stroke="currentColor" stroke-width="1.5"':''}><title>${fmt(r.strike,2)} · Put OI ${fmt(p,2)}</title></rect>`;
      if(i%stride===0||i===points.length-1)g+=`<text x="${x}" y="${H-9}" text-anchor="middle">${fmt(r.strike,0)}</text>`;
    });
    el.innerHTML=svgChartFrame(W,H,g);
  }
  function renderThetaChart(rows){
    const el=$o('optThetaChart');if(!el)return;
    const points=rows.filter(r=>r.call?.theta!=null||r.put?.theta!=null);
    if(!points.length){el.innerHTML='<div class="opt-empty">Đang chờ Mark Greeks từ Binance.</div>';return;}
    const sign=state.mode==='short'?-1:1,W=Math.max(320,el.clientWidth||560),H=260,ml=48,mr=12,mt=20,mb=32,pw=W-ml-mr,ph=H-mt-mb;
    const values=points.flatMap(r=>[sign*(r.call?.theta||0)*(r.call?.oi||0),sign*(r.put?.theta||0)*(r.put?.oi||0)]);
    let wall={abs:0,strike:null,side:'',value:0};
    points.forEach(r=>[['call','CALL'],['put','PUT']].forEach(([key,side])=>{const value=sign*(r[key]?.theta||0)*(r[key]?.oi||0);if(Math.abs(value)>wall.abs)wall={abs:Math.abs(value),strike:r.strike,side,value};}));
    const wallEl=$o('optThetaWall');if(wallEl)wallEl.textContent=wall.strike==null?'Max |Theta|: —':`Max |Theta|: $${fmt(wall.strike,2)} · ${wall.side} ${compact(wall.value)}`;
    let lo=Math.min(0,...values),hi=Math.max(0,...values);if(lo===hi){lo=-1;hi=1;}
    const pad=(hi-lo)*.08;lo-=pad;hi+=pad;
    const Y=v=>mt+(hi-v)/(hi-lo)*ph,Y0=Y(0),xStep=pw/Math.max(1,points.length),barW=Math.max(2,Math.min(16,xStep*.34));
    let g='';
    for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,y=Y(v);g+=`<line x1="${ml}" x2="${W-mr}" y1="${y}" y2="${y}" class="opt-svg-grid"/><text x="${ml-7}" y="${y+3}" text-anchor="end">${esc(compact(v))}</text>`;}
    const stride=Math.max(1,Math.ceil(points.length/9));
    points.forEach((r,i)=>{
      const x=ml+(i+.5)*xStep,c=sign*(r.call?.theta||0)*(r.call?.oi||0),p=sign*(r.put?.theta||0)*(r.put?.oi||0);
      const callWall=wall.strike===r.strike&&wall.side==='CALL',putWall=wall.strike===r.strike&&wall.side==='PUT';
      g+=`<rect x="${x-barW-1}" y="${Math.min(Y(c),Y0)}" width="${barW}" height="${Math.max(1,Math.abs(Y(c)-Y0))}" rx="2" class="opt-svg-call"${callWall?' stroke="currentColor" stroke-width="1.5"':''}><title>${fmt(r.strike,2)} · Call Theta × OI ${fmt(c,5)}</title></rect>`;
      g+=`<rect x="${x+1}" y="${Math.min(Y(p),Y0)}" width="${barW}" height="${Math.max(1,Math.abs(Y(p)-Y0))}" rx="2" class="opt-svg-put"${putWall?' stroke="currentColor" stroke-width="1.5"':''}><title>${fmt(r.strike,2)} · Put Theta × OI ${fmt(p,5)}</title></rect>`;
      if(i%stride===0||i===points.length-1)g+=`<text x="${x}" y="${H-9}" text-anchor="middle">${fmt(r.strike,0)}</text>`;
    });
    g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y0}" y2="${Y0}" class="opt-svg-zero"/>`;
    el.innerHTML=svgChartFrame(W,H,g);
  }
  // Interactive 3D projections adapted to the data available in Binance's live option stream.
  function makeSurfaceRenderer(containerId,resetId){
    const root=$o(containerId),reset=$o(resetId);
    if(!root||typeof THREE==='undefined'||!window.WebGLRenderingContext)return null;
    let renderer,scene,camera,mesh=null,grid=null;
    try{
      root.innerHTML='';renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
      renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.setClearColor(0x101722);
      root.appendChild(renderer.domElement);
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,.1,100);
      scene.add(new THREE.AmbientLight(0xffffff,.72));const light=new THREE.DirectionalLight(0xffffff,.72);light.position.set(-2,4,3);scene.add(light);
    }catch(err){root.innerHTML='<div class="opt-empty">Không khởi tạo được WebGL trên trình duyệt này.</div>';return null;}
    const view={az:.62,el:.55,r:4.8,w:0,h:0,points:new Map(),drag:null,pinch:0};
    const draw=()=>{
      const w=root.clientWidth||480,h=root.clientHeight||300;if(!w||!h)return;
      if(view.w!==w||view.h!==h){view.w=w;view.h=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
      camera.position.set(view.r*Math.sin(view.az)*Math.cos(view.el),view.r*Math.sin(view.el)+.08,view.r*Math.cos(view.az)*Math.cos(view.el));camera.lookAt(0,.05,0);renderer.render(scene,camera);
    };
    const clear=()=>{if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();mesh=null;}if(grid){scene.remove(grid);grid.geometry.dispose();grid.material.dispose();grid=null;}};
    const set=(D,range)=>{
      clear();if(!D||D.ks.length<2||D.ts.length<2)return;
      const nx=D.ks.length,nz=D.ts.length,lo=range.lo,hi=range.hi,span=(hi-lo)||1;
      const pos=new Float32Array(nx*nz*3),colors=new Float32Array(nx*nz*3),indices=[];
      const maxAbs=Math.max(Math.abs(lo),Math.abs(hi),1e-12);
      const colorFor=v=>{
        const t=Math.min(1,Math.abs(v)/maxAbs),base=v>=0?[.18,.79,.64]:[.92,.39,.44];
        return [.10+base[0]*t,.12+base[1]*t,.17+base[2]*t];
      };
      for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
        const idx=j*nx+i,v=Number(D.Z[j][i])||0,x=-1.55+3.1*i/(nx-1),z=-1+2*j/(nz-1),y=-.85+1.7*(v-lo)/span,c=colorFor(v);
        pos.set([x,y,z],idx*3);colors.set(c,idx*3);
        if(i<nx-1&&j<nz-1)indices.push(idx,idx+nx,idx+1,idx+1,idx+nx,idx+nx+1);
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
      mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));scene.add(mesh);
      const axisPts=[];for(let i=0;i<=4;i++){const x=-1.55+3.1*i/4,z=-1+2*i/4;axisPts.push(x,-.86,-1,x,-.86,1,-1.55,-.86,z,1.55,-.86,z);}
      const axisGeo=new THREE.BufferGeometry();axisGeo.setAttribute('position',new THREE.Float32BufferAttribute(axisPts,3));grid=new THREE.LineSegments(axisGeo,new THREE.LineBasicMaterial({color:0x667085,transparent:true,opacity:.42}));scene.add(grid);draw();
    };
    const resetView=()=>{view.az=.62;view.el=.55;view.r=4.8;draw();};
    if(reset)reset.addEventListener('click',resetView);
    root.addEventListener('pointerdown',e=>{root.setPointerCapture?.(e.pointerId);view.points.set(e.pointerId,[e.clientX,e.clientY]);view.drag=[e.clientX,e.clientY,view.az,view.el];view.pinch=view.points.size===2?pointDistance():0;root.classList.add('is-dragging');});
    const pointDistance=()=>{const a=[...view.points.values()];return a.length>1?Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]):0;};
    root.addEventListener('pointermove',e=>{
      if(!view.points.has(e.pointerId))return;const old=view.points.get(e.pointerId);view.points.set(e.pointerId,[e.clientX,e.clientY]);
      if(view.points.size===1&&view.drag){view.az=view.drag[2]-(e.clientX-view.drag[0])*.008;view.el=Math.max(.08,Math.min(1.48,view.drag[3]+(e.clientY-view.drag[1])*.008));}
      else if(view.points.size===2){const d=pointDistance();if(view.pinch&&d)view.r=Math.max(1.8,Math.min(9,view.r*view.pinch/d));view.pinch=d;}
      draw();
    });
    const end=e=>{view.points.delete(e.pointerId);if(!view.points.size){view.drag=null;view.pinch=0;root.classList.remove('is-dragging');}};
    root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);
    root.addEventListener('wheel',e=>{e.preventDefault();view.r=Math.max(1.8,Math.min(9,view.r*(e.deltaY>0?1.1:.9)));draw();},{passive:false});
    if(window.ResizeObserver)new ResizeObserver(draw).observe(root);
    return {set,clear,draw,reset:resetView};
  }
  const median=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:1;};
  function selectedOptionRecords(){
    const out=[];
    selectedContracts().forEach(c=>{
      const m=state.marks.get(c.symbol)||{},o=state.oi.get(c.symbol)||{};
      out.push({contract:c,side:c.side==='CALL'?'C':'P',strike:c.strikePrice,oi:n(o.qty),iv:n(m.markIV),delta:n(m.delta),gamma:n(m.gamma),vega:n(m.vega),theta:n(m.theta)});
    });
    return out;
  }
  function surfaceCalibration(records,metric,spot,T,rate,q){
    const factors={C:1,P:1};
    if(!['delta','gamma','vega','theta'].includes(metric))return factors;
    ['C','P'].forEach(side=>{
      const ratios=records.filter(r=>r.side===side&&r.iv>0&&r[metric]!=null).map(r=>{
        const raw=bsGreeks(side,spot,r.strike,T,r.iv,rate,q)[metric];return Math.abs(raw)>1e-12?r[metric]/raw:NaN;
      });
      const m=median(ratios);if(Number.isFinite(m)&&Math.abs(m)>1e-12)factors[side]=m;
    });
    return factors;
  }
  function buildSurfaceData(metric,isGreek=false,side='C'){
    const records=selectedOptionRecords().filter(r=>r.iv>0),scenario=surfaceParams();
    if(!scenario||records.length<2||(!isGreek&&!records.some(r=>r.oi>0)))return null;
    const {S:spot,T,rate,q}=scenario,ts=Array.from({length:30},(_,i)=>T*(1-.97*i/29));
    const allStrikes=[...new Set(records.filter(r=>!isGreek||r.side===side).map(r=>r.strike))].sort((a,b)=>a-b);
    if(allStrikes.length<2)return null;
    const baseSpot=state.index,baseT=timeToExpiryYears(),baseRate=Number.isFinite(state.riskFreeRate)?state.riskFreeRate:.04;
    const factors=baseSpot&&baseT?surfaceCalibration(records,metric,baseSpot,baseT,baseRate,0):{C:1,P:1},Z=ts.map(t=>new Float64Array(allStrikes.length));
    records.forEach(r=>{
      if(isGreek&&r.side!==side)return;
      const k=allStrikes.indexOf(r.strike);if(k<0)return;
      const current=bsGreeks(r.side,spot,r.strike,T,r.iv,rate,q),factor=factors[r.side]||1;
      for(let j=0;j<ts.length;j++){
        const val=bsGreeks(r.side,spot,r.strike,ts[j],r.iv,rate,q)[metric]*factor;
        if(isGreek)Z[j][k]=val;
        else if(r.oi!=null){
          let contribution=val*r.oi;
          if(metric==='delta')contribution*=spot;
          if(metric==='gamma')contribution*=spot*spot*.01;
          Z[j][k]+=contribution*(state.mode==='short'?-1:1);
        }
      }
    });
    let lo=Infinity,hi=-Infinity;Z.forEach(row=>row.forEach(v=>{lo=Math.min(lo,v);hi=Math.max(hi,v);}));
    if(!Number.isFinite(lo)||!Number.isFinite(hi))return null;
    if(lo===hi){const e=Math.abs(lo)*.1||1;lo-=e;hi+=e;}
    return {ks:allStrikes,ts,Z,lo,hi,spot,T,rate,q,records};
  }
  function drawSurface(which){
    const isGreek=which==='greek',metric=isGreek?state.greekMetric:state.surfaceMetric,side=state.greekSide;
    const id=isGreek?'optGreekSurface':'optSurface',noteId=isGreek?'optGreekSurfaceNote':'optSurfaceNote',root=$o(id),note=$o(noteId);
    if(!root)return;
    const rendererKey=isGreek?'greek':'exposure';
    if(typeof THREE==='undefined'||!window.WebGLRenderingContext){root.innerHTML='<div class="opt-empty">WebGL / Three.js không khả dụng trong trình duyệt này.</div>';return;}
    if(!state.surfaceRenderers[rendererKey])state.surfaceRenderers[rendererKey]=makeSurfaceRenderer(id,isGreek?'optGreekReset':'optSurfaceReset');
    const renderer=state.surfaceRenderers[rendererKey];if(!renderer)return;
    const D=buildSurfaceData(metric,isGreek,side);
    if(!D){renderer.clear();const minEl=$o(isGreek?'optGreekSurfaceMin':'optSurfaceMin'),maxEl=$o(isGreek?'optGreekSurfaceMax':'optSurfaceMax');if(minEl)minEl.textContent='—';if(maxEl)maxEl.textContent='—';if(note)note.textContent='Cần ít nhất hai strike có Mark IV và Spot hợp lệ để dựng surface.';return;}
    renderer.set(D,{lo:D.lo,hi:D.hi});
    const dd=t=>`${Math.max(0,t*365).toFixed(2)} ngày`,minEl=$o(isGreek?'optGreekSurfaceMin':'optSurfaceMin'),maxEl=$o(isGreek?'optGreekSurfaceMax':'optSurfaceMax');
    if(minEl)minEl.textContent=fmt(D.lo,4);if(maxEl)maxEl.textContent=fmt(D.hi,4);
    if(note){
      const metricName=metric.toUpperCase(),params=`S ${fmt(D.spot,2)} · DTE ${(D.T*365).toFixed(2)} · r ${(D.rate*100).toFixed(2)}% · q ${(D.q*100).toFixed(2)}%`;
      note.textContent=isGreek
        ?`${metricName} / ${side==='C'?'Call':'Put'} per contract · ${dd(D.ts[0])} → ${dd(D.ts[D.ts.length-1])} · ${params} · Mark IV cố định; Delta/Gamma/Vega/Theta được hiệu chỉnh theo Greeks Binance tại điều kiện live.`
        :`Net ${metricName} by strike × time to expiry · ${dd(D.ts[0])} → ${dd(D.ts[D.ts.length-1])} · ${params} · OI và Mark IV giữ nguyên; scenario ${state.mode.toUpperCase()}. Vanna/Charm là mô hình.`;
    }
  }
  function scheduleSurfaceRender(){
    if(state.surfaceRenderTimer)return;
    state.surfaceRenderTimer=setTimeout(()=>{state.surfaceRenderTimer=null;if(!state.active)return;drawSurface('exposure');drawSurface('greek');},900);
  }
  function renderGreeks(a){
    const el=$o('optGreeks');if(!el)return;
    if(!a.hasOI){
      const oiWs=currentOISocket(),connected=oiWs&&oiWs.readyState===WebSocket.OPEN;
      const restMessage=(state.oiRestStatus==='error'||state.oiRestStatus==='partial-error')?`REST snapshot lỗi: ${esc(state.oiRestLastError)}.`:state.oiRestStatus==='empty'?'REST snapshot không có OI cho expiry này.':state.oiRestStatus==='loading'?'Đang lấy REST snapshot ngay khi mở expiry…':'REST snapshot sẽ tự thử lại mỗi 60 giây.';
      el.innerHTML=`<div class="opt-empty">${connected?'OI WebSocket đã kết nối.':'Đang chờ OI WebSocket.'} ${restMessage} Greeks từng hợp đồng vẫn có trong Option Chain.</div>`;return;
    }
    el.innerHTML=`<div class="opt-greek-line"><span>Delta Notional</span><b>${fmt(a.delta,2)} USDT</b></div>
      <div class="opt-greek-line"><span>Gamma Exposure · 1% move</span><b>${fmt(a.gex,2)} USDT</b></div>
      <div class="opt-greek-line"><span>Aggregate Gamma</span><b>${fmt(a.gamma,6)}</b></div>
      <div class="opt-greek-line"><span>Vega · Binance native units</span><b>${fmt(a.vega,2)}</b></div>
      <div class="opt-greek-line"><span>Theta · Binance native units</span><b>${fmt(a.theta,2)}</b></div>
      <div class="opt-greek-line"><span>Vanna · model estimate</span><b>${fmt(a.vanna,4)}</b></div>
      <div class="opt-greek-line"><span>Charm · model estimate</span><b>${fmt(a.charm,4)}</b></div>
      <p class="opt-footnote">Tổng hợp Greeks × OI × contract unit. Dấu +/- là kịch bản Long/Short, không phải vị thế dealer quan sát được.</p>`;
  }
  function renderChain(rows,spot){
    const body=$o('optChainBody');if(!body)return;
    body.innerHTML=rows.map(r=>{const atm=spot!=null&&Math.abs(r.strike-spot)<=Math.max(1,spot*.0015);return `<tr class="${atm?'atm':''}">
      <td class="strike">${fmt(r.strike,2)}${atm?'<small>ATM</small>':''}</td>
      <td>${greekCell(r.call,'price',3)}</td><td>${r.call&&r.call.oi!=null?compact(r.call.oi):'—'}</td><td>${greekCell(r.call,'delta',4)}</td><td>${greekCell(r.call,'gamma',6)}</td><td>${greekCell(r.call,'vega',3)}</td><td>${greekCell(r.call,'theta',3)}</td><td>${r.call&&r.call.iv!=null?fmt(r.call.iv*100,2)+'%':'—'}</td>
      <td>${greekCell(r.put,'price',3)}</td><td>${r.put&&r.put.oi!=null?compact(r.put.oi):'—'}</td><td>${greekCell(r.put,'delta',4)}</td><td>${greekCell(r.put,'gamma',6)}</td><td>${greekCell(r.put,'vega',3)}</td><td>${greekCell(r.put,'theta',3)}</td><td>${r.put&&r.put.iv!=null?fmt(r.put.iv*100,2)+'%':'—'}</td></tr>`}).join('')||'<tr><td colspan="15" class="opt-empty">Đang chờ dữ liệu Mark Price của Binance…</td></tr>';
  }
  function renderFlow(){
    const el=$o('optFlowBody');if(!el)return;
    const contracts=selectedContracts();
    const selectedSymbols=new Set(contracts.map(c=>c.symbol));
    const tickerRows=[...state.tickers.entries()].filter(([symbol])=>selectedSymbols.has(symbol)).map(([symbol,t])=>({symbol,...t})).sort((a,b)=>(b.quoteVolume||0)-(a.quoteVolume||0));
    const tickerHTML=tickerRows.length?`<div class="opt-flow-summary"><div class="opt-flow-summary-title">24H CONTRACT ACTIVITY <small>Aggregated ticker data · not a live trade tape</small></div>${tickerRows.slice(0,16).map(t=>`<div class="opt-flow-row opt-ticker-row"><span class="${t.symbol.endsWith('-C')?'pos-t':'neg-t'}">${t.symbol.endsWith('-C')?'CALL':'PUT'}</span><b>${esc(t.symbol)}</b><span>$${fmt(t.lastPrice,4)}</span><span>${fmt(t.volume,2)} ct</span><small>${compact(t.trades)} trades</small><time>$${compact(t.quoteVolume)}</time></div>`).join('')}</div>`:'';
    if(state.trades.length){
      el.innerHTML=tickerHTML+`<div class="opt-flow-summary-title">LIVE TRADE PRINTS <small>New executions received after subscription</small></div>`+state.trades.slice(0,20).map(t=>`<div class="opt-flow-row"><span class="${t.side==='BUY'?'pos-t':'neg-t'}">${t.side}</span><b>${esc(t.symbol)}</b><span>$${fmt(t.price,4)}</span><span>${fmt(t.qty,4)}</span><small>${esc(t.type)}</small><time>${new Date(t.time).toLocaleTimeString('vi-VN')}</time></div>`).join('');
      return;
    }
    const tradeWs=state.sockets.get('trade'),connected=tradeWs&&tradeWs.readyState===WebSocket.OPEN;
    const waiting=`<div class="opt-empty">${connected?'Trade stream đã kết nối nhưng chưa có lệnh khớp mới trong phiên theo dõi.':'Đang kết nối Options Trade stream…'} Binance không gửi lịch sử giao dịch cũ qua WebSocket Trade.</div>`;
    el.innerHTML=tickerHTML+waiting;
  }
  function renderMeta(rows,a){
    const el=$o('optMeta');if(!el)return;
    const socketLabel=ws=>!ws?'not started':ws.readyState===WebSocket.OPEN?'OPEN':ws.readyState===WebSocket.CONNECTING?'CONNECTING':ws.readyState===WebSocket.CLOSING?'CLOSING':'CLOSED';
    const oiKeys=[...state.sockets.keys()].filter(k=>k.startsWith('oi:'));
    const tickerKeys=[...state.sockets.keys()].filter(k=>k.startsWith('ticker:'));
    const oiOpen=oiKeys.filter(k=>state.sockets.get(k)?.readyState===WebSocket.OPEN).length;
    const tickerOpen=tickerKeys.filter(k=>state.sockets.get(k)?.readyState===WebSocket.OPEN).length;
    const tradeWs=state.sockets.get('trade');
    const errors=[...state.socketErrors.entries()].map(([k,v])=>`${k}: ${v}`);
    const oiRestLabel=state.oiRestStatus==='live'?'REST live':state.oiRestStatus==='received'?'REST received':state.oiRestStatus==='empty'?'REST empty':state.oiRestStatus==='error'?'REST error':state.oiRestStatus==='partial-error'?'REST partial error':state.oiRestStatus==='loading'?'REST loading':state.oiRestStatus;
    const oiRestError=state.oiRestLastError?`<span class="opt-meta-error">OI REST: ${esc(state.oiRestLastError)}</span>`:'';
    el.innerHTML=`<span>Expiry: ${esc(state.expiry?dateLabel(Number(state.expiry)):'—')}</span><span>${rows.length} strikes</span><span>${state.marks.size} live mark records</span><span>OI: ${state.oi.size} records · WS ${oiOpen}/${oiKeys.length} open · ${state.oiMessages} WS messages · ${oiRestLabel} (${state.oiRestMessages} REST snapshots)</span><span>24h ticker: ${state.tickers.size} records · ${tickerOpen}/${tickerKeys.length} streams open</span><span>Trade: ${state.trades.length} prints · ${socketLabel(tradeWs)} · ${state.tradeMessages} messages</span><span>Mark time: ${state.lastMarkTime?new Date(state.lastMarkTime).toLocaleTimeString('vi-VN'):'—'}</span>${oiRestError}${errors.length?`<span class="opt-meta-error">${esc(errors.join(' | '))}</span>`:''}`;
  }
  function renderInitial(){
    const body=$o('optChainBody');if(body)body.innerHTML='<tr><td colspan="15" class="opt-empty">Đang kết nối Binance Options WebSocket…</td></tr>';
    const flow=$o('optFlowBody');if(flow)flow.innerHTML='<div class="opt-empty">Đang chờ giao dịch Options…</div>';
  }
  function buildAllLevels(){
    const rows=makeRows(),a=aggregate(rows);if(!a.hasOI)return '';
    const g=strikeMetrics(rows,'gamma'),dex=strikeMetrics(rows,'delta'),vex=strikeMetrics(rows,'vanna'),vgex=strikeMetrics(rows,'vega'),chex=strikeMetrics(rows,'charm'),thex=strikeMetrics(rows,'theta');
    const spot=state.index,parts=[];if(spot)parts.push(`SPOT=${fmt(spot,2)}`);
    const selectedMap={gamma:g,delta:dex,vanna:vex,vega:vgex,charm:chex,theta:thex},selected=selectedMap[state.exposureMetric]||g,selectedName=(METRIC_INFO[state.exposureMetric]||METRIC_INFO.gamma).short;
    const netGEX=g.reduce((sum,x)=>sum+x.value,0),netSelected=selected.reduce((sum,x)=>sum+x.value,0);
    parts.push(`NET_GEX=${compact(netGEX)}`);if(selectedName!=='GEX')parts.push(`NET_${selectedName}=${compact(netSelected)}`);
    const callWall=g.reduce((b,x)=>Math.abs(x.call)>Math.abs(b.value)?{value:x.call,strike:x.strike}:b,{value:0,strike:null});
    const putWall=g.reduce((b,x)=>Math.abs(x.put)>Math.abs(b.value)?{value:x.put,strike:x.strike}:b,{value:0,strike:null});
    if(callWall.strike!=null)parts.push(`CW=${fmt(callWall.strike,2)}`);
    if(putWall.strike!=null)parts.push(`PW=${fmt(putWall.strike,2)}`);
    const flip=gammaFlip(g);if(flip!=null)parts.push(`GF=${fmt(flip,2)}`);
    let oiWall={qty:0,strike:null,side:''};rows.forEach(r=>['call','put'].forEach(k=>{const q=r[k]?.oi;if(q!=null&&q>oiWall.qty)oiWall={qty:q,strike:r.strike,side:k==='call'?'C':'P'}}));
    if(oiWall.strike!=null)parts.push(`OI[${compact(oiWall.qty)}]=${fmt(oiWall.strike,2)}(${oiWall.side})`);
    g.slice().sort((x,y)=>Math.abs(y.value)-Math.abs(x.value)).slice(0,10).forEach((x,i)=>{if(x.value)parts.push(`GEX${i+1}[${compact(x.value)}]=${fmt(x.strike,2)}`)});
    [[dex,'DEX'],[vex,'VEX'],[vgex,'VGEX'],[chex,'CHEX'],[thex,'THEX']].forEach(([arr,label])=>{const x=arr.reduce((b,v)=>Math.abs(v.value)>Math.abs(b.value)?v:b,{value:0,strike:null});if(x.strike!=null&&x.value)parts.push(`${label}[${compact(x.value)}]=${fmt(x.strike,2)}`)});
    return parts.join(', ');
  }
  async function copyLevels(){
    const text=buildAllLevels();if(!text){showError('Chưa có đủ Open Interest để tạo Key Levels.');return;}
    try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else throw new Error('clipboard unavailable');}
    catch(_){const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();try{document.execCommand('copy')}finally{field.remove?.()}}
    const btn=$o('optCopyLevels');if(btn){const old=btn.textContent;btn.textContent='Copied!';setTimeout(()=>btn.textContent=old,900);}
  }
  function activate(on){
    state.active=!!on;
    if(!state.active){closeAll();if(state.healthTimer){clearInterval(state.healthTimer);state.healthTimer=null}if(state.renderTimer){clearTimeout(state.renderTimer);state.renderTimer=null}if(state.surfaceRenderTimer){clearTimeout(state.surfaceRenderTimer);state.surfaceRenderTimer=null}return;}
    if(state.sockets.size)return;
    state.error='';state.status='connecting';renderInitial();setStatus('Đang kết nối Binance WebSocket…','loading');
    connectStream('mark','xauusdt@optionMarkPrice');
    connectStream('index','!index@arr');
    connectStream('trade','xauusdt@optionTrade');
    if(state.healthTimer)clearInterval(state.healthTimer);
    state.healthTimer=setInterval(statusTick,2500);
  }
  function refresh(){
    if(!state.active){activate(true);return;}
    state.marks.clear();state.contracts=[];state.oi.clear();state.tickers.clear();state.trades=[];state.lastMarkTime=0;state.lastOIUpdate=0;state.lastTradeTime=0;state.lastTickerUpdate=0;state.expiry=null;state.oiExpiryCodes=[];state.expiryManual=false;state.oiMessages=0;state.oiRestMessages=0;state.oiRestLastUpdate=0;state.oiRestStatus='idle';state.oiRestLastError='';state.oiRestByExpiry.clear();state.tradeMessages=0;state.tickerMessages=0;state.socketErrors.clear();state.lastPayloads.clear();
    closeAll();activate(true);
  }
  function debug(){return {active:state.active,connections:[...state.sockets].map(([key,ws])=>({key,state:ws.readyState,stateLabel:['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState]||'UNKNOWN',url:ws.url,error:state.socketErrors.get(key)||null,lastPayload:state.lastPayloads.get(key)||null})),contractCount:state.contracts.length,markCount:state.markCount,oiCount:state.oiCount,tickerCount:state.tickerCount,tradeCount:state.trades.length,oiMessages:state.oiMessages,oiRestMessages:state.oiRestMessages,oiRestStatus:state.oiRestStatus,oiRestLastError:state.oiRestLastError,lastOIRestUpdate:state.oiRestLastUpdate,oiRestByExpiry:[...state.oiRestByExpiry.entries()],oiSources:[...new Set([...state.oi.values()].map(x=>x.source||'unknown'))],tickerMessages:state.tickerMessages,tradeMessages:state.tradeMessages,index:state.index,expiry:state.expiry,expiryCodes:state.oiExpiryCodes,exposureMetric:state.exposureMetric,mode:state.mode,surfaceScenario:surfaceParams(),lastMarkTime:state.lastMarkTime,lastOIUpdate:state.lastOIUpdate,lastTickerUpdate:state.lastTickerUpdate,lastTradeTime:state.lastTradeTime,oiSymbols:[...state.oi.keys()].slice(0,10),tickerSymbols:[...state.tickers.keys()].slice(0,10),errors:[...state.socketErrors.entries()],error:state.error}}
  function init(){
    if(!$o('v-options'))return;
    const expiry=$o('optExpiry');if(expiry)expiry.addEventListener('change',()=>{state.expiry=Number(expiry.value)||null;state.expiryManual=true;scheduleRender()});
    const mode=$o('optMode');if(mode)mode.addEventListener('change',()=>{state.mode=mode.value==='short'?'short':'long';if(state.contracts.length)render()});
    const refreshBtn=$o('optRefresh');if(refreshBtn)refreshBtn.addEventListener('click',refresh);
    const info=$o('optExplain');if(info)info.addEventListener('click',()=>{$o('optMethod').hidden=!$o('optMethod').hidden});
    const exposure=$o('optExposureMetric');if(exposure)exposure.addEventListener('change',()=>{state.exposureMetric=['delta','gamma','vanna','vega','charm','theta'].includes(exposure.value)?exposure.value:'gamma';if(state.contracts.length)render()});
    const surfaceMetric=$o('optSurfaceMetric');if(surfaceMetric)surfaceMetric.addEventListener('change',()=>{state.surfaceMetric=['delta','gamma','vanna','vega','charm','theta'].includes(surfaceMetric.value)?surfaceMetric.value:'gamma';drawSurface('exposure')});
    const greekMetric=$o('optGreekMetric');if(greekMetric)greekMetric.addEventListener('change',()=>{state.greekMetric=['delta','gamma','vanna','vega','charm','theta'].includes(greekMetric.value)?greekMetric.value:'delta';drawSurface('greek')});
    const greekSide=$o('optGreekSide');if(greekSide)greekSide.addEventListener('change',()=>{state.greekSide=greekSide.value==='P'?'P':'C';drawSurface('greek')});
    const copy=$o('optCopyLevels');if(copy)copy.addEventListener('click',copyLevels);
    ['optModelSpot','optModelDte','optModelRate','optModelYield'].forEach(id=>{const el=$o(id);if(el){el.addEventListener('input',()=>scheduleSurfaceRender());el.addEventListener('change',()=>scheduleSurfaceRender());}});
    const modelReset=$o('optModelReset');if(modelReset)modelReset.addEventListener('click',resetSurfaceParams);
    window.addEventListener?.('resize',()=>{if(state.active){const rows=makeRows();renderOIChart(rows);renderThetaChart(rows);Object.values(state.surfaceRenderers).forEach(r=>r?.draw?.())}});
    clearError();
  }
  window.optionsSetActive=activate;window.optionsRefresh=refresh;window.optionsDebug=debug;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
