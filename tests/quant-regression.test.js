const assert=require('assert');
const R=require('../js/quant-regression.js');
let n=0;const ok=s=>{console.log('ok  ',s);n++};
{
  const x=Array.from({length:40},(_,i)=>i-19.5);
  const z=x.map((v,i)=>Math.sin(i*.71)+Math.cos(i*1.33));
  const noise=x.map((_,i)=>Math.sin(i*1.91)*.08+Math.cos(i*.37)*.035);
  const y=x.map((v,i)=>3.2+1.7*v-.45*z[i]+noise[i]);
  const m=R.ols({yValues:y,xColumns:[{name:'x',values:x},{name:'z',values:z}]});
  assert.strictEqual(m.n,40);assert.ok(Math.abs(m.coefficients[0].estimate-3.2)<.01);assert.ok(Math.abs(m.coefficients[1].estimate-1.7)<.01);assert.ok(Math.abs(m.coefficients[2].estimate+.45)<.01);assert.ok(m.r2>.999);assert.ok(m.fP<1e-20);ok('multiple OLS estimates, R-squared and F test');
}
{
  const x=[1,2,3,4,5,6,7,8],y=[2.2,3.7,6.3,7.8,10.1,11.9,14.2,15.8];
  const m=R.ols({yValues:y,xColumns:[{name:'x',values:x}]});
  assert.strictEqual(m.coefficients.length,2);assert.ok(m.coefficients[1].ciLower<m.coefficients[1].estimate);assert.ok(m.coefficients[1].ciUpper>m.coefficients[1].estimate);assert.ok(m.diagnostics.durbinWatson>=0);assert.ok(m.diagnostics.breuschPagan.df===1);ok('simple OLS, confidence interval and diagnostics');
}
{
  const x=[1,2,3,4,5,6,7,8,9,10],z=[2,1,4,3,5,7,6,8,9,11],y=x.map((v,i)=>2+v*.3+z[i]**2*.015+(i%2?0.4:-.3));
  const a=R.ols({yValues:y,xColumns:[{name:'x',values:x},{name:'z',values:z}],robustHC1:false});
  const b=R.ols({yValues:y,xColumns:[{name:'x',values:x},{name:'z',values:z}],robustHC1:true});
  assert.strictEqual(b.robustHC1,true);assert.ok(b.coefficients.every(c=>Number.isFinite(c.stdError)));assert.ok(a.coefficients.some((c,i)=>Math.abs(c.stdError-b.coefficients[i].stdError)>1e-10));ok('HC1 robust covariance changes standard errors');
}
{
  const x=[1,2,3,4,5,6],z=[2,4,6,8,10,12],y=[2,4,5,8,9,11];
  assert.throws(()=>R.ols({yValues:y,xColumns:[{name:'x',values:x},{name:'z',values:z}]}),/suy biến|đa cộng tuyến/);ok('perfect multicollinearity is rejected');
}
{
  const x=[1,2,3,4,5,6],y=[3,5,7,9,11,13];
  const m=R.ols({yValues:y,xColumns:[{name:'x',values:x}]});
  assert.strictEqual(m.fStat,Infinity);assert.strictEqual(m.fP,0);ok('perfect-fit model reports infinite F and zero p-value');
}
{
  assert.ok(Math.abs(R.tCritical95(28)-2.0484071418)<1e-8);
  assert.ok(Math.abs(R.studentTwoTailP(2,28)-.05528523764)<1e-8);
  assert.ok(Math.abs(R.fRightTailP(5,2,28)-.0139072764)<1e-8);ok('Student-t and F distribution probabilities');
}
{
  const m=R.ols({yValues:[2,4,6,8,10,12],xColumns:[{name:'x',values:[1,2,3,4,5,6]},{name:'z',values:[6,2,5,1,4,3]}]});
  assert.strictEqual(m.diagnostics.vif.length,2);assert.ok(m.diagnostics.vif.every(v=>v.vif>=1));ok('VIF computed for each predictor');
}

{
  const rows=[];for(let i=0;i<180;i++){const x1=.9*Math.sin(i/8)+.45*Math.cos(i/17)+.1*Math.sin(i*1.7),x2=.7*Math.cos(i/11)+.35*Math.sin(i/23)+.08*Math.cos(i*1.31),noise=.12*Math.sin(i*2.7)+.06*Math.cos(i*.41),y=.25+1.8*x1-.7*x2+noise;rows.push({x1,x2,y});}
  const m=R.ols({yValues:rows.map(r=>r.y),xColumns:[{name:'FactorReturn',values:rows.map(r=>r.x1)},{name:'VolatilityChange',values:rows.map(r=>r.x2)}]});
  assert.ok(Math.abs(m.coefficients[0].estimate-.25)<.01);assert.ok(Math.abs(m.coefficients[1].estimate-1.8)<.01);assert.ok(Math.abs(m.coefficients[2].estimate+.7)<.01);assert.ok(m.r2>.99);ok('synthetic OLS teaching dataset recovers target coefficients');
}
{
  const m=R.ols({yValues:[2,4,6,8,NaN,12],xColumns:[{name:'x',values:[1,2,3,4,5,6]}]});
  assert.strictEqual(m.n,5);assert.ok(Math.abs(m.coefficients[1].estimate-2)<1e-10);ok('listwise deletion excludes incomplete observations');
}

{
  const x1=Array.from({length:30},(_,i)=>(i-15)*1e-3),x2=Array.from({length:30},(_,i)=>(i%7-3)*1e6),y=x1.map((v,i)=>1.2+3.4*v-.000002*x2[i]+Math.sin(i*1.7)*.00001);
  const m=R.ols({yValues:y,xColumns:[{name:'smallScale',values:x1},{name:'largeScale',values:x2}]});
  assert.ok(Math.abs(m.coefficients[1].estimate-3.4)<.05);assert.ok(Math.abs(m.coefficients[2].estimate+.000002)<1e-8);ok('column normalization handles predictors with different numeric scales');
}
console.log(`\n${n} nhóm kiểm thử Quant Regression đạt`);
{
  assert.throws(()=>R.ols({yValues:[1,2,3],xColumns:[{name:'x',values:[1,2]}]}),/cùng số dòng/);ok('regression rejects misaligned columns instead of truncating');
}
{
  const m=R.ols({yValues:[1,2,NaN,4,5,6],xColumns:[{name:'x',values:[1,2,3,4,5,6]}]});assert.strictEqual(m.diagnostics.durbinWatsonValid,false);assert.ok(Number.isNaN(m.diagnostics.durbinWatson));ok('Durbin-Watson suppressed after listwise deletion breaks row adjacency');
}
{
  const m=R.ols({yValues:[2,4,6,8,10],xColumns:[{name:'x',values:[1,2,3,4,5]}]});assert.ok(Number.isNaN(m.diagnostics.durbinWatson));ok('Durbin-Watson is undefined for a zero-residual perfect fit');
}
{
  const m=R.ols({yValues:[1,null,3,4,5],xColumns:[{name:'x',values:[1,2,3,4,5]}]});assert.strictEqual(m.n,4);assert.ok(Math.abs(m.coefficients[1].estimate-1)<1e-10);ok('blank/null dependent values are missing, not numeric zero');
}
{
  const scale=1e-9,x=[1,2,3,4,5,6].map(v=>v*scale),y=x.map((v,i)=>2*scale+3*v+(i%2?1:-1)*1e-12);const m=R.ols({yValues:y,xColumns:[{name:'x',values:x}]});assert.ok(Number.isFinite(m.r2));assert.ok(Number.isFinite(m.fStat));assert.ok(m.r2>.999);ok('OLS fit statistics remain scale invariant for small-magnitude market return series');
}
