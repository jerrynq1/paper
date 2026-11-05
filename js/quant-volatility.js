/* Quantitative Research · Phase 4 Conditional Volatility Models
 * Browser-only ARCH/GARCH family: ARCH(q), GARCH(1,1), EGARCH(1,1), GJR-GARCH(1,1), TARCH-Zakoian(1,1).
 * Estimates constant-mean return models by conditional Gaussian or standardized Student-t ML.
 * No DOM dependency. Estimates are research-grade MVP outputs, not a certified econometrics package.
 */
(function(root,factory){
  const regression = typeof module==='object'&&module.exports ? require('./quant-regression.js') : root.QuantRegression;
  const api=factory(regression);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuantVolatility=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(QuantRegression){
  'use strict';
  const sum=a=>a.reduce((s,x)=>s+x,0);
  const mean=a=>a.length?sum(a)/a.length:NaN;
  const sampleVariance=a=>{const m=mean(a);return a.length>1?sum(a.map(v=>(v-m)**2))/(a.length-1):NaN};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const sigmoid=x=>x>=0?1/(1+Math.exp(-Math.min(x,35))):Math.exp(Math.max(x,-35))/(1+Math.exp(Math.max(x,-35)));
  const logit=p=>Math.log(clamp(p,1e-8,1-1e-8)/(1-clamp(p,1e-8,1-1e-8)));
  const softplus=x=>x>30?x:Math.log1p(Math.exp(clamp(x,-35,35)));
  const logSumExpWeights=xs=>{const m=Math.max(...xs);const e=xs.map(v=>Math.exp(v-m));const s=sum(e);return e.map(v=>v/s)};
  const LOG2PI=Math.log(2*Math.PI), SQRT2PI=Math.sqrt(2/Math.PI);

  function cleanReturns(values){
    if(!Array.isArray(values)||values.length<100)throw new Error('Phase 4 cần ít nhất 100 quan sát lợi suất; khuyến nghị 500–1.000 trở lên.');
    const x=values.map(v=>v===null||v===undefined||String(v).trim()===''?NaN:Number(v));
    const bad=[];x.forEach((v,i)=>{if(!Number.isFinite(v))bad.push(i+1)});
    if(bad.length)throw new Error(`Chuỗi lợi suất có ${bad.length} giá trị thiếu/không hợp lệ (ví dụ vị trí ${bad.slice(0,5).join(', ')}). Không tự xóa dòng vì sẽ phá vỡ thứ tự thời gian.`);
    if(x.length>30000)throw new Error('Phase 4 browser MVP giới hạn 30.000 lợi suất mỗi lần fit để tránh treo trình duyệt. Hãy chọn mẫu ngắn hơn hoặc dùng backend ở giai đoạn sau.');
    const v=sampleVariance(x);if(!(v>1e-14))throw new Error('Lợi suất gần như không biến thiên; không thể ước lượng conditional volatility.');
    return x;
  }
  function logReturnsFromPrices(prices){
    if(!Array.isArray(prices)||prices.length<101)throw new Error('Cần ít nhất 101 mức giá dương để tạo 100 log returns.');
    const p=prices.map(Number);for(let i=0;i<p.length;i++)if(!Number.isFinite(p[i])||p[i]<=0)throw new Error(`Giá phải là số dương và hợp lệ (vị trí ${i+1}).`);
    const r=[];for(let i=1;i<p.length;i++)r.push(Math.log(p[i]/p[i-1])*100);
    return{returnsPct:r,priceObservations:p.length,returnObservations:r.length,unit:'percent'};
  }
  // Lanczos log-gamma approximation, used by the standardized Student-t likelihood.
  function logGamma(z){
    const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-0.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
    if(z<0.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z-=1;let x=0.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
    const t=z+c.length-0.5;return 0.5*LOG2PI+(z+0.5)*Math.log(t)-t+Math.log(x);
  }
  function expectedAbsStandardT(nu){return Math.sqrt(nu-2)/Math.sqrt(Math.PI)*Math.exp(logGamma((nu-1)/2)-logGamma(nu/2));}
  function studentLogConstant(nu){return logGamma((nu+1)/2)-logGamma(nu/2)-0.5*Math.log(Math.PI*(nu-2));}
  function softmax(xs){return logSumExpWeights(xs)}

  function nelderMead(objective,start,options={}){
    const n=start.length,maxIter=options.maxIter||1400,tol=options.tol||1e-7,steps=options.steps||start.map(v=>Math.max(.05,Math.abs(v)*.08));
    let simplex=[start.slice()];for(let i=0;i<n;i++){const p=start.slice();p[i]+=steps[i]||.05;simplex.push(p)}
    let vals=simplex.map(objective),iter=0;
    const sort=()=>{const z=simplex.map((p,i)=>({p,v:vals[i]})).sort((a,b)=>a.v-b.v);simplex=z.map(x=>x.p);vals=z.map(x=>x.v)};
    for(;iter<maxIter;iter++){
      sort();const spread=Math.max(...vals.map(v=>Math.abs(v-vals[0])));let diameter=0;
      for(let i=1;i<simplex.length;i++)for(let j=0;j<n;j++)diameter=Math.max(diameter,Math.abs(simplex[i][j]-simplex[0][j]));
      if(spread<tol&&diameter<Math.sqrt(tol))break;
      const centroid=Array(n).fill(0);for(let i=0;i<n;i++)for(let j=0;j<n;j++)centroid[j]+=simplex[i][j]/n;
      const worst=simplex[n],reflect=centroid.map((v,j)=>v+(v-worst[j])),fr=objective(reflect);
      if(fr<vals[0]){const expand=centroid.map((v,j)=>v+2*(reflect[j]-v)),fe=objective(expand);if(fe<fr){simplex[n]=expand;vals[n]=fe}else{simplex[n]=reflect;vals[n]=fr}}
      else if(fr<vals[n-1]){simplex[n]=reflect;vals[n]=fr}
      else{const outside=fr<vals[n],contract=centroid.map((v,j)=>outside?v+.5*(reflect[j]-v):v+.5*(worst[j]-v)),fc=objective(contract);if(fc<(outside?fr:vals[n])){simplex[n]=contract;vals[n]=fc}else{for(let i=1;i<simplex.length;i++){simplex[i]=simplex[0].map((v,j)=>v+.5*(simplex[i][j]-v));vals[i]=objective(simplex[i])}}}
    }
    sort();return{params:simplex[0],value:vals[0],iterations:iter,converged:iter<maxIter};
  }
  function decodeParams(theta,model,order,distribution){
    let k=0;const mu=theta[k++],omega=model==='EGARCH'?theta[k++]:Math.exp(clamp(theta[k++],-30,20));let out={mu,omega};
    if(model==='ARCH'){
      const persistence=.995*sigmoid(theta[k++]),w=softmax(theta.slice(k,k+order));k+=order;
      out.alpha=w.map(v=>persistence*v);out.persistence=sum(out.alpha);
    }else if(model==='GARCH'){
      const persistence=.999*sigmoid(theta[k++]),share=sigmoid(theta[k++]);out.alpha=persistence*share;out.beta=persistence-out.alpha;out.persistence=persistence;
    }else if(model==='GJR-GARCH'){
      const persistence=.999*sigmoid(theta[k++]),w=softmax(theta.slice(k,k+3));out.alpha=persistence*w[0];out.beta=persistence*w[1];out.gamma=2*persistence*w[2];out.persistence=out.alpha+out.beta+out.gamma/2;
    }else if(model==='TARCH'){
      const persistence=.999*sigmoid(theta[k++]),betaShare=sigmoid(theta[k++]),shock=persistence*(1-betaShare),eAbs=SQRT2PI,totalAB=2*shock/eAbs,goodShare=sigmoid(theta[k++]);
      out.beta=persistence*betaShare;out.alpha=totalAB*goodShare;out.gamma=totalAB-2*out.alpha;out.persistence=out.beta+(distribution==='student-t'?expectedAbsStandardT(out.nu||8):SQRT2PI)*(2*out.alpha+out.gamma)/2;
    }else if(model==='EGARCH'){
      out.alpha=theta[k++];out.gamma=theta[k++];out.beta=.995*Math.tanh(theta[k++]);out.persistence=out.beta;
    }
    if(distribution==='student-t'){out.nu=2.05+197.95*sigmoid(theta[k++]);if(model==='TARCH')out.persistence=out.beta+expectedAbsStandardT(out.nu)*(2*out.alpha+out.gamma)/2;}
    return out;
  }
  function makeStart(model,order,distribution,mu,v){
    const start=[mu,Math.log(Math.max(v*.05,1e-9))];
    if(model==='ARCH'){
      const persistence=.18;start.push(logit(persistence/.995));for(let i=0;i<order;i++)start.push(0);
    }else if(model==='GARCH'){
      const persistence=.95,alpha=.08;start.push(logit(persistence/.999),logit(alpha/persistence));
    }else if(model==='GJR-GARCH'){
      const persistence=.95,parts=[.05,.85,.05];start.push(logit(persistence/.999),...parts.map(x=>Math.log(x/parts[1])));
    }else if(model==='TARCH'){
      const persistence=.92,beta=.82;start[1]=Math.log(Math.max(Math.sqrt(v)*.05,1e-8));start.push(logit(persistence/.999),logit(beta/persistence),logit(.5));
    }else if(model==='EGARCH'){
      const beta=.92;start[1]=Math.log(Math.max(v,1e-9))*(1-beta);start.push(.12,-.05,Math.atanh(beta/.995));
    }
    if(distribution==='student-t')start.push(logit((8-2.05)/197.95));
    return start;
  }
  function conditionalVariance(errors,params,model,order,distribution){
    const n=errors.length,h=Array(n).fill(0),z=Array(n).fill(0),v=Math.max(sampleVariance(errors),1e-10),eAbs=distribution==='student-t'?expectedAbsStandardT(params.nu):SQRT2PI;
    h[0]=v;z[0]=errors[0]/Math.sqrt(h[0]);
    for(let t=1;t<n;t++){
      let next;
      if(model==='ARCH'){
        next=params.omega;for(let j=1;j<=order;j++){const e=t-j>=0?errors[t-j]:Math.sqrt(v);next+=params.alpha[j-1]*e*e;}
      }else if(model==='GARCH'){
        next=params.omega+params.alpha*errors[t-1]**2+params.beta*h[t-1];
      }else if(model==='GJR-GARCH'){
        const e=errors[t-1];next=params.omega+params.alpha*e*e+params.gamma*(e<0?e*e:0)+params.beta*h[t-1];
      }else if(model==='TARCH'){
        const e=errors[t-1],sigma=params.omega+params.alpha*Math.abs(e)+params.gamma*(e<0?Math.abs(e):0)+params.beta*Math.sqrt(h[t-1]);next=sigma*sigma;
      }else{
        const prevZ=z[t-1];const logh=params.omega+params.alpha*(Math.abs(prevZ)-eAbs)+params.gamma*prevZ+params.beta*Math.log(h[t-1]);
        next=Math.exp(clamp(logh,-25,20));
      }
      if(!Number.isFinite(next)||next<=1e-12||next>1e12)return null;
      h[t]=next;z[t]=errors[t]/Math.sqrt(next);
    }
    return{variance:h,standardized:z};
  }
  function negativeLogLikelihood(y,params,model,order,distribution){
    const errors=y.map(v=>v-params.mu),state=conditionalVariance(errors,params,model,order,distribution);if(!state)return 1e100;
    const n=y.length,nu=params.nu;let nll=0;
    if(distribution==='student-t'){
      const c=studentLogConstant(nu);for(let i=0;i<n;i++){const z2=errors[i]**2/state.variance[i];nll+=.5*Math.log(state.variance[i])-c+.5*(nu+1)*Math.log1p(z2/(nu-2));}
    }else{
      for(let i=0;i<n;i++)nll+=.5*(LOG2PI+Math.log(state.variance[i])+errors[i]**2/state.variance[i]);
    }
    return Number.isFinite(nll)?nll/n:1e100;
  }
  function fit(model,values,options={}){
    const y=cleanReturns(values),v=sampleVariance(y),mu0=mean(y),distribution=options.distribution==='student-t'?'student-t':'gaussian';
    const order=model==='ARCH'?Number(options.q??1):1;
    if(!['ARCH','GARCH','EGARCH','GJR-GARCH','TARCH'].includes(model))throw new Error('Model không được hỗ trợ trong Phase 4.');
    if(options.distribution!==undefined&&!['gaussian','student-t'].includes(options.distribution))throw new Error('Innovation distribution chỉ hỗ trợ gaussian hoặc student-t.');
    if(model==='ARCH'&&(!Number.isInteger(order)||order<1||order>5))throw new Error('ARCH order q phải là số nguyên từ 1 đến 5.');
    const maxIter=clamp(Math.floor(Number(options.maxIter)||1400),200,4000);
    const start=makeStart(model,order,distribution,mu0,v),objective=theta=>{
      try{const p=decodeParams(theta,model,order,distribution);if(model!=='EGARCH'&&!(p.omega>0))return 1e100;return negativeLogLikelihood(y,p,model,order,distribution)}catch(_){return 1e100}
    };
    const opt=nelderMead(objective,start,{maxIter,tol:1e-7});
    const params=decodeParams(opt.params,model,order,distribution),errors=y.map(v=>v-params.mu),state=conditionalVariance(errors,params,model,order,distribution);
    if(!state||!Number.isFinite(opt.value)||opt.value>=1e90)throw new Error('Optimizer không tìm được phương sai hợp lệ. Hãy kiểm tra dữ liệu hoặc thử Gaussian/GARCH(1,1).');
    if(model!=='EGARCH'&&params.persistence>=1)throw new Error('Ước lượng vi phạm điều kiện persistence < 1.');
    const ll=-opt.value*y.length,k=opt.params.length,aic=-2*ll+2*k,bic=-2*ll+Math.log(y.length)*k;
    const last=y.length-1,annualFactor=Number(options.annualFactor??(252*24*60)),horizon=Number(options.horizon??12);
    if(!Number.isInteger(annualFactor)||annualFactor<1||annualFactor>1000000)throw new Error('Annualization factor phải là số nguyên từ 1 đến 1.000.000.');
    const forecast=forecastVariance(model,params,errors,state.variance,order,distribution,horizon,annualFactor);
    const std=state.standardized,lb=ljungBox(std,Math.min(20,Math.max(5,Math.floor(Math.sqrt(y.length)))),0),archLm=archEffectTest(std,Math.min(10,Math.max(2,Math.floor(Math.sqrt(y.length)))));
    // EGARCH exp(E[log h]) is a median/plug-in proxy, not E[h] (Jensen inequality).
    const unconditionalVariance=['EGARCH','TARCH'].includes(model)?NaN:params.persistence<1?params.omega/(1-params.persistence):NaN;
    const medianVarianceProxy=model==='EGARCH'?Math.exp(params.omega/(1-params.beta)):NaN;
    const longRunVolatilityPct=model==='TARCH'?params.omega/(1-params.persistence):model==='EGARCH'?Math.sqrt(medianVarianceProxy):Number.isFinite(unconditionalVariance)&&unconditionalVariance>0?Math.sqrt(unconditionalVariance):NaN;
    const persistence=params.persistence,halfLife=persistence>0&&persistence<1?Math.log(.5)/Math.log(persistence):NaN;
    const parameterRows=[{name:'Mean (μ)',value:params.mu,unit:'return %'} ,{name:'Omega (ω)',value:params.omega,unit:model==='EGARCH'?'log-variance intercept':model==='TARCH'?'standard deviation (%)':'variance (%²)'}];
    if(model==='ARCH')params.alpha.forEach((x,i)=>parameterRows.push({name:`ARCH α${i+1}`,value:x,unit:'—'}));
    if(model==='GARCH')parameterRows.push({name:'ARCH α1',value:params.alpha,unit:'—'},{name:'GARCH β1',value:params.beta,unit:'—'});
    if(model==='GJR-GARCH')parameterRows.push({name:'ARCH α1',value:params.alpha,unit:'—'},{name:'Leverage γ1',value:params.gamma,unit:'—'},{name:'GARCH β1',value:params.beta,unit:'—'});
    if(model==='TARCH')parameterRows.push({name:'Good-news α1',value:params.alpha,unit:'—'},{name:'Threshold γ1',value:params.gamma,unit:'—'},{name:'GARCH β1',value:params.beta,unit:'—'});
    if(model==='EGARCH')parameterRows.push({name:'Magnitude α',value:params.alpha,unit:'—'},{name:'Sign γ',value:params.gamma,unit:'—'},{name:'GARCH β',value:params.beta,unit:'—'});
    if(distribution==='student-t')parameterRows.push({name:'Degrees of freedom (ν)',value:params.nu,unit:'df'});
    const residualSummary={mean:mean(std),std:Math.sqrt(sampleVariance(std)),skewness:skewness(std),excessKurtosis:excessKurtosis(std)};
    return{
      model,order:model==='ARCH'?{q:order}:{p:1,q:1},distribution,n:y.length,parameters:parameterRows,rawParameters:params,
      logLikelihood:ll,aic,bic,optimizer:{converged:opt.converged,iterations:opt.iterations,objectivePerObservation:opt.value},
      persistence,halfLife,unconditionalVariance,medianVarianceProxy,longRunVolatilityPct,medianVolatilityProxyPct:model==='EGARCH'?Math.sqrt(medianVarianceProxy):NaN,
      lastConditionalVariance:state.variance[last],lastConditionalVolatilityPct:Math.sqrt(state.variance[last]),
      annualizedLastVolPct:Math.sqrt(state.variance[last]*annualFactor),annualFactor,
      standardizedResiduals:std,conditionalVariance:state.variance,conditionalVolatilityPct:state.variance.map(Math.sqrt),
      residualSummary,diagnostics:{standardizedResidualLjungBox:lb,archLm},forecast,
      notes:[
        'Biến đầu vào là log return theo đơn vị phần trăm; mô hình ước lượng phương trình trung bình hằng số và phương sai có điều kiện.',
        'Ước lượng dùng conditional maximum likelihood với Gaussian QMLE hoặc standardized Student-t; bộ tối ưu browser-side là Nelder–Mead, chưa tính ma trận Hessian/sai số chuẩn tham số.',
        model==='EGARCH'?'EGARCH dự báo nhiều bước dùng plug-in trên log variance; exp(E[log h]) là median proxy và có thể thấp hơn E[h] do Jensen.':model==='TARCH'?'TARCH forecast nhiều bước dùng plug-in cho kỳ vọng độ lệch chuẩn; bình phương kỳ vọng không bằng chính xác kỳ vọng phương sai.':'Các hệ số persistence bị ràng buộc dưới 1 trong quá trình tối ưu để bảo đảm miền dừng bậc hai của đặc tả đối xứng tương ứng.',
        'Annualization factor mặc định 252×24×60 chỉ là quy ước quy đổi cho M1 liên tục; nên đổi theo giờ giao dịch thực tế và quy tắc session của nguồn dữ liệu.',
        'Đây là browser MVP nghiên cứu. Cần cross-check bằng arch/statsmodels/R/rugarch và walk-forward trên dữ liệu độc lập trước khi dùng quyết định giao dịch.'
      ]
    };
  }
  function forecastVariance(model,p,errors,histVariance,order,distribution,horizon,annualFactor=252*24*60){
    if(!Number.isInteger(horizon)||horizon<1||horizon>100)throw new Error('Forecast steps phải là số nguyên từ 1 đến 100.');
    const n=errors.length,last=n-1,rows=[],lastH=histVariance[last],lastZ=errors[last]/Math.sqrt(lastH),eAbs=distribution==='student-t'?expectedAbsStandardT(p.nu):SQRT2PI;
    let future=[];
    for(let h=1;h<=horizon;h++){
      let v;
      if(model==='GARCH')v=p.omega+p.beta*(h===1?lastH:future[h-2])+p.alpha*(h===1?errors[last]**2:future[h-2]);
      else if(model==='GJR-GARCH'){
        const persistenceExpected=p.alpha+p.beta+p.gamma/2;
        v=h===1?p.omega+p.alpha*errors[last]**2+p.gamma*(errors[last]<0?errors[last]**2:0)+p.beta*lastH:p.omega+persistenceExpected*future[h-2];
      }else if(model==='TARCH'){
        const sigma=h===1?p.omega+p.alpha*Math.abs(errors[last])+p.gamma*(errors[last]<0?Math.abs(errors[last]):0)+p.beta*Math.sqrt(lastH):p.omega+p.persistence*Math.sqrt(future[h-2]);v=sigma*sigma;
      }else if(model==='ARCH'){
        v=p.omega;for(let j=1;j<=order;j++){const idx=h-j;if(idx<=0){const e=errors[n+idx-1];v+=p.alpha[j-1]*(Number.isFinite(e)?e*e:sampleVariance(errors))}else v+=p.alpha[j-1]*(future[idx-1]||sampleVariance(errors));}
      }else{
        const logv=h===1?p.omega+p.alpha*(Math.abs(lastZ)-eAbs)+p.gamma*lastZ+p.beta*Math.log(lastH):p.omega+p.beta*Math.log(future[h-2]);
        v=Math.exp(clamp(logv,-25,20));
      }
      if(!(v>0&&Number.isFinite(v)))throw new Error('Phương sai dự báo không hợp lệ; hãy kiểm tra hội tụ hoặc thử mô hình khác.');
      future.push(v);rows.push({step:h,conditionalVariancePct2:v,conditionalVolatilityPct:Math.sqrt(v),annualizedVolatilityPct:Math.sqrt(v*annualFactor),meanReturnPct:p.mu});
    }
    return rows;
  }
  function acf(x,maxLag){const n=x.length,m=mean(x),z=x.map(v=>v-m),den=sum(z.map(v=>v*v));if(!(den>0))return Array(maxLag).fill(0);const out=[1];for(let k=1;k<=maxLag;k++){let c=0;for(let i=k;i<n;i++)c+=z[i]*z[i-k];out.push(c/den)}return out}
  function ljungBox(x,maxLag,modelDf=0){const n=x.length,m=Math.max(1,Math.min(maxLag,n-2)),r=acf(x,m);let q=0;for(let k=1;k<=m;k++)q+=r[k]*r[k]/(n-k);q*=n*(n+2);const df=m-modelDf;return{statistic:q,df,pValue:df>0&&QuantRegression?QuantRegression.regularizedGammaQ(df/2,q/2):NaN,lags:m}}
  function archEffectTest(z,maxLag){
    const x=z.map(v=>v*v),n=x.length,m=Math.max(1,Math.min(maxLag,Math.floor(n/5),n-3));
    const y=x.slice(m),cols=[];for(let k=1;k<=m;k++)cols.push({name:`lag${k}`,values:x.slice(m-k,n-k)});
    try{const fit=QuantRegression.ols({yValues:y,xColumns:cols,includeIntercept:true});const lm=fit.n*fit.r2;return{statistic:lm,df:m,pValue:QuantRegression.regularizedGammaQ(m/2,lm/2),lags:m,rSquared:fit.r2};}catch(e){return{error:e.message,statistic:NaN,df:m,pValue:NaN,lags:m}}
  }
  function skewness(x){const m=mean(x),s=Math.sqrt(sampleVariance(x));return s>0?mean(x.map(v=>((v-m)/s)**3)):NaN}
  function excessKurtosis(x){const m=mean(x),s=Math.sqrt(sampleVariance(x));return s>0?mean(x.map(v=>((v-m)/s)**4))-3:NaN}
  function diagnoseReturns(values){const x=cleanReturns(values),d=acf(x,Math.min(20,x.length-2)),abs=acf(x.map(Math.abs),Math.min(20,x.length-2)),sq=acf(x.map(v=>v*v),Math.min(20,x.length-2));return{n:x.length,mean:mean(x),std:Math.sqrt(sampleVariance(x)),skewness:skewness(x),excessKurtosis:excessKurtosis(x),returnAcf:d.slice(1),absoluteReturnAcf:abs.slice(1),squaredReturnAcf:sq.slice(1),absoluteReturnLjungBox:ljungBox(x.map(Math.abs),Math.min(20,x.length-2)),squaredReturnLjungBox:ljungBox(x.map(v=>v*v),Math.min(20,x.length-2))}}
  return{cleanReturns,logReturnsFromPrices,fit,diagnoseReturns,expectedAbsStandardT,logGamma};
});
