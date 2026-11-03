/* Binance XAU Options workspace: mocked public API contract + UI smoke tests. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const ids=['v-options','optExpiry','optStatus','optMetrics','optExposure','optGreeks','optChainBody','optMeta','optErrors','optRefresh','optMode','optExplain','optMethod','optExposureMetric','optExposureTitle','optExposureUnits'];
const els=Object.fromEntries(ids.map(id=>[id,{id,innerHTML:'',textContent:'',className:'',value:'',hidden:false,disabled:false,handlers:{},addEventListener(k,fn){this.handlers[k]=fn}}]));
const expiry=Date.UTC(2026,10,6);
const contracts=['3950-C','3950-P','4000-C','4000-P'].map(x=>{
  const [strike,side]=x.split('-');
  return {symbol:`XAU-261106-${strike}-${side}`,side:side==='C'?'CALL':'PUT',strikePrice:strike,underlying:'XAUUSDT',unit:1,expiryDate:expiry,contractType:'TRADFI_OPTIONS',underlyingType:'COMMODITY',status:'TRADING'};
});
const marks=contracts.map((c,i)=>({symbol:c.symbol,markPrice:'10.5',markIV:'0.25',bidIV:'0.24',askIV:'0.26',delta:i%2?'-0.3':'0.7',gamma:'0.002',vega:'1.2',theta:'-0.5'}));
const oi=contracts.map((c,i)=>({symbol:c.symbol,sumOpenInterest:String(100+i*10),sumOpenInterestUsd:'400000',timestamp:Date.now()}));
const calls=[];
async function fetch(url){
  const u=new URL(url);calls.push(u.pathname+u.search);
  let data;
  if(u.pathname.endsWith('/exchangeInfo'))data={optionSymbols:contracts};
  else if(u.pathname.endsWith('/mark'))data=marks;
  else if(u.pathname.endsWith('/index'))data={indexPrice:'4000',time:Date.now()};
  else if(u.pathname.endsWith('/openInterest'))data=oi;
  else throw new Error('Unexpected endpoint: '+url);
  return {ok:true,status:200,json:async()=>data};
}
const context={
  document:{readyState:'complete',getElementById:id=>els[id]||null,visibilityState:'visible'},
  window:{},fetch,URL,Date,Intl,Number,Math,Map,Set,Array,String,Object,Promise,Error,console,setInterval,clearInterval
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js','options.js'),'utf8'),context);
(async()=>{
  await context.window.optionsRefresh(true);
  assert(els.optChainBody.innerHTML.includes('3,950.00')&&els.optChainBody.innerHTML.includes('4,000.00'));
  assert.strictEqual((els.optChainBody.innerHTML.match(/<td/g)||[]).length,30,'two strikes × 15 columns');
  assert(els.optChainBody.innerHTML.includes('1.200')&&els.optChainBody.innerHTML.includes('-0.500'));
  assert(els.optExposure.innerHTML.includes('opt-gex-row'));
  assert(els.optGreeks.innerHTML.includes('Gamma Exposure')&&els.optGreeks.innerHTML.includes('Vega')&&els.optGreeks.innerHTML.includes('Theta'));
  assert(els.optMetrics.innerHTML.includes('XAU INDEX')&&els.optMetrics.innerHTML.includes('PUT / CALL'));
  assert(els.optStatus.textContent.includes('OI synced'));
  assert(calls.some(x=>x.includes('/openInterest?underlyingAsset=XAU%2FUSDT')));
  console.log('ok  XAU option chain, 15 columns with all four Greeks');
  console.log('ok  Binance index, mark, OI and dashboard aggregation');
  console.log('ok  gamma exposure and aggregate Greeks');
  els.optMode.value='short';els.optMode.handlers.change();
  assert(els.optExposure.innerHTML.includes('neg-t'));
  console.log('ok  Long / short exposure scenario changes sign');
  els.optExposureMetric.value='vega';els.optExposureMetric.handlers.change();
  assert.strictEqual(els.optExposureTitle.textContent,'Vega Exposure by Strike');
  assert.strictEqual(els.optExposureUnits.textContent,'Binance native units');
  console.log('ok  Delta / Gamma / Vega / Theta exposure selector');
})().catch(e=>{console.error(e);process.exitCode=1});
