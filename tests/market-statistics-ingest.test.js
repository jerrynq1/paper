"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const C=require("../js/market-statistics-core.js");
const script=fs.readFileSync(path.join(__dirname,"../js/market-statistics.js"),"utf8");
const serverToUtc=sec=>sec-2*3600;
const context=vm.createContext({
  window:{MarketStatsCore:C},
  document:{getElementById:()=>null},
  CT:{sym:{id:77}},
  m1:[[1704724200,100,105,99,104,123456],[1704724260,104,108,103,107,888888]],
  s2u:serverToUtc,
  console,Date,Intl,Map,Set,Array,Number,String,Math,Float64Array,Promise,Error,IDBKeyRange:{only:x=>x}
});
vm.runInContext(script,context);
const api=context.window.MarketStatistics;
const decoded=api.decodeTrendbar({utcTimestampInMinutes:28401120,low:1700000000,deltaOpen:50000,deltaHigh:200000,deltaClose:150000,volume:987654321});
assert.deepStrictEqual(Array.from(decoded),[28401120*60000,17000.5,17002,17000,17001.5]);
const ok=api.chartM1Rows(77);
assert.strictEqual(ok.rows.length,2);
assert.strictEqual(ok.rows[0].length,5,"imported rows contain timestamp + OHLC only");
assert.strictEqual(ok.rows[0][0],Math.floor(serverToUtc(1704724200)/60)*60000,"server timestamp is converted to UTC milliseconds");
assert.deepStrictEqual(Array.from(ok.rows[0].slice(1)),[100,105,99,104]);
const mismatch=api.chartM1Rows(88);
assert.strictEqual(mismatch.rows.length,0);
assert.match(mismatch.reason,/khác mã/);

// DST fall-back: first and second 08:00 server-clock hours must remain distinct in UTC.
const fallAt=Date.UTC(2024,10,3,8,0)/1000;
const fallBars=[];
for(let i=-1;i<60;i++){const ss=fallAt+i*60;fallBars.push([ss,100,101,99,100,777]);}
for(let i=0;i<3;i++){const ss=fallAt+i*60;fallBars.push([ss,101,102,100,101,999]);}
context.m1=fallBars;
context.s2u=sec=>sec>=fallAt?sec-2*3600:sec-3*3600;
const fall=api.chartM1Rows(77);
assert.strictEqual(fall.rows.length,64);
for(let i=1;i<fall.rows.length;i++)assert.strictEqual(fall.rows[i][0]-fall.rows[i-1][0],60000,"DST fallback minutes remain unique and chronological");
console.log("market-statistics-ingest: all tests passed");
