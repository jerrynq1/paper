/* Price Variation calculation regression tests without requiring the full chart DOM. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'..','js','price-variation.js'),'utf8');
const match=src.match(/ function calc\(bars\)\{[\s\S]*?\n \}/);
assert(match,'Could not locate the pure calc(bars) function in price-variation.js');
const calc=new Function('finite','stamp','chartStamp','C',match[0]+';return calc')(Number.isFinite,b=>b.time,b=>b.time,{tf:60});
const bars=[
 {st:100,time:100,open:100,high:103,low:99,close:101},
 {st:160,time:160,open:101,high:106,low:100,close:105},
 {st:220,time:220,open:105,high:106,low:102,close:103}
];
const r=calc(bars);
assert.strictEqual(r.rows.length,3);assert.strictEqual(r.net,2);assert.strictEqual(r.path,6);assert.strictEqual(r.span,7);assert.strictEqual(r.duration,120);
assert.ok(Math.abs(r.velocity-2/120)<1e-12);assert.ok(Math.abs(r.eff-100/3)<1e-12);assert.strictEqual(r.rows[0].v,null);assert.ok(Math.abs(r.rows[1].v-4/60)<1e-12);assert.ok(Math.abs(r.rows[2].acc-(-6/60/60))<1e-12);
console.log('PASS: price variation net/path/range/duration/velocity/acceleration/efficiency');
const flat=calc([{st:100,time:100,open:5,high:5,low:5,close:5}]);assert.strictEqual(flat.net,0);assert.strictEqual(flat.span,0);assert.strictEqual(flat.velocity,0);assert.strictEqual(flat.eff,0);
assert.throws(()=>calc([]));console.log('PASS: flat input; empty-array guard belongs to the exported wrapper API');
