/* By Cloud and Fire v2 activities (script A1-A5). Each ends by handing the engine one outcome;
   the engine alone changes the household. Clocks stop on pause, a hidden tab and popups. */
(function(root){
'use strict';
function mount(o){
 const {container,id,view,setup,onFinish=()=>{},onRender=()=>{}}=o,mode=o.mode||'Normal';
 let calm=mode==='Easy'&&id!=='A2',paused=false,modal=false,disposed=false,done=false,last=performance.now();
 const frozen=()=>paused||modal||document.hidden||!!(o.isPaused&&o.isPaused());
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,attrs={})=>{const b=el('button',text);b.type='button';for(const [k,val] of Object.entries(attrs)){if(k==='disabled')b.disabled=!!val;else if(k==='class')b.className=val;else b.setAttribute(k,String(val));}
  b.addEventListener('click',()=>{if(!done&&!frozen())fn();});return b;};
 const chips=list=>{const row=el('span',null,'chips');row.append(...list.map(t=>el('span',t)));return row;};
 const canvas=o.canvas;let overlay=null;
 let w={elapsed:0};
 function finish(payload){if(done||disposed)return;done=true;clearInterval(timer);onFinish(payload);}
 function head(extraControls=[]){
  container.replaceChildren();container.className='act';container.dataset.activity=id;
  container.append(el('h2',view.title),el('p',(w.phase==='balance'&&view.instruction2)||view.instruction,'instr'));
  for(const q of view.scripture)container.append(el('blockquote',q.text));
  for(const ref of view.refs)container.append(button(ref,()=>o.openScripture?.(ref),{class:'ref'}));
  for(const n of view.notes||[])container.append(el('p',n,'linenote'));
  if(view.chips?.length){const row=el('span',null,'paidrow');row.append(...view.chips.map(t=>el('span',t,'paid')));container.append(row);}
  if(extraControls.length){const c=el('div',null,'controls');c.append(...extraControls);container.append(c);}
 }
 const startBtn=()=>button('Start',()=>{w.started=true;w.elapsed=0;last=performance.now();render();},{id:'startActivity',class:'storyNext'});
 const slow=label=>button(label||'Take it slow (no clock)',()=>{calm=true;render();},{'data-focus':'calm','aria-pressed':calm});
 /* ---------- A1 Load the donkey: pick two, then balance ---------- */
 if(id==='A1'){w.phase='pick';w.pick=[];w.bundles=[];w.sel=null;w.history=[];}
 function a1Info(){
  const seat=w.pick.includes('seat'),caps={Left:8,Right:8,Saddle:seat?0:3,Hands:4},totals={Left:0,Right:0,Saddle:0,Hands:0};
  for(const b of w.bundles)if(b.place)totals[b.place]+=b.weight;
  const legal=w.bundles.every(b=>b.place)&&Object.keys(caps).every(p=>totals[p]<=caps[p])&&Math.abs(totals.Left-totals.Right)<=2;
  const stones=w.bundles.find(b=>b.label==='Cook stones');
  return {seat,caps,totals,legal,accessible:!!stones&&['Saddle','Hands'].includes(stones.place)};
 }
 function a1(){
  if(w.phase==='pick'){
   head();const tiles=el('div',null,'tiles');
   for(const t of setup.tiles){
    const b=button(null,()=>{const i=w.pick.indexOf(t.id);if(i>=0)w.pick.splice(i,1);else if(w.pick.length<2)w.pick.push(t.id);render();},{class:'tile','data-tile':t.id,'aria-pressed':w.pick.includes(t.id)});
    b.append(el('span',t.label),chips(t.chips));tiles.append(b);
   }
   container.append(tiles,button('Load these',()=>{
    w.phase='balance';w.started=false;w.bundles=setup.bundles.map(([label,weight])=>({label,weight,place:null}));
    for(const x of w.pick)if(x!=='seat')w.bundles.push({label:setup.names[x],weight:setup.weights[x],place:null});render();
   },{id:'loadThese',class:'storyNext',disabled:w.pick.length!==2}));
   return;
  }
  const info=a1Info();
  head([...(w.started?[]:[startBtn()]),button('Undo',()=>{const h=w.history.pop();if(h){w.bundles=h;w.sel=null;render();}},{disabled:!w.history.length}),slow(),
   button('Finish',()=>finish({pick:w.pick.slice(),legal:info.legal,stonesAccessible:info.accessible}),{id:'finishActivity'})]);
  const bundles=el('div',null,'bundles');
  w.bundles.forEach((b,i)=>{const t=button(null,()=>{w.sel=i;render();},{'data-bundle':i,'aria-pressed':w.sel===i,disabled:!w.started});t.append(el('span',b.label),el('b',String(b.weight)));if(b.place)t.append(el('small',b.place));bundles.append(t);});
  const places=el('div',null,'places');
  for(const place of ['Left','Right','Saddle','Hands']){
   const locked=place==='Saddle'&&info.seat;
   const t=button(null,()=>{if(w.sel===null)return;w.history.push(w.bundles.map(b=>({...b})));w.bundles[w.sel].place=place;w.sel=null;render();},{'data-place':place,disabled:locked,class:w.sel!==null&&!locked?'target':''});
   t.append(el('span',locked?'Saddle seat':place),el('b',locked?'for a rider':info.totals[place]+'/'+info.caps[place]));t.classList.toggle('over',info.totals[place]>info.caps[place]);places.append(t);
  }
  container.append(bundles,places);
  if(!calm&&w.started)container.append(el('output',Math.max(1,Math.ceil(150-w.elapsed/1000))+' s','clock'));
 }
 /* ---------- A2 Cakes on the stones: real-time cooling ---------- */
 if(id==='A2'){w.phase='bowls';w.bowls=1;w.stacks=[];w.sel=null;w.started=false;w.pickBowls=null;}
 const stepMs=()=>calm?setup.slowMs:setup.stepMs;
 function a2Cool(){
  // Each stone cools one step every interval; the stones were set down one after another, so they do not all go at once.
  for(const [i,s] of w.stacks.entries())if(s.cloth===null){s.steps=Math.min(2,Math.floor(Math.max(0,w.elapsed-i*stepMs()/2)/stepMs()));}
 }
 function a2Done(){return w.stacks.every(s=>s.cloth!==null||s.steps>=2);}
 function a2(){
  if(w.phase==='bowls'){
   head();const row=el('div',null,'rows');
   // chosen like every other choice: select, then Choose
   const pickBowls=n=>()=>{w.pickBowls=n;render();container.querySelector('#chooseBowls')?.focus({preventScroll:true});};
   row.append(button('Bake one bowl',pickBowls(1),{'data-bowls':1,'aria-pressed':w.pickBowls===1}));
   if(setup.maxBowls>=2)row.append(button('Bake two bowls',pickBowls(2),{'data-bowls':2,'aria-pressed':w.pickBowls===2}));
   container.append(row);
   if(w.pickBowls)container.append(button('Choose',()=>a2Start(w.pickBowls),{id:'chooseBowls',class:'storyNext'}));
   return;
  }
  a2Cool();
  head([w.started?button('Finish',()=>a2Finish(),{id:'finishActivity',class:'storyNext'}):startBtn(),button('Take it slow',()=>{calm=true;render();},{'data-focus':'calm','aria-pressed':calm})]);
  container.append(el('p',w.started?'Tap a stack, then a cloth. Five cakes for each stack wrapped warm.':'Tap a stack, then a cloth. The stones begin to cool when you tap Start.','linenote'));
  const stones=el('div',null,'stones');
  w.stacks.forEach((s,i)=>{
   const hard=s.cloth===null&&s.steps>=2;
   const b=button(null,()=>{w.sel=i;render();},{'data-stack':i,'aria-pressed':w.sel===i,disabled:!w.started||s.cloth!==null||hard,class:'stone'+(s.cloth!==null?' wrapped':'')});
   b.dataset.heat=String(s.cloth!==null?2:2-s.steps);
   b.append(el('span',s.cloth!==null?'✓':hard?'hard':'🔥'.repeat(2-s.steps)),el('b',hard?'0':'5'));stones.append(b);
  });
  const cloths=el('div',null,'cloths');
  for(let cI=0;cI<w.bowls;cI++){
   const n=w.stacks.filter(s=>s.cloth===cI).length;
   const b=button(null,()=>{if(w.sel===null||n>=2)return;const s=w.stacks[w.sel];if(s.cloth!==null||s.steps>=2)return;s.cloth=cI;w.sel=null;if(a2Done())a2Finish();else render();},{'data-cloth':cI,disabled:n>=2});
   b.append(el('span','Cloth '+(cI+1)),el('b',n+' of 2'));cloths.append(b);
  }
  container.append(stones,cloths);
 }
 function a2Start(n){w.phase='wrap';w.bowls=n;w.stacks=Array.from({length:n*2},()=>({steps:0,cloth:null}));w.elapsed=0;w.started=false;render();}
 function a2Finish(){a2Cool();const hard=w.stacks.filter(s=>s.cloth===null).length;finish({bowls:w.bowls,hard});}
 /* ---------- A3 Between the waters ---------- */
 const CALLS={liora:'needs a hand',lamb:'needs a keeper',bundle:'load slipping',adult:'needs a pause'};
 const targetOf=kind=>kind==='liora'?'Liora':kind==='lamb'?'Flock':kind==='bundle'?'Donkey':setup.adult;
 const targetName=t=>t==='Liora'?setup.youngest:t===setup.adult?setup.adultName:t;
 if(id==='A3'){w.marker=0;w.markers=setup.markers.length;w.losses=[];w.resolving=false;w.note='';w.saved=null;w.hit=[];w.tapped=null;
  if(canvas){overlay=document.createElement('div');overlay.className='s2-cross-overlay';container.closest('#s1').append(overlay);canvas.addEventListener('s2scene',place);root.addEventListener('resize',place);}}
 function place(){
  if(!overlay||!canvas)return;const g=root.V2Scene?.geometry(canvas),r=canvas.getBoundingClientRect();if(!g||!g.cross){overlay.hidden=true;return;}
  overlay.hidden=false;
  // Each target is the drawn figure, grown to a finger's width, and cut back wherever it would reach another figure.
  const sx=r.width/g.width,sy=r.height/g.height,css=t=>({l:r.left+t.x*sx,t:r.top+t.y*sy,r:r.left+(t.x+t.width)*sx,b:r.top+(t.y+t.height)*sy});
  const figures=g.walkers.filter(x=>!x.hidden).map(x=>({id:x.role,d:css(x.drawn)}));
  if(g.targets.Donkey)figures.push({id:'Donkey',d:css(g.targets.Donkey)});
  figures.push({id:'Flock',d:css(g.targets.Flock)});
  for(const b of overlay.children){
   const t=g.targets[b.dataset.target];if(!t){b.style.display='none';continue;}
   const d=css(t),gx=Math.max(0,(44-(d.r-d.l))/2),gy=Math.max(0,(44-(d.b-d.t))/2),box={l:d.l-gx,t:d.t-gy,r:d.r+gx,b:d.b+gy};
   for(const f of figures){
    if(f.id===b.dataset.target)continue;const o=f.d;
    const hgap=Math.max(o.l-d.r,d.l-o.r),vgap=Math.max(o.t-d.b,d.t-o.b);
    let horizontal=hgap>=vgap,cut;
    if(hgap<0&&vgap<0){// the two figures overlap (a rider, a carried child): part them between their middles
     const dx=Math.abs((o.l+o.r)-(d.l+d.r)),dy=Math.abs((o.t+o.b)-(d.t+d.b));horizontal=dx>=dy;
     cut=horizontal?((o.l+o.r)+(d.l+d.r))/4:((o.t+o.b)+(d.t+d.b))/4;
     if(horizontal){if(o.l+o.r>d.l+d.r)box.r=Math.min(box.r,cut);else box.l=Math.max(box.l,cut);}
     else{if(o.t+o.b>d.t+d.b)box.b=Math.min(box.b,cut);else box.t=Math.max(box.t,cut);}
    }else if(horizontal){if(o.l>=d.r)box.r=Math.min(box.r,(o.l+d.r)/2);else box.l=Math.max(box.l,(o.r+d.l)/2);}
    else{if(o.t>=d.b)box.b=Math.min(box.b,(o.t+d.b)/2);else box.t=Math.max(box.t,(o.b+d.t)/2);}
   }
   b.style.display='';b.style.left=box.l+'px';b.style.top=box.t+'px';b.style.width=(box.r-box.l)+'px';b.style.height=(box.b-box.t)+'px';
  }
 }
 function a3Need(){const kinds=setup.markers[w.marker]||[],urgent=kinds.length>1||kinds[0]===setup.urgent;return {kinds,urgent,seconds:setup.seconds[urgent?0:1]};}
 function a3Resolve(target){
  if(w.resolving||w.marker>=w.markers||done||frozen())return;
  const kinds=a3Need().kinds,saved=kinds.find(k=>targetOf(k)===target),lost=kinds.filter(k=>k!==saved);
  w.hit=kinds.map(targetOf);w.saved=saved?targetOf(saved):null;w.tapped=target;w.note='';
  if(lost.length){w.losses.push(...lost);w.note=o.note?o.note(w.losses.slice())||'':'';}
  w.resolving=true;w.pending=lost.length?1500:650;render();
 }
 function a3(){
  head([w.started?button('Crossing…',()=>{},{disabled:true,class:'storyNext'}):startBtn(),slow()]);overlay?.replaceChildren();
  if(!w.started){container.append(el('p','Someone will call. Tap them in the picture.','linenote'));return;}
  if(w.marker<w.markers){
   const n=a3Need();
   if(n.kinds.length>1)container.append(el('p','The crowd is thick at the back. You can only reach one.','two'));
   const feedback=w.resolving?(w.saved?'✓ '+targetName(w.saved)+' helped.':'Missed — '+(w.tapped?'that was not the caller.':'the call ended.')):'';
   const status=el('output',feedback||(calm?'Take it slow (no clock)':'Answer before the count ends: '+Math.max(1,Math.ceil(n.seconds-w.elapsed/1000))+' s'),'clock');
   status.setAttribute('role','status');container.append(status);
   const calling=new Map(n.kinds.map(k=>[targetOf(k),CALLS[k]]));
   for(const t of [...new Set(['Liora','Flock','Donkey',setup.adult])].filter(x=>x!=='Donkey'||!setup.noDonkey)){
    const b=button(null,()=>a3Resolve(t),{'data-target':t,disabled:w.resolving});b.append(el('span',targetName(t)));
    if(calling.has(t)){b.append(el('strong',w.resolving?(w.saved===t?'✓ Helped':'Missed'):calling.get(t)));if(!w.resolving)b.dataset.calling='true';}
    else if(w.resolving&&w.tapped===t)b.append(el('strong','Not calling'));
    b.classList.toggle('missed',w.resolving&&w.hit.includes(t)&&w.saved!==t);b.classList.toggle('saved',w.resolving&&w.saved===t);
    (overlay||container).append(b);
   }
   place();
  }
  if(w.note)container.append(el('p',w.note,'note'));
  container.append(el('output',Math.min(w.markers,w.marker+1)+'/'+w.markers,'clock'));
 }
 /* ---------- A4 The line at the water ---------- */
 if(id==='A4'){w.loom=false;w.own=0;w.first=null;w.payFold=false;w.W=setup.W;}
 const a4Budget=()=>setup.base+1-(w.loom?2:0);          // the last draw is there only for quick hands
 const a4Time=()=>Math.max(setup.minMs||0,setup.tapMs*setup.base);
 function a4Finish(timeUp){
  const used=w.own+(w.loom?2:0),grade=calm?'fine':used>=setup.base+1||w.W>=setup.cap?'good':used>=setup.base?'fine':'rough';
  finish({grade,loomFirst:w.loom,payFold:w.payFold});
 }
 function a4(){
  const used=w.own+(w.loom?2:0);
  head([w.started?button('Finish',()=>a4Finish(false),{id:'finishActivity',class:'storyNext'}):startBtn(),slow()]);
  if(!calm){const bar=el('div',null,'bar'),fill=el('i');fill.style.width=Math.max(0,100-100*w.elapsed/a4Time())+'%';bar.append(fill);container.append(bar);}
  container.append(el('output','Draws used: '+used+' of '+setup.base,'clock'));
  const rows=el('div',null,'rows');
  const ours=button('Draw for our skins',()=>{if(w.first===null)w.first='own';w.own++;w.W=Math.min(setup.cap,w.W+2);if(w.own>=a4Budget()||(calm&&used+1>=setup.base))a4Finish(false);else render();},{'data-target':'own',disabled:!w.started||w.own>=a4Budget()});
  ours.append(el('span','Drawn '+w.own+' · 💧 +'+2*w.own+'. The skins fill when you finish.','small'));rows.append(ours);
  const loom=button(w.loom?'The Loom family draws first':'Let the Loom family draw first',()=>{w.first='loom';w.loom=true;render();},{'data-target':'loom',disabled:!w.started||w.first!==null});
  loom.append(chips(['2 draws','Loom: helped']));rows.append(loom);
  if(setup.owe){const f=button('Pay the Fold boys: carry their skins',()=>{w.payFold=!w.payFold;render();},{'data-target':'fold','aria-pressed':w.payFold});f.append(chips(['⚡'+setup.payer+' −1','Fold paid']));rows.append(f);}
  container.append(rows);
 }
 /* ---------- A5 Three days at Elim ---------- */
 w.started=false;
 function render(){
  if(disposed||done)return;
  const scroller=container.closest('#s1page')||container,top=scroller.scrollTop;
  ({A1:a1,A2:a2,A3:a3,A4:a4})[id]();
  scroller.scrollTop=top;onRender({id,calm,marker:w.marker||0,markers:w.markers||0,phase:w.phase||''});
 }
 function tick(){
  const now=performance.now(),dt=Math.min(250,now-last);last=now;
  if(disposed||done||frozen())return;
  if(id==='A3'&&w.resolving&&w.started){w.pending-=dt;if(w.pending<=0){w.marker++;w.resolving=false;w.hit=[];w.saved=null;w.tapped=null;w.note='';w.elapsed=0;
    if(w.marker>=w.markers){const map={liora:'liora',lamb:'lamb',bundle:'bundle',adult:'adult'};finish({losses:w.losses.map(k=>map[k])});return;}render();}return;}
  if(id==='A2'){
   if(w.phase!=='wrap'||!w.started)return;
   const before=w.stacks.map(s=>s.steps).join('');w.elapsed+=dt;a2Cool();
   if(a2Done()){a2Finish();return;}
   if(w.stacks.map(s=>s.steps).join('')!==before)render();return;
  }
  if(calm)return;
  if(!w.started)return;
  if(id==='A1'&&w.phase==='balance'){const before=Math.ceil(w.elapsed/1000);w.elapsed+=dt;
   if(w.elapsed>=150000){const info=a1Info();finish({pick:w.pick.slice(),legal:false,stonesAccessible:info.accessible});return;}
   if(Math.ceil(w.elapsed/1000)!==before){const c=container.querySelector('.clock');if(c)c.textContent=Math.max(1,Math.ceil(150-w.elapsed/1000))+' s';}}
  if(id==='A3'){const before=Math.ceil(w.elapsed/1000);w.elapsed+=dt;
   if(w.elapsed>=a3Need().seconds*1000){a3Resolve(null);return;}
   if(Math.ceil(w.elapsed/1000)!==before){const c=container.querySelector('.clock');if(c)c.textContent='Answer before the count ends: '+Math.max(1,Math.ceil(a3Need().seconds-w.elapsed/1000))+' s';}}
  if(id==='A4'){w.elapsed+=dt;if(w.elapsed>=a4Time()){a4Finish(true);return;}const f=container.querySelector('.bar i');if(f)f.style.width=Math.max(0,100-100*w.elapsed/a4Time())+'%';}
 }
 const timer=setInterval(tick,50);
 const visibility=()=>{last=performance.now();};document.addEventListener('visibilitychange',visibility);
 render();
 return {
  destroy(){disposed=true;overlay?.remove();canvas?.removeEventListener('s2scene',place);root.removeEventListener('resize',place);clearInterval(timer);document.removeEventListener('visibilitychange',visibility);container.replaceChildren();container.className='';delete container.dataset.activity;},
  setPaused(value){paused=!!value;last=performance.now();},
  setModal(value){modal=!!value;last=performance.now();},
  snapshot:()=>({id,calm,elapsed:w.elapsed,phase:w.phase||'',marker:w.marker||0})
 };
}
root.V2Activities={mount};
})(typeof window!=='undefined'?window:globalThis);
