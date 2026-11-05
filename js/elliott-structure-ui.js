/* Gexadecimal Elliott Structure Lab UI · isolated from main chart renderers. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const E=()=>window.ElliottStructure;
  const state={bars:[],source:'',result:null,selectedId:null,selected:null,manualPivots:[],manualDataKey:null,manualLabels:{},manualDegrees:{},manualParents:{},manualLocks:{},asOfIndex:null,snapshots:[],showAlternates:false,dragPivotUid:null,plotTransform:null,xZoom:1,xCenterIndex:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
  const timeText=t=>{if(!Number.isFinite(Number(t)))return '—';try{return new Date(Number(t)*1000).toLocaleString('vi-VN',{hour12:false})}catch{return String(t)}};
  function roundedRectPath(ctx,x,y,w,h,r){
    if(typeof ctx.roundRect==='function'){ctx.roundRect(x,y,w,h,r);return;}
    const rr=Math.min(r,w/2,h/2);ctx.moveTo(x+rr,y);ctx.lineTo(x+w-rr,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rr);ctx.lineTo(x+w,y+h-rr);ctx.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);ctx.lineTo(x+rr,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rr);ctx.lineTo(x,y+rr);ctx.quadraticCurveTo(x,y,x+rr,y);
  }
  const patternNames={impulse:'Impulse',extended_impulse:'Extended Impulse · proxy',truncated_fifth:'Truncated Fifth',impulse_developing_wave5:'Impulse · Wave 5 đang hình thành',diagonal_candidate:'Contracting Diagonal Candidate',expanding_diagonal_candidate:'Expanding Diagonal Candidate',zigzag:'Zigzag',regular_flat:'Regular Flat',expanded_flat:'Expanded Flat',running_flat:'Running Flat',contracting_triangle:'Contracting Triangle',expanding_triangle:'Expanding Triangle',barrier_triangle:'Barrier Triangle',double_zigzag:'Double Zigzag (W-X-Y)',double_three:'Double Three (W-X-Y)',triple_zigzag:'Triple Zigzag (W-X-Y-X-Z)',triple_three:'Triple Three (W-X-Y-X-Z)'};
  const setStatus=(message,bad=false)=>{const el=$('eStatus');if(el){el.textContent=message;el.classList.toggle('is-bad',!!bad);el.classList.toggle('is-good',!bad)}};
  const showSource=(message)=>{const el=$('eDataMeta');if(el)el.textContent=message};

  function syncAsOfControl(){
    const range=$('eAsOfRange'),label=$('eAsOfLabel');if(!range||!state.bars.length)return;
    const max=state.bars.length-1;range.min='19';range.max=String(max);
    if(state.asOfIndex==null||state.asOfIndex>max)state.asOfIndex=max;
    state.asOfIndex=Math.max(19,Math.min(max,Math.round(state.asOfIndex)));range.value=String(state.asOfIndex);
    if(label)label.textContent=`${(state.asOfIndex+1).toLocaleString('vi-VN')} / ${state.bars.length.toLocaleString('vi-VN')} bars · ${timeText(state.bars[state.asOfIndex].time)}`;
    const barInput=$('eManualBarIndex');if(barInput){barInput.max=String(max);if(Number(barInput.value)>max)barInput.value=String(max);}
  }
  function dataIdentityKey(){
    const first=state.bars[0]?.time??'';let symbol='';try{symbol=typeof C!=='undefined'?C.sym:''}catch{}
    const tf=state.source.includes('M1')?'M1':(typeof C!=='undefined'?C.tf:'unknown');const delta=state.bars.length>1?state.bars[1].time-state.bars[0].time:'na';let hash=2166136261;for(const b of state.bars){const raw=[b.time,b.open,b.high,b.low,b.close].join('|');for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}}return`${state.source}|${symbol}|${tf}|${state.bars.length}|${first}|${delta}|${hash.toString(16)}`;
  }
  function visibleManualPivots(){const max=state.result?.bars?.length-1??-1;return state.manualPivots.filter(p=>p.index<=max).slice().sort((a,b)=>a.index-b.index);}
  function initializeManualPivots(result){
    const key=dataIdentityKey();
    if(state.manualDataKey!==key){state.manualDataKey=key;state.manualPivots=[];state.manualLabels={};state.manualDegrees={};state.manualParents={};state.manualLocks={};}
    const seen=new Set(state.manualPivots.map(p=>p.uid));
    const detected=result.scales[result.primaryScaleIndex].pivots;
    detected.forEach(p=>{const uid=`det:${p.index}:${p.kind}`;if(!seen.has(uid)){state.manualPivots.push({...p,uid,manual:false});seen.add(uid);}});
    state.manualPivots.sort((a,b)=>a.index-b.index);
  }
  function saveScenarioSnapshot(){
    const c=selectedCandidate();if(!state.result||!c)return;
    const asOfTime=state.result.dataSummary.asOfTime;
    const duplicate=state.snapshots.find(x=>x.datasetKey===state.manualDataKey&&x.asOfTime===asOfTime&&x.candidateId===c.id);
    if(!duplicate){state.snapshots.unshift({id:`${state.manualDataKey}:${asOfTime}:${c.id}`,datasetKey:state.manualDataKey,candidateId:c.id,pattern:c.pattern,direction:c.direction,asOfTime,source:state.source,status:'active',candidate:JSON.parse(JSON.stringify(c)),summary:E().summarizeCandidate(c)});state.snapshots=state.snapshots.slice(0,80);}
    state.snapshots=state.snapshots.map(s=>s.datasetKey===state.manualDataKey?E().updateScenarioLifecycle([s],state.bars)[0]:s);
    renderSnapshots();
  }

  function chartBars(mode='current'){
    if(mode==='m1'){
      if(typeof m1==='undefined'||!Array.isArray(m1)||m1.length<20)throw new Error('Chart chưa có ít nhất 20 nến M1. Hãy tải dữ liệu trước.');
      return m1.map(b=>({time:Number(b[0]),open:b[1],high:b[2],low:b[3],close:b[4],volume:b[5]||0}));
    }
    if(typeof agg==='undefined'||!Array.isArray(agg)||agg.length<20)throw new Error('Chart chưa có ít nhất 20 nến ở timeframe hiện tại.');
    return agg.map(b=>({time:Number(b.st??b.time),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.v??b.volume??0}));
  }
  function loadChart(mode='current'){
    const bars=chartBars(mode);state.bars=E().normalizeBars(bars);state.source=(mode==='m1'?'Chart · M1':'Chart · timeframe hiện tại')+(typeof RP!=='undefined'&&RP.on?' · REPLAY':'');state.asOfIndex=state.bars.length-1;syncAsOfControl();
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
    state.bars=E().normalizeBars(bars);state.source='Synthetic Elliott DEMO · không phải market feed';state.asOfIndex=state.bars.length-1;syncAsOfControl();
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
    if(!file)return;const reader=new FileReader();reader.onload=()=>{try{state.bars=parseOhlcCsv(reader.result);state.source=`CSV · ${file.name}`;state.asOfIndex=state.bars.length-1;syncAsOfControl();showSource(`${state.source} · ${state.bars.length.toLocaleString('vi-VN')} nến · ${timeText(state.bars[0].time)} → ${timeText(state.bars[state.bars.length-1].time)}`);setStatus('CSV OHLC hợp lệ. Đang tự nhận diện cấu trúc…');runAnalysis()}catch(e){setStatus(e.message,true)}};reader.onerror=()=>setStatus('Không đọc được file CSV.',true);reader.readAsText(file);
  }
  function selectedCandidate(){
    if(!state.result)return null;
    return state.result.candidates.find(c=>c.id===state.selectedId)||state.result.preferred||null;
  }
  function runAnalysis(){
    try{
      if(!state.bars.length)loadChart('current');
      if(state.asOfIndex==null||state.asOfIndex>=state.bars.length)state.asOfIndex=state.bars.length-1;
      syncAsOfControl();
      const options={autoMode:true,maxCandidates:96,asOfIndex:state.asOfIndex,projectionMode:'arithmetic',zoneAtrMultiplier:.05,quantStats:window.QuantStats||null};
      const result=E().analyze(state.bars,options);state.result=result;initializeManualPivots(result);state.selectedId=result.preferred?.id||null;state.selected=selectedCandidate();
      if(result.preferred){const span=Math.max(1,result.preferred.endIndex-result.preferred.startIndex),targetBars=Math.max(72,Math.min(state.bars.length,Math.round(span*2.6)));state.xZoom=Math.max(1,Math.min(10,state.bars.length/targetBars));state.xCenterIndex=(result.preferred.startIndex+result.preferred.endIndex)/2;}else{state.xZoom=1;state.xCenterIndex=null;}
      render();saveScenarioSnapshot();
      const recursive=result.diagnostics.recursiveCounts||0,matched=result.diagnostics.recursiveMatchedCounts||0;
      setStatus(result.candidates.length?`Đã nhận diện ${patternNames[result.preferred?.pattern]||'cấu trúc sóng'} · ${result.diagnostics.pivotCount} điểm cấu trúc · ${result.diagnostics.candidateCount} giả thuyết · ${timeText(result.dataSummary.asOfTime)}.`:'Chưa có count đủ điều kiện. Hãy thử timeframe khác hoặc nạp thêm dữ liệu.',!result.candidates.length);
      window.dispatchEvent(new CustomEvent('gx:elliott:analysis',{detail:{version:result.version,source:state.source,asOfTime:result.dataSummary.asOfTime,lookaheadProtected:true,summary:{bars:result.dataSummary.observations,pivots:result.diagnostics.pivotCount,candidates:result.diagnostics.candidateCount,preferred:E().summarizeCandidate(result.preferred)}}}));
    }catch(e){setStatus(e.message||'Không thể phân tích dữ liệu.',true)}
  }

  function analyzeReplayCursor(){
    try{
      if(typeof RP==='undefined'||!RP.on)throw new Error('Hãy bật Replay trên Chart trước, rồi nhấn lại Analyze Replay Cursor.');
      loadChart('m1');state.asOfIndex=state.bars.length-1;syncAsOfControl();runAnalysis();
      setStatus(`Replay snapshot đã dùng ${state.result?.bars.length||0} nến M1 đang hiển thị tại cursor; không đọc phần tương lai đang ẩn trong replay.`,false);
    }catch(e){setStatus(e.message,true)}
  }

  function renderMetrics(){
    const r=state.result;if(!r)return;
    const cards=[['OBSERVATIONS',r.dataSummary.observations.toLocaleString('vi-VN'),'As-of bars only'],['PRIMARY PIVOTS',r.diagnostics.pivotCount,'Confirmed only'],['CANDIDATES',r.diagnostics.candidateCount,`${r.diagnostics.recursiveCounts||0} full child grammar`],['SCALES',r.scales.length,'Nested threshold degrees']];
    $('eMetrics').innerHTML=cards.map(([a,b,c])=>`<div class="ql-metric"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join('');
  }
  function renderPreferred(){
    const r=state.result,c=selectedCandidate(),box=$('ePreferred');if(!r||!box)return;
    if(!c){box.innerHTML='<div class="e-empty"><b>Chưa nhận diện được cấu trúc sóng rõ ràng</b><span>Thử đổi timeframe hoặc nạp thêm dữ liệu. Hệ thống không tự gán nhãn khi chưa đủ điều kiện.</span></div>';return;}
    const status=c.status==='rules-passed'?'Đạt các hard rule có thể kiểm tra':c.status==='provisional'?'Đang chờ xác nhận sóng cha/con':'Ứng viên cấu trúc';
    const direction=c.direction==='bullish'?'Tăng':'Giảm';
    const invalidation=c.invalidation?.levels?.[0];
    const hd=c.hierarchyDiagnostics||{};const hierarchyText=`Sóng con khớp ${hd.recursiveMatchedLegs||0}/${hd.recursiveTotalLegs||0} nhịp · được sóng cha hỗ trợ ${hd.parentSupport||0} lần`;
    box.innerHTML=`<div class="e-preferred-simple"><div><small>COUNT ĐANG ƯU TIÊN</small><h3>${esc(patternNames[c.pattern]||c.pattern)}</h3><span class="e-dir ${c.direction}">${direction}</span></div><div class="e-simple-status">${esc(status)}</div></div><div class="e-simple-meta"><span><small>Bắt đầu</small><b>${esc(timeText(c.startTime))}</b></span><span><small>Cập nhật đến</small><b>${esc(timeText(c.endTime))}</b></span><span><small>Đối chiếu đa cấp</small><b>${esc(hierarchyText)}</b></span>${invalidation?`<span><small>Mốc vô hiệu hóa chính</small><b>${fmt(invalidation.price,5)}</b></span>`:''}</div>${c.warnings?.length?`<p class="e-caveat">${esc(c.warnings.slice(0,2).join(' '))}</p>`:''}`;
  }
  function renderCandidates(){
    const r=state.result;if(!r)return;
    const alternates=r.alternates||[];
    const alternateIds=new Set(alternates.map(c=>c.id));
    const otherCandidates=r.candidates.filter(c=>c.id!==r.preferred?.id&&!alternateIds.has(c.id)).slice(0,10);
    const row=(c,i)=>`<button type="button" class="e-candidate-row${c.id===state.selectedId?' selected':''}" data-e-candidate="${esc(c.id)}"><span class="e-cand-rank">${i+1}</span><span class="e-cand-main"><b>${esc(patternNames[c.pattern]||c.pattern)}</b><small>${c.direction==='bullish'?'Bullish':'Bearish'} · ${c.status==='provisional'?'Provisional':'Rules passed'} · ${c.ruleSummary.passed} rule pass · ${c.hierarchyDiagnostics?.parentSupport||0} parent links · D${(c.degreeIndex??0)+1}</small></span><span class="e-cand-score">${fmt(c.hierarchyScore??c.evidenceScore,1)}</span></button>`;
    const alternateHtml=alternates.length?`<h5 class="e-candidate-section-title">Alternate interpretations · same swing interval</h5><div class="e-candidate-list">${alternates.map(row).join('')}</div>`:'<div class="e-empty e-empty-compact"><b>No close alternate count</b><span>Chưa có cách đếm khác có điểm đầu/cuối gần với Preferred Count.</span></div>';
    const otherHtml=otherCandidates.length?`<h5 class="e-candidate-section-title">Other pattern candidates · other intervals</h5><div class="e-candidate-list">${otherCandidates.map(row).join('')}</div>`:'';
    $('eCandidates').innerHTML=r.preferred?`${alternateHtml}${otherHtml}`:'<div class="e-empty"><b>No candidate detected</b><span>Thử timeframe khác hoặc nạp thêm dữ liệu để cấu trúc được xác nhận.</span></div>';
  }
  function renderRules(){
    const c=selectedCandidate();if(!c){$('eRules').innerHTML='<p class="msg">Chưa có candidate để kiểm tra.</p>';return;}
    const badge=s=>s==='pass'?'e-pass':s==='fail'?'e-fail':'e-unverified';
    $('eRules').innerHTML=`<div class="e-rule-table">${c.hardRules.map(x=>`<div class="e-rule-row"><span class="e-rule-status ${badge(x.status)}">${x.status.toUpperCase()}</span><div><b>${esc(x.label)}</b><small>${esc(x.id)} · ${esc(x.detail)}</small></div></div>`).join('')}</div><div class="e-rule-sep"></div><h4>Guidelines · scoring evidence</h4><div class="e-rule-table">${c.guidelines.map(x=>`<div class="e-rule-row"><span class="e-guideline-score">${fmt(x.score*100,0)}</span><div><b>${esc(x.label)}</b><small>${esc(x.id)} · ${esc(x.detail)}</small></div></div>`).join('')}</div><p class="e-caveat">Hard Rule và Guideline không được trộn lẫn. Guideline score chỉ dùng xếp hạng tương đối; không phải xác suất thành công.</p>`;
  }
  function renderFib(){
    const c=selectedCandidate();if(!c){$('eFib').innerHTML='<p class="msg">Chưa có projection.</p>';return;}
    $('eFib').innerHTML=c.fibTargets?.length?`<div class="ql-table-wrap"><table class="ql-table"><thead><tr><th>Projection / zone</th><th>Ratio</th><th>Price / metric</th><th>Zone</th><th>Formula · Source</th></tr></thead><tbody>${c.fibTargets.map(x=>`<tr><th>${esc(x.label)}</th><td>${fmt(x.ratio,3)}</td><td>${x.price==null?'—':fmt(x.price,5)}</td><td>${x.zoneLow==null?'—':`${fmt(x.zoneLow,5)} – ${fmt(x.zoneHigh,5)}`}</td><td>${esc(x.formula||x.method||'')} · ${esc(x.source||'')}</td></tr>`).join('')}</tbody></table></div><p class="e-caveat">Zone width là tolerance kỹ thuật ban đầu (tick floor / ATR multiplier), chưa được hiệu chỉnh trên dữ liệu forecast error. Fibonacci là guideline, không phải hard rule hoặc xác suất chạm đích.</p>`:'<p class="msg">Mẫu hình đang chọn chưa có projection được định nghĩa trong phiên bản này.</p>';
  }

  function renderForecast(){
    const el=$('eForecast');if(!el)return;
    const c=selectedCandidate();const f=c?.id===state.result?.preferred?.id?state.result.nextWaveForecast:E().buildNextWaveForecast(c,state.result?.candidates||[],state.result?.bars||[],{quantStats:window.QuantStats||null});
    if(!f||!f.available){el.innerHTML=`<div class="e-empty"><b>Chưa đủ ngữ cảnh để dự đoán sóng kế tiếp</b><span>${esc(f?.reason||'Khi chưa xác định được nhịp kế tiếp ở degree phù hợp, hệ thống sẽ không tự tạo mục tiêu.')}</span></div>`;return;}
    const direction=f.direction==='up'?'Tăng':'Giảm',q=f.quant;
    const preferredRatio=f.wave==='5'?1:.5;
    const keyFib=(f.fib||[]).filter(x=>Math.abs(Number(x.ratio)-preferredRatio)<1e-8).slice(0,1);
    const fibRows=(keyFib.length?keyFib:f.fib||[]).slice(0,3).map(x=>`<div class="e-target-row"><span>${esc(x.label)}</span><b>${fmt(x.price,5)}</b><small>${fmt(x.ratio,3)}×</small></div>`).join('');
    const quantHtml=q?`<div class="e-quant-forecast"><div class="e-quant-main"><small>QUANT · TRUNG VỊ MẪU TƯƠNG ĐỒNG</small><b>${fmt(q.centerPrice,5)}</b><span>Khoảng P25–P75: ${fmt(q.lowPrice,5)} – ${fmt(q.highPrice,5)}</span></div><div class="e-quant-stats"><div><small>Số mẫu</small><b>${q.sampleCount}</b></div><div><small>Tỷ lệ trung vị</small><b>${fmt(q.ratioP50,3)}×</b></div></div><p class="e-caveat">${q.sampleCount<5?'Mẫu rất ít; chỉ nên xem là tham khảo.':q.sampleCount<12?'Mẫu còn nhỏ, vùng giá có thể thay đổi đáng kể.':'Phân vị mô tả lịch sử tương đồng, không phải xác suất chạm mục tiêu.'} ${esc(q.method||'Historical analogs')}.</p></div>`:`<div class="e-empty e-empty-compact"><b>Quant chưa đủ mẫu tương đồng</b><span>Vẫn có thể tham khảo các mốc Fibonacci bên cạnh. Cần thêm lịch sử OHLC để thống kê đáng tin cậy hơn.</span></div>`;
    el.innerHTML=`<div class="e-forecast-head"><span class="e-dir ${f.direction==='up'?'bullish':'bearish'}">Wave ${esc(f.wave)} · kỳ vọng ${direction}</span><small>Điểm xuất phát: ${fmt(f.origin,5)}</small></div><div class="e-simple-forecast-grid"><section><h5>Fibonacci</h5>${fibRows||'<p class="msg">Không có mốc phù hợp.</p>'}</section><section><h5>QuantLab · mẫu tương đồng</h5>${quantHtml}</section></div><p class="e-caveat">Đây là vùng mục tiêu theo kịch bản, không phải lời hứa giá hay tín hiệu giao dịch. Count có thể thay đổi khi có cấu trúc mới hoặc bị vô hiệu hóa.</p>`;
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
    const hierarchy=r.degreeHierarchy||[];
    $('eScales').innerHTML=`<div class="e-scale-grid">${r.scales.map((s,i)=>{const level=hierarchy[i]||{};const childCount=(hierarchy[i-1]?.legs||[]).reduce((n,leg)=>n+(leg.children||[]).length,0);return`<div class="e-scale-cell ${i===r.primaryScaleIndex?'active':''}"><small>${i===r.primaryScaleIndex?'PRIMARY DEGREE':`DEGREE ${i+1}`}</small><b>${s.pivots.length} pivots</b><span>Tự động điều chỉnh · ${level.legs?.length||0} legs</span><span>${childCount} child-leg links</span></div>`}).join('')}</div><p class="e-caveat">Degree được biểu diễn bằng threshold và interval nesting, không gán cứng M5 = Minor hay H1 = Intermediate. Child-leg link chỉ mô tả quan hệ thời gian bao chứa; recursive grammar phải có candidate con tương ứng mới được đánh dấu matched.</p>`;
  }

  function waveStructureLabels(c){
    if(!c?.pivots?.length)return[];
    const n=c.pivots.length,id=c.pattern;
    if(id==='impulse_developing_wave5')return['0','1','2','3','4'];
    if(['impulse','extended_impulse','truncated_fifth','diagonal_candidate','expanding_diagonal_candidate','leading_diagonal','ending_diagonal'].includes(id))return n===6?['0','1','2','3','4','5']:c.pivots.map((_,i)=>String(i));
    if(['zigzag','regular_flat','expanded_flat','running_flat'].includes(id))return n===4?['0','A','B','C']:c.pivots.map((_,i)=>String(i));
    if(id.includes('triangle'))return n===6?['0','A','B','C','D','E']:c.pivots.map((_,i)=>String.fromCharCode(65+i));
    if(id==='double_zigzag'||id==='double_three')return n===4?['0','W','X','Y']:c.pivots.map((_,i)=>String(i));
    if(id==='triple_zigzag'||id==='triple_three')return n===6?['0','W','X','Y','X','Z']:c.pivots.map((_,i)=>String(i));
    return c.pivots.map((_,i)=>String(i));
  }

  function drawPlot(){
    const cv=$('ePlot');if(!cv||!state.result)return;
    const dpr=window.devicePixelRatio||1,w=Math.max(320,cv.clientWidth||720),h=Math.max(240,cv.clientHeight||320);
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const bars=state.result.bars,selected=selectedCandidate(),n=bars.length;
    const total=n,zoom=Number(state.xZoom)||1,visibleCount=zoom<=1.001?total:Math.max(40,Math.min(total,Math.round(total/zoom)));
    const center=Number.isFinite(state.xCenterIndex)?state.xCenterIndex:(selected?(selected.startIndex+selected.endIndex)/2:n-1);
    const viewStart=visibleCount>=total?0:Math.max(0,Math.min(total-visibleCount,Math.round(center-visibleCount/2)));
    const viewEnd=Math.min(total-1,viewStart+visibleCount-1),visible=bars.slice(viewStart,viewEnd+1);
    const forecast=selected?.id===state.result?.preferred?.id?state.result.nextWaveForecast:E().buildNextWaveForecast(selected,state.result?.candidateForest||state.result?.candidates||[],bars,{quantStats:window.QuantStats||null});
    const values=visible.flatMap(b=>[b.high,b.low]);
    (selected?.pivots||[]).forEach(q=>{if(q.index>=viewStart&&q.index<=viewEnd)values.push(q.price)});
    let lo=Math.min(...values),hi=Math.max(...values);if(!(hi>lo)){lo-=1;hi+=1;}const pad=(hi-lo)*.075;lo-=pad;hi+=pad;const range=hi-lo;
    const p={l:56,r:Math.max(94,Math.min(128,w*.18)),t:22,b:34};
    const x=i=>p.l+((i-viewStart)/Math.max(1,viewEnd-viewStart))*(w-p.l-p.r),y=v=>p.t+(hi-v)/range*(h-p.t-p.b);
    state.plotTransform={w,h,p,lo,hi,x,y,viewStart,viewEnd,visibleCount};
    const css=getComputedStyle(document.documentElement),mut=css.getPropertyValue('--mut').trim()||'#9b927d',line=css.getPropertyValue('--line').trim()||'#555',accent=css.getPropertyValue('--acc').trim()||'#d8aa4c',green=css.getPropertyValue('--win').trim()||'#38b98a',cardColor=css.getPropertyValue('--card').trim()||'#111';
    ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.l,p.t);ctx.lineTo(p.l,h-p.b);ctx.lineTo(w-p.r,h-p.b);ctx.stroke();
    ctx.fillStyle=mut;ctx.font='10px Space Grotesk,sans-serif';ctx.textAlign='left';ctx.fillText(fmt(hi,4),5,p.t+4);ctx.fillText(fmt(lo,4),5,h-p.b);
    ctx.save();ctx.beginPath();ctx.rect(p.l,p.t,w-p.l-p.r,h-p.t-p.b);ctx.clip();
    const step=Math.max(1,Math.ceil(visible.length/1800));ctx.strokeStyle=mut;ctx.globalAlpha=.68;ctx.lineWidth=1;ctx.beginPath();let started=false;
    for(let i=viewStart;i<=viewEnd;i+=step){const xx=x(i),yy=y(bars[i].close);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)}
    if((viewEnd-viewStart)%step!==0)ctx.lineTo(x(viewEnd),y(bars[viewEnd].close));ctx.stroke();ctx.globalAlpha=1;

    const forest=state.result.candidateForest||state.result.candidates||[];
    const parentKeys=selected?.parentCandidateKeys||[];
    const childKeys=(selected?.recursiveGrammar?.legs||[]).map(v=>v.childCandidateKey).filter(Boolean);
    const parentCounts=forest.filter(c=>parentKeys.includes(c.candidateKey)).slice(0,1);
    const childCounts=forest.filter(c=>childKeys.includes(c.candidateKey));
    const drawStructure=(candidate,color,width,alpha,dash=[])=>{
      if(!candidate?.pivots?.length||candidate.pivots.length<2)return;
      ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();
      candidate.pivots.forEach((q,i)=>{if(i===0)ctx.moveTo(x(q.index),y(q.price));else ctx.lineTo(x(q.index),y(q.price));});ctx.stroke();ctx.restore();
    };
    // Draw the parent context and matched child structures softly. The selected
    // count remains the only structure with prominent wave labels.
    parentCounts.forEach(c=>drawStructure(c,mut,1.15,.42,[4,4]));
    childCounts.forEach(c=>drawStructure(c,mut,1.05,.34,[]));
    if(selected?.pivots?.length){
      const labels=waveStructureLabels(selected),pts=selected.pivots;
      ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.setLineDash([]);ctx.beginPath();pts.forEach((q,i)=>{if(i===0)ctx.moveTo(x(q.index),y(q.price));else ctx.lineTo(x(q.index),y(q.price));});ctx.stroke();
      const placed=[];ctx.font='800 10px Space Grotesk,sans-serif';
      pts.forEach((q,i)=>{
        const xx=x(q.index),yy=y(q.price),label=labels[i]||String(i);ctx.fillStyle=accent;ctx.beginPath();ctx.arc(xx,yy,3.6,0,Math.PI*2);ctx.fill();
        const bw=Math.max(20,ctx.measureText(label).width+10),bh=18;
        const offsets=[[0,-26],[0,26],[-22,-26],[22,26],[-30,0],[30,0],[0,-46],[0,46],[-42,-20],[42,20]];
        let best=null,bestCost=Infinity;
        for(const [dx,dy] of offsets){
          const bx=Math.max(p.l+bw/2+2,Math.min(w-p.r-bw/2-2,xx+dx));
          const by=Math.max(p.t+bh/2+2,Math.min(h-p.b-bh/2-2,yy+dy));
          const overlap=placed.reduce((sum,a)=>{const ox=Math.max(0,(a.w+bw)/2+4-Math.abs(a.x-bx)),oy=Math.max(0,(a.h+bh)/2+3-Math.abs(a.y-by));return sum+ox*oy;},0);
          const cost=overlap*100+Math.hypot(dx,dy)*.08;
          if(cost<bestCost){bestCost=cost;best={x:bx,y:by,w:bw,h:bh};}
          if(overlap===0)break;
        }
        const box=best||{x:xx,y:yy-25,w:bw,h:bh};placed.push(box);
        ctx.save();ctx.strokeStyle=accent;ctx.globalAlpha=.62;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(box.x,box.y+(box.y<yy?bh/2:-bh/2));ctx.stroke();ctx.globalAlpha=1;
        ctx.fillStyle=cardColor;ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.beginPath();roundedRectPath(ctx,box.x-bw/2,box.y-bh/2,bw,bh,5);ctx.fill();ctx.stroke();ctx.fillStyle=accent;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,box.x,box.y);ctx.restore();
      });ctx.textAlign='left';ctx.textBaseline='alphabetic';
    }
    if(forecast?.available){
      const levels=[];if(forecast.quant)levels.push({label:'QUANT',price:forecast.quant.centerPrice,color:green,width:2});
      const centralRatio=forecast.wave==='5'?1:.5,centralFib=(forecast.fib||[]).find(v=>Math.abs(Number(v.ratio)-centralRatio)<1e-8);
      if(centralFib)levels.push({label:'FIB',price:centralFib.price,color:accent,width:1});
      levels.filter(lv=>lv.price>=lo&&lv.price<=hi).forEach((lv,i)=>{const yy=y(lv.price);ctx.save();ctx.strokeStyle=lv.color;ctx.globalAlpha=.76;ctx.lineWidth=lv.width;ctx.setLineDash(lv.label==='QUANT'?[]:[5,4]);ctx.beginPath();ctx.moveTo(x(Math.max(viewStart,selected?.endIndex??viewEnd)),yy);ctx.lineTo(w-p.r+3,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=lv.color;ctx.font='bold 9px Space Grotesk,sans-serif';ctx.fillText(`${lv.label} ${fmt(lv.price,4)}`,w-p.r+7,yy+(i%2?12:-5));ctx.restore();});
    }
    ctx.restore();
    // Compact X-axis date ticks follow the current visible bar window.
    ctx.fillStyle=mut;ctx.font='9px Space Grotesk,sans-serif';ctx.textAlign='center';
    [0,.25,.5,.75,1].forEach(fr=>{const idx=Math.round(viewStart+fr*(viewEnd-viewStart)),t=bars[idx]?.time;const label=Number.isFinite(t)?new Date(t*1000).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}):'';ctx.fillText(label,x(idx),h-9);});
    ctx.textAlign='left';const zoomLabel=$('eXZoomLabel');if(zoomLabel)zoomLabel.textContent=`${zoom.toFixed(1)}× · ${visibleCount.toLocaleString('vi-VN')} nến`;
    const zoomInput=$('eXZoom');if(zoomInput&&Math.abs(Number(zoomInput.value)-zoom)>.04)zoomInput.value=String(zoom);
  }

  function moveManualPivot(uid,targetIndex){
    const pivot=state.manualPivots.find(p=>p.uid===uid);if(!pivot||state.manualLocks[uid])return false;
    const bars=state.result?.bars||[];if(!bars.length)return false;
    const pos=state.manualPivots.indexOf(pivot),prev=state.manualPivots[pos-1],next=state.manualPivots[pos+1];
    const min=prev?prev.index+1:0,max=next?next.index-1:bars.length-1;
    if(max<min)return false;const idx=Math.max(min,Math.min(max,Math.round(targetIndex)));
    const bar=bars[idx];if(!bar)return false;
    pivot.index=idx;pivot.time=bar.time;pivot.price=pivot.kind==='high'?bar.high:bar.low;pivot.manual=true;pivot.confirmed=true;pivot.confirmationIndex=idx;pivot.confirmationTime=bar.time;pivot.confirmationDelayBars=0;
    state.manualPivots.sort((a,b)=>a.index-b.index);return true;
  }
  function handlePlotPointerDown(e){
    const cv=$('ePlot'),tr=state.plotTransform;if(!cv||!tr)return;const rect=cv.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top;
    const pivot=visibleManualPivots().map(p=>({p,x:tr.x(p.index),y:tr.y(p.price)})).filter(q=>Math.hypot(q.x-px,q.y-py)<=11).sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py))[0]?.p;
    if(!pivot||state.manualLocks[pivot.uid])return;state.dragPivotUid=pivot.uid;cv.setPointerCapture?.(e.pointerId);e.preventDefault();
  }
  function handlePlotPointerMove(e){
    if(!state.dragPivotUid||!state.plotTransform)return;const rect=$('ePlot').getBoundingClientRect(),px=e.clientX-rect.left,tr=state.plotTransform;
    const idx=Math.round(tr.viewStart+(px-tr.p.l)/Math.max(1,tr.w-tr.p.l-tr.p.r)*Math.max(1,tr.viewEnd-tr.viewStart));
    if(moveManualPivot(state.dragPivotUid,idx)){renderManualCount();manualAudit();drawPlot();}
  }
  function handlePlotPointerUp(){state.dragPivotUid=null;}

  function renderPivots(){
    const r=state.result;if(!r)return;const list=r.scales[r.primaryScaleIndex].pivots.slice(-20);
    $('ePivotTable').innerHTML=list.length?`<div class="ql-table-wrap"><table class="ql-table"><thead><tr><th>#</th><th>Type</th><th>Price</th><th>Pivot time</th><th>Confirmed at</th><th>Delay</th><th>Scale support</th></tr></thead><tbody>${list.map((p,i)=>`<tr><th>${r.scales[r.primaryScaleIndex].pivots.length-list.length+i+1}</th><td>${p.kind.toUpperCase()}</td><td>${fmt(p.price,5)}</td><td>${esc(timeText(p.time))}</td><td>${esc(timeText(p.confirmationTime))}</td><td>${p.confirmationDelayBars} bars</td><td>${p.scaleSupport}/${r.scales.length}</td></tr>`).join('')}</tbody></table></div>`:'<p class="msg">Chưa có pivot xác nhận.</p>';
  }
  function render(){
    renderMetrics();renderPreferred();renderForecast();renderCandidates();renderRules();renderFib();renderChannel();renderScale();renderPivots();renderCatalog();renderManualCount();drawPlot();
    const b=$('eExport');if(b)b.disabled=!state.result;
  }

  function renderManualCount(){
    const sel=$('eManualPivot'),tbl=$('eManualTable');if(!sel||!tbl)return;
    const pivots=visibleManualPivots(),previous=sel.value;sel.innerHTML=pivots.map((p,i)=>`<option value="${esc(p.uid)}">P${i+1} · ${p.kind.toUpperCase()} · ${fmt(p.price,5)} · ${esc(timeText(p.time))}${p.manual?' · manual':''}</option>`).join('')||'<option value="">No pivots</option>';
    if(previous&&pivots.some(p=>p.uid===previous))sel.value=previous;
    const entries=Object.entries(state.manualLabels).map(([uid,label])=>({uid,label,degree:state.manualDegrees[uid]||'degree-2',parent:state.manualParents[uid]||'none',locked:!!state.manualLocks[uid],p:state.manualPivots.find(x=>x.uid===uid)})).filter(x=>x.p&&x.p.index<=((state.result?.bars?.length||0)-1)).sort((a,b)=>a.p.index-b.p.index);
    tbl.innerHTML=entries.length?`<table class="ql-table"><thead><tr><th>Pivot</th><th>Label</th><th>Price</th><th>Degree → Parent</th><th>Time</th><th>Actions</th></tr></thead><tbody>${entries.map((x,i)=>`<tr><td>P${i+1}</td><td><b>${esc(x.label)}</b></td><td>${fmt(x.p.price,5)}</td><td>${esc(x.degree.replace('degree-','D'))} → ${esc(x.parent==='none'?'—':x.parent.replace('degree-','D'))}</td><td>${esc(timeText(x.p.time))}</td><td><button class="btn ghost sm" data-e-manual-lock="${esc(x.uid)}" type="button">${x.locked?'Unlock':'Lock'}</button> <button class="btn ghost sm" data-e-manual-remove-label="${esc(x.uid)}" type="button" ${x.locked?'disabled':''}>Unlabel</button></td></tr>`).join('')}</tbody></table>`:'<p class="msg">Chưa có nhãn thủ công. Chọn pivot rồi Assign label; các điểm viền vàng trên chart có thể kéo thả.</p>';
    renderManualHierarchy(entries);
  }
  function renderManualHierarchy(entries){
    const el=$('eManualHierarchy');if(!el)return;
    if(!entries.length){el.innerHTML='';return;}
    const degrees=[...new Set(entries.map(x=>x.degree))];
    el.innerHTML=`<div class="e-manual-tree"><b>Manual degree tree</b>${degrees.sort().map(d=>{const rows=entries.filter(x=>x.degree===d);return`<div class="e-manual-tree-row"><span>${esc(d.replace('degree-','Degree '))}</span><span>${rows.map(x=>`${esc(x.label)} @ ${fmt(x.p.price,5)}${x.parent!=='none'?` → child of ${esc(x.parent.replace('degree-','Degree '))}`:''}`).join(' · ')}</span></div>`}).join('')}<small>Degree labels do not map to fixed timeframes. Parent links are user annotations; engine hierarchy below is based on interval nesting.</small></div>`;
  }
  function manualAudit(){
    const out=$('eManualAuditResult');if(!out)return;
    const groups=new Map();
    Object.entries(state.manualLabels).forEach(([uid,label])=>{const p=state.manualPivots.find(x=>x.uid===uid);if(!p||p.index>((state.result?.bars?.length||0)-1))return;const degree=state.manualDegrees[uid]||'degree-2';if(!groups.has(degree))groups.set(degree,[]);groups.get(degree).push({uid,label,p});});
    if(!groups.size){out.innerHTML='<p class="msg">Chưa có sequence để audit.</p>';return;}
    const reports=[...groups.entries()].map(([degree,rows])=>{rows.sort((a,b)=>a.p.index-b.p.index);const r=E().auditManualSequence(rows.map(x=>x.p),rows.map(x=>x.label));const level=Number(String(degree).replace('degree-',''));const hierarchyIssues=rows.filter(x=>{const parent=state.manualParents[x.uid]||'none';return parent!=='none'&&Number(String(parent).replace('degree-',''))<=level;});if(hierarchyIssues.length){r.status=r.status==='FAIL'?'FAIL':'REVIEW';r.rules.push({id:'EW-MAN-PARENT',label:'Parent degree phải lớn hơn child degree',status:'unverified',detail:`${hierarchyIssues.length} nhãn có parent degree cùng cấp hoặc thấp hơn; cần chọn parent degree cao hơn.`});}return{degree,rows,report:r};});
    out.innerHTML=reports.map(({degree,rows,report})=>`<div class="e-manual-audit"><div class="e-rule-row"><span class="e-rule-status ${report.status==='PASS'?'e-pass':report.status==='FAIL'?'e-fail':'e-unverified'}">${esc(report.status)}</span><div><b>${esc(degree.replace('degree-','Degree '))} · ${esc(report.sequence)}</b><small>${esc(report.notes.join(' '))}</small></div></div>${report.rules.map(x=>`<div class="e-rule-row"><span class="e-rule-status ${x.status==='pass'?'e-pass':x.status==='fail'?'e-fail':'e-unverified'}">${esc(x.status.toUpperCase())}</span><div><b>${esc(x.label)}</b><small>${esc(x.id)} · ${esc(x.detail)}</small></div></div>`).join('')}</div>`).join('');
    const st=$('eManualStatus');if(st)st.textContent=`Auto-audit: ${reports.length} degree group(s), ${reports.reduce((n,x)=>n+x.rows.length,0)} labeled pivots. Structural PASS requires complete rules and child-degree review.`;
  }
  function addManualPivot(){
    const bars=state.result?.bars||[];const idx=Number($('eManualBarIndex')?.value),kind=$('eManualKind')?.value;
    if(!Number.isInteger(idx)||idx<0||idx>=bars.length)throw new Error('Bar index phải nằm trong vùng dữ liệu As-of hiện tại.');
    if(state.manualPivots.some(p=>p.index===idx))throw new Error('Đã có pivot tại bar này; hãy Move pivot hiện có.');
    const sorted=state.manualPivots.slice().sort((a,b)=>a.index-b.index),prev=[...sorted].reverse().find(p=>p.index<idx),next=sorted.find(p=>p.index>idx);
    if((prev&&prev.kind===kind)||(next&&next.kind===kind))throw new Error('Pivot mới phải luân phiên High/Low với pivot kế cận.');
    const b=bars[idx],uid=`manual:${idx}:${kind}:${Date.now()}`;state.manualPivots.push({uid,index:idx,time:b.time,price:kind==='high'?b.high:b.low,kind,confirmed:true,manual:true,confirmationIndex:idx,confirmationTime:b.time,confirmationDelayBars:0,scale:1,scaleSupport:1});state.manualPivots.sort((a,b)=>a.index-b.index);renderManualCount();manualAudit();drawPlot();setStatus(`Đã thêm manual ${kind.toUpperCase()} pivot tại bar ${idx}.`,false);
  }
  function moveSelectedManualPivot(){
    const uid=$('eManualPivot')?.value,idx=Number($('eManualBarIndex')?.value);if(!uid)throw new Error('Chọn pivot cần di chuyển.');
    if(!moveManualPivot(uid,idx))throw new Error('Không thể di chuyển pivot: kiểm tra lock, thứ tự và khoảng trống giữa hai pivot.');renderManualCount();manualAudit();drawPlot();
  }
  function deleteSelectedManualPivot(){
    const uid=$('eManualPivot')?.value,p=state.manualPivots.find(x=>x.uid===uid);if(!p)throw new Error('Chọn pivot cần xóa.');if(state.manualLocks[uid])throw new Error('Pivot đang bị khóa. Hãy Unlock trước.');
    state.manualPivots=state.manualPivots.filter(x=>x.uid!==uid);delete state.manualLabels[uid];delete state.manualDegrees[uid];delete state.manualParents[uid];delete state.manualLocks[uid];renderManualCount();manualAudit();drawPlot();
  }
  function renderSnapshots(){
    const el=$('eSnapshots');if(!el)return;if(!state.snapshots.length){el.innerHTML='<p class="msg">Chưa có snapshot.</p>';return;}
    el.innerHTML=`<div class="ql-table-wrap"><table class="ql-table"><thead><tr><th>As-of time</th><th>Count</th><th>Direction</th><th>Evidence</th><th>Lifecycle</th><th>Source</th></tr></thead><tbody>${state.snapshots.map(x=>`<tr><td>${esc(timeText(x.asOfTime))}</td><td>${esc(patternNames[x.pattern]||x.pattern)}</td><td>${esc(x.direction)}</td><td>${fmt(x.summary?.evidenceScore,1)}</td><td><b>${esc(x.status||'active')}</b>${x.invalidationEvent?`<small> · ${esc(timeText(x.invalidationEvent.time))} · ${esc(x.invalidationEvent.level)}</small>`:''}</td><td>${esc(x.source)}</td></tr>`).join('')}</tbody></table></div><p class="e-caveat">Snapshot stores the count as it existed at its own As-of timestamp. Later bars may mark it invalidated; the historical count is never silently rewritten.</p>`;
  }

  function exportJson(){
    if(!state.result)return;const r=state.result,c=selectedCandidate();
    const payload={product:'Gexadecimal Elliott Structure Lab',version:r.version,source:state.source,settings:r.settings,diagnostics:r.diagnostics,asOf:{index:r.dataSummary.asOfIndex,time:r.dataSummary.asOfTime,lookaheadProtected:r.dataSummary.lookaheadProtected},manualCount:{pivots:state.manualPivots,labels:state.manualLabels,degrees:state.manualDegrees,parentDegrees:state.manualParents,locks:state.manualLocks},snapshots:state.snapshots.map(x=>({...x,summary:x.summary})),preferred:E().summarizeCandidate(c),alternates:r.candidates.filter(x=>x.id!==c?.id).slice(0,10).map(E().summarizeCandidate),pivotGraph:r.pivotGraph,swingBoxes:r.swingBoxes,degreeHierarchy:r.degreeHierarchy,candidateHierarchy:(r.candidateForest||[]).map(x=>({candidateKey:x.candidateKey,pattern:x.pattern,direction:x.direction,degreeIndex:x.degreeIndex,degreeId:x.degreeId,startIndex:x.startIndex,endIndex:x.endIndex,hierarchyScore:x.hierarchyScore,hierarchyDiagnostics:x.hierarchyDiagnostics,recursiveGrammar:x.recursiveGrammar,parentCandidateKeys:x.parentCandidateKeys})),pivotScale:r.scales.map(s=>({id:s.id,factor:s.factor,thresholdMultiplier:s.thresholdMultiplier,pivots:s.pivots})),bars:r.bars};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gexadecimal-elliott-structure-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function init(){
    if(!$('eRun'))return;
    $('eRun').addEventListener('click',runAnalysis);
    $('eReplayCursor')?.addEventListener('click',analyzeReplayCursor);
    $('eUseChart').addEventListener('click',()=>{try{loadChart($('eTimeframe').value);runAnalysis()}catch(e){setStatus(e.message,true)}});
    $('eDemo')?.addEventListener('click',()=>{try{demoBars();runAnalysis()}catch(e){setStatus(e.message,true)}});
    $('eCsvBtn').addEventListener('click',()=>$('eCsv').click());
    $('eCsv').addEventListener('change',e=>importCsv(e.target.files&&e.target.files[0]));
    $('eExport').addEventListener('click',exportJson);
    const plot=$('ePlot');plot?.addEventListener('pointerdown',handlePlotPointerDown);plot?.addEventListener('pointermove',handlePlotPointerMove);plot?.addEventListener('pointerup',handlePlotPointerUp);plot?.addEventListener('pointercancel',handlePlotPointerUp);
    $('eXZoom')?.addEventListener('input',e=>{state.xZoom=Math.max(1,Math.min(10,Number(e.target.value)||1));if(state.result?.preferred&&!Number.isFinite(state.xCenterIndex))state.xCenterIndex=(state.result.preferred.startIndex+state.result.preferred.endIndex)/2;drawPlot();});
    $('eXZoomReset')?.addEventListener('click',()=>{state.xZoom=1;state.xCenterIndex=null;const slider=$('eXZoom');if(slider)slider.value='1';drawPlot();});
    $('eAsOfRange')?.addEventListener('input',e=>{state.asOfIndex=Number(e.target.value);syncAsOfControl()});
    $('eAsOfRange')?.addEventListener('change',runAnalysis);
    $('eAsOfFull')?.addEventListener('click',()=>{state.asOfIndex=state.bars.length-1;syncAsOfControl();runAnalysis()});
    $('eShowAlternates')?.addEventListener('change',e=>{state.showAlternates=!!e.target.checked;drawPlot()});
    $('eManualAssign')?.addEventListener('click',()=>{const uid=$('eManualPivot').value,label=$('eManualLabel').value,degree=$('eManualDegree').value,parent=$('eManualParentDegree').value;if(!uid||state.manualLocks[uid])return;state.manualLabels[uid]=label;state.manualDegrees[uid]=degree;state.manualParents[uid]=parent;renderManualCount();manualAudit();drawPlot();});
    $('eManualAddPivot')?.addEventListener('click',()=>{try{addManualPivot()}catch(e){setStatus(e.message,true)}});
    $('eManualMovePivot')?.addEventListener('click',()=>{try{moveSelectedManualPivot()}catch(e){setStatus(e.message,true)}});
    $('eManualDeletePivot')?.addEventListener('click',()=>{try{deleteSelectedManualPivot()}catch(e){setStatus(e.message,true)}});
    $('eManualClear')?.addEventListener('click',()=>{state.manualPivots=[];state.manualLabels={};state.manualDegrees={};state.manualParents={};state.manualLocks={};state.manualDataKey=null;initializeManualPivots(state.result);renderManualCount();manualAudit();drawPlot();});
    $('eManualAudit')?.addEventListener('click',manualAudit);
    $('eManualTable')?.addEventListener('click',e=>{const lock=e.target.closest('[data-e-manual-lock]');if(lock){const uid=lock.dataset.eManualLock;state.manualLocks[uid]=!state.manualLocks[uid];renderManualCount();manualAudit();drawPlot();return;}const b=e.target.closest('[data-e-manual-remove-label]');if(!b||b.disabled)return;const uid=b.dataset.eManualRemoveLabel;delete state.manualLabels[uid];delete state.manualDegrees[uid];delete state.manualParents[uid];renderManualCount();manualAudit();drawPlot();});
    $('eCandidates').addEventListener('click',e=>{const b=e.target.closest('[data-e-candidate]');if(!b)return;state.selectedId=b.dataset.eCandidate;state.selected=selectedCandidate();if(state.selected)state.xCenterIndex=(state.selected.startIndex+state.selected.endIndex)/2;render();});
    window.addEventListener('resize',()=>{if(state.result&&document.body.dataset.v==='elliott')drawPlot()});
    try{loadChart('current');runAnalysis()}catch(e){try{demoBars();runAnalysis()}catch(err){setStatus(err.message,true)}}
  }

  window.ElliottStructureLab={loadChart,analyze:runAnalysis,analyzeReplayCursor,getResult:()=>state.result,getBars:()=>state.bars.slice(),getSelected:()=>selectedCandidate(),getSnapshots:()=>state.snapshots.slice(),getManualCount:()=>({pivots:state.manualPivots,labels:state.manualLabels,degrees:state.manualDegrees,parents:state.manualParents})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
