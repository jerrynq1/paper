const assert=require('assert');
const E=require('../js/elliott-structure-engine.js');
let passed=0;const ok=s=>{console.log('ok  ',s);passed++};
const pivots=(prices,startIndex=0,step=10)=>prices.map((price,i)=>({index:startIndex+i*step,time:(startIndex+i*step)*60,price,kind:i%2===0?'low':'high',confirmed:true,confirmationIndex:startIndex+i*step+1,confirmationTime:(startIndex+i*step+1)*60,confirmationDelayBars:1}));
const barsFromCloses=closes=>closes.map((close,i)=>{const open=i?closes[i-1]:close;return{time:i*60,open,high:Math.max(open,close)+.1,low:Math.min(open,close)-.1,close,volume:10};});

assert.strictEqual(E.VERSION,'0.6.0');
ok('v0.6 engine version is exported');

{
  // Exact touches at the Wave-1 origin and Wave-1 end are boundaries, not price overlap/crossing.
  const c=E.evaluateImpulse(pivots([100,110,100,130,110,138]));
  assert.ok(c);
  assert.strictEqual(c.hardRules.find(x=>x.id==='EW-IMP-01').status,'pass');
  assert.strictEqual(c.hardRules.find(x=>x.id==='EW-IMP-04').status,'pass');
  ok('Impulse rules accept exact boundary touches without accepting actual penetration');
}

{
  const upperBarrier=E.evaluateTriangle(pivots([100,120,105,120,110,120]));
  assert.ok(upperBarrier.some(x=>x.pattern==='barrier_triangle'&&x.metrics.barrierBoundary==='upper'));
  const lowerBarrier=E.evaluateTriangle(pivots([100,120,100,115,100,110]));
  assert.ok(lowerBarrier.some(x=>x.pattern==='barrier_triangle'&&x.metrics.barrierBoundary==='lower'));
  ok('Barrier Triangle subtype recognizes both upper and lower near-horizontal boundaries');
}


{
  const expanding=E.evaluateDiagonal(pivots([100,110,95,118,88,125]));
  assert.strictEqual(expanding.pattern,'expanding_diagonal_candidate');
  assert.strictEqual(expanding.hardRules.find(x=>x.id==='EW-DIAG-02').status,'pass');
  assert.deepStrictEqual(expanding.possibleRoles,['leading_diagonal','ending_diagonal']);
  assert.ok(expanding.internalStructure.expectedVariants.length===2);
  ok('Expanding Diagonal is separated from contracting diagonal and retains role-dependent grammar');
}

{
  const completed=E.evaluateImpulse(pivots([100,110,104,130,120,138]));
  const observed=E.buildProjectionZones(completed);
  assert.ok(observed.length>=3);
  assert.ok(observed.every(z=>z.kind==='observed'&&z.zoneLow===null&&z.zoneHigh===null));
  const developing=E.evaluateDevelopingImpulse(pivots([100,110,104,130,120]));
  const projected=E.buildProjectionZones(developing);
  assert.ok(projected.length>=6);
  assert.ok(projected.every(z=>z.kind==='projection'&&Number.isFinite(z.price)));
  const abc=E.evaluateZigzag(pivots([120,100,112,85]));
  assert.ok(E.buildProjectionZones(abc).every(z=>z.kind==='observed'));
  ok('Fibonacci output distinguishes forward projections from completed-wave observed ratios');
}

{
  const report=E.auditManualSequence(pivots([120,100,112]),['A','B','C']);
  assert.strictEqual(report.status,'REVIEW');
  assert.ok(report.rules.some(x=>x.id==='EW-MAN-ABC-ORIGIN'&&x.status==='unverified'));
  const full=E.auditManualSequence(pivots([120,100,112,85]),['0','A','B','C']);
  assert.ok(full.rules.some(x=>x.id==='EW-ZZ-01'));
  ok('Manual ABC audit requires origin pivot before testing B-wave invalidation');
}

{
  const candidate=(pattern,directionSign,startIndex,endIndex,prices)=>({id:`${pattern}:${startIndex}:${endIndex}`,pattern,directionSign,direction:directionSign>0?'bullish':'bearish',startIndex,endIndex,pivots:prices.map((price,i)=>({index:startIndex+i,time:(startIndex+i)*60,price,kind:i%2===0?(directionSign>0?'low':'high'):(directionSign>0?'high':'low')})),complete:true,hardRules:[],ruleSummary:{failed:0,unverified:0},internalStructure:{status:'unverified'},evidenceScore:75});
  const w=candidate('zigzag',1,0,3,[100,110,104,120]);
  const x=candidate('zigzag',-1,3,6,[120,114,118,108]);
  const y=candidate('zigzag',1,6,9,[108,116,111,125]);
  const exact=E.composeCombinationCandidates([w,x,y]);
  assert.ok(exact.some(c=>c.pattern==='double_zigzag'&&c.metrics.componentCount===3));
  const xGap=candidate('zigzag',-1,4,7,[119,113,116,107]);
  const yGap=candidate('zigzag',1,7,10,[107,115,110,123]);
  assert.strictEqual(E.composeCombinationCandidates([w,xGap,yGap]).length,0);
  ok('W-X-Y combination requires exact shared pivot boundaries; disjoint legs are rejected');
}

{
  const piv=pivots([100,110,104,130,120,138]);
  const parent=E.evaluateImpulse(piv);
  const childLegs=[];
  const child=(pattern,dir,a,b,id)=>({id,pattern,directionSign:dir,startIndex:a.index,endIndex:b.index,evidenceScore:70,hardRules:[],ruleSummary:{failed:0,unverified:0},internalStructure:{status:'unverified'},status:'provisional'});
  for(let i=0;i<piv.length-1;i++){
    const a=piv[i],b=piv[i+1],dir=Math.sign(b.price-a.price);
    childLegs.push(child(dir>0?'impulse':'zigzag',dir,a,b,`child-${i}`));
  }
  const [attached]=E.attachRecursiveGrammar([parent],childLegs);
  assert.strictEqual(attached.internalStructure.status,'matched');
  assert.strictEqual(attached.status,'provisional');
  assert.ok(attached.internalStructure.legs.every(x=>x.childCandidateId));
  ok('Recursive grammar stays matched/provisional until child grammar is itself verified');
}


{
  const piv=pivots([100,110,104,130,120,138]);
  const parent=E.evaluateImpulse(piv);
  const child=(pattern,dir,a,b,id)=>({id,pattern,directionSign:dir,startIndex:a.index,endIndex:b.index,evidenceScore:70,hardRules:[],ruleSummary:{failed:0,unverified:0},internalStructure:{status:'unverified'},status:'provisional'});
  const children=[];
  for(let i=0;i<piv.length-1;i++){
    const a=piv[i],b=piv[i+1],dir=Math.sign(b.price-a.price);
    children.push(child(i===0||i===4?'diagonal_candidate':dir>0?'impulse':'zigzag',dir,a,b,`ctx-${i}`));
  }
  const [attached]=E.attachRecursiveGrammar([parent],children);
  assert.strictEqual(children[0].contextualRoleEvidence[0].role,'leading_diagonal');
  assert.strictEqual(children[4].contextualRoleEvidence[0].role,'ending_diagonal');
  assert.strictEqual(attached.internalStructure.status,'matched');
  ok('Parent-wave context annotates leading/ending diagonal hypotheses without forcing a source profile');
}


{
  const diag=E.evaluateDiagonal(pivots([100,112,105,115,109,117]));
  diag.contextualRoleEvidence=[{role:'leading_diagonal',parentPattern:'impulse',parentId:'p',parentWave:1}];
  const children=[];
  for(let i=0;i<diag.pivots.length-1;i++){
    const a=diag.pivots[i],b=diag.pivots[i+1],dir=Math.sign(b.price-a.price);
    children.push({id:`lead-${i}`,pattern:i%2===0?'impulse':'zigzag',directionSign:dir,startIndex:a.index,endIndex:b.index,evidenceScore:70,hardRules:[],ruleSummary:{failed:0,unverified:0},internalStructure:{status:'unverified'},status:'provisional'});
  }
  const [result]=E.attachRecursiveGrammar([diag],children);
  assert.deepStrictEqual(result.internalStructure.expected,[5,3,5,3,5]);
  const ending=E.evaluateDiagonal(pivots([100,112,105,115,109,117]));
  ending.contextualRoleEvidence=[{role:'ending_diagonal',parentPattern:'impulse',parentId:'p2',parentWave:5}];
  const threeChildren=children.map((x,i)=>({...x,pattern:'zigzag',id:`end-${i}`}));
  const [endResult]=E.attachRecursiveGrammar([ending],threeChildren);
  assert.deepStrictEqual(endResult.internalStructure.expected,[3,3,3,3,3]);
  ok('Diagonal internal grammar switches by parent role: Leading 5-3-5-3-5, Ending 3-3-3-3-3');
}

{
  const bars=barsFromCloses(Array.from({length:180},(_,i)=>100+Math.sin(i/6)*2+Math.sin(i/2)*.15));
  const full=E.analyze(bars,{atrPeriod:10,thresholdMultiplier:1.2});
  const cut=E.analyze(bars,{atrPeriod:10,thresholdMultiplier:1.2,asOfIndex:119});
  assert.strictEqual(cut.bars.length,120);
  assert.strictEqual(cut.dataSummary.lookaheadProtected,true);
  assert.ok(cut.candidates.every(c=>c.endIndex<=119));
  assert.ok(cut.bars[cut.bars.length-1].time<full.bars[full.bars.length-1].time);
  ok('As-of analysis is sliced before pivot/candidate detection to prevent future-bar leakage');
}

{
  const candidate={direction:'bullish',invalidation:{levels:[{id:'origin',name:'Wave origin',price:100}]}};
  const snapshot={id:'s1',asOfTime:120,candidate,status:'active'};
  const noBreak=E.updateScenarioLifecycle([snapshot],[{time:120,low:101,high:103,close:102}]);
  assert.strictEqual(noBreak[0].status,'active');
  const after=E.updateScenarioLifecycle([snapshot],[{time:120,low:101,high:103,close:102},{time:180,low:98,high:102,close:99}]);
  assert.strictEqual(after[0].status,'invalidated');
  assert.strictEqual(after[0].invalidationEvent.time,180);
  ok('Replay scenario lifecycle checks only bars strictly after the as-of timestamp');
}

console.log(`\n${passed} nhóm kiểm thử Elliott Structure v0.4 đạt`);
