/* Gexadecimal Elliott Structure Lab · v0.1
 * Deterministic, explainable Elliott candidate engine.
 * Important: pivots are only confirmed after a subsequent directional change.
 * Candidate scores are heuristic evidence scores, NOT probabilities or trade signals.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ElliottStructure=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='0.1.0';
  const DEFAULTS={
    atrPeriod:14,
    thresholdMultiplier:1.5,
    scaleFactors:[0.70,1.00,1.45,2.05],
    primaryScaleIndex:1,
    minMove:0,
    percentThreshold:0,
    maxBars:30000,
    maxCandidates:40,
    pivotMatchBars:2
  };

  const PATTERN_CATALOG=[
    {id:'impulse',name:'Impulse',status:'candidate-engine',degree:'motive',legs:5,internal:'5-3-5-3-5'},
    {id:'truncated_fifth',name:'Truncated Fifth',status:'candidate-engine',degree:'motive',legs:5,internal:'5-3-5-3-5',rare:true},
    {id:'impulse_developing_wave5',name:'Impulse · Wave 5 developing',status:'candidate-engine',degree:'motive',legs:4,internal:'5-3-5-3-?'},
    {id:'diagonal_candidate',name:'Diagonal Candidate',status:'candidate-engine',degree:'motive',legs:5,internal:'role/internal count requires degree context'},
    {id:'leading_diagonal',name:'Leading Diagonal',status:'context-required',degree:'motive',legs:5,internal:'5-3-5-3-5 / author-dependent variants'},
    {id:'ending_diagonal',name:'Ending Diagonal',status:'context-required',degree:'motive',legs:5,internal:'3-3-3-3-3'},
    {id:'zigzag',name:'Zigzag',status:'candidate-engine',degree:'corrective',legs:3,internal:'5-3-5'},
    {id:'regular_flat',name:'Regular Flat',status:'candidate-engine',degree:'corrective',legs:3,internal:'3-3-5'},
    {id:'expanded_flat',name:'Expanded Flat',status:'candidate-engine',degree:'corrective',legs:3,internal:'3-3-5'},
    {id:'running_flat',name:'Running Flat',status:'candidate-engine',degree:'corrective',legs:3,internal:'3-3-5'},
    {id:'contracting_triangle',name:'Contracting Triangle',status:'candidate-engine',degree:'corrective',legs:5,internal:'3-3-3-3-3'},
    {id:'expanding_triangle',name:'Expanding Triangle',status:'candidate-engine',degree:'corrective',legs:5,internal:'3-3-3-3-3'},
    {id:'double_three',name:'Double Three (W-X-Y)',status:'definition-only',degree:'corrective',legs:null,internal:'3-3-3 combination'},
    {id:'triple_three',name:'Triple Three (W-X-Y-X-Z)',status:'definition-only',degree:'corrective',legs:null,internal:'3-3-3-3-3 combination'}
  ];

  const finite=x=>Number.isFinite(Number(x));
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN;
  const median=a=>{if(!a.length)return NaN;const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
  const abs=x=>Math.abs(x);
  const sign=x=>x>0?1:x<0?-1:0;
  const timeOf=t=>{
    if(typeof t==='number'&&Number.isFinite(t))return t;
    if(typeof t==='string'){
      const n=Number(t);if(t.trim()!==''&&Number.isFinite(n))return n;
      const d=Date.parse(t);if(Number.isFinite(d))return d/1000;
    }
    if(t&&typeof t==='object'&&finite(t.timestamp))return Number(t.timestamp);
    throw new Error('Timestamp không hợp lệ trong dữ liệu OHLC.');
  };

  function normalizeBars(input,options={}){
    if(!Array.isArray(input)||input.length<20)throw new Error('Structure Lab cần ít nhất 20 nến OHLC hợp lệ.');
    const maxBars=options.maxBars||DEFAULTS.maxBars;
    if(input.length>maxBars)throw new Error(`Dữ liệu có ${input.length.toLocaleString('en-US')} nến; giới hạn browser v0.1 là ${maxBars.toLocaleString('en-US')}.`);
    const bars=[];let previousTime=-Infinity;
    input.forEach((r,i)=>{
      let time,open,high,low,close,volume=0;
      if(Array.isArray(r)){
        [time,open,high,low,close,volume=0]=r;
      }else if(r&&typeof r==='object'){
        time=r.time??r.timestamp??r.date;open=r.open;high=r.high;low=r.low;close=r.close;volume=r.volume??r.tickVolume??r.vol??0;
      }else throw new Error(`Nến ${i+1} không đúng định dạng.`);
      time=timeOf(time);open=Number(open);high=Number(high);low=Number(low);close=Number(close);volume=volume==null||volume===''?0:Number(volume);
      if(![open,high,low,close,volume].every(Number.isFinite)||volume<0)throw new Error(`OHLCV không hợp lệ ở nến ${i+1}; Volume phải hữu hạn và không âm.`);
      if(high<low||high<Math.max(open,close)||low>Math.min(open,close))throw new Error(`OHLC không nhất quán ở nến ${i+1} (High/Low không bao trùm Open/Close).`);
      if(time<=previousTime)throw new Error('Timestamp phải tăng nghiêm ngặt; hãy sắp xếp dữ liệu và loại timestamp trùng trước khi phân tích.');
      previousTime=time;bars.push({time,open,high,low,close,volume,index:i});
    });
    return bars;
  }

  function trueRanges(bars){
    return bars.map((b,i)=>i===0?b.high-b.low:Math.max(b.high-b.low,abs(b.high-bars[i-1].close),abs(b.low-bars[i-1].close)));
  }
  function atrWilder(bars,period=14){
    if(!Number.isInteger(period)||period<2||period>200)throw new Error('ATR period phải là số nguyên từ 2 đến 200.');
    const tr=trueRanges(bars),out=Array(bars.length).fill(null);
    if(bars.length<period)return{values:out,trueRange:tr,period,seeded:false};
    let prev=mean(tr.slice(0,period));out[period-1]=prev;
    for(let i=period;i<bars.length;i++){prev=(prev*(period-1)+tr[i])/period;out[i]=prev;}
    return{values:out,trueRange:tr,period,seeded:true};
  }

  function directionalChangePivots(bars,options={}){
    const period=options.atrPeriod??DEFAULTS.atrPeriod;
    const multiplier=Number(options.thresholdMultiplier??DEFAULTS.thresholdMultiplier);
    const minMove=Math.max(0,Number(options.minMove??DEFAULTS.minMove));
    const percentThreshold=Math.max(0,Number(options.percentThreshold??DEFAULTS.percentThreshold));
    if(!Number.isFinite(multiplier)||multiplier<=0||multiplier>20)throw new Error('Threshold ATR phải lớn hơn 0 và không quá 20.');
    const atr=atrWilder(bars,period),fallback=median(atr.trueRange.filter(x=>x>0&&Number.isFinite(x)))||0;
    const threshold=(idx,price)=>Math.max(minMove,(Number.isFinite(atr.values[idx])?atr.values[idx]:fallback)*multiplier,abs(price)*percentThreshold);
    const close=bars.map(b=>b.close);
    let dir=0,hi=close[0],lo=close[0],hiIdx=0,loIdx=0;
    const pivots=[];
    const makePivot=(kind,idx,confirmIdx,scale)=>({
      kind,index:idx,time:bars[idx].time,price:bars[idx].close,
      sourceClose:bars[idx].close,confirmed:true,confirmationIndex:confirmIdx,
      confirmationTime:bars[confirmIdx].time,confirmationDelayBars:confirmIdx-idx,
      atrAtPivot:atr.values[idx]??fallback,thresholdAtPivot:threshold(idx,kind==='high'?bars[idx].high:bars[idx].low),
      scale:scale??1,persistence:1
    });

    for(let i=1;i<bars.length;i++){
      const c=close[i];
      if(dir===0){
        if(c>hi){hi=c;hiIdx=i;}
        if(c<lo){lo=c;loIdx=i;}
        const up=c>=lo+threshold(loIdx,lo),down=c<=hi-threshold(hiIdx,hi);
        if(up||down){
          const upExc=up?(c-lo)/Math.max(threshold(loIdx,lo),1e-12):-Infinity;
          const dnExc=down?(hi-c)/Math.max(threshold(hiIdx,hi),1e-12):-Infinity;
          if(up&&(!down||upExc>=dnExc)){
            pivots.push(makePivot('low',loIdx,i,multiplier));dir=1;hi=c;hiIdx=i;
          }else{
            pivots.push(makePivot('high',hiIdx,i,multiplier));dir=-1;lo=c;loIdx=i;
          }
        }
      }else if(dir===1){
        if(c>hi){hi=c;hiIdx=i;}
        if(hi-c>=threshold(hiIdx,hi)){
          pivots.push(makePivot('high',hiIdx,i,multiplier));dir=-1;lo=c;loIdx=i;
        }
      }else{
        if(c<lo){lo=c;loIdx=i;}
        if(c-lo>=threshold(loIdx,lo)){
          pivots.push(makePivot('low',loIdx,i,multiplier));dir=1;hi=c;hiIdx=i;
        }
      }
    }
    const active=dir===1?{kind:'high',index:hiIdx,time:bars[hiIdx].time,price:bars[hiIdx].close,confirmed:false,direction:'up'}:dir===-1?{kind:'low',index:loIdx,time:bars[loIdx].time,price:bars[loIdx].close,confirmed:false,direction:'down'}:null;
    return{pivots,active,atr,thresholdMultiplier:multiplier,source:'close-confirmed directional change',direction:dir};
  }

  function linkScaleHierarchy(scales,bars,options={}){
    const fine=scales[0],coarse=scales[options.primaryScaleIndex??1];
    const parentLegs=[];
    if(!coarse||!fine)return{parentLegs:[]};
    for(let i=0;i<coarse.pivots.length-1;i++){
      const a=coarse.pivots[i],b=coarse.pivots[i+1];
      const children=fine.pivots.filter(p=>p.index>a.index&&p.index<b.index);
      parentLegs.push({id:`${coarse.id}:leg:${i+1}`,fromPivot:a,toPivot:b,childPivots:children,childSwingCount:children.length+1});
    }
    return{parentLegs};
  }

  function detectMultiScalePivots(bars,options={}){
    const factors=Array.isArray(options.scaleFactors)&&options.scaleFactors.length>=2?options.scaleFactors.slice():DEFAULTS.scaleFactors.slice();
    const primaryScaleIndex=clamp(Number(options.primaryScaleIndex??DEFAULTS.primaryScaleIndex),0,factors.length-1)|0;
    if(factors.some(x=>!Number.isFinite(Number(x))||Number(x)<=0))throw new Error('Mọi scale factor phải là số dương.');
    const scales=factors.map((factor,i)=>{
      const r=directionalChangePivots(bars,{...options,thresholdMultiplier:Number(options.thresholdMultiplier??DEFAULTS.thresholdMultiplier)*Number(factor)});
      return{id:`degree-${i+1}`,factor:Number(factor),thresholdMultiplier:r.thresholdMultiplier,pivots:r.pivots,active:r.active};
    });
    // Persistence: the same pivot recurring at nearby scales is more stable, but is not a probability.
    for(const s of scales){
      for(const p of s.pivots){
        const support=scales.filter(other=>other!==s&&other.pivots.some(q=>q.kind===p.kind&&abs(q.index-p.index)<= (options.pivotMatchBars??DEFAULTS.pivotMatchBars))).length;
        p.scaleSupport=support+1;p.scalePersistence=(support+1)/scales.length;
      }
    }
    // A smaller-scale pivot belongs to the parent leg whose time interval contains it.
    const hierarchy=linkScaleHierarchy(scales,bars,{primaryScaleIndex});
    return{scales,primaryScaleIndex,primary:scales[primaryScaleIndex].pivots,fine:scales[0].pivots,coarse:scales[scales.length-1].pivots,parentLegs:hierarchy.parentLegs};
  }

  const rule=(id,label,status,detail='',kind='hard')=>({id,label,status,detail,kind});
  function directionOf(p){return sign(p[p.length-1].price-p[0].price);}
  function isAlternating(p){for(let i=1;i<p.length;i++)if(p[i].kind===p[i-1].kind)return false;return true;}
  function lengths(p){return p.slice(1).map((x,i)=>abs(x.price-p[i].price));}
  function durations(p){return p.slice(1).map((x,i)=>Math.max(0,x.index-p[i].index));}
  function closestRatioScore(value,targets,band=.35){
    if(!Number.isFinite(value)||value<0)return 0;
    const d=Math.min(...targets.map(t=>abs(value-t)/Math.max(band,t*.35)));
    return clamp(1-d,0,1);
  }
  function guideline(id,label,score,detail,weight=1){return{id,label,score:clamp(score,0,1),detail,weight,kind:'guideline'};}
  function weightedScore(items){const den=items.reduce((s,x)=>s+x.weight,0);return den?100*items.reduce((s,x)=>s+x.score*x.weight,0)/den:0;}
  function ruleState(rules){return{passed:rules.filter(r=>r.status==='pass').length,failed:rules.filter(r=>r.status==='fail').length,unverified:rules.filter(r=>r.status==='unverified').length};}
  function buildInternalProxy(p,expected,finePivots){
    const segments=[];
    for(let i=0;i<p.length-1;i++){
      const inside=(finePivots||[]).filter(q=>q.index>p[i].index&&q.index<p[i+1].index);
      const count=inside.length+1;
      segments.push({leg:i+1,expected,observedSwingSegments:count,intermediateFinePivots:inside.length,status:inside.length?'proxy-only':'unverified'});
    }
    return{status:'unverified',note:'Số swing ở scale nhỏ chỉ là proxy hình học; chưa chứng minh được internal Elliott count 3 hoặc 5.',segments};
  }
  function baseCandidate(pattern,p,dir,hard,guides,extra={}){
    const state=ruleState(hard),score=weightedScore(guides);
    return{
      id:`${pattern}:${dir>0?'bull':'bear'}:${p[0].time}:${p[p.length-1].time}`,
      pattern,direction:dir>0?'bullish':'bearish',directionSign:dir,
      startIndex:p[0].index,endIndex:p[p.length-1].index,startTime:p[0].time,endTime:p[p.length-1].time,
      pivots:p.map(x=>({...x})),hardRules:hard,guidelines:guides,ruleSummary:state,
      evidenceScore:score,scoreLabel:'Heuristic evidence score · not probability',
      status:state.failed?'rejected':(state.unverified||(extra.internalStructure&&extra.internalStructure.status==='unverified'))?'provisional':'rules-passed',
      internalStructure:extra.internalStructure??null,
      metrics:extra.metrics??{},fibTargets:extra.fibTargets??[],channel:extra.channel??null,
      warnings:extra.warnings??[],invalidation:extra.invalidation??null,scaleSupport:1,scaleAgreement:0,
      source:'confirmed-pivot geometric candidate'
    };
  }

  function evaluateImpulse(p,options={}){
    if(!Array.isArray(p)||p.length!==6||!isAlternating(p))return null;
    const d=directionOf(p);if(!d)return null;
    const l=lengths(p),dur=durations(p),w1=l[0],w2=l[1],w3=l[2],w4=l[3],w5=l[4],eps=Math.max(1e-12,Number(options.epsilon)||0);
    const wave2Valid=d>0?p[2].price>p[0].price+eps:p[2].price<p[0].price-eps;
    const wave3Extends=d>0?p[3].price>p[1].price+eps:p[3].price<p[1].price-eps;
    const wave3NotShortest=w3+eps>=Math.min(w1,w5);
    const wave4NoOverlap=d>0?p[4].price>p[1].price+eps:p[4].price<p[1].price-eps;
    const wave5Extends=d>0?p[5].price>p[3].price+eps:p[5].price<p[3].price-eps;
    const hard=[
      rule('EW-IMP-01','Wave 2 không vượt điểm bắt đầu Wave 1',wave2Valid?'pass':'fail',wave2Valid?'Wave 2 vẫn nằm trong giới hạn của Wave 1.':'Wave 2 đã vượt điểm bắt đầu Wave 1.'),
      rule('EW-IMP-02','Wave 3 vượt điểm kết thúc Wave 1',wave3Extends?'pass':'fail',wave3Extends?'Wave 3 đã vượt đỉnh/đáy Wave 1.':'Wave 3 chưa vượt điểm kết thúc Wave 1.'),
      rule('EW-IMP-03','Wave 3 không phải sóng ngắn nhất trong 1, 3, 5',wave3NotShortest?'pass':'fail',wave3NotShortest?'Wave 3 không ngắn nhất.':'Wave 3 đang là sóng ngắn nhất trong ba sóng motive.'),
      rule('EW-IMP-04','Wave 4 không overlap vùng giá Wave 1',wave4NoOverlap?'pass':'fail',wave4NoOverlap?'Không có overlap theo pivot price.':'Wave 4 overlap Wave 1; cần kiểm tra xem đây có phải Diagonal hay không.')
    ];
    const truncated=!wave5Extends;
    hard.push(rule('EW-IMP-05','Wave 5 vượt điểm kết thúc Wave 3',wave5Extends?'pass':truncated?'unverified':'fail',wave5Extends?'Wave 5 mở rộng qua điểm kết thúc Wave 3.':'Có thể là Truncated Fifth; cần xác nhận đặc biệt và không được mặc định là impulse thông thường.'));
    const r2=w2/Math.max(w1,eps),r3=w3/Math.max(w1,eps),r4=w4/Math.max(w3,eps),r5=w5/Math.max(w1,eps);
    const alternation=(()=>{
      const priceContrast=clamp(abs(r2-r4)/Math.max(.25,r2+r4),0,1);
      const t2=dur[1]/Math.max(1,dur[0]+dur[1]),t4=dur[3]/Math.max(1,dur[2]+dur[3]);
      const timeContrast=clamp(abs(t2-t4)*2,0,1);
      return .55*priceContrast+.45*timeContrast;
    })();
    const guides=[
      guideline('EW-GEN-ALT','Alternation giữa Wave 2 và Wave 4',alternation,'So sánh tỷ lệ hồi quy và thời lượng điều chỉnh; đây là guideline, không phải luật cứng.',2),
      guideline('EW-FIB-W2','Fibonacci retracement của Wave 2',closestRatioScore(r2,[.5,.618,.786],.3),`Wave 2 / Wave 1 = ${r2.toFixed(3)}.`,1.5),
      guideline('EW-FIB-W3','Fibonacci extension của Wave 3',closestRatioScore(r3,[1,1.618,2.618],.55),`Wave 3 / Wave 1 = ${r3.toFixed(3)}.`,1.5),
      guideline('EW-FIB-W4','Fibonacci retracement của Wave 4',closestRatioScore(r4,[.236,.382,.5],.25),`Wave 4 / Wave 3 = ${r4.toFixed(3)}.`,1),
      guideline('EW-FIB-W5','Mối quan hệ Wave 5 / Wave 1',closestRatioScore(r5,[.618,1,1.618],.45),`Wave 5 / Wave 1 = ${r5.toFixed(3)}.`,1)
    ];
    const subtype=truncated?'truncated_fifth':'impulse';
    if(truncated){
      guides.push(guideline('EW-TRUNC-RARE','Điều kiện hỗ trợ truncated fifth',r3>=1.618?.8:.15,r3>=1.618?'Wave 3 đã mở rộng; vẫn cần xác nhận bằng động lượng và bối cảnh.':'Wave 3 chưa có extension nổi bật; truncated fifth là giả thuyết yếu.',1));
    }
    const internal=buildInternalProxy(p,[5,3,5,3,5],options.finePivots);
    const warnings=['Internal 5-3-5-3-5 chưa được chứng minh chỉ bằng năm nhịp pivot ngoài.'];
    if(truncated)warnings.push('Truncated fifth là trường hợp hiếm; không xem là mặc định.');
    const c=baseCandidate(subtype,p,d,hard,guides,{internalStructure:internal,metrics:{waveLengths:l,waveDurations:dur,wave2Retracement:r2,wave3Extension:r3,wave4Retracement:r4,wave5ToWave1:r5,extendedWaveCandidate:[w1,w3,w5].indexOf(Math.max(w1,w3,w5))===0?'1':[w1,w3,w5].indexOf(Math.max(w1,w3,w5))===1?'3':'5'},warnings});
    c.complete=true;c.developing=false;c.channel=buildImpulseChannel(p);
    return c;
  }

  function evaluateDevelopingImpulse(p,options={}){
    if(!Array.isArray(p)||p.length!==5||!isAlternating(p))return null;
    const d=directionOf(p);if(!d)return null;
    const l=lengths(p),dur=durations(p),[w1,w2,w3,w4]=l,eps=Math.max(1e-12,Number(options.epsilon)||0);
    const wave2Valid=d>0?p[2].price>p[0].price+eps:p[2].price<p[0].price-eps;
    const wave3Extends=d>0?p[3].price>p[1].price+eps:p[3].price<p[1].price-eps;
    const wave4NoOverlap=d>0?p[4].price>p[1].price+eps:p[4].price<p[1].price-eps;
    const hard=[
      rule('EW-IMP-01','Wave 2 không vượt điểm bắt đầu Wave 1',wave2Valid?'pass':'fail',wave2Valid?'Wave 2 còn hợp lệ.':'Wave 2 đã vượt điểm bắt đầu Wave 1.'),
      rule('EW-IMP-02','Wave 3 vượt điểm kết thúc Wave 1',wave3Extends?'pass':'fail',wave3Extends?'Wave 3 đã vượt Wave 1.':'Wave 3 chưa vượt Wave 1.'),
      rule('EW-IMP-03','Wave 3 không ngắn nhất (Wave 5 chưa hoàn thành)','unverified','Chưa có Wave 5 nên chưa thể kiểm tra đầy đủ quy tắc này.'),
      rule('EW-IMP-04','Wave 4 không overlap vùng giá Wave 1',wave4NoOverlap?'pass':'fail',wave4NoOverlap?'Không có overlap theo pivot price.':'Có overlap; cần kiểm tra Diagonal.')
    ];
    const r2=w2/Math.max(w1,eps),r3=w3/Math.max(w1,eps),r4=w4/Math.max(w3,eps);
    const guides=[
      guideline('EW-FIB-W2','Fibonacci retracement Wave 2',closestRatioScore(r2,[.5,.618,.786],.3),`Wave 2 / Wave 1 = ${r2.toFixed(3)}.`,1.5),
      guideline('EW-FIB-W3','Fibonacci extension Wave 3',closestRatioScore(r3,[1.618,2.618],.65),`Wave 3 / Wave 1 = ${r3.toFixed(3)}.`,1.5),
      guideline('EW-FIB-W4','Fibonacci retracement Wave 4',closestRatioScore(r4,[.236,.382,.5],.25),`Wave 4 / Wave 3 = ${r4.toFixed(3)}.`,1),
      guideline('EW-ALT-2-4','Alternation Wave 2 / Wave 4',clamp(abs(r2-r4)/Math.max(.25,r2+r4),0,1),'So sánh tỷ lệ hai nhịp điều chỉnh; kết luận tạm thời.',1)
    ];
    const c=baseCandidate('impulse_developing_wave5',p,d,hard,guides,{internalStructure:buildInternalProxy(p,[5,3,5,3],options.finePivots),metrics:{waveLengths:l,waveDurations:dur,wave2Retracement:r2,wave3Extension:r3,wave4Retracement:r4},warnings:['Wave 5 chưa được xác nhận; các mức Fibonacci chỉ là projection có điều kiện.']});
    c.complete=false;c.developing=true;c.nextWave='5';
    c.invalidation={status:'conditional',levels:[{id:'EW-INV-IMP-04',name:'Wave 1 overlap boundary',price:p[1].price,condition:d>0?'A move back to or below this level invalidates the standard Impulse interpretation; reassess as Diagonal/other structure.':'A move back to or above this level invalidates the standard Impulse interpretation; reassess as Diagonal/other structure.'},{id:'EW-INV-IMP-01',name:'Wave 1 origin',price:p[0].price,condition:d>0?'A break below the origin invalidates this bullish count.':'A break above the origin invalidates this bearish count.'}],note:'These are structural invalidation conditions for the developing count, not automatic trade stop-loss orders.'};
    c.fibTargets=buildFibTargets(c);c.channel=buildImpulseChannel(p);
    return c;
  }

  function evaluateZigzag(p,options={}){
    if(!Array.isArray(p)||p.length!==4||!isAlternating(p))return null;
    const d=directionOf(p);if(!d)return null;
    const l=lengths(p),[a,b,c]=l,eps=Math.max(1e-12,Number(options.epsilon)||0);
    const bNotBeyondOrigin=d>0?p[2].price>p[0].price+eps:p[2].price<p[0].price-eps;
    const hard=[rule('EW-ZZ-01','Wave B không vượt điểm bắt đầu Wave A',bNotBeyondOrigin?'pass':'fail',bNotBeyondOrigin?'Wave B chưa vượt điểm bắt đầu Wave A.':'Wave B vượt điểm bắt đầu Wave A; không phù hợp Zigzag tiêu chuẩn.')];
    const rb=b/Math.max(a,eps),rc=c/Math.max(a,eps);
    const guides=[
      guideline('EW-ZZ-FIB-B','Retracement Wave B',closestRatioScore(rb,[.382,.5,.618,.786],.3),`B / A = ${rb.toFixed(3)}.`,1),
      guideline('EW-ZZ-FIB-C','Projection Wave C so với Wave A',closestRatioScore(rc,[.618,1,1.618],.45),`C / A = ${rc.toFixed(3)}.`,2)
    ];
    const out=baseCandidate('zigzag',p,d,hard,guides,{internalStructure:buildInternalProxy(p,[5,3,5],options.finePivots),metrics:{waveLengths:l,waveBRetracement:rb,waveCToA:rc},warnings:['Cấu trúc 5-3-5 cần được kiểm tra ở scale nhỏ hơn; pivot skeleton chưa đủ chứng minh internal count.']});
    out.complete=true;out.fibTargets=buildFibTargets(out);return out;
  }

  function evaluateFlat(p,options={}){
    if(!Array.isArray(p)||p.length!==4||!isAlternating(p))return[];
    const d=directionOf(p);if(!d)return[];
    const l=lengths(p),[a,b,c]=l,eps=Math.max(1e-12,Number(options.epsilon)||0),rb=b/Math.max(a,eps),rc=c/Math.max(a,eps);
    const bAtLeast90=rb>=.9;
    const bBeyondOrigin=d>0?p[2].price<p[0].price-eps:p[2].price>p[0].price+eps;
    const cBeyondAEnd=d>0?p[3].price>p[1].price+eps:p[3].price<p[1].price-eps; // C moves in same direction as A.
    const base=[rule('EW-FLAT-01','Wave B retrace ít nhất 90% Wave A',bAtLeast90?'pass':'fail',`B / A = ${rb.toFixed(3)}; Flat thường cần B retrace tối thiểu 90% A.`)];
    const internal=buildInternalProxy(p,[3,3,5],options.finePivots);
    const make=(name,subRules,desc)=>{
      const hard=base.concat(subRules),guides=[
        guideline('EW-FLAT-FIB-C','Quan hệ Wave C / Wave A',closestRatioScore(rc,[1,1.618],.5),`C / A = ${rc.toFixed(3)}.`,1.5),
        guideline('EW-FLAT-B','Độ sâu Wave B',closestRatioScore(rb,[1,1.05,1.236],.3),`B / A = ${rb.toFixed(3)}.`,1)
      ];
      const out=baseCandidate(name,p,d,hard,guides,{internalStructure:internal,metrics:{waveLengths:l,waveBRetracement:rb,waveCToA:rc},warnings:[desc,'Internal 3-3-5 cần xác nhận ở scale nhỏ hơn.']});out.complete=true;out.fibTargets=buildFibTargets(out);return out;
    };
    const out=[];
    if(!bBeyondOrigin&&rb>=.9&&rb<=1.1&&cBeyondAEnd){
      out.push(make('regular_flat',[rule('EW-FLAT-REG-01','Wave B kết thúc gần điểm bắt đầu Wave A', 'pass','Wave B nằm trong vùng gần điểm bắt đầu A.'),rule('EW-FLAT-REG-02','Wave C vượt điểm kết thúc Wave A', 'pass','Wave C vượt điểm kết thúc A.')],'Regular Flat candidate; subtype cần xác nhận bằng cấu trúc con.'));
    }
    if(bBeyondOrigin&&cBeyondAEnd){
      out.push(make('expanded_flat',[rule('EW-FLAT-EXP-01','Wave B vượt điểm bắt đầu Wave A','pass','Wave B vượt điểm bắt đầu A.'),rule('EW-FLAT-EXP-02','Wave C vượt điểm kết thúc Wave A','pass','Wave C mở rộng qua điểm kết thúc A.')],'Expanded Flat candidate; subtype cần xác nhận bằng cấu trúc con.'));
    }
    if(bBeyondOrigin&&!cBeyondAEnd){
      out.push(make('running_flat',[rule('EW-FLAT-RUN-01','Wave B vượt điểm bắt đầu Wave A','pass','Wave B vượt điểm bắt đầu A.'),rule('EW-FLAT-RUN-02','Wave C không vượt điểm kết thúc Wave A','pass','Wave C kết thúc trước điểm kết thúc A.')],'Running Flat hiếm; yêu cầu kiểm tra kỹ bối cảnh và internal count.'));
    }
    return out;
  }

  function evaluateTriangle(p,options={}){
    if(!Array.isArray(p)||p.length!==6||!isAlternating(p))return[];
    const d=directionOf(p);if(!d)return[];
    const highs=p.filter(x=>x.kind==='high').map(x=>x.price),lows=p.filter(x=>x.kind==='low').map(x=>x.price);
    if(highs.length!==3||lows.length!==3)return[];
    const highContract=highs[0]>highs[1]&&highs[1]>highs[2],lowContract=lows[0]<lows[1]&&lows[1]<lows[2];
    const highExpand=highs[0]<highs[1]&&highs[1]<highs[2],lowExpand=lows[0]>lows[1]&&lows[1]>lows[2];
    const l=lengths(p),guides=[
      guideline('EW-TRI-LEG-SIZE','Các nhịp A–E co giãn hợp lý',clamp((l.slice(1).filter((x,i)=>x<=l[i]).length)/4,0,1),'So sánh độ dài 5 nhịp; tính chất co hẹp chỉ là guideline hình học.',1.5),
      guideline('EW-TRI-TIME','Tính cân bằng thời gian của A–E',clamp(1-(Math.max(...durations(p))/Math.max(1,mean(durations(p))*4)),0,1),'Thời lượng các nhịp không nên bị chi phối bởi một nhịp bất thường.',.5)
    ];
    const internal=buildInternalProxy(p,[3,3,3,3,3],options.finePivots);
    const out=[];
    if(highContract&&lowContract){
      const hard=[rule('EW-TRI-01','Đường biên trên co xuống','pass','Các đỉnh High giảm dần.'),rule('EW-TRI-02','Đường biên dưới co lên','pass','Các đáy Low tăng dần.')];
      out.push(baseCandidate('contracting_triangle',p,d,hard,guides,{internalStructure:internal,metrics:{legLengths:l,highs,lows},warnings:['A–E phải có internal 3-3-3-3-3; hình tam giác đơn thuần chưa đủ xác nhận.']}));
    }
    if(highExpand&&lowExpand){
      const hard=[rule('EW-TRI-01','Đường biên trên mở rộng','pass','Các đỉnh High tăng dần.'),rule('EW-TRI-02','Đường biên dưới mở rộng','pass','Các đáy Low giảm dần.')];
      out.push(baseCandidate('expanding_triangle',p,d,hard,guides,{internalStructure:internal,metrics:{legLengths:l,highs,lows},warnings:['Expanding Triangle ít gặp; cần xác nhận cấu trúc con và dữ liệu không có gap bất thường.']}));
    }
    return out;
  }

  function evaluateDiagonal(p,options={}){
    if(!Array.isArray(p)||p.length!==6||!isAlternating(p))return[];
    const d=directionOf(p);if(!d)return[];
    const highs=p.filter(x=>x.kind==='high').map(x=>x.price),lows=p.filter(x=>x.kind==='low').map(x=>x.price);
    if(highs.length!==3||lows.length!==3)return[];
    const l=lengths(p),overlap=d>0?p[4].price<=p[1].price:p[4].price>=p[1].price;
    const highSlopes=(highs[1]-highs[0])/(Math.max(1,p.filter(x=>x.kind==='high')[1].index-p.filter(x=>x.kind==='high')[0].index));
    const lowSlopes=(lows[1]-lows[0])/(Math.max(1,p.filter(x=>x.kind==='low')[1].index-p.filter(x=>x.kind==='low')[0].index));
    const range0=abs(highs[0]-lows[0]),range1=abs(highs[1]-lows[1]),range2=abs(highs[2]-lows[2]);
    const contracting=range0>range1&&range1>range2;
    const hard=[
      rule('EW-DIAG-01','Wave 4 overlap vùng Wave 1',overlap?'pass':'fail',overlap?'Có overlap phù hợp đặc trưng Diagonal.':'Không có overlap; không phù hợp Diagonal tiêu chuẩn.'),
      rule('EW-DIAG-02','Hình học nêm có hội tụ','unverified',contracting?'Khoảng cách High–Low co hẹp qua ba swing.':'Chưa thấy hội tụ rõ ở các pivot.')
    ];
    const guides=[
      guideline('EW-DIAG-WEDGE','Độ hội tụ của nêm',contracting?1:clamp(1-(range2/Math.max(range0,1e-12)),0,1),`Biên độ đầu/cuối: ${range0.toPrecision(4)} → ${range2.toPrecision(4)}.`,2),
      guideline('EW-DIAG-LEG','Tương quan độ dài các nhịp',closestRatioScore(l[4]/Math.max(l[0],1e-12),[.618,1],.5),'So sánh nhịp thứ năm với nhịp thứ nhất.',1)
    ];
    const c=baseCandidate('diagonal_candidate',p,d,hard,guides,{internalStructure:buildInternalProxy(p,[3,3,3,3,3],options.finePivots),metrics:{waveLengths:l,rangeSequence:[range0,range1,range2],highSlope:highSlopes,lowSlope:lowSlopes,overlap},warnings:['Chưa thể xác định Leading hay Ending chỉ từ hình học 6 pivot; cần biết vị trí trong chu kỳ lớn hơn.','Internal structure của Leading/Ending Diagonal cần xác nhận ở degree nhỏ hơn.']});
    c.possibleRoles=['leading_diagonal','ending_diagonal'];
    c.complete=true;c.fibTargets=[];return c;
  }

  function detectAtScale(pivots,options={}){
    const candidates=[],rejected={};
    const push=c=>{if(!c)return;if(c.hardRules.some(r=>r.status==='fail')){rejected[c.pattern]=(rejected[c.pattern]||0)+1;return;}candidates.push(c)};
    for(let i=0;i<pivots.length;i++){
      if(i+4<pivots.length)push(evaluateDevelopingImpulse(pivots.slice(i,i+5),options));
      if(i+5<pivots.length){const w=pivots.slice(i,i+6);push(evaluateImpulse(w,options));for(const c of evaluateTriangle(w,options))push(c);push(evaluateDiagonal(w,options));}
      if(i+3<pivots.length){const w=pivots.slice(i,i+4);push(evaluateZigzag(w,options));for(const c of evaluateFlat(w,options))push(c);}
    }
    const unique=new Map();
    for(const c of candidates){const key=[c.pattern,c.direction,c.startIndex,c.endIndex].join('|');const old=unique.get(key);if(!old||c.evidenceScore>old.evidenceScore)unique.set(key,c);}
    return{candidates:[...unique.values()],rejected};
  }

  function buildImpulseChannel(p){
    if(!Array.isArray(p)||(p.length!==5&&p.length!==6))return null;
    const d=directionOf(p),a=p[2],b=p[4],parallel=p[3];
    if(!d||b.index<=a.index)return null;
    const slope=(b.price-a.price)/(b.index-a.index);
    const duration=durations(p),projectedBars=p.length===6?Math.max(1,p[5].index-p[4].index):Math.max(1,Math.round((duration[0]+duration[2])/2));
    const targetIndex=p.length===6?p[5].index:p[4].index+projectedBars;
    const projectedPrice=parallel.price+slope*(targetIndex-parallel.index);
    const actual=p.length===6?p[5].price:null;
    return{method:'Parallel channel through Wave 2–4 pivots, shifted through Wave 3 pivot',slopePerBar:slope,projectedIndex:targetIndex,projectedPrice,actualPrice:actual,deviation:actual==null?null:actual-projectedPrice,role:d>0?'upper boundary projection':'lower boundary projection',note:'Channel projection is a guideline and depends on confirmed pivots; it is not a hard rule.'};
  }

  function buildFibTargets(candidate){
    const p=candidate.pivots,d=candidate.directionSign,pattern=candidate.pattern,out=[];
    const add=(label,price,ratio,method)=>{if(Number.isFinite(price))out.push({label,price,ratio,method,direction:d>0?'up':'down'});};
    if(pattern==='impulse_developing_wave5'&&p.length===5){
      const w1=abs(p[1].price-p[0].price),w3=abs(p[3].price-p[2].price),origin=p[4].price;
      [.618,1,1.618].forEach(r=>add(`Wave 5 = ${r} × Wave 1`,origin+d*w1*r,r,'W4 end + ratio × W1'));
      if(w3>1.618*w1)add('Wave 5 = Wave 1–3 net × 0.618',origin+d*abs(p[3].price-p[0].price)*.618,.618,'W4 end + 0.618 × net W1–W3');
    }else if((pattern==='zigzag'||pattern.includes('flat'))&&p.length===4){
      const a=abs(p[1].price-p[0].price),origin=p[2].price;
      [.618,1,1.618].forEach(r=>add(`Wave C = ${r} × Wave A`,origin+d*a*r,r,'B end + ratio × A'));
    }
    return out;
  }

  function addScaleAgreement(allCandidates,scales,primaryScaleIndex){
    const prim=allCandidates[primaryScaleIndex]||[];
    return prim.map(c=>{
      const matches=[];
      allCandidates.forEach((list,i)=>{
        if(i===primaryScaleIndex)return;
        const tol=Math.max(2,Math.round((c.endIndex-c.startIndex)*.08));
        if(list.some(x=>x.pattern===c.pattern&&x.direction===c.direction&&abs(x.startIndex-c.startIndex)<=tol&&abs(x.endIndex-c.endIndex)<=tol))matches.push(i);
      });
      c.scaleSupport=matches.length+1;c.scaleAgreement=c.scaleSupport/scales.length;
      const supportGuide=guideline('EW-ROBUST-SCALE','Độ ổn định qua nhiều scale',c.scaleAgreement,`${c.scaleSupport}/${scales.length} scale có candidate tương đồng. Đây là độ ổn định tham số, không phải xác suất đúng.`,1.25);
      c.guidelines.push(supportGuide);c.evidenceScore=weightedScore(c.guidelines);
      if(c.pattern==='impulse_developing_wave5'||c.pattern==='zigzag'||c.pattern.includes('flat'))c.fibTargets=buildFibTargets(c);
      if(c.pattern==='impulse'||c.pattern==='truncated_fifth')c.channel=buildImpulseChannel(c.pivots);
      return c;
    });
  }

  function diversifyCandidates(items,maxCandidates){
    const chosen=[];
    const overlapRatio=(a,b)=>{
      const left=Math.max(a.startIndex,b.startIndex),right=Math.min(a.endIndex,b.endIndex);
      const intersection=Math.max(0,right-left);
      const shorter=Math.max(1,Math.min(a.endIndex-a.startIndex,b.endIndex-b.startIndex));
      return intersection/shorter;
    };
    for(const candidate of items){
      // Keep distinct pattern interpretations over the same swing interval,
      // but suppress near-identical sliding windows of the same pattern.
      const duplicate=chosen.some(existing=>
        existing.pattern===candidate.pattern&&existing.direction===candidate.direction&&
        overlapRatio(existing,candidate)>=0.72
      );
      if(!duplicate)chosen.push(candidate);
      if(chosen.length>=maxCandidates)break;
    }
    return chosen;
  }

  function selectAlternateCounts(candidates,preferred,maxAlternates=3){
    if(!preferred)return[];
    const span=Math.max(1,preferred.endIndex-preferred.startIndex);
    const tolerance=Math.max(2,Math.round(span*.08));
    return candidates.filter(c=>c.id!==preferred.id&&
      abs(c.startIndex-preferred.startIndex)<=tolerance&&
      abs(c.endIndex-preferred.endIndex)<=tolerance
    ).slice(0,maxAlternates);
  }

  function analyze(input,options={}){
    const opts={...DEFAULTS,...options};
    const bars=normalizeBars(input,opts);
    const multi=detectMultiScalePivots(bars,opts);
    const all=[];const rejectedByScale=[];
    for(let i=0;i<multi.scales.length;i++){
      const fine=i===0?[]:multi.scales[i-1].pivots;
      const d=detectAtScale(multi.scales[i].pivots,{...opts,finePivots:fine});
      all.push(d.candidates);rejectedByScale.push(d.rejected);
    }
    const primaryIndex=multi.primaryScaleIndex;
    const ranked=addScaleAgreement(all,multi.scales,primaryIndex)
      .sort((a,b)=>b.evidenceScore-a.evidenceScore||b.endIndex-a.endIndex);
    const candidates=diversifyCandidates(ranked,opts.maxCandidates);
    const preferred=candidates[0]||null;
    const rejectedCandidateCount=rejectedByScale.reduce((sum,group)=>sum+Object.values(group).reduce((s,n)=>s+n,0),0);
    return{
      version:VERSION,createdAt:new Date().toISOString(),bars,
      dataSummary:{observations:bars.length,startTime:bars[0].time,endTime:bars[bars.length-1].time,source:'OHLC'},
      atr:{period:opts.atrPeriod,values:atrWilder(bars,opts.atrPeriod).values},
      scales:multi.scales,primaryScaleIndex:primaryIndex,parentLegs:multi.parentLegs,
      candidates,preferred,alternates:selectAlternateCounts(candidates,preferred,3),
      diagnostics:{pivotCount:multi.primary.length,scalePivotCounts:multi.scales.map(s=>s.pivots.length),candidateCount:candidates.length,rejectedCandidateCount,rejectedByScale,hasClearCount:candidates.length>0,disclaimer:'Evidence Score không phải xác suất. Candidate là giả thuyết hình học trên pivot đã xác nhận; internal wave count có thể chưa được xác minh.'},
      settings:{atrPeriod:opts.atrPeriod,thresholdMultiplier:opts.thresholdMultiplier,scaleFactors:opts.scaleFactors,primaryScaleIndex:primaryIndex}
    };
  }

  function summarizeCandidate(c){
    if(!c)return null;
    return{
      id:c.id,pattern:c.pattern,direction:c.direction,evidenceScore:c.evidenceScore,status:c.status,
      startTime:c.startTime,endTime:c.endTime,hardRules:c.ruleSummary,
      scaleAgreement:c.scaleAgreement,metrics:c.metrics,warnings:c.warnings
    };
  }

  return{
    VERSION,DEFAULTS,PATTERN_CATALOG,normalizeBars,trueRanges,atrWilder,
    directionalChangePivots,detectMultiScalePivots,
    evaluateImpulse,evaluateDevelopingImpulse,evaluateZigzag,evaluateFlat,evaluateTriangle,evaluateDiagonal,
    detectAtScale,diversifyCandidates,selectAlternateCounts,buildFibTargets,buildImpulseChannel,analyze,summarizeCandidate
  };
});
