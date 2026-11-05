/* Quant Lab UI · isolated from chart/indicator/replay renderers. */
(function(){
  'use strict';
  const $q=id=>document.getElementById(id);
  const QL={headers:[],rows:[],delimiter:',',source:'',numeric:[],priceIndex:-1,timeIndex:-1,timeSorted:false,invalidTimestampCount:0,timeAudit:null,loadedAt:null,lastRegression:null,lastLaggedRegression:null,lastTsModel:null,lastVolatility:null};
  const fmt=(v,d=4)=>Number.isFinite(v)?Number(v).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
  const pct=(v,d=3)=>Number.isFinite(v)?(v*100).toFixed(d)+'%':'—';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getValues=index=>QL.rows.map(r=>QuantStats.parseNumber(r[index],QL.delimiter));

  function note(s,bad=false){const e=$q('qStatus');if(e){e.textContent=s;e.classList.toggle('is-bad',bad)}}
  function setData(headers,rows,delimiter,source){
    if(!headers.length||!rows.length)throw new Error('Không tìm thấy dữ liệu có header và ít nhất một dòng.');
    const normalizedDelimiter=delimiter||',',ti=QuantStats.detectTimeColumn(headers),allNumeric=QuantStats.numericColumns(headers,rows,normalizedDelimiter),numeric=allNumeric.filter(c=>c.index!==ti);
    if(!numeric.length)throw new Error('Không tìm thấy cột số phân tích hợp lệ sau khi loại cột thời gian. Hãy kiểm tra header và định dạng số trong CSV.');
    const pi=QuantStats.detectPriceColumn(headers);
    let orderedRows=rows.slice(),timeSorted=false,invalidTimestampCount=0,timeAudit=null;
    if(ti>=0){
      const parsed=rows.map((r,i)=>({r,i,raw:r[ti],t:QuantStats.parseTimestamp(r[ti])}));
      const valid=parsed.filter(x=>Number.isFinite(x.t));invalidTimestampCount=parsed.length-valid.length;
      let sourceDuplicates=0,sourceBackwards=0;
      for(let i=1;i<parsed.length;i++)if(Number.isFinite(parsed[i-1].t)&&Number.isFinite(parsed[i].t)){if(parsed[i].t===parsed[i-1].t)sourceDuplicates++;else if(parsed[i].t<parsed[i-1].t)sourceBackwards++;}
      let reorderedRows=0;
      // Sort only when every timestamp is parseable. Keep all original rows; never drop malformed rows.
      if(valid.length===rows.length){const sorted=valid.slice().sort((a,b)=>a.t-b.t||a.i-b.i);reorderedRows=sorted.filter((x,i)=>x.i!==i).length;orderedRows=sorted.map(x=>x.r);timeSorted=true;}
      const meta=QuantStats.timestampMetadata(rows.map(r=>r[ti]));
      timeAudit={meta,sourceDuplicates,sourceBackwards,reorderedRows,invalidTimestampCount,rawFirst:rows[0]?.[ti]??'',rawLast:rows[rows.length-1]?.[ti]??''};
    }
    QL.headers=headers;QL.rows=orderedRows;QL.delimiter=normalizedDelimiter;QL.source=source;QL.loadedAt=new Date();QL.lastTsModel=null;QL.lastRegression=null;QL.lastLaggedRegression=null;QL.lastVolatility=null;
    QL.numeric=numeric;QL.timeIndex=ti;QL.timeSorted=timeSorted;QL.invalidTimestampCount=invalidTimestampCount;QL.timeAudit=timeAudit;
    QL.priceIndex=numeric.some(c=>c.index===pi)?pi:(numeric.find(c=>c.index!==ti)?.index??numeric[0].index);
    populateControls();render();note(`${fmt(QL.rows.length,0)} dòng · ${QL.numeric.length} cột số · ${source}`);
    if($q('qTsUnitRoot'))$q('qTsUnitRoot').innerHTML='<p class="msg">Dữ liệu đã đổi. Chạy lại ADF + PP.</p>';
    if($q('qTsModelOutput'))$q('qTsModelOutput').hidden=true;
    if($q('qLaggedRegOutput'))$q('qLaggedRegOutput').hidden=true;
    if($q('qTsWalkForwardOutput'))$q('qTsWalkForwardOutput').innerHTML='<p class="msg">Dataset đã đổi. Chạy lại Walk-forward.</p>';
    if($q('qTsModelStatus')){$q('qTsModelStatus').textContent='Dữ liệu đã đổi. Hãy ước lượng lại mô hình.';$q('qTsModelStatus').classList.remove('is-good','is-bad')}
    if($q('qTsColumn'))renderCorrelogram();
    if($q('qVolOutput')){$q('qVolOutput').hidden=true;$q('qVolStatus').textContent='Dataset đã thay đổi. Hãy ước lượng lại Phase 4.';$q('qVolStatus').classList.remove('is-good','is-bad')}
  }
  function populateControls(){
    const p=$q('qPriceColumn'),c=$q('qCorrColumns');
    p.innerHTML=QL.numeric.map(x=>`<option value="${x.index}" ${x.index===QL.priceIndex?'selected':''}>${esc(x.name)}</option>`).join('');
    const limited=QL.numeric.slice(0,8);c.innerHTML=limited.map(x=>`<label class="ql-check"><input type="checkbox" value="${x.index}" checked><span>${esc(x.name)}</span></label>`).join('');
    populateRegressionControls(undefined,true);
    populateTimeSeriesControls();
    populateVolatilityControls();
  }
  function populateRegressionControls(preferred,resetY=false){
    const y=$q('qRegY'),x=$q('qRegX');if(!y||!x)return;
    const current=resetY?[]:(preferred??[...x.querySelectorAll('input:checked')].map(e=>+e.value));
    const candidates=QL.numeric.filter(c=>c.index!==QL.timeIndex);
    const available=candidates.length?candidates:QL.numeric;
    const currentY=Number(y.value),desiredY=!resetY&&available.some(c=>c.index===currentY)?currentY:QL.priceIndex;
    y.innerHTML=available.map(c=>`<option value="${c.index}" ${c.index===desiredY?'selected':''}>${esc(c.name)}</option>`).join('');
    const yi=Number(y.value),predictors=available.filter(c=>c.index!==yi);
    const retained=current.filter(i=>predictors.some(c=>c.index===i));
    const selected=new Set(retained.length?retained:predictors.slice(0,2).map(c=>c.index));
    x.innerHTML=predictors.map(c=>`<label class="ql-check"><input type="checkbox" value="${c.index}" ${selected.has(c.index)?'checked':''}><span>${esc(c.name)}</span></label>`).join('');
    invalidateOLS();
  }
  function invalidateOLS(){
    if(QL.lastRegression||!$q('qRegOutput').hidden){
      QL.lastRegression=null;$q('qRegOutput').hidden=true;$q('qExportOLS').disabled=true;if($q('qLaggedRegOutput'))$q('qLaggedRegOutput').hidden=true;QL.lastLaggedRegression=null;
      const st=$q('qRegStatus');st.textContent='Thiết lập mô hình đã thay đổi. Hãy nhấn Estimate OLS để tính lại.';st.classList.remove('is-bad','is-good');
    }
  }
  function populateTimeSeriesControls(){
    const el=$q('qTsColumn');if(!el)return;
    const preferred=QL.priceIndex;
    el.innerHTML=QL.numeric.map(c=>`<option value="${c.index}" ${c.index===preferred?'selected':''}>${esc(c.name)}</option>`).join('');
  }
  function timeSeriesValues(){const i=Number($q('qTsColumn').value);return{index:i,name:QL.headers[i],values:getValues(i)}}
  function populateVolatilityControls(){
    const el=$q('qVolColumn');if(!el)return;const preferred=QL.priceIndex;
    el.innerHTML=QL.numeric.map(c=>`<option value="${c.index}" ${c.index===preferred?'selected':''}>${esc(c.name)}</option>`).join('');
  }
  function selectedVolatilityValues(){const i=Number($q('qVolColumn').value);return{index:i,name:QL.headers[i],values:getValues(i)}}
  function drawVolatilityPlot(inSample,forecast){
    const cv=$q('qVolPlot');if(!cv)return;const dpr=window.devicePixelRatio||1,w=cv.clientWidth||600,h=230;cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);
    const all=inSample.filter(Number.isFinite).concat(forecast.map(x=>x.conditionalVolatilityPct));if(!all.length)return;
    const min=Math.min(...all),max=Math.max(...all),range=max-min||Math.max(1e-6,max*.1),pad={l:42,r:12,t:16,b:25},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
    const styles=getComputedStyle(document.documentElement),acc=styles.getPropertyValue('--acc').trim()||'#d6a84b',green=styles.getPropertyValue('--win').trim()||'#38b98a',mut=styles.getPropertyValue('--mut').trim()||'#89909a',line=styles.getPropertyValue('--line').trim()||'#343943';
    c.strokeStyle=line;c.beginPath();c.moveTo(pad.l,pad.t);c.lineTo(pad.l,h-pad.b);c.lineTo(w-pad.r,h-pad.b);c.stroke();
    const total=inSample.length+forecast.length-1,x=i=>pad.l+i/Math.max(1,total)*pw,y=v=>pad.t+(max-v)/range*ph;
    const step=Math.max(1,Math.ceil(inSample.length/1800));c.strokeStyle=acc;c.lineWidth=1.5;c.beginPath();let started=false;
    for(let i=0;i<inSample.length;i+=step){const xx=x(i),yy=y(inSample[i]);if(!started){c.moveTo(xx,yy);started=true}else c.lineTo(xx,yy)}c.stroke();
    c.setLineDash([5,4]);c.strokeStyle=mut;c.beginPath();c.moveTo(x(inSample.length-1),pad.t);c.lineTo(x(inSample.length-1),h-pad.b);c.stroke();c.setLineDash([]);
    c.strokeStyle=green;c.lineWidth=2;c.beginPath();forecast.forEach((v,i)=>{const xx=x(inSample.length-1+i),yy=y(v.conditionalVolatilityPct);if(i===0)c.moveTo(xx,yy);else c.lineTo(xx,yy)});c.stroke();
    c.fillStyle=mut;c.font='10px sans-serif';c.fillText(`${fmt(max,4)}%`,4,pad.t+4);c.fillText(`${fmt(min,4)}%`,4,h-pad.b);c.fillText('In-sample',pad.l+5,h-7);c.fillText('Forecast',Math.min(w-70,x(inSample.length)),h-7);
  }
  function renderVolatility(result,seriesName){
    const metric=(name,value,sub='')=>`<div class="ql-metric"><span>${name}</span><b>${value}</b><small>${sub}</small></div>`;
    const modelLabel=result.model==='ARCH'?`ARCH(${result.order.q})`:result.model==='GARCH'?'GARCH(1,1)':result.model==='EGARCH'?'EGARCH(1,1)':result.model==='TARCH'?'TARCH(1,1) · Zakoian':'GJR-GARCH(1,1)';
    $q('qVolMetrics').innerHTML=[metric('MODEL',modelLabel,seriesName+' · Log return'),metric('LAST CONDITIONAL VOL.',pct(result.lastConditionalVolatilityPct/100,4),'% per bar'),metric('ANNUALIZED VOL.',pct(result.annualizedLastVolPct/100,2),'theo annualization factor'),metric('PERSISTENCE',fmt(result.persistence,4),'ARCH/GARCH persistence proxy'),metric('HALF-LIFE',Number.isFinite(result.halfLife)?fmt(result.halfLife,1)+' bars':'—','thời gian giảm một nửa')].join('');
    $q('qVolParameters').innerHTML=`<table class="ql-table"><thead><tr><th>Parameter</th><th>Estimate</th><th>Unit</th></tr></thead><tbody>${result.parameters.map(p=>`<tr><th>${esc(p.name)}</th><td>${fmt(p.value,7)}</td><td>${esc(p.unit)}</td></tr>`).join('')}</tbody></table>`;
    const lb=result.diagnostics.standardizedResidualLjungBox,arch=result.diagnostics.archLm;
    const diag=[['Log likelihood',fmt(result.logLikelihood,4)],['AIC',fmt(result.aic,4)],['BIC',fmt(result.bic,4)],['Optimizer',result.optimizer.converged?`Hội tụ · ${result.optimizer.iterations} iterations`:`Chưa xác nhận hội tụ · ${result.optimizer.iterations} iterations`],['Std. residual mean',fmt(result.residualSummary.mean,5)],['Std. residual SD',fmt(result.residualSummary.std,5)],['Std. residual skewness',fmt(result.residualSummary.skewness,4)],['Std. residual excess kurtosis',fmt(result.residualSummary.excessKurtosis,4)],['Ljung–Box standardized residual',`Q=${fmt(lb.statistic,4)} · p=${pval(lb.pValue)} · lag=${lb.lags}`],['ARCH LM on standardized residual²',`LM=${fmt(arch.statistic,4)} · p=${pval(arch.pValue)} · lag=${arch.lags}`],['Long-run volatility / proxy',Number.isFinite(result.longRunVolatilityPct)?pct(result.longRunVolatilityPct/100,4):(result.model==='EGARCH'?'Median proxy không xác định':'Không hữu hạn / không xác định')]];
    $q('qVolDiagnostics').innerHTML=`<table class="ql-table"><thead><tr><th>Diagnostic</th><th>Value</th></tr></thead><tbody>${diag.map(([a,b])=>`<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</tbody></table>`;
    $q('qVolForecast').innerHTML=`<table class="ql-table"><thead><tr><th>Step</th><th>Mean return (%)</th><th>Conditional variance (%²)</th><th>Volatility (%/bar)</th><th>Annualized volatility (%)</th></tr></thead><tbody>${result.forecast.map(f=>`<tr><th>${f.step}</th><td>${fmt(f.meanReturnPct,6)}</td><td>${fmt(f.conditionalVariancePct2,7)}</td><td>${fmt(f.conditionalVolatilityPct,6)}</td><td>${fmt(f.annualizedVolatilityPct,4)}</td></tr>`).join('')}</tbody></table>`;
    drawVolatilityPlot(result.conditionalVolatilityPct,result.forecast);
    const p=result.persistence,notes=[];
    if(!result.optimizer.converged)notes.push('Optimizer chưa đạt tiêu chí hội tụ; không nên diễn giải ước lượng như nghiệm tối ưu đã xác nhận.');
    if(result.model!=='EGARCH'&&p>.9)notes.push('Persistence lớn hơn 0.90: cú sốc biến động có xu hướng kéo dài trong mô hình.');
    if(result.model==='EGARCH'&&Math.abs(p)>.9)notes.push('|β| lớn hơn 0.90: log variance có độ dai dẳng cao.');
    if(arch.pValue<.05)notes.push('ARCH LM p < 0.05: standardized residual² còn phụ thuộc; mô hình có thể chưa hấp thụ hết volatility clustering.');else notes.push('Chưa bác bỏ giả thuyết không còn ARCH effect trong standardized residual² ở mức 5%; không đồng nghĩa mô hình hoàn hảo.');
    if(lb.pValue<.05)notes.push('Ljung–Box p < 0.05: standardized residual còn tự tương quan; phương trình mean/độ trễ có thể cần xem lại.');
    if(result.distribution==='student-t'&&result.rawParameters.nu<8)notes.push('ν dưới 8: fitted Student-t có đuôi dày; nên kiểm tra độ ổn định ở nhiều mẫu.');
    if(result.model==='GJR-GARCH'&&result.rawParameters.gamma>0)notes.push('γ > 0: mô hình gán thêm tác động phương sai cho cú sốc âm, thường gọi là leverage/asymmetry effect.');
    if(result.model==='EGARCH'&&result.rawParameters.gamma<0)notes.push('γ < 0 trong đặc tả EGARCH đang dùng: cú sốc âm làm log variance tăng mạnh hơn cú sốc dương cùng độ lớn.');
    if(result.model==='TARCH'&&result.rawParameters.gamma>0)notes.push('γ > 0 trong TARCH-Zakoian: shock âm làm conditional standard deviation tăng thêm so với shock dương cùng độ lớn.');
    if(result.model==='EGARCH')notes.push('Long-run volatility chỉ hiển thị median/plug-in proxy exp(E[log h]/2), không phải unconditional standard deviation chính xác.');
    $q('qVolInterpretation').innerHTML=`<b>Research interpretation · ${modelLabel}</b><ul>${notes.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><p>Đọc cùng ACF/PACF và ADF/PP của returns. GARCH mô hình hóa độ lớn biến động có điều kiện, không cho biết hướng giá sẽ tăng hay giảm.</p>`;
    $q('qVolNotes').textContent=result.notes.join(' ')+` Annualization factor đang dùng: ${fmt(result.annualFactor,0)} bars/year. Forecast variance/volatility là dự báo có điều kiện theo mô hình, không phải dải xác suất 95%.`;
    $q('qVolOutput').hidden=false;
  }
  function runVolatilityModel(){
    const status=$q('qVolStatus');try{
      const {name,values}=selectedVolatilityValues(),h=Number($q('qVolHorizon').value),annual=Number($q('qVolAnnualFactor').value);
      if(!Number.isInteger(h)||h<1||h>100)throw new Error('Forecast steps phải từ 1 đến 100.');
      if(!Number.isInteger(annual)||annual<1||annual>1000000)throw new Error('Annualization factor phải từ 1 đến 1.000.000 bars/year.');
      const data=QuantVolatility.logReturnsFromPrices(values),model=$q('qVolModel').value,distribution=$q('qVolDistribution').value,q=Number($q('qVolArchOrder').value);
      const result=QuantVolatility.fit(model,data.returnsPct,{distribution,q,horizon:h,annualFactor:annual});QL.lastVolatility={...result,seriesName:name,returnSeries:data.returnsPct};renderVolatility(QL.lastVolatility,name);
      const tm=timeSeriesTimeInfo();status.textContent=`Ước lượng ${model} hoàn tất · ${data.returnObservations.toLocaleString('en-US')} log returns (%) · ${distribution} · ${result.optimizer.converged?'optimizer hội tụ':'cảnh báo optimizer chưa hội tụ'}${tm.warning?' · Kiểm tra timestamp/session gaps':''}`;status.classList.toggle('is-good',result.optimizer.converged);status.classList.toggle('is-bad',!result.optimizer.converged);
    }catch(e){status.textContent=e.message||String(e);status.classList.add('is-bad');status.classList.remove('is-good');$q('qVolOutput').hidden=true;QL.lastVolatility=null;}
  }
  function exportVolatility(){
    const r=QL.lastVolatility;if(!r)return;const rows=[['Section','Metric','Value'],['Model','Name',r.model],['Model','Distribution',r.distribution],['Model','Observations',r.n],['Model','Log likelihood',r.logLikelihood],['Model','AIC',r.aic],['Model','BIC',r.bic],['Model','Persistence',r.persistence],['Model','Half life bars',r.halfLife],['Model','Annual factor',r.annualFactor]];
    r.parameters.forEach(p=>rows.push(['Parameter',p.name,p.value]));r.forecast.forEach(f=>{rows.push(['Forecast',`Step ${f.step} volatility %/bar`,f.conditionalVolatilityPct]);rows.push(['Forecast',`Step ${f.step} annualized volatility %`,f.annualizedVolatilityPct]);});
    const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n'),blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='gexadecimal-phase4-volatility.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  function timeSeriesTimeInfo(){
    if(QL.timeIndex<0)return{label:'Không có cột thời gian được nhận diện; các lag chỉ là thứ tự dòng',warning:true,warnings:['Không có timestamp để xác minh thứ tự thời gian hoặc khoảng cách quan sát.']};
    const raw=QL.rows.map(r=>r[QL.timeIndex]),parsed=raw.map(v=>QuantStats.parseTimestamp(v)),meta=QuantStats.timestampMetadata(raw),invalid=parsed.filter(v=>!Number.isFinite(v)).length,warnings=[];
    if(invalid)warnings.push(`${invalid} timestamp thiếu/không hợp lệ`);
    if(meta.ambiguous)warnings.push(`${meta.ambiguous} timestamp không xác định rõ timezone hoặc chỉ có ngày`);
    if(parsed.length<3)return{label:'Không đủ timestamp hợp lệ',warning:true,warnings};
    if(invalid)return{label:`${invalid} timestamp thiếu/không hợp lệ; không tự loại dòng`,warning:true,warnings};
    const diffs=[];for(let i=1;i<parsed.length;i++)diffs.push(parsed[i]-parsed[i-1]);
    const positive=diffs.filter(v=>v>0).slice().sort((a,b)=>a-b);if(!positive.length){warnings.push('Không có bước thời gian tăng');return{label:'Timestamp không tăng hoặc bị trùng',warning:true,warnings};}
    const median=positive[Math.floor(positive.length/2)],duplicates=diffs.filter(v=>v===0).length,nonIncreasing=diffs.filter(v=>v<0).length,gaps=diffs.filter(v=>v>median*1.5).length;
    if(duplicates)warnings.push(`${duplicates} timestamp trùng`);
    if(nonIncreasing)warnings.push(`${nonIncreasing} bước thời gian không tăng`);
    if(gaps)warnings.push(`${gaps} khoảng trống lớn hơn 1.5× median; có thể là session gap hoặc bar bị thiếu, không tự động resample`);
    if(QL.timeAudit?.sourceBackwards)warnings.push(`${QL.timeAudit.sourceBackwards} bước đảo thứ tự trong file gốc; hệ thống đã sắp xếp timestamp hợp lệ tăng dần`);
    if(!meta.allExplicit)warnings.push('Timezone chưa được xác định rõ: nên dùng ISO 8601 có Z/UTC offset hoặc Unix timestamp');
    const last=parsed[parsed.length-1],futureMs=last-Date.now();if(meta.allExplicit&&futureMs>5*60*1000)warnings.push(`Timestamp cuối đang ở tương lai khoảng ${fmt(futureMs/60000,1)} phút so với đồng hồ trình duyệt; hãy kiểm tra timezone/đồng hồ broker`);
    const mins=median/60000;let freq=mins<1?`${fmt(mins*60,0)} giây`:mins<60?`${fmt(mins,1)} phút`:mins<1440?`${fmt(mins/60,1)} giờ`:`${fmt(mins/1440,1)} ngày`;
    const label=`Khoảng cách dương trung vị ≈ ${freq} · ${duplicates} duplicate · ${nonIncreasing} bước không tăng · ${gaps} khoảng trống lớn`;
    return{label,warning:warnings.length>0,warnings,medianMs:median,duplicates,nonIncreasing,gaps,latestTimestamp:parsed[parsed.length-1],firstTimestamp:parsed[0],meta};
  }
  function renderDataAudit(){
    const box=$q('qDataAudit');if(!box)return;
    if(QL.timeIndex<0){box.innerHTML='<p class="ql-analysis-note">Không có cột thời gian được nhận diện. Phân tích lag/walk-forward sẽ xem mỗi dòng là một bước; cần bổ sung timestamp để xác minh tính thời gian.</p>';return;}
    const info=timeSeriesTimeInfo(),loaded=QL.loadedAt?QL.loadedAt.toISOString():'—',first=info.firstTimestamp?new Date(info.firstTimestamp).toISOString():'—',last=info.latestTimestamp?new Date(info.latestTimestamp).toISOString():'—',a=QL.timeAudit||{},m=a.meta||{};
    const rows=[['Nguồn dữ liệu',QL.source],['Số dòng / cột số',`${QL.rows.length.toLocaleString('en-US')} / ${QL.numeric.length}`],['Dải thời gian (UTC rendering)',`${first} → ${last}`],['Thời điểm nạp ở trình duyệt',loaded],['Timezone',m.allExplicit?'Tất cả timestamp có offset/UTC hoặc Unix time':`${m.explicit||0}/${m.total||0} có offset/UTC hoặc Unix; phần còn lại cần xác minh`],['Timestamp không hợp lệ',a.invalidTimestampCount||0],['Duplicate trong thứ tự file gốc',a.sourceDuplicates||0],['Bước đảo ngược trong file gốc',a.sourceBackwards||0],['Số dòng đổi vị trí sau sort',a.reorderedRows||0],['Chẩn đoán hiện tại',info.warnings.length?info.warnings.join(' · '):'Không phát hiện cảnh báo timestamp cơ bản']];
    box.innerHTML=`<table class="ql-table"><thead><tr><th>Data quality check</th><th>Result</th></tr></thead><tbody>${rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table><p class="ql-analysis-note">${info.warning?'Cần xử lý/ghi nhận các cảnh báo trước khi diễn giải lag như phút/giờ thực.':'Timestamp có vẻ nhất quán theo các kiểm tra cơ bản, nhưng vẫn cần đối chiếu với timezone/source broker.'} Hệ thống không tự resample hoặc tự tạo nến còn thiếu.</p>`;
  }
  function tsCanvas(id){const c=$q(id);if(!c)return null;const r=c.getBoundingClientRect(),w=Math.max(260,r.width||520),h=Math.max(160,r.height||220),dpr=window.devicePixelRatio||1;c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h}}
  function drawCorrelogram(id,values,title){
    const c=tsCanvas(id);if(!c)return;const{ctx,w,h}=c,acc=getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'#d6a84b',mut=getComputedStyle(document.documentElement).getPropertyValue('--mut').trim()||'#89909a',line=getComputedStyle(document.documentElement).getPropertyValue('--line').trim()||'#343943';
    ctx.clearRect(0,0,w,h);const pad={l:34,r:10,t:16,b:28},mid=pad.t+(h-pad.t-pad.b)/2,scale=(h-pad.t-pad.b)*.43,bound=1.96/Math.sqrt(Math.max(1,values.n||1));
    ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,mid);ctx.lineTo(w-pad.r,mid);ctx.stroke();
    ctx.setLineDash([4,4]);ctx.strokeStyle=mut;for(const v of [-bound,bound]){const y=mid-v*scale;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}ctx.setLineDash([]);
    const plotW=w-pad.l-pad.r,step=plotW/Math.max(1,values.length),bw=Math.max(2,Math.min(14,step*.52));
    values.forEach((v,i)=>{const x=pad.l+(i+.5)*step,y=mid-v*scale;ctx.fillStyle=i===0?mut:acc;ctx.fillRect(x-bw/2,Math.min(mid,y),bw,Math.max(1,Math.abs(mid-y)));if(i===0||i%Math.max(1,Math.ceil(values.length/12))===0||i===values.length-1){ctx.fillStyle=mut;ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(String(i),x,h-9)}});
    ctx.fillStyle=mut;ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText(title,pad.l,11);ctx.textAlign='right';ctx.fillText(`±${fmt(bound,3)}`,w-pad.r,11);
  }
  function renderReturnDependence(values,name){
    const box=$q('qTsDependenceOutput');if(!box)return;
    try{
      const positive=values.every(v=>Number.isFinite(v)&&v>0),series=positive?QuantStats.returns(values).map(r=>r.log):QuantTimeSeries.difference(values,1),dep=QuantTimeSeries.dependenceDiagnostics(series,20),rows=[['Returns / Δ',dep.returns],['Absolute returns / |Δ|',dep.absoluteReturns],['Squared returns / Δ²',dep.squaredReturns]];
      const body=rows.map(([label,r])=>`<tr><th>${label}</th><td>${r.error?'—':r.acf.map(v=>`L${v.lag}: ${fmt(v.acf,4)}`).join(' · ')}</td><td>${r.ljungBox?fmt(r.ljungBox.statistic,4):'—'}</td><td>${r.ljungBox?pval(r.ljungBox.pValue):'—'}</td><td>${r.ljungBox?(r.ljungBox.pValue<.05?`Có bằng chứng tự tương quan tới lag ${r.lags}`:`Chưa bác bỏ không tự tương quan tới lag ${r.lags}`):esc(r.error||'Không đủ dữ liệu')}</td></tr>`).join('');
      box.innerHTML=`<table class="ql-table"><thead><tr><th>Chuỗi</th><th>ACF</th><th>Ljung–Box Q</th><th>p-value</th><th>Diễn giải sơ bộ</th></tr></thead><tbody>${body}</tbody></table><p class="ql-analysis-note">Biến: ${esc(name)} · ${positive?'Log returns (Δln price)':'First difference (Δ level)'} · N=${series.length}. Nếu ACF của returns yếu nhưng ACF của |returns| hoặc returns² còn mạnh, đó là dấu hiệu volatility clustering; chưa đủ để kết luận GARCH là mô hình đúng. Nếu chuỗi có missing/duplicate/gaps, kết quả lag phải đọc cùng bảng Data Center.</p>`;
    }catch(e){box.innerHTML=`<p class="ql-analysis-note">Không thể tính dependence diagnostics: ${esc(e.message||String(e))}</p>`;}
  }
  function renderCorrelogram(){
    try{const{values,name}=timeSeriesValues(),order=Number($q('qTsCorrDiff').value)||0,maxLag=Math.max(1,Math.min(120,Number($q('qTsMaxLag').value)||24)),series=QuantTimeSeries.difference(values,order),a=QuantTimeSeries.acf(series,maxLag),p=QuantTimeSeries.pacf(series,maxLag);a.n=series.length;p.n=series.length;drawCorrelogram('qTsAcfPlot',a,`ACF · ${name} · d=${order}`);drawCorrelogram('qTsPacfPlot',p,`PACF · ${name} · d=${order}`);renderReturnDependence(values,name);const ti=timeSeriesTimeInfo(),st=$q('qTsStatus');st.textContent=`${name}: ${series.length} quan sát · ${a.length-1} lags · ${ti.label}${ti.warning?' · Hãy kiểm tra timestamp/timezone/session gaps.':''}`;st.classList.toggle('is-bad',ti.warning);st.classList.toggle('is-good',!ti.warning)}catch(e){['qTsAcfPlot','qTsPacfPlot'].forEach(id=>{const c=$q(id);if(c){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height)}});$q('qTsStatus').textContent=e.message||String(e);$q('qTsStatus').classList.add('is-bad');$q('qTsStatus').classList.remove('is-good')}}
  const critDecision=(stat,critical)=>stat<critical?'Bác bỏ H₀':'Chưa bác bỏ H₀';
  function renderUnitRootRow(label,r,lagLabel){const c=r.critical;return`<tr><th>${label}</th><td>${fmt(r.statistic,4)}</td><td>${lagLabel}</td><td>${fmt(c['1%'],3)}</td><td>${fmt(c['5%'],3)}</td><td>${fmt(c['10%'],3)}</td><td class="${r.statistic<c['5%']?'sig':'warn'}">${critDecision(r.statistic,c['5%'])} @ 5%</td></tr>`}
  function runUnitRootTests(){
    const box=$q('qTsUnitRoot');try{const{values,name}=timeSeriesValues(),timeInfo=timeSeriesTimeInfo(),det=$q('qTsDeterministic').value,lag=Math.max(0,Math.min(20,Number($q('qTsAdfLag').value)||0)),bwRaw=String($q('qTsPpBandwidth').value).trim(),opts={deterministic:det,maxLag:lag},a=QuantTimeSeries.adf(values,opts),p=QuantTimeSeries.pp(values,{deterministic:det,bandwidth:bwRaw?Number(bwRaw):undefined});
      box.innerHTML=`<table class="ql-table"><thead><tr><th>Test</th><th>Statistic</th><th>Lag / BW</th><th>1%</th><th>5%</th><th>10%</th><th>Decision</th></tr></thead><tbody>${renderUnitRootRow('ADF · '+a.criterion.toUpperCase(),a,`${a.lag} lags`)}${renderUnitRootRow('Phillips–Perron Zτ',p,`${p.bandwidth} NW lags`)}</tbody></table><div class="ql-analysis-note">Biến: ${esc(name)} · N: ${fmt(a.n,0)} · Deterministic: ${esc(det)} · ADF max lag sử dụng ${a.maxLagUsed}; lag được chọn bằng ${a.criterion.toUpperCase()}. PP Zρ bổ sung = ${fmt(p.zRho,4)}. ${esc(timeInfo.label)}. ${timeInfo.warning?'CẢNH BÁO: ADF/PP giả định quan sát cách đều; kết quả trên chuỗi có khoảng trống/duplicate timestamp cần diễn giải thận trọng.':''} H₀ là có unit root; thống kê càng âm sâu so với critical value thì càng có bằng chứng bác bỏ H₀. Critical values đang dùng là mốc tiệm cận xấp xỉ, chưa phải MacKinnon finite-sample p-value. PP trong engine dùng Newey–West Bartlett; bản hiện tại chưa được cross-check độc lập với thư viện PP chuyên biệt. ${timeInfo.warning?'Không nên coi bước lag là đúng phút/giờ cho tới khi xử lý timezone, duplicate và session gaps.':''}</div>`;
    }catch(e){box.innerHTML=`<p class="ql-reg-note">${esc(e.message||String(e))}</p>`}}
  function drawForecast(history,forecastRows){
    const c=tsCanvas('qTsForecastPlot');if(!c)return;const{ctx,w,h}=c,acc=getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'#d6a84b',mut=getComputedStyle(document.documentElement).getPropertyValue('--mut').trim()||'#89909a',line=getComputedStyle(document.documentElement).getPropertyValue('--line').trim()||'#343943';
    ctx.clearRect(0,0,w,h);const shown=history.slice(-160),all=shown.concat(forecastRows.map(x=>x.value)),lo=Math.min(...all,...forecastRows.map(x=>x.lower)),hi=Math.max(...all,...forecastRows.map(x=>x.upper)),range=hi-lo||1,pad={l:42,r:12,t:18,b:25},xAt=i=>pad.l+i/(all.length-1||1)*(w-pad.l-pad.r),yAt=v=>pad.t+(hi-v)/range*(h-pad.t-pad.b);
    ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
    if(forecastRows.length){ctx.beginPath();forecastRows.forEach((r,i)=>{const x=xAt(shown.length+i),y=yAt(r.upper);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});for(let i=forecastRows.length-1;i>=0;i--){const r=forecastRows[i];ctx.lineTo(xAt(shown.length+i),yAt(r.lower))}ctx.closePath();ctx.fillStyle='rgba(214,168,75,.14)';ctx.fill();}
    ctx.strokeStyle=acc;ctx.lineWidth=1.7;ctx.beginPath();shown.forEach((v,i)=>{const x=xAt(i),y=yAt(v);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();ctx.setLineDash([5,4]);ctx.strokeStyle=mut;ctx.beginPath();forecastRows.forEach((r,i)=>{const x=xAt(shown.length+i),y=yAt(r.value);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=mut;ctx.font='10px sans-serif';ctx.fillText('Lịch sử',pad.l,11);ctx.textAlign='right';ctx.fillText('Dự báo · dải 95%',w-pad.r,11);ctx.textAlign='left';
  }
  function runTsModel(){
    const status=$q('qTsModelStatus'),out=$q('qTsModelOutput');try{const{values,name}=timeSeriesValues(),m=QuantTimeSeries.fitModel(values,{type:$q('qTsModelType').value,p:$q('qTsP').value,d:$q('qTsD').value,q:$q('qTsQ').value,horizon:$q('qTsHorizon').value});
      $q('qTsModelMetrics').innerHTML=[['OBSERVATIONS',fmt(m.n,0),'Residual observations after burn-in'],['RMSE',fmt(m.rmse,6),'sqrt(SSE / N residual)'],['RESIDUAL S.E.',fmt(m.residualStdError,6),'sqrt(SSE / residual df)'],['AIC',fmt(m.aic,3),'Lower is better · same sample'],['BIC',fmt(m.bic,3),'Penalizes model complexity']].map(x=>`<div class="ql-metric"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
      $q('qTsParameters').innerHTML=`<table class="ql-table"><thead><tr><th>Parameter</th><th>Estimate</th></tr></thead><tbody>${m.parameters.map(x=>`<tr><th>${esc(x.name)}</th><td>${fmt(x.value,7)}</td></tr>`).join('')}</tbody></table>`;
      const d=m.diagnostics,fmtRoots=a=>a.length?a.map(v=>fmt(v,5)).join(', '):'Không áp dụng';
      const diagnosticRows=[['AR roots (modulus)',fmtRoots(d.arRootModuli),d.arRootsConverged?'Nghiệm số đã hội tụ':'Thuật toán tìm nghiệm chưa hội tụ'],['Stationarity',d.stationary?'Đạt điều kiện nghiệm AR > 1':'Không đạt / chưa xác minh','Mọi nghiệm của đa thức AR phải nằm ngoài vòng tròn đơn vị'],['MA roots (modulus)',fmtRoots(d.maRootModuli),d.maRootsConverged?'Nghiệm số đã hội tụ':'Thuật toán tìm nghiệm chưa hội tụ'],['Invertibility',d.invertible?'Đạt điều kiện nghiệm MA > 1':'Không đạt / chưa xác minh','Mọi nghiệm của đa thức MA phải nằm ngoài vòng tròn đơn vị'],['Residual mean',fmt(d.residualMean,8),'Trung bình phần dư sau burn-in'],['Residual ACF(1)',fmt(d.acf1,5),'Kiểm tra sơ bộ; nên xem correlogram phần dư độc lập'],['Ljung–Box Q',d.ljungBox?fmt(d.ljungBox.statistic,5):'—',d.ljungBox?`lag=${d.ljungBox.lags}; df=${d.ljungBox.df}; p-value=${pval(d.ljungBox.pValue)}`:'Không đủ bậc tự do để kiểm định']];
      $q('qTsModelDiagnostics').innerHTML=`<table class="ql-table"><thead><tr><th>Chẩn đoán</th><th>Kết quả</th><th>Diễn giải</th></tr></thead><tbody>${diagnosticRows.map(r=>`<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>`;
      $q('qTsForecastTable').innerHTML=`<table class="ql-table"><thead><tr><th>Horizon</th><th>Forecast</th><th>Forecast S.E.</th><th>Approx. lower 95%</th><th>Approx. upper 95%</th></tr></thead><tbody>${m.forecastRows.map(r=>`<tr><th>t+${r.step}</th><td>${fmt(r.value,7)}</td><td>${fmt(r.forecastStdError,7)}</td><td>${fmt(r.lower,7)}</td><td>${fmt(r.upper,7)}</td></tr>`).join('')}</tbody></table>`;
      drawForecast(values,m.forecastRows);QL.lastTsModel={values:values.slice(),model:m};const timeInfo=timeSeriesTimeInfo();$q('qTsModelNote').textContent=`${name} · ${m.type}(${m.order.p},${m.order.d},${m.order.q}) · ${m.converged?'optimizer hội tụ':'CẢNH BÁO: optimizer đạt giới hạn iteration'}. ${m.diagnostics.ljungBox?(m.diagnostics.ljungBox.pValue<.05?'Ljung–Box p < 0.05: còn bằng chứng tự tương quan trong residual tới lag '+m.diagnostics.ljungBox.lags+'.':'Ljung–Box p ≥ 0.05: chưa bác bỏ giả thuyết không có tự tương quan tới lag '+m.diagnostics.ljungBox.lags+'; không đồng nghĩa chứng minh residual hoàn toàn white noise.'):'Không đủ bậc tự do cho Ljung–Box.'} ${timeInfo.warning?'CẢNH BÁO timestamp: '+timeInfo.warnings.join(' · ')+'. Mô hình vẫn xem mỗi dòng là một bước quan sát, không phải nhất thiết một phút đồng hồ. ':''}${m.notes.join(' ')}`;
      const warning=!m.converged||!d.stationary||!d.invertible||timeInfo.warning;out.hidden=false;status.textContent=`Ước lượng ${warning?'có cảnh báo':'hoàn tất'} · ${m.type}(${m.order.p},${m.order.d},${m.order.q}) · ${m.n} residual observations.`;status.classList.toggle('is-bad',warning);status.classList.toggle('is-good',!warning);
    }catch(e){out.hidden=true;status.textContent=e.message||String(e);status.classList.add('is-bad');status.classList.remove('is-good')}}
  function timeSeriesDemo(){
    let seed=73021;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296},normal=()=>{const u=Math.max(1e-9,rand()),v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
    const rows=[];let stationary=0,walk=100,price=2050;for(let i=0;i<900;i++){const eps=normal();stationary=.72*stationary+eps;walk+=normal()*.8;price*=Math.exp(.00015+normal()*.0028);const t=new Date(Date.UTC(2024,0,1)+i*86400000).toISOString();rows.push([t,price.toFixed(5),stationary.toFixed(6),walk.toFixed(6)]);}
    setData(['Time','XAU_Close_SIM','Stationary_AR1','RandomWalk'],rows,',','TIME SERIES DEMO tổng hợp · 900 quan sát daily · không phải dữ liệu thị trường');
  }
  function renderRolling(){
    const box=$q('qRollingTable');if(!box||!QL.rows.length)return;
    const raw=String($q('qRollingWindow')?.value??'20,50,100'),tokens=raw.split(/[;,\s]+/).map(v=>v.trim()),windows=[...new Set(tokens.map(Number))].sort((a,b)=>a-b);
    if(!tokens.length||tokens.some(v=>!v)||!windows.length||windows.length>4||windows.some(w=>!Number.isInteger(w)||w<2||w>1000)){box.innerHTML='<p class="msg">Nhập 1–4 cửa sổ, mỗi cửa sổ là số nguyên từ 2 đến 1.000; ví dụ: 20,50,100.</p>';return;}
    const values=getValues(QL.priceIndex),logReturns=QuantStats.returns(values).map(r=>r.log),byWindow={};
    for(const w of windows)byWindow[w]={level:QuantStats.rolling(values,w),vol:QuantStats.rolling(logReturns,w),rv:QuantStats.rollingRealizedVolatility(logReturns,w)};
    const indices=[];for(let i=values.length-1;i>=0&&indices.length<20;i--)if(windows.some(w=>byWindow[w].level[i]))indices.push(i);
    if(!indices.length){box.innerHTML=`<p class="msg">Chưa đủ dữ liệu liên tiếp cho cửa sổ nhỏ nhất ${windows[0]}.</p>`;return;}
    const headers=windows.map(w=>`<th colspan="6">WINDOW ${w}</th>`).join('');
    const sub=windows.map(()=>'<th>Price Mean</th><th>Price SD</th><th>Return SD</th><th>√RV</th><th>√BV</th><th>Jump Var. ×10⁻⁶</th>').join('');
    const rows=indices.map(i=>{const time=QL.timeIndex>=0?QL.rows[i]?.[QL.timeIndex]:`#${i+1}`,cells=windows.map(w=>{const z=byWindow[w],l=z.level[i],v=z.vol[i-1],r=z.rv[i-1];return`<td>${l?fmt(l.mean,6):'—'}</td><td>${l?fmt(l.stdDev,6):'—'}</td><td>${v?pct(v.stdDev,4):'—'}</td><td>${r?pct(r.realizedVolatility,4):'—'}</td><td>${r?pct(r.bipowerVolatility,4):'—'}</td><td>${r?fmt(r.jumpVariation*1e6,5):'—'}</td>`}).join('');return`<tr><th>${esc(time??`#${i+1}`)}</th><td>${fmt(values[i],7)}</td>${cells}</tr>`}).join('');
    box.innerHTML=`<table class="ql-table"><thead><tr><th rowspan="2">Time / Row</th><th rowspan="2">Value</th>${headers}</tr><tr>${sub}</tr></thead><tbody>${rows}</tbody></table><div class="ql-analysis-note">So sánh nhiều chu kỳ: ${windows.join(', ')} bars/returns. Với mỗi cửa sổ, Price Mean/SD dùng mức giá; Return SD dùng độ lệch chuẩn mẫu của log return; RV = Σr²; BV = (π/2)Σ|rₜ||rₜ₋₁|; Jump Variation = max(RV−BV, 0). RV/BV/jump variation chưa annualize; cửa sổ w returns cần w+1 mức giá. Đây là ước lượng tham khảo, không phải kiểm định jump hoàn chỉnh; session gaps, quote noise và tần suất dữ liệu có thể ảnh hưởng mạnh.</div>`;
  }
  function selectedColumnStats(){const i=Number($q('qPriceColumn').value);QL.priceIndex=i;return{index:i,values:getValues(i).filter(Number.isFinite)}}
  function render(){
    if(!QL.rows.length)return;
    const {index,values}=selectedColumnStats(),s=QuantStats.stats(values),ret=QuantStats.returns(getValues(index)),simple=ret.map(x=>x.simple).filter(Number.isFinite),logs=ret.map(x=>x.log).filter(Number.isFinite),rs=QuantStats.stats(logs),missing=QL.rows.length-values.length;
    $q('qMetrics').innerHTML=[['OBSERVATIONS',fmt(s.n,0),'Số giá trị hợp lệ'],['MEAN',fmt(s.mean),'Trung bình'],['STD. DEV.',fmt(s.stdDev),'Độ lệch chuẩn mẫu'],['MIN / MAX',`${fmt(s.min)} / ${fmt(s.max)}`,'Biên dữ liệu'],['MISSING · VAR',fmt(missing,0),'Biến đang chọn']].map(x=>`<div class="ql-metric"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
    const modeDisplay=s.modes?.length>1?s.modes.join(', '):s.mode;
    const statRows=[['Số quan sát',s.n],['Trung bình (Mean)',s.mean],['Trung vị (Median)',s.median],['Mode (nếu có giá trị lặp)',modeDisplay],['Tần suất Mode',s.modeFrequency],['Phương sai mẫu (Variance)',s.variance],['Độ lệch chuẩn mẫu (Std. Dev.)',s.stdDev],['Giá trị nhỏ nhất (Min)',s.min],['Q1 · 25%',s.q1],['Q3 · 75%',s.q3],['Giá trị lớn nhất (Max)',s.max],['Skewness',s.skewness],['Excess Kurtosis',s.excessKurtosis]];
    $q('qStatsTable').innerHTML=statRows.map(([k,v])=>`<tr><td>${k}</td><td>${typeof v==='number'?fmt(v,6):'—'}</td></tr>`).join('')+`<tr><td colspan=2 class="msg">Skewness và Excess Kurtosis hiện là moment coefficients chưa hiệu chỉnh độ chệch mẫu; Mode chỉ tồn tại khi giá trị lặp chính xác.</td></tr>`;
    $q('qReturnStats').innerHTML=[['Simple return mean',pct(QuantStats.stats(simple).mean)],['Log return mean',pct(rs.mean)],['Log return Std. Dev.',pct(rs.stdDev)],['Positive returns',pct(simple.filter(x=>x>0).length/Math.max(1,simple.length),1)],['Best log return',pct(rs.max)],['Worst log return',pct(rs.min)],['Return observations',fmt(logs.length,0)]].map(([k,v])=>`<div class="ql-return-item"><span>${k}</span><b>${v}</b></div>`).join('');
    const rd=QuantStats.returnDistribution(logs);
    $q('qReturnDistributionMetrics').innerHTML=[['MEAN',pct(rd.mean,4)],['STD. DEV.',pct(rd.stdDev,4)],['SKEWNESS',fmt(rd.skewness,4)],['EXCESS KURTOSIS',fmt(rd.excessKurtosis,4)],['JARQUE–BERA',fmt(rd.jarqueBera,3)],['JB ASYMPTOTIC P',pval(rd.jarqueBeraP)]].map(([k,v])=>`<div class="ql-return-item"><span>${k}</span><b>${v}</b></div>`).join('');
    const qrows=[['1% tail',rd.quantiles.p01],['5% tail',rd.quantiles.p05],['Median',rd.quantiles.p50],['95% tail',rd.quantiles.p95],['99% tail',rd.quantiles.p99]].map(([k,v])=>`<tr><th>${k}</th><td>${pct(v,4)}</td></tr>`).join('');
    $q('qReturnQuantiles').innerHTML=`<table class="ql-table"><thead><tr><th>Quantile</th><th>Log return</th></tr></thead><tbody>${qrows}</tbody></table>`;
    $q('qReturnDistributionNote').textContent=`N=${rd.n}. Jarque–Bera kiểm tra đồng thời skewness và excess kurtosis so với chuẩn; p-value dùng xấp xỉ χ²(2), chỉ mang tính tham khảo. ${rd.jarqueBeraP<.05?'Mẫu có bằng chứng không phù hợp phân phối chuẩn theo JB ở mức 5%.':'Chưa bác bỏ giả thuyết chuẩn theo JB; điều này không chứng minh returns có phân phối chuẩn.'} Các quantile là thống kê lịch sử trong mẫu, không phải VaR/Expected Shortfall dự báo.`;
    drawHistogram(QuantStats.histogram(logs,24),'qReturnHistogram');
    const corrIndices=[...$q('qCorrColumns').querySelectorAll('input:checked')].map(x=>+x.value),cols={};corrIndices.forEach(i=>cols[QL.headers[i]]=getValues(i));
    const cm=QuantStats.correlationMatrix(cols),cv=QuantStats.covarianceMatrix(cols);
    const matrixHtml=m=>m.names.length?`<table class="ql-table ql-corr"><thead><tr><th>Variable</th>${m.names.map(n=>`<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${m.names.map((n,i)=>`<tr><th>${esc(n)}</th>${m.values[i].map(v=>`<td>${fmt(v,6)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="msg">Chọn ít nhất một biến số.</p>';
    $q('qCorrelation').innerHTML=cm.names.length?`<table class="ql-table ql-corr"><thead><tr><th>Variable</th>${cm.names.map(n=>`<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${cm.names.map((n,i)=>`<tr><th>${esc(n)}</th>${cm.values[i].map(v=>`<td class="${v>0.5?'pos':v<-.5?'neg':''}">${fmt(v,3)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="msg">Chọn ít nhất một biến số.</p>';
    if($q('qCovariance'))$q('qCovariance').innerHTML=matrixHtml(cv);
    drawHistogram(QuantStats.histogram(values,24),'qHistogram');drawSeries(values);renderRolling();renderDataAudit();
    $q('qPreview').innerHTML=`<table class="ql-table"><thead><tr>${QL.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${QL.rows.slice(0,12).map(r=>`<tr>${QL.headers.map((h,i)=>`<td>${esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $q('qDataMeta').textContent=`Nguồn: ${QL.source} · ${QL.rows.length.toLocaleString('en-US')} dòng · ${QL.headers.length} cột · ${QL.timeIndex>=0?'đã nhận diện cột thời gian':'chưa nhận diện cột thời gian'}${QL.invalidTimestampCount?` · ${QL.invalidTimestampCount} timestamp không hợp lệ`:''}.`;
    $q('qAnalysisNote').textContent=`Biến đang phân tích: ${QL.headers[index]}. Lợi suất được tính theo thứ tự dòng${QL.timeSorted?' (đã sắp tăng dần theo timestamp)':' (không tự sắp xếp vì thiếu/không nhận diện đủ timestamp)'}. Log return chỉ tính khi hai mức giá liên tiếp dương.`;
  }
  const pval=v=>Number.isFinite(v)?(v<.001?'<0.001':fmt(v,4)):'—';
  function runOLS(){
    try{
      const yi=Number($q('qRegY').value),xIndices=[...$q('qRegX').querySelectorAll('input:checked')].map(e=>+e.value);
      if(xIndices.includes(yi))throw new Error('Biến Y không thể đồng thời là biến X.');
      const model=QuantRegression.ols({yValues:getValues(yi),xColumns:xIndices.map(i=>({name:QL.headers[i],values:getValues(i)})),includeIntercept:$q('qRegIntercept').checked,robustHC1:$q('qRegHC1').checked});
      model.yName=QL.headers[yi];model.xNames=xIndices.map(i=>QL.headers[i]);QL.lastRegression=model;renderOLS(model);
      const st=$q('qRegStatus');st.textContent=`Ước lượng thành công · ${model.n} quan sát hoàn chỉnh · ${model.xNames.length} biến giải thích${model.robustHC1?' · HC1 robust SE':''}.`;st.classList.remove('is-bad');st.classList.add('is-good');$q('qRegOutput').hidden=false;$q('qExportOLS').disabled=false;
    }catch(e){const st=$q('qRegStatus');st.textContent=e.message||String(e);st.classList.add('is-bad');st.classList.remove('is-good');$q('qRegOutput').hidden=true;$q('qExportOLS').disabled=true;QL.lastRegression=null;}
  }
  function runLaggedReturnRegression(){
    const status=$q('qLaggedRegStatus'),out=$q('qLaggedRegOutput');
    try{
      const yi=Number($q('qRegY').value),xIndices=[...$q('qRegX').querySelectorAll('input:checked')].map(e=>+e.value),lag=Number($q('qRegLagBars').value);
      if(!xIndices.length)throw new Error('Hãy chọn ít nhất một biến X ở phần OLS phía trên.');
      if(!Number.isInteger(lag)||lag<1||lag>60)throw new Error('Predictor lag phải là số nguyên từ 1 đến 60 bars.');
      const yRaw=getValues(yi),n=yRaw.length,yValues=Array(n).fill(NaN);
      for(let t=1;t<n;t++)if(Number.isFinite(yRaw[t])&&yRaw[t]>0&&Number.isFinite(yRaw[t-1])&&yRaw[t-1]>0)yValues[t]=Math.log(yRaw[t]/yRaw[t-1]);
      const xColumns=[],transformNotes=[];
      for(const idx of xIndices){
        const raw=getValues(idx),valid=raw.filter(Number.isFinite),useLog=valid.length>0&&valid.every(v=>v>0),change=Array(n).fill(NaN);
        for(let t=1;t<n;t++)if(Number.isFinite(raw[t])&&Number.isFinite(raw[t-1])){
          if(useLog&&raw[t]>0&&raw[t-1]>0)change[t]=Math.log(raw[t]/raw[t-1]);
          else change[t]=raw[t]-raw[t-1];
        }
        const lagged=Array(n).fill(NaN);for(let t=lag+1;t<n;t++)lagged[t]=change[t-lag];
        xColumns.push({name:`${useLog?'Δln':'Δ'} ${QL.headers[idx]} · lag ${lag}`,values:lagged});
        transformNotes.push(`${QL.headers[idx]}: ${useLog?'log change':'first difference'}`);
      }
      const model=QuantRegression.ols({yValues,xColumns,includeIntercept:true,robustHC1:true});
      model.yName=`Δln ${QL.headers[yi]}`;model.transformNotes=transformNotes;model.lag=lag;QL.lastLaggedRegression=model;
      $q('qLaggedRegMetrics').innerHTML=[['OBSERVATIONS',fmt(model.n,0),'Các dòng Y/X đầy đủ'],['R-SQUARED',fmt(model.r2,5),'Fit in-sample, không phải forecast accuracy'],['RMSE',fmt(model.rmse,7),'Lỗi trong mẫu'],['HC1 SE','Enabled','Chống heteroskedasticity cho inference hệ số']].map(a=>`<div class="ql-metric"><span>${a[0]}</span><b>${a[1]}</b><small>${a[2]}</small></div>`).join('');
      const coef=model.coefficients.map(c=>`<tr><th>${esc(c.name)}</th><td>${fmt(c.estimate,7)}</td><td>${fmt(c.stdError,7)}</td><td>${fmt(c.t,4)}</td><td>${pval(c.p)}</td><td>${fmt(c.ciLower,7)} → ${fmt(c.ciUpper,7)}</td></tr>`).join('');
      const d=model.diagnostics,bp=d.breuschPagan,vifs=d.vif.map((v,i)=>`${xColumns[i].name}: ${Number.isFinite(v.vif)?fmt(v.vif,2):'∞'}`).join(' · ');
      $q('qLaggedRegTable').innerHTML=`<table class="ql-table"><thead><tr><th>Coefficient</th><th>Estimate</th><th>HC1 Std. Error</th><th>t-stat</th><th>p-value</th><th>95% CI</th></tr></thead><tbody>${coef}</tbody></table><table class="ql-table"><tbody><tr><th>Jarque–Bera p</th><td>${pval(d.jarqueBeraP)}</td></tr><tr><th>Breusch–Pagan p</th><td>${bp?pval(bp.p):'—'}</td></tr><tr><th>VIF</th><td>${esc(vifs)}</td></tr></tbody></table>`;
      const ti=timeSeriesTimeInfo();$q('qLaggedRegNote').textContent=`Y=${QL.headers[yi]} được chuyển thành log return hiện tại. X được chuyển thành log change nếu tất cả giá trị hợp lệ đều dương; nếu không dùng first difference. X được lùi ${lag} dòng/bar nên không dùng giá trị X cùng bar với Y. Lag là số dòng, không đảm bảo cùng số phút nếu có session gaps. ${ti.warning?'CẢNH BÁO thời gian: '+ti.warnings.join(' · ')+'. ':''} HC1 chỉ điều chỉnh sai số chuẩn khi heteroskedasticity; không sửa serial correlation. R²/p-value không chứng minh causality hay hiệu quả dự báo ngoài mẫu.`;
      out.hidden=false;status.textContent=`Lagged regression hoàn tất · ${model.n} quan sát · lag ${lag} bar · HC1.`;status.classList.remove('is-bad');status.classList.add('is-good');
    }catch(e){out.hidden=true;status.textContent=e.message||String(e);status.classList.add('is-bad');status.classList.remove('is-good');QL.lastLaggedRegression=null;}
  }
  function runWalkForward(){
    const status=$q('qTsWalkForwardStatus'),box=$q('qTsWalkForwardOutput');
    try{
      const{values,name}=timeSeriesValues(),options={type:$q('qTsModelType').value,p:$q('qTsP').value,d:$q('qTsD').value,q:$q('qTsQ').value,initialTrainPercent:$q('qTsWfTrainPct').value,maxForecastPoints:$q('qTsWfPoints').value},result=QuantTimeSeries.walkForward(values,options),m=result.metrics,ti=timeSeriesTimeInfo();
      const metrics=[['CHECKPOINTS',fmt(result.evaluated,0),'Các điểm ngoài mẫu được lấy đều trên đoạn test'],['MODEL RMSE',fmt(m.rmse,7),'RMSE của dự báo một bước'],['NAIVE RMSE',fmt(m.naiveRmse,7),'Baseline: giữ nguyên giá trị cuối train'],['MAE',fmt(m.mae,7),'Mean absolute error'],['DIRECTIONAL ACC.',pct(m.directionalAccuracy,1),'Đúng hướng so với giá trị cuối train'],['RMSE VS NAIVE',`${fmt(m.rmseImprovementPct,2)}%`,m.beatsNaive?'Model tốt hơn baseline trong checkpoint':'Model chưa vượt baseline trong checkpoint']];
      const points=result.points.map(v=>`<tr><th>${v.targetIndex+1}</th><td>${fmt(v.trainN,0)}</td><td>${fmt(v.actual,6)}</td><td>${fmt(v.predicted,6)}</td><td>${fmt(v.naive,6)}</td><td>${fmt(v.modelError,6)}</td><td>${fmt(v.naiveError,6)}</td></tr>`).join('');
      box.innerHTML=`<div class="ql-metrics ql-reg-metrics">${metrics.map(a=>`<div class="ql-metric"><span>${a[0]}</span><b>${a[1]}</b><small>${a[2]}</small></div>`).join('')}</div><table class="ql-table"><thead><tr><th>Target row</th><th>Train N</th><th>Actual</th><th>Model forecast</th><th>Naive forecast</th><th>Model error</th><th>Naive error</th></tr></thead><tbody>${points}</tbody></table><p class="ql-analysis-note">${name} · expanding-window, one-step-ahead; initial train=${result.trainPercent}% (${result.initialTrain} observations), available test=${result.availableTest}; evaluated ${result.evaluated} evenly spaced checkpoints. ${ti.warning?'Timestamp/session warning: '+ti.warnings.join(' · ')+'. ':''} Đây là đánh giá ngoài mẫu sơ bộ trên checkpoint rải đều, không phải backtest liên tục mọi bar; chưa bao gồm spread, commission, slippage, latency hoặc bất định tham số.</p>`;
      status.textContent=`Walk-forward hoàn tất · ${result.evaluated} checkpoint · ${result.type}(${result.order.p},${result.order.d},${result.order.q}). ${m.beatsNaive?'RMSE thấp hơn':'RMSE không thấp hơn'} baseline naïve trong mẫu checkpoint.`;status.classList.remove('is-bad');status.classList.add('is-good');
    }catch(e){box.innerHTML=`<p class="ql-analysis-note">${esc(e.message||String(e))}</p>`;status.textContent='Walk-forward chưa thể hoàn tất.';status.classList.add('is-bad');status.classList.remove('is-good');}
  }
  function renderOLS(m){
    const metric=[['OBSERVATIONS',fmt(m.n,0),'Dòng đầy đủ dùng để ước lượng'],['R-SQUARED',fmt(m.r2,6),'Độ phù hợp của mô hình'],['ADJ. R-SQUARED',fmt(m.adjustedR2,6),'R² hiệu chỉnh'],['F-TEST P-VALUE',pval(m.fP),'Kiểm định ý nghĩa chung']];
    $q('qRegMetrics').innerHTML=metric.map(a=>`<div class="ql-metric"><span>${a[0]}</span><b>${a[1]}</b><small>${a[2]}</small></div>`).join('');
    $q('qRegCoefficients').innerHTML=`<table class="ql-table ql-reg-table"><thead><tr><th>Variable</th><th>Coefficient</th><th>Std. Error</th><th>t-stat</th><th>Prob.</th><th>95% CI Lower</th><th>95% CI Upper</th></tr></thead><tbody>${m.coefficients.map(c=>`<tr><th>${esc(c.name)}</th><td>${fmt(c.estimate,7)}</td><td>${fmt(c.stdError,7)}</td><td>${fmt(c.t,4)}</td><td class="${Number.isFinite(c.p)&&c.p<.05?'sig':''}">${pval(c.p)}</td><td>${fmt(c.ciLower,7)}</td><td>${fmt(c.ciUpper,7)}</td></tr>`).join('')}</tbody></table>`;
    const rows=[['Dependent variable',m.yName],['Included regressors',m.xNames.join(', ')],['Intercept',m.includeIntercept?'Yes':'No'],['Standard errors',m.robustHC1?'HC1 heteroskedasticity-consistent':'Classical OLS'],['Residual degrees of freedom',m.dfResidual],['Model degrees of freedom',m.dfModel],['F-statistic',fmt(m.fStat,6)],['Prob. (F-statistic)',pval(m.fP)],['SSE',fmt(m.sse,7)],['RMSE',fmt(m.rmse,7)],['Residual Std. Error',fmt(m.residualStdError,7)]];
    $q('qRegSummary').innerHTML=`<table class="ql-table"><tbody>${rows.map(([a,b])=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
    const d=m.diagnostics,bp=d.breuschPagan;
    const diag=[['Durbin–Watson',fmt(d.durbinWatson,4),d.durbinWatsonValid?'Gần 2 là dấu hiệu sơ bộ ít tự tương quan bậc 1; không phải kết luận đầy đủ.':'Không tính vì listwise deletion làm mất tính liền kề của quan sát; DW chuẩn không phù hợp.'],['Jarque–Bera statistic',fmt(d.jarqueBera,4),`p-value: ${pval(d.jarqueBeraP)}`],['Breusch–Pagan LM',bp?fmt(bp.lm,4):'—',bp?`df=${bp.df}; p-value: ${pval(bp.p)}`:'Không ước lượng được kiểm định phụ trợ.'],['Mean residual',fmt(m.residuals.reduce((a,b)=>a+b,0)/m.n,8),'Với mô hình có intercept, tổng phần dư xấp xỉ 0.'],...d.vif.map((v,i)=>[`VIF · ${m.xNames[i]}`,Number.isFinite(v.vif)?fmt(v.vif,4):'∞',v.vif>=10?'Đa cộng tuyến đáng lưu ý (ngưỡng tham khảo 10).':v.vif>=5?'Cần xem xét đa cộng tuyến (ngưỡng tham khảo 5).':'Không vượt ngưỡng tham khảo 5.'])];
    $q('qRegDiagnostics').innerHTML=`<table class="ql-table"><thead><tr><th>Diagnostic</th><th>Value</th><th>Interpretation / p-value</th></tr></thead><tbody>${diag.map(([a,b,c])=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</tbody></table>`;
    $q('qRegNote').textContent=`Mô hình: ${m.yName} ~ ${m.xNames.join(' + ')}${m.includeIntercept?' + Intercept':''}. Chỉ các dòng có dữ liệu hợp lệ ở Y và toàn bộ X được dùng (listwise deletion). ${m.robustHC1?'HC1 điều chỉnh ma trận phương sai–hiệp phương sai và suy luận từng hệ số; F-test tổng thể đang hiển thị vẫn là F-test OLS cổ điển.':'Sai số chuẩn và kiểm định hệ số dùng giả định OLS cổ điển.'} Breusch–Pagan và Jarque–Bera dùng xấp xỉ tiệm cận; Durbin–Watson chỉ tính khi các dòng đưa vào còn liền kề. HC1 không xử lý tự tương quan. Nếu hồi quy Close theo Open/High/Low của chính cây nến đó, đây là phân tích mô tả chứ không phải dự báo realtime vì High/Low chỉ biết sau khi nến hình thành. Kết quả không tự chứng minh quan hệ nhân quả hay khả năng dự báo.`;
    drawResidualPlot(m.fitted,m.residuals);
  }
  function drawResidualPlot(fitted,residuals){
    const cv=$q('qRegResidualPlot');if(!cv)return;const dpr=window.devicePixelRatio||1,w=cv.clientWidth||500,h=220;cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);if(!fitted.length)return;
    const minX=fitted.reduce((a,v)=>Math.min(a,v),Infinity),maxX=fitted.reduce((a,v)=>Math.max(a,v),-Infinity),minY=residuals.reduce((a,v)=>Math.min(a,v),Infinity),maxY=residuals.reduce((a,v)=>Math.max(a,v),-Infinity),rx=maxX-minX||1,ry=maxY-minY||1,p={l:38,r:12,t:14,b:25};
    const x=v=>p.l+(v-minX)/rx*(w-p.l-p.r),y=v=>p.t+(maxY-v)/ry*(h-p.t-p.b),styles=getComputedStyle(document.documentElement),mut=styles.getPropertyValue('--mut').trim()||'#999',line=styles.getPropertyValue('--line').trim()||'#555',accent=styles.getPropertyValue('--acc').trim()||'#d8aa4c';
    c.strokeStyle=line;c.beginPath();c.moveTo(p.l,p.t);c.lineTo(p.l,h-p.b);c.lineTo(w-p.r,h-p.b);c.stroke();c.strokeStyle=mut;c.setLineDash([4,4]);c.beginPath();c.moveTo(p.l,y(0));c.lineTo(w-p.r,y(0));c.stroke();c.setLineDash([]);c.fillStyle=accent;c.globalAlpha=.72;
    const step=Math.max(1,Math.ceil(fitted.length/1600));for(let i=0;i<fitted.length;i+=step){c.beginPath();c.arc(x(fitted[i]),y(residuals[i]),2.1,0,Math.PI*2);c.fill();}c.globalAlpha=1;c.fillStyle=mut;c.font='10px Space Grotesk,sans-serif';c.fillText(fmt(maxY,4),4,p.t+8);c.fillText(fmt(minY,4),4,h-p.b);c.fillText('Fitted value',w/2-25,h-6);
  }
  function exportOLS(){
    const m=QL.lastRegression;if(!m)return;const rows=[['Section','Metric','Value'],['Model','Dependent variable',m.yName],['Model','Independent variables',m.xNames.join('; ')],['Model','Observations',m.n],['Model','R-squared',m.r2],['Model','Adjusted R-squared',m.adjustedR2],['Model','F-statistic',m.fStat],['Model','F p-value',m.fP],['Model','Standard errors',m.robustHC1?'HC1':'Classical']];
    const dg=m.diagnostics;rows.push(['Diagnostic','Durbin-Watson',dg.durbinWatson],['Diagnostic','Jarque-Bera p-value',dg.jarqueBeraP],['Diagnostic','Breusch-Pagan LM p-value',dg.breuschPagan?dg.breuschPagan.p:'']);
    for(const c of m.coefficients){rows.push(['Coefficient',c.name+' estimate',c.estimate],['Coefficient',c.name+' std error',c.stdError],['Coefficient',c.name+' t statistic',c.t],['Coefficient',c.name+' p value',c.p],['Coefficient',c.name+' 95% CI lower',c.ciLower],['Coefficient',c.name+' 95% CI upper',c.ciUpper]);}
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='gexadecimal-ols-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  function drawHistogram(bins,canvasId='qHistogram'){const cv=$q(canvasId);if(!cv)return;const dpr=devicePixelRatio||1,w=cv.clientWidth||500,h=220;cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);if(!bins.length)return;const max=Math.max(1,...bins.map(b=>b.count)),pad={l:36,r:12,t:12,b:30},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;const styles=getComputedStyle(document.documentElement),bar=styles.getPropertyValue('--acc').trim()||'#d8aa4c',mut=styles.getPropertyValue('--mut').trim()||'#9b927d',line=styles.getPropertyValue('--line').trim()||'#555';c.strokeStyle=line;c.beginPath();c.moveTo(pad.l,pad.t);c.lineTo(pad.l,h-pad.b);c.lineTo(w-pad.r,h-pad.b);c.stroke();const gap=2,bw=pw/bins.length;bins.forEach((b,i)=>{const bh=b.count/max*(ph-4);c.fillStyle=bar;c.globalAlpha=.78;c.fillRect(pad.l+i*bw+gap/2,h-pad.b-bh,Math.max(1,bw-gap),bh)});c.globalAlpha=1;c.fillStyle=mut;c.font='10px Space Grotesk, sans-serif';c.fillText(String(bins[0].x0.toFixed(3)),pad.l,h-9);c.fillText(String(bins[bins.length-1].x1.toFixed(3)),w-pad.r-54,h-9);c.fillText(String(max),5,pad.t+8);}
  function drawSeries(values){const cv=$q('qSeries');if(!cv)return;const dpr=devicePixelRatio||1,w=cv.clientWidth||500,h=220;cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);const a=values.filter(Number.isFinite);if(!a.length)return;const sample=a.length>600?a.filter((_,i)=>i%(Math.ceil(a.length/600))===0):a;const lo=Math.min(...sample),hi=Math.max(...sample),range=hi-lo||1,p={l:12,r:12,t:14,b:24};const x=i=>p.l+i/(Math.max(1,sample.length-1))*(w-p.l-p.r),y=v=>h-p.b-(v-lo)/range*(h-p.t-p.b);const styles=getComputedStyle(document.documentElement),line=styles.getPropertyValue('--c3').trim()||'#38d6aa',mut=styles.getPropertyValue('--mut').trim()||'#9b927d';c.strokeStyle=styles.getPropertyValue('--line').trim()||'#555';c.beginPath();c.moveTo(p.l,p.t);c.lineTo(p.l,h-p.b);c.lineTo(w-p.r,h-p.b);c.stroke();c.strokeStyle=line;c.lineWidth=1.8;c.beginPath();sample.forEach((v,i)=>i?c.lineTo(x(i),y(v)):c.moveTo(x(i),y(v)));c.stroke();c.fillStyle=mut;c.font='10px Space Grotesk, sans-serif';c.fillText(fmt(hi,4),p.l,p.t+8);c.fillText(fmt(lo,4),p.l,h-5);c.fillText(`${sample.length} điểm hiển thị`,w-p.r-90,h-5);}
  function demo(){let p=2650;const rows=[];for(let i=0;i<320;i++){const change=.00025*Math.sin(i/9)+.00018*Math.cos(i/17)+.0011*Math.sin(i*1.73);p*=Math.exp(change);const d=new Date(Date.UTC(2026,0,1)+i*60000);rows.push([d.toISOString(),p.toFixed(2),(1.1+Math.sin(i/15)*.4).toFixed(3),(Math.sin(i/11)*.35).toFixed(3)])}setData(['Time','Close','VolatilityProxy','MacroProxy'],rows,',','Dữ liệu DEMO tổng hợp (không phải market feed)')}
  function regressionDemo(){
    const rows=[];
    for(let i=0;i<180;i++){
      const x1=.9*Math.sin(i/8)+.45*Math.cos(i/17)+.1*Math.sin(i*1.7);
      const x2=.7*Math.cos(i/11)+.35*Math.sin(i/23)+.08*Math.cos(i*1.31);
      const noise=.12*Math.sin(i*2.7)+.06*Math.cos(i*.41);
      const y=.25+1.8*x1-.7*x2+noise;
      rows.push([new Date(Date.UTC(2026,0,1)+i*86400000).toISOString(),y.toFixed(6),x1.toFixed(6),x2.toFixed(6)]);
    }
    setData(['Time','TargetReturn','FactorReturn','VolatilityChange'],rows,',','OLS DEMO tổng hợp · β mục tiêu: Intercept=0.25, X1=1.8, X2=-0.7 (không phải market feed)');
  }
  function useChart(){if(typeof m1==='undefined'||!Array.isArray(m1)||!m1.length)throw new Error('Chart chưa có dữ liệu M1. Hãy kết nối cTrader và tải dữ liệu trước.');const bars=m1.map(b=>[new Date(Number(b[0])*1000).toISOString(),b[1],b[2],b[3],b[4],b[5]]);setData(['Time','Open','High','Low','Close','TickVolume'],bars,',',`cTrader ${typeof C!=='undefined'?C.sym:'M1'} · M1 đang tải trong Chart`)}
  function importFile(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=QuantStats.parseCSV(reader.result);setData(parsed.headers,parsed.rows,parsed.delimiter,`CSV: ${file.name}`)}catch(e){note(e.message,true)}};reader.onerror=()=>note('Không đọc được file CSV.',true);reader.readAsText(file)}
  function downloadSample(){const csv='Time,Open,High,Low,Close,TickVolume\n2026-01-01T00:00:00Z,2650,2652,2649,2651,120\n2026-01-01T00:01:00Z,2651,2654,2650,2653,145\n2026-01-01T00:02:00Z,2653,2655,2651,2652,132\n';const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='gexadecimal-quant-sample.csv';a.click();URL.revokeObjectURL(u)}
  function init(){
    if(!$q('qFile'))return;
    $q('qFile').addEventListener('change',e=>importFile(e.target.files&&e.target.files[0]));
    $q('qUseChart').addEventListener('click',()=>{try{useChart()}catch(e){note(e.message,true)}});
    $q('qDemo').addEventListener('click',()=>{try{demo()}catch(e){note(e.message,true)}});
    $q('qSample').addEventListener('click',downloadSample);
    $q('qPriceColumn').addEventListener('change',()=>{if(QL.rows.length)render()});
    $q('qRollingUpdate').addEventListener('click',renderRolling);
    $q('qRollingWindow').addEventListener('change',renderRolling);
    $q('qCorrColumns').addEventListener('change',()=>{if(QL.rows.length)render()});
    $q('qRegY').addEventListener('change',()=>populateRegressionControls());
    $q('qRunOLS').addEventListener('click',runOLS);
    $q('qRegX').addEventListener('change',invalidateOLS);
    $q('qRegLagBars').addEventListener('change',()=>{$q('qLaggedRegOutput').hidden=true;$q('qLaggedRegStatus').textContent='Lag đã đổi. Chạy lại Lagged Regression.';});
    $q('qRegIntercept').addEventListener('change',invalidateOLS);
    $q('qRegHC1').addEventListener('change',invalidateOLS);
    $q('qRegDemo').addEventListener('click',()=>{try{regressionDemo()}catch(e){note(e.message,true)}});
    $q('qExportOLS').addEventListener('click',exportOLS);
    $q('qRunLaggedReg').addEventListener('click',runLaggedReturnRegression);
    $q('qTsDemo').addEventListener('click',()=>{try{timeSeriesDemo()}catch(e){note(e.message,true)}});
    $q('qTsColumn').addEventListener('change',()=>{renderCorrelogram();QL.lastTsModel=null;$q('qTsUnitRoot').innerHTML='<p class="msg">Biến đã đổi. Chạy lại ADF + PP để cập nhật kết quả.</p>';$q('qTsModelOutput').hidden=true;$q('qTsWalkForwardOutput').innerHTML='<p class="msg">Chuỗi đã đổi. Chạy lại Walk-forward.</p>'});
    $q('qTsCorrDiff').addEventListener('change',renderCorrelogram);
    $q('qTsCorrelogram').addEventListener('click',renderCorrelogram);
    $q('qTsRunTests').addEventListener('click',runUnitRootTests);
    $q('qTsFitModel').addEventListener('click',runTsModel);
    $q('qTsRunWalkForward').addEventListener('click',runWalkForward);
    $q('qVolFit').addEventListener('click',runVolatilityModel);
    $q('qVolExport').addEventListener('click',exportVolatility);
    ['qVolColumn','qVolModel','qVolDistribution','qVolArchOrder','qVolHorizon','qVolAnnualFactor'].forEach(id=>$q(id).addEventListener('change',()=>{QL.lastVolatility=null;$q('qVolOutput').hidden=true;$q('qVolStatus').textContent='Thiết lập Phase 4 đã đổi. Hãy ước lượng lại mô hình.';$q('qVolStatus').classList.remove('is-good','is-bad')}));
    const invalidateTsModel=()=>{QL.lastTsModel=null;$q('qTsModelOutput').hidden=true;$q('qTsModelStatus').textContent='Tham số mô hình đã thay đổi. Hãy ước lượng lại.';$q('qTsModelStatus').classList.remove('is-good','is-bad');$q('qTsWalkForwardOutput').innerHTML='<p class="msg">Tham số đã thay đổi. Chạy lại Walk-forward.</p>';$q('qTsWalkForwardStatus').textContent='Tham số đã thay đổi; kết quả cũ không còn áp dụng.'};
    ['qTsModelType','qTsP','qTsD','qTsQ','qTsHorizon'].forEach(id=>$q(id).addEventListener('change',invalidateTsModel));
    ['qTsWfTrainPct','qTsWfPoints'].forEach(id=>$q(id).addEventListener('change',()=>{$q('qTsWalkForwardOutput').innerHTML='<p class="msg">Thiết lập validation đã đổi. Chạy lại Walk-forward.</p>';$q('qTsWalkForwardStatus').textContent='Thiết lập đã thay đổi.';}));
    const invalidateUnitRoot=()=>{$q('qTsUnitRoot').innerHTML='<p class="msg">Thiết lập kiểm định đã thay đổi. Hãy chạy lại ADF + PP.</p>'};
    ['qTsDeterministic','qTsAdfLag','qTsPpBandwidth'].forEach(id=>$q(id).addEventListener('change',invalidateUnitRoot));

    window.addEventListener('resize',()=>{if(QL.rows.length){const i=QL.priceIndex;drawHistogram(QuantStats.histogram(getValues(i).filter(Number.isFinite),24));drawSeries(getValues(i));if(QL.lastRegression)drawResidualPlot(QL.lastRegression.fitted,QL.lastRegression.residuals);if($q('qTsColumn'))renderCorrelogram();if(!$q('qTsModelOutput').hidden&&QL.lastTsModel){drawForecast(QL.lastTsModel.values,QL.lastTsModel.model.forecastRows)}if(!$q('qVolOutput').hidden&&QL.lastVolatility){drawVolatilityPlot(QL.lastVolatility.conditionalVolatilityPct,QL.lastVolatility.forecast)}}});
    demo();
    renderCorrelogram();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
