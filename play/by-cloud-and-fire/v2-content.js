/* By Cloud and Fire v2: every word the game shows. PLAY-SCRIPT-I1-I2-v2.md is the source.
   Scripture is never typed here: cards name a reference and the text comes from the vendored KJV. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.V2Content=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ROLES=['Elior','Sarela','Talven','Aviel','Liora'],KEY={E:'Elior',M:'Sarela',F:'Talven',O:'Aviel',Y:'Liora'};
const HOUSES={
 Elior:{title:'The house of Elior',names:{Elior:'Elior',Sarela:'Sarela',Talven:'Talven',Aviel:'Aviel',Liora:'Liora'},O_age:'twelve',Y_age:'six',line:'A frail elder, a middling flock.'},
 Doran:{title:'The house of Doran',names:{Elior:'Doran',Sarela:'Nava',Talven:'Ilan',Aviel:'Orli',Liora:'Tavi'},O_age:'thirteen',Y_age:'five',line:'Shepherds: a big flock, little dough.'},
 Daliya:{title:'The house of Daliya',names:{Elior:'Daliya',Sarela:'Shiri',Talven:'Ronen',Aviel:'Yoav',Liora:'Bina'},O_age:'eleven',Y_age:'seven',line:'Bakers: dough to spare, few animals.'}};
const ITEM={spare:'Spare skin',sack:'Dough sack',seat:'Saddle seat',loom:"The Loom family's bundle",trough:'Kneading trough'};
const ITEM_SHORT={spare:'spare skin',sack:'dough sack',seat:'seat',loom:'Loom bundle',trough:'trough'};
const PLACEWORD=['with the last families','in the thick of the camp','close behind the cloud'];
const HL1=['With the last families.','In the thick of the camp.','Close behind the cloud.'];
const TIEWORD=n=>n>=2?'walks with you':n>=1?'helped':'';
// A family's word as it stands: the Loom family, refused on the dry day, walks apart.
const famWord=(s,f)=>f==='Loom'&&s.loomRefused?'walks apart':TIEWORD(s.ties[f]);
const LOCNAME={rameses:'Rameses',succothRoad:'Rameses → Succoth',succoth:'Succoth',ethamRoad:'Succoth → Etham',etham:'Etham',seaRoad:'Etham → Pi-hahiroth',pihahiroth:'Pi-hahiroth',sea:'Pi-hahiroth',shore:'The far shore',shur1:'Shur · first day',shur2:'Shur · second day',shur3:'Shur · third day',marahRoad:'Shur → Marah',marah:'Marah',elimRoad:'Marah → Elim',elim:'Elim'};
const FLOCKWORD=n=>n>=2?'straggling':n>=1?'thirsty':'keeping up';
const LOCATION={1:'Rameses → Succoth',2:'Succoth → Etham',3:'Etham → the sea',4:'Shur · first day',5:'Shur · second day',6:'Shur · third day',7:'Marah → Elim'};

const name=(s,role)=>HOUSES[s.house].names[role]||role;
const list=a=>a.length<=1?a.join(''):a.slice(0,-1).join(', ')+' and '+a.at(-1);
/* The only generated prose: {E} {M} {F} {O} {Y} are the household; other keys come from the caller. */
function fmt(text,s,extra={}){
 return String(text).replace(/\{([^}]+)\}/g,(_,k)=>{
  if(KEY[k])return name(s,KEY[k]);
  if(k==='O_age'||k==='Y_age')return HOUSES[s.house][k];
  let v=extra[k];if(v===undefined)v=s[k];
  if(k==='name'||k==='payer'||k==='carrier'||k==='weak')return name(s,v);
  if(k==='names')return list(v.map(p=>name(s,p)));
  if(k==='item')return ITEM[v]||v;
  if(k==='placeword')return s.st&&s.st.lag>0?'behind the last families '+'●'.repeat(Math.min(3,s.st.lag))+'○'.repeat(3-Math.min(3,s.st.lag)):PLACEWORD[s.place];
  return v===undefined?'':String(v);
 });
}

/* Strip lines, by key. */
const LINES={
 'N-fed':'Supper: all five eat. 🍞 {B} left.','N-part':'Supper: {names} go without tonight.','N-part1':'Supper: {names} goes without tonight.',
 'N-none':'Supper: no bread tonight. All five go without.',
 'N-short':'A short supper. {F} eats last and least.','N-camp':'Tonight the camp shares its bread with you.',
 'N-thirst':'{names} go thirsty today.','N-thirst1':'{names} goes thirsty today.',
 'N-flock1':'The flock is thirsty.','N-flock2':'The flock straggles. You fall back in the column.','N-flock2rear':'The flock straggles.',
 'N-stray':'A goat wanders off with another flock.','N-foldTurn':'The Fold boys turn your goat back.',
 'N-ride':'{name} rides today.','N-carriedBy':'The {family} family carries {name} on their donkey.','N-sore':'{name} is hurt: ⚡2 at most when well.',
 'N-carriedCart':'The {family} family takes {names} up on their cart.','N-carriedMany':'The {family} family takes {n} of you up on their cart.','N-elimBake':'A bowl is baked at the ovens by the wells.',
 'N-wsShare':'The Waterskins grandmother pours for your children.',
 'N-drinkShort':'The skins run dry before every cup is filled.','N-rideWeary':'{name} is weary and rides today.',
 'N-loomApart':'The Loom family cannot stop. Their hands are full with the baby.',
 'N-elimLate':'You reach Elim a day behind the camp.','T2-arrivalLate':"Etham's last well. You come late: the skins are not full.",
 'R-easeRear':'The camp draws ahead. You will reach the next well late.',
 'A3-held':"{Y} slips, remembers {E}'s story, and holds on.",
 'R-H.Elior-story':"{Y} falls asleep holding {E}'s sleeve.",'R-H.Elior-sleep':'The fire burns low. The camp is quiet.',
 'R-H.Doran-wait':'A wet lamb stands up. Families pass you.','R-H.Doran-carry':'{payer} walks with a lamb across the shoulders.','R-H.Doran-give':'The Fold boys make her a bed of cloaks.',
 'R-H.Daliya-give':"The grandmother kisses {Y}'s head.",'R-H.Daliya-trade':'Three measures, poured carefully.','R-H.Daliya-keep':'You tie the cloth and say nothing.',
 'R-D6.1-carryBaby':"The baby sleeps on {payer}'s shoulder.",
 'N-waits':'The {family} family waits for you. No ground is lost.','N-gap':'The last families draw ahead of you.',
 'R-GAP-item':'{item} stays by the road. You close up.','R-GAP-food':'A bowl and two measures lighter, you close up.','R-GAP-pushOn':'You walk on as you are.',
 'R-STORM-shelter':'You crouch behind the load until it passes.','R-STORM-push':'Heads down, you walk into the sand.',
 'N-stormHurt':'{name} is thrown down and walks hurt.','N-stormGoat':'A goat bolts toward another flock.',
 'R-FEVER-nurse':'{name} sits by the sickbed all day.','R-FEVER-keepAway':'You pitch your tent a little apart.',
 'N-fall':'{name} falls on the stones and walks hurt.','N-donkeyLame':'The donkey goes lame: no rider, no hurrying.',
 'N-goatAgain':'Another goat lies down and does not rise.','N-spoil':'Two cakes spoil in the heat.','T1-lead':'{name} leads the donkey through the night.',
 'N-gapDonkey':'Without the donkey you fall further behind.','N-gapLoad':'With the load on your backs, the camp draws far ahead.','A2-none':'Every stack went hard. No cakes tonight.',
 'N-sick':'{name} lies down with a fever.','N-sickNurse':'{name}, who sat by the sickbed, has a fever tonight.',
 'N-better':'{name} is a little stronger tonight.','N-well':"{name}'s fever has gone.",
 'N-grave':'{name} is gravely ill and cannot walk.','N-frail':'{name} comes through the night, but frail.',
 'N-fedAll':'Supper: everyone eats. 🍞 {B} left.',
 'N-drinkFull':'Five full cups. The skins grow light.','N-drinkHalf':'{F} and {M} sip, then pass the cup down.',
 'A1-good':'Tidy load. Ready to walk.','A1-fine':'It holds, though the cook stones are buried.','A1-rough':'The load slips twice. You start with the last families.',
 'T1':'Out of Egypt with the whole people, toward Succoth.',
 'R-D1.2-ride':'{E} settles on the donkey.','R-D1.2-staff':"{O}'s shoulder stays under {E}'s hand.",'R-D1.2-limp':'Families pass you on the road.',
 'A2-good':'Every stack wrapped warm.','A2-fine':'One stack went hard.','A2-rough':'{n} stacks went hard.',
 'R-press':'You pass family after family.','R-steady':'You keep your place in the column.','R-ease':'The last families catch you up.',
 'T2-arrival':"Etham's last well: every skin filled.",
 'R-D2.1-pour':'She bows, and blesses your house.','R-D2.1-stitch':'By firelight, the seam closes.','R-D2.1-walkOn':'Another family stops for her.',
 'T3-drink':'By the Red sea shore, the family drinks from the skins.',
 'R-D3.1-gather':'Five people in one knot, the pillar above them.','R-D3.1-rope':'The goats walk nose to tail. {Y} watches the dust.',
 'A3-good':'Step for step: all five and every animal.','A3-lamb':'A lamb strays among other flocks.','A3-floor':'The last three stay close. {Y} is afraid.',
 'A3-liora':'{Y} slips in the dark and is afraid.','A3-bundle':'{item} slides into the dark.','A3-adult':'{name} stumbles and walks sore.',
 'R-D3.2-search':'{payer} comes back wet to the knees, carrying the lamb.','R-D3.2-foldBoys':'"We\'ll find it!" They do.','R-D3.2-leaveLamb':"The lamb trots off with a stranger's flock.",
 'R-D3.2-sing':'{Y} dances barefoot on the sand.','R-D3.2-bake':'Warm cakes by the water.','R-D3.2-waterFlock':'The goats drink and settle.',
 'T4-noon':'Noon. {name} flags in the heat.',
 'R-D4.2-ride':'{name} rides today.','R-D4.2-carry':'{carrier} carries {name}.','R-D4.2-shade':'An hour of shade. The skins are lighter.',
 'R-eveBake':'Warm cakes, wrapped for the road.',
 'R-D5.1-waterFlock':'The goats crowd the bowl, then trot ahead.','R-D5.1-drive':'Up and down the line, all day.','R-D5.1-foldHerd':'The Fold boys whistle, and the goats fall in.','R-D5.1-letLag':'The bleating falls farther behind.',
 'R-D6.1-share':'The baby drinks and stops crying.','R-D6.1-keep':'You tie the skins tight and walk on.','R-D6.1-flockShare':'The goats bleat. The baby sleeps.',
 'T6':'The cloud leads on. Then, ahead: a pool!',
 'A4-result':'Our skins: {W}.','A4-resultLoom':'Our skins: {W}. The Loom skins are full.','A4-loomFirst':'You let the Loom family draw first.','A4-paidFold':'{payer} carries the Fold skins.',
 'R-leaveBundle':'{item} stays by the road. {name} rides.','R-carryByHand':'{payer} carries {name}. Families pass you.','R-carryByCamp':'Neighbors carry {name}. Families pass you.',
 'A5-rest':'A day in the palm shade.','A5-liora':'{Y} sits close all day, and smiles by evening.','A5-tradeGoat':'A goat goes to the Loom family, for dough.',
 'A5-help':'{payer} gives the day to the {family} family.','A5-moveUp':'{payer} moves the tent nearer the front.'
};
function line(s,key,p={}){
 if((key==='N-part'||key==='N-thirst')&&p.names&&p.names.length===1)key+='1';
 if(key==='N-carriedCart'&&p.names.length>2){key='N-carriedMany';p={...p,n:p.names.length};}
 return fmt(LINES[key]||key,s,p);
}

/* Cards. `kjv` is the verse printed on the card; `refs` open as popups. */
const CARDS={
 S0:{title:'Your household',button:'Set out',who:true,text:['{E}, the elder. {M} and {F}, the parents. {O}, {O_age}. {Y}, {Y_age}.','Three families from your street walk beside you: Waterskins, Loom and Fold.','Those close behind the cloud reach each well first.','💧 water, 🍞 cakes, 🥣 dough, 🐑 flock, 📍 your place in the camp, ⚡ strength. At dawn, ⚡0 means riding or being carried. A spare seat also takes someone at ⚡1.']},
 'D1.2':{title:'A broken strap',body:"{E}'s sandal strap snapped. {E} is limping."},
 'D2.1':{title:'A split skin',body:'The Waterskins grandmother holds up her only skin, split end to end.'},
 'D3.1':{title:'Chariots behind the camp',kjv:['Exodus 14:10'],body:"Dust on the horizon. {Y} grips {M}'s hand. Time for one thing."},
 S3:{title:'The pillar moves',kjv:['Exodus 14:19'],button:'Continue'},
 'D3.2':{title:'Safe on the shore',kjv:['Exodus 15:21']},
 I1:{rubric:'Chapter I complete',title:'Departure',button:'Into the wilderness'},
 'D4.1':{title:'No water here',kjv:['Exodus 15:22'],body:'The skins hold {W}. Choose the cup until you find water.'},
 'D4.2':{title:'{name} is flagging'},
 EVE4:{title:'The supper cloth',body:'Bread {B}. Dough {D}. More dry road tomorrow.'},
 EVE5:{title:'The supper cloth',body:'Bread {B}. Dough {D}. More dry road tomorrow.'},
 'D5.1':{title:'The flock lags'},
 'D6.1':{title:'The Loom baby',body:'You have {W}; today takes {need}. The Loom family has none. Their baby is crying.'},
 'S6-bitter':{title:'The water is bitter',kjv:['Exodus 15:23','Exodus 15:24'],body:'The camp waits while Moses cries to the LORD.',button:'Continue'},
 S6:{title:'Made sweet',kjv:['Exodus 15:25'],body:'Everyone drinks at the pool: people, flock and donkey. The skins are still to fill.',button:'Continue'},
 EVE6:{title:'Evening at Marah',body:'Bread {B}. Dough {D}.'},
 S7:{title:'Under the palms',kjv:['Exodus 15:27'],refs:['Numbers 33:9'],body:'Twelve wells. Every skin filled, every animal watered.',button:'Three days by the wells'},
 I2:{rubric:'Chapter II complete',kjv:['Exodus 16:1'],button:'Chapter III: the wilderness of Sin'},
 SEAT:{title:"{name} can't walk today"},
 'H.Elior':{title:"{E}'s story",refs:['Exodus 13:19'],body:"Moses carries Joseph's bones. {E} wants to tell the children why."},
 'H.Doran':{title:'A ewe is lambing',body:'One of your ewes drops behind to lamb. The column does not wait.'},
 'H.Daliya':{title:'The smell of baking',body:'The Waterskins family has no dough left. They smell yours.'},
 ELIM:{title:'A day by the wells',body:'Give this day a job.'},
 STORM:{title:'A wall of sand',body:'A sandstorm rolls down the road toward the camp.'},
 FEVER:{title:'Fever in the next tent',body:'The Waterskins grandmother burns with fever. Her family is worn out.'},
 GAP:{title:'Falling behind',refs:['Deuteronomy 25:17','Deuteronomy 25:18'],body:'The last families are almost out of sight. One more mark, and your household cannot keep up.'},
 GOAT:{title:'The brown goat',kjv:['Matthew 10:29'],button:'Walk on'},
 DONKEY:{title:'The donkey lies down',button:'Shoulder the skins'},
 MOURN:{title:'{E} is gathered to the fathers',kjv:['Psalms 23:4'],refs:['Exodus 13:19']},
 END:{title:'The road ends here',kjv:['Isaiah 40:11']}
};
const DAWN={2:{kjv:['Exodus 13:21']},3:{kjv:['Exodus 13:22'],extra:'The cloud turns the camp back, toward the sea.'},4:{},5:{},6:{},7:{}};
const ACTIVITIES={
 A1:{title:'Load the donkey',kjv:['Exodus 12:38'],refs:['Exodus 12:34'],instruction:'Two places are still open. Pick two. The rest stay in Egypt. Then balance Left and Right.',instruction2:'Tap a bundle, then a place. Keep Left and Right within 2. Cook stones go in Hands or Saddle.'},
 A2:{title:'Cakes on the stones',refs:['Exodus 12:39'],instruction:'Choose one bowl or two. Wrap each stack before its stone cools. A hard stack is lost.'},
 A3:{title:'Between the waters',kjv:['Exodus 14:22'],instruction:'Tap whoever calls before the count runs out. A miss costs the household. Everyone will cross.'},
 A4:{title:'The line at the water',instruction:'Your turn at the pool is {draws} draws. Each draw is 2 measures. Who draws first?'},
 A5:{title:'Three days at Elim',instruction:'Three free days. Give each one a job.'}
};
/* Option labels. */
const OPTIONS={
 'D1.2':{ride:'{E} rides in the saddle seat',rideNoSeat:'Repack so {E} can ride',staff:'{O} walks beside {E} as a staff',limp:'{E} limps on; you walk slower'},
 PACE:{press:'Press on behind the cloud',steady:'Keep a steady pace',ease:'Ease off and rest the weary'},
 'D2.1':{pour:'Pour her three measures',stitch:'{payer} stitches it tonight',walkOn:'Wish her well and walk on'},
 'D3.1':{gather:'Gather the children close',rope:'Rope the flock in a line'},
 'D3.2':{search:'{payer} searches the shore',foldBoys:'Ask the Fold boys to look',leaveLamb:'Let it go with the other flock',sing:'{M} and {Y} dance with the timbrels',bake:'Bake on the shore',waterFlock:'Water the flock from the skins'},
 'D4.1':{full:'Full cups for all five',half:'Half cups for {F} and {M}'},
 'D4.2':{ride:'{name} rides in the saddle seat',rideNoSeat:'{name} rides on the load',carry:'{carrier} carries {name}',shade:'Rest an hour in the shade'},
 EVE:{bake:'Bake a bowl, then eat',short:'A short supper; save a cake',full:'A full supper',none:'Go without tonight'},
 'D5.1':{waterFlock:'Pour the flock two measures',drive:'{names} drive them on',foldHerd:'Ask the Fold boys to herd them',letLag:'Let them follow at their pace'},
 'D6.1':{share:'Share three, and walk at their pace',keep:'Keep it for your own',flockShare:"Give them the flock's water",carryBaby:'{payer} carries the Loom baby'},
 STORM:{shelter:'Shelter behind the load',push:'Push through it'},
 FEVER:{nurse:'{payer} sits with her today',keepAway:'Keep your tent apart'},
 GAP:{pushOn:'Push on as we are',lighten:'Lighten the load and close up'},
 'H.Elior':{story:'{E} tells it by the fire',sleep:'Everyone sleeps early'},
 'H.Doran':{wait:'Wait with her',carry:'{payer} carries the lamb',give:'Leave ewe and lamb with the Fold family'},
 'H.Daliya':{give:'Give them a bowl of dough',trade:'Trade a bowl for three measures',keep:'Keep the dough tied'},
 SEAT:{leaveBundle:'Leave {item} by the road',carryByHand:'{payer} carries {name}',carryByCamp:'Neighbors carry {name}'},
 ELIM:{tradeGoat:'Trade a goat for dough',help:'Help the {family} family',moveUp:'Pitch the tent nearer the front',rest:'Lie in the palm shade',liora:'Sit with {Y} all day'}
};
const A1TILES={spare:['Spare skin',['💧 max 16']],sack:['Dough sack',['🥣 +1','🫏 too heavy to hurry']],seat:['Saddle seat',['🫏 a seat for whoever tires','💧 max −1']],
 loom:["The Loom family's bundle",['Loom: walks with you']],trough:['Kneading trough',['🍞 +1 a bowl','{M} bakes without tiring']]};

/* The HUD: the one description of the household that every screen shows. */
const GAUGE=n=>'behind the last families '+'●'.repeat(Math.max(0,Math.min(3,n)))+'○'.repeat(3-Math.max(0,Math.min(3,n)));
const DONKEYWORD=s=>s.st.donkeyGone?'gone':s.st.donkeyLame?'lame':s.st.donkey>=2?'weary':'rested';
// Your place as the HUD and the dawn card say it: behind the last families once the gap opens.
const placeNow=s=>s.st.lag>0?GAUGE(s.st.lag):PLACEWORD[s.place];
/* One word for each person. Only the eldest can be at rest. */
function word(s,p){
 const st=s.st;
 return st.gone.has(p)?'at rest':(st.sick[p]||0)>=2?'gravely ill':st.sick[p]?'sick':!s.atElim&&s.riding.has(p)?'riding':!s.atElim&&s.carried[p]?'carried':s.E[p]===0?'worn out':s.thirsty.has(p)?'thirsty':s.hungry.has(p)?'hungry'
  :p==='Liora'&&s.shaken?'afraid':s.sore.has(p)?'hurt':st.frail.has(p)?'frail':s.E[p]===1?'weary':'';
}
function hud(s){
 const st=s.st;
 return {water:'💧 '+s.W+'/'+s.cap,bread:'🍞 '+s.B,dough:'🥣 '+s.D,flock:'🐑 '+s.flock+' · '+FLOCKWORD(s.fstep),place:'📍 '+placeNow(s)+(s.late?' · late to the next well':''),
  families:['Waterskins','Loom','Fold'].map(f=>({name:f,word:famWord(s,f)+(f==='Fold'&&s.oweFold?(s.ties.Fold?' · ':'')+'owed':'')})),
  extras:'🫏 '+DONKEYWORD(s)+(s.extras.length?' · '+s.extras.map(x=>ITEM_SHORT[x]).join(', '):''),
  gap:'',
  day:'DAY '+s.day,location:LOCNAME[s.loc]||'Rameses',
  portraits:ROLES.map(p=>({role:p,name:name(s,p),energy:s.E[p],word:word(s,p),gone:st.gone.has(p)}))};
}
/* What a beat shows of the household; two of these make the chips. */
function snap(s){
 const st=s.st;
 return {W:s.W,cap:s.cap,B:s.B,D:s.D,flock:s.flock,fword:FLOCKWORD(s.fstep),fstep:Math.max(0,s.fstep),place:s.place,late:s.late,ties:Object.fromEntries(Object.keys(s.ties).map(f=>[f,famWord(s,f)])),extras:s.extras.slice(),E:{...s.E},
  sore:[...s.sore],shaken:s.shaken,owe:s.oweFold,riding:[...s.riding].concat(Object.keys(s.carried)),
  sick:Object.fromEntries(ROLES.map(p=>[p,st.sick[p]||0])),gone:[...st.gone],frail:[...st.frail],donkey:DONKEYWORD(s),lag:st.lag};
}
const signed=n=>(n>0?'+':'−')+Math.abs(n);
/* R14: every change between two beats is a chip. Icons, names and numbers only. */
function diff(a,b,s){
 const out=[],d=(icon,n)=>{if(n)out.push(icon+' '+signed(n));};
 if(a.cap!==b.cap)out.push('💧 max '+b.cap);
 d('💧',b.W-a.W);d('🍞',b.B-a.B);d('🥣',b.D-a.D);d('🐑',b.flock-a.flock);
 if(a.fword!==b.fword)out.push('🐑 '+b.fword);
 if(b.place!==a.place)out.push('📍 '+(b.place>a.place?'up':'back')+' '+(Math.abs(b.place-a.place)===1?'one':'two'));
 if(b.late>a.late)out.push('⏳ late to the next well');
 for(const f of Object.keys(b.ties))if(a.ties[f]!==b.ties[f])out.push(f+': '+(b.ties[f]||'no longer apart'));
 for(const x of a.extras)if(!b.extras.includes(x))out.push('🫏 −'+ITEM_SHORT[x]);
 const groups={};for(const p of ROLES){const n=b.E[p]-a.E[p];if(n&&!b.gone.includes(p))(groups[n]??=[]).push(p);}
 for(const [n,ps] of Object.entries(groups))out.push(ps.length===5?'⚡ all '+signed(+n):'⚡'+ps.map(p=>name(s,p)).join(', ')+' '+signed(+n));
 for(const p of b.sore)if(!a.sore.includes(p))out.push(name(s,p)+': hurt');
 if(a.sore.length&&!b.sore.length)out.push('hurt mended');
 const SICK=['well','sick','gravely ill'];
 for(const p of ROLES)if(a.sick[p]!==b.sick[p]&&!b.gone.includes(p))out.push(name(s,p)+': '+SICK[b.sick[p]]);
 for(const p of b.frail)if(!a.frail.includes(p))out.push(name(s,p)+': frail');
 if(a.donkey!==b.donkey)out.push('🫏 '+b.donkey);
 if(a.lag!==b.lag)out.push('📍 '+(b.lag>0?GAUGE(b.lag):PLACEWORD[b.place]));
 if(!a.shaken&&b.shaken)out.push(name(s,'Liora')+': afraid');if(a.shaken&&!b.shaken)out.push(name(s,'Liora')+': not afraid');
 if(!a.owe&&b.owe)out.push('owe Fold');if(a.owe&&!b.owe)out.push('Fold paid');
 return out;
}
/* The journal page (chapter II end) and the half page (chapter I end). */
const HL2='.';
function hl3(s,code){
 const m=k=>s.marks.find(x=>x.kind===k)||{day:s.day};
 if(code==='left_by_road'){const x=m('left');return fmt('Hardest day: day {day}, when {item} stayed on the sand.',s,{day:x.day,item:x.what});}
 if(code==='someone_carried'){const x=m('carried');return fmt("Hardest day: day {day}, when {name} couldn't walk.",s,{day:x.day,name:x.what});}
 if(code==='goat_gone')return fmt('Hardest day: day {day}, when a goat went with another flock.',s,{day:m('goat').day});
 if(code==='mourned')return fmt('Hardest day: day {day}, when {E} was gathered to the fathers.',s,{day:m('mourned').day});
 if(code==='donkey_died')return fmt('Hardest day: day {day}, when the donkey lay down.',s,{day:m('donkey').day});
 if(code==='goat_died')return fmt('Hardest day: day {day}, when a goat did not rise.',s,{day:m('goatDied').day});
 if(code==='someone_gravely_ill'){const x=m('grave');return fmt('Hardest day: day {day}, when {name} was gravely ill.',s,{day:x.day,name:x.what});}
 if(code==='run_ended')return '';
 if(code==='goat_debt')return fmt('Hardest day: day {day}, when a goat paid the Fold debt.',s,{day:m('debt').day});
 if(code==='liora_afraid')return fmt('Hardest day: the sea, when {Y} was frightened.',s);
 if(code==='thirsty_day')return fmt('Hardest day: day {day}, with dry mouths.',s,{day:m('thirsty').day});
 return 'No day too hard. Every evening by a fire.';
}
const KIND={skin:()=>'the split skin',baby:()=>'the Loom baby',line:()=>'the Loom family at the well',sickbed:(s,p)=>name(s,p)+' at the sickbed',day:(s,f)=>'a day for the '+f+' family',dough:()=>'dough for the Waterskins family',ewe:()=>'the ewe and her lamb'};
const NUM=['no one','one','two','three','four','five'];
/* The journal page. It names what the house kept and who it helped. A road that ended closes here too, with no blame. */
function journal(s,carry,heads,points){
 const st=s.st,together=carry.together,sore=carry.sore.filter(p=>!st.gone.has(p)).map(p=>name(s,p)),ended=!!st.ended;
 const kind=[...new Set(st.kind.map(([k,a])=>KIND[k](s,a)))];
 const sick=ROLES.filter(p=>st.sick[p]&&!st.gone.has(p)).map(p=>name(s,p)),frail=[...st.frail].filter(p=>!st.gone.has(p)).map(p=>name(s,p));
 const h1=ended?fmt('The road ended {where}.',s,{where:WHERE(st.ended.day)}):heads[0]+'.';
 const lines=[h1,heads[1]+'.'];const h3=hl3(s,heads[2]);if(h3)lines.push(h3);
 if(!ended)lines.push('Into the wilderness of Sin you carry:','🍞 '+carry.suppers+(carry.suppers===1?' supper':' suppers')+' · 🐑 '+carry.flock+' of '+carry.flock0+' · 📍 '+PLACEWORD[s.place]);
 else lines.push('The little ones are safe beside you. 🐑 '+carry.flock+' of '+carry.flock0+'.');
 if(st.gone.size)lines.push(fmt('{E} rests by the road. {n} walk on.',s,{n:NUM[5-st.gone.size][0].toUpperCase()+NUM[5-st.gone.size].slice(1)}));
 if(together.length)lines.push('Walking with you: '+list(together));
 if(!ended)lines.push(carry.ties?'Shared bread, helping hands: neighbours hold your place.':'Bread kept; no neighbours hold your place. You leave at the rear.');
 if(carry.helped.length)lines.push('Helped on the way: '+list(carry.helped));
 if(kind.length)lines.push('Kindness remembered: '+list(kind)+'.');
 if(carry.apart.length)lines.push('The Loom family walks apart. On the dry day you kept your water.');
 lines.push('Left by the road: '+(carry.left.length?list(carry.left.map(x=>ITEM[x])):'nothing'));
 if(st.donkeyGone)lines.push('The donkey lies by the road.');
 const ail=[sick.length&&list(sick)+' sick',frail.length&&list(frail)+' frail',sore.length&&list(sore)+' hurt',carry.shaken&&name(s,'Liora')+' still afraid'].filter(Boolean);
 if(ail.length)lines.push(ail.join(' · '));
 lines.push('Journal points: '+points);
 return {title:HOUSES[s.house].title+': the journal',lines,ended,hook:ended?'':'In Sin, the bread runs out for the whole camp. You carry '+carry.suppers+(carry.suppers===1?' supper.':' suppers.'),
  headlines:[h1,heads[1]+'.',h3]};
}
const WHERE=day=>day===6?'in Shur, a day short of Marah':day===7?'on the road to Elim':day>=4?'in Shur':'on the road';
/* The mourning cards. Short, gentle and true to what happened; nothing graphic, and no blame. */
function goatCard(s){return [fmt('At dusk the brown goat lies down and does not get up. {O} sits beside her, one hand on her warm side, until she is still.',s),'The flock was thirsty too long.','🐑 '+s.flock+' of '+s.flock0];}
function donkeyCard(s){return [fmt('The donkey kneels in the sand and will not rise. {F} unties the load and rests a hand on the grey neck until it is still.',s),'What you cannot carry stays by the road. Your skins now hold eight measures.'];}
function mournCard(s){
 const told=s.picks['H.Elior']==='story';
 return [fmt("In the night {E}'s breathing grows soft and slow. {M} holds an old hand; {Y} sleeps against a shoulder. Before dawn {E} is gone, gently, like a lamp burning low.",s),
  fmt('In the morning the family lays {E} to rest beneath a '+(s.atElim?'palm by the wells':'tamarisk by the road')+'. {O} carries the staff now.'+(told?" {E} told the story of Joseph's bones; Israel carries them still.":''),s)];
}
function endCard(s){
 const st=s.st,ill=ROLES.find(p=>!st.gone.has(p)&&((st.sick[p]||0)>=2||s.E[p]===0));
 const why=[st.donkeyGone&&'the donkey is gone',ill&&name(s,ill)+' cannot stand'].filter(Boolean);if(!why.length)why.push('your people are worn out');
 return ['The cloud goes on before the camp. Your household cannot keep up any longer: '+why.join(', ')+', and the last families are out of sight.',
  'You stop with the stragglers '+WHERE(st.ended.day)+'. The little ones are safe beside you.'];
}
function chapterOne(s){
 const unpicked=['spare','sack','seat','loom','trough'].filter(x=>!s.extras.includes(x)&&!s.left.includes(x)).map(x=>ITEM[x]);
 const lost=s.left.map(x=>ITEM[x]).concat(s.strayed>0?['a lamb']:[],s.shaken?[name(s,'Liora')+"'s nerve"]:[]);
 return ['The LORD made the sea dry land. Everyone crossed.',HL1[s.place],'Left in Egypt: '+list(unpicked)+'.','Lost on the way: '+(lost.length?list(lost)+'.':'nothing.'),
  'Next: the wilderness of Shur. Three days, and no one knows where the water is.'];
}
return {placeNow,GAUGE,DONKEYWORD,word,goatCard,donkeyCard,mournCard,endCard,WHERE,LOCNAME,famWord,ROLES,KEY,HOUSES,ITEM,ITEM_SHORT,PLACEWORD,HL1,TIEWORD,FLOCKWORD,LOCATION,LINES,CARDS,DAWN,ACTIVITIES,OPTIONS,A1TILES,name,list,fmt,line,hud,snap,diff,hl3,journal,chapterOne};
});
