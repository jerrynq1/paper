const assert=require('assert');
const E=require('../js/elliott-structure-engine.js');
let passed=0;const ok=s=>{console.log('ok  ',s);passed++};
const rule={id:'R',status:'pass'};
function c(id,degreeIndex,pattern='impulse'){
  return{id, candidateKey:`${id}@degree-${degreeIndex+1}`,degreeIndex,degreeId:`degree-${degreeIndex+1}`,
    pattern,direction:'bullish',directionSign:1,startIndex:10,endIndex:80,startTime:10,endTime:80,
    evidenceScore:70,hardRules:[rule],ruleSummary:{passed:1,failed:0,unverified:0},
    internalStructure:{status:'matched'},complete:true,pivots:[],
    recursiveGrammar:{status:'matched',matchedLegs:1,totalLegs:1,legs:[]},parentCandidateKeys:[]};
}
{
  const child=c('child',0,'zigzag'),parent=c('parent',1,'impulse');
  parent.recursiveGrammar.legs=[{wave:1,expected:'3',status:'matched-child-pattern',childCandidateKey:child.candidateKey,childCandidateId:child.id}];
  const ranked=E.addScaleAgreement([[child],[parent]],[{id:'degree-1'},{id:'degree-2'}],1,100);
  assert.strictEqual(ranked.length,2,'both fine and parent degrees must remain in the graph');
  assert.strictEqual(child.parentSupport,1,'the child must retain its parent relationship');
  assert.ok(parent.childSupport>0,'the parent must score its child subdivision');
  assert.ok(child.hierarchyDiagnostics.parentCandidateKeys.includes(parent.candidateKey));
  assert.ok(parent.hierarchyScore>0&&child.hierarchyScore>0);
  ok('Bidirectional hierarchy: parent count consumes child grammar and child count retains parent support');
}
{
  const bars=Array.from({length:457},(_,i)=>{
    const close=4000+55*Math.sin(i/17)+24*Math.sin(i/4.4)+i*.06;
    const prev=i?4000+55*Math.sin((i-1)/17)+24*Math.sin((i-1)/4.4)+(i-1)*.06:close;
    return{time:i*60,open:prev,high:Math.max(prev,close)+2.5,low:Math.min(prev,close)-2.5,close,volume:100};
  });
  const result=E.analyze(bars);
  assert.ok(result.candidateForest.length>=result.candidates.length);
  assert.ok(new Set(result.candidateForest.map(x=>x.degreeIndex)).size>=3,'candidates from several scales must be retained');
  assert.ok(result.candidateForest.every(x=>Number.isFinite(x.hierarchyScore)));
  assert.ok(result.candidateForest.every(x=>Array.isArray(x.recursiveGrammar?.legs)||!x.recursiveGrammar),'recursive wave legs must be inspectable');
  assert.ok(result.candidateForest.some(x=>x.parentSupport>0),'at least one child hypothesis should be linked upward');
  assert.ok(result.candidateForest.some(x=>x.childSupport>0),'at least one parent hypothesis should use lower-degree evidence');
  ok('End-to-end candidate forest retains all degrees and uses parent and child evidence in both directions');
}
{
  const fs=require('fs'),path=require('path');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'..','js','elliott-structure-ui.js'),'utf8');
  assert.ok(/id="eXZoom"/.test(html)&&/id="eXZoomReset"/.test(html));
  assert.ok(/viewStart/.test(ui)&&/childCandidateKey/.test(ui));
  assert.ok(/parentCounts/.test(ui)&&/childCounts/.test(ui));
  ok('X-axis zoom, viewport-aware drag mapping, and parent/child context overlays are wired into the isolated Elliott view');
}
console.log(`\n${passed} nhóm kiểm thử Elliott hierarchy v0.7 đạt`);
