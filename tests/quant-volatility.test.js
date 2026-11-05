const assert=require('assert');
const V=require('../js/quant-volatility.js');
let passed=0;const ok=s=>{console.log('ok  ',s);passed++};
let seed=20261105;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const normal=()=>{const u=Math.max(1e-9,rand()),v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
// Seeded GARCH(1,1) returns in percentage points.
const n=900,variance=[],shock=[],returns=[];const omega=.02,alpha=.08,beta=.88;
for(let t=0;t<n;t++){variance[t]=t===0?.3:omega+alpha*shock[t-1]**2+beta*variance[t-1];shock[t]=Math.sqrt(variance[t])*normal();returns.push(shock[t]);}
{
  const p=[100];for(let i=0;i<500;i++)p.push(p[p.length-1]*Math.exp((.02*Math.sin(i/13)+.1*Math.cos(i/7))/100));
  const r=V.logReturnsFromPrices(p);assert.strictEqual(r.returnObservations,500);assert.ok(r.returnsPct.every(Number.isFinite));ok('prices are converted to percentage log returns in chronological order');
}
{
  assert.throws(()=>V.logReturnsFromPrices([100,101,0,102]),/dương/);
  assert.throws(()=>V.cleanReturns([1,2,3]),/100 quan sát/);
  assert.throws(()=>V.cleanReturns(Array(100).fill(0).map((x,i)=>i===8?NaN:x)),/thiếu/);
  ok('invalid prices, undersized samples and missing returns are rejected');
}
for(const model of ['ARCH','GARCH','EGARCH','GJR-GARCH','TARCH']){
  const fit=V.fit(model,returns,{q:2,horizon:8,maxIter:1600,distribution:'gaussian'});
  assert.strictEqual(fit.model,model);assert.strictEqual(fit.n,n);assert.strictEqual(fit.forecast.length,8);
  assert.strictEqual(fit.conditionalVolatilityPct.length,n);assert.ok(fit.conditionalVolatilityPct.every(x=>Number.isFinite(x)&&x>0));
  assert.ok(fit.forecast.every(x=>Number.isFinite(x.conditionalVolatilityPct)&&x.conditionalVolatilityPct>0));
  assert.ok(fit.optimizer.converged,`${model} optimizer did not converge`);
  if(model==='EGARCH')assert.ok(Math.abs(fit.persistence)<1);
  else assert.ok(fit.persistence>0&&fit.persistence<1);
  if(model==='TARCH'){assert.ok(fit.rawParameters.alpha>=0);assert.ok(fit.rawParameters.alpha+fit.rawParameters.gamma>=0);assert.ok(fit.rawParameters.beta>=0)}
  if(model==='GJR-GARCH'){assert.ok(fit.rawParameters.alpha>=0);assert.ok(fit.rawParameters.gamma>=0);assert.ok(fit.rawParameters.beta>=0)}
  assert.ok(fit.diagnostics.standardizedResidualLjungBox.df>0);assert.ok(fit.diagnostics.archLm.pValue>=0&&fit.diagnostics.archLm.pValue<=1);
  ok(`${model} Gaussian conditional-likelihood fit, diagnostics and volatility forecast`);
}
{
  const fit=V.fit('GARCH',returns,{horizon:4,maxIter:2000,distribution:'student-t'});
  assert.ok(fit.rawParameters.nu>2.05&&fit.rawParameters.nu<=200);assert.strictEqual(fit.distribution,'student-t');assert.strictEqual(fit.forecast.length,4);ok('GARCH standardized Student-t likelihood and bounded degrees of freedom');
}
{
  const fit=V.fit('TARCH',returns,{horizon:4,maxIter:2000,distribution:'student-t'});
  assert.ok(fit.rawParameters.nu>2.05&&fit.rawParameters.nu<=200);assert.ok(fit.rawParameters.alpha+fit.rawParameters.gamma>=0);assert.ok(fit.persistence<1);
  assert.ok(Math.abs(fit.longRunVolatilityPct-fit.rawParameters.omega/(1-fit.persistence))<1e-10);
  ok('TARCH Zakoian threshold constraints and long-run sigma under Student-t innovations');
}
{
  const low=V.fit('GARCH',returns,{horizon:3,annualFactor:100,distribution:'gaussian'});
  const high=V.fit('GARCH',returns,{horizon:3,annualFactor:400,distribution:'gaussian'});
  assert.ok(Math.abs(high.forecast[0].annualizedVolatilityPct/low.forecast[0].annualizedVolatilityPct-2)<1e-8);
  const eg=V.fit('EGARCH',returns,{horizon:3,annualFactor:100,distribution:'gaussian'});
  assert.ok(Number.isNaN(eg.unconditionalVariance));assert.ok(Number.isFinite(eg.medianVarianceProxy));assert.ok(Number.isFinite(eg.medianVolatilityProxyPct));
  ok('forecast annualization follows user factor and EGARCH median proxy is not mislabeled unconditional variance');
}
{
  const d=V.diagnoseReturns(returns);assert.strictEqual(d.n,n);assert.ok(Number.isFinite(d.absoluteReturnLjungBox.pValue));assert.ok(Number.isFinite(d.squaredReturnLjungBox.pValue));ok('return, absolute-return and squared-return dependence diagnostics');
}
{
  assert.throws(()=>V.fit('ARCH',returns,{q:0}),/q phải là số nguyên/);
  assert.throws(()=>V.fit('ARCH',returns,{q:1.5}),/q phải là số nguyên/);
  assert.throws(()=>V.fit('GARCH',returns,{horizon:101}),/Forecast steps/);
  assert.throws(()=>V.fit('GARCH',returns,{horizon:1.5}),/Forecast steps/);
  assert.throws(()=>V.fit('GARCH',returns,{annualFactor:0}),/Annualization factor/);
  assert.throws(()=>V.fit('GARCH',returns,{distribution:'skewed-t'}),/Innovation distribution/);
  assert.throws(()=>V.fit('NOT_A_MODEL',returns),/không được hỗ trợ/);
  ok('invalid model type, fractional/in-range-invalid orders, horizon, annualization and distribution are rejected');
}
console.log(`\n${passed} nhóm kiểm thử Quant Volatility đạt`);
