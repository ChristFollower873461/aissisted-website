/* By Cloud and Fire v2 staging. Presentation only: the engine's view.stage says what is true; this draws it.
   Everything is drawn at one native scale (no scaled plates), on whole pixels, in the master palette.
   The approved plates supply sky, hills and landmarks (layers 0-3). The ground the household stands on is
   drawn here: textured sand, a trodden path, shadows. The plates' smeared nearest strip is no longer used. */
(function(){
'use strict';
const ROLES=['Elior','Sarela','Talven','Aviel','Liora'];
const images=new Map(),stages=new WeakMap(),requests=new WeakMap(),grounds=new Map(),palettes=new Map();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const KEEP_L4=new Set(['shur','far-shore']);
// The plate row where the drawn ground takes over from the painted one (the plates smear below it).
const GROUND_ROW={exodus:164,pursuit:164,elim:172,'red-sea':170,marah:172,'marah-bitter':172,shur:209,'far-shore':209};
const GROUND_FALLBACK={day:['#BF7050','#DA8A58','#EFA969','#F5C782'],dusk:['#74483E','#99515C','#BF7050','#DA8A58'],dawn:['#99515C','#BF7050','#DA8A58','#EFA969'],night:['#181829','#282339','#403047','#594052']};
const SKY={day:['#535184','#7975A1'],dusk:['#323264','#535184'],dawn:['#535184','#7975A1'],night:['#181829','#282339']};
function asset(name){
 if(!images.has(name)){const im=new Image();im.src='art/assets/'+name+'.png';images.set(name,im);}
 return images.get(name);
}
// The box of a sprite's opaque pixels inside its cell (over every frame it can show), so a tap target is the figure and not its cell.
const boxes=new Map(),ALL=[0,1,2,3,4,5,6,7];
function opaque(name,cols,row,w,h){
 const key=name+'|'+cols.join('')+'|'+row,full={x:0,y:0,width:w,height:h};if(boxes.has(key))return boxes.get(key);
 const im=asset(name);if(!im.complete||!im.naturalWidth)return full;
 let box=full;
 try{
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d',{willReadFrequently:true});
  let x0=w,y0=h,x1=-1,y1=-1;
  for(const col of cols){
   g.clearRect(0,0,w,h);g.drawImage(im,col*w,row*h,w,h,0,0,w,h);const px=g.getImageData(0,0,w,h).data;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(px[(y*w+x)*4+3]>40){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  }
  if(x1>=x0)box={x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
 }catch{/* a page opened from a file cannot read pixels: the cell stands in */}
 boxes.set(key,box);return box;
}
const within=(o,b)=>({x:o.x+b.x,y:o.y+b.y,width:b.width,height:b.height});
const variant=(base,house)=>!house||house==='Elior'?base:'v2/'+base+'-'+house.toLowerCase();
function stageOf(view){return view&&view.stage?view.stage:{scene:'exodus',light:'dusk',place:1,house:(view&&view.house)||'Elior',flock:7,riding:[],carried:{},extras:[],left:[],hungry:[],thirsty:[],weary:[],ground:[]};}
function assetsFor(view={}){
 const d=stageOf(view),list=['animals',variant('household-large',d.house),variant('household-condition',d.house),'travelers','inventory','v2/bundles'];
 for(let i=0;i<(KEEP_L4.has(d.scene)?5:4);i++)list.push('plates/'+d.scene+'/'+d.light+'/'+i);
 if(d.scene==='exodus')for(const band of ['far','middle','near'])list.push('depth-'+band);
 if(d.scene==='elim')list.push('v2/palms-far-'+d.light,'v2/palms-mid-'+d.light,'v2/palms-near-'+d.light,'dressing/wells-'+d.light);
 if(d.scene==='pursuit')list.push('dressing/pursuit-dust','dressing/pursuit-chariots');
 if(d.scene==='red-sea')list.push('dressing/red-sea-0','dressing/red-sea-1','dressing/red-sea-2');
 if(d.scene==='far-shore')list.push('dressing/shore-surf');
 if(d.scene==='marah'||d.scene==='marah-bitter')list.push(d.scene==='marah'?'marah-sweet':'marah-bitter');
 if(d.pillar)list.push(d.pillar==='fire'?'sign-fire':'sign-cloud-shelter',...(d.pillar==='fire'?['dressing/pillar-light']:[]));
 if(d.hearth)list.push('dressing/hearth-glow','campfire');
 return list;
}
async function preload(state={},view={}){
 const names=assetsFor(view);
 await Promise.all(names.map(name=>{const im=asset(name);if(im.complete)return Promise.resolve();
  return new Promise(resolve=>{im.addEventListener('load',resolve,{once:true});im.addEventListener('error',resolve,{once:true});});}));
 const missingAssets=names.filter(name=>!asset(name).naturalWidth);
 return {ready:!missingAssets.length,missingAssets};
}
/* ---- deterministic texture helpers ---- */
const hash=(x,y,s=0)=>{let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,2147483647))|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
function noise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const a=hash(xi,yi,s),b=hash(xi+1,yi,s),c=hash(xi,yi+1,s),d=hash(xi+1,yi+1,s);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const lum=hex=>{const n=parseInt(hex.slice(1),16);return ((n>>16)&255)*.3+((n>>8)&255)*.59+(n&255)*.11;};
/* The ground's colors come from the plate's own painted ground, so the seam cannot show. */
function groundPalette(d){
 const key=d.scene+'/'+d.light;if(palettes.has(key))return palettes.get(key);
 let colors=[];
 try{
  const off=document.createElement('canvas');off.width=384;off.height=216;const c=off.getContext('2d',{willReadFrequently:true});
  const n=KEEP_L4.has(d.scene)?5:4;for(let i=0;i<n;i++)c.drawImage(asset('plates/'+key+'/'+i),0,0);
  const y0=(GROUND_ROW[d.scene]||178)-14,data=c.getImageData(0,y0,384,10).data,count=new Map();
  for(let i=0;i<data.length;i+=4){const hex='#'+((1<<24)|(data[i]<<16)|(data[i+1]<<8)|data[i+2]).toString(16).slice(1).toUpperCase();count.set(hex,(count.get(hex)||0)+1);}
  // only earth: no scrub green, no sea or shadow blue (except at night, when the ground is ink and plum)
  const earth=d.light==='night'?['#181829','#282339','#403047','#594052','#65534C','#323264']:['#74483E','#995A45','#BF7050','#DA8A58','#EFA969','#F5C782','#FFDFA0','#934346','#C05443','#CE746E','#D69A83','#E7B39A','#99515C','#B75D72','#764663','#91715B','#B29579','#D2B696','#E46C38','#FF943E'];
  colors=[...count.entries()].sort((a,b)=>b[1]-a[1]).filter(e=>e[1]>40&&earth.includes(e[0])).slice(0,5).map(e=>e[0]);
 }catch(e){colors=[];}
 const fb=GROUND_FALLBACK[d.light]||GROUND_FALLBACK.day;
 for(const f of fb)if(colors.length<4&&!colors.includes(f))colors.push(f);
 colors.sort((a,b)=>lum(a)-lum(b));
 // one shade darker than the darkest, for shadows, ruts and the nearest edge
 const ink=d.light==='night'?'#181829':lum(colors[0])>120?'#74483E':'#403047';
 const out={colors,ink};palettes.set(key,out);return out;
}
/* Textured ground with a trodden path, pebbles and scrub. w x h native pixels; row 0 is the plate's ground line. */
function ground(d,w,h,pathY){
 const key=[d.scene,d.light,w,h,pathY].join('|');if(grounds.has(key))return grounds.get(key);
 const {colors,ink}=groundPalette(d),L=colors.length,cv=document.createElement('canvas');cv.width=w;cv.height=Math.max(1,h);
 const c=cv.getContext('2d'),seed=d.scene.length*7+d.light.length,dry=d.scene==='shur',dark=d.light==='night';
 for(let y=0;y<h;y++){
  const depth=y/Math.max(1,h),sx=22+44*depth,sy=3+9*depth;
  for(let x=0;x<w;x++){
   // long wind-drawn streaks, wider toward the viewer
   let v=noise(x/sx,y/sy,seed)*.62+noise(x/(sx*.35),y/(sy*.5),seed+3)*.38;
   v=v*(L-1)+.35;
   const pd=Math.abs(y-pathY-Math.sin(x/37)*2.5)/15;if(pd<1)v+=(1-pd*pd)*1.05;// the trodden road is paler and flatter
   v-=depth*depth*.55;// the near edge falls a little into shade
   const b=(BAYER[(x&3)+((y&3)<<2)]/16-.5)*.95;
   // the first rows fade in through the plate's own ground
   if(y<7&&BAYER[(x&3)+((y&3)<<2)]>=(y+1)*2.3)continue;
   c.fillStyle=colors[clamp(Math.floor(v+b),0,L-1)];c.fillRect(x,y,1,1);
  }
 }
 // wheel ruts and footprints along the road
 for(const rut of [-7,6]){for(let x=0;x<w;x++){const y=Math.round(pathY+rut+Math.sin(x/37)*2.5+Math.sin(x/9+rut)*.8);
   if(y>1&&y<h&&hash(x,rut,seed)>.28){c.fillStyle=colors[0];c.fillRect(x,y,1,1);if(hash(x,rut,seed+1)>.7){c.fillStyle=colors[L-1];c.fillRect(x,y+1,1,1);}}}}
 for(let i=0;i<w/3;i++){const x=Math.floor(hash(i,1,seed)*w),y=Math.round(pathY-9+hash(i,2,seed)*18);
  if(y>2&&y<h-1){c.fillStyle=colors[Math.min(1,L-1)];c.fillRect(x,y,2,1);c.fillStyle=colors[0];c.fillRect(x+1,y+1,1,1);}}
 // pebbles, larger toward the viewer
 for(let i=0;i<w*h/260;i++){const x=Math.floor(hash(i,3,seed)*w),y=Math.floor(hash(i,4,seed)*h);if(y<5||Math.abs(y-pathY)<10)continue;
  const s=y/h>.55?3:2;c.fillStyle=ink;c.fillRect(x,y,s,1);c.fillRect(x-(s>2?1:0),y+1,s+1,1);c.fillStyle=colors[L-1];c.fillRect(x,y-1,s-1,1);}
 // scrub: dry tufts in Shur, green ones where there is water
 const blades=dry||dark?[ink,colors[Math.min(1,L-1)]]:d.scene==='elim'||d.scene.startsWith('marah')?['#285155','#41726C','#649088']:['#513839','#74483E','#41726C'];
 for(let i=0;i<w*h/900;i++){const x=Math.floor(hash(i,5,seed)*(w-8))+4,y=Math.floor(hash(i,6,seed)*(h-8))+7;if(Math.abs(y-pathY)<13)continue;
  const big=y/h>.5?1:0;
  for(let k=-2-big;k<=2+big;k++){const hgt=2+big+Math.floor(hash(i,k+9,seed)*(3+big))-Math.abs(k);if(hgt<1)continue;
   c.fillStyle=blades[(k+i)&1?0:Math.min(blades.length-1,1+((i+k)&1))];c.fillRect(x+k,y-hgt,1,hgt);
   if(k>0&&blades[2]){c.fillStyle=blades[2];c.fillRect(x+k,y-hgt,1,1);}}
  c.fillStyle=ink;c.fillRect(x-2-big,y,5+big*2,1);}
 grounds.set(key,cv);return cv;
}
function draw(canvas,state={},view={},time=0,reduced=false){
 if(!canvas?.getContext)return null;
 const required=assetsFor(view),pending=required.filter(name=>!asset(name).complete);
 const request={view,time,reduced};requests.set(canvas,request);
 if(pending.length){
  canvas.dataset.sceneReady='false';
  preload(state,view).then(()=>{if(requests.get(canvas)===request)draw(canvas,state,view,time,reduced);});
  return {...(stages.get(canvas)||{}),ready:false,missingAssets:[]};
 }
 const d=stageOf(view),rect=canvas.getBoundingClientRect(),rw=rect.width||384,rh=rect.height||216;
 // A narrow stage (a phone) shows the middle of the plate at the same native scale, so the household stays large.
 const W=rw<rh*1.05?288:384,H=clamp(Math.round(W*rh/rw),150,600);
 if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const still=!!reduced||(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 const t=still?0:Number(time)||0,walking=d.walk&&!still,frame=walking?Math.floor(t*9)%8:0,night=d.light==='night';
 // B is the line the household's feet stand on. The plate's ground line (row 178) is set just above it.
 const stageEl=canvas.closest('#s1'),hudEl=stageEl?.querySelector('#instruments'),hudBox=hudEl&&!hudEl.hidden&&hudEl.getClientRects().length?hudEl.getBoundingClientRect():null;
 const roof=hudBox?Math.max(0,Math.round((hudBox.bottom-rect.top)*H/rh)):0;
 const B=Math.round(clamp(H*.6,roof+78,H-64)),py=B-6-178,px=-Math.round((384-W)/2),G=py+(GROUND_ROW[d.scene]||178);
 const failed=[];
 function sprite(name,col,row,w,h,x,y,alpha=1){
  const im=asset(name);if(!im.complete||!im.naturalWidth){if(im.complete)failed.push(name);return;}
  if(alpha!==1){c.save();c.globalAlpha=alpha;}
  c.drawImage(im,col*w,row*h,w,h,Math.round(x),Math.round(y),w,h);
  if(alpha!==1)c.restore();
 }
 const layer=(name,frames=1,fps=4)=>sprite(name,frames>1?Math.floor(t*fps)%frames:0,0,384,216,px,py);
 // ---- sky above the plate ----
 const sky=SKY[d.light]||SKY.day;c.fillStyle=sky[1];c.fillRect(0,0,W,H);
 if(py>0){
  const top=asset('plates/'+d.scene+'/'+d.light+'/0');
  if(d.scene==='red-sea'){
   // Exodus 14:22: the walls stand higher than the frame. The plate's own waves are carried upward, mirrored row for row.
   for(let y=py-1,k=0;y>=0;y--,k++){const row=Math.floor(k/30)%2?29-(k%30):k%30;for(let i=0;i<4;i++)c.drawImage(asset('plates/red-sea/'+d.light+'/'+i),0,row,384,1,px,y,384,1);}
  }else{
   c.drawImage(top,0,0,384,1,px,0,384,py);// the plate's top row of sky, carried up
   for(let y=0;y<py;y++){const k=1-y/py;for(let x=0;x<W;x++)if(BAYER[(x&3)+((y&3)<<2)]/16<k*.85){c.fillStyle=sky[0];c.fillRect(x,y,1,1);}}
   if(night)for(let i=0;i<W*py/160;i++){const x=Math.floor(hash(i,11)*W),y=Math.floor(hash(i,12)*py);c.fillStyle=hash(i,13)>.7?'#F7EDD1':'#7975A1';c.fillRect(x,y,1,1);}
  }
 }
 // ---- the approved plates and their dressing ----
 const n=KEEP_L4.has(d.scene)?5:4;
 for(let i=0;i<n;i++){
  const im=asset('plates/'+d.scene+'/'+d.light+'/'+i);
  if(im.complete&&im.naturalWidth)c.drawImage(im,px+(walking?Math.round(Math.sin(t*.5)*i*.7):0),py);else if(im.complete)failed.push('plates/'+d.scene+'/'+d.light+'/'+i);
  if(i===2&&d.scene==='elim')layer('v2/palms-far-'+d.light);
  if(i===3&&d.scene==='elim'){layer('dressing/wells-'+d.light);layer('v2/palms-mid-'+d.light);}
  if(i===3&&d.scene==='exodus')for(const band of ['far','middle','near'])layer('depth-'+band,4,walking?4:0);
  if(i===3&&d.scene==='red-sea')for(const band of [0,1,2])layer('dressing/red-sea-'+band,4,4);
 }
 if(d.scene==='pursuit'){layer('dressing/pursuit-dust',4,3);layer('dressing/pursuit-chariots',4,5);}
 if(d.scene==='far-shore')layer('dressing/shore-surf',4,4);
 if(d.scene==='marah'||d.scene==='marah-bitter')layer(d.scene==='marah'?'marah-sweet':'marah-bitter');
 // ---- the ground the household stands on ----
 const pal=groundPalette(d);
 if(H>G)c.drawImage(ground(d,W,H-G,B-G+12),0,G);
 if(d.scene==='elim')layer('v2/palms-near-'+d.light);
 if(d.cross){
  // Near walls at the edges of the frame: deep water standing, a lit inner face, foam at the crest, spray at the foot.
  const wide=Math.round(W*.085),foot=H;
  for(const side of [0,1])for(let y=0;y<foot;y++){
   const face=wide+Math.round(Math.sin(y/9+side*2)*3+Math.sin(y/23)*3+Math.max(0,y-B+40)*.22),x0=side?W-face:0;
   c.fillStyle='#282339';c.fillRect(x0,y,face,1);
   for(let x=0;x<face;x++){const gx=x0+x,inner=side?x:face-1-x,v=noise(gx/5,(y+t*14)/19,side+5)+noise(gx/2,(y+t*22)/7,side+9)*.5;
    if(inner<2){c.fillStyle='#9996AD';c.fillRect(gx,y,1,1);}
    else if(v>1.02){c.fillStyle='#7975A1';c.fillRect(gx,y,1,1);}
    else if(v>.78&&((gx+y)&1)){c.fillStyle='#535184';c.fillRect(gx,y,1,1);}
    else if(v>.6){c.fillStyle='#323264';c.fillRect(gx,y,1,1);}}
   if(y>B-20&&hash(y,side,3)>.45){c.fillStyle=(y&1)?'#CBC2BB':'#9996AD';const sx=side?x0-1-Math.floor(hash(y,1,side)*5):x0+face+Math.floor(hash(y,1,side)*5);c.fillRect(sx,y,1+(y&1),1);}
  }
 }
 // ---- the pillar: far ahead of the camp by day and night; behind it at the sea ----
 if(d.pillar){
  const onRoad=d.walk||/^(PACE|R-PACE|M\d|SEAT|R-SEAT|T1|T4-noon|T6)/.test(view.beatId||'');
  const ps=onRoad?[.5,.62,.75][d.place??1]:.55,pw=Math.round(112*ps),ph=Math.round(132*ps);
  const ppx=d.pillarBehind?2:W-pw-2,ppy=Math.max(roof+2,py+166-ph),im=asset(d.pillar==='fire'?'sign-fire':'sign-cloud-shelter'),f=Math.floor(t*(d.pillar==='fire'?8:4))%8;
  if(d.pillar==='fire'){const g=asset('dressing/pillar-light');c.drawImage(g,(Math.floor(t*8)%8)*132,0,132,136,ppx-Math.round(10*ps),ppy-2,Math.round(132*ps),Math.round(136*ps));}
  c.drawImage(im,f*112,0,112,132,ppx,ppy,pw,ph);
 }
 // ---- the household ----
 const road=d.walk||/^(PACE|R-PACE|M\d|SEAT|R-SEAT|T1|T4-noon|T6)/.test(view.beatId||'');
 const side=W>=384?2:1,aheadN=road&&!d.cross?Math.min(side,2-(d.place??1)):0,behindN=road&&!d.cross?Math.min(side,(d.place??1)):0;
 const progress=d.cross?clamp(Number(view.marker??view.activity?.marker??0)/(view.activity?.markers||6),0,1):0;
 const mid=W/2,squeeze=x=>d.cross?mid+(x-mid)*.8:x;
 const guests=d.loom?2:0,tight=(road||guests)&&!d.cross;
 const gap=tight?(W>=384?44:33):Math.round((W-104)/5),left=tight?8+Math.max(behindN,guests)*(W>=384?44:36):22,shift=0;
 const shadow=(cx,fy,rx)=>{c.fillStyle=pal.ink;for(let y=-2;y<=2;y++){const half=Math.round(rx*Math.sqrt(1-(y*y)/6.5));for(let x=-half;x<=half;x++)if(((cx+x+fy+y)&1)===0)c.fillRect(Math.round(cx+x),Math.round(fy+y),1,1);}};
 const hot=state?.hot;
 const donkey={id:'Donkey',x:Math.round(squeeze(left+5*gap+(tight?0:6))+progress*6),y:B-30,width:48,height:32};
 const riders=(d.riding||[]).filter(r=>!(d.carried||{})[r]),carried=d.carried||{};
 const walkers=ROLES.map((role,index)=>{
  let x=squeeze(left+index*gap),y=B-48,pose=walking?'walking':'standing',sheetCol=null;
  if(d.thirsty?.includes(role)){pose='head-down';sheetCol=2;}
  else if(d.hungry?.includes(role)){pose='sitting';sheetCol=0;}
  else if(d.weary?.includes(role)||d.flagging===role){pose='weary';sheetCol=1;}
  if(d.limping&&index===0){pose='limping';sheetCol=1;}
  if(d.drinking){pose='drinking';sheetCol=2;}
  if(d.cross)x+=progress*10;
  if(d.afraid&&index===4&&sheetCol===null){pose='afraid';sheetCol=1;}
  if(d.staff&&index===3)x=squeeze(left)+26;
  const ri=riders.indexOf(role);
  if(ri>=0){x=donkey.x+2-ri*20;y=B-74;pose='riding';sheetCol=0;}
  const how=carried[role];
  if(how&&how.startsWith('hand:')){const by=ROLES.indexOf(how.slice(5));x=squeeze(left+by*gap)+8;y=B-66;pose='carried';sheetCol=0;}
  else if(how&&road){x=6+ROLES.filter((r,k)=>k<index&&carried[r]&&!carried[r].startsWith('hand:')).length*16;y=B-70;pose='carried-by-neighbors';sheetCol=0;}
  else if(how){pose='resting';sheetCol=0;}
  if(d.dance&&(index===1||index===4)){pose='dancing';sheetCol=null;if(!still)y-=Math.abs(Math.sin(t*4+index))*5;}
  const bob=walking&&sheetCol===null?Math.round(Math.sin(t*6+index)*1.2):0;
  return {id:role,role,index,x:Math.round(x),y:Math.round(y+bob),width:44,height:50,pose,sheetCol,hidden:(d.gone||[]).includes(role)};
 });
 const count=clamp(Number(d.flock)||7,1,10),gone=d.gone||[];
 const flock=Array.from({length:count},(_,i)=>{
  const span=(W-70)/Math.max(count,6);
  // by a hearth the flock lies to either side of the fire
  let x=squeeze(26+shift*.5+i*span)+progress*10;const y=B+10+(i%2)*13;
  if(d.hearth){const half=Math.ceil(count/2),side=i<half?0:1,k=side?i-half:i,room=(W/2-34)/Math.max(half,3);x=side?W/2+26+k*room:W/2-74-k*room;}
  return {id:i,x:Math.round(x),y:Math.round(y),width:48,height:32,pose:d.drinking?'drinking':d.flockStep>=2?'straggling':d.flockStep===1?'thirsty':walking?'walking':'standing'};
 });
 let drawnAnimals=0;
 // neighbors in the column: who is ahead of you and who behind shows your place
 const neighbors=[];
 const neighbor=(kind,row,x,y,alpha=1)=>{sprite('travelers',walking?frame:0,row,44,50,x,y,alpha);neighbors.push({kind,x,y,width:44,height:50});};
 if(road&&!d.cross){
  const step=W>=384?44:36;
  for(let i=0;i<aheadN;i++){const x=W-42-i*step;shadow(x+22,B+1,11);neighbor('ahead',i?3:0,x,B-48);}
  for(let i=0;i<behindN;i++){const x=-4+i*step;shadow(x+22,B+1,11);neighbor('behind',i?0:3,x,B-48);}
 }
 if(road&&Object.values(carried).some(how=>!how.startsWith('hand:'))){shadow(30,B+1,18);sprite('animals',frame,0,48,32,6,B-30);}
 if(d.grandmother){shadow(W-92,B+1,12);neighbor('Waterskins',2,W-114,B-48);}
 if(d.loom){const step=W>=384?44:36;shadow(22,B+1,12);neighbor('Loom',3,0,B-48);shadow(22+step,B+1,10);neighbor('Loom',0,step,B-48);}
 // shadows first, then the far row (people), then the near row (flock)
 if(!d.donkeyGone)shadow(donkey.x+24,B+1,19);
 for(const w of walkers)if(!gone.includes(w.role)&&!['riding','carried','carried-by-neighbors'].includes(w.pose))shadow(w.x+22,B+1,w.index>=3?9:12);
 for(const a of flock)shadow(a.x+22,a.y+31,14);
 if(d.hearth){sprite('dressing/hearth-glow',Math.floor(t*4)%4,0,72,16,Math.round(mid)-36,B+32);sprite('campfire',Math.floor(t*8)%8,0,16,18,Math.round(mid)-8,B+20);}
 if(!d.donkeyGone)sprite('animals',frame,0,48,32,donkey.x,donkey.y);
 const large=variant('household-large',d.house),cond=variant('household-condition',d.house);
 for(const w of walkers){
  if(gone.includes(w.role))continue;// at rest: the family walks on, four together
  if(w.sheetCol===null)sprite(large,(walking||w.pose==='dancing')?(frame+w.index)%8:0,w.index,44,50,w.x,w.y);
  else sprite(cond,w.sheetCol,w.index,44,50,w.x,w.y);
 }
 for(const a of flock){
  const weary=d.flockStep>=1,row=(walking&&!weary?1:3)+a.id%2;
  sprite('animals',still?0:(Math.floor(t*(weary?2:walking?9:3))+a.id)%8,row,48,32,a.x,a.y+(d.flockStep>=2?1:0));drawnAnimals++;
  a.drawn=within({x:a.x,y:a.y+(d.flockStep>=2?1:0)},opaque('animals',still?[0]:ALL,row,48,32));
 }
 // what was drawn, pixel for pixel: the figure inside its cell
 for(const w of walkers)w.drawn=within(w,w.sheetCol===null?opaque(large,(walking||w.pose==='dancing')?ALL:[0],w.index,44,50):opaque(cond,[w.sheetCol],w.index,44,50));
 donkey.drawn=within(donkey,opaque('animals',walking?ALL:[0],0,48,32));
 // what was not packed stays on the ground in Egypt
 (d.ground||[]).forEach((item,i)=>{const col=['spare','sack','seat','loom','trough'].indexOf(item);sprite('v2/bundles',col,0,20,16,Math.round(mid-58+i*24),Math.min(H-18,B+58));});
 const fx=Math.min(...flock.map(a=>a.drawn.x)),fy=Math.min(...flock.map(a=>a.drawn.y));
 const targets=Object.fromEntries(walkers.filter(w=>!w.hidden).map(w=>[w.role,{id:w.role,...w.drawn}]));
 targets.Flock={id:'Flock',x:fx,y:fy,width:Math.max(...flock.map(a=>a.drawn.x+a.drawn.width))-fx,height:Math.max(...flock.map(a=>a.drawn.y+a.drawn.height))-fy};
 if(!d.donkeyGone)targets.Donkey={id:'Donkey',...donkey.drawn};
 const geometry={scene:d.scene,light:d.light,cross:!!d.cross,width:W,height:H,baseline:B,plateTop:py,groundTop:G,walkers,flock,flockCount:count,drawnAnimals,donkeyGone:!!d.donkeyGone,donkey,neighbors,targets,progress,
  place:d.place??1,ahead:neighbors.filter(x=>x.kind==='ahead').length,behind:neighbors.filter(x=>x.kind==='behind').length,palms:d.scene==='elim'?70:0,
  walking,still,missingAssets:failed,ready:required.every(name=>asset(name).complete&&asset(name).naturalWidth>0)};
 stages.set(canvas,geometry);canvas.dataset.sceneReady=String(geometry.ready);canvas.dataset.place=String(geometry.place);canvas.dataset.flock=String(drawnAnimals);canvas.dataset.donkey=String(!d.donkeyGone);canvas.dataset.ahead=String(geometry.ahead);
 canvas.dispatchEvent(new CustomEvent('s2scene',{detail:geometry}));return geometry;
}
const geometry=canvas=>stages.get(canvas)||null;
window.V2Scene=Object.freeze({draw,geometry,preload,assetsFor,ROLES});
}());
