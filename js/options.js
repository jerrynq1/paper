/* ================= BINANCE XAU COMMODITY OPTIONS =================
   Browser-native public WebSocket market data. No REST, API key or proxy.
   Public OI is non-directional: Long/Short are scenario assumptions only.
*/
(function(){
  'use strict';
  const WS_BASES={market:'wss://fstream.binance.com/market/ws/',public:'wss://fstream.binance.com/public/ws/'};
  const UNDERLYING='XAUUSDT';
  const $o=id=>document.getElementById(id);
  const state={
    active:false, sockets:new Map(), reconnects:new Map(), reconnectDelay:new Map(),
    rotateTimer:null, healthTimer:null, renderTimer:null, expiry:null,
    contracts:[], marks:new Map(), oi:new Map(), tickers:new Map(), index:null, trades:[],
    mode:'long', exposureMetric:'gamma', lastMarkTime:0, lastIndexTime:0,
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
      bits.push(`<span>OI: ${state.oi.size} records · ${oiOpen}/${oiKeys.length} sockets · ${state.lastOIUpdate?new Date(state.lastOIUpdate).toLocaleTimeString('vi-VN'):'waiting first payload'}</span>`);
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
      if(!state.sockets.has(oiKey))connectStream(oiKey,`xauusdt@optionOpenInterest@${code}`);
      if(!state.sockets.has(tickerKey))connectStream(tickerKey,`xauusdt@optionTicker@${code}`);
    });
    state.oiExpiryCodes=codes;
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
        delta:ensureNumber(raw,['d','delta']),gamma:ensureNumber(raw,['g','gamma']),vega:ensureNumber(raw,['v','vega']),theta:ensureNumber(raw,['t','theta']),
        indexPrice:ensureNumber(raw,['i','indexPrice']),bidPrice:ensureNumber(raw,['bo','bidPrice']),askPrice:ensureNumber(raw,['ao','askPrice']),
        eventTime:ensureNumber(raw,['E','eventTime'])||Date.now()
      };
      state.marks.set(symbol,mark);changed=true;
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
  function handleOI(payload){
    const items=records(payload);if(!items.length)return;
    let received=0;
    items.forEach(raw=>{
      if(!raw)return;
      const symbol=String(raw.s||raw.symbol||'').toUpperCase();if(!symbol.startsWith('XAU-'))return;
      const qty=ensureNumber(raw,['o','sumOpenInterest','openInterest','oi']);
      const usd=ensureNumber(raw,['h','sumOpenInterestUsd','openInterestUsd','oiUsd']);
      if(qty!==null){state.oi.set(symbol,{qty,usd,time:ensureNumber(raw,['E','timestamp','T'])||Date.now()});received++;}
    });
    if(received){
      state.oiMessages++;state.lastOIUpdate=Date.now();state.oiCount=state.oi.size;
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
    const map=new Map();
    selectedContracts().forEach(c=>{
      const strike=c.strikePrice;if(!Number.isFinite(strike))return;
      const side=c.side==='CALL'?'call':'put',m=state.marks.get(c.symbol)||{},oi=state.oi.get(c.symbol)||{};
      if(!map.has(strike))map.set(strike,{strike,call:null,put:null});
      map.get(strike)[side]={contract:c,mark:m,oi:n(oi.qty),oiUsd:n(oi.usd),delta:n(m.delta),gamma:n(m.gamma),vega:n(m.vega),theta:n(m.theta),iv:n(m.markIV),bidIV:n(m.bidIV),askIV:n(m.askIV),price:n(m.markPrice)};
    });
    return [...map.values()].sort((a,b)=>a.strike-b.strike);
  }
  function aggregate(rows){
    const sign=state.mode==='short'?-1:1,spot=state.index;
    const sum={callOI:0,putOI:0,delta:0,gamma:0,gex:0,vega:0,theta:0,hasOI:false};
    rows.forEach(r=>['call','put'].forEach(k=>{
      const x=r[k];if(!x||x.oi==null)return;sum.hasOI=true;
      if(k==='call')sum.callOI+=x.oi;else sum.putOI+=x.oi;
      const unit=1,oi=x.oi;
      if(x.delta!=null&&spot!=null)sum.delta+=sign*x.delta*oi*unit*spot;
      if(x.gamma!=null&&spot!=null){const g=sign*x.gamma*oi*unit*spot*spot*.01;sum.gamma+=sign*x.gamma*oi*unit;sum.gex+=g;x.gex=g}
      if(x.vega!=null)sum.vega+=sign*x.vega*oi*unit;
      if(x.theta!=null)sum.theta+=sign*x.theta*oi*unit;
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
    renderExposure(rows,a);renderGreeks(a);renderChain(rows,spot);renderFlow();renderMeta(rows,a);
  }
  function renderExposure(rows,a){
    const el=$o('optExposure');if(!el)return;
    const metricKey=state.exposureMetric,labels={gamma:['Gamma Exposure by Strike','USDT / 1% XAU move'],delta:['Delta Exposure by Strike','USDT notional'],vega:['Vega Exposure by Strike','Binance native units'],theta:['Theta Exposure by Strike','Binance native units']};
    const title=$o('optExposureTitle'),units=$o('optExposureUnits');if(title)title.textContent=labels[metricKey][0];if(units)units.textContent=labels[metricKey][1];
    if(!a.hasOI||state.index==null){
      const oiWs=state.sockets.get('oi'),connected=oiWs&&oiWs.readyState===WebSocket.OPEN;
      el.innerHTML=`<div class="opt-empty">${!a.hasOI?(connected?'Đã kết nối OI stream; Binance cập nhật OI theo chu kỳ khoảng 60 giây. Đang chờ bản tin đầu tiên.':'Đang chờ kết nối Open Interest.'):'Đang chờ Underlying Index.'} Exposure sẽ tự tính khi đủ OI và Index.</div>`;return;
    }
    const sign=state.mode==='short'?-1:1,spot=state.index;
    const value=x=>{if(!x||x.oi==null)return 0;const oi=x.oi;
      if(metricKey==='delta')return x.delta==null?0:sign*x.delta*oi*spot;
      if(metricKey==='gamma')return x.gamma==null?0:sign*x.gamma*oi*spot*spot*.01;
      if(metricKey==='vega')return x.vega==null?0:sign*x.vega*oi;
      return x.theta==null?0:sign*x.theta*oi;
    };
    const series=rows.map(r=>({strike:r.strike,value:value(r.call)+value(r.put)})),max=Math.max(1e-9,...series.map(x=>Math.abs(x.value)));
    el.innerHTML=series.map(x=>{const width=Math.max(1,Math.abs(x.value)/max*100),negative=x.value<0;return `<div class="opt-gex-row"><span class="opt-gex-strike">${fmt(x.strike,0)}</span><div class="opt-gex-track"><i class="${negative?'neg':'pos'}" style="width:${width}%"></i></div><b class="${negative?'neg-t':'pos-t'}">${compact(x.value)}</b></div>`}).join('')||'<div class="opt-empty">Không có strike trong kỳ hạn đã chọn.</div>';
  }
  function renderGreeks(a){
    const el=$o('optGreeks');if(!el)return;
    if(!a.hasOI){
      const oiWs=state.sockets.get('oi'),connected=oiWs&&oiWs.readyState===WebSocket.OPEN;
      el.innerHTML=`<div class="opt-empty">${connected?'OI stream đã kết nối. Đang chờ bản tin OI đầu tiên (chu kỳ cập nhật khoảng 60 giây).':'Đang chờ kết nối OI stream.'} Greeks từng hợp đồng vẫn có trong Option Chain.</div>`;return;
    }
    el.innerHTML=`<div class="opt-greek-line"><span>Delta Notional</span><b>${fmt(a.delta,2)} USDT</b></div>
      <div class="opt-greek-line"><span>Gamma Exposure · 1% move</span><b>${fmt(a.gex,2)} USDT</b></div>
      <div class="opt-greek-line"><span>Aggregate Gamma</span><b>${fmt(a.gamma,6)}</b></div>
      <div class="opt-greek-line"><span>Vega · Binance native units</span><b>${fmt(a.vega,2)}</b></div>
      <div class="opt-greek-line"><span>Theta · Binance native units</span><b>${fmt(a.theta,2)}</b></div>
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
    el.innerHTML=`<span>Expiry: ${esc(state.expiry?dateLabel(Number(state.expiry)):'—')}</span><span>${rows.length} strikes</span><span>${state.marks.size} live mark records</span><span>OI: ${state.oi.size} records · ${oiOpen}/${oiKeys.length} streams open · ${state.oiMessages} messages</span><span>24h ticker: ${state.tickers.size} records · ${tickerOpen}/${tickerKeys.length} streams open</span><span>Trade: ${state.trades.length} prints · ${socketLabel(tradeWs)} · ${state.tradeMessages} messages</span><span>Mark time: ${state.lastMarkTime?new Date(state.lastMarkTime).toLocaleTimeString('vi-VN'):'—'}</span>${errors.length?`<span class="opt-meta-error">${esc(errors.join(' | '))}</span>`:''}`;
  }
  function renderInitial(){
    const body=$o('optChainBody');if(body)body.innerHTML='<tr><td colspan="15" class="opt-empty">Đang kết nối Binance Options WebSocket…</td></tr>';
    const flow=$o('optFlowBody');if(flow)flow.innerHTML='<div class="opt-empty">Đang chờ giao dịch Options…</div>';
  }
  function activate(on){
    state.active=!!on;
    if(!state.active){closeAll();if(state.healthTimer){clearInterval(state.healthTimer);state.healthTimer=null}if(state.renderTimer){clearTimeout(state.renderTimer);state.renderTimer=null}return;}
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
    state.marks.clear();state.contracts=[];state.oi.clear();state.tickers.clear();state.trades=[];state.lastMarkTime=0;state.lastOIUpdate=0;state.lastTradeTime=0;state.lastTickerUpdate=0;state.expiry=null;state.oiExpiryCodes=[];state.expiryManual=false;state.oiMessages=0;state.tradeMessages=0;state.tickerMessages=0;state.socketErrors.clear();state.lastPayloads.clear();
    closeAll();activate(true);
  }
  function debug(){return {active:state.active,connections:[...state.sockets].map(([key,ws])=>({key,state:ws.readyState,stateLabel:['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState]||'UNKNOWN',url:ws.url,error:state.socketErrors.get(key)||null,lastPayload:state.lastPayloads.get(key)||null})),contractCount:state.contracts.length,markCount:state.markCount,oiCount:state.oiCount,tickerCount:state.tickerCount,tradeCount:state.trades.length,oiMessages:state.oiMessages,tickerMessages:state.tickerMessages,tradeMessages:state.tradeMessages,index:state.index,expiry:state.expiry,expiryCodes:state.oiExpiryCodes,lastMarkTime:state.lastMarkTime,lastOIUpdate:state.lastOIUpdate,lastTickerUpdate:state.lastTickerUpdate,lastTradeTime:state.lastTradeTime,oiSymbols:[...state.oi.keys()].slice(0,10),tickerSymbols:[...state.tickers.keys()].slice(0,10),errors:[...state.socketErrors.entries()],error:state.error}}
  function init(){
    if(!$o('v-options'))return;
    const expiry=$o('optExpiry');if(expiry)expiry.addEventListener('change',()=>{state.expiry=Number(expiry.value)||null;state.expiryManual=true;scheduleRender()});
    const mode=$o('optMode');if(mode)mode.addEventListener('change',()=>{state.mode=mode.value==='short'?'short':'long';if(state.contracts.length)render()});
    const refreshBtn=$o('optRefresh');if(refreshBtn)refreshBtn.addEventListener('click',refresh);
    const info=$o('optExplain');if(info)info.addEventListener('click',()=>{$o('optMethod').hidden=!$o('optMethod').hidden});
    const exposure=$o('optExposureMetric');if(exposure)exposure.addEventListener('change',()=>{state.exposureMetric=['delta','gamma','vega','theta'].includes(exposure.value)?exposure.value:'gamma';if(state.contracts.length)render()});
    clearError();
  }
  window.optionsSetActive=activate;window.optionsRefresh=refresh;window.optionsDebug=debug;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
