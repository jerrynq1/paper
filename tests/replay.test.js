/* Phần thuần của replay (js/replay.js, trước dòng "giao diện"): cắt m1, bước tiến/lùi theo M1 hoặc theo nến của khung, dịch con trỏ phát */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const full=fs.readFileSync(path.join(__dirname,'..','js','replay.js'),'utf8'),pure=full.split('/* ===== giao diện ===== */')[0];
const ctx={Math,Number,Array};vm.createContext(ctx);
vm.runInContext(pure.replace(/\bconst (\w+)=/g,'var $1=').replace(/\bconst (\w+),/g,'var $1,'),ctx);
let n=0;const ok=x=>console.log('ok  ',x)||n++;
const bk=(t,tf)=>Math.floor(t/tf)*tf;
const mk=(t0,k)=>Array.from({length:k},(_,i)=>[t0+i*60,1,2,0,1,5]);   // k nến M1 liên tiếp từ t0
ctx.bk=bk;

// rpLower
const A=mk(0,10);
assert.strictEqual(ctx.rpLower(A,0),0);assert.strictEqual(ctx.rpLower(A,61),2);assert.strictEqual(ctx.rpLower(A,540),9);assert.strictEqual(ctx.rpLower(A,541),10);assert.strictEqual(ctx.rpLower([],5),0);
ok('rpLower: chỉ số nến đầu tiên có giờ >= t');

// rpCut: cần đủ nến phía trước (RP_MINPAST), không cắt sau nến cuối
const M=mk(0,100);
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.rpCut(M,50*60))),{i:50});
assert.strictEqual(ctx.rpCut(M,5*60).err,'before');
assert.strictEqual(ctx.rpCut(M,1e9).err,'after');
ok('rpCut: ok / không đủ nến phía trước / sau nến cuối');

// rpPct
assert.strictEqual(ctx.rpPct(5,10),50);assert.strictEqual(ctx.rpPct(5,0),0);assert.strictEqual(ctx.rpPct(20,10),100);
ok('rpPct kẹp 0..100');

// bước theo M1
const F=mk(3600*10+60*57,10);          // bắt đầu 10:57, 10 nến: 10:57..11:06
assert.strictEqual(ctx.rpStepN(F,0,1,1,'m1',3600,bk),1);
assert.strictEqual(ctx.rpStepN(F,0,5,1,'m1',3600,bk),5);
assert.strictEqual(ctx.rpStepN(F,8,5,1,'m1',3600,bk),10);      // quá cuối thì dừng ở cuối
assert.strictEqual(ctx.rpStepN(F,3,1,-1,'m1',3600,bk),2);
assert.strictEqual(ctx.rpStepN(F,0,3,-1,'m1',3600,bk),0);      // không lùi quá điểm bắt đầu
ok('bước theo M1: tiến / lùi / chạm đầu / chạm cuối');

// bước theo nến khung H1: 10:57,58,59 thuộc nến 10h (3 phút), 11:00..11:06 thuộc nến 11h (7 phút)
assert.strictEqual(ctx.rpStepN(F,0,1,1,'tf',3600,bk),3);       // hoàn thành nến 10h
assert.strictEqual(ctx.rpStepN(F,3,1,1,'tf',3600,bk),10);      // cả nến 11h (hết dữ liệu)
assert.strictEqual(ctx.rpStepN(F,1,1,1,'tf',3600,bk),3);       // đang dở giữa nến thì hoàn thành nến đó
assert.strictEqual(ctx.rpStepN(F,0,2,1,'tf',3600,bk),10);
ok('bước theo nến khung: hoàn thành nến dở rồi mới sang nến kế');
assert.strictEqual(ctx.rpStepN(F,10,1,-1,'tf',3600,bk),3);     // bỏ phần đã lộ của nến 11h
assert.strictEqual(ctx.rpStepN(F,6,1,-1,'tf',3600,bk),3);
assert.strictEqual(ctx.rpStepN(F,3,1,-1,'tf',3600,bk),0);
assert.strictEqual(ctx.rpStepN(F,0,1,-1,'tf',3600,bk),0);
ok('lùi theo nến khung: bỏ phần đã lộ của nến hiện tại, không lùi quá điểm bắt đầu');

// rpMove: m1 + fut luôn là chuỗi liền mạch, không nhân đôi/mất nến
const past=mk(0,30),fut=mk(30*60,50),all=past.concat(fut),m=past.slice();
let fi=0;
for(const p of [10,10,3,40,0,50,25,49]){fi=ctx.rpMove(m,fut,fi,p);assert.strictEqual(fi,p);assert.strictEqual(m.length,30+p);assert.deepStrictEqual(m,all.slice(0,30+p))}
assert.strictEqual(ctx.rpMove(m,fut,fi,999),50);assert.strictEqual(ctx.rpMove(m,fut,50,-5),0);
ok('rpMove: tới / lui / nhảy xa luôn khớp m1 = quá khứ + phần đã lộ');

// vòng chạy trọn: từ đầu bước theo H1 tới hết, mỗi bước luôn tiến
let p=0,steps=0;while(p<F.length){const q=ctx.rpStepN(F,p,1,1,'tf',3600,bk);assert(q>p);p=q;steps++}
assert.strictEqual(steps,2);
ok('chạy hết dữ liệu theo nến khung: mỗi bước đều tiến');
console.log('\n'+n+' kiểm tra đạt');
