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
  let state;
  const money=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const digits=()=>typeof window.PDIG==='function'?PDIG():2, fmt=p=>Number(p).toFixed(digits());
  const persist=()=>{try{localStorage.setItem(LIVE_KEY,JSON.stringify(books.live));localStorage.setItem(REPLAY_KEY,JSON.stringify(books.replay))}catch{}}
  const book=()=>books[mode], active=()=>book().accounts.find(a=>a.id===book().activeId)||book().accounts[0];
  function useActive(){state=active();if(state&&!Array.isArray(state.pending))state.pending=[];}
  const symbol=()=>String((typeof C!=='undefined'&&C.sym)||'SYMBOL');
  function livePrice(){const a=typeof agg!=='undefined'&&Array.isArray(agg)?agg:[],c=a[a.length-1],mid=Number(c?.close)||0,b=typeof CT!=='undefined'?Number(CT.bid)/1e5:0,ask=typeof CT!=='undefined'?Number(CT.ask)/1e5:0;return {mid:mid||(b>0&&ask>0?(b+ask)/2:0),bid:b>0?b:mid,ask:ask>0?ask:mid,high:Number(c?.high)||mid,low:Number(c?.low)||mid,stamp:Number(c?.time)||null,source:'live'};}
  function replayPrice(){if(!(typeof RP!=='undefined'&&RP.on)||!(typeof m1!=='undefined'&&Array.isArray(m1)&&m1.length))return {mid:0,bid:0,ask:0,high:0,low:0,stamp:null,source:'replay'};const c=m1[m1.length-1];if(!Array.isArray(c))return {mid:0,bid:0,ask:0,high:0,low:0,stamp:null,source:'replay'};const o=Number(c[1])||0,h=Number(c[2])||o,l=Number(c[3])||o,cl=Number(c[4])||o;return {mid:cl,bid:cl,ask:cl,high:h,low:l,open:o,stamp:Number(c[0])||null,source:'replay'};}
  const price=()=>mode==='replay'?replayPrice():livePrice();
  function mount(){
    panel=document.createElement('div');panel.id='paperPanel';panel.innerHTML=`<div class="paper-head"><div><b>Paper Trading <span class="paper-netting-badge">NETTING</span></b><small id="paperModeNote">LIVE SIMULATION · Không gửi lệnh tới cTrader</small></div><button id="paperToggle" type="button">Ẩn</button></div>
    <div class="paper-account-tools"><label>Chế độ<select id="paperMode"><option value="live">Live Paper</option><option value="replay">Replay Paper</option></select></label><label>Tài khoản<select id="paperAccount"></select></label><button id="paperNewAccount" type="button">+ Tạo tài khoản</button><button id="paperRename" type="button">Đổi tên</button></div>
    <div class="paper-account"><span>Số dư <b id="paperBalance">$10,000.00</b></span><span>Equity <b id="paperEquity">$10,000.00</b></span><span>P/L mở <b id="paperOpenPL">$0.00</b></span><span>Free margin* <b id="paperFree">$10,000.00</b></span></div>
    <div class="paper-controls"><label>Khối lượng<input id="paperQty" type="number" min="0.01" step="0.01" value="1"></label><label>SL distance<input id="paperSL" type="number" min="0" step="0.1" value="5" title="Khoảng cách giá; 0 = không đặt SL"></label><label>TP distance<input id="paperTP" type="number" min="0" step="0.1" value="10" title="Khoảng cách giá; 0 = không đặt TP"></label><button id="paperSell" class="paper-sell">Sell Market</button><button id="paperBuy" class="paper-buy">Buy Market</button></div>
    <div class="paper-pending-controls"><label>Loại lệnh<select id="paperOrderType"><option value="limit">Limit</option><option value="stop">Stop</option></select></label><label>Giá vào lệnh<input id="paperEntry" type="number" step="any" inputmode="decimal" placeholder="Giá entry"></label><button id="paperPendingBuy" class="paper-buy">Đặt Buy pending</button><button id="paperPendingSell" class="paper-sell">Đặt Sell pending</button></div>
    <div id="paperRisk" class="paper-risk">Risk: — · Reward: — · R:R —</div><div class="paper-note">NETTING: mỗi mã chỉ có một vị thế ròng. Lệnh ngược chiều bù trừ vị thế hiện tại, phần dư mới đảo chiều. Kéo Entry/SL/TP trên chart để chỉnh. *Free margin là số tham khảo; mô hình chưa tính margin/commission/swap.</div>
    <div class="paper-tabs"><button class="active" data-ptab="open">Vị thế (<span id="paperCount">0</span>)</button><button data-ptab="pending">Lệnh chờ (<span id="paperPendingCount">0</span>)</button><button data-ptab="history">Lịch sử</button><button id="paperReset">Reset tài khoản</button></div><div id="paperRows"></div>`;
    const chartCard=$('chartCard');if(chartCard)chartCard.insertAdjacentElement('afterend',panel);else document.body.appendChild(panel);
    overlay=document.createElement('div');overlay.id='paperLines';const cw=$('cw');if(cw)cw.appendChild(overlay);
    quick=document.createElement('div');quick.id='paperQuick';quick.innerHTML=`<button type="button" id="pqSell" class="pq-sell">SELL <small id="pqBid">—</small></button><label class="pq-qty"><span>QTY</span><input id="pqQty" type="number" min="0.01" step="0.01" value="1" inputmode="decimal"></label><button type="button" id="pqBuy" class="pq-buy">BUY <small id="pqAsk">—</small></button>`;if(cw)cw.appendChild(quick);
    $('paperMode').onchange=()=>{mode=$('paperMode').value;useActive();activeTab='open';panel.querySelectorAll('[data-ptab]').forEach(x=>x.classList.toggle('active',x.dataset.ptab===activeTab));render();};
    $('paperAccount').onchange=()=>{book().activeId=$('paperAccount').value;useActive();render()};
    $('paperNewAccount').onclick=()=>{const n=prompt('Tên tài khoản Paper mới:',`${mode==='replay'?'Replay':'Live Paper'} ${book().accounts.length+1}`);if(n===null)return;const a=freshBook(n.trim()||`Paper ${book().accounts.length+1}`);book().accounts.push(a);book().activeId=a.id;useActive();persist();render()};
    $('paperRename').onclick=()=>{const n=prompt('Tên tài khoản:',state.name);if(n===null)return;state.name=n.trim()||state.name;persist();render()};
    $('paperToggle').onclick=()=>{panel.classList.toggle('collapsed');$('paperToggle').textContent=panel.classList.contains('collapsed')?'Hiện':'Ẩn'};
    $('pqBuy').onclick=()=>{syncQuick();openTrade('buy')};$('pqSell').onclick=()=>{syncQuick();openTrade('sell')};$('pqQty').addEventListener('input',()=>{$('paperQty').value=$('pqQty').value});
    $('paperBuy').onclick=()=>openTrade('buy');$('paperSell').onclick=()=>openTrade('sell');$('paperPendingBuy').onclick=()=>placePending('buy');$('paperPendingSell').onclick=()=>placePending('sell');['paperQty','paperSL','paperTP','paperEntry','paperOrderType'].forEach(id=>$(id).addEventListener('input',renderRisk));
    panel.querySelectorAll('[data-ptab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.ptab;panel.querySelectorAll('[data-ptab]').forEach(x=>x.classList.toggle('active',x===b));renderRows(activeTab)});
    $('paperReset').onclick=()=>{if(!confirm(`Reset “${state.name}” về $${money(START_BALANCE)}? Toàn bộ vị thế, lệnh chờ và lịch sử của tài khoản này sẽ bị xoá.`))return;const name=state.name,id=state.id;state={...freshBook(name),id};state.balance=START_BALANCE;book().accounts[book().accounts.findIndex(a=>a.id===id)]=state;useActive();persist();render()};
    overlay.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-drag]');if(!h)return;const id=Number(h.dataset.id),field=h.dataset.drag,p=field==='entry'?state.pending.find(x=>x.id===id):state.positions.find(x=>x.id===id)||state.pending.find(x=>x.id===id);if(!p)return;drag={id,field,collection:field==='entry'?'pending':(state.positions.some(x=>x.id===id)?'positions':'pending'),pointerId:e.pointerId};try{h.setPointerCapture(e.pointerId)}catch{}e.preventDefault()});
    window.addEventListener('pointermove',e=>{if(!drag)return;const p=(drag.collection==='pending'?state.pending:state.positions).find(x=>x.id===drag.id);if(!p)return;const r=$('chart').getBoundingClientRect(),y=e.clientY-r.top;try{const v=cs.coordinateToPrice(y);if(Number.isFinite(v)){p[drag.field]=v;drawLines();renderRows(activeTab)}}catch{}});
    window.addEventListener('pointerup',finishDrag);window.addEventListener('pointercancel',finishDrag);window.addEventListener('resize',drawLines);
    window.__paperSyncQuick=syncQuick;
    // Live simulation polls only in Live Paper. Replay execution is event-driven from replay.js.
    setInterval(()=>{if(mode!=='live')return;useActive();if(!state.positions.length&&!state.pending.length)return;const q=livePrice();if(!(q.mid>0))return;processMarket(q,false);render()},250);
    window.__paperReplayStep=onReplayStep;
    useActive();render();
    function syncQuick(){ $('paperQty').value=$('pqQty').value; }
    function finishDrag(){if(!drag)return;drag=null;persist();render()}
  }
  function openTrade(side){useActive();const q=price();if(mode==='replay'&&!(typeof RP!=='undefined'&&RP.on)){alert('Bật Replay trước khi đặt lệnh Replay Paper.');return}const entry=side==='buy'?q.ask:q.bid;if(!(entry>0)){alert('Chưa có giá hợp lệ cho chế độ đang chọn.');return}const qty=validQty(),sd=dist('paperSL'),td=dist('paperTP'),p={id:state.nextId++,symbol:symbol(),side,qty,entry,sl:sd?(side==='buy'?entry-sd:entry+sd):null,tp:td?(side==='buy'?entry+td:entry-td):null,opened:Date.now(),mark:entry};applyNetting(p,entry,'Market');persist();render()}
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
    for(const o of [...state.pending]){const touched=o.type==='limit'?(o.side==='buy'?lo<=o.entry:hi>=o.entry):(o.side==='buy'?hi>=o.entry:lo<=o.entry);if(!touched)continue;state.pending=state.pending.filter(x=>x.id!==o.id);applyNetting(o,o.entry,`${o.type.toUpperCase()} pending`)}
    for(const p of [...state.positions]){p.mark=p.side==='buy'?(q.bid||q.mid):(q.ask||q.mid);let exit=null,why='';const slHit=p.sl!=null&&(p.side==='buy'?lo<=p.sl:hi>=p.sl),tpHit=p.tp!=null&&(p.side==='buy'?hi>=p.tp:lo<=p.tp);
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
  function render(){useActive();const q=price();if($('paperMode'))$('paperMode').value=mode;if($('paperModeNote')){$('paperModeNote').textContent=mode==='replay'?'REPLAY SIMULATION · Dữ liệu lịch sử, không dùng quote live cTrader':'LIVE SIMULATION · Không gửi lệnh tới cTrader';$('paperModeNote').classList.toggle('paper-warning',mode==='replay'&&!(typeof RP!=='undefined'&&RP.on))}
    const sel=$('paperAccount');if(sel){sel.innerHTML=book().accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');sel.value=state.id}
    if($('pqBid'))$('pqBid').textContent=q.bid>0?fmt(q.bid):'—';if($('pqAsk'))$('pqAsk').textContent=q.ask>0?fmt(q.ask):'—';let open=0;for(const p of state.positions){p.mark=p.side==='buy'?(q.bid||q.mid||p.mark||p.entry):(q.ask||q.mid||p.mark||p.entry);open+=pnl(p,p.mark)}const equity=state.balance+open;
    $('paperBalance').textContent='$'+money(state.balance);$('paperEquity').textContent='$'+money(equity);$('paperOpenPL').textContent=(open<0?'−':'')+'$'+money(Math.abs(open));$('paperOpenPL').style.color=open<0?'var(--loss,#ff5c78)':'var(--profit,#3dd6a5)';$('paperFree').textContent='$'+money(equity);$('paperCount').textContent=state.positions.length;$('paperPendingCount').textContent=state.pending.length;
    renderRows(activeTab);drawLines();renderRisk();persist();
  }
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function renderRows(tab='open'){const root=$('paperRows');if(!root)return;const rows=tab==='history'?state.history:tab==='pending'?state.pending:state.positions;if(!rows.length){root.innerHTML=`<div class="paper-empty">${tab==='history'?'Chưa có giao dịch đã đóng.':tab==='pending'?'Không có lệnh chờ.':'Chưa có vị thế. Chọn Buy hoặc Sell để bắt đầu.'}</div>`;return}
    root.innerHTML=rows.map(p=>{const hist=tab==='history',pending=tab==='pending',mark=hist?p.exit:p.mark||p.entry,pl=hist?p.profit:pending?0:pnl(p,mark);return `<div class="paper-row"><div class="paper-rowtop"><b class="${p.side==='buy'?'buytxt':'selltxt'}">${p.side.toUpperCase()} ${esc(p.symbol)} ${pending?esc(p.type.toUpperCase()):''} <small>#${p.id}</small></b><b class="${pl<0?'neg':'pos'}">${pending?'PENDING':(pl<0?'−':'')+'$'+money(Math.abs(pl))}</b></div><div class="paper-meta"><span>Qty ${p.qty}</span><span>Entry ${fmt(p.entry)}</span>${!pending?`<span>${hist?'Exit':'Mark'} ${fmt(mark)}</span>`:''}${p.sl!=null?`<span>SL ${fmt(p.sl)}</span>`:''}${p.tp!=null?`<span>TP ${fmt(p.tp)}</span>`:''}${hist?`<span>${esc(p.reason||'')}</span>`:''}</div>${hist?'':pending?`<button class="paper-close" data-cancel="${p.id}">Huỷ lệnh chờ</button>`:`<button class="paper-close" data-close="${p.id}">Đóng vị thế</button>`}</div>`}).join('');
    root.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{const p=state.positions.find(x=>x.id===Number(b.dataset.close));if(p){const q=price(),exit=p.side==='buy'?(q.bid||q.mid):(q.ask||q.mid);if(exit>0)closePosition(p,exit,'Đóng thủ công');persist();render()}});
    root.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{state.pending=state.pending.filter(p=>p.id!==Number(b.dataset.cancel));persist();render()});
  }
  function drawLines(){if(!overlay)return;overlay.innerHTML='';const chartEl=$('chart');if(!chartEl)return;const rect=chartEl.getBoundingClientRect();if(!rect.width||!rect.height)return;const yOf=v=>{try{return cs.priceToCoordinate(v)}catch{return null}};
    for(const p of [...state.positions,...state.pending]){const yE=yOf(p.entry);if(!Number.isFinite(yE))continue;for(const [field,color,label,fill] of [['sl','#ff5c78','SL','risk'],['tp','#3dd6a5','TP','reward']])if(p[field]!=null){const y=yOf(p[field]);if(Number.isFinite(y)){const z=document.createElement('div');z.className='paper-zone '+fill;z.style.top=Math.min(yE,y)+'px';z.style.height=Math.max(1,Math.abs(y-yE))+'px';z.style.left='8px';z.style.right='54px';z.innerHTML=`<span>${fill==='risk'?'RISK':'REWARD'} #${p.id} · ${fmt(p[field])}</span>`;overlay.appendChild(z)}}}
    for(const p of [...state.positions,...state.pending])for(const [field,color,label] of [['entry','#e6bd63','ENTRY'],['sl','#ff5c78','SL'],['tp','#3dd6a5','TP']]){if(p[field]==null||(field==='entry'&&state.positions.some(x=>x.id===p.id)))continue;const y=yOf(p[field]);if(!Number.isFinite(y)||y<0||y>rect.height)continue;const line=document.createElement('div');line.className='paper-line '+field;line.style.top=y+'px';line.style.setProperty('--linecolor',color);line.innerHTML=`<span data-drag="${field}" data-id="${p.id}" title="Kéo để chỉnh ${label}">${label} #${p.id} · ${fmt(p[field])}</span>`;overlay.appendChild(line)}
  }
  function renderRisk(){const q=price(),entry=Number($('paperEntry').value)||q.ask||q.mid||0,qty=Math.max(.01,Number($('paperQty').value)||1),sd=dist('paperSL'),td=dist('paperTP'),risk=sd*qty,reward=td*qty,rr=sd>0?td/sd:0,el=$('paperRisk');if(el)el.innerHTML=`Entry <b>${entry>0?fmt(entry):'—'}</b> · Risk <b class="neg">${sd?'$'+money(risk):'—'}</b> · Reward <b class="pos">${td?'$'+money(reward):'—'}</b> · R:R <b>${sd&&td?'1 : '+rr.toFixed(2):'—'}`}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
