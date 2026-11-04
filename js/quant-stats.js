/* Quantitative Research · pure statistical helpers (no DOM dependency).
   First MVP scope: CSV parsing, descriptive statistics, returns, correlation, histogram. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuantStats=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=v=>Number.isFinite(Number(v));
  const clean=a=>a.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(Number).filter(Number.isFinite);
  const sum=a=>a.reduce((s,x)=>s+x,0);
  const mean=a=>a.length?sum(a)/a.length:NaN;
  const quantile=(sorted,p)=>{
    if(!sorted.length)return NaN;
    const h=(sorted.length-1)*Math.max(0,Math.min(1,p)),i=Math.floor(h),f=h-i;
    return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*f;
  };
  function parseCSV(text){
    const src=String(text??'').replace(/^\uFEFF/,'');
    const candidates=[',',';','\t'];
    const first=(src.split(/\r?\n/).find(x=>x.trim())||'');
    const score=d=>{let q=false,n=0;for(let i=0;i<first.length;i++){const c=first[i];if(c==='"'){if(q&&first[i+1]==='"')i++;else q=!q}else if(c===d&&!q)n++}return n};
    const delimiter=candidates.sort((a,b)=>score(b)-score(a))[0];
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<src.length;i++){
      const c=src[i];
      if(quoted){if(c==='"'&&src[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c;continue}
      if(c==='"'&&cell===''){quoted=true;continue}
      if(c===delimiter){row.push(cell);cell='';continue}
      if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x).trim()!==''))rows.push(row);row=[];continue}
      cell+=c;
    }
    if(quoted)throw new Error('CSV có dấu ngoặc kép chưa đóng. Hãy kiểm tra dòng cuối hoặc dấu ngoặc kép trong nội dung.');
    row.push(cell);if(row.some(x=>String(x).trim()!==''))rows.push(row);
    if(!rows.length)return{headers:[],rows:[],delimiter};
    const seenHeaders=new Map();
    const headers=rows.shift().map((h,i)=>{const base=String(h).trim()||`Column ${i+1}`,count=(seenHeaders.get(base)||0)+1;seenHeaders.set(base,count);return count===1?base:`${base} (${count})`});
    const nonblank=rows.filter(r=>r.some(x=>String(x).trim()!==''));
    const extra=nonblank.findIndex(r=>r.length>headers.length);if(extra>=0)throw new Error(`Dòng dữ liệu ${extra+2} có ${nonblank[extra].length} trường, nhiều hơn ${headers.length} cột tiêu đề. Hãy kiểm tra dấu phân cách/ngoặc kép.`);
    const body=nonblank.map(r=>headers.map((_,i)=>r[i]??''));
    return{headers,rows:body,delimiter};
  }
  function parseNumber(value,delimiter=','){
    if(value===null||value===undefined)return NaN;
    let s=String(value).trim();if(!s||s==='-'||s==='—')return NaN;
    const isPercent=/%$/.test(s);
    s=s.replace(/[\s\u00a0]/g,'').replace(/[€$£¥₫%]/g,'');
    const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
    if(comma>=0&&dot>=0){if(comma>dot)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'')}
    else if(comma>=0){if(delimiter===';'||delimiter==='\t')s=s.replace(',','.');else if(/^[-+]?\d{1,3}(,\d{3})+$/.test(s))s=s.replace(/,/g,'');else s=s.replace(',','.')}
    const n=Number(s);return Number.isFinite(n)?(isPercent?n/100:n):NaN;
  }
  function numericColumns(headers,rows,delimiter=','){
    return headers.map((name,index)=>{
      let valid=0;for(const r of rows)if(Number.isFinite(parseNumber(r[index],delimiter)))valid++;
      return{ name,index,valid,total:rows.length,ratio:rows.length?valid/rows.length:0 };
    }).filter(x=>x.valid>=2&&x.ratio>=0.6);
  }
  function stats(values){
    const a=clean(values),n=a.length;if(!n)return{n:0,mean:NaN,median:NaN,variance:NaN,stdDev:NaN,min:NaN,q1:NaN,q3:NaN,max:NaN,skewness:NaN,excessKurtosis:NaN};
    const m=mean(a),sorted=a.slice().sort((x,y)=>x-y),ss=sum(a.map(x=>(x-m)**2)),variance=n>1?ss/(n-1):NaN,sd=Math.sqrt(variance);
    let skew=NaN,kurt=NaN;
    if(n>=3&&sd>0){const m2=ss/n,m3=sum(a.map(x=>(x-m)**3))/n,m4=sum(a.map(x=>(x-m)**4))/n;skew=m3/Math.pow(m2,1.5);kurt=m4/(m2*m2)-3}
    const freq=new Map();for(const v of a)freq.set(v,(freq.get(v)||0)+1);
    const modeFrequency=Math.max(0,...freq.values()),modes=modeFrequency>1?[...freq].filter(([,count])=>count===modeFrequency).map(([value])=>value).sort((x,y)=>x-y):[];
    return{n,mean:m,median:quantile(sorted,.5),mode:modes.length===1?modes[0]:NaN,modes,modeFrequency,variance,stdDev:sd,min:sorted[0],q1:quantile(sorted,.25),q3:quantile(sorted,.75),max:sorted[n-1],skewness:skew,excessKurtosis:kurt};
  }
  function returns(values){
    const out=[];for(let i=1;i<values.length;i++){const pv=values[i-1],cv=values[i],p=pv===null||pv===undefined||String(pv).trim()===''?NaN:Number(pv),c=cv===null||cv===undefined||String(cv).trim()===''?NaN:Number(cv);out.push({index:i,simple:Number.isFinite(p)&&p!==0&&Number.isFinite(c)?c/p-1:NaN,log:Number.isFinite(p)&&p>0&&Number.isFinite(c)&&c>0?Math.log(c/p):NaN})}return out;
  }
  function pairedValues(a,b){
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)throw new Error('Hai chuỗi phải là mảng và có cùng số quan sát để ghép cặp theo thời gian.');
    const pairs=[];for(let i=0;i<a.length;i++){const av=a[i],bv=b[i],x=av===null||av===undefined||String(av).trim()===''?NaN:Number(av),y=bv===null||bv===undefined||String(bv).trim()===''?NaN:Number(bv);if(Number.isFinite(x)&&Number.isFinite(y))pairs.push([x,y])}return pairs;
  }
  function correlation(a,b){
    const pairs=pairedValues(a,b);if(pairs.length<2)return NaN;const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));let xy=0,xx=0,yy=0;
    for(const [x,y] of pairs){xy+=(x-mx)*(y-my);xx+=(x-mx)**2;yy+=(y-my)**2}
    return xx>0&&yy>0?xy/Math.sqrt(xx*yy):NaN;
  }
  function correlationMatrix(columns){
    const names=Object.keys(columns);return{names,values:names.map(a=>names.map(b=>correlation(columns[a],columns[b])))};
  }
  function covariance(a,b){
    const pairs=pairedValues(a,b);if(pairs.length<2)return NaN;const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));return sum(pairs.map(([x,y])=>(x-mx)*(y-my)))/(pairs.length-1);
  }
  function covarianceMatrix(columns){
    const names=Object.keys(columns);return{names,values:names.map(a=>names.map(b=>covariance(columns[a],columns[b])))};
  }
  function histogram(values,bins=24){
    const a=clean(values);if(!a.length)return[];const lo=a.reduce((m,x)=>Math.min(m,x),Infinity),hi=a.reduce((m,x)=>Math.max(m,x),-Infinity),k=Math.max(1,Math.min(100,Math.floor(bins)||24));
    if(lo===hi)return[{x0:lo,x1:hi,count:a.length,center:lo}];
    const width=(hi-lo)/k,out=Array.from({length:k},(_,i)=>({x0:lo+i*width,x1:i===k-1?hi:lo+(i+1)*width,count:0,center:lo+(i+.5)*width}));
    for(const x of a){const i=Math.min(k-1,Math.floor((x-lo)/width));out[i].count++}return out;
  }
  function rolling(values,windowSize){
    const w=Math.max(2,Math.floor(Number(windowSize)||2)),out=Array(values.length).fill(null);
    for(let i=w-1;i<values.length;i++){const window=values.slice(i-w+1,i+1);if(window.length!==w||window.some(v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))))continue;const s=stats(window);out[i]={mean:s.mean,stdDev:s.stdDev,n:s.n}}
    return out;
  }
  function detectTimeColumn(headers){
    const aliases=new Set(['time','date','timestamp','datetime','datetimeutc','timeutc','bar time','bar_time','open time','open_time','date time','date_time','time (utc)','timestamp (utc)','datetime (utc)','open time (utc)','date (utc)','open time','thoi gian','gio']);
    return headers.findIndex(h=>{const raw=String(h||'').trim().toLowerCase(),norm=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,' ').trim();return aliases.has(raw)||aliases.has(norm)||/^(time|date|timestamp|datetime)[ _-](utc|gmt|local)$/.test(raw)||/^(thoi gian|gio) (mo|dong) cua?$/.test(norm)});
  }
  function parseTimestamp(rawValue){
    const raw=String(rawValue??'').trim();if(!raw)return NaN;
    if(/^\d{8}$/.test(raw)){const y=+raw.slice(0,4),m=+raw.slice(4,6)-1,d=+raw.slice(6,8),t=Date.UTC(y,m,d),check=new Date(t);return check.getUTCFullYear()===y&&check.getUTCMonth()===m&&check.getUTCDate()===d?t:NaN;}
    const num=Number(raw);if(Number.isFinite(num)&&/^[-+]?\d+(?:\.\d+)?$/.test(raw)){const abs=Math.abs(num);if(abs>=1e12)return num;if(abs>=1e8)return num*1000;}
    const parsed=Date.parse(raw);return Number.isFinite(parsed)?parsed:NaN;
  }
  function detectPriceColumn(headers){return headers.findIndex(h=>/^(close|last|price|c|close price|giá đóng cửa)$/i.test(h.trim()))}
  return{parseCSV,parseNumber,numericColumns,stats,returns,correlation,correlationMatrix,covariance,covarianceMatrix,histogram,rolling,detectTimeColumn,detectPriceColumn,parseTimestamp,quantile};
});
