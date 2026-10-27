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
  let up=0,down=0,peak=-Infinity,trough=Infinity,pull=0;
  for(const r of rows){if(r.delta!=null){if(r.delta>0)up++;else if(r.delta<0)down++}
   if(net>=0){peak=Math.max(peak,r.c);pull=Math.max(pull,peak-r.c)}else{trough=Math.min(trough,r.c);pull=Math.max(pull,r.c-trough)}}
  let kv=null,ka=null;for(const r of rows){if(r.v!=null&&(!kv||Math.abs(r.v)>Math.abs(kv.v)))kv=r;if(r.acc!=null&&(!ka||Math.abs(r.acc)>Math.abs(ka.acc)))ka=r}
  return {first,last,start,finish,net,hi,lo,span,step,duration,path,eff,avgRange,velocity:net/duration,maxV,maxA,rows,up,down,pull,pullRatio:Math.abs(net)>0?pull/Math.abs(net)*100:(pull>0?Infinity:0),kv,ka};
 }
 // Small pure calculation API also makes the math independently testable.
 window.GexPriceVariationMath=Object.freeze({calculate:bars=>Array.isArray(bars)&&bars.length?calc(bars):null});
 const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const cls=x=>x==null||!finite(x)||x===0?'':x>0?'pvt-up':'pvt-down';
 const effLabel=e=>e>=60?['Xu hướng rõ','pvt-up']:e>=30?['Hỗn hợp','pvt-mid']:['Đi ngang / nhiễu','pvt-down'];
 function spark(d){
  const r=d.rows,n=r.length,W=560,H=96,pad=8;if(n<2)return '';
  let mn=Infinity,mx=-Infinity;r.forEach(x=>{if(finite(x.c)){mn=Math.min(mn,x.c);mx=Math.max(mx,x.c)}});const sp=mx-mn||1;
  const X=i=>pad+(W-2*pad)*i/(n-1),Y=v=>pad+(H-2*pad)*(1-(v-mn)/sp);
  const pts=r.map((x,i)=>`${X(i).toFixed(1)},${Y(x.c).toFixed(1)}`),up=d.net>=0,col=up?'var(--win)':'var(--loss)';
  const iMax=r.findIndex(x=>x.c===mx),iMin=r.findIndex(x=>x.c===mn);
  return `<svg class="pvt-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Đường Close trong vùng chọn">
   <defs><linearGradient id="pvtG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".38"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
   <line x1="${pad}" x2="${W-pad}" y1="${Y(d.start).toFixed(1)}" y2="${Y(d.start).toFixed(1)}" stroke="var(--mut)" stroke-dasharray="3 4" stroke-opacity=".55"/>
   <polygon points="${X(0).toFixed(1)},${H} ${pts.join(' ')} ${X(n-1).toFixed(1)},${H}" fill="url(#pvtG)"/>
   <polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
   <circle cx="${X(0).toFixed(1)}" cy="${Y(d.start).toFixed(1)}" r="4" fill="var(--acc)"/><circle cx="${X(n-1).toFixed(1)}" cy="${Y(d.finish).toFixed(1)}" r="4" fill="${col}"/>
   <circle cx="${X(iMax).toFixed(1)}" cy="${Y(mx).toFixed(1)}" r="2.5" fill="var(--ink)" opacity=".8"/><circle cx="${X(iMin).toFixed(1)}" cy="${Y(mn).toFixed(1)}" r="2.5" fill="var(--ink)" opacity=".8"/></svg>`;
 }
 function stat(label,val,sub,c){return `<div class="pvt-stat"><span>${label}</span><b class="${c||''}">${val}</b>${sub?`<small>${sub}</small>`:''}</div>`}
 function csv(d){const q=x=>finite(x)?x:'';return ['#,time_utc_shifted,close,delta,velocity,acceleration,range'].concat(d.rows.map(r=>[r.i,finite(r.t)?new Date(r.t*1000).toISOString().slice(0,19).replace('T',' '):'',q(r.c),q(r.delta),q(r.v),q(r.acc),q(r.range)].join(','))).join('\n')}
 let lastCalc=null;
 const head=(extra='')=>`<div class="pvt-head"><span class="pvt-ico" aria-hidden="true">Δ</span><div class="pvt-title"><strong>Bảng biến thiên giá</strong><small>Price Variation Table</small></div><span class="pvt-spacer"></span>${extra}<button class="pvt-btn" data-pvt="close" aria-label="Đóng" title="Đóng">✕</button></div>`;
 function render(){
  const idx=selectedIndices();
  if(!idx){lastCalc=null;panel.innerHTML=head(`<button class="pvt-btn ${active?'active':''}" data-pvt="select">${active?'Đang chọn…':'Chọn vùng'}</button>`)+`<div class="pvt-empty"><div class="pvt-empty-ic">↔</div><b>Chưa có vùng nào được chọn</b><p>Bấm <em>Chọn vùng</em>, rồi <b>nhấn giữ và kéo ngang</b> trên chart từ nến bắt đầu tới nến kết thúc. Bảng sẽ tự tính biến thiên giá, vận tốc và gia tốc của đoạn đó.</p></div>`;return}
  const bars=agg.slice(idx.a,idx.b+1);if(!bars.length)return;
  const d=calc(bars);lastCalc=d;
  const shown=d.rows.length<=MAX_ROWS?d.rows:d.rows.filter((_,i)=>i===0||i===d.rows.length-1||i%(Math.ceil(d.rows.length/(MAX_ROWS-2))|0)===0);
  const maxAbsV=d.maxV||1,upDir=d.net>=0,movePct=d.start!==0?d.net/d.start*100:NaN,[el,ec]=effLabel(d.eff);
  const rowHtml=shown.map(r=>{const w=r.v==null?0:Math.min(100,Math.abs(r.v)/maxAbsV*100),hot=d.kv&&r.i===d.kv.i;
   return `<tr${hot?' class="pvt-hot"':''}><td>${r.i}</td><td>${esc(timeLabel(r.t))}</td><td>${num(r.c)}</td><td class="${cls(r.delta)}">${r.delta==null?'—':signed(r.delta)}</td><td class="pvt-vc"><i class="${r.v<0?'dn':'up'}" style="width:${w.toFixed(0)}%"></i><span class="${cls(r.v)}">${r.v==null?'—':signed(r.v)}</span></td><td class="${cls(r.acc)}">${r.acc==null?'—':signed(r.acc)}</td><td>${num(r.range)}</td></tr>`}).join('');
  const pullTxt=!finite(d.pullRatio)?'—':d.pullRatio.toFixed(0)+'% của ΔP';
  panel.innerHTML=head(`<button class="pvt-btn ${active?'active':''}" data-pvt="select">${active?'Đang chọn…':'Chọn lại'}</button><button class="pvt-btn" data-pvt="copy" title="Sao chép bảng dạng CSV">Copy CSV</button><button class="pvt-btn" data-pvt="clear">Xóa vùng</button>`)+
  `<div class="pvt-range"><span>${esc(fmtTime(d.first))}</span><i>→</i><span>${esc(fmtTime(d.last))}</span><em>${bars.length} nến · ${fmtDur(d.duration)}</em></div>
  <div class="pvt-hero ${upDir?'is-up':'is-down'}">
   <div class="pvt-hero-main"><span class="pvt-badge">${upDir?'▲ TĂNG':'▼ GIẢM'}</span><div class="pvt-big">${signed(d.net)}</div><div class="pvt-pct">${pct(movePct)}</div></div>
   <div class="pvt-hero-side"><span>Close đầu → cuối</span><b>${num(d.start)} → ${num(d.finish)}</b><span>Đỉnh / đáy vùng</span><b>${num(d.hi)} / ${num(d.lo)}</b></div>
   ${spark(d)}
  </div>
  <div class="pvt-eff"><div class="pvt-eff-top"><span>Hiệu suất hướng</span><b class="${ec}">${d.eff.toFixed(1)}% · ${el}</b></div><div class="pvt-meter"><i class="${ec}" style="width:${Math.min(100,d.eff).toFixed(1)}%"></i></div></div>
  <div class="pvt-stats">
   ${stat('Biên độ H − L',num(d.span))}
   ${stat('Quãng đường tích lũy',num(d.path),'tổng |ΔP| từng bước')}
   ${stat('Range TB / nến',num(d.avgRange))}
   ${stat('Vận tốc ròng',signed(d.velocity),'giá/giây',cls(d.velocity))}
   ${stat('|V| lớn nhất',num(d.maxV),d.kv?`nến #${d.kv.i}`:'')}
   ${stat('|a| lớn nhất',num(d.maxA),d.ka?`nến #${d.ka.i}`:'')}
   ${stat('Nến tăng / giảm',`<span class="pvt-up">${d.up}</span> / <span class="pvt-down">${d.down}</span>`,'theo Close')}
   ${stat('Hồi ngược tối đa',num(d.pull),pullTxt)}
  </div>
  <div class="pvt-table-wrap"><table class="pvt-table"><thead><tr><th>#</th><th>Thời gian</th><th>Close</th><th>ΔP</th><th>V (giá/s)</th><th>a (giá/s²)</th><th>H−L</th></tr></thead><tbody>${rowHtml}</tbody></table></div>
  ${d.rows.length>MAX_ROWS?`<div class="pvt-note">Hiển thị ${shown.length}/${d.rows.length} dòng lấy mẫu để chart không bị chậm; các chỉ số tổng quan vẫn tính trên toàn bộ vùng.</div>`:''}
  <details class="pvt-help"><summary>Cách đọc bảng này</summary><div>
   <p><b>ΔP</b> = Close nến sau − Close nến trước. <b>V</b> = ΔP / Δt (giá chạy bao nhiêu mỗi giây). <b>a</b> = ΔV / Δt (giá đang tăng tốc hay hụt hơi).</p>
   <p><b>Hiệu suất hướng</b> = |ΔP ròng| / tổng |ΔP từng bước|. Gần 100% là đi một mạch; gần 0% là giật qua giật lại. <b>Hồi ngược tối đa</b> là nhịp kéo ngược lớn nhất so với hướng chính.</p>
   <p>Dữ liệu là OHLC, không thay thế được vận tốc tick-by-tick. Chỉ mang tính mô tả, không phải khuyến nghị giao dịch.</p></div></details>`;
 }
 function fmtDur(s){s=Math.round(s);if(s<60)return s+' giây';const m=Math.floor(s/60);if(m<60)return m+' phút'+(s%60?` ${s%60}s`:'');const h=Math.floor(m/60);if(h<24)return h+' giờ'+(m%60?` ${m%60}p`:'');const dd=Math.floor(h/24);return dd+' ngày'+(h%24?` ${h%24}g`:'')}
 function copyCsv(btnEl){if(!lastCalc)return;const t=csv(lastCalc),done=()=>{if(btnEl){const o=btnEl.textContent;btnEl.textContent='Đã copy ✓';setTimeout(()=>{btnEl.textContent=o},1400)}};
  try{navigator.clipboard.writeText(t).then(done,()=>fb())}catch(_){fb()}
  function fb(){const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(_){}ta.remove()}}
 function setRect(clientX1,clientX2){const cr=card.getBoundingClientRect(),wr=cw.getBoundingClientRect(),left=Math.max(0,Math.min(clientX1,clientX2)-cr.left),right=Math.min(cr.width,Math.max(clientX1,clientX2)-cr.left);sel.style.display='block';sel.style.left=left+'px';sel.style.top=(wr.top-cr.top)+'px';sel.style.height=wr.height+'px';sel.style.width=Math.max(1,right-left)+'px'}
 function activate(on){active=!!on;btn.classList.toggle('active',active);btn.textContent=active?'↔ Đang chọn vùng…':'↔ Bảng biến thiên';host.style.cursor=active?'crosshair':'';if(active)panel.hidden=false;render()}
 function clear(){range=null;sel.style.display='none';render()}
 btn.addEventListener('click',()=>{panel.hidden=false;activate(!active)});
 panel.addEventListener('click',e=>{const b=e.target.closest('[data-pvt]');if(!b)return;switch(b.dataset.pvt){case'select':activate(!active);break;case'close':panel.hidden=true;activate(false);break;case'clear':clear();break;case'copy':copyCsv(b);break;}});
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
