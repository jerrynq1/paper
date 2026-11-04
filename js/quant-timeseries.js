/* Quantitative Research · Phase 3 Time Series
 * Browser-side teaching/analysis engine: ACF/PACF, ADF/PP, differencing, AR/MA/ARMA/ARIMA.
 * No DOM dependency. PP/ADF report test statistics and asymptotic critical values, not approximate p-values.
 */
(function(root,factory){
  const regression = typeof module==='object'&&module.exports ? require('./quant-regression.js') : root.QuantRegression;
  const api=factory(regression);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuantTimeSeries=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(QuantRegression){
  'use strict';
  const sum=a=>a.reduce((s,x)=>s+x,0);
  const mean=a=>a.length?sum(a)/a.length:NaN;
  const variance=a=>{const m=mean(a);return a.length>1?sum(a.map(x=>(x-m)**2))/(a.length-1):NaN};
  const cleanSeries=values=>{
    if(!Array.isArray(values)||values.length<3)throw new Error('Chuỗi thời gian cần ít nhất 3 quan sát.');
    const a=values.map(v=>v===null||v===undefined||String(v).trim()===''?NaN:Number(v));const bad=[];
    a.forEach((v,i)=>{if(!Number.isFinite(v))bad.push(i+1)});
    if(bad.length)throw new Error(`Chuỗi có ${bad.length} giá trị thiếu/không hợp lệ (ví dụ dòng ${bad.slice(0,5).join(', ')}). Không tự động bỏ dòng vì sẽ làm sai khoảng cách thời gian; hãy xử lý dữ liệu trước.`);
    if(a.length>100000)throw new Error('Giới hạn thử nghiệm: tối đa 100.000 quan sát cho phân tích chuỗi thời gian.');
    return a;
  };
  function difference(values,order=1){
    let out=cleanSeries(values);const d=Math.max(0,Math.min(2,Math.floor(Number(order)||0)));
    for(let k=0;k<d;k++)out=out.slice(1).map((v,i)=>v-out[i]);
    return out;
  }
  function acf(values,maxLag=24){
    const x=cleanSeries(values),n=x.length,m=mean(x),z=x.map(v=>v-m),den=sum(z.map(v=>v*v));
    if(!(den>0))throw new Error('Chuỗi không biến thiên; không thể tính ACF/PACF.');
    const L=Math.max(0,Math.min(Math.floor(Number(maxLag)||0),n-2,200));
    const out=[1];for(let lag=1;lag<=L;lag++){let c=0;for(let t=lag;t<n;t++)c+=z[t]*z[t-lag];out.push(c/den)}
    return out;
  }
  function pacf(values,maxLag=24){
    const r=acf(values,maxLag),L=r.length-1,out=[1];let prev=[];
    for(let k=1;k<=L;k++){
      let num=r[k];for(let j=1;j<k;j++)num-=prev[j-1]*r[k-j];
      let den=1;for(let j=1;j<k;j++)den-=prev[j-1]*r[j];
      const phi=Math.abs(den)>1e-12?num/den:NaN;
      const curr=Array(k).fill(0);for(let j=1;j<k;j++)curr[j-1]=prev[j-1]-phi*prev[k-j-1];curr[k-1]=phi;
      out.push(phi);prev=curr;
    }
    return out;
  }
  function informationCriteria(sse,n,k){
    if(!(sse>0&&n>0))return{aic:NaN,bic:NaN};
    const base=n*Math.log(sse/n);return{aic:base+2*k,bic:base+k*Math.log(n)};
  }
  // Durand-Kerner roots for low-order real polynomials, coefficients in ascending powers.
  function polynomialRootModuli(coefficients){
    const c=coefficients.slice();while(c.length>1&&Math.abs(c[c.length-1])<1e-14)c.pop();const degree=c.length-1;
    if(degree===0)return{moduli:[],converged:true};
    const lead=c[degree],a=c.map(v=>v/lead),radius=1+Math.max(...a.slice(0,-1).map(Math.abs));
    let roots=Array.from({length:degree},(_,i)=>{const angle=2*Math.PI*(i+.5)/degree;return{re:radius*Math.cos(angle),im:radius*Math.sin(angle)}});
    const add=(x,y)=>({re:x.re+y.re,im:x.im+y.im}),sub=(x,y)=>({re:x.re-y.re,im:x.im-y.im}),mul=(x,y)=>({re:x.re*y.re-x.im*y.im,im:x.re*y.im+x.im*y.re}),div=(x,y)=>{const den=y.re*y.re+y.im*y.im;return den<1e-28?{re:0,im:0}:{re:(x.re*y.re+x.im*y.im)/den,im:(x.im*y.re-x.re*y.im)/den}};
    const evalPoly=z=>{let v={re:a[degree],im:0};for(let k=degree-1;k>=0;k--)v=add(mul(v,z),{re:a[k],im:0});return v};
    let converged=false;
    for(let iter=0;iter<1200;iter++){
      let maxDelta=0;const next=roots.map((r,i)=>{
        let den={re:1,im:0};for(let j=0;j<degree;j++)if(j!==i)den=mul(den,sub(r,roots[j]));
        const delta=div(evalPoly(r),den),nr=sub(r,delta);maxDelta=Math.max(maxDelta,Math.hypot(delta.re,delta.im));return nr;
      });roots=next;if(maxDelta<1e-10){converged=true;break;}
    }
    return{moduli:roots.map(r=>Math.hypot(r.re,r.im)),converged};
  }
  function armaRootDiagnostics(params,p,q){
    const phi=params.slice(1,1+p),theta=params.slice(1+p,1+p+q);
    const ar=p?polynomialRootModuli([1,...phi.map(v=>-v)]):{moduli:[],converged:true};
    const ma=q?polynomialRootModuli([1,...theta]):{moduli:[],converged:true};
    const tol=1e-5;
    return{arRootModuli:ar.moduli,maRootModuli:ma.moduli,arRootsConverged:ar.converged,maRootsConverged:ma.converged,stationary:!p||(ar.converged&&ar.moduli.every(v=>v>1+tol)),invertible:!q||(ma.converged&&ma.moduli.every(v=>v>1+tol))};
  }
  function armaImpulseResponse(params,p,q,horizon){
    const phi=params.slice(1,1+p),theta=params.slice(1+p,1+p+q),psi=Array(Math.max(1,horizon)).fill(0);psi[0]=1;
    for(let k=1;k<psi.length;k++){let value=k<=q?theta[k-1]:0;for(let j=1;j<=Math.min(p,k);j++)value+=phi[j-1]*psi[k-j];psi[k]=value;}
    return psi;
  }
  function integratedImpulseResponse(psi,d){
    let out=psi.slice();for(let order=0;order<d;order++){let cumulative=0;out=out.map(v=>(cumulative+=v));}return out;
  }
  const CRITICAL={none:{'1%':-2.58,'5%':-1.95,'10%':-1.62},constant:{'1%':-3.43,'5%':-2.86,'10%':-2.57},trend:{'1%':-3.96,'5%':-3.41,'10%':-3.12}};
  function deterministicColumns(levels,indices,deterministic){
    const cols=[];
    if(deterministic==='constant'||deterministic==='trend')cols.push({name:'Intercept',values:indices.map(()=>1)});
    if(deterministic==='trend')cols.push({name:'Trend',values:indices.map((_,i)=>i+1)});
    cols.push({name:'LaggedLevel',values:indices.map(i=>levels[i])});
    return cols;
  }
  function adfAtLag(x,lag,deterministic,commonMaxLag=lag){
    const dy=x.slice(1).map((v,i)=>v-x[i]),start=commonMaxLag,indices=[];
    for(let k=start;k<dy.length;k++)indices.push(k);
    if(indices.length<12)throw new Error('Không đủ quan sát cho ADF với số lag đã chọn.');
    const cols=deterministicColumns(x,indices,deterministic);
    for(let j=1;j<=lag;j++)cols.push({name:`DeltaLag${j}`,values:indices.map(k=>dy[k-j])});
    const fit=QuantRegression.ols({yValues:indices.map(k=>dy[k]),xColumns:cols,includeIntercept:false});
    const levelIndex=(deterministic==='constant'?1:deterministic==='trend'?2:0);
    const coef=fit.coefficients[levelIndex];
    const ic=informationCriteria(fit.sse,fit.n,fit.k+1);
    return{statistic:coef.t,lag,n:fit.n,coefficient:coef.estimate,stdError:coef.stdError,sse:fit.sse,aic:ic.aic,bic:ic.bic,critical:CRITICAL[deterministic],deterministic,fit};
  }
  function adf(values,options={}){
    const x=cleanSeries(values),det=options.deterministic||'constant',rawLag=options.maxLag,maxAllowed=Math.max(0,Math.min(20,Math.floor(12*Math.pow(x.length/100,.25)),x.length-15)),requested=rawLag===undefined||rawLag===null||rawLag==='auto'?maxAllowed:Math.max(0,Math.floor(Number(rawLag)||0)),maxLag=Math.min(maxAllowed,requested);
    if(!CRITICAL[det])throw new Error('Deterministic term không hợp lệ.');
    if(x.length<30)throw new Error('ADF nên có ít nhất 30 quan sát; hiện tại chuỗi quá ngắn.');
    const candidates=[];for(let lag=0;lag<=maxLag;lag++){try{candidates.push(adfAtLag(x,lag,det,maxLag))}catch(e){if(lag===0)throw e}}
    if(!candidates.length)throw new Error('Không thể ước lượng hồi quy ADF.');
    const criterion=options.criterion==='aic'?'aic':'bic';candidates.sort((a,b)=>a[criterion]-b[criterion]);
    const selected=candidates[0];
    // Compare lag candidates on a common truncated sample, then refit the selected lag
    // on the largest available sample for its final t-statistic (the usual ADF workflow).
    const finalFit=adfAtLag(x,selected.lag,det,selected.lag);
    return{...finalFit,method:'ADF',criterion,maxLagRequested:rawLag,maxLagUsed:maxLag,selection:'Chọn lag trên cùng mẫu bằng '+criterion.toUpperCase()+'; ước lượng lại lag được chọn trên toàn bộ mẫu khả dụng',selectionAic:selected.aic,selectionBic:selected.bic,candidates:candidates.map(c=>({lag:c.lag,aic:c.aic,bic:c.bic,selectionN:c.n}))};
  }
  function neweyWestVariance(residuals,bandwidth){
    const e=residuals,n=e.length;if(!n)return NaN;let lr=sum(e.map(v=>v*v))/n;
    for(let lag=1;lag<=bandwidth;lag++){
      let gamma=0;for(let t=lag;t<n;t++)gamma+=e[t]*e[t-lag];gamma/=n;
      const weight=1-lag/(bandwidth+1);lr+=2*weight*gamma;
    }
    return Math.max(lr,1e-18);
  }
  function pp(values,options={}){
    const x=cleanSeries(values),det=options.deterministic||'constant';
    if(!CRITICAL[det])throw new Error('Deterministic term không hợp lệ.');
    if(x.length<30)throw new Error('PP nên có ít nhất 30 quan sát; hiện tại chuỗi quá ngắn.');
    const base=adfAtLag(x,0,det),res=base.fit.residuals,n=res.length;
    const defaultBandwidth=Math.floor(4*Math.pow(n/100,2/9)),requestedBandwidth=options.bandwidth===undefined||options.bandwidth===null||options.bandwidth===''?defaultBandwidth:Math.floor(Number(options.bandwidth)||0),bandwidth=Math.max(0,Math.min(n-1,requestedBandwidth));
    const gamma0=base.sse/n,longRun=neweyWestVariance(res,bandwidth),coefIndex=det==='none'?0:det==='constant'?1:2;
    const se=base.fit.coefficients[coefIndex].stdError,tau=base.statistic,sn=Math.sqrt(base.sse/Math.max(1,n-base.fit.k));
    // Phillips–Perron Z_tau correction using OLS residual variance and Newey–West long-run variance.
    const zTau=Math.sqrt(gamma0/longRun)*tau-.5*(longRun-gamma0)/Math.sqrt(longRun)*(n*se/sn);
    const rho=1+base.coefficient,zRho=n*(rho-1)-.5*(n*n*se*se/(sn*sn))*(longRun-gamma0);
    return{method:'PP',statistic:zTau,zTau,zRho,dfStatistic:tau,n,bandwidth,shortRunVariance:gamma0,longRunVariance:longRun,critical:CRITICAL[det],deterministic:det,selection:'Newey–West Bartlett kernel'};
  }
  function olsArStart(y,p){
    if(!p)return{c:mean(y),phi:[]};
    const ys=[],xs=Array.from({length:p},(_,j)=>[]);
    for(let t=p;t<y.length;t++){ys.push(y[t]);for(let j=1;j<=p;j++)xs[j-1].push(y[t-j]);}
    const f=QuantRegression.ols({yValues:ys,xColumns:xs.map((v,j)=>({name:`AR${j+1}`,values:v}))});
    return{c:f.coefficients[0].estimate,phi:f.coefficients.slice(1).map(v=>v.estimate)};
  }
  function armaResiduals(y,p,q,params,burnIn=Math.max(5,p,q)){
    const c=params[0],phi=params.slice(1,1+p),theta=params.slice(1+p),e=Array(y.length).fill(0),fitted=Array(y.length).fill(NaN),start=burnIn;
    for(let t=0;t<y.length;t++){
      let pred=c;for(let j=1;j<=p;j++)if(t-j>=0)pred+=phi[j-1]*y[t-j];
      for(let j=1;j<=q;j++)if(t-j>=0)pred+=theta[j-1]*e[t-j];
      fitted[t]=pred;e[t]=y[t]-pred;
    }
    const residuals=e.slice(start),sse=sum(residuals.map(v=>v*v));
    return{e,fitted,residuals,sse,start,n:residuals.length};
  }
  function nelderMead(objective,start,options={}){
    const n=start.length,maxIter=options.maxIter||550,tol=options.tol||1e-7;
    let simplex=[start.slice()];for(let i=0;i<n;i++){const p=start.slice();p[i]+=Math.max(.08,Math.abs(p[i])*.12);simplex.push(p)}
    let vals=simplex.map(objective),iter=0;
    const sort=()=>{const zipped=simplex.map((p,i)=>({p,v:vals[i]})).sort((a,b)=>a.v-b.v);simplex=zipped.map(x=>x.p);vals=zipped.map(x=>x.v)};
    for(iter=0;iter<maxIter;iter++){
      sort();const spread=Math.max(...vals.map(v=>Math.abs(v-vals[0])));let diam=0;for(let i=1;i<simplex.length;i++)for(let j=0;j<n;j++)diam=Math.max(diam,Math.abs(simplex[i][j]-simplex[0][j]));if(spread<tol&&diam<Math.sqrt(tol))break;
      const centroid=Array(n).fill(0);for(let i=0;i<n;i++)for(let j=0;j<n;j++)centroid[j]+=simplex[i][j]/n;
      const worst=simplex[n],reflect=centroid.map((v,j)=>v+(v-worst[j])),fr=objective(reflect);
      if(fr<vals[0]){const expand=centroid.map((v,j)=>v+2*(reflect[j]-v)),fe=objective(expand);if(fe<fr){simplex[n]=expand;vals[n]=fe}else{simplex[n]=reflect;vals[n]=fr}}
      else if(fr<vals[n-1]){simplex[n]=reflect;vals[n]=fr}
      else{const outside=fr<vals[n],contract=centroid.map((v,j)=>outside?v+.5*(reflect[j]-v):v+.5*(worst[j]-v)),fc=objective(contract);if(fc<(outside?fr:vals[n])){simplex[n]=contract;vals[n]=fc}else{for(let i=1;i<simplex.length;i++){simplex[i]=simplex[0].map((v,j)=>v+.5*(simplex[i][j]-v));vals[i]=objective(simplex[i])}}}
    }
    sort();return{params:simplex[0],value:vals[0],iterations:iter,converged:iter<maxIter};
  }
  function forecastDifferenced(history,residuals,params,p,q,horizon){
    const y=history.slice(),e=residuals.slice(),out=[],c=params[0],phi=params.slice(1,1+p),theta=params.slice(1+p);
    for(let h=0;h<horizon;h++){
      let v=c;for(let j=1;j<=p;j++)v+=phi[j-1]*(y[y.length-j]??0);
      for(let j=1;j<=q;j++)v+=theta[j-1]*(e[e.length-j]??0);
      y.push(v);e.push(0);out.push(v);
    }
    return out;
  }
  function invertForecast(forecasts,original,d){
    if(!d)return forecasts.slice();const layers=[original.slice()];for(let k=1;k<=d;k++)layers[k]=layers[k-1].slice(1).map((v,i)=>v-layers[k-1][i]);
    const out=[];for(const f of forecasts){let v=f;for(let k=d-1;k>=0;k--){v+=layers[k][layers[k].length-1];layers[k].push(v)}out.push(v)}return out;
  }
  function fitModel(values,options={}){
    const original=cleanSeries(values),type=String(options.type||'ARIMA').toUpperCase();
    const readOrder=(name,fallback,max)=>{const raw=options[name];if(raw===undefined||raw===null||raw==='')return fallback;const v=Number(raw);if(!Number.isInteger(v)||v<0||v>max)throw new Error(`${name} phải là số nguyên từ 0 đến ${max}.`);return v;};
    let p=readOrder('p',0,5),q=readOrder('q',0,5),d=type==='ARIMA'?readOrder('d',0,2):0;
    if(type==='AR'){q=0;d=0}else if(type==='MA'){p=0;d=0}else if(type==='ARMA'){d=0}else if(type!=='ARIMA')throw new Error('Loại mô hình không hợp lệ.');
    if(p+q===0&&type!=='ARIMA')throw new Error('Mô hình AR/MA/ARMA cần p hoặc q lớn hơn 0. ARIMA(0,d,0) được hỗ trợ.');
    if(original.length<Math.max(40,p+q+20))throw new Error('Cần ít nhất 40 quan sát và đủ bậc tự do cho mô hình.');
    if(original.length>15000)throw new Error('Bản thử nghiệm giới hạn mô hình ở 15.000 quan sát để tránh treo trình duyệt.');
    const y=difference(original,d),burnIn=q===0?p:Math.max(5,p,q),nEff=y.length-burnIn,k=p+q+1;
    if(nEff<=k+5)throw new Error('Không đủ quan sát so với số tham số p và q.');
    let params,fit,optimizer={iterations:0,converged:true};
    if(p===0&&q===0){
      params=[mean(y)];fit=armaResiduals(y,0,0,params,burnIn);
    }else if(q===0){
      const ys=[],xcols=Array.from({length:p},()=>[]);for(let t=burnIn;t<y.length;t++){ys.push(y[t]);for(let j=1;j<=p;j++)xcols[j-1].push(y[t-j]);}
      const reg=QuantRegression.ols({yValues:ys,xColumns:xcols.map((v,j)=>({name:`AR${j+1}`,values:v}))});
      params=[reg.coefficients[0].estimate,...reg.coefficients.slice(1).map(c=>c.estimate)];
      fit=armaResiduals(y,p,0,params,burnIn);
    }else{
      let init;try{init=olsArStart(y,p)}catch{init={c:mean(y),phi:Array(p).fill(0)}};
      const startParams=[init.c,...init.phi,...Array(q).fill(0)];
      const objective=par=>{if(par.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))return 1e100;const f=armaResiduals(y,p,q,par,burnIn);return Number.isFinite(f.sse)?f.sse:1e100};
      optimizer=nelderMead(objective,startParams);params=optimizer.params;fit=armaResiduals(y,p,q,params,burnIn);
    }
    const df=fit.n-k,innovationVariance=fit.sse/Math.max(1,fit.n),innovationStdDev=Math.sqrt(innovationVariance),residualStdError=Math.sqrt(fit.sse/Math.max(1,df)),rmse=Math.sqrt(fit.sse/Math.max(1,fit.n));
    // Count the innovation variance as an estimated parameter in AIC/BIC.
    const ic=informationCriteria(fit.sse,fit.n,k+1),rawHorizon=options.horizon===undefined||options.horizon===null||options.horizon===''?12:Number(options.horizon);
    if(!Number.isInteger(rawHorizon)||rawHorizon<1||rawHorizon>100)throw new Error('Forecast horizon phải là số nguyên từ 1 đến 100.');
    const horizon=rawHorizon;
    const diffForecast=forecastDifferenced(y,fit.e,params,p,q,horizon),forecast=invertForecast(diffForecast,original,d);
    const psi=integratedImpulseResponse(armaImpulseResponse(params,p,q,horizon),d);
    const forecastRows=forecast.map((value,i)=>{const h=i+1,varianceH=innovationVariance*sum(psi.slice(0,h).map(v=>v*v)),se=Math.sqrt(Math.max(0,varianceH));return{step:h,value,forecastVariance:varianceH,forecastStdError:se,lower:value-1.96*se,upper:value+1.96*se}});
    const names=['Intercept',...Array.from({length:p},(_,i)=>`AR(${i+1})`),...Array.from({length:q},(_,i)=>`MA(${i+1})`)];
    const roots=armaRootDiagnostics(params,p,q);let residualAcf1=NaN,ljungBox=null;try{if(fit.residuals.length>2){residualAcf1=acf(fit.residuals,1)[1];const mLag=Math.min(10,Math.floor(fit.residuals.length/5),fit.residuals.length-1);if(mLag>p+q){const ac=acf(fit.residuals,mLag),Q=mLag*(mLag+2)*sum(ac.slice(1).map((r,i)=>r*r/(fit.residuals.length-(i+1)))),df=mLag-p-q;ljungBox={statistic:Q,df,pValue:QuantRegression.regularizedGammaQ(df/2,Q/2),lags:mLag};}}}catch{}
    return{type,order:{p,d,q},n:fit.n,nOriginal:original.length,parameters:names.map((name,i)=>({name,value:params[i]})),sse:fit.sse,rmse,residualStdError,innovationVariance,innovationStdDev,aic:ic.aic,bic:ic.bic,converged:optimizer.converged,iterations:optimizer.iterations,forecast,forecastSigma:innovationStdDev,forecastRows,fitted:fit.fitted.slice(fit.start),residuals:fit.residuals,diagnostics:{residualMean:mean(fit.residuals),residualStd:variance(fit.residuals)>=0?Math.sqrt(variance(fit.residuals)):NaN,acf1:residualAcf1,ljungBox,...roots},notes:['Ước lượng Conditional Sum of Squares (CSS); AR-only dùng OLS, MA/ARMA dùng Nelder–Mead.','AIC/BIC tính trên residual sau burn-in và có tính tham số phương sai nhiễu.','Khoảng dự báo dùng phương sai sai số dự báo từ hệ số MA vô hạn (psi weights), đã tích phân theo bậc d; vẫn chưa bao gồm bất định tham số.','Cần kiểm tra điều kiện nghiệm AR nằm ngoài vòng tròn đơn vị và nghiệm MA khả nghịch; hệ thống báo kiểm tra nghiệm số ở bảng chẩn đoán.','ARIMA(0,d,0) được ước lượng như mô hình chỉ có hằng số trên chuỗi sai phân. Kết quả CSS/Nelder–Mead là ước lượng thử nghiệm; đối chiếu bằng statsmodels/R/Stata trước khi dùng nghiên cứu chính thức.']};
  }
  return{difference,acf,pacf,adf,pp,fitModel,cleanSeries,informationCriteria,polynomialRootModuli,armaRootDiagnostics,armaImpulseResponse,integratedImpulseResponse};
});
