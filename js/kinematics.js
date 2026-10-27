/* ===== Kinematics: phần tính thuần (không đụng DOM) cho 3 chỉ báo S, V, a của từng nến =====
   Chỉ dùng OHLC của nến nên không cần dữ liệu tick, chạy ở mọi khung giờ.
     S = High − Low                          (quãng đường, đơn vị giá, luôn dương)
     V = (Close ≥ Open ? +1 : −1) × S / Δt   (vận tốc, có dấu theo chiều thân nến)
     a = (V − V nến trước) / Δt              (gia tốc; nến đầu tiên chưa có)
   Δt = thời lượng một nến theo đơn vị đã chọn: giây (mặc định) -> V = …/s, a = …/s²; phút; hoặc 1 nến.
   Ba chỉ báo khai báo ở cuối js/indicators-custom.js: kins (S, đường đè lên chart), kinv (V, histogram), kina (a, đường như RSI). */
const kmDt=(u,tf)=>{const d=u==="m"?tf/60:u==="b"?1:tf;return d>0?d:1};
function kmCalc(A,dt){                          // A = {o,h,l,c} (mảng) -> {s,v,a} (mảng cùng độ dài)
  const n=A.c.length,s=new Array(n),v=new Array(n),a=new Array(n);let pv=null;
  for(let i=0;i<n;i++){
    const S=A.h[i]-A.l[i],V=(A.c[i]>=A.o[i]?1:-1)*S/dt;
    s[i]=S;v[i]=V;a[i]=pv==null?null:(V-pv)/dt;pv=V}
  return{s,v,a}}
