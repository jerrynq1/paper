"use strict";
const assert=require("assert");
const C=require("../js/market-statistics-core.js");
const utc=(y,m,d,h,mi=0)=>Date.UTC(y,m-1,d,h,mi);
const bar=(t,o,h,l,c)=>[t,o,h,l,c,1];

// New York DST conversion: 09:30 ET is 14:30 UTC in winter and 13:30 UTC in summer.
assert.deepStrictEqual([C.etParts(utc(2024,1,8,14,30)).hour,C.etParts(utc(2024,1,8,14,30)).minute],[9,30]);
assert.deepStrictEqual([C.etParts(utc(2024,7,8,13,30)).hour,C.etParts(utc(2024,7,8,13,30)).minute],[9,30]);

// RTH ignores overnight Asia/London bars and starts exactly at 09:30 ET.
const rthBars=[
  bar(utc(2024,1,8,8,0),100,105,99,104),
  bar(utc(2024,1,8,14,29),104,106,103,105),
  bar(utc(2024,1,8,14,30),105,110,104,109),
  bar(utc(2024,1,8,14,50),109,115,108,114),
  bar(utc(2024,1,8,15,50),114,116,112,113),
  bar(utc(2024,1,8,21,0),113,120,110,119)
];
const rth=C.buildSessions(rthBars,"RTH");
assert.strictEqual(rth.length,1);
assert.strictEqual(rth[0].bars,3);
assert.strictEqual(rth[0].open,105);
assert.strictEqual(rth[0].high,116);
assert.strictEqual(rth[0].low,104);
assert.strictEqual(rth[0].macros.m0950.bars,1);
assert.strictEqual(rth[0].macros.m1050.bars,1);

// ETH session mapping: Sunday 18:00 ET is the Monday trade date; Monday 00:00 belongs to Monday.
const ethBars=[bar(utc(2024,1,7,23,0),100,102,99,101),bar(utc(2024,1,8,5,0),101,104,100,103),bar(utc(2024,1,8,14,50),103,108,102,107),bar(utc(2024,1,8,21,30),107,110,106,109)];
const eth=C.buildSessions(ethBars,"ETH");
assert.strictEqual(eth.length,1);
assert.strictEqual(eth[0].date,"2024-01-08");
assert.strictEqual(eth[0].bars,4);
assert.strictEqual(eth[0].macros.m0950.bars,1);

// Hierarchical output and daily strong/light flags, ADR20, hour distribution and forecast are populated.
const rows=[];
for(let day=8;day<25;day++){
  const date=new Date(Date.UTC(2024,0,day));
  const wd=date.getUTCDay();if(wd===0||wd===6)continue;
  const d=date.getUTCDate();
  for(let i=0;i<390;i++){
    const start=utc(2024,1,d,14,30);
    const t=start+i*60000;
    const base=1000+d*2+i*.01, amp=(d%5===0?8:d%3===0?3:1);
    rows.push(bar(t,base,base+amp,base-amp*.6,base+amp*.2));
  }
}
const sessions=C.buildSessions(rows,"RTH");
const result=C.analyzeSessions(sessions,{mode:"RTH",minCoverage:.5,now:utc(2024,1,25,14,0)});
assert(result.sessions.length>=10);
assert(result.daily.q75>=result.daily.q25);
assert(result.yearRows.length===1);
assert(result.monthSeasonRows.length===1);
assert(result.weekRows.length>=2);
assert(result.hourRows.length>=6);
assert(result.macroRows.length===2);
assert(result.forecast.candidates.length>0);
assert.strictEqual(new Set(C.makeFutureCandidates("RTH",utc(2024,1,8,13,0),5).map(x=>x.date)).size,5);
assert(Number.isNaN(result.sessions[0].adrRatio));
assert(result.sessions.slice(1).every(x=>Number.isFinite(x.adrRatio)));
const mixed=C.analyzeSessions(sessions.concat([{...sessions[sessions.length-1],date:"2024-01-26",bars:160,coverage:160/390,range:100,high:1200,low:1100,open:1110,close:1190,hours:[],windows20:[],macros:{},weekday:5,expected:390}]),{mode:"RTH",minCoverage:.4,now:utc(2024,1,26,22)});
assert.strictEqual(mixed.sessions.at(-1).qualified,false);
assert.strictEqual(mixed.sessions.at(-1).strong,null);
assert.strictEqual(mixed.forecast.regimeAsOf,"2024-01-24");


// Volume is not part of the volatility calculation: identical OHLC must produce identical results.
const sameOHLC1=C.buildSessions([bar(utc(2024,1,8,14,30),100,110,95,108,1)],"RTH")[0];
const sameOHLC2=C.buildSessions([bar(utc(2024,1,8,14,30),100,110,95,108,999999)],"RTH")[0];
assert.strictEqual(sameOHLC1.range,sameOHLC2.range);
assert.strictEqual(sameOHLC1.bodyEfficiency,sameOHLC2.bodyEfficiency);
assert.strictEqual(Object.prototype.hasOwnProperty.call(sameOHLC1,"volume"),false);

// No bars before the 09:30 ET RTH open can be counted.
assert.strictEqual(C.sessionInfo(utc(2024,1,8,14,29),"RTH"),null);
assert.strictEqual(C.sessionInfo(utc(2024,1,8,14,30),"RTH").elapsed,0);

console.log("market-statistics: all tests passed");
