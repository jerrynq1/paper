/* ===== Kinematics (indicator "kin"): quãng đường S, vận tốc V, gia tốc a của TỪNG nến =====
   Hiển thị y như Statistic: bảng dưới chart, mỗi nến một cột, mỗi dòng một đại lượng (S, V, a).
   Chỉ dùng OHLC của nến nên không cần dữ liệu tick, chạy ở mọi khung giờ.
     S = High − Low                          (quãng đường, đơn vị giá, luôn dương)
     V = (Close ≥ Open ? +1 : −1) × S / Δt   (vận tốc, có dấu theo chiều thân nến)
     a = (V − V nến trước) / Δt              (gia tốc; nến đầu tiên chưa có)
   Δt = thời lượng một nến theo đơn vị đã chọn: giây (mặc định) -> V = …/s, a = …/s²; phút; hoặc 1 nến. */
const kmOn=()=>ACT.find(x=>x.key==="kin"&&isOn(x));
const KMR=[                                   // khóa, nhãn [vi,en,zh] (đuôi đơn vị thêm lúc vẽ), có dấu
 ["s",["S","S","S"],0],["v",["V","V","V"],1],["a",["a","a","a"],1]];
const KMU={s:["/s","/s²"],m:["/min","/min²"],b:["/nến","/nến²"]};
const kmDt=(u,tf)=>u==="m"?tf/60:u==="b"?1:tf;
function kmCalc(arr,dt){                      // phần thuần: mảng nến -> [{s,v,a}]
  const out=new Array(arr.length);let pv=null;
  for(let i=0;i<arr.length;i++){
    const c=arr[i],S=c.high-c.low,V=(c.close>=c.open?1:-1)*S/dt;
    out[i]={s:S,v:V,a:pv==null?null:(V-pv)/dt};pv=V}
  return out}
function kmN(a){                              // số dương -> chuỗi gọn, giữ ~3-4 chữ số có nghĩa (V, a thường rất nhỏ khi tính theo giây)
  if(a===0)return"0";if(a<1e-6)return a.toExponential(1);
  const s=a.toFixed(a>=100?0:a>=10?1:a>=1?2:a>=.1?3:a>=.01?4:a>=.001?5:6);
  return s.indexOf(".")<0?s:s.replace(/\.?0+$/,"")}
function kmFmt(v,sg,tight){
  if(v==null||!isFinite(v))return"–";
  const a=Math.abs(v),sn=v<0?"-":(sg&&v>0?"+":"");
  return sn+kmN(tight?+a.toPrecision(2):a)}
/* ===== vẽ ===== */
const kmEl=document.createElement("div");kmEl.id="kmp";kmEl.className="stp";kmEl.style.display="none";kmEl.innerHTML="<canvas></canvas>";
(document.getElementById("stp")||$("panes")).after(kmEl);   // nằm ngay dưới Statistic (nếu đang bật), không thì dưới chart
let KMC=null;
function kmPrep(a){
  const Q=Object.assign(pdef(IND.kin),a.p),l=agg[agg.length-1];
  const key=[C.sym,C.tf,agg.length,agg[0].st,l.open,l.high,l.low,l.close,Q.tu,Q.sdk,Q.s,Q.v,Q.a].join("|");
  if(KMC&&KMC.key===key)return KMC;
  const out=kmCalc(agg,kmDt(Q.tu,C.tf)),ref={};
  for(const [k] of KMR){if(!Q[k])continue;let n=0,m=0;for(const o of out)if(o[k]!=null){n++;m+=Math.abs(o[k])}
    if(!n){ref[k]=1;continue}m/=n;let v=0;for(const o of out)if(o[k]!=null)v+=(Math.abs(o[k])-m)**2;ref[k]=Math.max(1e-12,m+Q.sdk*Math.sqrt(v/n))}   // mức "đậm tối đa" = trung bình + k × độ lệch chuẩn của |giá trị| (giống Statistic)
  return KMC={key,out,ref}}
function drawKM(){
  const a=kmOn();
  if(!a||!agg.length){if(kmEl.style.display!=="none")kmEl.style.display="none";return}
  const Q=Object.assign(pdef(IND.kin),a.p),rows=KMR.filter(r=>Q[r[0]]);if(Q.inv)rows.reverse();
  const rh=Math.max(12,Math.round(Q.rh)),H=Math.max(rows.length,1)*rh+4;
  if(kmEl.style.display==="none")kmEl.style.display="";
  if(kmEl.style.height!==H+"px")kmEl.style.height=H+"px";
  const cvs=kmEl.firstChild,dp=devicePixelRatio||1,W=kmEl.clientWidth;if(!W)return;
  if(cvs.width!==Math.round(W*dp)||cvs.height!==Math.round(H*dp)){cvs.width=Math.round(W*dp);cvs.height=Math.round(H*dp)}
  const x=cvs.getContext("2d");x.setTransform(dp,0,0,dp,0,0);x.clearRect(0,0,W,H);
  const tx=COL().tx,mono="Consolas,ui-monospace,Menlo,monospace";
  if(!rows.length){x.fillStyle=tx;x.font="12px system-ui,sans-serif";x.textAlign="left";x.textBaseline="middle";x.fillText(dl("Kinematics: chưa bật dòng nào","Kinematics: no rows enabled","Kinematics：未启用任何行"),10,H/2);return}
  const S=kmPrep(a),lr=ts.getVisibleLogicalRange();if(!lr)return;
  const pw=chart.priceScale("right").width(),gx=Math.max(0,W-pw),i0=Math.max(0,Math.floor(lr.from)-1),i1=Math.min(agg.length-1,Math.ceil(lr.to)+1);
  const xa=ts.logicalToCoordinate(i0),xb=ts.logicalToCoordinate(i0+1),bs=xa!=null&&xb!=null?xb-xa:0;if(bs<=0)return;
  const A=fpRgb(cres(a,0)),B=fpRgb(cres(a,1)),ink_=ink(),fs=Math.min(Q.fs,rh-3),TH=fpRgb(cres(a,2)),thT=(q=>(q[0]*299+q[1]*587+q[2]*114)/1000>150?"#0b0e1a":"#ffffff")(TH.split(",").map(Number));
  x.save();x.beginPath();x.rect(0,0,gx,H);x.clip();x.textBaseline="middle";x.textAlign="center";x.font=fs+"px "+mono;
  for(let i=i0;i<=i1;i++){
    const o=S.out[i];if(!o)continue;const xc=ts.logicalToCoordinate(i);if(xc==null)continue;
    rows.forEach((r,ri)=>{
      const k=r[0],v=o[k];if(v==null)return;const y=2+ri*rh,sg=r[2];
      const col=sg?(v>=0?A:B):"152,162,216";
      const u=Math.min(1,Math.abs(v)/S.ref[k]);
      const ht=Q["th_"+k]>0&&Math.abs(v)>=Q["th_"+k];x.fillStyle=ht?`rgba(${TH},.9)`:`rgba(${col},${(.08+.62*u)*Q.op})`;x.fillRect(xc-bs/2+.5,y,Math.max(1,bs-1),rh-1);
      if(u>=1&&!ht){x.strokeStyle=`rgba(${col},.9)`;x.lineWidth=1;x.strokeRect(xc-bs/2+1,y+.5,Math.max(1,bs-2),rh-2)}
      if(bs>=16){if(ht)x.font="bold "+fs+"px "+mono;let s=kmFmt(v,sg,false);if(x.measureText(s).width>bs-3)s=kmFmt(v,sg,true);if(x.measureText(s).width<=bs-3){x.fillStyle=ht?thT:ink_;x.fillText(s,xc,y+rh/2)}if(ht)x.font=fs+"px "+mono}
    });
  }
  x.restore();
  if(Q.lbl){const hs=Math.min(Q.hs||10,rh-2),un=KMU[Q.tu]||KMU.s;x.save();x.beginPath();x.rect(gx,0,Math.max(0,W-gx),H);x.clip();if(Q.hbg){x.globalAlpha=.07;x.fillStyle=ink_;rows.forEach((r,ri)=>x.fillRect(gx+1,2+ri*rh,W-gx-1,rh-1));x.globalAlpha=1}x.font=hs+"px system-ui,sans-serif";x.textAlign="left";x.textBaseline="middle";x.fillStyle=tx;
    rows.forEach((r,ri)=>x.fillText(dl(r[1][0],r[1][1],r[1][2])+(r[0]==="v"?" "+un[0]:r[0]==="a"?" "+un[1]:""),gx+4,2+ri*rh+rh/2));x.restore()}
}
