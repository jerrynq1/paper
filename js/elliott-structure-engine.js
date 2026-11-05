/* Gexadecimal Elliott Structure Lab · v0.4
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

  const VERSION='0.4.0';
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
    {id:'extended_impulse',name:'Extended Impulse',status:'assisted-detection',degree:'motive',legs:5,internal:'nested extension; commonly 9/13/17 swings but not mandatory'},
    {id:'truncated_fifth',name:'Truncated Fifth',status:'candidate-engine',degree:'motive',legs:5,internal:'5-3-5-3-5',rare:true},
    {id:'impulse_developing_wave5',name:'Impulse · Wave 5 developing',status:'candidate-engine',degree:'motive',legs:4,internal:'5-3-5-3-?'},
    {id:'diagonal_candidate',name:'Diagonal Candidate',status:'candidate-engine',degree:'motive',legs:5,internal:'contracting/expanding wedge; role and internal grammar require degree context'},
    {id:'expanding_diagonal_candidate',name:'Expanding Diagonal Candidate',status:'assisted-detection',degree:'motive',legs:5,internal:'expanding wedge; role/internal grammar requires degree context'},
    {id:'leading_diagonal',name:'Leading Diagonal',status:'context-required',degree:'motive',legs:5,internal:'5-3-5-3-5 / author-dependent variants'},
    {id:'ending_diagonal',name:'Ending Diagonal',status:'context-required',degree:'motive',legs:5,internal:'3-3-3-3-3'},
    {id:'zigzag',name:'Zigzag',status:'candidate-engine',degree:'corrective',legs:3,internal:'5-3-5'},
    {id:'regular_flat',name:'Regular Flat',status:'candidate-engine',degree:'corrective',legs:3,internal:'3-3-5'},
    {id:'expanded_flat',name:'Expanded Flat',status:'candidate-engine',degree:'corrective',legs:3,internal:'3-3-5'},
    {id:'running_flat',name:'Running Flat',status:'candidate-engine',degree:'corrective',legs:3,internal:'3-3-5'},
    {id:'contracting_triangle',name:'Contracting Triangle',status:'candidate-engine',degree:'corrective',legs:5,internal:'3-3-3-3-3'},
    {id:'barrier_triangle',name:'Barrier Triangle · geometric subtype',status:'assisted-detection',degree:'corrective',legs:5,internal:'3-3-3-3-3; one boundary nearly horizontal'},
    {id:'expanding_triangle',name:'Expanding Triangle',status:'candidate-engine',degree:'corrective',legs:5,internal:'3-3-3-3-3'},
    {id:'double_zigzag',name:'Double Zigzag (W-X-Y)',status:'assisted-detection',degree:'corrective',legs:null,internal:'Zigzag–connector–Zigzag'},
    {id:'double_three',name:'Double Three (W-X-Y)',status:'assisted-detection',degree:'corrective',legs:null,internal:'Corrective–connector–corrective'},
    {id:'triple_zigzag',name:'Triple Zigzag (W-X-Y-X-Z)',status:'assisted-detection',degree:'corrective',legs:null,internal:'Zigzag–connector–Zigzag–connector–Zigzag'},
    {id:'triple_three',name:'Triple Three (W-X-Y-X-Z)',status:'assisted-detection',degree:'corrective',legs:null,internal:'Corrective–connector–corrective–connector–corrective'}
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
    const atr=atrWilder(bars,period);
    // Causal warm-up: never use a full-sample median to set an early pivot threshold.
    // Before ATR is seeded, only explicit minMove / percentThreshold floors are active.
    const threshold=(idx,price)=>Math.max(minMove,(Number.isFinite(atr.values[idx])?atr.values[idx]:0)*multiplier,abs(price)*percentThreshold);
    const close=bars.map(b=>b.close);
    // Start pivot discovery only after ATR has a causal seed. The initial warm-up
    // range is deliberately not labeled as a confirmed market swing.
    const seedIndex=Math.min(period-1,bars.length-1);
    let dir=0,hi=close[seedIndex],lo=close[seedIndex],hiIdx=seedIndex,loIdx=seedIndex;
    const pivots=[];
    const makePivot=(kind,idx,confirmIdx,scale)=>({
      kind,index:idx,time:bars[idx].time,price:bars[idx].close,
      sourceClose:bars[idx].close,confirmed:true,confirmationIndex:confirmIdx,
      confirmationTime:bars[confirmIdx].time,confirmationDelayBars:confirmIdx-idx,
      atrAtPivot:atr.values[idx]??0,thresholdAtPivot:threshold(idx,bars[idx].close),
      scale:scale??1,persistence:1
    });

    for(let i=Math.max(1,period);i<bars.length;i++){
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

  function buildDegreeHierarchy(scales){
    const levels=(scales||[]).map((scale,index)=>({degree:scale.id,scaleIndex:index,thresholdMultiplier:scale.thresholdMultiplier,pivotCount:scale.pivots.length,legs:scale.pivots.slice(1).map((p,i)=>{const a=scale.pivots[i];return{id:`${scale.id}-leg-${i+1}`,startIndex:a.index,endIndex:p.index,startPrice:a.price,endPrice:p.price,children:[]};})}));
    for(let i=0;i<levels.length-1;i++){
      const child=levels[i],parent=levels[i+1];
      for(const leg of child.legs){
        const host=parent.legs.find(x=>leg.startIndex>=x.startIndex&&leg.endIndex<=x.endIndex);
        if(host)host.children.push(leg.id);
      }
    }
    return levels;
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
    return{scales,primaryScaleIndex,primary:scales[primaryScaleIndex].pivots,fine:scales[0].pivots,coarse:scales[scales.length-1].pivots,parentLegs:hierarchy.parentLegs,degreeHierarchy:buildDegreeHierarchy(scales)};
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
  function guideline(id,label,score,detail,weight=1,group=null){
    const inferred=group||(String(id).includes('FIB')?'fibonacci':String(id).includes('ALT')?'structure':String(id).includes('SCALE')?'robustness':String(id).includes('TIME')?'time':'other');
    return{id,label,score:clamp(score,0,1),detail,weight,group:inferred,kind:'guideline'};
  }
  function weightedScore(items){
    // Normalize within evidence families first so five correlated Fibonacci ratios do not
    // outvote one independent structure/context family merely by count.
    const groups=new Map();for(const x of items){const k=x.group||'other';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
    const values=[...groups.values()].map(g=>{const den=g.reduce((s,x)=>s+x.weight,0);return den?g.reduce((s,x)=>s+x.score*x.weight,0)/den:0;});
    return values.length?100*mean(values):0;
  }
  function ruleState(rules){return{passed:rules.filter(r=>r.status==='pass').length,failed:rules.filter(r=>r.status==='fail').length,unverified:rules.filter(r=>r.status==='unverified').length};}
  function buildInternalProxy(p,expected,finePivots){
    const segments=[];
    for(let i=0;i<p.length-1;i++){
      const inside=(finePivots||[]).filter(q=>q.index>p[i].index&&q.index<p[i+1].index);
      const count=inside.length+1,expectedForLeg=Array.isArray(expected)?expected[i]??null:expected;
      segments.push({leg:i+1,expected:expectedForLeg,observedSwingSegments:count,intermediateFinePivots:inside.length,status:inside.length?'proxy-only':'unverified'});
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
      status:state.failed?'rejected':(state.unverified||(extra.internalStructure&&extra.internalStructure.status!=='verified'))?'provisional':'rules-passed',
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
    const wave2Valid=d>0?p[2].price>=p[0].price-eps:p[2].price<=p[0].price+eps;
    const wave3Extends=d>0?p[3].price>p[1].price+eps:p[3].price<p[1].price-eps;
    const wave3NotShortest=w3+eps>=Math.min(w1,w5);
    const wave4NoOverlap=d>0?p[4].price>=p[1].price-eps:p[4].price<=p[1].price+eps;
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
    const childCounts=p.slice(0,5).map((x,i)=>((options.finePivots||[]).filter(q=>q.index>x.index&&q.index<p[i+1].index).length+1));
    const extensionIndex=[w1,w3,w5].indexOf(Math.max(w1,w3,w5));
    const extensionWave=['1','3','5'][extensionIndex];
    const nestedExtension=childCounts.some(n=>n>=7);
    const c=baseCandidate(subtype,p,d,hard,guides,{internalStructure:internal,metrics:{waveLengths:l,waveDurations:dur,wave2Retracement:r2,wave3Extension:r3,wave4Retracement:r4,wave5ToWave1:r5,extendedWaveCandidate:extensionWave,lowerScaleSwingSegmentsByWave:childCounts,extensionEvidence:nestedExtension?'nested-subdivision-proxy':'length-only'},warnings});
    c.complete=true;c.developing=false;c.channel=buildImpulseChannel(p);
    c.metrics.extensionSubtype=nestedExtension?'extended-impulse candidate':'length-dominant wave only';
    if(nestedExtension)c.warnings.push(`Possible extension in Wave ${extensionWave}: lower-scale swing segmentation suggests nesting; verify recursive 5/3 grammar manually.`);
    return c;
  }

  function evaluateDevelopingImpulse(p,options={}){
    if(!Array.isArray(p)||p.length!==5||!isAlternating(p))return null;
    const d=directionOf(p);if(!d)return null;
    const l=lengths(p),dur=durations(p),[w1,w2,w3,w4]=l,eps=Math.max(1e-12,Number(options.epsilon)||0);
    const wave2Valid=d>0?p[2].price>=p[0].price-eps:p[2].price<=p[0].price+eps;
    const wave3Extends=d>0?p[3].price>p[1].price+eps:p[3].price<p[1].price-eps;
    const wave4NoOverlap=d>0?p[4].price>=p[1].price-eps:p[4].price<=p[1].price+eps;
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
    const bNotBeyondOrigin=d>0?p[2].price>=p[0].price-eps:p[2].price<=p[0].price+eps;
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
    const highP=p.filter(x=>x.kind==='high'),lowP=p.filter(x=>x.kind==='low');
    const highs=highP.map(x=>x.price),lows=lowP.map(x=>x.price);
    if(highs.length!==3||lows.length!==3)return[];
    const highContract=highs[0]>highs[1]&&highs[1]>highs[2],lowContract=lows[0]<lows[1]&&lows[1]<lows[2];
    const highExpand=highs[0]<highs[1]&&highs[1]<highs[2],lowExpand=lows[0]>lows[1]&&lows[1]>lows[2];
    const l=lengths(p),dur=durations(p),totalRange=Math.max(...highs)-Math.min(...lows);
    const tolRatio=clamp(Number(options.barrierToleranceRatio??.10),.01,.25);
    const highRange=Math.max(...highs)-Math.min(...highs),lowRange=Math.max(...lows)-Math.min(...lows);
    const upperBarrier=(highRange/Math.max(totalRange,1e-12))<=tolRatio&&lowContract;
    const lowerBarrier=(lowRange/Math.max(totalRange,1e-12))<=tolRatio&&highContract;
    const guides=[
      guideline('EW-TRI-LEG-SIZE','Các nhịp A–E co giãn hợp lý',clamp(l.slice(1).filter((x,i)=>x<=l[i]).length/4,0,1),'So sánh độ dài các nhịp; tính chất co hẹp chỉ là guideline hình học.',1.5,'structure'),
      guideline('EW-TRI-TIME','Tính cân bằng thời gian của A–E',clamp(1-Math.max(...dur)/Math.max(1,mean(dur)*4),0,1),'Thời lượng các nhịp không nên bị chi phối bởi một nhịp bất thường.',.5,'time')
    ];
    const internal=buildInternalProxy(p,[3,3,3,3,3],options.finePivots),out=[];
    if(highContract&&lowContract){
      const hard=[rule('EW-TRI-01','Đường biên trên co xuống','pass','Các đỉnh High giảm dần.'),rule('EW-TRI-02','Đường biên dưới co lên','pass','Các đáy Low tăng dần.')];
      const c=baseCandidate('contracting_triangle',p,d,hard,guides,{internalStructure:internal,metrics:{legLengths:l,highs,lows,geometry:'contracting'},warnings:['A–E phải có internal 3-3-3-3-3; hình tam giác đơn thuần chưa đủ xác nhận.']});c.complete=true;out.push(c);
    }
    if(upperBarrier||lowerBarrier){
      const boundary=upperBarrier?'upper':'lower';
      const hard=[rule('EW-TRI-BAR-01',boundary==='upper'?'Đường biên trên gần nằm ngang':'Đường biên dưới gần nằm ngang','pass',`Biên ${boundary} có độ rộng ${(boundary==='upper'?highRange:lowRange).toPrecision(4)} so với tổng range ${totalRange.toPrecision(4)}.`),rule('EW-TRI-BAR-02',boundary==='upper'?'Đường biên dưới nâng dần':'Đường biên trên hạ dần','pass','Biên đối diện hội tụ về đường biên gần ngang.')];
      out.push(baseCandidate('barrier_triangle',p,d,hard,guides,{internalStructure:internal,metrics:{legLengths:l,highs,lows,geometry:'barrier',barrierBoundary:boundary,toleranceRatio:tolRatio},warnings:['Barrier Triangle là một biến thể của Contracting Triangle; hình học gần ngang không tự chứng minh internal 3-3-3-3-3.']}));
    }
    if(highExpand&&lowExpand){
      const hard=[rule('EW-TRI-01','Đường biên trên mở rộng','pass','Các đỉnh High tăng dần.'),rule('EW-TRI-02','Đường biên dưới mở rộng','pass','Các đáy Low giảm dần.')];
      const c=baseCandidate('expanding_triangle',p,d,hard,guides,{internalStructure:internal,metrics:{legLengths:l,highs,lows,geometry:'expanding'},warnings:['Expanding Triangle ít gặp; cần xác nhận cấu trúc con và loại trừ gap bất thường.']});c.complete=true;out.push(c);
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
    const contracting=range0>range1&&range1>range2,expanding=range0<range1&&range1<range2;
    const hard=[
      rule('EW-DIAG-01','Wave 4 overlap vùng Wave 1',overlap?'pass':'fail',overlap?'Có overlap phù hợp đặc trưng Diagonal.':'Không có overlap; không phù hợp Diagonal tiêu chuẩn.'),
      rule('EW-DIAG-02','Hình học nêm co hẹp hoặc mở rộng',(contracting||expanding)?'pass':'unverified',contracting?'Khoảng cách High–Low co hẹp qua ba swing.':expanding?'Khoảng cách High–Low mở rộng qua ba swing.':'Chưa thấy co hẹp hoặc mở rộng đơn điệu rõ ở các pivot.')
    ];
    const guides=[
      guideline('EW-DIAG-WEDGE','Hình học nêm',contracting?1:expanding?.75:clamp(1-abs(range2-range0)/Math.max(range0,1e-12),0,1),`Biên độ đầu/cuối: ${range0.toPrecision(4)} → ${range2.toPrecision(4)}.`,2),
      guideline('EW-DIAG-LEG','Tương quan độ dài các nhịp',closestRatioScore(l[4]/Math.max(l[0],1e-12),[.618,1],.5),'So sánh nhịp thứ năm với nhịp thứ nhất.',1)
    ];
    const pattern=expanding?'expanding_diagonal_candidate':'diagonal_candidate';
    const c=baseCandidate(pattern,p,d,hard,guides,{internalStructure:{...buildInternalProxy(p,['role-dependent'],options.finePivots),expectedVariants:['5-3-5-3-5 (possible Leading context)','3-3-3-3-3 (Ending context; author/context dependent)'],status:'unverified',note:'Diagonal role must be assigned from its parent-degree position; geometry alone cannot choose internal grammar.'},metrics:{waveLengths:l,rangeSequence:[range0,range1,range2],geometry:contracting?'contracting':expanding?'expanding':'unclear',highSlope:highSlopes,lowSlope:lowSlopes,overlap},warnings:['Chưa thể xác định Leading hay Ending chỉ từ hình học 6 pivot; cần biết vị trí trong chu kỳ lớn hơn.','Internal grammar của Diagonal phụ thuộc vai trò/tài liệu; chưa được tự động chốt chỉ từ 6 pivot.']});
    c.possibleRoles=['leading_diagonal','ending_diagonal'];
    c.complete=true;c.fibTargets=[];return c;
  }

  const isMotivePattern=id=>['impulse','extended_impulse','truncated_fifth','impulse_developing_wave5','diagonal_candidate','expanding_diagonal_candidate','leading_diagonal','ending_diagonal'].includes(id);
  const isCorrectivePattern=id=>['zigzag','regular_flat','expanded_flat','running_flat','contracting_triangle','barrier_triangle','expanding_triangle','double_zigzag','double_three','triple_zigzag','triple_three'].includes(id);
  const isZigzagPattern=id=>id==='zigzag'||id==='double_zigzag'||id==='triple_zigzag';

  function composeCombinationCandidates(baseCandidates,options={}){
    const corrective=baseCandidates.filter(c=>isCorrectivePattern(c.pattern)&&c.complete!==false&&!c.hardRules.some(r=>r.status==='fail'));
    if(corrective.length<3)return[];
    const max=clamp(Number(options.maxCombinationCandidates)||24,1,100);
    const byStart=new Map();for(const c of corrective){const k=c.startIndex;if(!byStart.has(k))byStart.set(k,[]);byStart.get(k).push(c);}
    const next=(left,dir)=>corrective.filter(c=>c.startIndex===left.endIndex&&c.directionSign===dir&&c.endIndex>left.endIndex);
    const out=[];
    for(const w of corrective){
      if(out.length>=max)break;
      for(const x of next(w,-w.directionSign).slice(0,8)){
        for(const y of next(x,w.directionSign).slice(0,8)){
          const zig=isZigzagPattern(w.pattern)&&isZigzagPattern(y.pattern);
          const seq=[w,x,y],p=[w.pivots[0],w.pivots[w.pivots.length-1],x.pivots[x.pivots.length-1],y.pivots[y.pivots.length-1]];
          const hard=[rule('EW-COMB-01','W, X, Y là các cấu trúc corrective đã được nhận diện','pass','Các component W/X/Y có candidate riêng; internal grammar giữ ở trạng thái theo từng component.')];
          const guides=[guideline('EW-COMB-RATIO-X','Tương quan connector X / W',closestRatioScore(lengths(p)[1]/Math.max(lengths(p)[0],1e-12),[.5,.618,.786],.4),'Tỷ lệ tham khảo, không phải điều kiện bắt buộc.',1,'fibonacci'),guideline('EW-COMB-RATIO-Y','Tương quan Y / W',closestRatioScore(lengths(p)[2]/Math.max(lengths(p)[0],1e-12),[.618,1,1.272,1.618],.5),'Tỷ lệ tham khảo; grammar quan trọng hơn tỷ lệ.',1,'fibonacci')];
          const c=baseCandidate(zig?'double_zigzag':'double_three',p,w.directionSign,hard,guides,{internalStructure:{status:'partial',note:'Combination được dựng từ các corrective component; xác minh từng internal grammar riêng.',components:seq.map(q=>({pattern:q.pattern,startIndex:q.startIndex,endIndex:q.endIndex,status:q.internalStructure?.status||'unverified'}))},metrics:{components:seq.map(q=>({pattern:q.pattern,direction:q.direction,startIndex:q.startIndex,endIndex:q.endIndex}))},warnings:['W-X-Y là tổ hợp của các corrective patterns; không gộp thành một Zigzag duy nhất.']});
          c.complete=true;c.componentCandidates=seq.map(q=>q.id);c.metrics.componentCount=3;c.metrics.componentTypes=seq.map(q=>q.pattern);c.invalidation={status:'conditional',levels:[{id:'EW-INV-WXY',name:'Start of combination',price:w.pivots[0].price,condition:'A confirmed break beyond the start of W invalidates this combination count.'}],note:'Scenario boundary; no trade stop is implied.'};out.push(c);
          if(out.length>=max)break;
          for(const x2 of next(y,-w.directionSign).slice(0,6)){
            for(const z of next(x2,w.directionSign).slice(0,6)){
              const tripleZig=zig&&isZigzagPattern(z.pattern);
              const p5=[w.pivots[0],w.pivots[w.pivots.length-1],x.pivots[x.pivots.length-1],y.pivots[y.pivots.length-1],x2.pivots[x2.pivots.length-1],z.pivots[z.pivots.length-1]];
              const comp=[w,x,y,x2,z];
              const tc=baseCandidate(tripleZig?'triple_zigzag':'triple_three',p5,w.directionSign,[rule('EW-COMB-02','W-X-Y-X-Z component compatibility','pass','Đủ năm component corrective theo chuỗi W-X-Y-X-Z.')],[guideline('EW-COMB-ZY','Tương quan Z / Y',closestRatioScore(lengths(p5)[4]/Math.max(lengths(p5)[2],1e-12),[.618,1,1.272,1.618],.5),'Ratio chỉ là guideline.',1,'fibonacci')],{internalStructure:{status:'partial',note:'Triple combination được ghép từ 5 corrective component; từng internal grammar vẫn cần xác minh.',components:comp.map(q=>({pattern:q.pattern,startIndex:q.startIndex,endIndex:q.endIndex,status:q.internalStructure?.status||'unverified'}))},metrics:{components:comp.map(q=>({pattern:q.pattern,direction:q.direction,startIndex:q.startIndex,endIndex:q.endIndex}))},warnings:['W-X-Y-X-Z là cấu trúc hiếm; giữ alternate counts và yêu cầu xác nhận degree/connector.']});
              tc.complete=true;tc.componentCandidates=comp.map(q=>q.id);tc.metrics.componentCount=5;tc.metrics.componentTypes=comp.map(q=>q.pattern);out.push(tc);if(out.length>=max)break;
            }
            if(out.length>=max)break;
          }
          if(out.length>=max)break;
        }
        if(out.length>=max)break;
      }
    }
    return out;
  }

  function detectAtScale(pivots,options={}){
    const candidates=[],rejected={};
    const push=c=>{if(!c)return;if(c.hardRules.some(r=>r.status==='fail')){rejected[c.pattern]=(rejected[c.pattern]||0)+1;return;}candidates.push(c)};
    for(let i=0;i<pivots.length;i++){
      if(i+4<pivots.length)push(evaluateDevelopingImpulse(pivots.slice(i,i+5),options));
      if(i+5<pivots.length){const w=pivots.slice(i,i+6);const impulse=evaluateImpulse(w,options);push(impulse);if(impulse?.metrics?.extensionEvidence==='nested-subdivision-proxy'){
        const extended={...impulse,id:impulse.id.replace('impulse:', 'extended_impulse:'),pattern:'extended_impulse',warnings:[...impulse.warnings,'Extended Impulse là phân loại hỗ trợ dựa trên nested swing proxy; không khẳng định số subdivision 9/13/17.']};
        extended.guidelines=[...extended.guidelines,guideline('EW-EXT-NESTED','Bằng chứng nested extension',1,'Lower-scale swing count gợi ý wave extension; cần xác nhận internal grammar.')];extended.evidenceScore=weightedScore(extended.guidelines);push(extended);
      }for(const c of evaluateTriangle(w,options))push(c);push(evaluateDiagonal(w,options));}
      if(i+3<pivots.length){const w=pivots.slice(i,i+4);push(evaluateZigzag(w,options));for(const c of evaluateFlat(w,options))push(c);}
    }
    candidates.push(...composeCombinationCandidates(candidates,options));
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

  function auditManualSequence(pivots,labels,options={}){
    const p=Array.isArray(pivots)?pivots:[],l=Array.isArray(labels)?labels:[];
    if(p.length!==l.length||p.length<3)return{status:'UNKNOWN',sequence:l.join('-'),rules:[],notes:['Cần gán nhãn cho tối thiểu ba pivot theo đúng thứ tự thời gian.']};
    const order=p.every((x,i)=>!i||x.index>p[i-1].index),alternating=isAlternating(p);
    const rules=[rule('EW-MAN-ORDER','Pivot theo đúng thời gian',order?'pass':'fail',order?'Các pivot có thứ tự tăng dần.':'Có pivot bị đảo thứ tự thời gian.'),rule('EW-MAN-ALT','Pivot High/Low luân phiên',alternating?'pass':'fail',alternating?'Loại pivot luân phiên.':'Hai pivot liên tiếp cùng loại High/Low.')];
    let parsed=[];const seq=l.join('-');
    if(seq==='0-1-2-3-4-5'){
      const c=evaluateImpulse(p,options);if(c)parsed=[c];
      if(!c)rules.push(rule('EW-MAN-IMP','Impulse structure','fail','Không đủ sáu pivot luân phiên để đánh giá Impulse.'));
    }else if(seq==='A-B-C'&&p.length===3){rules.push(rule('EW-MAN-ABC-ORIGIN','Origin pivot missing','unverified','Cần thêm pivot origin và nhãn 0 để kiểm tra quy tắc B không vượt origin A.'));}
    else if(seq==='0-A-B-C'){
      const z=evaluateZigzag(p,options);if(z)parsed.push(z);parsed.push(...evaluateFlat(p,options));
      if(!parsed.length)rules.push(rule('EW-MAN-ABC','ABC correction','unverified','Hình học chưa khớp Zigzag hoặc Flat candidate; cần xem loại correction khác.'));
    }else if(seq==='0-A-B-C-D-E'){
      parsed=evaluateTriangle(p,options);
      if(!parsed.length)rules.push(rule('EW-MAN-TRI','Triangle structure','unverified','Chưa khớp contracting/expanding geometry hoặc cần thêm ngữ cảnh.'));
    }else if(seq==='0-W-X-Y'||seq==='0-W-X-Y-X-Z'){
      rules.push(rule('EW-MAN-COMB','Combination component grammar','unverified','Cần từng W/Y/Z là corrective pattern hợp lệ và X là connector riêng ở degree tương ứng.'));
    }else{
      rules.push(rule('EW-MAN-GRAMMAR','Wave sequence grammar','unverified','Chuỗi nhãn này chưa có grammar tự động; giữ ở trạng thái giả thuyết thủ công.'));
    }
    if(parsed.length){for(const c of parsed)rules.push(...c.hardRules);}
    const failed=rules.some(r=>r.status==='fail'),unverified=rules.some(r=>r.status==='unverified');
    return{status:failed?'FAIL':unverified?'REVIEW':'PASS',sequence:seq,rules,parsed:parsed.map(summarizeCandidate),notes:['Manual count là hypothesis; audit không thay thế việc xác minh child-degree grammar.']};
  }

  function buildSwingBoxes(pivots,options={}){
    if(!Array.isArray(pivots)||pivots.length<2)return[];
    const swings=pivots.slice(1).map((p,i)=>{const a=pivots[i],amp=abs(p.price-a.price),bars=Math.max(1,p.index-a.index);return{from:a,to:p,amplitude:amp,durationBars:bars,slope:amp/bars,normalizedAmplitude:amp/Math.max(Number(p.atrAtPivot)||Number(a.atrAtPivot)||1e-12,1e-12)};});
    const groups=[];let current=[];
    const tolerance=Number(options.swingBoxTolerance)||.45;
    for(const sw of swings){
      const prev=current[current.length-1];
      const similar=!prev||(abs(sw.normalizedAmplitude-prev.normalizedAmplitude)/Math.max(sw.normalizedAmplitude,prev.normalizedAmplitude,1e-12)<=tolerance&&abs(sw.durationBars-prev.durationBars)/Math.max(sw.durationBars,prev.durationBars,1)<=tolerance);
      if(!similar&&current.length){groups.push(current);current=[];}current.push(sw);
    }
    if(current.length)groups.push(current);
    return groups.map((g,i)=>({id:`box-${i+1}`,startIndex:g[0].from.index,endIndex:g[g.length-1].to.index,high:Math.max(...g.flatMap(x=>[x.from.price,x.to.price])),low:Math.min(...g.flatMap(x=>[x.from.price,x.to.price])),swingCount:g.length,meanNormalizedAmplitude:mean(g.map(x=>x.normalizedAmplitude)),meanDurationBars:mean(g.map(x=>x.durationBars)),swings:g}));
  }

  function buildPivotGraph(pivots,atrValues=[]){
    const nodes=pivots.map((p,i)=>({id:`pivot-${p.index}-${p.kind}`,index:p.index,time:p.time,price:p.price,kind:p.kind,confirmed:!!p.confirmed,confirmationIndex:p.confirmationIndex,scaleSupport:p.scaleSupport||1}));
    const edges=[];
    for(let i=0;i<nodes.length-1;i++){const a=nodes[i],b=nodes[i+1],move=b.price-a.price,elapsed=Math.max(1,b.index-a.index),atr=Number(atrValues[b.index])||Number(atrValues[a.index])||null;edges.push({id:`edge-${i+1}`,from:a.id,to:b.id,direction:Math.sign(move),amplitude:Math.abs(move),durationBars:elapsed,slope:move/elapsed,atrNormalized:atr?Math.abs(move)/atr:null,overlap:false});}
    return{nodes,edges};
  }

  function diagonalRoleContext(parentPattern,waveIndex){
    const n=Number(waveIndex);
    if(['impulse','extended_impulse','truncated_fifth'].includes(parentPattern)){
      if(n===0)return'leading_diagonal';
      if(n===4)return'ending_diagonal';
      return null;
    }
    if(parentPattern==='impulse_developing_wave5')return n===0?'leading_diagonal':null;
    if(parentPattern==='zigzag'){
      if(n===0)return'leading_diagonal';
      if(n===2)return'ending_diagonal';
      return null;
    }
    if(['regular_flat','expanded_flat','running_flat'].includes(parentPattern))return n===2?'ending_diagonal':null;
    return null;
  }

  function closestChildCandidate(children,a,b,expected,options={}){
    const span=Math.max(1,b.index-a.index),tol=Math.max(Number(options.recursiveMatchBars)||2,Math.round(span*.08));
    const expectedMotive=expected==='5',expectedDirection=sign(b.price-a.price);
    const candidates=children.filter(c=>abs(c.startIndex-a.index)<=tol&&abs(c.endIndex-b.index)<=tol&&c.endIndex>c.startIndex&&c.directionSign===expectedDirection&&!c.hardRules?.some(r=>r.status==='fail'));
    const matches=candidates.filter(c=>expectedMotive?isMotivePattern(c.pattern):isCorrectivePattern(c.pattern));
    matches.sort((x,y)=>{
      const xDist=abs(x.startIndex-a.index)+abs(x.endIndex-b.index),yDist=abs(y.startIndex-a.index)+abs(y.endIndex-b.index);
      const xRules=(x.ruleSummary?.failed||0)+(x.ruleSummary?.unverified||0),yRules=(y.ruleSummary?.failed||0)+(y.ruleSummary?.unverified||0);
      return xDist-yDist||xRules-yRules||(y.evidenceScore||0)-(x.evidenceScore||0);
    });
    return matches[0]||null;
  }

  function attachRecursiveGrammar(candidates,childCandidates,options={}){
    const expectedByPattern={impulse:['5','3','5','3','5'],extended_impulse:['5','3','5','3','5'],truncated_fifth:['5','3','5','3','5'],impulse_developing_wave5:['5','3','5','3'],zigzag:['5','3','5'],regular_flat:['3','3','5'],expanded_flat:['3','3','5'],running_flat:['3','3','5'],contracting_triangle:['3','3','3','3','3'],barrier_triangle:['3','3','3','3','3'],expanding_triangle:['3','3','3','3','3'],diagonal_candidate:['role-dependent'],expanding_diagonal_candidate:['role-dependent']};
    for(const c of candidates){
      if(!expectedByPattern[c.pattern])continue;
      let expected=expectedByPattern[c.pattern];
      if(['diagonal_candidate','expanding_diagonal_candidate'].includes(c.pattern)){const roles=[...new Set((c.contextualRoleEvidence||[]).map(x=>x.role))];if(roles.length===1&&roles[0]==='leading_diagonal')expected=[5,3,5,3,5];else if(roles.length===1&&roles[0]==='ending_diagonal')expected=[3,3,3,3,3];}
      const legs=[];
      for(let i=0;i<c.pivots.length-1;i++){
        const a=c.pivots[i],b=c.pivots[i+1];
        if(expected[i]==='role-dependent'){
          legs.push({wave:i+1,expected:'5 or 3 · role-dependent',observedSwingSegments:(options.finePivots||[]).filter(q=>q.index>a.index&&q.index<b.index).length+1,childPattern:null,childCandidateId:null,status:'role-unresolved'});
          continue;
        }
        const child=closestChildCandidate(childCandidates,a,b,expected[i],options);
        const roleContext=child?.pattern?.includes('diagonal')?diagonalRoleContext(c.pattern,i):null;
        if(child?.pattern?.includes('diagonal')&&roleContext){child.contextualRoleEvidence=child.contextualRoleEvidence||[];const evidence={role:roleContext,parentPattern:c.pattern,parentId:c.id,parentWave:i+1};if(!child.contextualRoleEvidence.some(x=>x.parentId===evidence.parentId&&x.parentWave===evidence.parentWave))child.contextualRoleEvidence.push(evidence);}
        const observed=(options.finePivots||[]).filter(q=>q.index>a.index&&q.index<b.index).length+1;
        const childRulesClean=!!child&&(child.ruleSummary?.failed||0)===0&&(child.ruleSummary?.unverified||0)===0;
        const childVerified=childRulesClean&&child.internalStructure?.status==='verified';
        legs.push({wave:i+1,expected:expected[i],observedSwingSegments:observed,childPattern:child?.pattern||null,childCandidateId:child?.id||null,childRuleStatus:child?child.status:'missing',contextualRole:roleContext|| (child?.pattern?.includes('diagonal')?'parent-context-unresolved':null),status:childVerified?'verified':childRulesClean?'matched-child-pattern':child?'child-provisional':observed===Number(expected[i])?'swing-count-only':'unverified'});
      }
      const matches=legs.filter(x=>x.childCandidateId).length;
      const fullyVerified=legs.length>0&&legs.every(x=>x.status==='verified');
      const allMatched=legs.length>0&&legs.every(x=>x.status==='verified'||x.status==='matched-child-pattern');
      const roleUnresolved=legs.some(x=>x.status==='role-unresolved');
      c.internalStructure={status:fullyVerified?'verified':allMatched?'matched':matches?'partial':'unverified',note:fullyVerified?'Tất cả các nhịp có child grammar đã xác minh đệ quy.':allMatched?'Đã tìm thấy child candidate cùng hướng và đúng nhóm motive/corrective, nhưng child grammar sâu hơn chưa được xác minh.':roleUnresolved?'Diagonal cần xác định vai trò (Leading/Ending) ở degree lớn hơn trước khi chọn 5-3-5-3-5 hoặc 3-3-3-3-3.':'Có pivot-count / child candidates chưa đủ; không suy diễn 3/5 grammar từ số swing.',expected,matchedLegs:matches,totalLegs:legs.length,legs};
      if(!fullyVerified){c.status='provisional';if(!c.warnings.some(x=>x.includes('recursive')))c.warnings.push('Recursive subdivision chưa được xác minh đầy đủ ở degree thấp hơn; không coi internal grammar là PASS.');}
      else if(!c.ruleSummary.failed&&!c.ruleSummary.unverified)c.status='rules-passed';
      c.recursiveGrammar={status:c.internalStructure.status,matchedLegs:matches,totalLegs:legs.length,fullyVerified};
    }
    return candidates;
  }

  function projectionPrice(anchor,baseStart,baseEnd,ratio,direction,mode='arithmetic'){
    if(mode==='log'&&anchor>0&&baseStart>0&&baseEnd>0)return Math.exp(Math.log(anchor)+direction*ratio*Math.abs(Math.log(baseEnd/baseStart)));
    return anchor+direction*ratio*Math.abs(baseEnd-baseStart);
  }

  function buildProjectionZones(candidate,options={}){
    if(!candidate?.pivots?.length)return[];
    const p=candidate.pivots,d=candidate.directionSign||1,mode=options.projectionMode==='log'?'log':'arithmetic';
    const atr=Number(options.atrValue)||0,tick=Number(options.tickSize)||0,halfWidth=Math.max(tick,atr*(Number(options.zoneAtrMultiplier)||.05));
    const zones=[],add=(label,anchor,baseStart,baseEnd,ratio,direction,formula,source)=>{const price=projectionPrice(anchor,baseStart,baseEnd,ratio,direction,mode);if(!Number.isFinite(price))return;zones.push({label,ratio,price,zoneLow:price-halfWidth,zoneHigh:price+halfWidth,halfWidth,mode,formula,source,anchor,baseStart,baseEnd,direction:direction>0?'up':'down',kind:'projection'});};
    const observed=(label,ratio,price,formula,source)=>zones.push({label,ratio,price,zoneLow:null,zoneHigh:null,halfWidth:0,mode:'observed',formula,source,direction:'observed',kind:'observed'});
    const id=candidate.pattern;
    if(id==='impulse_developing_wave5'&&p.length===5){
      const w1s=p[0].price,w1e=p[1].price,w2=p[2].price,w3e=p[3].price,w4=p[4].price,w1=Math.abs(w1e-w1s),w3=Math.abs(w3e-w2);
      [.618,1,1.618].forEach(r=>add(`W5 = ${r} × W1`,w4,w1s,w1e,r,d,'W4 + r × W1','F-06/F-07'));
      [.382,.618,1].forEach(r=>add(`W5 = ${r} × net W1–W3`,w4,w1s,w3e,r,d,'W4 + r × net(W1→W3)','F-08'));
      if(mode==='arithmetic'){[.5,.618,.786].forEach(r=>add(`W2 retracement ${r}`,w1e,w1s,w1e,r,-d,'W1 end − d × r × W1','F-03'));[1.618,2.618,4.236].forEach(r=>add(`W3 extension ${r} × W1`,w2,w1s,w1e,r,d,'W2 + d × r × W1','F-04'));[.236,.382,.5].forEach(r=>add(`W4 retracement ${r} × W3`,w3e,w2,w3e,r,-d,'W3 end − d × r × W3','F-05'));}
    }else if(['impulse','extended_impulse','truncated_fifth'].includes(id)&&p.length===6){
      const w1=Math.abs(p[1].price-p[0].price),w3=Math.abs(p[3].price-p[2].price),w5=Math.abs(p[5].price-p[4].price);
      observed('Observed W3 / W1',w3/Math.max(w1,1e-12),p[3].price,'|W3| / |W1|','F-04');
      observed('Observed W5 / W1',w5/Math.max(w1,1e-12),p[5].price,'|W5| / |W1|','F-06/F-07');
      observed('Observed W5 / net W1–W3',w5/Math.max(Math.abs(p[3].price-p[0].price),1e-12),p[5].price,'|W5| / |net(W1→W3)|','F-08');
    }else if(['zigzag','regular_flat','expanded_flat','running_flat'].includes(id)&&p.length===4){
      const a=Math.abs(p[1].price-p[0].price),b=Math.abs(p[2].price-p[1].price),c=Math.abs(p[3].price-p[2].price);
      observed('Observed B / A',b/Math.max(a,1e-12),p[2].price,'|B| / |A|',id==='zigzag'?'F-10':'F-11/F-12');
      observed('Observed C / A',c/Math.max(a,1e-12),p[3].price,'|C| / |A|',id==='zigzag'?'F-09':'F-11/F-12');
    }else if(id.includes('triangle')&&p.length===6){
      const leg=lengths(p);for(let i=0;i<4;i++){const ratio=leg[i+1]/Math.max(leg[i],1e-12);zones.push({label:`Triangle leg ${String.fromCharCode(66+i)} / ${String.fromCharCode(65+i)}`,ratio,price:null,zoneLow:null,zoneHigh:null,formula:'Observed leg ratio',source:'F-14',kind:'observed'});}
      const widest=Math.max(...p.map(x=>x.price))-Math.min(...p.map(x=>x.price));zones.push({label:'Post-triangle thrust · widest width',ratio:1,price:null,zoneLow:null,zoneHigh:null,formula:`E ± ${widest.toPrecision(5)} after confirmed breakout`,source:'F-15',width:widest,requiresBreakout:true,kind:'conditional'});
    }
    return zones;
  }

  function updateScenarioLifecycle(snapshots,fullBars){
    return (snapshots||[]).map(s=>{
      if(s.status==='invalidated')return s;
      const c=s.candidate;if(!c?.invalidation?.levels?.length)return{...s,status:s.status||'active',checkedThrough:fullBars?.at(-1)?.time??s.asOfTime};
      const later=(fullBars||[]).filter(b=>b.time>s.asOfTime);let hit=null;
      for(const bar of later){for(const lv of c.invalidation.levels){const dir=c.direction==='bullish'?1:-1;const breached=lv.name.toLowerCase().includes('origin')?(dir>0?bar.low<=lv.price:bar.high>=lv.price):(dir>0?bar.close<=lv.price:bar.close>=lv.price);if(breached){hit={time:bar.time,level:lv.id,price:lv.price,observedClose:bar.close};break;}}if(hit)break;}
      return hit?{...s,status:'invalidated',invalidationEvent:hit,checkedThrough:fullBars?.at(-1)?.time??hit.time}:{...s,status:s.status||'active',checkedThrough:fullBars?.at(-1)?.time??s.asOfTime};
    });
  }

  function analyze(input,options={}){
    const opts={...DEFAULTS,...options};
    let bars=normalizeBars(input,opts);
    const requestedAsOf=Number.isFinite(Number(opts.asOfTime))?Number(opts.asOfTime):null;
    const requestedIndex=Number.isInteger(Number(opts.asOfIndex))?Number(opts.asOfIndex):null;
    if(requestedAsOf!=null)bars=bars.filter(b=>b.time<=requestedAsOf);
    else if(requestedIndex!=null)bars=bars.slice(0,Math.max(0,Math.min(bars.length,requestedIndex+1)));
    if(bars.length<20)throw new Error('Mốc As-of cần tối thiểu 20 nến OHLC đã đóng.');
    // Rebase indices after an as-of slice: all pivots/candidates use indices local to this immutable snapshot.
    bars=bars.map((b,index)=>({...b,index}));
    const multi=detectMultiScalePivots(bars,opts);
    const all=[],rejectedByScale=[];
    for(let i=0;i<multi.scales.length;i++){
      const fine=i===0?[]:multi.scales[i-1].pivots;
      const d0=detectAtScale(multi.scales[i].pivots,{...opts,finePivots:fine});
      all.push(d0.candidates);rejectedByScale.push(d0.rejected);
    }
    // Recursive subdivision evidence flows from the immediately smaller scale upward.
    for(let i=1;i<all.length;i++)attachRecursiveGrammar(all[i],all[i-1],{...opts,finePivots:multi.scales[i-1].pivots});
    const primaryIndex=multi.primaryScaleIndex;
    const ranked=addScaleAgreement(all,multi.scales,primaryIndex)
      .map(c=>{c.fibTargets=buildProjectionZones(c,{...opts,atrValue:atrWilder(bars,opts.atrPeriod).values.at(-1)});return c;})
      .sort((a,b)=>b.evidenceScore-a.evidenceScore||b.endIndex-a.endIndex);
    const candidates=diversifyCandidates(ranked,opts.maxCandidates);
    const preferred=candidates[0]||null;
    const rejectedCandidateCount=rejectedByScale.reduce((sum,group)=>sum+Object.values(group).reduce((s,n)=>s+n,0),0);
    const primaryPivots=multi.primary;
    return{
      version:VERSION,createdAt:new Date().toISOString(),bars,
      dataSummary:{observations:bars.length,startTime:bars[0].time,endTime:bars[bars.length-1].time,asOfTime:bars[bars.length-1].time,asOfIndex:bars.length-1,source:'OHLC',lookaheadProtected:true},
      atr:{period:opts.atrPeriod,values:atrWilder(bars,opts.atrPeriod).values},
      scales:multi.scales,primaryScaleIndex:primaryIndex,parentLegs:multi.parentLegs,degreeHierarchy:multi.degreeHierarchy,
      pivotGraph:buildPivotGraph(primaryPivots,atrWilder(bars,opts.atrPeriod).values),
      swingBoxes:primaryPivots.length?buildSwingBoxes(primaryPivots,opts):[],
      candidates,preferred,alternates:selectAlternateCounts(candidates,preferred,5),
      diagnostics:{pivotCount:primaryPivots.length,scalePivotCounts:multi.scales.map(s=>s.pivots.length),candidateCount:candidates.length,rejectedCandidateCount,rejectedByScale,hasClearCount:candidates.length>0,asOfTime:bars[bars.length-1].time,recursiveCounts:candidates.filter(c=>c.recursiveGrammar?.status==='verified').length,recursiveMatchedCounts:candidates.filter(c=>c.recursiveGrammar?.status==='matched').length,provisionalCounts:candidates.filter(c=>c.status==='provisional').length,disclaimer:'Evidence Score không phải xác suất. Candidate là giả thuyết hình học trên pivot đã xác nhận; grammar chỉ VERIFIED khi child grammar cũng được xác minh đệ quy; swing-count đơn thuần chỉ là proxy.',patternCoverage:['Impulse','Extended Impulse candidate','Truncated Fifth','Developing Wave 5','Contracting/expanding Diagonal candidates · role-dependent','Zigzag','Regular/Expanded/Running Flat','Contracting/Barrier/Expanding Triangle','Double/Triple Zigzag','Double/Triple Three']},
      settings:{atrPeriod:opts.atrPeriod,thresholdMultiplier:opts.thresholdMultiplier,scaleFactors:opts.scaleFactors,primaryScaleIndex:primaryIndex,asOfTime:bars[bars.length-1].time,projectionMode:opts.projectionMode||'arithmetic',zoneAtrMultiplier:opts.zoneAtrMultiplier||.05}
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
    detectAtScale,composeCombinationCandidates,attachRecursiveGrammar,auditManualSequence,buildDegreeHierarchy,buildSwingBoxes,buildPivotGraph,buildProjectionZones,updateScenarioLifecycle,diversifyCandidates,selectAlternateCounts,buildFibTargets,buildImpulseChannel,analyze,summarizeCandidate
  };
});
