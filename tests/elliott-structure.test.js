const assert=require('assert');
const E=require('../js/elliott-structure-engine.js');
let passed=0;const ok=s=>{console.log('ok  ',s);passed++};
const pivots=prices=>prices.map((price,index)=>({index:index*10,time:index*600,price,kind:index%2===0?'low':'high',confirmed:true,confirmationIndex:index*10+1,confirmationTime:index*600+60,confirmationDelayBars:1}));
const barsFromCloses=closes=>closes.map((close,i)=>{const prev=i?closes[i-1]:close,open=prev,wick=.15;return{time:i*60,open,high:Math.max(open,close)+wick,low:Math.min(open,close)-wick,close,volume:100+i}});

{
  const b=barsFromCloses(Array.from({length:30},(_,i)=>100+i*.2));
  const clean=E.normalizeBars(b);assert.strictEqual(clean.length,30);assert.strictEqual(clean[0].index,0);
  assert.throws(()=>E.normalizeBars(b.slice().reverse()),/Timestamp phải tăng nghiêm ngặt/);
  const timestampOnly=b.map(x=>({timestamp:x.time,open:x.open,high:x.high,low:x.low,close:x.close}));
  assert.strictEqual(E.normalizeBars(timestampOnly).length,30);
  const bad=b.map(x=>({...x}));bad[5]={...bad[5],high:bad[5].low-1};assert.throws(()=>E.normalizeBars(bad),/OHLC không nhất quán/);
  const badVol=b.map(x=>({...x}));badVol[3]={...badVol[3],volume:-1};assert.throws(()=>E.normalizeBars(badVol),/Volume phải hữu hạn và không âm/);
  ok('OHLC normalization, chronological ordering and candle integrity validation');
}
{
  const b=barsFromCloses(Array.from({length:80},(_,i)=>100+Math.sin(i/5)*3+i*.02));
  const atr=E.atrWilder(E.normalizeBars(b),14);assert.ok(atr.seeded);assert.ok(atr.values.slice(13).every(x=>Number.isFinite(x)&&x>0));
  const dc=E.directionalChangePivots(E.normalizeBars(b),{atrPeriod:14,thresholdMultiplier:1.25});
  assert.ok(dc.pivots.length>=2);assert.ok(dc.pivots.every((p,i)=>p.confirmed&&p.confirmationIndex>=p.index&&(i===0||p.index>dc.pivots[i-1].index)));
  assert.ok(dc.pivots.every(p=>p.price===E.normalizeBars(b)[p.index].close));
  ok('Wilder ATR and causal close-confirmed directional-change pivots');
}
{
  const b=barsFromCloses(Array.from({length:160},(_,i)=>100+Math.sin(i/7)*4+Math.sin(i/2)*.2));
  const m=E.detectMultiScalePivots(E.normalizeBars(b),{atrPeriod:10,thresholdMultiplier:1.2});
  assert.strictEqual(m.scales.length,4);assert.ok(m.scales.every(s=>s.pivots.length>=2));
  assert.ok(m.scales.flatMap(s=>s.pivots).every(p=>Number.isFinite(p.scalePersistence)&&p.scalePersistence>0&&p.scalePersistence<=1));
  ok('multi-scale pivot persistence and parent-leg hierarchy');
}
{
  const p=pivots([100,110,104,130,120,138]);
  const c=E.evaluateImpulse(p);assert.ok(c);assert.strictEqual(c.pattern,'impulse');assert.strictEqual(c.ruleSummary.failed,0);
  assert.strictEqual(c.hardRules.find(x=>x.id==='EW-IMP-03').status,'pass');
  assert.ok(c.internalStructure.status==='unverified');
  const bad=pivots([100,110,98,130,120,138]);const rejected=E.evaluateImpulse(bad);assert.strictEqual(rejected.hardRules.find(x=>x.id==='EW-IMP-01').status,'fail');
  const overlap=pivots([100,110,104,130,108,138]);assert.strictEqual(E.evaluateImpulse(overlap).hardRules.find(x=>x.id==='EW-IMP-04').status,'fail');
  const bear=E.evaluateImpulse(pivots([140,130,136,110,118,100]));assert.strictEqual(bear.direction,'bearish');assert.strictEqual(bear.ruleSummary.failed,0);
  ok('Impulse hard-rule checks in bullish/bearish directions and internal-count uncertainty');
}
{
  const p=pivots([120,100,112,85]);const z=E.evaluateZigzag(p);assert.strictEqual(z.pattern,'zigzag');assert.strictEqual(z.hardRules[0].status,'pass');
  const bad=E.evaluateZigzag(pivots([120,100,125,85]));assert.strictEqual(bad.hardRules[0].status,'fail');
  const bullish=E.evaluateZigzag(pivots([100,120,110,132]));assert.strictEqual(bullish.direction,'bullish');assert.strictEqual(bullish.hardRules[0].status,'pass');
  ok('Zigzag B-wave non-invalidation rule in both directions');
}
{
  const regular=E.evaluateFlat(pivots([120,100,119,97]));assert.ok(regular.some(x=>x.pattern==='regular_flat'));
  const expanded=E.evaluateFlat(pivots([120,100,125,92]));assert.ok(expanded.some(x=>x.pattern==='expanded_flat'));
  const running=E.evaluateFlat(pivots([120,100,125,104]));assert.ok(running.some(x=>x.pattern==='running_flat'));
  const notFlat=E.evaluateFlat(pivots([120,100,115,97]));assert.strictEqual(notFlat.length,0);
  const bullRegular=E.evaluateFlat(pivots([100,120,101,123]));assert.ok(bullRegular.some(x=>x.pattern==='regular_flat'));
  const bullExpanded=E.evaluateFlat(pivots([100,120,96,125]));assert.ok(bullExpanded.some(x=>x.pattern==='expanded_flat'));
  const bullRunning=E.evaluateFlat(pivots([100,120,96,118]));assert.ok(bullRunning.some(x=>x.pattern==='running_flat'));
  ok('Regular, expanded and running Flat geometry in both directions');
}
{
  const contracting=E.evaluateTriangle(pivots([100,120,105,118,108,115]));assert.ok(contracting.some(x=>x.pattern==='contracting_triangle'));
  const expanding=E.evaluateTriangle(pivots([100,110,95,115,90,120]));assert.ok(expanding.some(x=>x.pattern==='expanding_triangle'));
  const none=E.evaluateTriangle(pivots([100,120,105,123,108,126]));assert.strictEqual(none.length,0);
  ok('Contracting and expanding Triangle geometry candidates');
}
{
  const diag=E.evaluateDiagonal(pivots([100,112,105,115,109,117]));assert.ok(diag);assert.strictEqual(diag.pattern,'diagonal_candidate');assert.ok(diag.possibleRoles.includes('leading_diagonal'));
  const noOverlap=E.evaluateDiagonal(pivots([100,112,105,118,114,123]));assert.strictEqual(noOverlap.hardRules.find(x=>x.id==='EW-DIAG-01').status,'fail');
  ok('Diagonal overlap, wedge context and role ambiguity handling');
}
{
  const p=pivots([100,110,104,130,120]);const c=E.evaluateDevelopingImpulse(p);assert.strictEqual(c.pattern,'impulse_developing_wave5');
  assert.strictEqual(c.hardRules.find(x=>x.id==='EW-IMP-03').status,'unverified');
  assert.ok(c.fibTargets.length>=3);assert.ok(c.channel&&Number.isFinite(c.channel.projectedPrice));
  assert.strictEqual(c.invalidation.levels.length,2);
  const ranked=[
    {pattern:'zigzag',direction:'bullish',startIndex:0,endIndex:10,evidenceScore:99},
    {pattern:'zigzag',direction:'bullish',startIndex:1,endIndex:11,evidenceScore:98},
    {pattern:'impulse',direction:'bullish',startIndex:0,endIndex:10,evidenceScore:90}
  ];
  const diversified=E.diversifyCandidates(ranked,10);assert.strictEqual(diversified.length,2);assert.strictEqual(diversified[1].pattern,'impulse');
  const pref={id:'a',startIndex:10,endIndex:30},alts=[pref,{id:'b',startIndex:11,endIndex:31},{id:'c',startIndex:50,endIndex:70}];
  assert.deepStrictEqual(E.selectAlternateCounts(alts,pref,3).map(x=>x.id),['b']);
  ok('developing Wave 5 targets, invalidation levels, channel projection and candidate diversity');
}
{
  const closes=[];const anchors=[100,110,104,130,120,138,128,146];let seed=123;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let k=0;k<anchors.length-1;k++)for(let j=0;j<22;j++){const u=j/22;closes.push(anchors[k]+(anchors[k+1]-anchors[k])*u+(rnd()-.5)*.06)}closes.push(anchors[anchors.length-1]);
  const result=E.analyze(barsFromCloses(closes),{atrPeriod:10,thresholdMultiplier:1.1,maxCandidates:30});
  assert.strictEqual(result.version,E.VERSION);assert.strictEqual(result.scales.length,4);assert.ok(result.diagnostics.pivotCount>=4);
  assert.ok(result.candidates.every(c=>c.evidenceScore>=0&&c.evidenceScore<=100));
  assert.ok(!('probability' in (result.preferred||{})));
  ok('end-to-end multi-scale analysis, candidate ranking and non-probabilistic score semantics');
}
console.log(`\n${passed} nhóm kiểm thử Elliott Structure đạt`);
