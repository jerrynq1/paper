/* Phần thuần của Kinematics (js/orderflow-kinematics.js, trước dòng "vẽ"): S = High-Low, V có dấu, a = đổi của V, định dạng số */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const full=fs.readFileSync(path.join(__dirname,'..','js','orderflow-kinematics.js'),'utf8'),pure=full.split('/* ===== vẽ ===== */')[0];
const ctx={Math,Number,Array,String,isFinite,JSON,ACT:[],isOn:()=>true};vm.createContext(ctx);
vm.runInContext(pure.replace(/\bconst (\w+)=/g,'var $1=').replace(/\bconst (\w+),/g,'var $1,'),ctx);
let n=0;const ok=x=>console.log('ok  ',x)||n++;const J=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,a+' != '+b);

// ba nến M1: tăng, tăng, giảm (biên độ 10, 14, 8)
ctx.A=[{open:100,high:110,low:100,close:108},{open:108,high:122,low:108,close:120},{open:120,high:121,low:113,close:114}];
let r=J(vm.runInContext('kmCalc(A,60)',ctx));
near(r[0].s,10);near(r[1].s,14);near(r[2].s,8);
ok('S = High - Low của từng nến');
near(r[0].v,10/60);near(r[1].v,14/60);near(r[2].v,-8/60);
ok('V = ±S/Δt, dấu theo thân nến (Close >= Open là +)');
assert.strictEqual(r[0].a,null);near(r[1].a,(14/60-10/60)/60);near(r[2].a,(-8/60-14/60)/60);
ok('a = (V - V trước)/Δt, nến đầu chưa có a');

// đơn vị "nến": Δt = 1 -> khớp ví dụ trong bảng (10, 14, -8 và a = +4, -22)
r=J(vm.runInContext('kmCalc(A,1)',ctx));
assert.deepStrictEqual(r.map(o=>o.v),[10,14,-8]);assert.deepStrictEqual(r.map(o=>o.a),[null,4,-22]);
ok('Δt = 1 nến: V = 10, 14, -8 và a = +4, -22');

// Close == Open (doji) tính là +, nến phẳng cho S = 0
ctx.B=[{open:5,high:6,low:4,close:5},{open:5,high:5,low:5,close:5}];
r=J(vm.runInContext('kmCalc(B,1)',ctx));assert.strictEqual(r[0].v,2);assert.strictEqual(r[1].s,0);assert.strictEqual(r[1].v,0);
ok('doji: dấu +; nến phẳng S = 0');

// thời gian: giây / phút / nến
assert.strictEqual(vm.runInContext('kmDt("s",300)',ctx),300);assert.strictEqual(vm.runInContext('kmDt("m",300)',ctx),5);assert.strictEqual(vm.runInContext('kmDt("b",300)',ctx),1);
ok('kmDt: giây, phút, nến');

// định dạng số
const F=(v,sg,t)=>vm.runInContext(`kmFmt(${v},${sg},${!!t})`,ctx);
assert.strictEqual(F(2.5,0),'2.5');assert.strictEqual(F(-2.5,1),'-2.5');assert.strictEqual(F(2.5,1),'+2.5');
assert.strictEqual(F(0.04166667,1),'+0.0417');assert.strictEqual(F(-0.0042,1),'-0.0042');assert.strictEqual(F(0.00005,0),'0.00005');
assert.strictEqual(F(0,1),'0');assert.strictEqual(F(123.456,0),'123');assert.strictEqual(F(1e-8,0),'1.0e-8');
assert.strictEqual(F(0.04166667,1,true),'+0.042');assert.strictEqual(vm.runInContext('kmFmt(null,1,false)',ctx),'–');
ok('kmFmt: số rất nhỏ vẫn đọc được, có dấu +/-, null -> –');

console.log(n+' kiểm tra đạt');
