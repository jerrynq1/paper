/* Kiểm thử Digital Time Theory overlay: toán học, thời gian, model và Root Candle. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','js','dtt.js'),'utf8');
const elements={
  dttSettings:{addEventListener(){},innerHTML:''},
  dttBtn:{addEventListener(){},classList:{toggle(){}},setAttribute(){}}
};
const localStorage={getItem(){return null},setItem(){}};
const parts=(z,ms)=>{
  const o={};new Intl.DateTimeFormat('en-US',{timeZone:z,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'}).formatToParts(new Date(ms)).forEach(x=>{if(x.type!=='literal')o[x.type]=+x.value});o.hour%=24;return o;
};
const tzOff=(z,ms)=>{const o=parts(z,ms);return Math.round((Date.UTC(o.year,o.month-1,o.day,o.hour,o.minute,o.second)-Math.floor(ms/1000)*1000)/1000)};
const ctx={Math,Number,Array,String,Object,Date,JSON,Intl,Set,Map,Infinity,localStorage,
  $:id=>elements[id]||null,agg:[],C:{tf:60,sym:'TEST'},PDIG:()=>2,s2u:x=>x,u2s:x=>x,
  parts,tzOff,console};
vm.createContext(ctx);vm.runInContext(source,ctx);
const run=s=>vm.runInContext(s,ctx),J=x=>JSON.parse(JSON.stringify(x));
let n=0;const ok=s=>{console.log('ok  ',s);n++};

// ---------- Digital Root / Quote / Tick / OHLC ----------
assert.strictEqual(run('dttDR(0)'),0);
assert.strictEqual(run('dttDR(25726)'),4);
assert.strictEqual(run('dttDR(9)'),9);
assert.strictEqual(run('dttDR(-25726)'),4);
assert.strictEqual(run('dttQuoteRoot(25726,0)'),4);
assert.strictEqual(run('dttQuoteRoot(25725,2)'),3);
assert.strictEqual(run('dttTickCount(25726,.25,0)'),102904);
const v=J(run('dttRootVector({open:25725,high:25726,low:25724.25,close:25725.5},.25,0,2)'));
assert.deepStrictEqual(v.quote,[3,4,9,8]);
assert.deepStrictEqual(v.tick,[3,7,9,5]);
assert.deepStrictEqual(v.shape,[7,2,2,3]);
assert.strictEqual(v.tickComposite,6);
assert.strictEqual(v.quoteComposite,6);
assert.strictEqual(run('dttHHMMRoot(10,23)'),6);
assert.strictEqual(run('dttHHMMRoot(11,16)'),9);
assert.strictEqual(run('dttRootGroup(9)'), 'SCALER');
assert.strictEqual(run('dttRootGroup(7)'), 'VECTOR');
assert.strictEqual(run('dttRootRelation(9,6)'), 'GROUP MATCH');
assert.strictEqual(run('dttRootRelation(4,9)'), 'CROSS-GROUP');
ok('DR / Quote / Tick / OHLC / Shape / Composite / Time Root');

// ---------- Mốc Root Candle: Model 111 và Nagasaki ----------
const dayKey=run('dttDayKey({year:2026,month:10,day:30})');
const m111=run(`dttRootTime(${dayKey},844,849,960,"America/New_York")`);
const p111=J(run(`dttTimeParts(${m111},"America/New_York")`));
assert.deepStrictEqual([p111.year,p111.month,p111.day,p111.hour,p111.minute],[2026,10,30,14,4]);
const naga=run(`dttRootTime(${dayKey},4,1384,120,"America/New_York")`);
const pn=J(run(`dttTimeParts(${naga},"America/New_York")`));
assert.deepStrictEqual([pn.year,pn.month,pn.day,pn.hour,pn.minute],[2026,10,31,0,4]);
ok('Root time cùng ngày cho Model 111; qua nửa đêm đúng cho Nagasaki');

// ---------- Cache lịch sử intraday + Root Candle không nở theo nến sau ----------
const start=Date.UTC(2026,9,30,0,0,0)/1000,end=Date.UTC(2026,10,2,0,0,0)/1000;
ctx.agg=[];
for(let t=start;t<end;t+=60){const i=(t-start)/60;ctx.agg.push({st:t,open:100,high:100+(i%7)/10,low:99-(i%5)/10,close:100.05})}
ctx.C.tf=60;run('DTT.options.historyDays=365;DTT.options.timeZone=\"America/New_York\"');
let cache=run('dttBuildCache()');
const roots=cache.roots;
const r111=roots.find(x=>x.name==='MODEL 111 ROOT'&&x.start===m111);
assert.ok(r111,'Model 111 root box must be on Oct 30 14:04 NY');
assert.ok(r111.end>r111.start,'Root box must extend to parent session end');
const pEnd111=J(run(`dttTimeParts(${r111.end},"America/New_York")`));
assert.deepStrictEqual([pEnd111.year,pEnd111.month,pEnd111.day,pEnd111.hour,pEnd111.minute],[2026,10,30,16,0]);
const rn=roots.find(x=>x.name==='NAGASAKI ROOT'&&x.start===naga);
assert.ok(rn,'Nagasaki root box must cross midnight to Oct 31 00:04 NY');
const before=r111.high;
const live=ctx.agg[ctx.agg.length-1];live.high=999;live.low=1;
const data={boxes:cache.boxes,roots:cache.roots};ctx.__testData=data;
run('dttPatchLiveBar(__testData)');
const after=r111.high;
assert.strictEqual(after,before,'later bars must not enlarge an earlier Root Candle');
// Root candle may still evolve while the actual root bar is live.
const idx=ctx.agg.findIndex(x=>x.st===m111);assert.ok(idx>=0);
ctx.agg[ctx.agg.length-1]=ctx.agg[idx];ctx.agg[ctx.agg.length-1].high=before+10;ctx.agg[ctx.agg.length-1].low=ctx.agg[idx].low;
run('dttPatchLiveBar(__testData)');
assert.strictEqual(r111.high,before+10);
ok('Intraday history / Model 111 / Nagasaki / live patch chỉ tác động đúng Root Candle');

// ---------- Weekly macro also generated on D1 ----------
const sunday=Date.UTC(2026,9,25)/86400000;
const weekStart=run(`dttUtcAt(${sunday},1020,"America/New_York")`);
ctx.agg=[];for(let i=0;i<14;i++){const st=weekStart+i*86400;ctx.agg.push({st,open:100,high:101+i,low:99-i,close:100+i})}
ctx.C.tf=86400;run('DTT.options.historyDays=365;DTT.options.showWeekly=true;DTT.options.showYearly=true;');
cache=run('dttBuildCache()');
assert.ok(cache.roots.some(x=>x.name==='WEEKLY ROOT'),'weekly Root Candle should appear on D1');
assert.ok(cache.boxes.some(x=>x.name==='ISCARIOT'),'weekly macro boxes should appear on D1');
ok('Weekly macro and weekly Root Candle render on D1');

// ---------- Canvas render hook and dashboard stay isolated from chart series ----------
let drawOps=0;const fakeCtx={save(){},restore(){},setLineDash(){},fillRect(){drawOps++},strokeRect(){drawOps++},beginPath(){},moveTo(){},lineTo(){},stroke(){drawOps++},fillText(){drawOps++}};
const chartEl={appendChild(el){this.child=el}};
ctx.$=id=>id==='chart'?chartEl:elements[id]||null;
ctx.document={createElement(){return{style:{},dataset:{},setAttribute(){},className:'',innerHTML:''}}};
ctx.ctx=fakeCtx;ctx.__weekStart=weekStart;ctx.ts={logicalToCoordinate:x=>50+(x-ctx.__weekStart)/86400*20};ctx.s2l=x=>x;ctx.cs={priceToCoordinate:p=>160-p};ctx.u2s=x=>x;
ctx.C.tf=86400;run('DTT.options.enabled=true;DTT.options.showDashboard=true');
run('drawDTT(800,500)');
assert.ok(drawOps>0,'DTT must draw boxes/markers into the existing overlay canvas');
assert.strictEqual(run('DTT.dash.style.display'),'block','Dashboard should be visible when enabled');
run('DTT.options.enabled=false;drawDTT(800,500)');
assert.strictEqual(run('DTT.dash.style.display'),'none','Disabling DTT must hide dashboard');
ok('Canvas overlay / dashboard toggle render without touching candle series');

console.log(`\n${n} nhóm DTT test đạt`);
