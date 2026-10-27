/* Price Variation Table calculation regression tests. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const els={pvtToggle:{classList:{toggle(){}},addEventListener(){},},pvtPanel:{hidden:true,innerHTML:'',addEventListener(){}},pvtSelection:{style:{}},chart:{style:{},getBoundingClientRect(){return{left:0,width:800}},addEventListener(){}},cw:{getBoundingClientRect(){return{left:0,width:800}}}};
const chart={timeScale(){return{coordinateToTime(){return 0},subscribeVisibleLogicalRangeChange(){}}}};
const ctx={document:{getElementById:id=>els[id]||null},window:{addEventListener(){}},chart,C:{tf:60,sym:'XAUUSD'},agg:[],PDIG:()=>2,Number,Math,Date,Object,Array,String,JSON,console,setInterval:()=>1,clearInterval(){}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','js','price-variation.js'),'utf8'),ctx);
const calc=ctx.window.GexPriceVariationMath.calculate;
const bars=[
 {st:100,time:100,open:100,high:103,low:99,close:101},
 {st:160,time:160,open:101,high:106,low:100,close:105},
 {st:220,time:220,open:105,high:106,low:102,close:103}
];
let r=calc(bars);assert.strictEqual(r.rows.length,3);assert.strictEqual(r.net,2);assert.strictEqual(r.path,6);assert.strictEqual(r.span,7);assert.strictEqual(r.duration,120);assert.ok(Math.abs(r.velocity-2/120)<1e-12);assert.ok(Math.abs(r.eff-100/3)<1e-12);assert.strictEqual(r.rows[0].v,null);assert.ok(Math.abs(r.rows[1].v-4/60)<1e-12);assert.ok(Math.abs(r.rows[2].acc-(-6/60/60))<1e-12);console.log('PASS: net change, path, range, duration, velocity, acceleration and efficiency');
r=calc([{st:100,time:100,open:5,high:5,low:5,close:5}]);assert.strictEqual(r.net,0);assert.strictEqual(r.span,0);assert.strictEqual(r.velocity,0);assert.strictEqual(r.eff,0);assert.strictEqual(r.rows[0].v,null);console.log('PASS: one flat candle has finite zero-valued summary and no fabricated candle velocity');
r=calc([]);assert.strictEqual(r,null);console.log('PASS: empty input safely returns null');
