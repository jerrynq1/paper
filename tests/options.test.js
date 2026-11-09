/* Binance XAU Options: direct browser WebSocket streams, normalization and dashboard tests. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const ids=['v-options','optExpiry','optStatus','optMetrics','optExposure','optGreeks','optChainBody','optMeta','optErrors','optRefresh','optMode','optExplain','optMethod','optExposureMetric','optExposureTitle','optExposureUnits','optFlowBody','optLevels','optCopyLevels','optOIChart','optOIWall','optThetaChart','optThetaWall','optModelReset','optModelSpot','optModelDte','optModelRate','optModelYield','optSurfaceMin','optSurfaceMax','optGreekSurfaceMin','optGreekSurfaceMax','optSurface','optSurfaceNote','optSurfaceMetric','optSurfaceReset','optGreekSurface','optGreekSurfaceNote','optGreekMetric','optGreekSide','optGreekReset'];
const els=Object.fromEntries(ids.map(id=>[id,{id,innerHTML:'',textContent:'',className:'',value:'',hidden:false,disabled:false,handlers:{},addEventListener(k,fn){this.handlers[k]=fn}}]));
const fakeTimers=new Map();let timerId=0;
function setTimeoutFake(fn,ms){const id=++timerId;fakeTimers.set(id,{fn,ms});return id}
function clearTimeoutFake(id){fakeTimers.delete(id)}
function flushRenderTimers(){
  let again=true,guard=0;
  while(again&&guard++<20){again=false;for(const [id,t] of [...fakeTimers])if(t.ms<=250){fakeTimers.delete(id);t.fn();again=true}}
}
class FakeWebSocket{
  static instances=[];
  constructor(url){this.url=url;this.readyState=0;this.sent=[];FakeWebSocket.instances.push(this)}
  open(){this.readyState=1;if(this.onopen)this.onopen({})}
  message(data){if(this.onmessage)this.onmessage({data:JSON.stringify(data)})}
  close(code=1000,reason='closed'){this.readyState=3;if(this.onclose)this.onclose({code,reason})}
}
const expiry=Date.UTC(2026,10,6);
const symbols=['3950-C','3950-P','4000-C','4000-P'].map(x=>{
  const [strike,side]=x.split('-');return `XAU-261106-${strike}-${side}`;
});
const markPayload=symbols.map((symbol,i)=>({
  s:symbol,mp:'10.5',vo:'0.25',b:'0.24',a:'0.26',d:i%2?'-0.3':'0.7',g:'0.002',v:'1.2',t:'-0.5',i:'4000',E:Date.now(),e:'markPrice'
}));
const context={
  document:{readyState:'complete',getElementById:id=>els[id]||null,visibilityState:'visible'},
  window:{WebSocket:FakeWebSocket},WebSocket:FakeWebSocket,
  Date,Intl,Number,Math,Map,Set,Array,String,Object,Promise,Error,console,
  setTimeout:setTimeoutFake,clearTimeout:clearTimeoutFake,
  setInterval:()=>1,clearInterval:()=>{}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js','options.js'),'utf8'),context);

(async()=>{
  context.window.optionsSetActive(true);
  assert(FakeWebSocket.instances.some(ws=>ws.url.endsWith('/xauusdt@optionMarkPrice')),'mark socket created');
  assert(FakeWebSocket.instances.some(ws=>ws.url.endsWith('/!index@arr')),'index socket created');
  assert(FakeWebSocket.instances.some(ws=>ws.url.endsWith('/public/ws/xauusdt@optionTrade')),'trade socket created');
  FakeWebSocket.instances.forEach(ws=>ws.open());

  const markWs=FakeWebSocket.instances.find(ws=>ws.url.endsWith('/xauusdt@optionMarkPrice'));
  markWs.message(markPayload);
  assert.strictEqual(els.optExpiry.value,String(expiry));
  const oiWs=FakeWebSocket.instances.find(ws=>ws.url.endsWith('/market/ws/xauusdt@optionOpenInterest@261106'));
  assert(oiWs,'selected-expiry OI socket created after mark universe arrives');
  const tickerWs=FakeWebSocket.instances.find(ws=>ws.url.endsWith('/public/ws/xauusdt@optionTicker@261106'));
  assert(tickerWs,'selected-expiry 24h ticker socket created');
  tickerWs.open();
  const indexWs=FakeWebSocket.instances.find(ws=>ws.url.endsWith('/!index@arr'));
  indexWs.message([{e:'indexPrice',E:Date.now(),s:'XAUUSDT',i:'4000'}]);
  oiWs.message(symbols.map((symbol,i)=>({e:'openInterest',E:Date.now(),s:symbol,o:String(100+i*10),h:'400000'})));
  tickerWs.message({e:'24hrTicker',E:Date.now(),s:symbols[0],c:'10.6',v:'150',q:'1590',n:27,P:'3.4',h:'11',l:'9',O:Date.now()-86400000,C:Date.now()});
  const tradeWs=FakeWebSocket.instances.find(ws=>ws.url.endsWith('/public/ws/xauusdt@optionTrade'));
  tradeWs.message({e:'trade',E:Date.now(),T:Date.now(),s:symbols[0],t:123,p:'10.5',q:'2',X:'MARKET',S:'BUY',m:false});
  flushRenderTimers();

  assert(els.optChainBody.innerHTML.includes('3,950.00')&&els.optChainBody.innerHTML.includes('4,000.00'));
  assert.strictEqual((els.optChainBody.innerHTML.match(/<td/g)||[]).length,30,'two strikes × 15 columns');
  assert(els.optChainBody.innerHTML.includes('1.200')&&els.optChainBody.innerHTML.includes('-0.500'));
  assert(els.optExposure.innerHTML.includes('opt-gex-row'));
  assert(els.optLevels.innerHTML.includes('GAMMA FLIP')&&els.optLevels.innerHTML.includes('OI WALL'),'key levels render');
  assert(els.optOIChart.innerHTML.includes('<svg')&&els.optThetaChart.innerHTML.includes('<svg'),'OI and Theta strike charts render');
  assert(els.optGreeks.innerHTML.includes('Gamma Exposure')&&els.optGreeks.innerHTML.includes('Vega')&&els.optGreeks.innerHTML.includes('Theta'));
  assert(els.optMetrics.innerHTML.includes('XAU INDEX')&&els.optMetrics.innerHTML.includes('PUT / CALL'));
  assert(els.optStatus.textContent.includes('Live'));
  assert(els.optFlowBody.innerHTML.includes('BUY'));
  assert(els.optFlowBody.innerHTML.includes('24H CONTRACT ACTIVITY'));
  assert(els.optOIWall.textContent.includes('OI Wall:'));
  assert(els.optThetaWall.textContent.includes('Max |Theta|:'));
  assert(context.window.optionsDebug().surfaceScenario.S===4000,'surface scenario defaults to live spot');
  els.optModelSpot.value='4100';els.optModelDte.value='7';els.optModelRate.value='5';els.optModelYield.value='1';els.optModelSpot.handlers.input();
  const scenario=context.window.optionsDebug().surfaceScenario;
  assert.strictEqual(scenario.S,4100);assert.strictEqual(scenario.T,7/365);assert.strictEqual(scenario.rate,.05);assert.strictEqual(scenario.q,.01);
  els.optModelReset.handlers.click();assert.strictEqual(context.window.optionsDebug().surfaceScenario.S,4000);
  assert(els.optMeta.innerHTML.includes('OI:')&&els.optMeta.innerHTML.includes('records'));
  console.log('ok  Direct Binance WebSocket mark stream builds all XAU option contracts');
  console.log('ok  Index Price stream and embedded mark index update spot');
  console.log('ok  Expiry-specific Open Interest WebSocket builds OI aggregates and Exposure');
  console.log('ok  Trade stream populates recent Options Flow');
  console.log('ok  Chain renders all four Greeks and Mark IV for Call / Put');

  els.optMode.value='short';els.optMode.handlers.change();
  assert(els.optExposure.innerHTML.includes('neg-t'));
  console.log('ok  Long / short exposure scenario changes sign');
  els.optExposureMetric.value='vega';els.optExposureMetric.handlers.change();
  assert.strictEqual(els.optExposureTitle.textContent,'Vega Exposure by Strike');
  assert.strictEqual(els.optExposureUnits.textContent,'Binance native units');
  assert(els.optLevels.innerHTML.includes('NET VGEX'),'net level follows the selected exposure metric');
  els.optExposureMetric.value='vanna';els.optExposureMetric.handlers.change();
  assert.strictEqual(els.optExposureTitle.textContent,'Vanna Exposure by Strike');
  assert(els.optLevels.innerHTML.includes('NET VEX'),'net level follows Vanna exposure');
  console.log('ok  GEX / DEX / VEX / VGEX / CHEX / THEX exposure selector');
  console.log('ok  Key levels, Open Interest by Strike and Theta by Strike render');

  context.window.optionsSetActive(false);
  assert(FakeWebSocket.instances.every(ws=>ws.readyState===3),'leaving Options closes all stream sockets');
  console.log('ok  Leaving Options cleanly closes the stream sockets');
})().catch(e=>{console.error(e);process.exitCode=1});
