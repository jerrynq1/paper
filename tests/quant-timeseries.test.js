const assert=require('assert');
const T=require('../js/quant-timeseries.js');
let n=0;const ok=s=>{console.log('ok  ',s);n++};
let seed=20261105;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const noise=()=>{const u=Math.max(1e-9,rand()),v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const ar=[0],rw=[100];for(let i=1;i<1200;i++){ar.push(.72*ar[i-1]+noise());rw.push(rw[i-1]+noise())}
{
 const d=T.difference([1,3,6,10,15],1);assert.deepStrictEqual(d,[2,3,4,5]);assert.deepStrictEqual(T.difference([1,3,6,10,15],2),[1,1,1]);ok('first and second differencing');
}
{
 const a=T.acf(ar,5),p=T.pacf(ar,5);assert.strictEqual(a[0],1);assert.ok(a[1]>.6&&a[1]<.82);assert.ok(Math.abs(p[2])<.15);ok('ACF/PACF for a simulated AR(1) process');
}
{
 const a=T.adf(ar,{deterministic:'constant',maxLag:8});const r=T.adf(rw,{deterministic:'constant',maxLag:8});assert.ok(a.statistic<a.critical['1%']);assert.ok(r.statistic>r.critical['5%']);assert.ok(a.lag>=0&&a.lag<=8);ok('ADF distinguishes stationary AR(1) from a random walk in seeded sample');
}
{
 const p=T.pp(rw,{deterministic:'constant',bandwidth:6});assert.ok(Number.isFinite(p.zTau));assert.ok(Number.isFinite(p.zRho));assert.strictEqual(p.bandwidth,6);ok('Phillips–Perron statistics and Newey–West variance');
}
{
 const m=T.fitModel(ar,{type:'AR',p:1,horizon:5});assert.ok(Math.abs(m.parameters[1].value-.72)<.12);assert.strictEqual(m.forecast.length,5);assert.ok(Number.isFinite(m.aic)&&Number.isFinite(m.bic));ok('AR(1) CSS/OLS estimation and forecast');
}
{
 const m=T.fitModel(ar,{type:'ARMA',p:1,q:1,horizon:4});assert.strictEqual(m.order.p,1);assert.strictEqual(m.order.q,1);assert.strictEqual(m.forecast.length,4);assert.ok(m.parameters.every(x=>Number.isFinite(x.value)));ok('ARMA(1,1) conditional sum of squares estimation');
}
{
 const m=T.fitModel(rw,{type:'ARIMA',p:1,d:1,q:0,horizon:4});assert.strictEqual(m.order.d,1);assert.strictEqual(m.forecast.length,4);assert.ok(m.forecast.every(Number.isFinite));ok('ARIMA(1,1,0) differencing and inverse forecast integration');
}
{
 assert.throws(()=>T.acf([1,2,NaN,4],2),/giá trị thiếu/);assert.throws(()=>T.fitModel([1,2,3,4],{type:'AR',p:1}),/40 quan sát/);ok('missing values and undersized samples are rejected explicitly');
}
{
 const auto=T.adf(ar,{deterministic:'constant'});assert.ok(auto.lag>=0);assert.ok(Number.isFinite(auto.statistic));ok('ADF automatic maximum lag and information-criterion selection');
}
{
 let last=0;const ma=[];for(let i=0;i<900;i++){const e=noise();ma.push(e+.55*last);last=e;}
 const m=T.fitModel(ma,{type:'MA',q:1,horizon:3});assert.ok(Math.abs(m.parameters[1].value-.55)<.18);assert.strictEqual(m.order.p,0);assert.strictEqual(m.forecast.length,3);ok('MA(1) coefficient recovery and forecasting');
}
{
 const base=ar.slice(0,180),second=[];for(let i=0;i<base.length;i++)second.push(i===0?0:i===1?0:base[i]-2*base[i-1]+base[i-2]);
 const integrated=[100];let d1=0;for(const v of second){d1+=v;integrated.push(integrated[integrated.length-1]+d1)}
 const m=T.fitModel(integrated,{type:'ARIMA',p:1,d:2,q:0,horizon:3});assert.strictEqual(m.order.d,2);assert.strictEqual(m.forecast.length,3);assert.ok(m.forecast.every(Number.isFinite));ok('ARIMA second differencing and inverse integration');
}
{
 for(const det of ['none','constant','trend']){const a=T.adf(ar,{deterministic:det,maxLag:4});const p=T.pp(ar,{deterministic:det,bandwidth:0});assert.ok(Number.isFinite(a.statistic)&&Number.isFinite(p.zTau));assert.strictEqual(p.bandwidth,0)}ok('ADF/PP deterministic specifications and zero Newey–West bandwidth');
}
console.log(`\n${n} nhóm kiểm thử Quant Time Series đạt`);
