/* Options surface: axes/labels renderer + statistics panels, using a stubbed THREE and DOM. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const mkEl=id=>({id,innerHTML:'',textContent:'',className:'',value:'',hidden:false,disabled:false,style:{},clientWidth:480,clientHeight:320,handlers:{},
  classList:{add(){},remove(){}},appendChild(){},setPointerCapture(){},addEventListener(k,fn){this.handlers[k]=fn}});
const ids=['v-options','optExpiry','optStatus','optMetrics','optExposure','optGreeks','optChainBody','optMeta','optErrors','optRefresh','optExplain','optMethod',
 'optExposureMetric','optExposureTitle','optExposureUnits','optFlowBody','optLevels','optCopyLevels','optOIChart','optOIWall',
 'optModelSpot','optModelDte','optModelRate','optModelYield','optModelReset','optSurfaceMetric','optGreekMetric','optGreekSide',
 'optSurface','optGreekSurface','optSurfaceReset','optGreekReset','optSurfaceMin','optSurfaceMax','optGreekSurfaceMin','optGreekSurfaceMax',
 'optSurfaceNote','optGreekSurfaceNote','optSurfaceGrad','optGreekSurfaceGrad','optSurfaceStats','optGreekSurfaceStats'];
const els=Object.fromEntries(ids.map(id=>[id,mkEl(id)]));
const timers=new Map();let tid=0;
const st=(fn,ms)=>{timers.set(++tid,{fn,ms});return tid},ct=id=>timers.delete(id);
const runTimers=()=>{let g=0;while(timers.size&&g++<50){for(const [id,t] of [...timers]){timers.delete(id);t.fn();}}};
class FakeWebSocket{static instances=[];constructor(u){this.url=u;this.readyState=0;FakeWebSocket.instances.push(this)}
  open(){this.readyState=1;this.onopen&&this.onopen({})}message(d){this.onmessage&&this.onmessage({data:JSON.stringify(d)})}close(){this.readyState=3}}
let spriteCount=0,meshCount=0;
class Obj{constructor(){this.children=[];this.position={set(){},x:0,y:0,z:0};this.scale={set:(x,y)=>{this.sx=x},x:1,y:1};this.rotation={x:0};this.visible=true;this.material={dispose(){}};this.geometry={dispose(){}};this.domElement={}}
  add(o){this.children.push(o)}remove(){}traverse(cb){cb(this);this.children.forEach(c=>c.traverse?c.traverse(cb):cb(c))}
  setAttribute(){}setIndex(){}computeVertexNormals(){}setSize(){}setPixelRatio(){}setClearColor(){}render(){}lookAt(){}updateProjectionMatrix(){}}
const THREE=new Proxy({Sprite:class extends Obj{constructor(){super();spriteCount++}},Mesh:class extends Obj{constructor(){super();meshCount++}}},
  {get:(t,k)=>t[k]||(k==='DoubleSide'?2:Obj)});
const canvas={getContext:()=>({measureText:()=>({width:60}),fillText(){}}),width:0,height:0};
const context={document:{readyState:'complete',getElementById:id=>els[id]||null,visibilityState:'visible',createElement:()=>({...canvas})},
  window:{WebSocket:FakeWebSocket,WebGLRenderingContext:function(){},devicePixelRatio:1,addEventListener(){}},THREE,WebSocket:FakeWebSocket,
  Date,Intl,Number,Math,Map,Set,Array,String,Object,Promise,Error,console,setTimeout:st,clearTimeout:ct,setInterval:()=>1,clearInterval:()=>{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js','options.js'),'utf8'),context);
const symbols=[];[3950,4000,4050,4100].forEach(k=>['C','P'].forEach(s=>symbols.push(`XAU-261106-${k}-${s}`)));
(async()=>{
  context.window.optionsSetActive(true);FakeWebSocket.instances.forEach(w=>w.open());
  const find=sfx=>FakeWebSocket.instances.find(w=>w.url.endsWith(sfx));
  find('/xauusdt@optionMarkPrice').message(symbols.map((s,i)=>({s,mp:'10.5',vo:String(.22+i*.01),b:'.2',a:'.3',d:s.endsWith('C')?'0.6':'-0.4',g:'0.002',v:'1.2',t:'-0.5',i:'4040',E:Date.now(),e:'markPrice'})));
  find('/market/ws/xauusdt@optionOpenInterest@261106').message(symbols.map((s,i)=>({e:'openInterest',E:Date.now(),s,o:String(50+i*17),h:'1'})));
  runTimers();
  const ex=els.optSurfaceStats.innerHTML,gr=els.optGreekSurfaceStats.innerHTML;
  assert(ex.includes('PEAK |VALUE|')&&ex.includes('NET · NOW')&&ex.includes('CUM. FLIP · NOW')&&ex.includes('Δ NET'),'exposure stats');
  assert(gr.includes('AT SPOT · NOW')&&gr.includes('MEAN')&&gr.includes('GRID'),'greek stats');
  assert(els.optSurfaceGrad.style.background.startsWith('linear-gradient'),'legend gradient set');
  assert(spriteCount>20,'axis labels created ('+spriteCount+')');
  assert(meshCount>=2,'surface mesh + zero plane');
  assert(els.optSurfaceNote.textContent.includes('quy ước Call +, Put −'),'gamma note mentions convention');
  if(process.env.SHOW){const strip=h=>[...h.matchAll(/<span>([^<]*)<\/span><b>([^<]*)<\/b><small>([^<]*)/g)].map(m=>m[1]+' = '+m[2]+'  ('+m[3]+')').join('\n');console.log(strip(ex));console.log('--');console.log(strip(gr));}
  // metric switch re-renders stats without errors
  els.optSurfaceMetric.value='vega';els.optSurfaceMetric.handlers.change();
  assert(els.optSurfaceStats.innerHTML.includes('PEAK |VALUE|'));
  els.optGreekSide.value='P';els.optGreekSide.handlers.change();
  assert(els.optGreekSurfaceStats.innerHTML.includes('AT SPOT'));
  console.log('ok  Surface renders axes/labels and statistics for Exposure and Greek surfaces');
})().catch(e=>{console.error(e);process.exit(1)});
