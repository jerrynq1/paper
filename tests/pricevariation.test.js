const fs=require('fs'),path=require('path'),assert=require('assert');
const doc={getElementById:()=>({})};
const src=fs.readFileSync(path.join(__dirname,'..','js','price-variation.js'),'utf8');
// công cụ thoát sớm khi thiếu DOM, nên trích phần calc để test
const m=src.match(/ function calc\(bars\)\{[\s\S]*?\n \}\n/);
const ctx={finite:Number.isFinite,stamp:b=>b.time,chartStamp:b=>b.time,C:{tf:60}};
const calc=new Function('finite','stamp','chartStamp','C',m[0]+';return calc')(ctx.finite,ctx.stamp,ctx.chartStamp,ctx.C);
const B=[[100,0],[110,60],[105,120],[120,180]].map(([c,t])=>({time:t,close:c,high:c+2,low:c-2}));
const d=calc(B);
assert.strictEqual(d.net,20);assert.strictEqual(d.path,30);assert.ok(Math.abs(d.eff-66.6667)<1e-3);
assert.strictEqual(d.up,2);assert.strictEqual(d.down,1);assert.strictEqual(d.pull,5);assert.strictEqual(d.pullRatio,25);
assert.strictEqual(d.kv.i,4);
console.log('ok   pricevariation: net/path/eff/up-down/pullback');
