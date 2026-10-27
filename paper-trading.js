/* Gexadecimal Paper Trading v4
 * Local simulation only: never sends orders to cTrader.
 * Separate Live/Replay account books; netting by symbol; Replay executes on replay steps.
 */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id), LIVE_KEY='gx_paper_live_v2', REPLAY_KEY='gx_paper_replay_v2';
  const START_BALANCE=10000;
  const freshBook=(name='Paper Account')=>({id:'pa_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),name,balance:START_BALANCE,nextId:1,positions:[],pending:[],history:[],lastReplayTime:null});
  const readBooks=key=>{try{const x=JSON.parse(localStorage.getItem(key)||'null');if(x&&Array.isArray(x.accounts)&&x.accounts.length)return x; }catch{}if(key===LIVE_KEY){try{const old=JSON.parse(localStorage.getItem('gx_paper_v1')||'null');if(old&&typeof old==='object'){const a={...freshBook('Live Paper 1'),...old,id:'pa_migrated_live',name:'Live Paper 1',lastReplayTime:null};return {activeId:a.id,accounts:[a]}}}catch{}}const a=freshBook(key===REPLAY_KEY?'Replay Account 1':'Live Paper 1');return {activeId:a.id,accounts:[a]}};
  let books={live:readBooks(LIVE_KEY),replay:readBooks(REPLAY_KEY)}, mode='live', drag=null, overlay=null, panel=null, quick=null, activeTab='open', lastReplayStamp=null;
  let state,rowsKey='';
  const UI_KEY='gx_paper_ui';let ui={collapsed:false,ticket:'full',x:null,y:null},qd=null;try{Object.assign(ui,JSON.parse(localStorage.getItem(UI_KEY)||'{}'))}catch{}
  const saveUi=()=>{try{localStorage.setItem(UI_KEY,JSON.stringify(ui))}catch{}};
  const money=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const digits=()=>typeof window.PDIG==='function'?PDIG():2, fmt=p=>Number(p).toFixed(digits());
  const persist=()=>{try{localStorage.setItem(LIVE_KEY,JSON.stringify(books.live));localStorage.setItem(REPLAY_KEY,JSON.stringify(books.replay))}catch{}}
  const book=()=>books[mode], active=()=>book().accounts.find(a=>a.id===book().activeId)||book().accounts[0];
  function useActive(){state=active();if(state&&!Array.isArray(state.pending))state.pending=[];}
  const symbol=()=>String((typeof C!=='undefined'&&C.sym)||'SYMBOL'), isCur=p=>p.symbol===symbol();
  function livePrice(){const a=typeof agg!=='undefined'&&Array.isArray(agg)?agg:[],c=a[a.length-1],mid=Number(c?.close)||0,b=typeof CT!=='undefined'?Number(CT.bid)/1e5:0,ask=typeof CT!=='undefined'?Number(CT.ask)/1e5:0;return {mid:mid||(b>0&&ask>0?(b+ask)/2:0),bid:b>0?b:mid,ask:ask>0?ask:mid,high:Number(c?.high)||mid,low:Number(c?.low)||mid,stamp:Number(c?.time)||null,source:'live'};}
  function replayPrice(){if(!(typeof RP!=='undefined'&&RP.on)||!(typeof m1!=='undefined'&&Array.isArray(m1)&&m1.length))return {mid:0,bid:0,ask:0,high:0,low:0,stamp:null,source:'replay'};const c=m1[m1.length-1];if(!Array.isArray(c))return {mid:0,bid:0,ask:0,high:0,low:0,stamp:null,source:'replay'};const o=Number(c[1])||0,h=Number(c[2])||o,l=Number(c[3])||o,cl=Number(c[4])||o;return {mid:cl,bid:cl,ask:cl,high:h,low:l,open:o,stamp:Number(c[0])||null,source:'replay'};}
  const price=()=>mode==='replay'?replayPrice():livePrice();
  function mount(){
    panel=document.createElement('div');panel.id='paperPanel';panel.innerHTML=`<div class="pp-head"><div class="pp-title">Paper Trading<span class="paper-netting-badge">NETTING</span></div><div class="pp-seg" role="group" aria-label="Chế độ"><button type="button" data-pmode="live" class="on">Live</button><button type="button" data-pmode="replay">Replay</button></div><button id="paperTicket" type="button" class="pp-ic on" aria-pressed="true" title="Ẩn/hiện ticket Buy/Sell trên chart">Ticket</button><button id="paperToggle" type="button" class="pp-ic" aria-expanded="true">Ẩn</button></div>
    <small id="paperModeNote" class="pp-note"></small>
    <div class="pp-body"><div class="pp-acc"><select id="paperAccount" aria-label="Tài khoản"></select><button id="paperNewAccount" type="button">+ Mới</button><button id="paperRename" type="button">Đổi tên</button></div>
    <div class="paper-account"><div><span>Số dư</span><b id="paperBalance">$10,000.00</b></div><div><span>Equity</span><b id="paperEquity">$10,000.00</b></div><div><span>P/L mở</span><b id="paperOpenPL">$0.00</b></div><div><span>Free margin*</span><b id="paperFree">$10,000.00</b></div></div>
    <div class="paper-controls"><label>Khối lượng<input id="paperQty" type="number" min="0.01" step="0.01" value="1"></label><label>SL (khoảng giá)<input id="paperSL" type="number" min="0" step="0.1" value="5" title="0 = không đặt SL"></label><label>TP (khoảng giá)<input id="paperTP" type="number" min="0" step="0.1" value="10" title="0 = không đặt TP"></label></div>
    <div class="pp-go"><button id="paperSell" type="button" class="paper-sell">Sell Market</button><button id="paperBuy" type="button" class="paper-buy">Buy Market</button></div>
    <details class="pp-pend"><summary>Lệnh chờ Limit / Stop</summary><div class="paper-pending-controls"><label>Loại lệnh<select id="paperOrderType"><option value="limit">Limit</option><option value="stop">Stop</option></select></label><label>Giá vào lệnh<input id="paperEntry" type="number" step="any" inputmode="decimal" placeholder="Giá entry"></label><div class="pp-go"><button id="paperPendingSell" type="button" class="paper-sell">Sell pending</button><button id="paperPendingBuy" type="button" class="paper-buy">Buy pending</button></div></div></details>
    <div id="paperRisk" class="paper-risk">Risk: — · Reward: — · R:R —</div>
    <div class="paper-tabs"><button class="active" data-ptab="open">Vị thế (<span id="paperCount">0</span>)</button><button data-ptab="pending">Lệnh chờ (<span id="paperPendingCount">0</span>)</button><button data-ptab="history">Lịch sử</button><button id="paperReset">Reset tài khoản</button></div><div id="paperRows"></div>
    <details class="pp-info"><summary>Lưu ý về mô hình</summary><div class="paper-note">NETTING: mỗi mã chỉ có một vị thế ròng. Lệnh ngược chiều bù trừ vị thế hiện tại, phần dư mới đảo chiều. Kéo nhãn Entry/SL/TP trên chart để chỉnh. *Free margin chỉ để tham khảo; mô hình chưa tính margin, commission, swap.</div></details></div>`;
    const chartCard=$('chartCard');if(chartCard)chartCard.insertAdjacentElement('afterend',panel);else document.body.appendChild(panel);
    overlay=document.createElement('div');overlay.id='paperLines';const cw=$('cw');if(cw)cw.appendChild(overlay);
    quick=document.createElement('div');quick.id='paperQuick';quick.innerHTML=`<span class="pq-grip" title="Kéo để di chuyển"><svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="3" r="1.3"/><circle cx="8" cy="3" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="2" cy="13" r="1.3"/><circle cx="8" cy="13" r="1.3"/></g></svg></span><button type="button" id="pqSell" class="pq-btn pq-sell">Sell<small id="pqBid">—</small></button><label class="pq-qty"><input id="pqQty" type="number" min="0.01" step="0.01" value="1" inputmode="decimal" aria-label="Khối lượng"></label><button type="button" id="pqBuy" class="pq-btn pq-buy">Buy<small id="pqAsk">—</small></button><button type="button" id="pqMin" class="pq-min" title="Thu nhỏ" aria-label="Thu nhỏ">–</button><button type="button" id="pqChip" class="pq-chip">Buy / Sell</button>`;if(cw)cw.appendChild(quick);
    panel.querySelectorAll('[data-pmode]').forEach(b=>b.onclick=()=>{mode=b.dataset.pmode;useActive();activeTab='open';panel.querySelectorAll('[data-ptab]').forEach(x=>x.classList.toggle('active',x.dataset.ptab===activeTab));render();});
    $('paperAccount').onchange=()=>{book().activeId=$('paperAccount').value;useActive();render()};
    $('paperNewAccount').onclick=()=>{const n=prompt('Tên tài khoản Paper mới:',`${mode==='replay'?'Replay':'Live Paper'} ${book().accounts.length+1}`);if(n===null)return;const a=freshBook(n.trim()||`Paper ${book().accounts.length+1}`);book().accounts.push(a);book().activeId=a.id;useActive();persist();render()};
    $('paperRename').onclick=()=>{const n=prompt('Tên tài khoản:',state.name);if(n===null)return;state.name=n.trim()||state.name;persist();render()};
    $('paperToggle').onclick=()=>{ui.collapsed=!ui.collapsed;saveUi();applyCollapsed()};
    $('pqBuy').onclick=()=>{syncQuick();openTrade('buy')};$('pqSell').onclick=()=>{syncQuick();openTrade('sell')};$('pqQty').addEventListener('input',()=>{$('paperQty').value=$('pqQty').value;renderRisk()});$('paperQty').addEventListener('input',()=>{$('pqQty').value=$('paperQty').value});
    $('paperBuy').onclick=()=>openTrade('buy');$('paperSell').onclick=()=>openTrade('sell');$('paperPendingBuy').onclick=()=>placePending('buy');$('paperPendingSell').onclick=()=>placePending('sell');['paperQty','paperSL','paperTP','paperEntry','paperOrderType'].forEach(id=>$(id).addEventListener('input',renderRisk));
    panel.querySelectorAll('[data-ptab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.ptab;panel.querySelectorAll('[data-ptab]').forEach(x=>x.classList.toggle('active',x===b));renderRows(activeTab)});
    $('paperReset').onclick=()=>{if(!confirm(`Reset “${state.name}” về $${money(START_BALANCE)}? Toàn bộ vị thế, lệnh chờ và lịch sử của tài khoản này sẽ bị xoá.`))return;const name=state.name,id=state.id;state={...freshBook(name),id};state.balance=START_BALANCE;book().accounts[book().accounts.findIndex(a=>a.id===id)]=state;useActive();persist();render()};
    overlay.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-drag]');if(!h)return;const id=Number(h.dataset.id),field=h.dataset.drag,p=field==='entry'?state.pending.find(x=>x.id===id):state.positions.find(x=>x.id===id)||state.pending.find(x=>x.id===id);if(!p)return;drag={id,field,collection:field==='entry'?'pending':(state.positions.some(x=>x.id===id)?'positions':'pending'),pointerId:e.pointerId};try{h.setPointerCapture(e.pointerId)}catch{}e.preventDefault()});
    window.addEventListener('pointermove',e=>{if(!drag)return;const p=(drag.collection==='pending'?state.pending:state.positions).find(x=>x.id===drag.id);if(!p)return;const r=$('chart').getBoundingClientRect(),y=e.clientY-r.top;try{const v=cs.coordinateToPrice(y);if(Number.isFinite(v)){p[drag.field]=v;drawLines();renderRows(activeTab)}}catch{}});
    window.addEventListener('pointerup',finishDrag);window.addEventListener('pointercancel',finishDrag);window.addEventListener('resize',drawLines);
    let raf=0;const sched=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(state&&(state.positions.length||state.pending.length))drawLines()})};['wheel','pointermove','touchmove'].forEach(n=>{const el=$('chart');if(el)el.addEventListener(n,sched,{passive:true})});try{chart.timeScale().subscribeVisibleLogicalRangeChange(sched)}catch{}
    window.__paperSyncQuick=syncQuick;
    // Live simulation polls only in Live Paper. Replay execution is event-driven from replay.js.
    setInterval(()=>{updateQuotes();if(mode!=='live')return;useActive();if(!state.positions.length&&!state.pending.length)return;const q=livePrice();if(!(q.mid>0))return;const sig=()=>state.positions.length+'/'+state.pending.length+'/'+state.history.length,n0=sig();processMarket(q,false);render();if(sig()!==n0)persist()},250);
    window.__paperReplayStep=onReplayStep;
function placeTicket(){const cw=$('cw');if(!cw||!quick)return;quick.hidden=ui.ticket==='off';quick.classList.toggle('min',ui.ticket==='min');const t=$('paperTicket');if(t){t.classList.toggle('on',ui.ticket!=='off');t.setAttribute('aria-pressed',String(ui.ticket!=='off'))}
      if(ui.ticket==='off')return;const W=cw.clientWidth,H=cw.clientHeight,w=quick.offsetWidth,h=quick.offsetHeight;if(!W||!w)return;
      const x=Math.min(Math.max(0,ui.x==null?56:ui.x),Math.max(0,W-w)),y=Math.min(Math.max(0,ui.y==null?8:ui.y),Math.max(0,H-h));quick.style.left=x+'px';quick.style.top=y+'px';if(ui.x!=null){ui.x=x;ui.y=y}}
    function applyCollapsed(){panel.classList.toggle('collapsed',ui.collapsed);const b=$('paperToggle');b.textContent=ui.collapsed?'Hiện':'Ẩn';b.setAttribute('aria-expanded',String(!ui.collapsed))}
    quick.addEventListener('pointerdown',e=>{if(!e.target.closest('.pq-grip'))return;const r=quick.getBoundingClientRect();qd={dx:e.clientX-r.left,dy:e.clientY-r.top,id:e.pointerId};try{quick.setPointerCapture(e.pointerId)}catch{}quick.classList.add('drag');e.preventDefault()});
    quick.addEventListener('pointermove',e=>{if(!qd||e.pointerId!==qd.id)return;const c=$('cw').getBoundingClientRect();ui.x=e.clientX-c.left-qd.dx;ui.y=e.clientY-c.top-qd.dy;placeTicket()});
    const endQ=()=>{if(!qd)return;qd=null;quick.classList.remove('drag');saveUi()};quick.addEventListener('pointerup',endQ);quick.addEventListener('pointercancel',endQ);
    $('pqMin').onclick=()=>{ui.ticket='min';saveUi();placeTicket()};$('pqChip').onclick=()=>{ui.ticket='full';saveUi();placeTicket()};$('paperTicket').onclick=()=>{ui.ticket=ui.ticket==='off'?'full':'off';saveUi();placeTicket()};
    window.addEventListener('resize',placeTicket);if(cw&&typeof ResizeObserver==='function')new ResizeObserver(placeTicket).observe(cw);
    applyCollapsed();placeTicket();
    useActive();render();
    function syncQuick(){ $('paperQty').value=$('pqQty').value; }
    function finishDrag(){if(!drag)return;drag=null;persist();render()}
  }
  function openTrade(side){useActive();const q=price();if(mode==='replay'&&!(typeof RP!=='undefined'&&RP.on)){alert('Bật Replay trước khi đặt lệnh Replay Paper.');return}const entry=side==='buy'?q.ask:q.bid;if(!(entry>0)){alert('Chưa có giá hợp lệ cho chế độ đang chọn.');return}const qty=validQty();if(!qty)return;const sd=dist('paperSL'),td=dist('paperTP'),p={id:state.nextId++,symbol:symbol(),side,qty,entry,sl:sd?(side==='buy'?entry-sd:entry+sd):null,tp:td?(side==='buy'?entry+td:entry-td):null,opened:Date.now(),mark:entry};applyNetting(p,entry,'Market');persist();render()}
  function validQty(){const n=Number($('paperQty').value);if(!Number.isFinite(n)||n<=0){alert('Khối lượng phải lớn hơn 0.');return 0}return Math.max(.01,n)}
  function dist(id){const n=Number($(id).value);return Number.isFinite(n)&&n>0?n:0}
  function placePending(side){useActive();const q=price(),entry=Number($('paperEntry').value),type=$('paperOrderType').value;if(mode==='replay'&&!(typeof RP!=='undefined'&&RP.on)){alert('Bật Replay trước khi đặt lệnh Replay Paper.');return}if(!(q.mid>0)||!(entry>0)){alert('Nhập giá entry hợp lệ và bảo đảm chart đã có giá.');return}const valid=type==='limit'?(side==='buy'?entry<q.mid:entry>q.mid):(side==='buy'?entry>q.mid:entry<q.mid);if(!valid){alert(type==='limit'?'Buy Limit phải thấp hơn giá hiện tại; Sell Limit phải cao hơn giá hiện tại.':'Buy Stop phải cao hơn giá hiện tại; Sell Stop phải thấp hơn giá hiện tại.');return}const qty=validQty();if(!qty)return;const sd=dist('paperSL'),td=dist('paperTP');state.pending.push({id:state.nextId++,symbol:symbol(),side,type,qty,entry,sl:sd?(side==='buy'?entry-sd:entry+sd):null,tp:td?(side==='buy'?entry+td:entry-td):null,created:Date.now()});persist();render()}
  const pnl=(p,mark)=>(p.side==='buy'?mark-p.entry:p.entry-mark)*p.qty;
  function closePosition(p,exit,reason){const i=state.positions.findIndex(x=>x.id===p.id);if(i<0)return;const x=state.positions.splice(i,1)[0],profit=pnl(x,exit);state.balance+=profit;state.history.unshift({...x,exit,profit,reason,closed:Date.now()});state.history=state.history.slice(0,500)}
  function applyNetting(order,fill,reason){const same=state.positions.find(p=>p.symbol===order.symbol);if(!same){state.positions.push({...order,entry:fill,mark:fill,opened:Date.now()});return}
    if(same.side===order.side){const total=same.qty+order.qty;same.entry=((same.entry*same.qty)+(fill*order.qty))/total;same.qty=total;same.mark=fill;if(order.sl!=null)same.sl=order.sl;if(order.tp!=null)same.tp=order.tp;same.addedAt=Date.now();return}
    const closeQty=Math.min(same.qty,order.qty),realized=(same.side==='buy'?fill-same.entry:same.entry-fill)*closeQty;state.balance+=realized;
    state.history.unshift({...same,qty:closeQty,exit:fill,profit:realized,reason:`Netting · ${reason}`,closed:Date.now()});state.history=state.history.slice(0,500);
    same.qty-=closeQty;const residual=order.qty-closeQty;
    if(same.qty<=1e-8)state.positions=state.positions.filter(p=>p!==same);else same.mark=fill;
    if(residual>1e-8)state.positions.push({...order,qty:residual,entry:fill,mark:fill,opened:Date.now()});
  }
  function processMarket(q,isReplay){if(!(q.mid>0))return;const hi=isReplay?(q.high||q.mid):q.mid,lo=isReplay?(q.low||q.mid):q.mid;
    for(const o of state.pending.filter(isCur)){const touched=o.type==='limit'?(o.side==='buy'?lo<=o.entry:hi>=o.entry):(o.side==='buy'?hi>=o.entry:lo<=o.entry);if(!touched)continue;state.pending=state.pending.filter(x=>x.id!==o.id);applyNetting(o,o.entry,`${o.type.toUpperCase()} pending`)}
    for(const p of state.positions.filter(isCur)){p.mark=p.side==='buy'?(q.bid||q.mid):(q.ask||q.mid);let exit=null,why='';const slHit=p.sl!=null&&(p.side==='buy'?lo<=p.sl:hi>=p.sl),tpHit=p.tp!=null&&(p.side==='buy'?hi>=p.tp:lo<=p.tp);
      // OHLC cannot reveal the order when both are touched; pessimistically assume SL first.
      if(slHit){exit=p.sl;why='SL'}else if(tpHit){exit=p.tp;why='TP'}if(exit!=null)closePosition(p,exit,why)}
    if(isReplay&&q.stamp!=null)state.lastReplayTime=q.stamp;
  }
  function onReplayStep(candle){if(mode!=='replay')return;useActive();if(!(typeof RP!=='undefined'&&RP.on)||!(typeof m1!=='undefined'&&Array.isArray(m1)))return;const q=replayPrice();if(!(q.mid>0)||q.stamp==null)return;
    // Process every newly revealed M1 candle, including when the replay slider jumps forward.
    // Seeking backwards resets this replay account and deterministically rebuilds it from the replay start.
    if(state.lastReplayTime!=null&&q.stamp<state.lastReplayTime){const id=state.id,name=state.name;Object.assign(state,{id,name,balance:START_BALANCE,nextId:1,positions:[],pending:[],history:[],lastReplayTime:null});showNotice('Replay đã tua lùi: tài khoản Replay Paper được tính lại từ đầu Replay.');}
    const start=Number(RP.startSt)||0,hadLast=state.lastReplayTime!=null,from=hadLast?state.lastReplayTime:start;
    for(const c of m1){if(!Array.isArray(c))continue;const stamp=Number(c[0]);if(!((hadLast?stamp>from:stamp>=from)&&stamp<=q.stamp))continue;const o=Number(c[1])||0,hi=Number(c[2])||o,lo=Number(c[3])||o,cl=Number(c[4])||o;if(!(cl>0))continue;processMarket({mid:cl,bid:cl,ask:cl,high:hi,low:lo,open:o,stamp,source:'replay'},true)}
    // A seek can land on the start candle before any new M1 candle has been processed.
    if(state.lastReplayTime==null&&q.stamp<=start){processMarket(q,true)}
    persist();render();
  }
  function showNotice(msg){const el=$('paperModeNote');if(el){el.textContent=msg;el.classList.add('paper-warning');setTimeout(()=>{if(el)el.classList.remove('paper-warning')},5000)}}
  function render(){useActive();const q=price();panel.querySelectorAll('[data-pmode]').forEach(b=>b.classList.toggle('on',b.dataset.pmode===mode));if($('paperModeNote')){$('paperModeNote').textContent=mode==='replay'?'REPLAY SIMULATION · Dữ liệu lịch sử, không dùng quote live cTrader':'LIVE SIMULATION · Không gửi lệnh tới cTrader';$('paperModeNote').classList.toggle('paper-warning',mode==='replay'&&!(typeof RP!=='undefined'&&RP.on))}
    const sel=$('paperAccount');if(sel){sel.innerHTML=book().accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');sel.value=state.id}
    updateQuotes();let open=0;for(const p of state.positions){if(isCur(p))p.mark=p.side==='buy'?(q.bid||q.mid||p.mark||p.entry):(q.ask||q.mid||p.mark||p.entry);open+=pnl(p,p.mark||p.entry)}const equity=state.balance+open;
    $('paperBalance').textContent='$'+money(state.balance);$('paperEquity').textContent='$'+money(equity);$('paperOpenPL').textContent=(open<0?'−':'')+'$'+money(Math.abs(open));$('paperOpenPL').style.color=open<0?'var(--loss,#ff5c78)':'var(--profit,#3dd6a5)';$('paperFree').textContent='$'+money(equity);$('paperCount').textContent=state.positions.length;$('paperPendingCount').textContent=state.pending.length;
    renderRows(activeTab);drawLines();renderRisk();
  }
  function updateQuotes(){const q=price(),b=$('pqBid'),a=$('pqAsk');if(b)b.textContent=q.bid>0?fmt(q.bid):'—';if(a)a.textContent=q.ask>0?fmt(q.ask):'—'}
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function renderRows(tab='open'){const root=$('paperRows');if(!root)return;const rows=tab==='history'?state.history:tab==='pending'?state.pending:state.positions,key=state.id+'|'+tab+'|'+rows.map(p=>[p.id,p.qty,p.entry,p.sl,p.tp,p.exit,p.type].join(',')).join(';');
    if(tab==='open'&&rows.length&&key===rowsKey){rows.forEach(p=>{const mk=p.mark||p.entry,pl=pnl(p,mk),a=root.querySelector('[data-pl="'+p.id+'"]'),m=root.querySelector('[data-mk="'+p.id+'"]');if(a){a.textContent=(pl<0?'−':'')+'$'+money(Math.abs(pl));a.className=pl<0?'neg':'pos'}if(m)m.textContent='Mark '+fmt(mk)});return}
    rowsKey=key;if(!rows.length){root.innerHTML=`<div class="paper-empty">${tab==='history'?'Chưa có giao dịch đã đóng.':tab==='pending'?'Không có lệnh chờ.':'Chưa có vị thế. Chọn Buy hoặc Sell để bắt đầu.'}</div>`;return}
    root.innerHTML=rows.map(p=>{const hist=tab==='history',pending=tab==='pending',mark=hist?p.exit:p.mark||p.entry,pl=hist?p.profit:pending?0:pnl(p,mark);return `<div class="paper-row"><div class="paper-rowtop"><b class="${p.side==='buy'?'buytxt':'selltxt'}">${p.side.toUpperCase()} ${esc(p.symbol)} ${pending?esc(p.type.toUpperCase()):''} <small>#${p.id}</small></b><b data-pl="${tab==='open'?p.id:''}" class="${pl<0?'neg':'pos'}">${pending?'PENDING':(pl<0?'−':'')+'$'+money(Math.abs(pl))}</b></div><div class="paper-meta"><span>Qty ${p.qty}</span><span>Entry ${fmt(p.entry)}</span>${!pending?`<span ${tab==='open'?`data-mk="${p.id}"`:''}>${hist?'Exit':'Mark'} ${fmt(mark)}</span>`:''}${p.sl!=null?`<span>SL ${fmt(p.sl)}</span>`:''}${p.tp!=null?`<span>TP ${fmt(p.tp)}</span>`:''}${hist?`<span>${esc(p.reason||'')}</span>`:''}</div>${hist?'':pending?`<button class="paper-close" data-cancel="${p.id}">Huỷ lệnh chờ</button>`:`<button class="paper-close" data-close="${p.id}">Đóng vị thế</button>`}</div>`}).join('');
    root.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{const p=state.positions.find(x=>x.id===Number(b.dataset.close));if(p&&!isCur(p)){alert('Hãy chuyển chart sang '+p.symbol+' để đóng vị thế này.');return}if(p){const q=price(),exit=p.side==='buy'?(q.bid||q.mid):(q.ask||q.mid);if(exit>0)closePosition(p,exit,'Đóng thủ công');persist();render()}});
    root.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{state.pending=state.pending.filter(p=>p.id!==Number(b.dataset.cancel));persist();render()});
  }
  function drawLines(){if(!overlay)return;const chartEl=$('chart');if(!chartEl)return;const rect=chartEl.getBoundingClientRect(),old=new Map(),keep=new Set();
    overlay.querySelectorAll('.paper-line').forEach(el=>old.set(el.dataset.key,el));overlay.querySelectorAll('.paper-zone').forEach(el=>el.remove());
    if(!rect.width||!rect.height){old.forEach(el=>el.remove());return}
    const yOf=v=>{try{return cs.priceToCoordinate(v)}catch{return null}},items=[...state.positions,...state.pending].filter(isCur);
    for(const p of items){const yE=yOf(p.entry);if(!Number.isFinite(yE))continue;for(const [field,fill] of [['sl','risk'],['tp','reward']])if(p[field]!=null){const y=yOf(p[field]);if(Number.isFinite(y)){const z=document.createElement('div');z.className='paper-zone '+fill;z.style.top=Math.min(yE,y)+'px';z.style.height=Math.max(1,Math.abs(y-yE))+'px';z.innerHTML=`<span>${fill==='risk'?'Risk':'Reward'} #${p.id} · ${fmt(p[field])}</span>`;overlay.appendChild(z)}}}
    for(const p of items)for(const [field,color,label] of [['entry','#e6bd63','Entry'],['sl','#ff5c78','SL'],['tp','#3dd6a5','TP']]){if(p[field]==null||(field==='entry'&&state.positions.some(x=>x.id===p.id)))continue;const y=yOf(p[field]);if(!Number.isFinite(y)||y<0||y>rect.height)continue;
      const k=field+'-'+p.id;keep.add(k);let line=old.get(k);if(!line){line=document.createElement('div');line.className='paper-line '+field;line.dataset.key=k;line.innerHTML=`<span data-drag="${field}" data-id="${p.id}"></span>`;overlay.appendChild(line)}
      line.style.top=y+'px';line.style.setProperty('--linecolor',color);const sp=line.firstChild;sp.title='Kéo để chỉnh '+label;sp.textContent=`${label} #${p.id} · ${fmt(p[field])}`}
    old.forEach((el,k)=>{if(!keep.has(k))el.remove()});
  }
  function renderRisk(){const q=price(),entry=Number($('paperEntry').value)||q.ask||q.mid||0,qty=Math.max(.01,Number($('paperQty').value)||1),sd=dist('paperSL'),td=dist('paperTP'),risk=sd*qty,reward=td*qty,rr=sd>0?td/sd:0,el=$('paperRisk');if(el)el.innerHTML=`Entry <b>${entry>0?fmt(entry):'—'}</b> · Risk <b class="neg">${sd?'$'+money(risk):'—'}</b> · Reward <b class="pos">${td?'$'+money(reward):'—'}</b> · R:R <b>${sd&&td?'1 : '+rr.toFixed(2):'—'}</b>`}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
