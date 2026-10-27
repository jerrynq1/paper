/* ===== Quarterly Theory [QT] (indicator "qt") =====
   Port từ Pine Script "Quarterly Theory [QT]" (MPL-2.0) sang JS thuần cho chart này. Mỗi chu kỳ (Năm, Tháng, Tuần, Ngày, 90 phút, 22.5 phút)
   chia thành 4 phần A (Accumulation), M (Manipulation), D (Distribution), X (Reversal / Continuation) và vẽ thành một làn ngang.
   Khác bản Pine: không mở pane riêng mà vẽ thành thanh các làn nằm trên chart (dưới hoặc trên), thẳng hàng với trục thời gian của nến,
   nên nhìn được nến đang ở phần nào của từng chu kỳ; ô hiện tại được viền nổi, có chú giải; "bây giờ" lấy theo nến cuối (đúng cả khi Replay).
   Sửa so với bản Pine: tuần bắt đầu đúng 00:00 thứ Hai (bản Pine giữ nguyên giờ trong ngày), ngày giao dịch bắt đầu 18:00 New York
   nên sau 18:00 vẫn thấy đúng ô đang chạy. Mọi mốc tính theo giờ New York (server = New York + 7 giờ).
   Phần trên (đến mốc "vẽ") là hàm thuần, được kiểm thử bằng tests/qt.test.js; phần dưới vẽ lên canvas của chart. */

const QT_OFF=25200,QT_DAY=86400,QT_LN={y:"Năm",mo:"Tháng",w:"Tuần",d:"Ngày",m90:"90p",mc:"22.5p"};
const QT_Q=["A","M","D","X"],QT_NM=["Accum","Manip","Distrib","Rev/Con"];

const qtUTC=(y,m,d)=>Date.UTC(y,m,d)/1000;                                   // m tính từ 0; kết quả là "giờ treo tường" New York dạng giây
const qtNthMon=(y,m,n)=>{const dow=new Date(Date.UTC(y,m,1)).getUTCDay();return qtUTC(y,m,1+(8-dow)%7+(n-1)*7)};
const qtMonday=w=>{const d0=Math.floor(w/QT_DAY)*QT_DAY,dow=new Date(d0*1000).getUTCDay();return d0-((dow+6)%7)*QT_DAY};

/* Các làn cho thời điểm nowW (giây, giờ New York). o: {hist,y,mo,w,d,m90,mc}. Mỗi làn: {id, S:[{a,b,q}]}, q = 1..4 */
function qtCycles(nowW,o){
  const L=[],dt=new Date(nowW*1000),yr=dt.getUTCFullYear(),mon=dt.getUTCMonth(),
    tb0=Math.floor((nowW+6*3600)/QT_DAY)*QT_DAY;                              // ngày giao dịch bắt đầu 18:00 hôm trước
  const four=(b,S)=>{for(let q=0;q<4;q++)S.push({a:b[q],b:b[q+1],q:q+1})};
  if(o.y){const S=[];for(let y=o.hist?yr-3:yr;y<=yr;y++)four([0,3,6,9,12].map(m=>qtUTC(y,m,1)),S);L.push({id:"y",S})}
  if(o.mo){const S=[];
    for(let k=o.hist?6:1;k>=0;k--){let m=mon-k,y=yr;while(m<0){m+=12;y--}
      let nm=m+1,ny=y;if(nm>11){nm=0;ny++}
      four([qtNthMon(y,m,1),qtNthMon(y,m,2),qtNthMon(y,m,3),qtNthMon(y,m,4),qtNthMon(ny,nm,1)],S)}
    L.push({id:"mo",S})}
  if(o.w){const S=[],m0=qtMonday(nowW);
    for(let k=o.hist?10:0;k>=0;k--){const t=m0-k*7*QT_DAY;four([0,1,2,3,4].map(i=>t+i*QT_DAY),S)}
    L.push({id:"w",S})}
  if(o.d){const S=[];
    for(let k=o.hist?10:0;k>=0;k--){const t=tb0-k*QT_DAY;four([-6,0,6,12,18].map(i=>t+i*3600),S)}
    L.push({id:"d",S})}
  if(o.m90){const S=[];
    for(let k=o.hist?5:0;k>=0;k--){const t=tb0-k*QT_DAY-6*3600;for(let s=0;s<16;s++)S.push({a:t+s*5400,b:t+(s+1)*5400,q:s%4+1})}
    L.push({id:"m90",S})}
  if(o.mc){const S=[];
    for(let k=o.hist?2:0;k>=0;k--){const t=tb0-k*QT_DAY-6*3600;for(let s=0;s<64;s++)S.push({a:t+s*1350,b:t+(s+1)*1350,q:s%4+1})}
    L.push({id:"mc",S})}
  return L}

/* Giờ server (giây) -> vị trí logic trên trục nến. A = mảng giờ bắt đầu từng nến (tăng dần), tf = độ dài nến.
   Cạnh trái nến i là i-0.5. Trong khoảng trống (cuối tuần) giữ ở cạnh phải của nến trước; sau nến cuối và trước nến đầu suy ra tuyến tính. */
function qtLogical(A,t,tf){
  const n=A.length;if(!n)return 0;
  if(t>=A[n-1])return n-1-.5+(t-A[n-1])/tf;
  if(t<A[0])return -.5-(A[0]-t)/tf;
  let lo=0,hi=n-1;while(lo<hi){const k=(lo+hi+1)>>1;A[k]<=t?lo=k:hi=k-1}
  return lo-.5+Math.min(1,(t-A[lo])/tf)}

/* ===== vẽ ===== */
const qtOn=()=>ACT.find(x=>x.key==="qt"&&isOn(x));
let QTA=null,QTS="";
function drawQT(w,h){
  const a=qtOn();if(!a||!agg.length)return;
  const Q=Object.assign(pdef(IND.qt),a.p),N=agg.length,tf=C.tf,sig=N+"|"+agg[0].st+"|"+agg[N-1].st;
  if(sig!==QTS||!QTA){QTA=agg.map(b=>b.st);QTS=sig}
  const nowSt=agg[N-1].st,lanes=qtCycles(nowSt-QT_OFF,{hist:Q.hist,y:Q.cy,mo:Q.cmo,w:Q.cw,d:Q.cd,m90:Q.c90,mc:Q.cmc});
  if(!lanes.length)return;
  if(Q.pos==="top")lanes.reverse();
  const dark=P.theme==="dark",lh=Math.max(10,Math.round(15*(+Q.size||1))),gap=2,pad=8,total=lanes.length*(lh+gap)-gap,top=Q.pos==="top"?pad:h-pad-total;
  const cardBg=dark?"rgba(14,10,30,.78)":"rgba(255,251,240,.9)",col=j=>cres(a,j),fs=Math.max(8,Math.min(12,lh-5));
  const X=st=>{const x=ts.logicalToCoordinate(qtLogical(QTA,st,tf));return x==null?null:x};
  ctx.save();
  try{
    if(Q.bg){ctx.fillStyle=dark?"rgba(14,10,30,.5)":"rgba(255,251,240,.55)";ctx.beginPath();ctx.roundRect(2,top-3,w-4,total+6,6);ctx.fill()}
    ctx.setLineDash([]);ctx.font=font(fs,1);ctx.textBaseline="middle";ctx.textAlign="center";
    lanes.forEach((ln,idx)=>{
      const y0=top+idx*(lh+gap);
      for(const s of ln.S){
        const xa0=X(s.a+QT_OFF),xb0=X(s.b+QT_OFF);if(xa0==null||xb0==null)continue;
        if(xb0<-30||xa0>w+30||xb0-xa0<1.5)continue;
        const xa=Math.max(-30,xa0),xb=Math.min(w+30,xb0),c=col(s.q-1),cur=Q.now&&nowSt-QT_OFF>=s.a&&nowSt-QT_OFF<s.b;
        ctx.fillStyle=hexA(c,Math.min(1,Q.op+(cur?.3:0)));ctx.beginPath();ctx.roundRect(xa,y0,xb-xa,lh,3);ctx.fill();
        if(cur){ctx.lineWidth=1.5;ctx.strokeStyle=ink();ctx.stroke()}
        else if(Q.brd){ctx.lineWidth=1;ctx.strokeStyle=hexA(c,Math.min(1,Q.op+.35));ctx.stroke()}
        if(Q.lbl){const v0=Math.max(xa,0),v1=Math.min(xb,w),vw=v1-v0;
          if(vw>=14){let t=QT_Q[s.q-1];if(Q.full&&vw>26+ctx.measureText(QT_NM[s.q-1]).width)t=QT_Q[s.q-1]+" · "+QT_NM[s.q-1];
            ctx.fillStyle=cur?ink():dark?"#fff4d9":"#2a1c06";ctx.fillText(t,(v0+v1)/2,y0+lh/2+.5)}}}
      // tên làn
      const nm=QT_LN[ln.id],tw=ctx.measureText(nm).width+10;
      ctx.fillStyle=cardBg;ctx.beginPath();ctx.roundRect(4,y0+1,tw,lh-2,(lh-2)/2);ctx.fill();ctx.lineWidth=1;ctx.strokeStyle=hexA(col(0),.5);ctx.stroke();
      ctx.fillStyle=dark?"#c4b79a":"#7a6740";ctx.fillText(nm,4+tw/2,y0+lh/2+.5)});
    // chú giải
    if(Q.leg){
      ctx.font=font(10,1);const items=QT_Q.map((q,i)=>({t:q+" "+QT_NM[i],c:col(i),w:ctx.measureText(q+" "+QT_NM[i]).width+18}));
      let x=w-6-items.reduce((s,i)=>s+i.w+4,-4);const y=Q.pos==="top"?top+total+6+8:top-6-8;
      ctx.textAlign="left";
      for(const it of items){ctx.fillStyle=cardBg;ctx.beginPath();ctx.roundRect(x,y-8,it.w,16,8);ctx.fill();ctx.lineWidth=1;ctx.strokeStyle=hexA(it.c,.7);ctx.stroke();
        ctx.fillStyle=it.c;ctx.beginPath();ctx.arc(x+8,y,3,0,7);ctx.fill();ctx.fillStyle=dark?"#fff4d9":"#2a1c06";ctx.fillText(it.t,x+14,y+.5);x+=it.w+4}}
  }finally{ctx.restore()}}
