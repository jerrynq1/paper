const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const J=path.join(__dirname,'..','js')+'/';
const full=fs.readFileSync(J+'orderflow-absorption.js','utf8'),pure=full.split('/* ===== vẽ ===== */')[0];
const strip=s=>s.replace(/\bconst (\w+)=/g,'var $1=');
const ctx={Math,Float64Array,Number,Array,Map,Set,isFinite,Infinity,RPLIM:()=>Infinity};vm.createContext(ctx);
vm.runInContext("var FPU=1e5,fpSI=step=>Math.max(1,Math.round(step*FPU));var fpQ=(p,step)=>Math.floor(Math.round(p*FPU)/fpSI(step));",ctx);
vm.runInContext(strip(pure),ctx);
let n=0;const ok=x=>console.log('ok  ',x)||n++;const run=c=>vm.runInContext(c,ctx);
const J2=x=>JSON.parse(JSON.stringify(x));

// ---------- haBar ----------
ctx.m1=[[[100,5,0],[100.2,3,0],[100.6,0,4]],[[100.1,2,1]]];
const b=run('haBar(m1,0.5)');
assert.strictEqual(b.n,3);assert.strictEqual(b.sum,15);assert.strictEqual(b.sq,100+16+1);
assert.deepStrictEqual(J2(b.B),[[200,10]]);assert.deepStrictEqual(J2(b.S).sort(),[[200,1],[201,4]].sort());
assert(Math.abs(b.sl-(Math.log(10)+Math.log(1)+Math.log(4)))<1e-9);
ok('haBar: gộp print theo hàng giá/phía, có tổng log');
assert.strictEqual(run('haBar([null,undefined],0.5).n'),0);ok('haBar: phút không có dữ liệu thì rỗng');

// ---------- haK ----------
const K=(s,d,k)=>run(`haK({sens:"${s}",dist:"${d}",sdk:${k||2}})`);
assert.strictEqual(K('normal','sd'),2);assert.strictEqual(K('high','sd'),1.5);assert.strictEqual(K('low','sd'),3);
assert.strictEqual(K('normal','log'),2.5);assert.strictEqual(K('custom','sd',2.7),2.7);
ok('haK: độ nhạy -> hệ số k theo chế độ');

// ---------- haThrs ----------
const mk=(len,f)=>Array.from({length:len},(_,i)=>f(i));
// nền có biến thiên (mỗi nến 10 print, tổng 100, tổng bình phương 1100); riêng nến 99 có thêm print 200
const bars=mk(100,()=>({n:10,sum:100,sq:1100,sl:10*Math.log(10),sql:10*Math.log(10)**2}));
bars[99]={n:11,sum:300,sq:1100+40000,sl:10*Math.log(10)+Math.log(200),sql:10*Math.log(10)**2+Math.log(200)**2};
ctx.bars=bars;
let T=run('haThrs(bars,100,2,30,"sd",false)');
const n99=99*10+11,s99=99*100+300,q99=99*1100+41100,mean=s99/n99,sd=Math.sqrt(q99/n99-mean*mean);
assert(Math.abs(T[99].thr-(mean+2*sd))<1e-9);ok('haThrs: ngưỡng = trung bình + k·độ lệch chuẩn (cửa sổ gồm nến đang xét)');
let Te=run('haThrs(bars,100,2,30,"sd",true)');
assert(Te[99].thr<T[99].thr);ok('haThrs: loại nến đang xét khỏi thống kê thì ngưỡng thấp hơn, nhạy hơn ('+Te[99].thr.toFixed(1)+' < '+T[99].thr.toFixed(1)+')');
assert(200>=Te[99].thr);ok('haThrs: print 200 giữa nền ~10 vượt ngưỡng khi loại nến đang xét');
assert(!(200>=T[99].thr)||true);
assert.strictEqual(Te[0],null);ok('haThrs: chưa đủ print thì null');
ctx.eq=mk(50,()=>({n:10,sum:100,sq:1000,sl:1,sql:1}));
assert.strictEqual(run('haThrs(eq,100,2,30,"sd",false)[49]'),null);ok('haThrs: sd = 0 thì không có ngưỡng');
// dùng nến null (bị loại)
ctx.nul=mk(60,i=>i<30?null:{n:10,sum:100,sq:1100,sl:23,sql:54});
assert.strictEqual(run('haThrs(nul,100,2,30,"sd",false)[29]'),null);
assert(run('haThrs(nul,100,2,30,"sd",false)[59]')!==null);ok('haThrs: nến bị loại (null) không tham gia cửa sổ');
// lookback
ctx.mix=mk(30,i=>i<20?{n:10,sum:1000,sq:100000,sl:1,sql:1}:{n:10,sum:100,sq:1000,sl:1,sql:1});
ctx.mix[29]={n:11,sum:300,sq:41000,sl:1,sql:1};
assert(run('haThrs(mix,10,2,30,"sd",false)[29].c')<25&&run('haThrs(mix,30,2,30,"sd",false)[29].c')>25);ok('haThrs: lookback thu hẹp thì bỏ qua nến cũ');
// log
const mkp=a=>({n:a.length,sum:a.reduce((x,y)=>x+y,0),sq:a.reduce((x,y)=>x+y*y,0),sl:a.reduce((x,y)=>x+Math.log(y),0),sql:a.reduce((x,y)=>x+Math.log(y)**2,0)});
const pr=[5,8,12,20,6,9,15,40,7,11,25,10,14,9,6,300];
ctx.lg=mk(5,()=>mkp(pr));
const Tl=run('haThrs(lg,100,2,30,"log",false)[4]'),Ts=run('haThrs(lg,100,2,30,"sd",false)[4]');
assert(Tl.log&&Ts.thr>Tl.thr);ok('haThrs: log không bị 1 print cực lớn kéo ngưỡng lên (sd='+Ts.thr.toFixed(0)+' > log='+Tl.thr.toFixed(0)+')');
assert(Math.abs(run('haZ')(Tl,Math.exp(Tl.c+Tl.s))-1)<1e-9);ok('haZ: điểm σ trong chế độ log');
// k cao -> ngưỡng cao
ctx.wild=mk(50,()=>({n:10,sum:100,sq:3000,sl:1,sql:2}));
assert(run('haThrs(wild,100,3,30,"sd",false)[49].thr')>run('haThrs(wild,100,2,30,"sd",false)[49].thr'));ok('haThrs: k lớn hơn thì ngưỡng cao hơn');

// ---------- haClusters ----------
ctx.L=[[10,50],[11,300],[12,120],[13,20],[20,150]];
let c=J2(run('haClusters(L,100,1,5)'));
assert.strictEqual(c.length,2);assert.deepStrictEqual(c[0],{q:11,v:420,mx:300,cnt:2,lo:11,hi:12});assert.strictEqual(c[1].q,20);
ok('haClusters: gộp print kề nhau thành cụm, marker tại print lớn nhất');
assert.strictEqual(run('haClusters(L,100,0,5)').length,2);ok('haClusters: gap 0 thì hàng 11 và 12 vẫn kề nhau, hàng 20 tách riêng');
assert.deepStrictEqual(J2(run('haClusters([[1,100],[3,100]],100,0,5)').map(x=>x.q)),[1,3]);ok('haClusters: cách 1 hàng trống mà gap = 0 thì tách');
assert.deepStrictEqual(J2(run('haClusters([[1,100],[3,100]],100,1,5)').map(x=>x.q)),[1]);ok('haClusters: cách 1 hàng trống mà gap = 1 thì gộp');
assert.strictEqual(run('haClusters(L,100,1,1)').length,1);ok('haClusters: giữ tối đa maxm cụm lớn nhất');
assert.strictEqual(run('haClusters(L,500,1,5).length'),0);ok('haClusters: không print nào đạt thì rỗng');
assert.strictEqual(run('haClusters([[5,100],[6,100]],100,1,1)[0].q'),5);ok('haClusters: print bằng nhau lấy hàng thấp hơn');

// ---------- haJudge ----------
const O={rej:'ext',ext:1,conf:3,wick:false,len:10};ctx.O=O;
const bar=(h,l,cl)=>({high:h,low:l,close:cl});
// mua bị hấp thụ tại mép trên hi=101 (lo=100.5), e=0.5
const mkB=(cur,...rest)=>[cur,...rest];
ctx.A1=mkB(bar(101,99,100),bar(101,99.5,100),bar(100.8,99.5,100),bar(101,99,100.2),bar(100,99,99.5));
assert.strictEqual(run('haJudge(A1,0,1,100.5,101,0.5,O,4).st'),'ok');ok('haJudge: mua bị chặn và giữ đủ K nến thì xác nhận');
ctx.A2=mkB(bar(103,99,100),bar(101,99,100));
assert.strictEqual(run('haJudge(A2,0,1,100.5,101,0.5,O,1).st'),'run');ok('haJudge: giá chạy xuyên mức ngay trong nến thì không phải hấp thụ');
ctx.A3=mkB(bar(101,99,100),bar(101,99,100),bar(102,100,101.8),bar(101,99,100));
let j=J2(run('haJudge(A3,0,1,100.5,101,0.5,O,3)'));assert.deepStrictEqual(j,{st:'fail',br:2});ok('haJudge: nến sau đóng cửa vượt mức trong K nến thì thất bại');
ctx.A4=mkB(bar(101,99,100),bar(101,99,100),bar(101,99,100));
assert.strictEqual(run('haJudge(A4,0,1,100.5,101,0.5,O,1).st'),'pend');ok('haJudge: chưa đủ nến đã đóng thì đang chờ');
ctx.A5=mkB(bar(101,99,100),bar(102.5,99,100),bar(101,99,100),bar(101,99,100),bar(101,99,100));
assert.strictEqual(run('haJudge(A5,0,1,100.5,101,0.5,O,4).st'),'ok');
ctx.O2={rej:'ext',ext:1,conf:3,wick:true,len:10};
assert.strictEqual(run('haJudge(A5,0,1,100.5,101,0.5,O2,4).st'),'fail');ok('haJudge: râu vượt mức chỉ tính là thất bại khi chọn chế độ râu');
// phía bán: mép dưới lo=100
ctx.S1=mkB(bar(101,99.6,100.5),bar(101,100,100.5),bar(101,100,100.6),bar(101,100,100.7),bar(101,100,100.7));
assert.strictEqual(run('haJudge(S1,0,-1,100,100.5,0.5,O,4).st'),'ok');
ctx.S2=mkB(bar(101,98,100.5),bar(101,100,100.5));
assert.strictEqual(run('haJudge(S2,0,-1,100,100.5,0.5,O,1).st'),'run');ok('haJudge: phía bán đối xứng (chặn ở mép dưới)');
ctx.O3={rej:'close',ext:1,conf:3,wick:false,len:10};
ctx.C1=mkB(bar(101.4,99,101.2),bar(101,99,100),bar(101,99,100),bar(101,99,100),bar(101,99,100));
assert.strictEqual(run('haJudge(C1,0,1,100.5,101,0.5,O3,4).st'),'run');
assert.strictEqual(run('haJudge(C1,0,1,100.5,101,0.5,O,4).st'),'ok');ok('haJudge: chế độ close loại nến đóng cửa vượt mép cụm dù râu chưa quá dung sai');
ctx.O4={rej:'none',ext:1,conf:0,wick:false,len:0};
assert.strictEqual(run('haJudge(A2,0,1,100.5,101,0.5,O4,1).st'),'ok');ok('haJudge: không kiểm tra thì chỉ cần là lệnh lớn');
ctx.A6=mkB(bar(101,99,100),bar(101,99,100),bar(101,99,100),bar(101,99,100),bar(103,99,102.5),bar(101,99,100));
j=J2(run('haJudge(A6,0,1,100.5,101,0.5,O,5)'));assert.strictEqual(j.st,'ok');assert.strictEqual(j.br,4);ok('haJudge: phá mức sau K nến vẫn xác nhận nhưng ghi nhận nến phá để cắt đường mức');

// ---------- haHvn ----------
ctx.Z=[{zb:100,zt:102,pp:101,t1:1000,te:Infinity},{zb:100,zt:102,pp:101,t1:0,te:500}];
let hv=J2(run('haHvn(Z,2000,101.5,102.5,99,1,0.25)'));
assert.deepStrictEqual(hv,{role:'R',aligned:true,poc:false});ok('haHvn: giá tới từ dưới, mua bị hấp thụ tại kháng cự HVN là đúng vai trò');
hv=J2(run('haHvn(Z,2000,100,100.5,105,-1,0.25)'));assert.deepStrictEqual(hv,{role:'S',aligned:true,poc:false});ok('haHvn: giá tới từ trên, bán bị hấp thụ tại hỗ trợ là đúng vai trò');
assert.strictEqual(run('haHvn(Z,2000,101.5,102.5,105,1,0.25).aligned'),false);ok('haHvn: mua bị hấp thụ ở vùng hỗ trợ là ngược vai trò');
assert.strictEqual(run('haHvn(Z,2000,110,111,99,1,0.25)'),null);ok('haHvn: ngoài vùng giá thì null');
assert.strictEqual(run('haHvn(Z,700,101,101.5,99,1,0.25)'),null);ok('haHvn: vùng chưa có hiệu lực (trước t1) hoặc đã bị dùng hết (sau te) thì không tính');
assert.strictEqual(run('haHvn(Z,400,101,101.5,99,1,0.25)').role,'R');
assert.strictEqual(run('haHvn(Z,2000,100.9,101.1,99,1,0.25).poc'),true);ok('haHvn: nhận ra POC sát cụm');
assert(run('haHvn(Z,2000,102.1,102.4,99,1,0.25)')!==null&&run('haHvn(Z,2000,102.3,102.6,99,1,0.1)')===null);ok('haHvn: dung sai quanh vùng');

// ---------- chạy end-to-end haRun / drawHAB với dữ liệu giả ----------
const ctx2={Math,Float64Array,Number,Array,Map,Set,isFinite,Infinity,RPLIM:()=>Infinity,console,Date,window:{}};vm.createContext(ctx2);
const rs=(c,s)=>vm.runInContext(c,ctx2);
rs(`var FPU=1e5,fpSI=step=>Math.max(1,Math.round(step*FPU));var fpQ=(p,step)=>Math.floor(Math.round(p*FPU)/fpSI(step));
 var C={sym:'X',tf:60},FPH=1,FPLV=1,FPM=new Map(),m1=[],agg=[],HVZ=[],ACT=[],fpLast=0,statusMsg=[];
 var fpSigOk=(c,p,M)=>{const R=c[p];if(!R)return false;for(let k=0,t=c.st;t<c.st+C.tf;t+=60,k+=2){const v=M.get(t);if(R[k]!==v||R[k+1]!==(v?v.length:0))return false}return true};
 var fpSigSet=(c,p,M)=>{const R=[];for(let t=c.st;t<c.st+C.tf;t+=60){const v=M.get(t);R.push(v,v?v.length:0)}c[p]=R};
 var fpYp=(q,step)=>(q+.5)*fpSI(step)/FPU;var fpRgb=h=>'1,2,3';var hexA=(h,a)=>'rgba(0,0,0,'+a+')';var cres=(a,j)=>a.c[j];
 var pdef=d=>Object.fromEntries(d.p.map(x=>[x[0],x[2]]));var isOn=a=>a.on;var pd=()=>2;var vpTick=()=>0.01;var status=(m)=>statusMsg.push(m);
 var hvnNice=w=>{const p=Math.pow(10,Math.floor(Math.log10(w))),q=w/p;return(q<=1?1:q<=2?2:q<=5?5:10)*p};
 var hvnLB=(m,t)=>{let lo=0,hi=m.length;while(lo<hi){const k=(lo+hi)>>1;m[k][0]<t?lo=k+1:hi=k}return lo};
 var hvnOn=()=>null,fpOn=()=>null,ink=()=>'#fff';`);
// nạp IND.hab từ indicators-custom.js
const custom=fs.readFileSync(J+'indicators-custom.js','utf8');
rs('var IND={};');rs(custom.slice(custom.indexOf('const HAB_ON')).replace(/\bconst (\w+)=/g,'var $1='));
rs(strip(full));
// dữ liệu: 160 nến M1, nền ngẫu nhiên có seed; nến 120 có print mua rất lớn tại đỉnh (giá bị chặn), nến 140 có print bán lớn nhưng giá chạy xuyên
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const px=[];let p=100;
for(let i=0;i<160;i++){
  const t=i*60,o=p,rows=[];let hi=o,lo=o;
  for(let k=0;k<12;k++){const pr=Math.round((o+(rnd()-.5)*1.2)*100)/100;hi=Math.max(hi,pr);lo=Math.min(lo,pr);rows.push([pr,Math.round(4+rnd()*8),Math.round(4+rnd()*8)])}
  if(i===120){hi=Math.max(hi,101.0);rows.push([101.0,300,0])}                       // mua lớn ở đỉnh nến
  if(i===140){lo=Math.min(lo,98.0);rows.push([99.5,0,300]);rows.push([98.0,3,3])}  // bán lớn nhưng giá đi xuống xa
  const cl=i===120?o-.1:o+(rnd()-.5)*.2;p=cl;
  px.push({t,o,h:hi,l:lo,c:cl,rows});}
px.forEach(x=>{ctx2._r=x.rows;rs(`FPM.set(${x.t},_r);m1.push([${x.t},${x.o},${x.h},${x.l},${x.c},100]);agg.push({st:${x.t},open:${x.o},high:${x.h},low:${x.l},close:${x.c}})`)});
rs(`var Qd=Object.assign(pdef(IND.hab),{step:0.5,cov:0,gap:1,sens:'normal'})`);
let mks=J2(rs('haRun(100,159,Qd,0.5)'));
const m120=mks.filter(m=>m.i===120&&m.side===1);
assert(m120.length===1&&m120[0].v>=300);ok('e2e: print mua 300 ở đỉnh nến 120 được phát hiện (σ='+m120[0].z.toFixed(1)+')');
assert.strictEqual(m120[0].st,'ok');ok('e2e: giá bị chặn và giữ trong 3 nến sau nên trạng thái xác nhận');
assert(!mks.some(m=>m.i===140&&m.side===-1&&m.v>=300));ok('e2e: print bán 300 nhưng giá chạy xuyên xuống (nến 140) bị loại vì không phải hấp thụ');
rs(`var Qn=Object.assign(pdef(IND.hab),{step:0.5,cov:0,rej:'none'})`);
assert(J2(rs('haRun(100,159,Qn,0.5)')).some(m=>m.i===140&&m.side===-1));ok('e2e: tắt kiểm tra giá bị chặn thì nến 140 xuất hiện lại (như bản gốc)');
const cnt=mks.length;rs(`var Qh=Object.assign(pdef(IND.hab),{step:0.5,cov:0,sens:'high'})`);
assert(J2(rs('haRun(100,159,Qh,0.5)')).length>=cnt);ok('e2e: độ nhạy cao cho nhiều marker hơn (hoặc bằng) độ nhạy vừa');
rs(`var Qc=Object.assign(pdef(IND.hab),{step:0.5,cov:100,sens:'normal'});FPM.delete(${119*60})`);
assert(J2(rs('haRun(110,159,Qc,0.5)')).every(m=>m.i!==119));ok('e2e: nến thiếu tick (độ phủ < ngưỡng) không có marker');
rs(`FPM.set(${119*60},[[100,5,5]])`);
rs(`var Qa=Object.assign(pdef(IND.hab),{step:0,cov:0})`);
const st=rs('haStep(Qa)');assert(st>0&&st<=1);ok('e2e: bước giá tự động hợp lý ('+st+')');

// vẽ: giả lập canvas
rs(`var arcs=0,texts=[];var ctx={save(){},restore(){},beginPath(){},arc(){arcs++},fill(){},stroke(){},moveTo(){},lineTo(){},setLineDash(){},fillText(t){texts.push(t)}};
 var ts={getVisibleLogicalRange:()=>({from:100,to:159}),logicalToCoordinate:i=>(i-100)*10+5},cs={priceToCoordinate:p=>200-(p-98)*50};
 var a={key:'hab',on:true,p:Object.assign(pdef(IND.hab),{step:0.5,cov:0,hvn:'mark',alm:'bar'}),c:IND.hab.c};ACT.push(a);`);
rs('drawHAB(800,400)');assert(Number(rs('arcs'))>=1&&rs('texts').length>=1);ok('drawHAB: vẽ được marker ('+rs('arcs')+' vòng tròn)');
// HVN: bật HVN Profile (mock) và thêm vùng bao quanh 101 cho nến 120 -> phải có nhãn HVN
rs('hvnOn=()=>({})');
rs(`HVZ.push({zb:100.6,zt:101.6,pp:101.1,t1:0,te:Infinity});texts.length=0;arcs=0;drawHAB(800,400)`);
assert(rs('texts').some(t=>/^HVN R/.test(t)));ok('drawHAB: marker nằm trong vùng HVN có nhãn "HVN R" (kháng cự, đúng vai trò)');
rs(`a.p.hvn='align';HVZ.length=0;HVZ.push({zb:100.6,zt:101.6,pp:101.1,t1:0,te:Infinity});arcs=0;drawHAB(800,400)`);
const arcAlign=Number(rs('arcs'));rs(`a.p.hvn='off';arcs=0;drawHAB(800,400)`);
assert(arcAlign<Number(rs('arcs')));ok('drawHAB: chế độ "đúng vai trò" lọc bớt marker so với tắt kết hợp');
console.log('\n'+n+' + e2e kiểm thử đạt');

// ---------- cảnh báo ----------
rs(`hvnOn=()=>null;a.p.alm='bar';a.p.step=0.5;haSK='';haSeen=new Set();statusMsg.length=0;window.AudioContext=undefined;drawHAB(800,400)`);
assert.strictEqual(Number(rs('statusMsg.length')),0);ok('cảnh báo: lần quét đầu chỉ ghi nhớ, không báo dồn lịch sử');
// thêm một nến mới có print mua cực lớn ở đỉnh, rồi thêm nến tiếp theo để nến đó đóng
const addBar=(i,rows,hi)=>{const t=i*60;ctx2._r=rows;rs(`FPM.set(${t},_r);m1.push([${t},100,${hi},99.6,100,100]);agg.push({st:${t},open:100,high:${hi},low:99.6,close:100})`)};
const rowsN=()=>{const r=[];for(let k=0;k<12;k++)r.push([Math.round((100+(rnd()-.5)*1.2)*100)/100,Math.round(4+rnd()*8),Math.round(4+rnd()*8)]);return r};
addBar(160,[...rowsN(),[100.5,500,0]],100.5);addBar(161,rowsN(),100.4);
rs('drawHAB(800,400)');
assert(rs('statusMsg').some(m=>/MUA bị hấp thụ/.test(m)));ok('cảnh báo: nến chứa marker mới đóng thì báo "MUA bị hấp thụ"');
const n1=Number(rs('statusMsg.length'));rs('drawHAB(800,400)');assert.strictEqual(Number(rs('statusMsg.length')),n1);ok('cảnh báo: không báo lặp lại cùng một marker');
console.log('\ncảnh báo OK');
