/* Quant Lab UI · isolated from chart/indicator/replay renderers. */
(function(){
  'use strict';
  const $q=id=>document.getElementById(id);
  const QL={headers:[],rows:[],delimiter:',',source:'',numeric:[],priceIndex:-1,timeIndex:-1,timeSorted:false,loadedAt:null,lastRegression:null};
  const fmt=(v,d=4)=>Number.isFinite(v)?Number(v).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
  const pct=(v,d=3)=>Number.isFinite(v)?(v*100).toFixed(d)+'%':'—';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getValues=index=>QL.rows.map(r=>QuantStats.parseNumber(r[index],QL.delimiter));
  function note(s,bad=false){const e=$q('qStatus');if(e){e.textContent=s;e.classList.toggle('is-bad',bad)}}
  function setData(headers,rows,delimiter,source){
    if(!headers.length||!rows.length)throw new Error('Không tìm thấy dữ liệu có header và ít nhất một dòng.');
    QL.headers=headers;QL.rows=rows;QL.delimiter=delimiter||',';QL.source=source;QL.loadedAt=new Date();
    QL.numeric=QuantStats.numericColumns(headers,rows,QL.delimiter);
    if(!QL.numeric.length)throw new Error('Không tìm thấy cột số hợp lệ. Hãy kiểm tra header và định dạng số trong CSV.');
    const ti=QuantStats.detectTimeColumn(headers),pi=QuantStats.detectPriceColumn(headers);
    QL.timeIndex=ti;QL.timeSorted=false;
    QL.priceIndex=QL.numeric.some(c=>c.index===pi)?pi:(QL.numeric.find(c=>c.index!==ti)?.index??QL.numeric[0].index);
    if(ti>=0){const parsed=rows.map((r,i)=>{const raw=String(r[ti]??'').trim(),num=Number(raw);let t=NaN;if(raw&&Number.isFinite(num)&&Math.abs(num)>=1e9)t=Math.abs(num)>=1e12?num: num*1000;else t=Date.parse(raw);return{r,i,t}});const valid=parsed.filter(x=>Number.isFinite(x.t));if(valid.length>=rows.length*.6){valid.sort((a,b)=>a.t-b.t);QL.rows=valid.map(x=>x.r);QL.timeSorted=true}}
    populateControls();render();note(`${fmt(QL.rows.length,0)} dòng · ${QL.numeric.length} cột số · ${source}`);
  }
  function populateControls(){
    const p=$q('qPriceColumn'),c=$q('qCorrColumns');
    p.innerHTML=QL.numeric.map(x=>`<option value="${x.index}" ${x.index===QL.priceIndex?'selected':''}>${esc(x.name)}</option>`).join('');
    const limited=QL.numeric.slice(0,8);c.innerHTML=limited.map(x=>`<label class="ql-check"><input type="checkbox" value="${x.index}" checked><span>${esc(x.name)}</span></label>`).join('');
    populateRegressionControls(undefined,true);
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
      QL.lastRegression=null;$q('qRegOutput').hidden=true;$q('qExportOLS').disabled=true;
      const st=$q('qRegStatus');st.textContent='Thiết lập mô hình đã thay đổi. Hãy nhấn Estimate OLS để tính lại.';st.classList.remove('is-bad','is-good');
    }
  }
  function selectedColumnStats(){const i=Number($q('qPriceColumn').value);QL.priceIndex=i;return{index:i,values:getValues(i).filter(Number.isFinite)}}
  function render(){
    if(!QL.rows.length)return;
    const {index,values}=selectedColumnStats(),s=QuantStats.stats(values),ret=QuantStats.returns(getValues(index)),simple=ret.map(x=>x.simple).filter(Number.isFinite),logs=ret.map(x=>x.log).filter(Number.isFinite),rs=QuantStats.stats(logs),missing=QL.rows.length-values.length;
    $q('qMetrics').innerHTML=[['OBSERVATIONS',fmt(s.n,0),'Số giá trị hợp lệ'],['MEAN',fmt(s.mean),'Trung bình'],['STD. DEV.',fmt(s.stdDev),'Độ lệch chuẩn mẫu'],['MIN / MAX',`${fmt(s.min)} / ${fmt(s.max)}`,'Biên dữ liệu'],['MISSING · VAR',fmt(missing,0),'Biến đang chọn']].map(x=>`<div class="ql-metric"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
    const statRows=[['Số quan sát',s.n],['Trung bình (Mean)',s.mean],['Trung vị (Median)',s.median],['Phương sai mẫu (Variance)',s.variance],['Độ lệch chuẩn mẫu (Std. Dev.)',s.stdDev],['Giá trị nhỏ nhất (Min)',s.min],['Q1 · 25%',s.q1],['Q3 · 75%',s.q3],['Giá trị lớn nhất (Max)',s.max],['Skewness',s.skewness],['Excess Kurtosis',s.excessKurtosis]];
    $q('qStatsTable').innerHTML=statRows.map(([k,v])=>`<tr><td>${k}</td><td>${typeof v==='number'?fmt(v,6):'—'}</td></tr>`).join('');
    $q('qReturnStats').innerHTML=[['Simple return mean',pct(QuantStats.stats(simple).mean)],['Log return mean',pct(rs.mean)],['Log return Std. Dev.',pct(rs.stdDev)],['Positive returns',pct(simple.filter(x=>x>0).length/Math.max(1,simple.length),1)],['Best log return',pct(rs.max)],['Worst log return',pct(rs.min)],['Return observations',fmt(logs.length,0)]].map(([k,v])=>`<div class="ql-return-item"><span>${k}</span><b>${v}</b></div>`).join('');
    const corrIndices=[...$q('qCorrColumns').querySelectorAll('input:checked')].map(x=>+x.value),cols={};corrIndices.forEach(i=>cols[QL.headers[i]]=getValues(i));
    const cm=QuantStats.correlationMatrix(cols);$q('qCorrelation').innerHTML=cm.names.length?`<table class="ql-table ql-corr"><thead><tr><th>Variable</th>${cm.names.map(n=>`<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${cm.names.map((n,i)=>`<tr><th>${esc(n)}</th>${cm.values[i].map(v=>`<td class="${v>0.5?'pos':v<-.5?'neg':''}">${fmt(v,3)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="msg">Chọn ít nhất một biến số.</p>';
    drawHistogram(QuantStats.histogram(values,24));drawSeries(values);
    $q('qPreview').innerHTML=`<table class="ql-table"><thead><tr>${QL.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${QL.rows.slice(0,12).map(r=>`<tr>${QL.headers.map((h,i)=>`<td>${esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $q('qDataMeta').textContent=`Nguồn: ${QL.source} · ${QL.rows.length.toLocaleString('en-US')} dòng · ${QL.headers.length} cột · ${QL.timeIndex>=0?'đã nhận diện cột thời gian':'chưa nhận diện cột thời gian'}.`;
    $q('qAnalysisNote').textContent=`Biến đang phân tích: ${QL.headers[index]}. Lợi suất được tính theo thứ tự dòng (đã sắp theo thời gian nếu nhận diện được cột thời gian). Log return chỉ tính khi hai mức giá liên tiếp dương.`;
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
  function renderOLS(m){
    const metric=[['OBSERVATIONS',fmt(m.n,0),'Dòng đầy đủ dùng để ước lượng'],['R-SQUARED',fmt(m.r2,6),'Độ phù hợp của mô hình'],['ADJ. R-SQUARED',fmt(m.adjustedR2,6),'R² hiệu chỉnh'],['F-TEST P-VALUE',pval(m.fP),'Kiểm định ý nghĩa chung']];
    $q('qRegMetrics').innerHTML=metric.map(a=>`<div class="ql-metric"><span>${a[0]}</span><b>${a[1]}</b><small>${a[2]}</small></div>`).join('');
    $q('qRegCoefficients').innerHTML=`<table class="ql-table ql-reg-table"><thead><tr><th>Variable</th><th>Coefficient</th><th>Std. Error</th><th>t-stat</th><th>Prob.</th><th>95% CI Lower</th><th>95% CI Upper</th></tr></thead><tbody>${m.coefficients.map(c=>`<tr><th>${esc(c.name)}</th><td>${fmt(c.estimate,7)}</td><td>${fmt(c.stdError,7)}</td><td>${fmt(c.t,4)}</td><td class="${Number.isFinite(c.p)&&c.p<.05?'sig':''}">${pval(c.p)}</td><td>${fmt(c.ciLower,7)}</td><td>${fmt(c.ciUpper,7)}</td></tr>`).join('')}</tbody></table>`;
    const rows=[['Dependent variable',m.yName],['Included regressors',m.xNames.join(', ')],['Intercept',m.includeIntercept?'Yes':'No'],['Standard errors',m.robustHC1?'HC1 heteroskedasticity-consistent':'Classical OLS'],['Residual degrees of freedom',m.dfResidual],['Model degrees of freedom',m.dfModel],['F-statistic',fmt(m.fStat,6)],['Prob. (F-statistic)',pval(m.fP)],['SSE',fmt(m.sse,7)],['RMSE',fmt(m.rmse,7)],['Residual Std. Error',fmt(m.residualStdError,7)]];
    $q('qRegSummary').innerHTML=`<table class="ql-table"><tbody>${rows.map(([a,b])=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
    const d=m.diagnostics,bp=d.breuschPagan;
    const diag=[['Durbin–Watson',fmt(d.durbinWatson,4),'Gần 2 là dấu hiệu sơ bộ ít tự tương quan bậc 1; không phải kết luận đầy đủ.'],['Jarque–Bera statistic',fmt(d.jarqueBera,4),`p-value: ${pval(d.jarqueBeraP)}`],['Breusch–Pagan LM',bp?fmt(bp.lm,4):'—',bp?`df=${bp.df}; p-value: ${pval(bp.p)}`:'Không ước lượng được kiểm định phụ trợ.'],['Mean residual',fmt(m.residuals.reduce((a,b)=>a+b,0)/m.n,8),'Với mô hình có intercept, tổng phần dư xấp xỉ 0.'],...d.vif.map((v,i)=>[`VIF · ${m.xNames[i]}`,Number.isFinite(v.vif)?fmt(v.vif,4):'∞',v.vif>=10?'Đa cộng tuyến đáng lưu ý (ngưỡng tham khảo 10).':v.vif>=5?'Cần xem xét đa cộng tuyến (ngưỡng tham khảo 5).':'Không vượt ngưỡng tham khảo 5.'])];
    $q('qRegDiagnostics').innerHTML=`<table class="ql-table"><thead><tr><th>Diagnostic</th><th>Value</th><th>Interpretation / p-value</th></tr></thead><tbody>${diag.map(([a,b,c])=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</tbody></table>`;
    $q('qRegNote').textContent=`Mô hình: ${m.yName} ~ ${m.xNames.join(' + ')}${m.includeIntercept?' + Intercept':''}. Chỉ các dòng có dữ liệu hợp lệ ở Y và toàn bộ X được dùng (listwise deletion). ${m.robustHC1?'HC1 chỉ điều chỉnh ma trận phương sai–hiệp phương sai và suy luận từng hệ số; F-test tổng thể đang hiển thị là F-test OLS cổ điển.':'Sai số chuẩn và kiểm định hệ số dùng giả định OLS cổ điển.'} Breusch–Pagan và Jarque–Bera dùng xấp xỉ tiệm cận; Durbin–Watson là chỉ báo sơ bộ. HC1 không xử lý tự tương quan. Nếu hồi quy Close theo Open/High/Low của chính cây nến đó, đây là phân tích mô tả chứ không phải dự báo realtime vì High/Low chỉ biết sau khi nến hình thành. Kết quả không tự chứng minh quan hệ nhân quả hay khả năng dự báo.`;
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
  function drawHistogram(bins){const cv=$q('qHistogram');if(!cv)return;const dpr=devicePixelRatio||1,w=cv.clientWidth||500,h=220;cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);if(!bins.length)return;const max=Math.max(1,...bins.map(b=>b.count)),pad={l:36,r:12,t:12,b:30},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;const styles=getComputedStyle(document.documentElement),bar=styles.getPropertyValue('--acc').trim()||'#d8aa4c',mut=styles.getPropertyValue('--mut').trim()||'#9b927d',line=styles.getPropertyValue('--line').trim()||'#555';c.strokeStyle=line;c.beginPath();c.moveTo(pad.l,pad.t);c.lineTo(pad.l,h-pad.b);c.lineTo(w-pad.r,h-pad.b);c.stroke();const gap=2,bw=pw/bins.length;bins.forEach((b,i)=>{const bh=b.count/max*(ph-4);c.fillStyle=bar;c.globalAlpha=.78;c.fillRect(pad.l+i*bw+gap/2,h-pad.b-bh,Math.max(1,bw-gap),bh)});c.globalAlpha=1;c.fillStyle=mut;c.font='10px Space Grotesk, sans-serif';c.fillText(String(bins[0].x0.toFixed(3)),pad.l,h-9);c.fillText(String(bins[bins.length-1].x1.toFixed(3)),w-pad.r-54,h-9);c.fillText(String(max),5,pad.t+8);}
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
    $q('qCorrColumns').addEventListener('change',()=>{if(QL.rows.length)render()});
    $q('qRegY').addEventListener('change',()=>populateRegressionControls());
    $q('qRunOLS').addEventListener('click',runOLS);
    $q('qRegX').addEventListener('change',invalidateOLS);
    $q('qRegIntercept').addEventListener('change',invalidateOLS);
    $q('qRegHC1').addEventListener('change',invalidateOLS);
    $q('qRegDemo').addEventListener('click',()=>{try{regressionDemo()}catch(e){note(e.message,true)}});
    $q('qExportOLS').addEventListener('click',exportOLS);
    window.addEventListener('resize',()=>{if(QL.rows.length){const i=QL.priceIndex;drawHistogram(QuantStats.histogram(getValues(i).filter(Number.isFinite),24));drawSeries(getValues(i));if(QL.lastRegression)drawResidualPlot(QL.lastRegression.fitted,QL.lastRegression.residuals)}});
    demo();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
