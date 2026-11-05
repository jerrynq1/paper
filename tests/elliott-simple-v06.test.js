const assert=require('assert');
const E=require('../js/elliott-structure-engine.js');
let passed=0;const ok=s=>{console.log('ok  ',s);passed++};
const pivot=(index,price,kind)=>({index,time:index*60,price,kind,confirmed:true,confirmationIndex:index+1,confirmationTime:(index+1)*60,confirmationDelayBars:1});
const candidate=(pattern,prices,startIndex,direction=1)=>({
  id:`${pattern}:${startIndex}`,pattern,directionSign:direction,direction:direction>0?'bullish':'bearish',
  startIndex,endIndex:startIndex+prices.length-1,startTime:startIndex*60,endTime:(startIndex+prices.length-1)*60,
  complete:pattern!=='impulse_developing_wave5',pivots:prices.map((v,i)=>pivot(startIndex+i,v,i%2===0?'low':'high'))
});
const bars=Array.from({length:240},(_,i)=>{const c=100+Math.sin(i/5)*2+i*.015,prev=i?100+Math.sin((i-1)/5)*2+(i-1)*.015:c;return{time:i*60,open:prev,high:Math.max(prev,c)+.12,low:Math.min(prev,c)-.12,close:c,volume:100}});

{
  const automatic=E.automaticSwingSettings(E.normalizeBars(bars));
  assert.ok(automatic.atrPeriod>=8&&automatic.atrPeriod<=21);
  assert.strictEqual(automatic.autoPrimaryScale,true);
  const result=E.analyze(bars);
  assert.strictEqual(result.version,'0.7.0');
  assert.strictEqual(result.settings.mode,'automatic');
  assert.ok(result.primaryScaleIndex>=0&&result.primaryScaleIndex<result.scales.length);
  ok('Default analysis auto-configures swing sensitivity and degree; no user ATR controls required');
}
{
  const hist1=candidate('impulse',[80,100,92,125,115,140],0,1); // W5/W1 = 1.25
  const hist2=candidate('impulse',[100,120,112,145,135,150],60,1); // W5/W1 = 0.75
  const current=candidate('impulse_developing_wave5',[200,210,204,230,220],150,1);
  const f=E.buildNextWaveForecast(current,[hist1,hist2],bars);
  assert.strictEqual(f.wave,'5');
  assert.strictEqual(f.fib.length,6);
  assert.strictEqual(f.quant.sampleCount,2);
  assert.ok(f.quant.centerPrice>f.origin);
  assert.ok(f.quant.lowPrice<f.quant.highPrice);
  assert.strictEqual(f.quant.ratioLabel,'Wave 5 / Wave 1');
  ok('Developing Wave 5 combines Fibonacci targets with historical Quant analog quantiles');
}
{
  const histImpulse=candidate('impulse',[80,100,92,125,115,140],0,1);
  const histCorrection=candidate('zigzag',[140,130,135,120],5,-1);
  const current=candidate('impulse',[200,220,212,245,230,260],120,1);
  const f=E.buildNextWaveForecast(current,[histImpulse,histCorrection],bars);
  assert.strictEqual(f.wave,'A');
  assert.strictEqual(f.quant.sampleCount,1);
  assert.strictEqual(f.quant.ratioLabel,'Wave A / full impulse');
  assert.ok(f.quant.centerPrice< f.origin);
  ok('Completed impulse forecasts corrective Wave A only from historical impulse→correction pairs');
}
{
  const histImpulse=candidate('impulse',[80,100,92,125,115,140],0,1);
  const current=candidate('impulse',[200,220,212,245,230,260],120,1);
  const f=E.buildNextWaveForecast(current,[histImpulse],bars);
  assert.strictEqual(f.quant,null);
  assert.strictEqual(f.wave,'A');
  assert.strictEqual(f.fib.length,3);
  ok('Quant model does not mistake historical Wave 5 ratios for Wave A corrections');
}
{
  const candidateInvalid={pattern:'zigzag',pivots:[pivot(1,10,'low'),pivot(2,8,'high'),pivot(3,9,'low'),pivot(4,6,'high')],directionSign:-1};
  const f=E.buildNextWaveForecast(candidateInvalid,[],bars);
  assert.strictEqual(f.available,false);
  ok('No unsupported next-wave target is forced when degree context is insufficient');
}

{
  const scaled=E.detectMultiScalePivots(E.normalizeBars(bars),{atrPeriod:14,thresholdMultiplier:1.2,scaleFactors:[1,1,1,1],autoPrimaryScale:true});
  assert.strictEqual(scaled.primaryScaleIndex,1,'ties should prefer the middle/default degree, not the finest scale');
  ok('Automatic degree selection resolves equal pivot-count ties toward a balanced middle scale');
}
{
  const fs=require('fs'),path=require('path');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'..','js','elliott-structure-ui.js'),'utf8');
  assert.ok(!/id="eAtrPeriod"|id="eThreshold"/.test(html),'no user-facing ATR or threshold inputs');
  assert.ok(/id="eForecast"/.test(html));
  assert.ok(/function waveStructureLabels/.test(ui));
  assert.ok(/function renderForecast/.test(ui));
  ok('Simple Elliott UI has no ATR/threshold controls and exposes wave-label plus forecast views');
}

{
  const QuantStats=require('../js/quant-stats.js');
  const hist1=candidate('impulse',[80,100,92,125,115,140],0,1);
  const hist2=candidate('impulse',[100,120,112,145,135,150],60,1);
  const current=candidate('impulse_developing_wave5',[200,210,204,230,220],150,1);
  const f=E.buildNextWaveForecast(current,[hist1,hist2],bars,{quantStats:QuantStats});
  assert.strictEqual(f.quant.sampleCount,2);
  assert.ok(Number.isFinite(f.quant.stdDev));
  assert.ok(Number.isFinite(f.quant.ratioP25));
  ok('QuantLab statistics API supplies finite quantiles and dispersion to the Elliott forecast');
}
console.log(`\n${passed} nhóm kiểm thử Elliott legacy forecast regression đạt`);
