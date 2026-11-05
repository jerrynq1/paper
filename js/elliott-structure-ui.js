/* Gexadecimal Elliott Structure Lab UI · isolated from main chart renderers. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const E=()=>window.ElliottStructure;
  const state={bars:[],source:'',result:null,selectedId:null,selected:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
  const timeText=t=>{if(!Number.isFinite(Number(t)))return '—';try{return new Date(Number(t)*1000).toLocaleString('vi-VN',{hour12:false})}catch{return String(t)}};
  const patternNames={impulse:'Impulse',truncated_fifth:'Truncated Fifth',impulse_developing_wave5:'Impulse · Wave 5 đang hình thành',diagonal_candidate:'Diagonal Candidate',zigzag:'Zigzag',regular_flat:'Regular Flat',expanded_flat:'Expanded Flat',running_flat:'Running Flat',contracting_triangle:'Contracting Triangle',expanding_triangle:'Expanding Triangle'};
  const setStatus=(message,bad=false)=>{const el=$('eStatus');if(el){el.textContent=message;el.classList.toggle('is-bad',!!bad);el.classList.toggle('is-good',!bad)}};
  const showSource=(message)=>{const el=$('eDataMeta');if(el)el.textContent=message};

  function chartBars(mode='current'){
    if(mode==='m1'){
      if(typeof m1==='undefined'||!Array.isArray(m1)||m1.length<20)throw new Error('Chart chưa có ít nhất 20 nến M1. Hãy tải dữ liệu trước.');
      return m1.map(b=>({time:Number(b[0]),open:b[1],high:b[2],low:b[3],close:b[4],volume:b[5]||0}));
    }
    if(typeof agg==='undefined'||!Array.isArray(agg)||agg.length<20)throw new Error('Chart chưa có ít nhất 20 nến ở timeframe hiện tại.');
    return agg.map(b=>({time:Number(b.st??b.time),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.v??b.volume??0}));
  }
  function loadChart(mode='current'){
    const bars=chartBars(mode);state.bars=E().normalizeBars(bars);state.source=mode==='m1'?'Chart · M1':'Chart · timeframe hiện tại';
    showSource(`${state.source} · ${state.bars.length.toLocaleString('vi-VN')} nến · ${timeText(state.bars[0].time)} → ${timeText(state.bars[state.bars.length-1].time)}`);
    setStatus('Đã lấy OHLC từ Chart. Nhấn Analyze Structure để chạy engine.');
    return state.bars;
  }
  function demoBars(){
    const anchors=[2650,2680,2661,2732,2705,2758,2738,2792,2769,2820,2790,2842,2818,2878,2850];
    const bars=[];let prev=anchors[0],idx=0,seed=20261105;
    const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
    for(let leg=0;leg<anchors.length-1;leg++){
      const a=anchors[leg],b=anchors[leg+1],steps=18;
      for(let j=0;j<steps;j++){
        const u=j/steps,shape=u+.035*Math.sin(u*Math.PI*2),noise=(rnd()-.5)*.11;
        const close=a+(b-a)*shape+noise,open=prev,wick=.12+rnd()*.10;
        bars.push({time:Date.UTC(2026,0,1,0,idx)/1000,open,high:Math.max(open,close)+wick,low:Math.min(open,close)-wick,close,volume:80+Math.round(rnd()*140)});
        prev=close;idx++;
      }
    }
    bars.push({time:Date.UTC(2026,0,1,0,idx)/1000,open:prev,high:prev+.2,low:prev-.2,close:prev,volume:120});
    state.bars=E().normalizeBars(bars);state.source='Synthetic Elliott DEMO · không phải market feed';
    showSource(`${state.source} · ${state.bars.length} nến · dùng để kiểm tra chức năng, không dùng đánh giá hiệu quả giao dịch.`);
    setStatus('Đã nạp dữ liệu DEMO tổng hợp.');
    return state.bars;
  }
  function parseOhlcCsv(text){
    if(!window.QuantStats||typeof QuantStats.parseCSV!=='function')throw new Error('CSV parser chưa sẵn sàng.');
    const parsed=QuantStats.parseCSV(text),h=parsed.headers.map(x=>String(x).trim().toLowerCase().replace(/[^a-z0-9]/g,''));
    const find=aliases=>h.findIndex(x=>aliases.includes(x));
    const ti=find(['time','date','timestamp','datetime','opentime','timeutc','datetimeutc']);
    const oi=find(['open','o']),hi=find(['high','h']),li=find(['low','l']),ci=find(['close','c','last','price']),vi=find(['volume','tickvolume','vol']);
    if([ti,oi,hi,li,ci].some(x=>x<0))throw new Error('CSV cần các cột Time, Open, High, Low, Close; Volume là tùy chọn.');
    const rows=parsed.rows.map((r,i)=>{
      const raw=r[ti],ms=QuantStats.parseTimestamp(raw);let time=Number.isFinite(ms)?ms/1000:Number(raw);
      if(!Number.isFinite(time))throw new Error(`Timestamp không hợp lệ ở dòng ${i+2}.`);
      const val=index=>QuantStats.parseNumber(r[index],parsed.delimiter);
      return{time,open:val(oi),high:val(hi),low:val(li),close:val(ci),volume:vi>=0?val(vi)||0:0};
    });
    return E().normalizeBars(rows);
  }
  function importCsv(file){
    if(!file)return;const reader=new FileReader();reader.onload=()=>{try{state.bars=parseOhlcCsv(reader.result);state.source=`CSV · ${file.name}`;showSource(`${state.source} · ${state.bars.length.toLocaleString('vi-VN')} nến · ${timeText(state.bars[0].time)} → ${timeText(state.bars[state.bars.length-1].time)}`);setStatus('CSV OHLC hợp lệ. Nhấn Analyze Structure để phân tích.')}catch(e){setStatus(e.message,true)}};reader.onerror=()=>setStatus('Không đọc được file CSV.',true);reader.readAsText(file);
  }
  function selectedCandidate(){
    if(!state.result)return null;
    return state.result.candidates.find(c=>c.id===state.selectedId)||state.result.preferred||null;
  }
  function runAnalysis(){
    try{
      if(!state.bars.length)loadChart('current');
      const options={atrPeriod:Number($('eAtrPeriod').value),thresholdMultiplier:Number($('eThreshold').value),scaleFactors:[.70,1,1.45,2.05],primaryScaleIndex:1,maxCandidates:32};
      const result=E().analyze(state.bars,options);state.result=result;state.selectedId=result.preferred?.id||null;state.selected=selectedCandidate();
      render();
      setStatus(result.candidates.length?`Phân tích xong · ${result.candidates.length} candidate · ${result.diagnostics.pivotCount} pivot ở primary scale.`:'Chưa tìm thấy count đủ điều kiện hình học. Không ép nhãn sóng.',!result.candidates.length);
      window.dispatchEvent(new CustomEvent('gx:elliott:analysis',{detail:{version:result.version,source:state.source,summary:{bars:result.dataSummary.observations,pivots:result.diagnostics.pivotCount,candidates:result.diagnostics.candidateCount,preferred:E().summarizeCandidate(result.preferred)}}}));
    }catch(e){setStatus(e.message||'Không thể phân tích dữ liệu.',true)}
  }
  function renderMetrics(){
    const r=state.result;if(!r)return;
    const cards=[['OBSERVATIONS',r.dataSummary.observations.toLocaleString('vi-VN'),'OHLC bars'],['PRIMARY PIVOTS',r.diagnostics.pivotCount,'Confirmed only'],['CANDIDATES',r.diagnostics.candidateCount,'Hard-rule filtered'],['SCALES',r.scales.length,'Directional-change thresholds']];
    $('eMetrics').innerHTML=cards.map(([a,b,c])=>`<div class="ql-metric"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join('');
  }
  function renderPreferred(){
    const r=state.result,c=selectedCandidate(),box=$('ePreferred');if(!r||!box)return;
    if(!c){box.innerHTML='<div class="e-empty"><b>No Clear Count</b><span>Chưa có cấu trúc ứng viên vượt qua các điều kiện hình học ở scale đang chọn. Có thể giảm/tăng sensitivity hoặc nạp thêm dữ liệu.</span></div>';return;}
    const status=c.status==='rules-passed'?'Các hard rules được kiểm tra đều đạt':c.status==='provisional'?'Candidate tạm thời · còn điều kiện chưa xác minh':'Candidate';
    box.innerHTML=`<div class="e-preferred-top"><div><small>SELECTED CANDIDATE</small><h3>${esc(patternNames[c.pattern]||c.pattern)}</h3><span class="e-dir ${c.direction}">${c.direction==='bullish'?'BULLISH':'BEARISH'}</span></div><div class="e-score"><b>${fmt(c.evidenceScore,1)}</b><small>Evidence / 100</small></div></div><p class="e-preferred-desc">${esc(status)} · ${esc(c.scoreLabel)}</p><div class="e-preferred-grid"><div><small>From</small><b>${esc(timeText(c.startTime))}</b></div><div><small>To</small><b>${esc(timeText(c.endTime))}</b></div><div><small>Hard rules</small><b>${c.ruleSummary.passed} pass · ${c.ruleSummary.failed} fail · ${c.ruleSummary.unverified} unverified</b></div><div><small>Scale agreement</small><b>${fmt(c.scaleAgreement*100,0)}%</b></div></div>${c.invalidation?.levels?.length?`<div class="e-invalidation"><b>Structural invalidation</b>${c.invalidation.levels.map(x=>`<div><span>${esc(x.name)}</span><strong>${fmt(x.price,5)}</strong><small>${esc(x.condition)}</small></div>`).join('')}<small>${esc(c.invalidation.note||'')}</small></div>`:''}${c.warnings?.length?`<ul class="e-warning-list">${c.warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`;
  }
  function renderCandidates(){
    const r=state.result;if(!r)return;
    const alternates=r.alternates||[];
    const alternateIds=new Set(alternates.map(c=>c.id));
    const otherCandidates=r.candidates.filter(c=>c.id!==r.preferred?.id&&!alternateIds.has(c.id)).slice(0,10);
    const row=(c,i)=>`<button type="button" class="e-candidate-row${c.id===state.selectedId?' selected':''}" data-e-candidate="${esc(c.id)}"><span class="e-cand-rank">${i+1}</span><span class="e-cand-main"><b>${esc(patternNames[c.pattern]||c.pattern)}</b><small>${c.direction==='bullish'?'Bullish':'Bearish'} · ${c.status==='provisional'?'Provisional':'Rules passed'} · ${c.ruleSummary.passed} rule pass</small></span><span class="e-cand-score">${fmt(c.evidenceScore,1)}</span></button>`;
    const alternateHtml=alternates.length?`<h5 class="e-candidate-section-title">Alternate interpretations · same swing interval</h5><div class="e-candidate-list">${alternates.map(row).join('')}</div>`:'<div class="e-empty e-empty-compact"><b>No close alternate count</b><span>Chưa có cách đếm khác có điểm đầu/cuối gần với Preferred Count.</span></div>';
    const otherHtml=otherCandidates.length?`<h5 class="e-candidate-section-title">Other pattern candidates · other intervals</h5><div class="e-candidate-list">${otherCandidates.map(row).join('')}</div>`:'';
    $('eCandidates').innerHTML=r.preferred?`${alternateHtml}${otherHtml}`:'<div class="e-empty"><b>No candidate detected</b><span>Thử kiểm tra chất lượng dữ liệu, timeframe và ATR threshold.</span></div>';
  }
  function renderRules(){
    const c=selectedCandidate();if(!c){$('eRules').innerHTML='<p class="msg">Chưa có candidate để kiểm tra.</p>';return;}
    const badge=s=>s==='pass'?'e-pass':s==='fail'?'e-fail':'e-unverified';
    $('eRules').innerHTML=`<div class="e-rule-table">${c.hardRules.map(x=>`<div class="e-rule-row"><span class="e-rule-status ${badge(x.status)}">${x.status.toUpperCase()}</span><div><b>${esc(x.label)}</b><small>${esc(x.id)} · ${esc(x.detail)}</small></div></div>`).join('')}</div><div class="e-rule-sep"></div><h4>Guidelines · scoring evidence</h4><div class="e-rule-table">${c.guidelines.map(x=>`<div class="e-rule-row"><span class="e-guideline-score">${fmt(x.score*100,0)}</span><div><b>${esc(x.label)}</b><small>${esc(x.id)} · ${esc(x.detail)}</small></div></div>`).join('')}</div><p class="e-caveat">Hard Rule và Guideline không được trộn lẫn. Guideline score chỉ dùng xếp hạng tương đối; không phải xác suất thành công.</p>`;
  }
  function renderFib(){
    const c=selectedCandidate();if(!c){$('eFib').innerHTML='<p class="msg">Chưa có projection.</p>';return;}
    $('eFib').innerHTML=c.fibTargets?.length?`<div class="ql-table-wrap"><table class="ql-table"><thead><tr><th>Projection</th><th>Ratio</th><th>Price</th><th>Method</th></tr></thead><tbody>${c.fibTargets.map(x=>`<tr><th>${esc(x.label)}</th><td>${fmt(x.ratio,3)}</td><td>${fmt(x.price,5)}</td><td>${esc(x.method)}</td></tr>`).join('')}</tbody></table></div><p class="e-caveat">Projection là vùng tham khảo có điều kiện, không phải price target chắc chắn. Các tỷ lệ Fibonacci không phải hard rules.</p>`:'<p class="msg">Mẫu hình đang chọn chưa có projection được định nghĩa trong phiên bản này.</p>';
  }
  function renderChannel(){
    const c=selectedCandidate(),el=$('eChannel');if(!el)return;
    if(!c||!c.channel){el.innerHTML='<p class="msg">Channel hiện được tính cho Impulse hoàn chỉnh hoặc kịch bản Wave 5 đang phát triển.</p>';return;}
    const ch=c.channel;
    el.innerHTML=`<div class="e-channel-box"><b>${esc(ch.role)}</b><br>Phương pháp: ${esc(ch.method)}<br>Độ dốc: ${fmt(ch.slopePerBar,6)} price / bar<br>Vị trí chiếu: bar ${ch.projectedIndex}<br><b>Channel projection: ${fmt(ch.projectedPrice,5)}</b>${ch.actualPrice==null?'':`<br>Giá Wave 5 thực tế: ${fmt(ch.actualPrice,5)}<br>Độ lệch: ${fmt(ch.deviation,5)}`}<p class="e-caveat">${esc(ch.note)}</p></div>`;
  }
  function renderCatalog(){
    const el=$('eCatalog');if(!el)return;
    const labels={'candidate-engine':'Candidate engine','context-required':'Context required','definition-only':'Definition only'};
    el.innerHTML=E().PATTERN_CATALOG.map(p=>`<div class="e-catalog-item"><b>${esc(p.name)}</b><small>${esc(p.internal||'—')} · ${p.legs==null?'multi-component':`${p.legs} legs`}</small><span class="e-catalog-state">${esc(labels[p.status]||p.status)}</span></div>`).join('');
  }
  function renderScale(){
    const r=state.result;if(!r)return;
    $('eScales').innerHTML=`<div class="e-scale-grid">${r.scales.map((s,i)=>`<div class="e-scale-cell ${i===r.primaryScaleIndex?'active':''}"><small>${i===r.primaryScaleIndex?'PRIMARY DEGREE':`DEGREE ${i+1}`}</small><b>${s.pivots.length} pivots</b><span>${fmt(s.thresholdMultiplier,2)} × ATR</span></div>`).join('')}</div><p class="e-caveat">Scale là các mức threshold biến động, không đồng nghĩa trực tiếp với Cycle / Primary / Intermediate / Minor. Degree Elliott cần thêm ngữ cảnh cấu trúc cha-con.</p>`;
  }
  function drawPlot(){
    const cv=$('ePlot');if(!cv||!state.result)return;
    const dpr=window.devicePixelRatio||1,w=Math.max(320,cv.clientWidth||720),h=260;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const bars=state.result.bars,step=Math.max(1,Math.ceil(bars.length/1200)),sample=bars.filter((_,i)=>i%step===0||i===bars.length-1);
    const vals=sample.map(b=>b.close),lo=Math.min(...vals),hi=Math.max(...vals),range=hi-lo||1,p={l:46,r:14,t:18,b:26};
    const x=i=>p.l+(i/Math.max(1,bars.length-1))*(w-p.l-p.r),y=v=>p.t+(hi-v)/range*(h-p.t-p.b);
    const css=getComputedStyle(document.documentElement),mut=css.getPropertyValue('--mut').trim()||'#9b927d',line=css.getPropertyValue('--line').trim()||'#555',accent=css.getPropertyValue('--acc').trim()||'#d8aa4c',green=css.getPropertyValue('--win').trim()||'#38b98a',red=css.getPropertyValue('--loss').trim()||'#de6682';
    ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.l,p.t);ctx.lineTo(p.l,h-p.b);ctx.lineTo(w-p.r,h-p.b);ctx.stroke();
    ctx.fillStyle=mut;ctx.font='10px Space Grotesk,sans-serif';ctx.fillText(fmt(hi,4),4,p.t+6);ctx.fillText(fmt(lo,4),4,h-p.b);
    ctx.strokeStyle=accent;ctx.lineWidth=1.45;ctx.beginPath();let started=false;for(let i=0;i<bars.length;i+=step){const xx=x(i),yy=y(bars[i].close);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)}if((bars.length-1)%step!==0){const b=bars[bars.length-1];ctx.lineTo(x(bars.length-1),y(b.close))}ctx.stroke();
    const c=selectedCandidate();const pivotSet=c?c.pivots:state.result.scales[state.result.primaryScaleIndex].pivots;
    pivotSet.forEach((piv,i)=>{const xx=x(piv.index),yy=y(piv.price);ctx.fillStyle=piv.kind==='high'?red:green;ctx.beginPath();ctx.arc(xx,yy,3.6,0,Math.PI*2);ctx.fill();ctx.strokeStyle=piv.kind==='high'?red:green;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,yy+(piv.kind==='high'?7:-7));ctx.lineTo(xx,yy+(piv.kind==='high'?17:-17));ctx.stroke();
      let label=piv.kind==='high'?'H':'L';if(c){const pIndex=c.pivots.findIndex(q=>q.index===piv.index&&q.kind===piv.kind);if(pIndex>=0){const pattern=c.pattern;if(pattern.includes('triangle'))label=['0','A','B','C','D','E'][pIndex]||label;else if(pattern==='zigzag'||pattern.includes('flat'))label=['0','A','B','C'][pIndex]||label;else label=['0','1','2','3','4','5'][pIndex]||label;}}
      ctx.fillStyle=mut;ctx.font='bold 10px Space Grotesk,sans-serif';ctx.textAlign='center';ctx.fillText(label,xx,yy+(piv.kind==='high'?-10:25));ctx.textAlign='left';
    });
    ctx.fillStyle=mut;ctx.font='10px Space Grotesk,sans-serif';ctx.fillText(`${bars.length.toLocaleString('vi-VN')} bars · close-confirmed pivots`,p.l,h-7);
  }
  function renderPivots(){
    const r=state.result;if(!r)return;const list=r.scales[r.primaryScaleIndex].pivots.slice(-20);
    $('ePivotTable').innerHTML=list.length?`<div class="ql-table-wrap"><table class="ql-table"><thead><tr><th>#</th><th>Type</th><th>Price</th><th>Pivot time</th><th>Confirmed at</th><th>Delay</th><th>Scale support</th></tr></thead><tbody>${list.map((p,i)=>`<tr><th>${r.scales[r.primaryScaleIndex].pivots.length-list.length+i+1}</th><td>${p.kind.toUpperCase()}</td><td>${fmt(p.price,5)}</td><td>${esc(timeText(p.time))}</td><td>${esc(timeText(p.confirmationTime))}</td><td>${p.confirmationDelayBars} bars</td><td>${p.scaleSupport}/${r.scales.length}</td></tr>`).join('')}</tbody></table></div>`:'<p class="msg">Chưa có pivot xác nhận.</p>';
  }
  function render(){
    renderMetrics();renderPreferred();renderCandidates();renderRules();renderFib();renderChannel();renderScale();renderPivots();renderCatalog();drawPlot();
    const b=$('eExport');if(b)b.disabled=!state.result;
  }
  function exportJson(){
    if(!state.result)return;const r=state.result,c=selectedCandidate();
    const payload={product:'Gexadecimal Elliott Structure Lab',version:r.version,source:state.source,settings:r.settings,diagnostics:r.diagnostics,preferred:E().summarizeCandidate(c),alternates:r.candidates.filter(x=>x.id!==c?.id).slice(0,10).map(E().summarizeCandidate),pivotScale:r.scales.map(s=>({id:s.id,factor:s.factor,thresholdMultiplier:s.thresholdMultiplier,pivots:s.pivots})),bars:r.bars};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gexadecimal-elliott-structure-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function init(){
    if(!$('eRun'))return;
    $('eRun').addEventListener('click',runAnalysis);
    $('eUseChart').addEventListener('click',()=>{try{loadChart($('eTimeframe').value)}catch(e){setStatus(e.message,true)}});
    $('eDemo').addEventListener('click',()=>{try{demoBars()}catch(e){setStatus(e.message,true)}});
    $('eCsvBtn').addEventListener('click',()=>$('eCsv').click());
    $('eCsv').addEventListener('change',e=>importCsv(e.target.files&&e.target.files[0]));
    $('eExport').addEventListener('click',exportJson);
    $('eCandidates').addEventListener('click',e=>{const b=e.target.closest('[data-e-candidate]');if(!b)return;state.selectedId=b.dataset.eCandidate;state.selected=selectedCandidate();render();});
    window.addEventListener('resize',()=>{if(state.result&&document.body.dataset.v==='quant')drawPlot()});
    try{demoBars();runAnalysis()}catch(e){setStatus(e.message,true)}
  }
  window.ElliottStructureLab={loadChart,analyze:runAnalysis,getResult:()=>state.result,getBars:()=>state.bars.slice(),getSelected:()=>selectedCandidate()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
