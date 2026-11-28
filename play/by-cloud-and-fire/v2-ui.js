/* The page owns elapsed time and taps; the engine owns the household and every line. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
 const GAME='bcf.game.v2',CARRY='bcf.carry.v2',reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const panel=$('s1page'),content=$('s1content'),leaf=$('leaf'),canvas=$('s1land'),stage=$('s1');
 let state=null,v=null,work=null,workView=null,elapsed=0,duration=0,lastFrame=0,lastDraw=0,artTime=0,selected=null,house='Elior';
 let journal=[],lastHud={},loading=true,transition=0,afterLeaf=null,held=false,pauseOpen=false;
 const sheet=(base,h)=>'url(art/assets/'+(h==='Elior'?base:'v2/'+base+'-'+h.toLowerCase())+'.png)';
 const face=(i,h)=>{const n=el('i');n.style.backgroundImage=sheet('portraits',h);n.style.backgroundPosition=i*25+'% 0';return n;};
 const paused=()=>loading||document.hidden||leaf.open||pauseOpen;
 const coverView=()=>({beatId:'B0',screen:'cover',house,stage:{scene:'exodus',light:'dusk',place:1,house,flock:V2.Rules.HOUSEHOLDS[house].flock,riding:[],carried:{},extras:[],left:[],hungry:[],thirsty:[],weary:[],ground:[]}});
 const sceneView=()=>({...(state?v:coverView()),progress:duration?Math.min(1,elapsed/duration):0,activity:workView,marker:workView?.marker||0});
 function paint(){const frame=V2Scene.draw(canvas,{},sceneView(),artTime,reduced.matches);if(frame?.ready){canvas.dataset.beatId=state?v.beatId:'B0';canvas.style.visibility='';}lastDraw=performance.now();}
 function save(){if(!state)return;try{localStorage.setItem(GAME,JSON.stringify({state,journal}));}catch{}}
 function modal(title,...nodes){$('leafTitle').textContent=title;$('leafContent').replaceChildren(...nodes);work?.setModal(true);leaf.showModal();$('closeLeaf').focus();}
 $('closeLeaf').onclick=()=>leaf.close();
 leaf.addEventListener('close',()=>{lastFrame=performance.now();work?.setModal(false);const f=afterLeaf;afterLeaf=null;if(f)f();});
 document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();work?.setPaused(loading||document.hidden);if(document.hidden)save();});
 window.addEventListener('pagehide',save);
 /* A real pause: everything stops; Resume goes on from the same screen; the title is a second, deliberate tap. */
 function setPause(open){pauseOpen=open;$('pauseSheet').hidden=!open;work?.setPaused(open||loading||document.hidden);lastFrame=performance.now();
  $('pauseLine').textContent='The road waits for you.';$('pauseTitle').textContent='Back to the title';$('pauseTitle').dataset.sure='';if(open){save();$('pauseResume').focus();}}
 $('pause').onclick=()=>{if(state&&!loading)setPause(true);};
 $('pauseResume').onclick=()=>setPause(false);
 $('pauseTitle').onclick=()=>{const b=$('pauseTitle');
  if(!b.dataset.sure){b.dataset.sure='1';$('pauseLine').textContent='Your place is saved. You can Resume from the title.';b.textContent='Go to the title';return;}
  save();setPause(false);work?.destroy();work=null;workView=null;state=null;transition++;showCover();};
 $('journalButton').onclick=()=>modal('Journal',...journal.map(line=>el('p',line)));
 function scripture(ref){
  const m=ref.match(/^(.*?) (\d+):(\d+)$/);if(!m)return;
  const body=KJV[ref];modal(ref,el('p',m[3]+' '+String(body||'').replace(/^¶ /,'')));
 }
 /* ---- cover ---- */
 function cover(){
  const savedGame=(()=>{try{return JSON.parse(localStorage.getItem(GAME));}catch{return null;}})();
  const live=savedGame?.state&&V2.view(savedGame.state).screen!=='complete';
  $('s1Resume').hidden=!live;$('s1Resume').onclick=()=>{journal=savedGame.journal||[];house=savedGame.state.house;apply(savedGame.state);};
  const carry=(()=>{try{return JSON.parse(localStorage.getItem(CARRY));}catch{return null;}})();
  $('saved').hidden=!carry;if(carry)$('savedLine').textContent='Your journal: '+carry.houseTitle+', '+carry.headlines[0];
  const hv=V2.view(V2.start(1,'Normal','Elior'));
  $('houses').replaceChildren(...hv.houses.map(h=>{
   const b=el('button',null,'house');b.type='button';b.setAttribute('role','radio');b.dataset.house=h.id;b.setAttribute('aria-checked',String(h.id===house));
   const faces=el('span',null,'faces');for(let i=0;i<5;i++)faces.append(face(i,h.id));
   b.append(faces,el('b',h.title),el('span',h.line));
   b.onclick=()=>{house=h.id;for(const x of $('houses').children)x.setAttribute('aria-checked',String(x===b));paintCover();};
   return b;}));
 }
 function paintCover(){V2Scene.preload({},coverView()).then(()=>{if(!state)paint();});}
 $('savedNext').onclick=()=>modal('Chapter III',el('p','Chapter III is still being made. Your journal is saved.'));
 $('start').onclick=()=>{journal=[];lastHud={};const q=new URLSearchParams(location.search).get('seed'),seed=q!==null&&/^\d+$/.test(q)?Number(q):Date.now()>>>0;apply(V2.act(V2.start(seed,$('mode').value,house),'continue'));};
 /* ---- transitions ---- */
 async function apply(next){
  const token=++transition,nextView=V2.view(next);
  loading=true;stage.inert=true;stage.setAttribute('aria-busy','true');work?.setPaused(true);
  try{
   const ready=await V2Scene.preload({},nextView);
   if(token!==transition)return;
   if(!ready.ready)throw new Error('Journey illustration could not load: '+ready.missingAssets.join(', '));
   work?.destroy();work=null;workView=null;state=next;elapsed=0;selected=null;held=false;
   render();paint();save();
  }catch(error){
   console.error(error);
   if(token===transition)modal('Illustration unavailable',el('p','Please try loading this scene again.'),button('Try again',()=>{leaf.close();apply(next);}));
  }finally{
   if(token===transition){loading=false;stage.inert=false;stage.removeAttribute('aria-busy');lastFrame=performance.now();work?.setPaused(document.hidden);}
  }
 }
 /* ---- HUD: one description of the household, on every screen ---- */
 function hud(){
  const h=v.hud,nodes=[],seen={};
  const add=(key,text,cls='resource')=>{const n=el('span',text,cls);if(key in lastHud&&lastHud[key]!==text)n.classList.add('changed');seen[key]=text;nodes.push(n);return n;};
  add('water',h.water);add('bread',h.bread);add('dough',h.dough);add('flock',h.flock);add('place',h.place);
  add('extras',h.extras);
  for(const f of h.families){const n=add('fam'+f.name,f.name+(f.word?': '+f.word:''),'fam'+(f.word?'':' none'));n.dataset.family=f.name;}
  const row=el('span',null,'members');
  h.portraits.forEach((p,i)=>{
   const n=el('span',null,'member'+(p.gone?' atrest':'')),title=p.gone?p.name+' · at rest':p.name+' · ⚡'+p.energy+(p.word?' · '+p.word:'');
   n.title=title;n.setAttribute('aria-label',title);n.dataset.role=p.role;
   const pips=el('span',null,'pips');for(let k=0;k<3;k++)pips.append(el('b',null,k<p.energy?'':'off'));
   const mark=el('small');if(!p.gone)mark.append(el('span','⚡'+p.energy),pips);if(p.word)mark.append(el('em',p.word));
   n.append(face(i,v.house),mark);
   if(('m'+i) in lastHud&&lastHud['m'+i]!==title)n.classList.add('changed');seen['m'+i]=title;row.append(n);});
  nodes.push(row);lastHud=seen;
  $('s1hud').replaceChildren(...nodes);$('s1location').textContent=h.day+' · '+h.location;
 }
 const chipRow=(chips,cls='paid',wrap='paidrow')=>{const row=el('span',null,wrap);row.append(...chips.map(t=>el('span',t,cls)));return row;};
 function who(){
  const row=el('div',null,'who');
  v.hud.portraits.forEach((p,i)=>{const one=el('span',null,'whoone');one.append(face(i,v.house),el('b',p.name));row.append(one);});
  return row;
 }
 function quotes(parent){
  for(const q of v.scripture){parent.append(el('blockquote',q.text));}
  for(const ref of v.refs)parent.append(button(ref,()=>scripture(ref),'ref'));
 }
 function showOptions(){
  const rail=el('div',null,'options');content.append(rail);
  for(const option of v.options){
   const row=el('div',null,'optionbox'),pick=button(null,()=>{
    selected=option.id;
    for(const child of rail.children){child.lastElementChild.hidden=child!==row;child.firstElementChild.setAttribute('aria-pressed',String(child===row));}
    choose.focus({preventScroll:true});choose.scrollIntoView({block:'nearest'});
   });
   pick.dataset.optionId=option.id;pick.setAttribute('aria-pressed','false');pick.append(el('span',option.label,'label'));
   if(option.chips.length||option.notes.length){const row=chipRow(option.chips,null,'chips');for(const n of option.notes)row.append(el('span',n,'note'));pick.append(row);}
   const choose=button('Choose',()=>{if(selected===option.id)apply(V2.act(state,option.id));},'choose');choose.hidden=true;
   row.append(pick,choose);rail.append(row);
  }
 }
 function saveCarry(){try{localStorage.setItem(CARRY,JSON.stringify(V2.carry(state)));}catch{}}
 // Mourn and walk on, or go back: "try again from the last camp" returns to yesterday's dawn with the same weather and events.
 const DO={continue:()=>apply(V2.act(state,'continue')),retry:()=>apply(V2.retry(state)),chapter:()=>apply(V2.chapterAgain(state))};
 function actionRow(){const row=el('div',null,'jbuttons actions');for(const [id,label] of v.actions){const b=button(label,DO[id],id==='continue'&&v.beatId==='MOURN'?'storyNext':'');b.id='act-'+id;row.append(b);}return row;}
 function journalPage(){
  const page=el('div',null,'journal');
  if(v.chips.length)page.append(chipRow(v.chips));
  page.append(el('p',v.body[0],'hl'),el('p',v.body[1],'hl'));
  for(const line of v.body.slice(2))page.append(el('p',line,/^(Hardest day|No day too hard)/.test(line)?'hl3':/^Kindness remembered/.test(line)?'kind':''));
  for(const q of v.scripture)page.append(el('blockquote',q.text));
  for(const ref of v.refs)page.append(button(ref,()=>scripture(ref),'ref'));
  if(v.ended){page.append(actionRow());content.append(page);return;}
  page.append(el('p',v.hook,'hook'));
  const row=el('div',null,'jbuttons');
  const saveB=button(v.buttons[0],()=>{saveCarry();saveB.disabled=true;saveB.append(' ✓');if(!page.querySelector('.saved')){const n=el('p','Saved on this device. You will find it on the title page.','saved');n.id='savedNote';page.append(n);}});saveB.id='saveJournal';
  const next=button(v.buttons[1],()=>{saveCarry();afterLeaf=()=>apply(V2.act(state,'continue'));modal('Chapter III',el('p','Chapter III is still being made. Your journal is saved.'));});next.id='chapterThree';
  row.append(saveB,next);page.append(row);content.append(page);
 }
 function showCover(){stage.dataset.screen='cover';stage.dataset.beat='B0';$('cover').hidden=false;$('instruments').hidden=true;panel.hidden=true;cover();paintCover();}
 function render(){
  v=V2.view(state);
  if(v.screen==='complete'){state=null;try{localStorage.removeItem(GAME);}catch{}showCover();return;}
  stage.dataset.screen=panel.dataset.screen=v.screen;stage.dataset.beat=v.beatId;panel.dataset.beatId=v.beatId;panel.dataset.cardId=v.cardId||'';panel.dataset.heat=v.heat||'';
  $('cover').hidden=true;$('instruments').hidden=false;panel.hidden=false;
  hud();content.replaceChildren();panel.scrollTop=0;content.className='';
  duration=Number(v.durationMs)||0;
  if(v.screen==='activity'){
   work=V2Activities.mount({container:content,id:v.activityId,view:v,setup:V2.setup(state),mode:v.mode,isPaused:paused,openScripture:scripture,onRender:x=>workView=x,
    note:losses=>V2.crossingNote(state,losses),canvas,onFinish:outcome=>apply(V2.activity(state,outcome))});return;
  }
  if(v.screen==='strip'||v.screen==='travel'){
   const box=el('div',null,'striplines');for(const line of v.lines){box.append(el('p',line));if(journal.at(-1)!==line)journal.push(line);}
   content.append(box);if(v.chips.length)content.append(chipRow(v.chips));
   const go=button('Continue',()=>auto(),'storyNext stripNext');go.id='stripNext';content.append(go);
   if(!v.wait){const h=el('span','Tap the words to hold them here.','hold');h.id='holdHint';content.append(h);}
   return;
  }
  if(v.rubric)content.append(el('span',v.rubric,'rubric'));
  if(v.title)content.append(el('h2',v.title));
  if(v.journal){journalPage();return;}
  if(v.who)content.append(who());
  for(const line of v.body)content.append(el('p',line));
  quotes(content);
  if(v.chips.length)content.append(chipRow(v.chips));
  if(v.screen==='choice')showOptions();
  if(v.screen==='story'){if(v.actions)content.append(actionRow());else content.append(button(v.button,()=>apply(V2.act(state,'continue')),'storyNext'));}
 }
 function auto(){if(state&&['travel','strip'].includes(v.screen))apply(V2.advance(state,0,{skip:true}));}
 $('s1hud').onclick=()=>{if(!state||paused())return;modal('Your household',who(),el('p','💧 water, 🍞 cakes, 🥣 dough, 🐑 flock, 📍 your place in the camp, ⚡ strength. Whoever is at ⚡0 at dawn must ride or be carried.'),el('p','Hurt: strength tops out at 2 until a day of rest at Elim. Sick: no more than 1. Gravely ill: must ride or be carried. A night of rest restores one strength to the two weariest.'),el('p','Behind the last families ●●○: a mark when you fall back with no place left to lose, and two when the donkey is lost. At three marks the household cannot keep up.'));};
 // Tapping timed words holds them; Continue goes on.
 const tapOn=e=>{if(paused()||!state||!['travel','strip'].includes(v.screen)||v.wait||e.target.closest('button'))return;held=!held;const h=$('holdHint');if(h)h.textContent=held?'Held. Continue when you are ready.':'Tap the words to hold them here.';};
 canvas.addEventListener('click',tapOn);panel.addEventListener('click',tapOn);
 function frame(now){
  const dt=lastFrame?Math.max(0,now-lastFrame):0;lastFrame=now;
  if(!paused()){
   if(state&&duration&&!held&&!v.wait&&['travel','strip'].includes(v.screen)){elapsed+=dt;if(elapsed>=duration)auto();}
   if(now-lastDraw>75){if(!reduced.matches)artTime+=Math.min(125,now-lastDraw)/1000;if(!loading)paint();}
  }
  requestAnimationFrame(frame);
 }
 canvas.style.visibility='hidden';cover();
 new ResizeObserver(()=>{if(!loading)paint();}).observe($('scene'));
 V2Scene.preload({},coverView()).then(result=>{if(transition!==0)return;if(result.ready)paint();loading=false;lastFrame=performance.now();});
 requestAnimationFrame(frame);
})();
