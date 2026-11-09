/* ================= BINANCE STOCK OPTIONS: QQQ + GLD =================
   Uses a narrowly allow-listed Cloudflare Worker proxy for Binance Stock
   Options REST endpoints (the quote endpoint is origin-restricted by Binance).
   Stock candles and underlying prices use Binance Equity WebSocket directly.
   Public stock Kline stream is live-only: historical bars are not fabricated.
*/
(function(){
  'use strict';

  const API_BASE = String(window.BINANCE_STOCK_PROXY || '').replace(/\/+$/, '');
  const API_PREFIX = API_BASE + '/api/binance-stock-proxy';
  function ensureProxyConfigured(){
    if(!API_BASE) throw new Error('Chưa cấu hình Cloudflare Worker. Hãy deploy worker/ rồi dán URL workers.dev vào js/stock-options-config.js.');
  }
  const WS_URL = 'wss://nbstream.binance.com/equity/stream';
  const CONFIG = {
    qqq: {key:'qqq', symbol:'QQQ', assetCode:'EQ_QQQ', name:'Invesco QQQ Trust', root:'QQQ'},
    gld: {key:'gld', symbol:'GLD', assetCode:'EQ_GLD', name:'SPDR Gold Trust', root:'GLD'}
  };
  const sessions = {};
  const intervals = ['5m','1h','1d','1w','1M'];
  const $ = id => document.getElementById(id);
  const num = x => {
    if(x === null || x === undefined || x === '') return null;
    const v = Number(x); return Number.isFinite(v) ? v : null;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (x,d=2) => x===null || !Number.isFinite(Number(x)) ? '—' : Number(x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const compact = x => x===null || !Number.isFinite(Number(x)) ? '—' : Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(Number(x));
  const pct = x => x===null || !Number.isFinite(Number(x)) ? '—' : (Number(x)*100).toFixed(2)+'%';
  const isoTodayNY = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateLabel = iso => {
    if(!iso) return '—';
    const d = new Date(iso+'T12:00:00Z');
    return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(d);
  };
  const strikeKey = x => Number(x).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');

  function pageMarkup(cfg){
    const p = `so-${cfg.key}`;
    return `
      <div class="so-head">
        <div><div class="options-eyebrow">BINANCE EQUITY OPTIONS · STOCKS</div>
          <h2>${cfg.symbol} <span>· ${cfg.name}</span></h2>
          <p class="msg">Giá cổ phiếu/ETF, nến Binance, Option Chain, Greeks, Open Interest và Exposure. Hai workspace độc lập với XAU Options.</p>
        </div>
        <div class="opt-actions"><span class="opt-status" id="${p}-status">Chưa đồng bộ</span><button class="btn sm" id="${p}-refresh" type="button">↻ Làm mới</button></div>
      </div>
      <div class="opt-errors" id="${p}-error" hidden></div>
      <div class="so-kpis" id="${p}-kpis">
        <div class="opt-metric"><span>LAST PRICE</span><strong>—</strong><small>Binance Equity</small></div>
        <div class="opt-metric"><span>CHANGE</span><strong>—</strong><small>So với previous close</small></div>
        <div class="opt-metric"><span>CALL OI</span><strong>—</strong><small>Hợp đồng có OI</small></div>
        <div class="opt-metric"><span>PUT OI</span><strong>—</strong><small>Hợp đồng có OI</small></div>
        <div class="opt-metric"><span>TOTAL VOLUME</span><strong>—</strong><small>Call + Put</small></div>
        <div class="opt-metric"><span>OI COVERAGE</span><strong>—</strong><small>Quote có OI / tổng contract</small></div>
      </div>
      <div class="so-chart-grid">
        <div class="card so-chart-card">
          <div class="opt-card-title"><div><h3>${cfg.symbol} Candlestick Chart</h3><small id="${p}-chart-meta">Chờ Binance Equity Kline stream…</small></div>
            <div class="so-tfs">${intervals.map((it,i)=>`<button type="button" class="tf${i===0?' on':''}" data-so-interval="${it}">${it}</button>`).join('')}</div>
          </div>
          <div class="so-chart-wrap"><div id="${p}-chart" class="so-chart"></div><div class="so-chart-empty" id="${p}-chart-empty">Đang chờ nến đầu tiên từ Binance. Stream Stocks gửi nến đang chạy; chưa có endpoint REST Kline lịch sử trong tài liệu Stocks API công khai.</div></div>
          <div class="so-chart-foot"><span id="${p}-chart-ohlc">O — · H — · L — · C —</span><span id="${p}-chart-feed">Kline stream · ${cfg.symbol}</span></div>
        </div>
        <div class="card so-quote-card">
          <div class="opt-card-title"><h3>Underlying Snapshot</h3><small>Binance Equity</small></div>
          <div class="so-quote-price" id="${p}-price">—</div>
          <div class="so-quote-change" id="${p}-change">Chưa có giá mới</div>
          <div class="so-quote-list">
            <div><span>Previous close</span><b id="${p}-prev">—</b></div>
            <div><span>Market phase</span><b id="${p}-phase">—</b></div>
            <div><span>Last update</span><b id="${p}-updated">—</b></div>
            <div><span>Contract multiplier</span><b id="${p}-multiplier">—</b></div>
          </div>
          <p class="so-note">Giá underlying lấy từ stream riêng <code>${cfg.assetCode}@symbol_price</code>. Stock Options quote được lấy từ endpoint riêng của Binance và có thể bị delay tùy quyền dữ liệu.</p>
        </div>
      </div>
      <div class="card so-chain-toolbar">
        <div class="opt-toolbar">
          <div class="opt-control"><label for="${p}-expiry">EXPIRATION</label><select id="${p}-expiry"><option value="">Đang tải kỳ hạn…</option></select></div>
          <div class="opt-source">Underlying: <b>${cfg.symbol}</b> · Contract multiplier: <b id="${p}-contract-multiplier">—</b> · Quote source: Binance Stock Options</div>
        </div>
        <div class="so-chain-meta" id="${p}-chain-meta">Đang lấy Option Chain…</div>
      </div>
      <div class="card so-level-card">
        <div class="opt-card-title"><div><h3>Key Levels</h3><small>Ước lượng từ OI và Greeks của expiry được chọn</small></div><button class="btn ghost sm" type="button" id="${p}-copy">Copy Levels</button></div>
        <div class="opt-levels-grid so-levels" id="${p}-levels"><div class="opt-empty">Đang chờ dữ liệu OI…</div></div>
      </div>
      <div class="opt-main-grid so-exposure-grid">
        <div class="card"><div class="opt-card-title"><div><h3 id="${p}-exposure-title">Exposure by Strike</h3><small id="${p}-exposure-subtitle">Call + / Put − · Expiry đang chọn</small></div>
          <select id="${p}-exposure-metric" class="opt-exposure-select" aria-label="Chọn loại Exposure"><option value="gamma">GEX · Gamma</option><option value="delta">DEX · Delta</option><option value="vega">VGEX · Vega</option><option value="theta">THEX · Theta</option></select></div>
          <small class="opt-exposure-units" id="${p}-exposure-units">USD notional per 1% underlying move · Gamma × OI × multiplier × Spot² × 1%</small>
          <div class="opt-gex-chart so-exposure" id="${p}-gex"><div class="opt-empty">Đang chờ Greeks/OI…</div></div>
          <p class="opt-mode-note" id="${p}-exposure-note">GEX dùng quy ước Call dương, Put âm. OI không xác định vị thế Long/Short của từng nhà giao dịch.</p>
        </div>
        <div class="card"><div class="opt-card-title"><h3>Aggregate Greeks</h3><small>Expiry đang chọn</small></div><div class="opt-greeks" id="${p}-greeks"><div class="opt-empty">Đang tính…</div></div></div>
      </div>
      <div class="card so-oi-card">
        <div class="opt-card-title"><h3>Open Interest by Strike</h3><small class="opt-chart-meta"><span class="opt-legend-item"><i class="opt-legend-call"></i>Call</span><span class="opt-legend-item"><i class="opt-legend-put"></i>Put</span><b id="${p}-oiwall">OI Wall: —</b></small></div>
        <div class="so-oi-chart" id="${p}-oi"><div class="opt-empty">Đang chờ OI…</div></div>
      </div>
      <div class="card opt-chain-card">
        <div class="opt-card-title"><div><h3>Option Chain · ${cfg.symbol}</h3><small>Call / Put · Bid / Ask · Mid · Volume · Open Interest · IV · Greeks</small></div><small id="${p}-rows-count">— contracts</small></div>
        <div class="opt-table-wrap"><table class="opt-chain so-chain-table">
          <thead><tr><th colspan="9" class="call-head">CALLS</th><th rowspan="2">STRIKE</th><th colspan="9" class="put-head">PUTS</th></tr>
          <tr><th>Bid × Size</th><th>Ask × Size</th><th>Mid</th><th>Last</th><th>Volume</th><th>OI</th><th>IV</th><th>Delta</th><th>Gamma</th><th>Gamma</th><th>Delta</th><th>IV</th><th>OI</th><th>Volume</th><th>Last</th><th>Mid</th><th>Ask × Size</th><th>Bid × Size</th></tr></thead>
          <tbody id="${p}-chain"><tr><td colspan="19" class="opt-empty">Đang tải Option Chain…</td></tr></tbody>
        </table></div>
      </div>
      <div class="card so-method-card"><div class="opt-card-title"><h3>Data Status & Methodology</h3><button class="btn ghost sm" type="button" id="${p}-method-toggle">Giải thích cách tính</button></div>
        <div class="opt-meta" id="${p}-meta"></div>
        <div class="opt-method" id="${p}-method" hidden>
          <p><strong>Nguồn Option Chain:</strong> Binance Stock Options <code>option/chain-symbols</code> liệt kê OCC symbols theo ngày đáo hạn; <code>get-option-quote</code> trả Bid/Ask/Mid, volume, OI, multiplier, IV và Greeks.</p>
          <p><strong>Contract size:</strong> multiplier đọc từ từng option quote (mẫu GLD trong HAR là 100 shares/contract). Không hardcode OI và không thay <code>null</code> bằng 0.</p>
          <p><strong>GEX:</strong> Σ(Gamma × OI × multiplier × Spot² × 0.01), Call dương và Put âm. <strong>DEX:</strong> Σ(Delta × OI × multiplier × Spot). Vega và Theta tổng hợp từ Greek × OI × multiplier.</p>
          <p><strong>Key Levels:</strong> Call Wall / Put Wall là strike có OI lớn nhất theo từng phía; Gamma Flip là điểm cumulative GEX đổi dấu nếu tồn tại. Đây là các chỉ báo tập trung OI/Greek, không phải dealer positioning đã xác minh.</p>
          <p><strong>Giới hạn:</strong> Binance trả <code>oi: null</code> cho một số hợp đồng. Các hợp đồng này được đánh dấu thiếu OI và bị loại khỏi exposure, nhưng vẫn hiển thị dữ liệu quote/Greeks còn lại. Endpoint quote có thể trả dữ liệu trễ; độ trễ phụ thuộc quyền dữ liệu tài khoản.</p>
          <p><strong>Chart:</strong> Dùng Equity WebSocket <code>${cfg.symbol}@kline_INTERVAL</code> (5m, 1h, 1d, 1w, 1M). Luồng công khai được xác minh là cập nhật nến đang chạy, không bao gồm backfill lịch sử trong request capture hiện có. Biểu đồ sẽ bắt đầu có nến khi Binance gửi payload; không tự sinh dữ liệu lịch sử.</p>
          <p><strong>Không có trong nguồn hiện tại:</strong> option trade prints/flow tape và Vanna/Charm không nằm trong quote response được ghi nhận, nên dashboard không tự ước lượng hoặc hiển thị hai loại dữ liệu này như dữ liệu Binance.</p>
        </div>
      </div>`;
  }

  function buildViews(){
    for(const cfg of Object.values(CONFIG)){
      const view = $('v-'+cfg.key+'Options');
      if(view && !view.dataset.stockOptionsBuilt){ view.innerHTML=pageMarkup(cfg); view.dataset.stockOptionsBuilt='1'; }
      sessions[cfg.key] = sessions[cfg.key] || {
        cfg, active:false, socket:null, reconnectTimer:null, pollTimer:null, statusTimer:null,
        expiry:null, expirations:[], contracts:[], contractSymbols:new Set(), quotes:new Map(), price:null, previousClose:null,
        phase:'—', priceTime:0, interval:'5m', chart:null, candleSeries:null, volumeSeries:null,
        lastCandle:null, candlesSeen:0, oiLastUpdate:0, quoteLoading:false, chartResize:null,
        quoteFeed:'delay', streamExpiry:null, streamNames:[], reconnectDelay:1000, requestId:1, chainLoadToken:0
      };
      bindView(sessions[cfg.key]);
    }
  }

  async function requestText(path){
    ensureProxyConfigured();
    let response;
    try{response=await fetch(API_PREFIX+path,{headers:{'Accept':'text/html'}});}
    catch(e){throw new Error('Không kết nối được Binance proxy. Kiểm tra URL Cloudflare Worker trong js/stock-options-config.js và thử mở Worker /api/health. '+(e.message||e));}
    const text=await response.text();
    if(!response.ok)throw new Error(`Binance page HTTP ${response.status}: ${text.slice(0,160)}`);
    return text;
  }

  async function request(path, method='GET', body){
    ensureProxyConfigured();
    const options={method,headers:{'Accept':'application/json'}};
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
    const url=API_PREFIX+path;
    let response;
    try{ response=await fetch(url,options); }
    catch(e){ throw new Error('Không gọi được Binance proxy. Kiểm tra URL Cloudflare Worker trong js/stock-options-config.js và cấu hình CORS. Chi tiết: '+(e.message||e)); }
    const text=await response.text();
    if(!response.ok) throw new Error(`Binance Worker HTTP ${response.status}: ${text.slice(0,180)}`);
    let json;
    try{json=JSON.parse(text)}catch{throw new Error('Binance trả response không phải JSON: '+text.slice(0,120));}
    if(json && json.code && json.code!=='000000' && json.code!=='0') throw new Error(json.message||json.msg||`Binance error ${json.code}`);
    if(json && json.success===false) throw new Error(json.message||'Binance API request failed');
    return json;
  }

  function setStatus(s,text,kind=''){
    const el=$(`${'so-'+s.cfg.key}-status`); if(!el)return;
    el.textContent=text; el.className='opt-status'+(kind?' '+kind:'');
  }
  function showError(s,msg){const el=$(`so-${s.cfg.key}-error`);if(el){el.hidden=false;el.textContent=msg;}}
  function clearError(s){const el=$(`so-${s.cfg.key}-error`);if(el){el.hidden=true;el.textContent='';}}

  function parseOverview(html){
    const match=html.match(/<script[^>]+id=["']__APP_DATA["'][^>]*>([\s\S]*?)<\/script>/i);
    if(!match) return null;
    const app=JSON.parse(match[1]);
    let found=null;
    const walk=o=>{
      if(found||!o)return;
      if(Array.isArray(o)) { for(const v of o) walk(v); return; }
      if(typeof o!=='object') return;
      if(Array.isArray(o.queryKey)&&o.queryKey[0]==='OPTION_OVERVIEW' && o.state && o.state.data){found=o.state.data;return;}
      for(const v of Object.values(o))walk(v);
    };
    walk(app);
    if(found && Array.isArray(found.expirations)) return found.expirations.map(x=>({date:x.expirationDate,root:x.rootSymbol||sRoot(found.symbol)})).filter(x=>x.date);
    return null;
  }
  function sRoot(symbol){return symbol;}

  function candidateDates(limit=18){
    const out=[]; const base=new Date(isoTodayNY()+'T12:00:00Z');
    for(let i=0;i<65 && out.length<limit;i++){
      const d=new Date(base.getTime()+i*86400000),day=d.getUTCDay();
      if(day===0||day===6)continue;
      out.push(d.toISOString().slice(0,10));
    }
    return out;
  }

  async function loadExpirations(s){
    ensureProxyConfigured();
    const cfg=s.cfg;
    setStatus(s,'Đang tải kỳ hạn…','loading');
    const htmlPath=`/en/stocks/options/${cfg.assetCode}`;
    try{
      const html=await requestText(htmlPath);
      const exps=parseOverview(html);
      if(exps && exps.length){s.expirations=exps;return exps;}
    }catch(e){ /* fallback below: overview HTML may be unavailable on some Binance regions */ }
    const dates=candidateDates();
    const found=[]; let fallbackError='';
    let next=0;
    async function worker(){while(next<dates.length){const d=dates[next++];try{
      const data=await request(`/bapi/equity/v1/public/equity/option/chain-symbols?${new URLSearchParams({symbol:cfg.symbol,rootSymbol:cfg.root,expirationDate:d})}`);
      const list=data.data?.l||[];if(list.length)found.push({date:d,root:cfg.root});
    }catch(e){if(!fallbackError)fallbackError=e.message||String(e);} }}
    await Promise.all(Array.from({length:5},worker));
    found.sort((a,b)=>a.date.localeCompare(b.date));
    s.expirations=found;
    if(!found.length)throw new Error(`Không lấy được danh sách expiry cho ${cfg.symbol}. ${fallbackError||'Binance không trả Option Chain cho các ngày được kiểm tra.'}`);
    return found;
  }

  function normaliseQuote(q){
    const optionSymbol=q.os??q.optionSymbol??'';
    const rawSide=String(q.t??q.contractType??q.side??'').toLowerCase();
    const occSide=(optionSymbol.match(/[0-9]([cp])[0-9]+$/i)||[])[1]?.toUpperCase();
    const side=rawSide.includes('put')||rawSide==='p'?'P':rawSide.includes('call')||rawSide==='c'?'C':occSide==='P'?'P':'C';
    const oi=q.oi!==undefined?q.oi:q.openInterest;
    return {
      optionSymbol, name:q.n??q.name??optionSymbol, side,
      expiration:num(q.e??q.expiration), strike:num(q.sp??q.strikePrice??q.strike), multiplier:num(q.m??q.multiplier),
      last:num(q.p??q.l??q.lastPrice??q.last), bid:num(q.bp??q.bid), ask:num(q.ap??q.ask), mid:num(q.mp??q.mid),
      volume:num(q.v??q.volume), openInterest:oi===null||oi===undefined?null:num(oi),
      iv:num(q.iv??q.impliedVolatility), delta:num(q.de??q.delta), gamma:num(q.ga??q.gamma), theta:num(q.th??q.theta), vega:num(q.ve??q.vega),
      breakEven:num(q.be??q.breakEven), previousClose:num(q.pcp??q.previousClose), bidSize:num(q.bs??q.bidSize), askSize:num(q.as??q.askSize)
    };
  }

  async function loadChain(s){
    if(!s.expiry)return;
    const token=++s.chainLoadToken;
    const cfg=s.cfg, expiry=s.expiry, meta=s.expirations.find(x=>x.date===expiry);
    const root=meta?.root||cfg.root;
    setStatus(s,'Đang tải Option Chain…','loading');
    $(`so-${cfg.key}-chain`).innerHTML='<tr><td colspan="19" class="opt-empty">Đang lấy danh sách OCC contracts và quote…</td></tr>';
    const chain=await request(`/bapi/equity/v1/public/equity/option/chain-symbols?${new URLSearchParams({symbol:cfg.symbol,rootSymbol:root,expirationDate:expiry})}`);
    if(token!==s.chainLoadToken||expiry!==s.expiry)return;
    const list=chain.data?.l||[];
    if(!list.length)throw new Error(`Binance không trả contract cho ${cfg.symbol} expiry ${expiry}.`);
    s.contracts=list;
    const symbols=list.map(x=>x.os).filter(Boolean);
    const batches=[];for(let i=0;i<symbols.length;i+=100)batches.push(symbols.slice(i,i+100));
    const replies=await Promise.all(batches.map(batch=>request('/bapi/equity/v1/friendly/equity/option/get-option-quote','POST',{occSymbols:batch})));
    if(token!==s.chainLoadToken||expiry!==s.expiry)return;
    const received=replies.flatMap(x=>Array.isArray(x.data)?x.data:[]).map(normaliseQuote);
    if(!received.length)throw new Error('Binance trả danh sách contract nhưng không có quote.');
    const current=new Map(received.filter(q=>q.optionSymbol).map(q=>[q.optionSymbol,q]));
    s.contractSymbols=new Set(symbols);
    s.quotes=current;
    s.oiLastUpdate=Date.now();
    renderAll(s);
    setStatus(s,`Quote loaded · ${received.length} contracts`,'ok');
    updateChainMeta(s);
    syncOptionStream(s);
  }

  function mergeLiveQuote(s, raw){
    const arr=Array.isArray(raw)?raw:[raw];
    const sourceKeys={name:['n','name'],side:['t','contractType','side'],expiration:['e','expiration'],strike:['sp','strikePrice','strike'],multiplier:['m','multiplier'],last:['p','l','lastPrice','last'],bid:['bp','bid'],ask:['ap','ask'],mid:['mp','mid'],volume:['v','volume'],openInterest:['oi','openInterest'],iv:['iv','impliedVolatility'],delta:['de','delta'],gamma:['ga','gamma'],theta:['th','theta'],vega:['ve','vega'],breakEven:['be','breakEven'],previousClose:['pcp','previousClose'],bidSize:['bs','bidSize'],askSize:['as','askSize']};
    let changed=false;
    for(const item of arr){
      if(!item || !(item.os||item.optionSymbol))continue;
      const q=normaliseQuote(item);
      if(s.contractSymbols?.size && !s.contractSymbols.has(q.optionSymbol))continue;
      const old=s.quotes.get(q.optionSymbol)||{};
      const next={...old,optionSymbol:q.optionSymbol};
      for(const [field,keys] of Object.entries(sourceKeys)){
        if(keys.some(k=>Object.prototype.hasOwnProperty.call(item,k)))next[field]=q[field];
      }
      if(!old.side&&q.side)next.side=q.side;
      if(!old.name&&q.name)next.name=q.name;
      s.quotes.set(q.optionSymbol,next);changed=true;
    }
    if(changed){s.oiLastUpdate=Date.now();renderAll(s);}
  }

  function getRows(s){return [...s.quotes.values()].sort((a,b)=>a.strike-b.strike||(a.side==='C'?-1:1));}
  function pairedRows(s){
    const map=new Map();
    for(const q of getRows(s)){
      if(!Number.isFinite(q.strike))continue;
      const key=strikeKey(q.strike);if(!map.has(key))map.set(key,{strike:q.strike});
      map.get(key)[q.side]=q;
    }
    return [...map.values()].sort((a,b)=>a.strike-b.strike);
  }

  function calc(s){
    const rows=getRows(s),spot=s.price;
    let callOI=0,putOI=0,oiKnown=0,oiMissing=0,multiplierMissing=0,callVol=0,putVol=0;
    const per=new Map();let delta=spot!==null?0:null,gamma=spot!==null?0:null,vega=0,theta=0;
    for(const q of rows){
      if(q.volume!==null){if(q.side==='C')callVol+=q.volume;else putVol+=q.volume;}
      if(q.openInterest===null){oiMissing++;continue;}
      const oi=q.openInterest, m=q.multiplier, side=q.side;
      oiKnown++;
      if(side==='C')callOI+=oi;else putOI+=oi;
      const p=per.get(strikeKey(q.strike))||{strike:q.strike,gex:0,dex:0,vgex:0,thex:0,callOI:0,putOI:0};
      if(side==='C')p.callOI+=oi;else p.putOI+=oi;
      per.set(strikeKey(q.strike),p);
      if(m===null||!Number.isFinite(m)||m<=0){multiplierMissing++;continue;}
      if(spot!==null && q.gamma!==null){const v=q.gamma*oi*m*spot*spot*.01*(side==='P'?-1:1);p.gex+=v;gamma+=v;}
      if(spot!==null && q.delta!==null){const v=q.delta*oi*m*spot;p.dex+=v;delta+=v;}
      if(q.vega!==null){const v=q.vega*oi*m;p.vgex+=v;vega+=v;}
      if(q.theta!==null){const v=q.theta*oi*m;p.thex+=v;theta+=v;}
    }
    const dist=[...per.values()].sort((a,b)=>a.strike-b.strike);
    const calls=dist.filter(x=>x.callOI>0).sort((a,b)=>b.callOI-a.callOI);
    const puts=dist.filter(x=>x.putOI>0).sort((a,b)=>b.putOI-a.putOI);
    let cumulative=0,flip=null,previous=null;
    for(const x of dist){
      const next=cumulative+x.gex;
      if(previous && ((cumulative<=0&&next>=0)||(cumulative>=0&&next<=0)) && next!==cumulative){
        const ratio=(0-cumulative)/(next-cumulative);flip=previous.strike+(x.strike-previous.strike)*ratio;break;
      }
      cumulative=next;previous=x;
    }
    const totalContracts=Math.max(rows.length,s.contracts.length||0);
    oiMissing=Math.max(oiMissing,totalContracts-oiKnown);
    const validOI=oiKnown,coverage=totalContracts?validOI/totalContracts:0;
    return {rows,dist,callOI,putOI,oiKnown,oiMissing,multiplierMissing,totalContracts,callVol,putVol,volume:callVol+putVol,delta,gamma,vega,theta,
      callWall:calls[0]||null,putWall:puts[0]||null,flip,coverage,oiWall:dist.reduce((best,x)=>{
        const v=Math.max(x.callOI,x.putOI);return v>0&&(!best||v>best.oi)?{strike:x.strike,oi:v}:best;
      },null)};
  }

  function renderAll(s){
    renderKpis(s);renderLevels(s);renderExposure(s);renderGreeks(s);renderOI(s);renderChain(s);updateChainMeta(s);
  }
  function metric(value,label,sub,cls=''){
    return `<div class="opt-metric"><span>${label}</span><strong class="${cls}">${value}</strong><small>${sub||''}</small></div>`;
  }
  function renderKpis(s){
    const c=calc(s),spot=s.price,change=spot!==null&&s.previousClose!==null?spot-s.previousClose:null,changePct=change!==null&&s.previousClose?change/s.previousClose:null;
    const k=$(`so-${s.cfg.key}-kpis`);if(!k)return;
    k.innerHTML=[
      metric(fmt(spot,2),'LAST PRICE',s.cfg.symbol+' · USD'),
      metric(change===null?'—':`${change>=0?'+':''}${fmt(change,2)} (${changePct===null?'—':(changePct*100).toFixed(2)+'%'})`,'CHANGE','So với previous close',change===null?'':change>=0?'pos-t':'neg-t'),
      metric(compact(c.callOI),'CALL OI',`${c.rows.filter(x=>x.side==='C'&&x.openInterest!==null).length} contracts có OI`),
      metric(compact(c.putOI),'PUT OI',`${c.rows.filter(x=>x.side==='P'&&x.openInterest!==null).length} contracts có OI`),
      metric(compact(c.volume),'TOTAL VOLUME',`Call ${compact(c.callVol)} · Put ${compact(c.putVol)}`),
      metric((c.coverage*100).toFixed(1)+'%','OI COVERAGE',`${c.oiKnown}/${c.totalContracts} contracts có OI`,c.oiMissing?'neg-t':'')
    ].join('');
  }
  function renderLevels(s){
    const c=calc(s),el=$(`so-${s.cfg.key}-levels`);if(!el)return;
    const data=[
      ['CALL WALL',c.callWall?fmt(c.callWall.strike,2):'—',c.callWall?`OI ${compact(c.callWall.callOI)}`:'Không có OI Call'],
      ['PUT WALL',c.putWall?fmt(c.putWall.strike,2):'—',c.putWall?`OI ${compact(c.putWall.putOI)}`:'Không có OI Put'],
      ['GAMMA FLIP',c.flip===null?'—':fmt(c.flip,2),c.flip===null?'Không tìm thấy điểm GEX đổi dấu':'Cumulative GEX'],
      ['MAX OI STRIKE',c.oiWall?fmt(c.oiWall.strike,2):'—',c.oiWall?`Max side OI ${compact(c.oiWall.oi)}`:'Chưa có OI']
    ];
    el.innerHTML=data.map(([a,b,d])=>`<div class="opt-level"><span>${a}</span><b>${b}</b><small>${d}</small></div>`).join('');
  }
  function renderExposure(s){
    const c=calc(s),el=$(`so-${s.cfg.key}-gex`);if(!el)return;
    const metricKey=$(`so-${s.cfg.key}-exposure-metric`)?.value||'gamma';
    const config={
      gamma:{field:'gex',title:'Gamma Exposure by Strike',subtitle:'Call + / Put −',units:'USD notional per 1% underlying move · Gamma × OI × multiplier × Spot² × 1%',note:'GEX theo quy ước Call dương, Put âm; đây là quy ước tổng hợp, không phải vị thế dealer đã xác minh.'},
      delta:{field:'dex',title:'Delta Exposure by Strike',subtitle:'Delta native × OI × multiplier × Spot',units:'USD delta notional · Delta × OI × multiplier × Spot',note:'DEX giữ dấu Delta native của Call/Put. OI không cho biết bên nắm giữ đang Long hay Short.'},
      vega:{field:'vgex',title:'Vega Exposure by Strike',subtitle:'Vega native × OI × multiplier',units:'Vega × OI × contract multiplier',note:'Vega là Greek từ quote Binance nhân OI và multiplier; không suy ra vị thế Long/Short.'},
      theta:{field:'thex',title:'Theta Exposure by Strike',subtitle:'Theta native × OI × multiplier',units:'Theta × OI × contract multiplier',note:'Theta giữ dấu Greek native từ Binance; đây không phải P/L dự báo và không suy ra vị thế Long/Short.'}
    }[metricKey]||null;
    const title=$(`so-${s.cfg.key}-exposure-title`),subtitle=$(`so-${s.cfg.key}-exposure-subtitle`),units=$(`so-${s.cfg.key}-exposure-units`),note=$(`so-${s.cfg.key}-exposure-note`);
    if(config){if(title)title.textContent=config.title;if(subtitle)subtitle.textContent=config.subtitle;if(units)units.textContent=config.units;if(note)note.textContent=config.note;}
    const field=config?.field||'gex';
    const data=c.dist.filter(x=>Number.isFinite(x[field])&&x[field]!==0).sort((a,b)=>Math.abs(b[field])-Math.abs(a[field])).slice(0,24).sort((a,b)=>a.strike-b.strike);
    if(!data.length){el.innerHTML=`<div class="opt-empty">Chưa đủ dữ liệu OI và ${esc(metricKey.toUpperCase())} để tính exposure${metricKey==='gamma'||metricKey==='delta'?' (cần cả giá underlying)':''}.</div>`;return;}
    const max=Math.max(...data.map(x=>Math.abs(x[field])),1);
    el.innerHTML=data.map(x=>{
      const value=x[field],w=Math.max(1,Math.abs(value)/max*100),sign=value>=0?'pos':'neg';
      return `<div class="opt-gex-row"><span class="opt-gex-strike">${fmt(x.strike,2)}</span><span class="opt-gex-track"><i class="${sign}" style="width:${w}%"></i></span><b class="${sign}-t">${compact(value)}</b></div>`;
    }).join('');
  }
  function renderGreeks(s){
    const c=calc(s),el=$(`so-${s.cfg.key}-greeks`);if(!el)return;
    const lines=[['Delta Notional',c.delta,'USD'],['Gamma Exposure (1%)',c.gamma,'USD'],['Vega × OI',c.vega,'Greek × contracts'],['Theta × OI',c.theta,'Greek × contracts']];
    el.innerHTML=lines.map(([name,v,u])=>`<div class="opt-greek-line"><span>${name}<small>${u}</small></span><b>${v===null||!Number.isFinite(v)?'—':compact(v)}</b></div>`).join('')+
      `<p class="opt-footnote">Exposure chỉ tổng hợp contract có OI và multiplier hợp lệ. ${c.oiMissing} contract chưa có OI; ${c.multiplierMissing} contract thiếu multiplier nên vẫn tính vào OI nhưng bị loại khỏi Greeks exposure.</p>`;
  }
  function renderOI(s){
    const c=calc(s),el=$(`so-${s.cfg.key}-oi`),wall=$(`so-${s.cfg.key}-oiwall`);if(!el)return;
    if(wall)wall.textContent='OI Wall: '+(c.oiWall?fmt(c.oiWall.strike,2):'—');
    const rows=c.dist.filter(x=>x.callOI+x.putOI>0).sort((a,b)=>a.strike-b.strike);
    if(!rows.length){el.innerHTML='<div class="opt-empty">Không có OI hợp lệ cho expiry này.</div>';return;}
    const max=Math.max(...rows.map(x=>Math.max(x.callOI,x.putOI)),1);
    const visible=(s.price===null?rows:rows.slice().sort((a,b)=>Math.abs(a.strike-s.price)-Math.abs(b.strike-s.price)).slice(0,34)).sort((a,b)=>a.strike-b.strike);
    el.innerHTML=visible.map(x=>`<div class="so-oi-row"><span>${fmt(x.strike,2)}</span><div class="so-oi-bars"><i class="call" style="width:${Math.max(0,x.callOI/max*100)}%"></i><i class="put" style="width:${Math.max(0,x.putOI/max*100)}%"></i></div><b>${compact(x.callOI+x.putOI)}</b></div>`).join('');
  }
  function quoteCell(q,field,format){
    if(!q)return '<td>—</td>';
    const v=q[field];
    if(field==='openInterest'&&v===null)return '<td title="Binance trả OI = null">—</td>';
    return `<td>${format?format(v):v===null?'—':esc(v)}</td>`;
  }
  function quoteSizeCell(q,field){
    if(!q||q[field]===null)return '<td>—</td>';
    const size=q[field+'Size'];
    return `<td>${fmt(q[field],2)} <small>× ${size===null?'—':compact(size)}</small></td>`;
  }
  function renderChain(s){
    const data=pairedRows(s),el=$(`so-${s.cfg.key}-chain`),spot=s.price;if(!el)return;
    if(!data.length){el.innerHTML='<tr><td colspan="19" class="opt-empty">Chưa có contract.</td></tr>';return;}
    const atm=spot===null?null:data.reduce((best,x)=>!best||Math.abs(x.strike-spot)<Math.abs(best.strike-spot)?x:best,null);
    el.innerHTML=data.map(x=>{
      const c=x.C,p=x.P,atmClass=atm&&x.strike===atm.strike?'atm':'';
      return `<tr class="${atmClass}">
        ${quoteSizeCell(c,'bid')}${quoteSizeCell(c,'ask')}
        ${quoteCell(c,'mid',v=>fmt(v,2))}${quoteCell(c,'last',v=>fmt(v,2))}
        ${quoteCell(c,'volume',v=>compact(v))}${quoteCell(c,'openInterest',v=>compact(v))}
        ${quoteCell(c,'iv',v=>pct(v))}${quoteCell(c,'delta',v=>fmt(v,4))}${quoteCell(c,'gamma',v=>fmt(v,5))}
        <td class="strike">${fmt(x.strike,2)}${atmClass?'<small>ATM</small>':''}</td>
        ${quoteCell(p,'gamma',v=>fmt(v,5))}${quoteCell(p,'delta',v=>fmt(v,4))}${quoteCell(p,'iv',v=>pct(v))}
        ${quoteCell(p,'openInterest',v=>compact(v))}${quoteCell(p,'volume',v=>compact(v))}
        ${quoteCell(p,'last',v=>fmt(v,2))}${quoteCell(p,'mid',v=>fmt(v,2))}
        ${quoteSizeCell(p,'ask')}${quoteSizeCell(p,'bid')}
      </tr>`;
    }).join('');
    $(`so-${s.cfg.key}-rows-count`).textContent=`${s.quotes.size} option contracts · ${data.length} strikes`;
  }
  function updateChainMeta(s){
    const c=calc(s),el=$(`so-${s.cfg.key}-chain-meta`);if(!el)return;
    el.innerHTML=`<span>Expiry: <b>${esc(s.expiry||'—')}</b></span><span>Contracts: <b>${s.contracts.length||s.quotes.size}</b></span><span>Quotes: <b>${s.quotes.size}</b></span><span>OI available: <b>${c.oiKnown}</b></span><span>OI unavailable: <b>${c.oiMissing}</b></span><span>Last quote update: <b>${s.oiLastUpdate?new Date(s.oiLastUpdate).toLocaleTimeString('vi-VN'):'—'}</b></span>`;
    const multiplier=[...s.quotes.values()].find(x=>x.multiplier!==null && x.multiplier>0)?.multiplier??null;
    const mult=$(`so-${s.cfg.key}-multiplier`),toolbarMult=$(`so-${s.cfg.key}-contract-multiplier`);
    if(mult)mult.textContent=multiplier?`${fmt(multiplier,0)} shares`:'—';
    if(toolbarMult)toolbarMult.textContent=multiplier?`${fmt(multiplier,0)} shares`:'—';
    const meta=$(`so-${s.cfg.key}-meta`);if(meta)meta.innerHTML=`<span>REST: chain-symbols + get-option-quote</span><span>Options feed: delayed / access-dependent</span><span>Multiplier from quote: ${multiplier??'—'}</span><span>${c.oiMissing} contracts without usable OI</span><span>${c.multiplierMissing} contracts without multiplier (excluded from exposure)</span><span>Underlying WS: ${s.socket&&s.socket.readyState===WebSocket.OPEN?'connected':'connecting / closed'}</span><span>Chart candles received: ${s.candlesSeen}</span>`;
  }

  function createChart(s){
    const cfg=s.cfg,container=$(`so-${cfg.key}-chart`);
    if(!container||s.chart||!window.LightweightCharts)return;
    const css=getComputedStyle(document.documentElement),ink=css.getPropertyValue('--ink').trim()||'#f5f5f5',mut=css.getPropertyValue('--mut').trim()||'#999',line=css.getPropertyValue('--line').trim()||'#333';
    const chart=LightweightCharts.createChart(container,{width:container.clientWidth||600,height:container.clientHeight||330,
      layout:{background:{type:'solid',color:'rgba(0,0,0,0)'},textColor:ink,fontFamily:'Space Grotesk, sans-serif'},
      grid:{vertLines:{color:line},horzLines:{color:line}},
      rightPriceScale:{borderColor:line,scaleMargins:{top:.08,bottom:.08}},
      timeScale:{borderColor:line,timeVisible:true,secondsVisible:false,rightOffset:5},
      crosshair:{mode:LightweightCharts.CrosshairMode?.Normal??0,vertLine:{color:mut},horzLine:{color:mut}},
      handleScroll:{mouseWheel:true,pressedMouseMove:true},handleScale:{mouseWheel:true,pinch:true}
    });
    const series=chart.addCandlestickSeries({upColor:'#22b58c',downColor:'#e45369',borderUpColor:'#22b58c',borderDownColor:'#e45369',wickUpColor:'#22b58c',wickDownColor:'#e45369',priceLineVisible:true});
    s.chart=chart;s.candleSeries=series;
    if(s.lastCandle){try{series.setData([s.lastCandle])}catch{}}
    s.chartResize=()=>{if(!s.chart)return;const w=container.clientWidth,h=container.clientHeight;if(w&&h)s.chart.applyOptions({width:w,height:h});};
    window.addEventListener('resize',s.chartResize);
    try{chart.timeScale().fitContent()}catch{}
  }

  function updateCandle(s, payload){
    const k=payload.k||payload;
    const ts=num(k.t??k.time??payload.t);
    const open=num(k.o??k.open),high=num(k.h??k.high),low=num(k.l??k.low),close=num(k.c??k.close),volume=num(k.v??k.volume);
    if(ts===null||open===null||high===null||low===null||close===null)return;
    const time=Math.floor(ts>1e12?ts/1000:ts);
    const candle={time,open,high,low,close};
    s.lastCandle=candle;
    if(!s.chart)createChart(s);
    if(s.candleSeries){try{s.candleSeries.update(candle)}catch(e){
      // On a newly selected interval, discard the previous series timestamp before accepting a new stream.
      try{s.candleSeries.setData([candle])}catch{}
    }}
    s.candlesSeen++;
    const empty=$(`so-${s.cfg.key}-chart-empty`);if(empty)empty.hidden=true;
    const meta=$(`so-${s.cfg.key}-chart-meta`);if(meta)meta.textContent=`Binance Equity Kline · ${s.interval} · ${new Date(time*1000).toLocaleString('vi-VN')}`;
    const ohlc=$(`so-${s.cfg.key}-chart-ohlc`);if(ohlc)ohlc.textContent=`O ${fmt(open,2)} · H ${fmt(high,2)} · L ${fmt(low,2)} · C ${fmt(close,2)}${volume!==null?' · V '+compact(volume):''}`;
  }
  function handlePrice(s, data){
    const rows=Array.isArray(data?.rates)?data.rates:Array.isArray(data)?data:[data];
    const hit=rows.find(x=>x && ((x.ac??x.assetCode)===s.cfg.assetCode||(x.s??x.symbol)===s.cfg.symbol));
    if(!hit)return;
    s.price=num(hit.p??hit.price??hit.c??hit.close);
    s.previousClose=num(hit.pc??hit.prevClose??hit.lrc??hit.lastRegularClose??hit.prc??hit.prevRegularClose);
    s.phase=hit.mp||hit.marketPhase||s.phase;
    s.priceTime=num(hit.t??hit.time??hit.E??hit.eventTime)||Date.now();
    const price=$(`so-${s.cfg.key}-price`),change=$(`so-${s.cfg.key}-change`),prev=$(`so-${s.cfg.key}-prev`),phase=$(`so-${s.cfg.key}-phase`),updated=$(`so-${s.cfg.key}-updated`);
    if(price)price.textContent=fmt(s.price,2);
    const diff=s.price!==null&&s.previousClose!==null?s.price-s.previousClose:null,p=diff!==null&&s.previousClose?diff/s.previousClose:null;
    if(change){change.textContent=diff===null?'Chưa có giá đối chiếu':`${diff>=0?'+':''}${fmt(diff,2)} (${p===null?'—':(p*100).toFixed(2)+'%'})`;change.className='so-quote-change '+(diff===null?'':diff>=0?'pos-t':'neg-t');}
    if(prev)prev.textContent=fmt(s.previousClose,2);if(phase)phase.textContent=esc(s.phase||'—');if(updated)updated.textContent=new Date(s.priceTime).toLocaleTimeString('vi-VN');
    renderKpis(s);renderLevels(s);renderExposure(s);renderGreeks(s);renderOI(s);renderChain(s);
  }

  function subscribe(s){
    if(!s.active)return;
    closeSocket(s);
    let ws;
    try{ws=new WebSocket(WS_URL);}catch(e){scheduleReconnect(s);return;}
    s.socket=ws;
    ws.onopen=()=>{
      s.reconnectDelay=1000;
      const params=[`${s.cfg.assetCode}@symbol_price`,`${s.cfg.symbol}@kline_${s.interval}`,`${s.cfg.symbol}@tradingStatus`,`${s.cfg.symbol}@tradability`];
      s.streamNames=params;
      if(s.expiry){const root=s.expirations.find(x=>x.date===s.expiry)?.root||s.cfg.root;const d=s.expiry.replace(/-/g,'');params.push(`${s.cfg.symbol}_${d}_${root}@optionChainQuoteDelayed`);s.streamNames=params;}
      ws.send(JSON.stringify({method:'SUBSCRIBE',params,id:s.requestId++}));
      setStatus(s,`Connected · ${s.cfg.symbol} · ${s.interval}`,'ok');
    };
    ws.onmessage=ev=>{
      let msg;try{msg=JSON.parse(ev.data)}catch{return;}
      const stream=String(msg.stream||''),data=msg.data??msg;
      if(stream.endsWith('@symbol_price')||stream==='price'||data.rates||data.ac)handlePrice(s,data);
      else if(stream.includes('@kline_')||data.k||data.e==='kline')updateCandle(s,data);
      else if(stream.includes('@optionChainQuote')){
        const items=[data.q,data.t,data.g,data.v].find(Array.isArray)||data.data||data.quotes||data.list||data;
        mergeLiveQuote(s,items);
      }
    };
    ws.onerror=()=>setStatus(s,'WebSocket lỗi · đang thử kết nối lại','bad');
    ws.onclose=()=>{if(s.active){setStatus(s,'Mất kết nối · reconnect…','loading');scheduleReconnect(s);}};
  }
  function closeSocket(s){
    if(s.socket){try{s.socket.onclose=null;s.socket.close(1000,'stock-options inactive')}catch{}s.socket=null;}
    if(s.reconnectTimer){clearTimeout(s.reconnectTimer);s.reconnectTimer=null;}
  }
  function scheduleReconnect(s){
    if(!s.active||s.reconnectTimer)return;
    const wait=s.reconnectDelay||1000;s.reconnectDelay=Math.min(30000,wait*2);
    s.reconnectTimer=setTimeout(()=>{s.reconnectTimer=null;if(s.active)subscribe(s);},wait);
  }
  function syncOptionStream(s){
    if(!s.active||!s.socket||s.socket.readyState!==WebSocket.OPEN)return;
    const old=s.streamNames.filter(x=>x.includes('@optionChainQuote'));
    if(old.length)s.socket.send(JSON.stringify({method:'UNSUBSCRIBE',params:old,id:s.requestId++}));
    const base=s.streamNames.filter(x=>!x.includes('@optionChainQuote'));
    if(!s.expiry){s.streamNames=base;return;}
    const root=s.expirations.find(x=>x.date===s.expiry)?.root||s.cfg.root,d=s.expiry.replace(/-/g,'');
    const name=`${s.cfg.symbol}_${d}_${root}@optionChainQuoteDelayed`;
    s.socket.send(JSON.stringify({method:'SUBSCRIBE',params:[name],id:s.requestId++}));s.streamNames=[...base,name];
  }

  async function refreshQuotes(s){
    if(!s.active||!s.expiry||s.quoteLoading)return;
    s.quoteLoading=true;
    try{await loadChain(s);}catch(e){showError(s,e.message);setStatus(s,'Quote refresh lỗi','bad');}
    finally{s.quoteLoading=false;}
  }
  function startPolling(s){
    if(s.pollTimer)clearInterval(s.pollTimer);
    s.pollTimer=setInterval(()=>refreshQuotes(s),60000);
  }

  async function activate(s){
    if(s.active)return;
    s.active=true;
    clearError(s);
    requestAnimationFrame(()=>{ if(s.active){ createChart(s); s.chartResize?.(); } });
    setStatus(s,'Đang kết nối Binance…','loading');
    try{
      const exps=await loadExpirations(s);
      const select=$(`so-${s.cfg.key}-expiry`);
      if(select){select.innerHTML=exps.map(x=>`<option value="${esc(x.date)}">${esc(dateLabel(x.date))} · ${esc(x.root)}</option>`).join('');
        const today=isoTodayNY(),preferred=exps.find(x=>x.date>=today)||exps[0];s.expiry=preferred.date;select.value=s.expiry;}
      subscribe(s);
      await loadChain(s);
      startPolling(s);
      setStatus(s,`Connected · ${s.quotes.size} option quotes`,'ok');
    }catch(e){showError(s,e.message);setStatus(s,'Không tải được dữ liệu','bad');}
  }
  function deactivate(s){
    s.active=false;closeSocket(s);
    if(s.pollTimer){clearInterval(s.pollTimer);s.pollTimer=null;}
    if(s.chartResize){window.removeEventListener('resize',s.chartResize);s.chartResize=null;}
    if(s.chart){try{s.chart.remove()}catch{}s.chart=null;s.candleSeries=null;}
  }
  function changeInterval(s,next){
    if(!intervals.includes(next)||s.interval===next)return;
    const old=`${s.cfg.symbol}@kline_${s.interval}`;s.interval=next;
    const view=$(`v-${s.cfg.key}Options`);view?.querySelectorAll('[data-so-interval]').forEach(b=>b.classList.toggle('on',b.dataset.soInterval===next));
    if(s.socket?.readyState===WebSocket.OPEN){s.socket.send(JSON.stringify({method:'UNSUBSCRIBE',params:[old],id:s.requestId++}));s.socket.send(JSON.stringify({method:'SUBSCRIBE',params:[`${s.cfg.symbol}@kline_${next}`],id:s.requestId++}));}
    if(s.candleSeries){try{s.candleSeries.setData([])}catch{}}
    s.lastCandle=null;s.candlesSeen=0;
    const empty=$(`so-${s.cfg.key}-chart-empty`);if(empty)empty.hidden=false;
    const meta=$(`so-${s.cfg.key}-chart-meta`);if(meta)meta.textContent=`Đang chờ ${next} candle từ Binance…`;
    const feed=$(`so-${s.cfg.key}-chart-feed`);if(feed)feed.textContent=`Kline stream · ${s.cfg.symbol} · ${next}`;
  }
  function bindView(s){
    const p='so-'+s.cfg.key,view=$('v-'+s.cfg.key+'Options');if(!view||view.dataset.stockOptionsBound)return;
    view.dataset.stockOptionsBound='1';
    $(`${p}-refresh`).onclick=()=>{clearError(s);refreshQuotes(s);};
    $(`${p}-expiry`).onchange=e=>{s.expiry=e.target.value;loadChain(s).catch(err=>{showError(s,err.message);setStatus(s,'Không tải được expiry','bad')});};
    view.querySelectorAll('[data-so-interval]').forEach(b=>b.onclick=()=>changeInterval(s,b.dataset.soInterval));
    $(`${p}-method-toggle`).onclick=()=>{const box=$(`${p}-method`);box.hidden=!box.hidden;};
    $(`${p}-exposure-metric`).onchange=()=>renderExposure(s);
    $(`${p}-copy`).onclick=()=>{
      const c=calc(s),text=[`${s.cfg.symbol} · ${s.expiry}`,`Call Wall: ${c.callWall?.strike??'—'}`,`Put Wall: ${c.putWall?.strike??'—'}`,`Gamma Flip: ${c.flip??'—'}`,`Call OI: ${c.callOI}`,`Put OI: ${c.putOI}`,`GEX: ${c.gamma}`,`DEX: ${c.delta}`,`OI coverage: ${(c.coverage*100).toFixed(1)}%`].join('\n');
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).catch(()=>{});else{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}
    };
  }

  function setActive(viewKey){
    for(const s of Object.values(sessions)){
      if(s.cfg.key+'Options'===viewKey)activate(s);
      else if(s.active)deactivate(s);
    }
  }

  buildViews();
  window.stockOptionsSetActive=setActive;
  window.stockOptionsDebug=()=>Object.fromEntries(Object.values(sessions).map(s=>[s.cfg.symbol,{expiry:s.expiry,quotes:s.quotes.size,oi:[...s.quotes.values()].filter(q=>q.openInterest!==null).length,price:s.price,interval:s.interval}]));
})();
