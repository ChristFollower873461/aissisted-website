/* By Cloud and Fire v2.1 engine. A game is {seed, mode, house, inputs[]}; the household is always
   recomputed by replaying those inputs through the one rules script (V2Rules.journey).
   So the text on a screen and the state behind it cannot drift apart. All time comes from the caller. */
(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./v2-rules.js'):root.V2Rules,common?require('./v2-content.js'):root.V2Content,root);
 if(common)module.exports=api;root.V2=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(R,C,root){
'use strict';
if(!R||!C)throw new Error('Load v2-rules.js and v2-content.js before v2-engine.js');
const MODES=['Easy','Normal','Faithful'];
let kjv=null;
const setKJV=table=>{kjv=table;};
const verse=ref=>{const t=(kjv||root.KJV||{})[ref];if(!t)throw new Error('Missing Scripture '+ref);return {ref,text:t.replace(/^¶ /,'')};};
// Words are tokens with a letter or a digit in them; icons and the · separator are not words.
const words=text=>String(text).replace(/\s+/g,' ').trim().split(' ').filter(t=>/[A-Za-z0-9]/.test(t)).length;
// A line stays at least as long as a slow reader needs: 200 words a minute, and never under four seconds.
const readMs=lines=>Math.max(4000,1500+300*lines.reduce((n,t)=>n+words(t),0));
function start(seed=1,mode='Normal',house='Elior'){
 if(!MODES.includes(mode))throw new Error('Unknown mode');if(!R.HOUSEHOLDS[house])throw new Error('Unknown household');
 return {v:2,seed:Number(seed)>>>0,mode,house,inputs:[],clock:0};
}
const clone=state=>({...state,inputs:state.inputs.map(x=>x&&typeof x==='object'?JSON.parse(JSON.stringify(x)):x)});
const cache=new WeakMap();
/* Replay the inputs. Returns the live household, the screen it is waiting on, and the household as the previous screen showed it. */
function resolve(state){
 const hit=cache.get(state);if(hit&&hit.n===state.inputs.length)return hit;
 const rng=R.PyRandom(state.seed),s=R.newState(state.house,rng,state.seed),it=R.journey(s);
 let r=it.next(),prev=C.snap(s),cur=prev,last=null,i=0;
 // Where each dawn and each chapter began, counted in answers given: "try again from the last camp" goes back to one of these.
 const dawnAt={1:2},chapterAt={1:2};
 const note=()=>{if(r.done)return;if(!(s.day in dawnAt))dawnAt[s.day]=i;if(r.value.card==='D4.1'&&!(2 in chapterAt))chapterAt[2]=i;};
 for(const input of state.inputs){if(r.done)break;last=r.value;prev=cur;r=it.next(input);i++;cur=C.snap(s);note();}
 const out={n:state.inputs.length,s,node:r.done?{k:'complete',id:'complete'}:r.value,prev,cur,last,dawnAt,chapterAt};
 cache.set(state,out);return out;
}
const push=(state,input)=>({...state,inputs:state.inputs.concat([input]),clock:0});
/* Where a screen is staged. The place comes from the rules (s.loc); it never runs backwards. */
const SCENE={rameses:'exodus',succothRoad:'exodus',succoth:'exodus',ethamRoad:'exodus',etham:'exodus',seaRoad:'exodus',pihahiroth:'pursuit',sea:'red-sea',shore:'far-shore',
 shur1:'shur',shur2:'shur',shur3:'shur',marahRoad:'shur',marah:'marah',elimRoad:'marah',elim:'elim'};
function stage(n,s){
 const id=n.id||n.card||'',night=!!n.night||/^(EVE|R-EVE|N\d)/.test(id),loc=s.loc;
 let scene=SCENE[loc]||'exodus',light='dusk',walk=!!n.walk||!!n.travel,hearth=false;
 if(scene==='exodus'){light=['S0','A1','A2','R-A2'].includes(id)||night?'night':'dusk';hearth=night||['A2','R-A2'].includes(id);}
 else if(scene==='pursuit'){if(id==='T3-drink')scene='exodus';else light='night';}
 else if(scene==='red-sea'){light='night';walk=true;}
 else if(scene==='far-shore')light='dawn';
 else if(scene==='shur'){light=night?'night':/^F\d/.test(id)||id==='GOAT'||id==='DONKEY'&&false?'dusk':'day';hearth=night;}
 else if(scene==='marah'){
  if(loc==='elimRoad')light='day';
  else{if(id==='S6-bitter')scene='marah-bitter';light=/^N\d/.test(id)?'night':night?'dusk':'day';hearth=night;}
 }else if(scene==='elim'){light=id==='N7'||night?'night':'day';hearth=light==='night';}
 const dark=light==='night';
 return {scene,light,walk,hearth,cross:id==='A3',
  // Exodus 13:21-22: the pillar goes before the camp from Etham on; at the sea it stands behind (Exodus 14:19).
  pillar:s.day>=2&&!['red-sea','far-shore'].includes(scene)?(dark?'fire':'cloud'):null,pillarBehind:['S3','R-D3.1'].includes(id),
  place:s.place,house:s.house,flock:s.flock,flockStep:Math.max(0,s.fstep),riding:s.atElim?[]:[...s.riding],carried:s.atElim?{}:{...s.carried},
  extras:s.extras.slice(),left:s.left.slice(),hungry:[...s.hungry],thirsty:[...s.thirsty],weary:R.PEOPLE.filter(p=>s.E[p]<=1),
  grandmother:['D2.1','R-D2.1','H.Daliya','R-H.Daliya'].includes(id),loom:['D6.1','R-D6.1'].includes(id),limping:id==='D1.2',staff:id==='R-D1.2'&&s.picks['D1.2']==='staff',
  flagging:['T4-noon','D4.2'].includes(id)?s.falterNow:null,gone:[...s.st.gone],donkeyGone:s.st.donkeyGone,donkeyLame:s.st.donkeyLame,resting:id==='GOAT',dance:id==='R-D3.2'&&s.picks['D3.2']==='sing',afraid:s.shaken,
  drinking:id==='S6',ground:id==='A1'?R.EXTRAS.slice():id==='T1'||id==='D1.2'?R.EXTRAS.filter(x=>!s.extras.includes(x)):id==='DONKEY'?s.left.slice():[]};
}
const N=(s,p)=>C.name(s,p);
/* ONE TABLE for what a card shows. Every chip on an option is computed from the option's real effect: the engine plays
   the option forward to its result screen and shows the difference (C.diff), so a shown cost cannot differ from the applied
   one. What a number cannot show is declared here as a NOTE (a standing rule, or a risk that chance decides). Chance outcomes
   themselves (who falls sick tonight, a fall on the stones) are never shown in advance: the note names the risk instead. */
const CHANCE=/: (sick|gravely ill|well|frail)$/;
const NOTES={
 'D3.1':{gather:(s)=>[N(s,'Liora')+': steadier','🐑 unguarded at the sea'],rope:(s)=>['🐑 steady at the sea',N(s,'Liora')+': waits with '+N(s,'Sarela')]},
 'D3.2':{waterFlock:()=>["🐑 a day's grace"],sing:(s,d)=>d.length?[]:['a morning of joy']},
 'D4.1':{full:()=>['💧 4 a day','5 on a hot day'],half:(s)=>['💧 3 a day','4 on a hot day','⚡'+N(s,'Talven')+', '+N(s,'Sarela')+' −1 by turns']},
 'D4.2':{ride:(s,d)=>s.extras.includes('seat')||d.some(c=>c.startsWith('🐑'))?[]:['🐑 one step thirstier']},
 'D5.1':{waterFlock:()=>['🐑 watered'],drive:()=>['🐑 driven to far grazing'],foldHerd:()=>['🐑 herded to far grazing'],letLag:()=>['🐑 one step thirstier by evening']},
 'D6.1':{flockShare:(s,d)=>d.some(c=>c.startsWith('🐑'))?[]:['🐑 one step thirstier']},
 STORM:{push:()=>['risk: a fall','risk: a goat','🫏 strained']},
 FEVER:{nurse:(s)=>['risk: '+N(s,R.payer(s,'Sarela'))+' may fall sick']},
 'H.Elior':{story:(s)=>[N(s,'Liora')+': steadier at the sea']},
 ELIM:{rest:(s,d)=>d.length?[]:['a quiet day']},
 GAP:{pushOn:(s)=>s.st.lag>=R.LAG_END?['the road will end here']:['one more mark ends the road']}
};
/* A choice card's options: label, chips (the real effect) and notes (declared). */
function options(state,rs){
 const {s,node,cur}=rs,card=node.card,out=[];
 for(const id of node.opts){
  const next=resolve(push(state,id)),after=next.cur;
  // Played forward to the option's own result screen. Chance outcomes are taken out; everything else is shown.
  let fellFree=after;
  if(card.startsWith('PACE')){const fell=next.s.st.cards.filter(c=>c[0]===s.day&&c[1]==='fall').map(c=>c[2])[0];
   if(fell)fellFree={...after,E:{...after.E,[fell]:after.E[fell]+1},sore:after.sore.filter(p=>p!==fell||cur.sore.includes(p))};}
  const key=card.startsWith('PACE')?'PACE':card.startsWith('EVE')?'EVE':card;
  // For certain: the rule itself, run on a copy (rules previewPace / previewSupper). Chance is left to the notes.
  let sure=fellFree,mayDie=false;
  if(key==='PACE'){const pv=R.previewPace(s,node.dawn,id);sure=C.snap(pv.t);mayDie=pv.mayDie;}
  if(key==='EVE'&&id!=='bake')sure=C.snap(R.previewSupper(s,id==='short'));
  // A card whose choice is a standing rule (the cups) has no result of its own: it shows notes only.
  const hasResult=key==='PACE'||key==='EVE'||(next.node.id||'').startsWith('R-'+card)||(card==='ELIM'&&/^R-ELIM/.test(next.node.id||''));
  let chips=!hasResult||(card==='STORM'&&id==='push')?[]:C.diff(cur,sure,s).filter(c=>!CHANCE.test(c));
  let notes=((NOTES[key]||{})[id]||(()=>[]))(s,chips);
  let label=(C.OPTIONS[key]||{})[id]||id,extra={};
  if(key==='PACE'){
   if(sure.place===cur.place&&sure.late===cur.late&&sure.lag===cur.lag)notes=['📍 holds'].concat(notes);
   if(mayDie)notes=notes.concat(['risk: the donkey may lie down for good']);
   if(id==='press'&&(node.dawn===2||node.dawn===3))notes=notes.concat(['risk: a fall']);
  }else if(key==='EVE'){
   if(id==='full'&&s.B===0)label=C.OPTIONS.EVE.none;
   if(next.s.events.length>s.events.length&&next.s.events.slice(s.events.length).some(e=>e[0]==='campShares'))notes=notes.concat(['the camp shares its bread']);
   if(id!=='bake'&&R.previewSupper(s,id==='short').st.spoiled>s.st.spoiled)notes=notes.concat(['2 spoil in the heat']);
   const hungry=id==='bake'?0:[...R.previewSupper(s,id==='short').hungry].length;if(hungry)notes=notes.concat([hungry===1?'1 goes hungry':hungry+' go hungry']);
  }else if(card==='D1.2'){if(id==='ride'&&!s.extras.includes('seat'))label=C.OPTIONS['D1.2'].rideNoSeat;}
  else if(card==='D2.1')extra.payer=R.payer(s,'Sarela');
  else if(card==='D3.2')extra.payer=R.worker(s);
  else if(card==='D4.2'){const f=s.falterNow;extra.name=f;extra.carrier=R.carrierFor(s,f);if(id==='carry'&&!extra.carrier)label='Neighbors carry {name}';if(id==='ride'&&!s.extras.includes('seat'))label=C.OPTIONS['D4.2'].rideNoSeat;}
  else if(card==='D5.1'){if(id==='drive')extra.names=R.drivers(s);}
  else if(card==='D6.1'){extra.payer=R.worker(s,'Sarela',[],true);const dry=Math.min(5,Math.max(0,node.need-after.W));if(dry)notes=notes.concat([dry===1?'1 goes thirsty':dry+' go thirsty']);}
  else if(card==='SEAT'){const by=R.carrierFor(s,node.who);if(id==='carryByHand'&&!by)label=C.OPTIONS.SEAT.carryByCamp;extra={item:R.loose(s).at(-1),payer:by,name:node.who};}
  else if(card==='H.Doran')extra.payer=R.worker(s,'Aviel');
  else if(card==='FEVER')extra.payer=R.payer(s,'Sarela');
  else if(card==='ELIM')extra.family=R.FAMILIES.slice().sort((a,b)=>s.ties[a]-s.ties[b])[0];
  out.push({id,label:C.fmt(label,s,extra),chips,notes});
 }
 return out;
}
function cardText(rs){
 const {s,node}=rs,id=node.card||node.id,base=C.CARDS[id.startsWith('PACE')?'':id]||{};
 const v={title:C.fmt(base.title||'',s,{name:node.who||s.falterNow}),rubric:base.rubric||'',body:[],kjv:(base.kjv||[]).slice(),refs:(base.refs||[]).slice(),button:base.button||'',who:!!base.who};
 if(base.body&&!(id==='ELIM'&&node.slot>0))v.body.push(C.fmt(base.body,s,{need:node.need}));
 if(base.text)v.body.push(...base.text.map(t=>C.fmt(t,s)));
 if(id.startsWith('PACE')){
  const day=node.dawn,d=C.DAWN[day]||{},weak=R.PEOPLE.filter(p=>s.E[p]===1&&!s.riding.has(p)&&!s.carried[p])[0];
  v.rubric='Dawn · day '+day;v.title='How hard do you walk?';v.kjv=(d.kjv||[]).slice();
  // Every risk has its cause on the card before the choice: the heat, who is sick, the donkey.
  const st=s.st,sick=R.PEOPLE.filter(p=>st.sick[p]===1&&!st.gone.has(p)).map(p=>N(s,p)),grave=R.PEOPLE.filter(p=>st.sick[p]>=2&&!st.gone.has(p)).map(p=>N(s,p)),dw=C.DONKEYWORD(s);
  v.body.push([s.heat[day]?'Hot today.':'A mild day.',grave.length?'Gravely ill: '+C.list(grave)+'.':'',sick.length?'Sick: '+C.list(sick)+'.':'',
   !sick.length&&!grave.length&&weak?C.fmt('{weak} is tired.',s,{weak}):'',dw==='weary'||dw==='lame'?'The donkey is '+dw+'.':'',C.fmt('You are {placeword}.',s)].filter(Boolean).join(' '));
  if(d.extra)v.body.push(d.extra);
  if(day===4&&s.place===2)v.body.push('Close behind the cloud, the first scrub is still green.');
  v.heat=s.heat[day]?'hot':'mild';
 }
 if(id==='D3.2')v.body.push(s.events.some(e=>e[0]==='lambStrays')?'Safe across. One lamb is missing.':s.shaken?C.fmt("Safe across. {Y} won't let go of {M}'s hand.",s):'Safe across. Timbrels all along the shore.');
 if(id==='D5.1'){v.title=s.fstep>=1?'The flock lags':'The flock on the dry road';v.body.push(s.fstep>=2?'The flock straggles far behind.':s.fstep===1?'The flock is thirsty and slow.':'The day is long and dry. The flock smells no water.');}
 if(id==='S6-bitter'&&s.shaken)v.body.push(C.fmt('{Y} is crying. Thirst is hard when you are small.',s));
 if(id==='S7'){
  if(s.debt)v.body.push(C.fmt(s.debt==='goat'?'You still owe the Fold family. {F} leaves a goat with them.':'You still owe the Fold family. {F} works off the debt instead.',s));
  v.button=s.elimDays<3?'Two days by the wells':'Three days by the wells';
 }
 if(id==='ELIM')v.rubric='Elim · day '+(node.slot+1)+' of '+node.days;
 if(['FEVER','GAP','SEAT'].includes(id))v.rubric='First light · day '+s.day;
 if(id==='STORM')v.rubric='On the road · day '+s.day;
 if(id==='GAP'&&s.st.lag>=R.LAG_END)v.body=['The last families are out of sight. Lighten the load now, or you cannot keep up.'];
 if(id==='SEAT'&&node.noRide)v.body.push(s.st.donkeyGone?'There is no donkey to ride.':'The donkey is lame and can take no rider.');
 if(id==='I1')v.body.push(...C.chapterOne(s));
 if(id==='GOAT')v.body.push(...C.goatCard(s));
 if(id==='DONKEY')v.body.push(...C.donkeyCard(s));
 if(id==='MOURN'){v.body.push(...C.mournCard(s));v.actions=[['continue','Mourn, and walk on'],['retry','Try again from the last camp']];}
 if(id==='END'){v.body.push(...C.endCard(s));v.actions=[['retry','Try again from the last camp'],['chapter','Begin this chapter again'],['continue','Read the journal']];}
 if(id==='I2'){const j=C.journal(s,R.carry(s),R.headlines(s),R.survivors(s).points);v.title=j.title;v.body.push(...j.lines);v.hook=j.hook;v.journal=true;v.ended=j.ended;
  if(j.ended){v.kjv=[];v.rubric='The road ended';v.actions=[['retry','Try again from the last camp'],['continue','Back to the title']];v.buttons=v.actions.map(a=>a[1]);}
  else v.buttons=['Save this journal',base.button];}
 if(v.actions&&!v.buttons)v.buttons=v.actions.map(a=>a[1]);
 return v;
}
/* What the line at Marah tells you before you draw. */
function lineNotes(s){
 const held=R.FAMILIES.filter(f=>R.tie(s,f)>=1),out=['Your place in the camp gives '+{0:4,1:6,2:8}[s.place]+' draws.'];
 if(held.length)out.push(held.length>1?'The '+C.list(held)+' families hold your place: +'+held.length+' draws.':'The '+held[0]+' family holds your place: +1 draw.');
 if(s.loomRefused)out.push('The Loom family draws ahead of you: one draw fewer.');
 if(s.late){const lost=Math.min(s.late,Math.max(0,{0:4,1:6,2:8}[s.place]+held.length-(s.loomRefused?1:0)-1));out.push('You come late to the pool: '+lost+(lost===1?' draw fewer.':' draws fewer.'));}
 return out;
}
function view(state){
 const rs=resolve(state),{s,node}=rs,st=stage(node,s);
 const v={screen:'',beatId:node.id||node.card,cardId:null,activityId:null,scene:st.scene,light:st.light,sceneKey:st.scene+'/'+st.light,stage:st,day:s.day,location:C.LOCNAME[s.loc],
  hud:C.hud(s),title:'',rubric:'',body:[],scripture:[],refs:[],options:[],chips:[],lines:[],button:'',durationMs:0,remainingMs:0,house:state.house,mode:state.mode};
 if(node.k==='complete')return {...v,screen:'complete',text:[]};
 const landed=C.diff(rs.prev,rs.cur,s);
 if(node.k==='story'&&node.id==='B0'){
  return {...v,screen:'cover',rubric:'A journey game through the Bible',title:'By Cloud and Fire',body:['Guide one household out of Egypt, through the sea, to the wells of Elim.'],button:'Begin at Rameses',
   houses:Object.entries(C.HOUSES).map(([id,h])=>({id,title:h.title,line:h.line,names:C.ROLES.map(r=>h.names[r])})),modes:MODES,hud:null,
   text:['A journey game through the Bible','By Cloud and Fire','Guide one household out of Egypt, through the sea, to the wells of Elim.',...Object.values(C.HOUSES).flatMap(h=>[h.title,h.line]),'Begin at Rameses']};
 }
 if(node.k==='strip'){
  v.screen=node.travel?'travel':'strip';v.lines=node.lines.map(([k,p])=>C.line(s,k,p));v.chips=landed;
  // What an activity came to is never passed by: it waits for a tap.
  v.wait=/^R-A[1-4]$/.test(node.id);
  v.durationMs=v.wait?0:Math.max(node.ms||0,readMs(v.lines));v.remainingMs=Math.max(0,v.durationMs-state.clock);
  v.text=v.lines.slice();return v;
 }
 if(node.k==='activity'){
  const id=node.id,a=C.ACTIVITIES[id];
  v.screen='activity';v.activityId=id;v.title=a.title;v.scripture=(a.kjv||[]).map(verse);v.refs=(a.kjv||[]).concat(a.refs||[]);
  v.instruction=C.fmt(a.instruction,s,{draws:Math.max(1,R.lineDraws(s))});if(id==='A4'&&Math.max(1,R.lineDraws(s))===1)v.instruction=v.instruction.replace('1 draws','1 draw');v.instruction2=a.instruction2||'';v.notes=id==='A4'?lineNotes(s):[];v.chips=landed;
  v.text=[v.title,v.instruction,...v.notes,...v.scripture.map(x=>x.text)];return v;
 }
 const c=cardText(rs);
 Object.assign(v,{title:c.title,rubric:c.rubric,body:c.body,scripture:c.kjv.map(verse),refs:c.kjv.concat(c.refs),button:c.button,who:c.who,heat:c.heat,hook:c.hook,journal:c.journal,buttons:c.buttons,actions:c.actions,ended:c.ended,chips:landed});
 if(node.k==='choice'){v.screen='choice';v.cardId=node.card;v.options=options(state,rs);}
 else v.screen='story';
 v.text=[v.rubric,v.title,...v.body,...v.scripture.map(x=>x.text),v.hook,...v.options.map(o=>o.label),...(v.buttons||[v.button])].filter(Boolean);
 return v;
}
function act(state,optionId){
 const rs=resolve(state),n=rs.node;
 if(n.k==='story')return push(state,'continue');
 if(n.k!=='choice')throw new Error('No decision on this screen');
 if(!n.opts.includes(optionId))throw new Error('Unavailable option: '+n.card+':'+optionId);
 return push(state,optionId);
}
const GRADES=['good','fine','rough'];
function activity(state,payload){
 const rs=resolve(state),n=rs.node,id=n.id;
 if(n.k!=='activity')throw new Error('No activity on this screen');
 const p=typeof payload==='string'?{grade:payload}:{...(payload||{})};
 if(p.grade&&!GRADES.includes(p.grade))throw new Error('Invalid grade');
 if(id==='A1'){
  const pick=Array.isArray(p.pick)?p.pick:String(p.pick||'').split(','),sorted=R.EXTRAS.filter(x=>pick.includes(x));
  if(sorted.length!==2||pick.length!==2)throw new Error('Pick two extras');
  if(p.legal!==undefined)p.grade=!p.legal?'rough':p.stonesAccessible?'good':'fine';
  return push(state,{pick:sorted.join(','),grade:p.grade||'fine'});
 }
 if(id==='A2'){
  const bowls=Math.max(1,Math.min(2,Number(p.bowls)||1,rs.s.D));
  if(p.hard!==undefined)p.grade=p.hard>=2?'rough':p.hard===1?'fine':'good';
  return push(state,{bowls:String(bowls),grade:p.grade||'fine',hard:Math.min(2*bowls,p.hard??{good:0,fine:1,rough:2}[p.grade||'fine'])});
 }
 if(id==='A3'){
  if(Array.isArray(p.losses)){if(!p.losses.every(x=>['lamb','liora','bundle','adult'].includes(x)))throw new Error('Invalid crossing');return push(state,{losses:p.losses.slice()});}
  return push(state,{grade:p.grade||'fine'});
 }
 if(id==='A4')return push(state,{grade:p.grade||'fine',loomFirst:!!p.loomFirst,payFold:!!p.payFold&&rs.s.oweFold});
 throw new Error('Unknown activity '+id);
}
function advance(state,elapsedMs=4000,settings={}){
 if(settings.paused||settings.hidden||settings.modal)return state;
 const v=view(state);if(!['travel','strip'].includes(v.screen))return state;
 if(settings.skip)return push(state,'tick');
 if(v.wait||settings.held)return state;
 const clock=state.clock+Math.max(0,Number(elapsedMs)||0);
 const duration=settings.reducedMotion&&v.screen==='travel'?Math.min(v.durationMs,readMs(v.lines)):v.durationMs;
 if(clock>=duration)return push(state,'tick');
 return {...state,clock};
}
/* Try again from the last camp: back to the dawn you set out from yesterday, with the same weather and the same events
   (the seed and every earlier answer are kept). After a death in the night, that is the dawn of the day that ended so. */
function retry(state){
 const rs=resolve(state),{s,node,dawnAt}=rs;
 const day=s.st.ended?s.st.ended.day-1:node.id==='MOURN'?s.day:s.day-1;
 const at=dawnAt[day]??dawnAt[1];
 return {...state,inputs:state.inputs.slice(0,at),clock:0};
}
function chapterAgain(state){
 const rs=resolve(state),at=rs.s.day>=4&&rs.chapterAt[2]!=null?rs.chapterAt[2]:rs.chapterAt[1];
 return {...state,inputs:state.inputs.slice(0,at),clock:0};
}
/* What an activity needs to know that the rules decide. */
function setup(state){
 const {s,node}=resolve(state),id=node.id,mode=state.mode;
 if(id==='A1')return {tiles:R.EXTRAS.map(x=>({id:x,label:C.A1TILES[x][0],chips:C.A1TILES[x][1].map(c=>C.fmt(c,s))})),
  bundles:[['Water skins',3],['Water skins',3],['Tent',4],['Bedding',2],['Cook stones',2]],weights:{spare:3,sack:4,loom:3,trough:3},names:C.ITEM};
 if(id==='A2')return {maxBowls:Math.min(2,s.D),trough:s.extras.includes('trough'),stepMs:{Easy:5000,Normal:3500,Faithful:2500}[mode],slowMs:6000,per:{good:10,fine:8,rough:5}};
 if(id==='A3'){
  const hold=s.picks['D3.1'],urgent=hold==='gather'?'lamb':'liora',third=s.packGrade==='rough'&&R.loose(s).length?'bundle':'adult',adult=R.payer(s),rear=s.place===0;
  const marks=[['liora'],['lamb'],rear?[urgent,third]:[third],['lamb'],['liora'],[third]];
  return {urgent,third,adult,adultName:N(s,adult),youngest:N(s,'Liora'),rear,noDonkey:s.st.donkeyGone,markers:marks,seconds:mode==='Faithful'?[3,5]:mode==='Easy'?[5,7]:[4,6],calm:mode==='Easy'};
 }
 if(id==='A4')return {base:Math.max(1,R.lineDraws(s)),W:s.W,cap:s.cap,owe:s.oweFold,payer:N(s,R.payer(s)),tapMs:{Easy:6000,Normal:4000,Faithful:3000}[mode],minMs:15000};
 return {};
}
/* The line the crossing shows the moment something is lost: the same words the result strip will use. */
function crossingNote(state,losses){const v=view(push(state,{losses}));return v.lines.at(-1)||'';}
const carry=state=>{const {s}=resolve(state),c=R.carry(s),sv=R.survivors(s),j=C.journal(s,c,R.headlines(s),sv.points);return {...c,points:sv.points,walkOn:sv.people,gone:[...s.st.gone],sick:R.PEOPLE.filter(p=>s.st.sick[p]),frail:[...s.st.frail],donkey:!s.st.donkeyGone,goatsDied:s.st.goatsDied,ended:s.st.ended,names:C.HOUSES[s.house].names,houseTitle:C.HOUSES[s.house].title,headlines:j.headlines,headlineCodes:R.headlines(s)};};
return Object.freeze({CHANCE,start,view,act,activity,advance,clone,resolve,setup,crossingNote,carry,retry,chapterAgain,words,readMs,setKJV,MODES,Rules:R,Content:C});
});
