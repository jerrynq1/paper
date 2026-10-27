/* Kinematics: js/kinematics.js (S = High-Low, V có dấu, a = đổi của V) và 3 chỉ báo kins / kinv / kina khai báo ở indicators-custom.js */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const rd=f=>fs.readFileSync(path.join(__dirname,'..','js',f),'utf8');
const ctx={Math,Number,Array,String,Object,isFinite,JSON,Date,C:{tf:60},ACT:[],isOn:()=>true,baseArr:()=>[],bucket:x=>x};vm.createContext(ctx);
// const/let ở cấp cao nhất không nằm trên global của vm, nên đổi sang var để đọc được từ ngoài
const load=f=>vm.runInContext(rd(f).replace(/^(const|let) /gm,'var '),ctx);
['kinematics.js','indicators-defs.js','indicators-custom.js'].forEach(load);
let n=0;const ok=x=>console.log('ok  ',x)||n++;const J=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,a+' != '+b);
const arr=c=>({o:c.map(x=>x[0]),h:c.map(x=>x[1]),l:c.map(x=>x[2]),c:c.map(x=>x[3])});

// ba nến M1: tăng, tăng, giảm (biên độ 10, 14, 8)
ctx.A=arr([[100,110,100,108],[108,122,108,120],[120,121,113,114]]);
let r=J(vm.runInContext('kmCalc(A,60)',ctx));
near(r.s[0],10);near(r.s[1],14);near(r.s[2],8);
ok('S = High - Low của từng nến');
near(r.v[0],10/60);near(r.v[1],14/60);near(r.v[2],-8/60);
ok('V = ±S/Δt, dấu theo thân nến (Close >= Open là +)');
assert.strictEqual(r.a[0],null);near(r.a[1],(14/60-10/60)/60);near(r.a[2],(-8/60-14/60)/60);
ok('a = (V - V trước)/Δt, nến đầu chưa có a');

r=J(vm.runInContext('kmCalc(A,1)',ctx));
assert.deepStrictEqual(r.v,[10,14,-8]);assert.deepStrictEqual(r.a,[null,4,-22]);
ok('Δt = 1 nến: V = 10, 14, -8 và a = +4, -22');

ctx.B=arr([[5,6,4,5],[5,5,5,5]]);
r=J(vm.runInContext('kmCalc(B,1)',ctx));assert.strictEqual(r.v[0],2);assert.strictEqual(r.s[1],0);assert.strictEqual(r.v[1],0);
ok('doji: dấu +; nến phẳng S = 0');

const dt=(u,t)=>vm.runInContext(`kmDt("${u}",${t})`,ctx);
assert.strictEqual(dt('s',300),300);assert.strictEqual(dt('m',300),5);assert.strictEqual(dt('b',300),1);assert.strictEqual(dt('s',0),1);
ok('kmDt: giây, phút, nến (không bao giờ <= 0)');

// ----- 3 chỉ báo -----
const E={up:'#0f0',dn:'#f00'};ctx.E=E;
const run=(k,p,tf)=>{ctx.C.tf=tf||60;ctx.P=Object.assign(Object.fromEntries(ctx.IND[k].p.map(x=>[x[0],x[2]])),p||{});
  return J(vm.runInContext(`IND.${k}.f(A,P,E,{id:"x",c:IND.${k}.c})`,ctx))};
assert.ok(ctx.IND.kins&&ctx.IND.kinv&&ctx.IND.kina&&!ctx.IND.kin);
assert.deepStrictEqual([ctx.IND.kins.t,ctx.IND.kinv.t,ctx.IND.kina.t],['ov','osc','osc']);
ok('có đủ 3 chỉ báo: S (ov), V (osc), a (osc); bảng cũ đã bỏ');

let s=run('kins',{ml:0});
assert.strictEqual(s.length,1);assert.deepStrictEqual(s[0].d,[10,14,8]);assert.ok(s[0].ps&&s[0].pm.top>=0&&s[0].pm.bottom>=0&&s[0].pm.top+s[0].pm.bottom<1);
ok('kins: một đường S trên thang giá riêng, không đụng thang giá của nến');
s=run('kins',{ml:3});
assert.strictEqual(s.length,2);assert.strictEqual(s[1].ps,s[0].ps);near(s[1].d[0],10);near(s[1].d[1],10*0.5+14*0.5);
ok('kins: thêm đường EMA của S (cùng thang giá), ml = 0 thì tắt');
s=run('kins',{ml:3,sh:30,sb:5});near(s[0].pm.bottom,.05);near(s[0].pm.top,.65);
ok('kins: vị trí vùng vẽ theo % chiều cao và khoảng cách đáy');

s=run('kinv',{tu:'b'});
assert.strictEqual(s.length,1);assert.strictEqual(s[0].k,'h');assert.deepStrictEqual(s[0].d.map(x=>x.v),[10,14,-8]);
assert.deepStrictEqual(s[0].d.map(x=>x.c),['@up','@up','@dn'].map(c=>c==='@up'?E.up:E.dn));
ok('kinv: histogram V, cột xanh khi nến tăng, đỏ khi giảm');
s=run('kinv',{tu:'s'},60);near(s[0].d[0].v,10/60);
ok('kinv: đơn vị giây chia theo khung (M1 = 60s)');

s=run('kina',{tu:'b'});
assert.strictEqual(s[0].k,'l');assert.deepStrictEqual(s[0].d,[null,4,-22]);assert.strictEqual(s.length,1);
ok('kina: một đường a, nến đầu null, mặc định không có MA');
s=run('kina',{tu:'b',mt:'SMA',ml:2});
assert.strictEqual(s.length,2);assert.strictEqual(s[1].d[2],-9);
ok('kina: bật MA làm mượt thì thêm đường SMA của a');

console.log(n+' kiểm tra đạt');
