/* Price Variation Table — isolated overlay/tool. Does not modify chart series, data, scale or handlers. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const btn=$('pvtToggle'),panel=$('pvtPanel'),sel=$('pvtSelection'),host=$('chart'),cw=$('cw'),card=$('chartCard');
 if(!btn||!panel||!sel||!host||!cw||!card||typeof chart==='undefined')return;
 let active=false,dragging=false,startX=0,endX=0,range=null,lastDataKey='',lastSymbol=typeof C!=='undefined'?C.sym:null;
 const MAX_ROWS=400;
 const finite=Number.isFinite;
 const digits=()=>{try{return Math.max(0,Math.min(8,PDIG()))}catch(_){return 2}};
 const num=x=>finite(x)?x.toLocaleString(undefined,{maximumFractionDigits:digits(),minimumFractionDigits:0}):'—';
 const signed=x=>finite(x)?`${x>0?'+':''}${num(x)}`:'—';
 const pct=x=>finite(x)?`${x>0?'+':''}${x.toFixed(2)}%`:'—';
 const stamp=b=>Number.isFinite(b?.st)?b.st:Number.isFinite(b?.time)?b.time:null;
 const chartStamp=b=>Number.isFinite(b?.time)?b.time:stamp(b);
 function timeLabel(t){if(!finite(t))return '—';try{return new Date(t*1000).toLocaleString(undefined,{timeZone:'UTC',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:C.tf<60?'2-digit':undefined})}catch(_){return String(t)}}
 function coordinateTime(x){try{const t=chart.timeScale().coordinateToTime(x);if(typeof t==='number')return t;if(t&&typeof t==='object'&&Number.isFinite(t.year))return Math.floor(Date.UTC(t.year,t.month-1,t.day)/1000);return null}catch(_){return null}}
 function nearestIndex(t){if(!finite(t)||!Array.isArray(agg)||!agg.length)return -1;let lo=0,hi=agg.length-1;while(lo<=hi){const m=(lo+hi)>>1,mt=chartStamp(agg[m]);if(mt===t)return m;if(mt<t)lo=m+1;else hi=m-1}if(lo>=agg.length)return agg.length-1;if(hi<0)return 0;return Math.abs(chartStamp(agg[lo])-t)<Math.abs(t-chartStamp(agg[hi]))?lo:hi}
 function fmtTime(b){return timeLabel(chartStamp(b))}
 function selectedIndices(){if(!range||!Array.isArray(agg)||!agg.length)return null;let a=nearestIndex(range.start),b=nearestIndex(range.end);if(a<0||b<0)return null;if(a>b)[a,b]=[b,a];return {a,b}}
 function calc(bars){
  const first=bars[0],last=bars[bars.length-1],start=+first.close,finish=+last.close,net=finish-start;
  let hi=-Infinity,lo=Infinity,path=0,maxV=0,maxA=0,prevV=null,prevT=null,rows=[];
  for(let i=0;i<bars.length;i++){
   const x=bars[i],t=stamp(x),h=+x.high,l=+x.low,c=+x.close;
   if(finite(h))hi=Math.max(hi,h);if(finite(l))lo=Math.min(lo,l);
   const prev=i?bars[i-1]:null,pt=prev?stamp(prev):null,dt=prev&&finite(t)&&finite(pt)?Math.max(1,t-pt):null;
   const delta=prev?c-(+prev.close):null,v=prev&&dt?delta/dt:null;
   const acc=v!=null&&prevV!=null&&prevT!=null? (v-prevV)/Math.max(1,t-prevT):null;
   if(v!=null){maxV=Math.max(maxV,Math.abs(v));path+=Math.abs(delta);}
   if(acc!=null)maxA=Math.max(maxA,Math.abs(acc));
   rows.push({i:i+1,t:chartStamp(x),c,delta,v,acc,range:finite(h)&&finite(l)?h-l:null});
   if(v!=null){prevV=v;prevT=t;}
  }
  const firstT=stamp(first),lastT=stamp(last),step=bars.length>1&&finite(firstT)&&finite(lastT)?Math.max(1,(lastT-firstT)/(bars.length-1)):Math.max(1,Number(C?.tf)||60);
  const duration=bars.length>1&&finite(firstT)&&finite(lastT)?Math.max(1,lastT-firstT):step;
  const span=hi>=lo?hi-lo:NaN,eff=path>0?Math.abs(net)/path*100:0;
  const avgRange=rows.reduce((s,r)=>s+(finite(r.range)?r.range:0),0)/Math.max(1,rows.filter(r=>finite(r.range)).length);
  return {first,last,start,finish,net,hi,lo,span,step,duration,path,eff,avgRange,velocity:net/duration,maxV,maxA,rows};
 }
 // Small pure calculation API also makes the math independently testable.
 window.GexPriceVariationMath=Object.freeze({calculate:bars=>Array.isArray(bars)&&bars.length?calc(bars):null});
 function render(){
  const idx=selectedIndices();
  if(!idx){panel.innerHTML='<div class="pvt-head"><strong>Price Variation Table</strong><span class="pvt-spacer"></span><button class="pvt-btn" data-pvt="close" aria-label="Đóng">×</button></div><div class="pvt-empty">Bật công cụ rồi kéo trên vùng chart để chọn nến bắt đầu và kết thúc.</div>';return}
  const bars=agg.slice(idx.a,idx.b+1);if(!bars.length)return;
  const d=calc(bars),shown=d.rows.length<=MAX_ROWS?d.rows:d.rows.filter((_,i)=>i===0||i===d.rows.length-1||i%(Math.ceil(d.rows.length/(MAX_ROWS-2))|0)===0);
  const rowHtml=shown.map(r=>`<tr><td>${r.i}</td><td>${timeLabel(r.t)}</td><td>${num(r.c)}</td><td class="${r.delta==null?'':r.delta>=0?'pvt-up':'pvt-down'}">${r.delta==null?'—':signed(r.delta)}</td><td>${r.v==null?'—':signed(r.v)}</td><td>${r.acc==null?'—':signed(r.acc)}</td><td>${num(r.range)}</td></tr>`).join('');
  const movePct=d.start!==0?d.net/d.start*100:NaN;
  panel.innerHTML=`<div class="pvt-head"><strong>↔ Price Variation Table</strong><span class="pvt-spacer"></span><button class="pvt-btn ${active?'active':''}" data-pvt="select">${active?'Đang chọn…':'Chọn vùng'}</button><button class="pvt-btn" data-pvt="clear">Xóa vùng</button><button class="pvt-btn" data-pvt="close" aria-label="Đóng">×</button></div>
  <div class="pvt-note">${fmtTime(d.first)} → ${fmtTime(d.last)} · ${bars.length} nến · khoảng đo ${Math.round(d.duration)} giây</div>
  <div class="pvt-stats">
   <div class="pvt-stat"><span>Close đầu → cuối</span><b>${num(d.start)} → ${num(d.finish)}</b></div>
   <div class="pvt-stat"><span>Biến thiên ΔP</span><b class="${d.net>=0?'pvt-up':'pvt-down'}">${signed(d.net)} (${pct(movePct)})</b></div>
   <div class="pvt-stat"><span>Biên độ vùng H − L</span><b>${num(d.span)}</b></div>
   <div class="pvt-stat"><span>Quãng đường tích lũy</span><b>${num(d.path)}</b></div>
   <div class="pvt-stat"><span>Hiệu suất hướng</span><b>${d.eff.toFixed(1)}%</b></div>
   <div class="pvt-stat"><span>Vận tốc ròng</span><b>${signed(d.velocity)} giá/s</b></div>
   <div class="pvt-stat"><span>|V| lớn nhất</span><b>${num(d.maxV)} giá/s</b></div>
   <div class="pvt-stat"><span>|a| lớn nhất</span><b>${num(d.maxA)} giá/s²</b></div>
   <div class="pvt-stat"><span>Range trung bình/nến</span><b>${num(d.avgRange)}</b></div>
   <div class="pvt-stat"><span>Đỉnh / đáy</span><b>${num(d.hi)} / ${num(d.lo)}</b></div>
  </div><div class="pvt-table-wrap"><table class="pvt-table"><thead><tr><th>#</th><th>Thời gian</th><th>Close</th><th>ΔP</th><th>V (giá/s)</th><th>a (giá/s²)</th><th>H−L</th></tr></thead><tbody>${rowHtml}</tbody></table></div>
  ${d.rows.length>MAX_ROWS?`<div class="pvt-note">Đang hiển thị ${shown.length}/${d.rows.length} dòng lấy mẫu để tránh làm chậm chart; các chỉ số tổng quan vẫn tính trên toàn bộ vùng.</div>`:''}
  <div class="pvt-note">ΔP, V và a được tính từ Close giữa các nến. V = ΔClose/Δt; a = ΔV/Δt. Với một nến, khoảng thời gian dùng độ dài khung hiện tại. Hiệu suất hướng = |ΔP ròng| / tổng |ΔP từng bước| × 100%; nếu giá không di chuyển thì bằng 0%. Dữ liệu OHLC không thay thế được vận tốc tick-by-tick. Chỉ mang tính mô tả, không phải khuyến nghị giao dịch.</div>`;
 }
 function setRect(clientX1,clientX2){const cr=card.getBoundingClientRect(),wr=cw.getBoundingClientRect(),left=Math.max(0,Math.min(clientX1,clientX2)-cr.left),right=Math.min(cr.width,Math.max(clientX1,clientX2)-cr.left);sel.style.display='block';sel.style.left=left+'px';sel.style.top=(wr.top-cr.top)+'px';sel.style.height=wr.height+'px';sel.style.width=Math.max(1,right-left)+'px'}
 function activate(on){active=!!on;btn.classList.toggle('active',active);btn.textContent=active?'↔ Đang chọn vùng':'↔ Bảng biến thiên';host.style.cursor=active?'crosshair':'';if(active)panel.hidden=false;render()}
 function clear(){range=null;sel.style.display='none';render()}
 btn.addEventListener('click',()=>{panel.hidden=false;activate(!active)});
 panel.addEventListener('click',e=>{const b=e.target.closest('[data-pvt]');if(!b)return;switch(b.dataset.pvt){case'select':activate(!active);break;case'close':panel.hidden=true;activate(false);break;case'clear':clear();break;}});
 host.addEventListener('pointerdown',e=>{if(!active||e.button!==0)return;const cr=host.getBoundingClientRect();startX=Math.max(0,Math.min(cr.width,e.clientX-cr.left));endX=startX;dragging=true;setRect(e.clientX,e.clientX);e.preventDefault();e.stopPropagation();},true);
 window.addEventListener('pointermove',e=>{if(!dragging)return;const cr=host.getBoundingClientRect();endX=Math.max(0,Math.min(cr.width,e.clientX-cr.left));setRect(cr.left+startX,e.clientX);},true);
 window.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;const a=coordinateTime(startX),b=coordinateTime(endX);if(finite(a)&&finite(b)){range={start:a,end:b};panel.hidden=false;render()}activate(false);},true);
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)activate(false)});
 // Keep the selection anchored to timestamps, not array indices, when history is prepended or chart data refreshes.
 function syncData(){if(!Array.isArray(agg)||!agg.length)return;if(typeof C!=='undefined'&&C.sym!==lastSymbol){lastSymbol=C.sym;range=null;sel.style.display='none';if(!panel.hidden)render()}const key=`${agg.length}|${stamp(agg[0])}|${stamp(agg[agg.length-1])}|${C.sym}|${C.tf}`;if(key===lastDataKey)return;lastDataKey=key;if(range){const idx=selectedIndices();if(!idx){range=null;sel.style.display='none'}else{range.start=chartStamp(agg[idx.a]);range.end=chartStamp(agg[idx.b])}if(!panel.hidden)render()}}
 try{chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{if(range&& !panel.hidden)syncData()})}catch(_){}
 // Lightweight Charts has no public data-change event. Check cheaply on a low-frequency timer, without touching chart rendering.
 const timer=setInterval(syncData,1200);window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
