/* Quantitative Research · OLS regression and inference helpers.
   No DOM dependency. Classical OLS covariance and optional HC1 robust covariance. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuantRegression=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EPS=1e-12;
  const sum=a=>a.reduce((s,x)=>s+x,0);
  const mean=a=>a.length?sum(a)/a.length:NaN;
  const transpose=A=>A[0].map((_,j)=>A.map(r=>r[j]));
  const matMul=(A,B)=>A.map(row=>B[0].map((_,j)=>sum(row.map((v,k)=>v*B[k][j]))));
  const dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));

  // Lanczos log-gamma approximation.
  function logGamma(z){
    const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.61502916214059,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
    if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z-=1;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
    const t=z+c.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
  }
  function betaCF(a,b,x){
    const qab=a+b,qap=a+1,qam=a-1;let c=1,d=1-qab*x/qap;
    if(Math.abs(d)<1e-30)d=1e-30;d=1/d;let h=d;
    for(let m=1;m<=200;m++){
      const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));
      d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;h*=d*c;
      aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
      d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;const del=d*c;h*=del;
      if(Math.abs(del-1)<3e-14)break;
    }
    return h;
  }
  function regularizedBeta(x,a,b){
    if(!(a>0&&b>0)||Number.isNaN(x))return NaN;if(x<=0)return 0;if(x>=1)return 1;
    const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
    return x<(a+1)/(a+b+2)?bt*betaCF(a,b,x)/a:1-bt*betaCF(b,a,1-x)/b;
  }
  function regularizedGammaQ(a,x){
    if(!(a>0)||x<0||Number.isNaN(x))return NaN;if(x===0)return 1;
    const gln=logGamma(a);
    if(x<a+1){let ap=a,sumv=1/a,del=sumv;for(let n=1;n<=500;n++){ap++;del*=x/ap;sumv+=del;if(Math.abs(del)<Math.abs(sumv)*1e-14)break;}const p=sumv*Math.exp(-x+a*Math.log(x)-gln);return Math.max(0,Math.min(1,1-p));}
    let b=x+1-a,c=1/1e-300,d=1/b,h=d;
    for(let i=1;i<=500;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<1e-14)break;}
    return Math.max(0,Math.min(1,Math.exp(-x+a*Math.log(x)-gln)*h));
  }
  function studentTwoTailP(t,df){if(!(df>0)||!Number.isFinite(t))return NaN;return regularizedBeta(df/(df+t*t),df/2,.5);}
  function fRightTailP(f,df1,df2){if(!(df1>0&&df2>0)||f<0||Number.isNaN(f))return NaN;if(f===Infinity)return 0;return regularizedBeta(df2/(df2+df1*f),df2/2,df1/2);}
  function tCritical95(df){if(!(df>0))return NaN;let lo=0,hi=1;while(studentTwoTailP(hi,df)>.05&&hi<1e8)hi*=2;for(let i=0;i<90;i++){const mid=(lo+hi)/2;if(studentTwoTailP(mid,df)>.05)lo=mid;else hi=mid;}return(lo+hi)/2;}

  function qrSolve(X,y){
    const n=X.length,p=X[0].length;
    // Normalize each design column before QR to reduce scale-related conditioning problems.
    const scales=Array.from({length:p},(_,j)=>Math.sqrt(X.reduce((v,row)=>v+row[j]*row[j],0)));
    if(scales.some(v=>!Number.isFinite(v)||v<=1e-14))throw new Error('Ma trận thiết kế có biến không thay đổi hoặc giá trị không hợp lệ.');
    const A=X.map(r=>r.map((v,j)=>v/scales[j])),b=y.slice();
    for(let k=0;k<p;k++){
      let norm=0;for(let i=k;i<n;i++)norm=Math.hypot(norm,A[i][k]);
      if(norm<=1e-11)throw new Error('Ma trận thiết kế suy biến hoặc có đa cộng tuyến hoàn hảo. Hãy bỏ biến trùng lặp hoặc biến không thay đổi.');
      const alpha=A[k][k]>=0?-norm:norm,v=[];for(let i=k;i<n;i++)v.push(A[i][k]);v[0]-=alpha;
      const vv=dot(v,v);if(vv<=EPS)throw new Error('Không thể phân rã ma trận thiết kế.');
      for(let j=k;j<p;j++){let proj=0;for(let i=k;i<n;i++)proj+=v[i-k]*A[i][j];proj*=2/vv;for(let i=k;i<n;i++)A[i][j]-=proj*v[i-k];}
      let proj=0;for(let i=k;i<n;i++)proj+=v[i-k]*b[i];proj*=2/vv;for(let i=k;i<n;i++)b[i]-=proj*v[i-k];
      A[k][k]=alpha;for(let i=k+1;i<n;i++)A[i][k]=0;
    }
    const R=Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>j>=i?A[i][j]:0));
    const beta=Array(p).fill(0);for(let i=p-1;i>=0;i--){let z=b[i];for(let j=i+1;j<p;j++)z-=R[i][j]*beta[j];beta[i]=z/R[i][i];}
    const Rinv=Array.from({length:p},()=>Array(p).fill(0));
    for(let col=0;col<p;col++){for(let i=p-1;i>=0;i--){let z=i===col?1:0;for(let j=i+1;j<p;j++)z-=R[i][j]*Rinv[j][col];Rinv[i][col]=z/R[i][i];}}
    const invScaled=matMul(Rinv,transpose(Rinv));
    const betaOriginal=beta.map((v,i)=>v/scales[i]);
    const invXtX=invScaled.map((r,i)=>r.map((v,j)=>v/(scales[i]*scales[j])));
    return{beta:betaOriginal,invXtX};
  }
  function fitCore(X,y){
    const n=y.length,p=X[0].length,sol=qrSolve(X,y),fitted=X.map(r=>dot(r,sol.beta)),residuals=y.map((v,i)=>v-fitted[i]);
    const sse=sum(residuals.map(v=>v*v)),ym=mean(y),sst=sum(y.map(v=>(v-ym)**2)),uncentered=sum(y.map(v=>v*v));
    const r2=sst>EPS?1-sse/sst:NaN,uncenteredR2=uncentered>EPS?1-sse/uncentered:NaN;
    return{...sol,n,p,fitted,residuals,sse,sst,r2,uncenteredR2};
  }
  function covarianceHC1(X,residuals,invXtX){
    const n=X.length,p=X[0].length,meat=Array.from({length:p},()=>Array(p).fill(0));
    for(let i=0;i<n;i++)for(let a=0;a<p;a++)for(let b=0;b<p;b++)meat[a][b]+=residuals[i]**2*X[i][a]*X[i][b];
    const left=matMul(invXtX,meat),out=matMul(left,invXtX),scale=n/(n-p);
    return out.map(r=>r.map(v=>v*scale));
  }
  function vifValues(rows,xIndices){
    if(xIndices.length===1)return[{index:xIndices[0],vif:1,r2:0}];
    return xIndices.map((idx,pos)=>{
      const y=rows.map(r=>r[idx]),others=xIndices.filter((_,i)=>i!==pos),X=rows.map(r=>[1,...others.map(j=>r[j])]);
      try{const f=fitCore(X,y);return{index:idx,vif:f.r2>=1-1e-12?Infinity:1/(1-f.r2),r2:f.r2};}
      catch{return{index:idx,vif:Infinity,r2:1};}
    });
  }
  function ols(options){
    const {yValues,xColumns=[],includeIntercept=true,robustHC1=false}=options||{};
    if(!Array.isArray(yValues)||!Array.isArray(xColumns)||!xColumns.length)throw new Error('Hãy chọn một biến phụ thuộc Y và ít nhất một biến giải thích X.');
    if(xColumns.length>12)throw new Error('Bản thử nghiệm giới hạn tối đa 12 biến giải thích.');
    const rowCount=Math.min(yValues.length,...xColumns.map(c=>c.values.length));
    if(rowCount>250000)throw new Error('Bản thử nghiệm giới hạn 250.000 dòng cho mỗi lần ước lượng OLS để tránh treo trình duyệt.');
    const complete=[];for(let i=0;i<rowCount;i++){const y=Number(yValues[i]),xs=xColumns.map(c=>Number(c.values[i]));if(Number.isFinite(y)&&xs.every(Number.isFinite))complete.push({y,xs,index:i});}
    const k=xColumns.length+(includeIntercept?1:0),n=complete.length;
    if(n<=k+1)throw new Error(`Không đủ quan sát hoàn chỉnh: cần nhiều hơn ${k+1}, hiện có ${n}.`);
    const y=complete.map(r=>r.y),X=complete.map(r=>[...(includeIntercept?[1]:[]),...r.xs]);
    const fit=fitCore(X,y),dfResidual=n-k,dfModel=includeIntercept?k-1:k;
    if(dfResidual<=0||dfModel<=0)throw new Error('Bậc tự do không hợp lệ cho kiểm định F.');
    const r2=includeIntercept?fit.r2:fit.uncenteredR2;
    const adjustedR2=1-(1-r2)*(includeIntercept?(n-1):n)/dfResidual;
    const explainedSS=includeIntercept?Math.max(0,fit.sst-fit.sse):sum(fit.fitted.map(v=>v*v)),fStat=fit.sse<=Number.EPSILON*Math.max(1,explainedSS)?Infinity:(explainedSS/dfModel)/(fit.sse/dfResidual),fP=fRightTailP(fStat,dfModel,dfResidual);
    const sigma2=fit.sse/dfResidual,cov=robustHC1?covarianceHC1(X,fit.residuals,fit.invXtX):fit.invXtX.map(r=>r.map(v=>v*sigma2));
    const critical=tCritical95(dfResidual),paramNames=[...(includeIntercept?['Intercept']:[]),...xColumns.map(c=>c.name)];
    const coefficients=fit.beta.map((estimate,i)=>{const se=Math.sqrt(Math.max(0,cov[i][i])),t=se>0?estimate/se:NaN,p=studentTwoTailP(t,dfResidual);return{name:paramNames[i],estimate,stdError:se,t,p,ciLower:estimate-critical*se,ciUpper:estimate+critical*se};});
    const e=fit.residuals,es=sum(e),dw=sum(e.slice(1).map((v,i)=>(v-e[i])**2))/Math.max(EPS,fit.sse);
    const em=mean(e),m2=mean(e.map(v=>(v-em)**2)),skew=m2>0?mean(e.map(v=>(v-em)**3))/Math.pow(m2,1.5):NaN,excess=m2>0?mean(e.map(v=>(v-em)**4))/(m2*m2)-3:NaN;
    const jb=n/6*(skew*skew+excess*excess/4),jbP=regularizedGammaQ(1,jb/2);
    let bp=null;
    try{const aux=fitCore(complete.map(r=>[1,...r.xs]),e.map(v=>v*v));const df=xColumns.length,lm=n*Math.max(0,aux.r2);bp={lm,df,p:regularizedGammaQ(df/2,lm/2),r2:aux.r2};}catch{}
    const vif=vifValues(complete.map(r=>r.xs),xColumns.map((_,i)=>i));
    return{
      n,k,dfResidual,dfModel,includeIntercept,robustHC1,r2,adjustedR2,sse:fit.sse,rmse:Math.sqrt(fit.sse/n),residualStdError:Math.sqrt(sigma2),fStat,fP,
      coefficients,fitted:fit.fitted,residuals:fit.residuals,usedRowIndices:complete.map(r=>r.index),
      diagnostics:{durbinWatson:dw,jarqueBera:jb,jarqueBeraP:jbP,residualSkewness:skew,residualExcessKurtosis:excess,breuschPagan:bp,vif}
    };
  }
  return{ols,studentTwoTailP,fRightTailP,regularizedBeta,regularizedGammaQ,tCritical95,qrSolve};
});
