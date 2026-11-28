/* By Cloud and Fire v2 rules: a line-for-line port of PLAY-SCRIPT-SIM-v2.py.
   People are stored by ROLE under the Elior house's names, as in the simulator:
   Elior = elder, Sarela = mother, Talven = father, Aviel = older child, Liora = youngest.
   journey() is the one script of the game. The browser, the test harness and the simulator's
   policies all drive this same generator; nothing else changes the household. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.V2Rules=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PEOPLE=['Elior','Sarela','Talven','Aviel','Liora'];
const WALKERS_COST=['Talven','Sarela','Aviel','Elior','Liora'];
const THIRST=['Talven','Sarela','Elior','Aviel','Liora'],FEED=['Liora','Aviel','Elior','Sarela','Talven'];
const EXTRAS=['spare','sack','seat','loom','trough'];
const FAMILIES=['Waterskins','Loom','Fold'];
const HOUSEHOLDS={
 Elior:{E:{Elior:2,Sarela:3,Talven:3,Aviel:3,Liora:3},D:5,flock:7},
 Doran:{E:{Elior:3,Sarela:3,Talven:2,Aviel:3,Liora:3},D:4,flock:9},
 Daliya:{E:{Elior:2,Sarela:3,Talven:3,Aviel:2,Liora:3},D:6,flock:5}};
const PLACE=['rear','middle','front'];
const SACK_BOWLS=1,HEAT_P=0.55,HEAT_DAY={2:0.25,3:0.6,4:0.45,5:0.4,6:0.6,7:0.25};
// v2.1 dials (the simulator's names)
const SUPPER_REST=2,SEAT_CAP=1,HELP_DRAW=1,STEADY_MILD=1,PRESS_MILD=2,HELP_COST=1,MOVEUP_COST=1,SEAT_AUTO=1,REFUSE_DRAW=1,TROUGH_PLUS=1,TIE_BASE=0.4;
// v3 real stakes, Level A (STAKES-SIM.py; PJ chose Level A, 2026-11-27): the dials, by the simulator's names.
const SICK_BASE=0.006,SICK_THIRST=0.12,SICK_HUNGER=0.08,SICK_WORN=0.08,SICK_HOTPRESS=0.08,SICK_REAR=0.03,SICK_ELDER=0.03,SICK_NURSE=0.10,ELIM_SIT=0.30,
 RECOVER=0.45,RECOVER_EASE=0.30,REMEDY=0.20,ELDER_WORSEN=0.70,WORSEN=0.45,ELDER_DEATH=0.70,LAG_DAY=1,LAG_END=3,DONKEY_LAME=3,DONKEY_DEAD=5,
 DONKEY_LAG=2,DONKEY_DIE_P=0.7,STACK_CAKES=5,
 GOAT_WEAK=0.10,GOAT_REAR=0.30,GOAT_HOT=0.08,GOAT_DIE=0.6,FALL_P=0.04,FALL_PRESS=0.30,STORM_P=0.35,FEVER_P=0.50,TIE_STAKES=1,SPOIL=2;
const ELDER='Elior',CHILDREN=['Aviel','Liora'];
const CAMP={1:'Succoth',2:'Etham',3:'the shore of the sea',4:'Shur',5:'Shur',6:'Shur, a day short of Marah',7:'the road to Elim'};
const END={ended:true};// thrown when the household cannot keep up; caught by journey()
const COMBOS=[];for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)COMBOS.push(EXTRAS[i]+','+EXTRAS[j]);

/* CPython's random.Random(seed) for a non-negative integer seed: MT19937, init_by_array,
   random() from 53 bits, choice() through _randbelow with rejection. */
function PyRandom(seed){
 const mt=new Uint32Array(624);let idx=624;
 function init(s){mt[0]=s>>>0;for(let i=1;i<624;i++){const x=mt[i-1]^(mt[i-1]>>>30);mt[i]=(Math.imul(1812433253,x)+i)>>>0;}}
 seed=Math.abs(Math.floor(Number(seed)||0));
 const key=[seed>>>0];if(seed>=4294967296)key.push(Math.floor(seed/4294967296)>>>0);
 init(19650218);let i=1,j=0,k=Math.max(624,key.length);
 for(;k;k--){const x=mt[i-1]^(mt[i-1]>>>30);mt[i]=((mt[i]^Math.imul(x,1664525))+key[j]+j)>>>0;i++;j++;if(i>=624){mt[0]=mt[623];i=1;}if(j>=key.length)j=0;}
 for(k=623;k;k--){const x=mt[i-1]^(mt[i-1]>>>30);mt[i]=((mt[i]^Math.imul(x,1566083941))-i)>>>0;i++;if(i>=624){mt[0]=mt[623];i=1;}}
 mt[0]=0x80000000;
 function next(){
  if(idx>=624){
   for(let n=0;n<624;n++){const y=(mt[n]&0x80000000)|(mt[(n+1)%624]&0x7fffffff);mt[n]=(mt[(n+397)%624]^(y>>>1)^((y&1)?0x9908b0df:0))>>>0;}
   idx=0;}
  let y=mt[idx++];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;
 }
 const random=()=>{const a=next()>>>5,b=next()>>>6;return (a*67108864+b)/9007199254740992;};
 const below=n=>{const bits=32-Math.clz32(n);let r=next()>>>(32-bits);while(r>=n)r=next()>>>(32-bits);return r;};
 return {random,choice:seq=>seq[below(seq.length)]};
}

function newState(house='Elior',rng,seed=0){
 const h=HOUSEHOLDS[house];if(!h)throw Error('Unknown household '+house);
 rng=rng||PyRandom(0);
 const heat=[];for(let d=0;d<8;d++)heat.push(rng.random()<(HEAT_DAY[d]??HEAT_P));
 const falter=rng.choice(['Liora','Elior','Aviel']);
 const helpRoll=[];for(let n=0;n<12;n++)helpRoll.push(rng.random());
 heat[1]=false;
 return {house,E:{...h.E},W:12,cap:12,B:5,D:h.D,flock:h.flock,flock0:h.flock,fstep:0,place:1,extras:[],left:[],
  ties:{Waterskins:0,Loom:0,Fold:0},oweFold:false,shaken:false,sore:new Set(),riding:new Set(),carriedDays:0,rearDays:0,
  hungryNights:0,thirstyDays:0,lastHungry:new Set(),givenGoat:0,strayed:0,events:[],rule:'full',heat,falter,helpRoll,hr:0,rng,
  handCarry:false,seatTold:false,elimTraded:false,late:0,loomRefused:false,tradedGoat:0,steadier:false,gaveEwe:0,elimDays:3,loc:'rameses',apartSaid:false,
  // Shown, never ruled on: what the HUD and the journal need to say what happened.
  day:1,picks:{},grades:{},carried:{},hungry:new Set(),thirsty:new Set(),marks:[],packGrade:null,debt:null,
  // v3 stakes: its own seeded dice, so a retry from the last camp meets the same weather and the same events
  st:{rng:PyRandom(Math.abs(Math.floor(seed))*7919+101),day:1,pace:null,hot:false,sick:{},gone:new Set(),frail:new Set(),goatsDied:0,donkey:0,donkeyGone:false,donkeyLame:false,
   lag:0,lagMax:0,lagToday:0,waited:{1:false,2:false},nursed:null,ended:null,cards:[],sickDays:0,spoiled:0,everSick:new Set(),everGrave:new Set(),gapAsked:false,helpedToday:false,tiesSeen:null,
   kind:[],goatCards:0}};
}
function log(s,...ev){s.events.push(ev);s.st.cards.push([s.st.day,...ev]);}
function en(s,who,n){
 const st=s.st;if(!who||st.gone.has(who))return;
 const cap=s.sore.has(who)?2:3;s.E[who]=Math.max(0,Math.min(cap,s.E[who]+n));
 const lvl=st.sick[who]||0;// sick: no more than 1; gravely ill: 0 (must ride or be carried)
 s.E[who]=Math.min(s.E[who],lvl>=2?0:(lvl===1||st.frail.has(who))?1:3);
}
// A job's actor is chosen BEFORE any effect changes strength. No passenger works.
const able=(s,p)=>PEOPLE.includes(p)&&!s.st.gone.has(p)&&s.E[p]>0&&(s.st.sick[p]||0)<2&&!s.riding.has(p)&&!s.carried[p];
const worker=(s,first,exclude=[],adult=false)=>(first?[first]:[]).concat(WALKERS_COST.filter(p=>p!==first)).find(p=>p!=='Liora'&&!exclude.includes(p)&&(!adult||!CHILDREN.includes(p))&&able(s,p))||null;
const carrierFor=(s,who)=>worker(s,CHILDREN.includes(who)?'Aviel':'Talven',[who],!CHILDREN.includes(who));
const drivers=s=>{const a=worker(s,'Aviel'),b=worker(s,null,[a]);return a&&b?[a,b]:[];};
function payer(s,first){
 const order=(first?[first]:[]).concat(WALKERS_COST.filter(p=>p!==first));
 for(const p of order){if(s.st.gone.has(p))continue;if(s.E[p]>=1&&!s.riding.has(p)&&p!=='Liora')return p;}
 return 'Talven';
}
function tieHelps(s,fam){
 if(tie(s,fam)<1)return false;
 s.hr+=1;return s.helpRoll[s.hr%12]<(TIE_BASE+0.2*tie(s,fam));
}
// The Loom family, refused on the dry day, walks apart until you let them draw first at Marah or give them a day at Elim.
function tie(s,fam){return fam==='Loom'&&s.loomRefused?0:s.ties[fam];}
// Lose a place in the column; with the last families there is none to lose, so you reach the next well late.
// v3.1: carrying someone by hand at the rear costs time at the next well, not a mark.
function fallBack(s,carrying=false){if(s.place===0&&!carrying)addLag(s,1,'fellBack');if(s.place>0)s.place-=1;else s.late+=1;}
// The gap behind the last families: a mark when you lose a place you do not have. At most one a day from falling back.
function addLag(s,n,why){
 if(n<=0)return;const st=s.st,ch=st.day<=3?1:2;
 if(why==='fellBack'){n=Math.min(n,LAG_DAY-st.lagToday);st.lagToday+=Math.max(0,n);if(n<=0)return;}
 if(!st.waited[ch]&&FAMILIES.some(f=>tie(s,f)>=2)){st.waited[ch]=true;n-=1;log(s,'familyWaits',FAMILIES.find(f=>tie(s,f)>=2));}// a family that walks with you waits
 st.lag+=n;st.lagMax=Math.max(st.lagMax,st.lag);
 if(n)log(s,'gap',why,st.lag);
}
const canRide=s=>!(s.st.donkeyLame||s.st.donkeyGone);
const falterOf=s=>!s.st.gone.has(s.falter)&&!s.riding.has(s.falter)&&!s.carried[s.falter]?s.falter:PEOPLE.find(p=>!s.st.gone.has(p)&&!s.riding.has(p)&&!s.carried[p])||s.falter;
// The donkey's strain: rested, weary, lame, gone. Without the donkey the bundles stay by the road and you carry 8 measures.
function donkey(s,d){
 const st=s.st;if(st.donkeyGone)return;
 st.donkey=Math.max(0,st.donkey+d);
 if(st.donkey>=DONKEY_DEAD&&st.rng.random()<DONKEY_DIE_P){// at the limit of its strain the donkey may lie down for good
  st.donkeyGone=true;log(s,'donkeyDies');
  for(const it of s.extras.slice())dropExtra(s,it);
  s.cap=Math.min(s.cap,8);s.W=Math.min(s.W,s.cap);
  s.place=0;addLag(s,DONKEY_LAG,'donkeyDies');// the load is on your backs: you drop to the last families, two marks behind
 }else if(st.donkey>=DONKEY_LAME){if(!st.donkeyLame){st.donkeyLame=true;log(s,'donkeyLame');}}
 else if(st.donkey<=1)st.donkeyLame=false;
}
// What a day's pace asks of the donkey: pressing (more in the heat), and a full load with a rider, in the heat, or in Shur's sand.
function paceStrain(s,day,pace){
 const hot=s.heat[day];let d=pace==='press'?(hot?2:1):pace==='ease'?-1:0;
 if(loose(s).length>=2&&(s.riding.size||hot||(day>=4&&day<=6)))d+=1;
 return d;
}
/* Previews for the cards: the SAME rule functions, run on a copy of the household, so a card can show what a choice
   does for certain without showing what chance will add (a fall, a fever, the donkey's last step). */
function copy(s){
 return {...s,E:{...s.E},sore:new Set(s.sore),riding:new Set(s.riding),ties:{...s.ties},extras:s.extras.slice(),left:s.left.slice(),events:[],marks:[],lastHungry:new Set(s.lastHungry),hungry:new Set(s.hungry),thirsty:new Set(s.thirsty),carried:{...s.carried},
  st:{...s.st,sick:{...s.st.sick},gone:new Set(s.st.gone),frail:new Set(s.st.frail),waited:{...s.st.waited},cards:[],kind:[]}};
}
function previewPace(s,day,pace){
 const t=copy(s);t.st.pace=pace;t.st.hot=s.heat[day];walk(t,day,pace);
 if(day===2)t.st.lag=Math.max(0,t.st.lag-1);
 const strain=Math.max(0,s.st.donkey+paceStrain(t,day,pace));
 t.st.donkey=Math.min(strain,DONKEY_DEAD-1);if(strain>=DONKEY_LAME)t.st.donkeyLame=true;else if(strain<=1)t.st.donkeyLame=false;
 return {t,mayDie:strain>=DONKEY_DEAD&&!s.st.donkeyGone};
}
function previewSupper(s,short){const t=copy(s);supperCore(t,s.thirsty,short,null);return t;}
const donkeyWord=s=>s.st.donkeyGone?'gone':s.st.donkeyLame?'lame':s.st.donkey>=DONKEY_LAME-1?'weary':'rested';
const walkers=s=>PEOPLE.filter(p=>!s.riding.has(p));
const hasEvent=(s,name)=>s.events.some(e=>e[0]===name);
const mark=(s,kind,what)=>s.marks.push({kind,day:s.day,what});
function dropExtra(s,item){
 s.extras.splice(s.extras.indexOf(item),1);s.left.push(item);
 if(item==='spare'){s.cap-=4;s.W=Math.min(s.W,s.cap);}
 if(item==='sack')s.D=Math.max(0,s.D-SACK_BOWLS);
 if(item==='seat')s.cap+=SEAT_CAP;
 mark(s,'left',item);
}
const loose=s=>s.extras.filter(x=>x!=='seat');
function paceOpts(s){
 if(s.handCarry||s.fstep>=2||s.extras.includes('sack')||s.place===2)return ['steady','ease'];
 if(!canRide(s))return ['steady','ease'];// a lame donkey cannot hurry
 return ['press','steady','ease'];
}
function walk(s,day,pace){
 const hot=s.heat[day],ws=walkers(s);
 if(pace==='press'){
  s.place=Math.min(2,s.place+1);
  if(hot)for(const p of ws)en(s,p,-1);
  else{const p1=payer(s);en(s,p1,-1);
   if(PRESS_MILD>=2){const rest=WALKERS_COST.filter(p=>p!==p1&&s.E[p]>=1&&!s.riding.has(p)&&p!=='Liora');en(s,rest.length?rest[0]:p1,-1);}}
 }else if(pace==='steady'){
  if(hot)en(s,ws.slice().sort((a,b)=>s.E[a]-s.E[b]||PEOPLE.indexOf(a)-PEOPLE.indexOf(b))[0],-1);
  else if(STEADY_MILD)en(s,payer(s),-1);
 }else{
  fallBack(s);
  for(const p of PEOPLE.slice().sort((a,b)=>s.E[a]-s.E[b]).slice(0,2))en(s,p,+1);
 }
 if(s.place===0)s.rearDays+=1;
}
function drink(s,day,n,say){
 if(s.heat[day])n+=1;
 const short=Math.max(0,n-s.W);s.W=Math.max(0,s.W-n);
 let thirsty=[];
 for(const p of THIRST.slice(0,short)){en(s,p,-1);thirsty.push(p);}
 if(short)say('N-drinkShort');
 if(short&&tieHelps(s,'Waterskins')){s.events.push(['waterskinsShare']);thirsty=thirsty.slice(2);say('N-wsShare');}
 if(thirsty.length){s.thirstyDays+=1;mark(s,'thirsty');say('N-thirst',{names:thirsty});}
 s.thirsty=new Set(thirsty);
 return s.thirsty;
}
function flockDay(s,watered,say){
 const st=s.st,r=st.rng;
 donkey(s,watered?-1:1);
 if(watered){s.fstep=0;return;}
 const was=s.place;
 s.fstep+=1+(s.place===0?1:0);
 if(s.fstep>=2)s.place=Math.max(0,s.place-1);
 if(s.fstep>=3){
  if(tieHelps(s,'Fold')){s.events.push(['foldTurnsGoat']);say('N-foldTurn');}
  else if(s.flock>1&&r.random()<GOAT_DIE){s.flock-=1;st.goatsDied+=1;log(s,'goatDies');}
  else if(s.flock>3){s.flock-=1;s.strayed+=1;s.events.push(['goatStrays']);mark(s,'goat');say('N-stray');}
  s.fstep=2;
 }
 if(st.day>=4&&st.day<=5&&s.flock>1){// Shur's first two dry days (day 6 ends at Marah's water): a weak goat may not rise
  const risk=GOAT_WEAK*(s.fstep>=1?1:0)+GOAT_REAR*(s.place===0?1:0)+GOAT_HOT*(st.hot?1:0);
  if(s.fstep>=2&&r.random()<risk){s.flock-=1;st.goatsDied+=1;log(s,'goatDies');}
 }
 if(s.fstep>=2)say(s.place<was?'N-flock2':'N-flock2rear');else if(s.fstep===1)say('N-flock1');
}
// What you get is what you wrapped: five cakes for each stack wrapped warm; a hard stack is lost.
function bake(s,bowls,grade,baker=true,hardCount){
 bowls=Math.min(bowls,s.D);
 const hard=Math.min(2*bowls,hardCount??{good:0,fine:1,rough:2}[grade]);
 s.D-=bowls;s.B+=STACK_CAKES*(2*bowls-hard)+(s.extras.includes('trough')?TROUGH_PLUS*bowls:0);
 if(baker&&!s.extras.includes('trough'))en(s,payer(s,'Sarela'),-1);
}
function supper(s,thirsty,short,say){supperCore(s,thirsty,short,say);stakesNight(s,thirsty,say);}
function supperCore(s,thirsty,short,say){
 const eat=short?4:5,have=Math.min(eat,s.B);s.B-=have;
 let hungry=short?new Set():new Set(FEED.slice(have)),camp=false;
 if([...hungry].some(p=>s.lastHungry.has(p))||(hungry.size&&s.hungryNights>=3)){hungry=new Set();s.events.push(['campShares']);camp=true;}
 if(short)en(s,'Talven',-1);
 if(hungry.size)s.hungryNights+=1;
 s.lastHungry=hungry;s.hungry=hungry;
 for(const p of PEOPLE)if(hungry.has(p)||thirsty.has(p))en(s,p,-1);
 // v2.1: a night's rest restores 1, and only to the weariest who ate and drank.
 const fed=PEOPLE.filter(p=>!hungry.has(p)&&!thirsty.has(p)&&!(short&&p==='Talven')&&s.E[p]<(s.sore.has(p)?2:3));
 for(const p of fed.sort((a,b)=>s.E[a]-s.E[b]||PEOPLE.indexOf(a)-PEOPLE.indexOf(b)).slice(0,SUPPER_REST))en(s,p,+1);
 if(say){if(camp)say('N-camp');else if(hungry.size===5)say('N-none');else if(hungry.size)say('N-part',{names:FEED.filter(p=>hungry.has(p)&&!s.st.gone.has(p))});else if(short)say('N-short');else say(s.st.gone.size?'N-fedAll':'N-fed');}
 // Bread does not keep in the heat: above fifteen cakes, two spoil on a hot night.
 if(s.st.hot&&s.B>15){s.B-=SPOIL;s.st.spoiled+=SPOIL;if(say)say('N-spoil');}
}
/* v3: what the day did to each person, decided at night. Only the eldest can die, and only after two bad nights gravely ill. */
function stakesNight(s,thirsty,say){
 const st=s.st,r=st.rng,hungry=s.lastHungry,resting=st.pace==='ease'||st.pace==='elim';
 for(const p of PEOPLE){
  if(st.gone.has(p))continue;
  const lvl=st.sick[p]||0;
  const bad=thirsty.has(p)||hungry.has(p)||st.pace==='press'||(p===ELDER&&st.hot&&!resting&&!s.riding.has(p));
  if(lvl===0){
   const risk=SICK_BASE+SICK_THIRST*(thirsty.has(p)?1:0)+SICK_HUNGER*(hungry.has(p)?1:0)+SICK_WORN*(s.E[p]===0?1:0)
    +SICK_HOTPRESS*(st.pace==='press'&&st.hot?1:0)+SICK_REAR*(s.place===0&&st.pace!=='elim'?1:0)+SICK_ELDER*(p===ELDER?1:0)+SICK_NURSE*(st.nursed===p?1:0);
   if(r.random()<risk){st.sick[p]=1;st.everSick.add(p);log(s,'fallsSick',p);}
  }else if(!bad){
   const rec=RECOVER+RECOVER_EASE*(resting?1:0)+(FAMILIES.some(f=>tie(s,f)>=1)?REMEDY:0)+(st.helpedToday?ELIM_SIT:0);
   if(r.random()<rec){st.sick[p]=lvl-1;log(s,'better',p);}
  }else if(lvl===1){
   if(r.random()<(p===ELDER?ELDER_WORSEN:WORSEN)){st.sick[p]=2;st.everGrave.add(p);log(s,'gravelyIll',p);}
  }else if(p===ELDER){// gravely ill, and another bad night
   if(r.random()<ELDER_DEATH){st.gone.add(p);st.sick[p]=0;s.E[p]=2;s.riding.delete(p);log(s,'elderDies',CAMP[st.day]);}
   else if(!st.frail.has(p)){st.frail.add(p);log(s,'frail',p);}
  }
  if(st.sick[p])st.sickDays+=1;
  en(s,p,0);
 }
}

/* ---------- the one script ----------
   Each yield is a screen. The value sent back is the player's answer:
   choice -> option id; activity -> payload; story / strip -> anything. */
function* journey(s){
 const L=[];const say=(key,p)=>L.push([key,p||{}]);
 try{yield* road(s,L,say);}
 catch(e){
  if(e!==END)throw e;
  // The household cannot keep up. Nobody is harmed: the family stops with the stragglers, and the little ones are safe.
  yield {k:'story',id:'END'};
  yield {k:'story',id:'I2'};
 }
 return s;
}
function* road(s,L,say){
 const st=s.st;let shown=0;const cards=[];
 // Everything the stakes rules logged since the last screen becomes a line or a card, in the order it happened.
 function tell(){
  for(const [,kind,a,b] of st.cards.slice(shown)){
   if(kind==='familyWaits')say('N-waits',{family:a});
   else if(kind==='gap')say(a==='noDonkey'?'N-gapDonkey':a==='donkeyDies'?'N-gapLoad':'N-gap');
   else if(kind==='lighten')say(a==='food'?'R-GAP-food':'R-GAP-item',{item:a});
   else if(kind==='stormHurt')say('N-stormHurt',{name:a});
   else if(kind==='stormGoat')say('N-stormGoat');
   else if(kind==='nursed')say('R-FEVER-nurse',{name:a});
   else if(kind==='fall')say('N-fall',{name:a});
   else if(kind==='donkeyLame')say('N-donkeyLame');
   else if(kind==='donkeyDies'){mark(s,'donkey');cards.push({k:'story',id:'DONKEY'});}
   else if(kind==='goatDies'){mark(s,'goatDied');if(st.goatCards++===0)cards.push({k:'story',id:'GOAT'});else say('N-goatAgain');}
   else if(kind==='fallsSick')say(st.nursed===a?'N-sickNurse':'N-sick',{name:a});
   else if(kind==='better')say(st.sick[a]?'N-better':'N-well',{name:a});
   else if(kind==='gravelyIll'){mark(s,'grave',a);say('N-grave',{name:a});}
   else if(kind==='frail')say('N-frail',{name:a});
   else if(kind==='elderDies'){mark(s,'mourned',a);cards.push({k:'story',id:'MOURN'});}
  }
  shown=st.cards.length;
 }
 function* strip(id,extra){
  tell();
  // An animal lost at the day's end is told once, on its own quiet card, before the evening's lines.
  if(extra&&extra.cardsFirst)for(const c of cards.splice(0).filter(c=>c.id==='MOURN'?(cards.push(c),false):true))yield c;
  const lines=L.splice(0);if(lines.length)yield {k:'strip',id,lines,...(extra||{})};
  while(cards.length)yield cards.shift();
 }
 // The warning at two marks, once; at three the household cannot go on.
 function* checkEnd(ask){
  if(ask&&st.lag>=LAG_END-1&&!st.gapAsked){
   st.gapAsked=true;yield* strip('M'+s.day);
   const ch=yield* choose('GAP',['pushOn','lighten']);
   if(ch==='lighten'){
    const items=loose(s);
    if(items.length){dropExtra(s,items.at(-1));log(s,'lighten',items.at(-1));}
    else{s.D=Math.max(0,s.D-1);s.W=Math.max(0,s.W-2);log(s,'lighten','food');}
    st.lag-=2;
   }else say('R-GAP-pushOn');
   yield* strip('R-GAP',{result:'GAP'});
  }
  if(st.lag<LAG_END)return;
  st.ended={day:st.day,camp:CAMP[st.day]||'Elim'};log(s,'runEnds',st.ended.camp);
  yield* strip('END-strip');
  throw END;
 }
 function* choose(card,opts,extra){const pick=yield {k:'choice',card,opts,...(extra||{})};s.picks[card]=pick;return pick;}
 function* morning(){
  s.riding=new Set();s.handCarry=false;s.carried={};s.thirsty=new Set();const lifts={};
  const seated=new Set();
  for(;;){
   const p=PEOPLE.find(x=>s.E[x]===0&&!s.st.gone.has(x)&&!seated.has(x));if(!p)break;seated.add(p);
   if(p!=='Liora'){if(!s.sore.has(p))say('N-sore',{name:p});s.sore.add(p);}
   s.carriedDays+=1;mark(s,'carried',p);
   const noRide=!canRide(s);// a lame donkey takes no rider; without a donkey nobody rides
   if(!noRide&&s.extras.includes('seat')&&![...s.riding].some(x=>x!==p)){s.riding.add(p);s.events.push(['rides',p]);say('N-ride',{name:p});continue;}
   let fam=null;for(const f of ['Loom','Waterskins','Fold'])if(tieHelps(s,f)){fam=f;break;}
   if(!fam&&s.loomRefused&&!s.apartSaid){s.apartSaid=true;say('N-loomApart');}
   if(fam){s.events.push(['carriedBy',fam,p]);s.carried[p]=fam;(lifts[fam]??=[]).push(p);continue;}
   for(const [f,names] of Object.entries(lifts)){say(names.length>1?'N-carriedCart':'N-carriedBy',{family:f,name:names[0],names});delete lifts[f];}
   const seatOpts=(loose(s).length&&!noRide&&!s.riding.size?['leaveBundle']:[]).concat(['carryByHand']);
   // Automatic lifts share the morning summary; only a real bundle/seat decision interrupts it.
   let ch='carryByHand';const asked=seatOpts.length>1;
   if(asked){if(seatOpts.length===1)s.seatTold=true;yield* strip('M'+s.day);ch=yield* choose('SEAT',seatOpts,{who:p,noRide});}
   if(ch==='leaveBundle'&&loose(s).length){
    const item=loose(s).at(-1);dropExtra(s,item);s.riding.add(p);s.events.push(['leftBundle',item]);say('R-leaveBundle',{item,name:p});
   }else{
    // When nobody in the house has the strength, others in the camp take the weight; the rule is the same.
    const by=carrierFor(s,p);en(s,by,-1);fallBack(s,true);s.handCarry=true;s.carried[p]=by?'hand:'+by:'camp';s.events.push(['carriedByHand',p]);say(by?'R-carryByHand':'R-carryByCamp',{payer:by,name:p});
   }
   if(asked)yield* strip('R-SEAT'+s.day,{result:'SEAT'});
  }
  for(const [f,names] of Object.entries(lifts))say(names.length>1?'N-carriedCart':'N-carriedBy',{family:f,name:names[0],names});
  if(SEAT_AUTO&&s.extras.includes('seat')&&!s.riding.size&&canRide(s)){// the seat is for whoever tires
   const weary=PEOPLE.find(p=>s.E[p]===1);if(weary){s.riding.add(weary);s.events.push(['ridesWeary',weary]);say('N-rideWeary',{name:weary});}
  }
  yield* strip('M'+s.day);
 }
 function* dawn(day,road,arrive){
  s.day=day;s.hungry=new Set();s.loc=road;
  st.day=day;st.nursed=null;st.lagToday=0;
  if(day===4)st.lag=0;// everyone crossed the sea together: nobody is behind on the far shore
  if(day===7)st.lag=Math.max(0,st.lag-2);// the camp lay at Marah: the last families close up
  if(st.donkeyGone&&day<=7)addLag(s,1,'noDonkey');// each dawn without the donkey the camp draws further ahead
  for(const p of PEOPLE){const lvl=st.sick[p]||0;if(st.gone.has(p))continue;if(lvl>=2)s.E[p]=0;else if(lvl===1)s.E[p]=Math.min(s.E[p],1);}
  yield* morning();
  const r=st.rng;
  const storm=day===5&&r.random()<STORM_P;// drawn at first light, met on the road after the dawn card
  if(day===7&&r.random()<FEVER_P){// fever in the next tent
   yield* strip('M'+day);
   const ch=yield* choose('FEVER',['nurse','keepAway']);
   if(ch==='nurse'){s.ties.Waterskins+=1;st.nursed=payer(s,'Sarela');st.kind.push(['sickbed',st.nursed]);log(s,'nursed',st.nursed);}
   else say('R-FEVER-keepAway');
   yield* strip('R-FEVER',{result:'FEVER'});
  }
  yield* checkEnd(true);
  const pace=yield* choose('PACE'+day,paceOpts(s),{dawn:day});
  const was=s.place,lagWas=st.lag;st.pace=pace;st.hot=s.heat[day];
  walk(s,day,pace);say(pace==='ease'&&s.place===was?'R-easeRear':'R-'+pace);
  if(day===2)st.lag=Math.max(0,st.lag-1);// Etham's well: the camp halts, you close up
  donkey(s,paceStrain(s,day,pace));
  if((day===2||day===3)&&r.random()<(pace==='press'?FALL_PRESS:FALL_P)){const p=payer(s);en(s,p,-1);s.sore.add(p);log(s,'fall',p);}
  yield* checkEnd(false);
  yield* strip('R-PACE'+day,{result:'PACE'+day,walk:true});
  if(storm){// a sandstorm on the road
   const ch=yield* choose('STORM',['shelter','push']);
   say(ch==='shelter'?'R-STORM-shelter':'R-STORM-push');
   if(ch==='shelter'){s.late+=1;log(s,'storm','shelter');}// the camp walks on while you crouch: late to the next well
   else{
    for(const p of walkers(s))if(!st.gone.has(p)&&r.random()<0.15){if(s.E[p]>1)en(s,p,-1);if(p!=='Liora')s.sore.add(p);log(s,'stormHurt',p);}
    if(r.random()<0.35&&s.flock>3){s.flock-=1;s.strayed+=1;log(s,'stormGoat');}
    donkey(s,1);log(s,'storm','push');
   }
   yield* checkEnd(false);
   yield* strip('R-STORM',{result:'STORM'});
  }
  s.loc=arrive;
 }
 function* evening(card,opts){
  const ev=yield* choose(card,opts);
  if(ev==='bake'){bake(s,1,'good');say('R-eveBake');yield* strip('R-'+card,{result:card,night:true});}
  return ev;
 }
 function* night(th,short){supper(s,th,short,say);yield* strip('N'+s.day,{night:true});}
 // By the wells there is time and water: a short cloth is baked from a bowl before supper, at the camp's ovens.
 const elimSupper=()=>{
  st.pace='elim';st.hot=false;st.lag=0;
  const t=FAMILIES.reduce((n,f)=>n+s.ties[f],0);st.helpedToday=t>(st.tiesSeen??t);st.tiesSeen=t;// the family you helped today sits with your sick
  if(s.B<5&&s.D>=1){s.D-=1;s.B+=10;say('N-elimBake');}supper(s,new Set(),false,say);
  st.helpedToday=false;
 };

 yield {k:'story',id:'B0'};
 yield {k:'story',id:'S0'};
 // Day 1 Rameses -> Succoth
 const a1=yield {k:'activity',id:'A1'};
 s.extras=String(a1.pick).split(',');s.picks['D1.1']=a1.pick;
 if(s.extras.includes('spare'))s.cap=16;
 if(s.extras.includes('seat'))s.cap-=SEAT_CAP;// the seat takes a water skin's place
 s.W=s.cap;
 if(s.extras.includes('sack'))s.D+=SACK_BOWLS;
 if(s.extras.includes('loom'))s.ties.Loom+=2;
 const packg=a1.grade;s.grades.A1=packg;s.packGrade=packg;
 if(packg==='rough'){s.place=0;s.events.push(['roughPack']);}
 say('A1-'+packg);
 {const lead=payer(s),was=s.E[lead];st.pace='steady';st.hot=false;walk(s,1,'steady');donkey(s,0);if(s.E[lead]<was)say('T1-lead',{name:lead});}s.loc='succothRoad';
 yield {k:'strip',id:'T1',lines:L.splice(0).concat([['T1',{}]]),travel:true,ms:4000};
 s.loc='succoth';
 let ch=yield* choose('D1.2',['ride','staff','limp']);
 if(ch==='ride'){
  if(s.extras.includes('seat'))en(s,'Elior',+1);
  else{en(s,'Elior',+1);en(s,payer(s),-1);en(s,payer(s),-1);}
 }else if(ch==='staff'){en(s,'Aviel',-1);en(s,'Elior',+1);}
 else fallBack(s);
 say('R-D1.2-'+ch);yield* strip('R-D1.2',{result:'D1.2'});
 const a2=yield {k:'activity',id:'A2'};
 s.picks['A2.bowls']=String(a2.bowls);s.grades.A2=a2.grade;
 {const was=s.B;bake(s,Number(a2.bowls),a2.grade,true,a2.hard);const hard=Math.min(2*Number(a2.bowls),a2.hard??{good:0,fine:1,rough:2}[a2.grade]);
  say(hard===0?'A2-good':hard===1?'A2-fine':s.B===was?'A2-none':'A2-rough',{n:hard});}yield* strip('R-A2',{result:'A2'});
 yield* night(new Set());
 // Day 2 Succoth -> Etham
 yield* dawn(2,'ethamRoad','etham');
 {const late=s.late;s.W=Math.max(s.W,s.cap-2*s.late);s.late=0;say(late&&s.W<s.cap?'T2-arrivalLate':'T2-arrival');}yield* strip('T2-arrival');
 ch=yield* choose('D2.1',['pour','stitch','walkOn']);
 if(ch==='pour'){s.W-=3;s.ties.Waterskins+=1;st.kind.push(['skin']);}
 else if(ch==='stitch'){en(s,payer(s,'Sarela'),-1);s.ties.Waterskins+=1;st.kind.push(['skin']);}
 say('R-D2.1-'+ch);yield* strip('R-D2.1',{result:'D2.1'});
 if(s.house==='Elior'){// this house's own evening: the elder and the story of Joseph (Exodus 13:19)
  ch=yield* choose('H.Elior',['story','sleep'],{night:true});
  if(ch==='story'){en(s,'Elior',-1);s.steadier=true;}
  else en(s,PEOPLE.slice().sort((a,b)=>s.E[a]-s.E[b]||PEOPLE.indexOf(a)-PEOPLE.indexOf(b))[0],+1);
  say('R-H.Elior-'+ch);yield* strip('R-H.Elior',{result:'H.Elior',night:true});
 }
 yield* night(new Set());
 // Day 3 Etham -> the sea
 yield* dawn(3,'seaRoad','pihahiroth');
 say('T3-drink');
 let th=drink(s,3,3,say);yield* strip('T3-drink');
 const hold=yield* choose('D3.1',['gather','rope']);
 say('R-D3.1-'+hold);yield* strip('R-D3.1',{result:'D3.1'});
 yield {k:'story',id:'S3'};
 s.loc='sea';
 const a3=yield {k:'activity',id:'A3'};
 s.loc='shore';
 // As the crossing plays: a miss costs the one who called (the urgent call first); with the last families the crowd
 // costs the third caller as well (the load if it was packed rough, otherwise an adult).
 const order=hold==='gather'?['lamb','liora']:['liora','lamb'];
 const third=packg==='rough'&&loose(s).length?'bundle':'adult',canon=order.concat([third]);
 let lost;
 if(Array.isArray(a3.losses)){
  // Actual taps are authoritative: repeated flock misses never become an invented missed person.
  // The rear crowd is already represented by simultaneous calls in the activity.
  lost=[...new Set(a3.losses.filter(x=>canon.includes(x)))];
  lost.sort((x,y)=>canon.indexOf(x)-canon.indexOf(y));
 }else lost=order.slice(0,{good:0,fine:1,rough:2}[a3.grade]).concat(s.place===0?[third]:[]);
 s.grades.A3=lost.length===0?'good':lost.length===1?'fine':'rough';s.crossLosses=lost.slice();
 for(const x of lost){
  if(x==='lamb'&&s.flock>3){s.flock-=1;s.strayed+=1;s.events.push(['lambStrays']);mark(s,'goat');say('A3-lamb');}
  else if(x==='lamb'||x==='liora'){
   if(s.steadier){s.steadier=false;s.events.push(['heldFirm']);say('A3-held');}// the elder's story holds once
   else{s.shaken=true;mark(s,'afraid');say(x==='lamb'?'A3-floor':'A3-liora');}
  }
  else if(x==='bundle'&&loose(s).length){const it=loose(s)[0];dropExtra(s,it);say('A3-bundle',{item:it});}
  else{const p=payer(s);en(s,p,-1);s.sore.add(p);say('A3-adult',{name:p});}
 }
 if(!lost.length)say('A3-good');
 yield* strip('R-A3',{result:'A3'});
 const searcher=worker(s);const shore=hasEvent(s,'lambStrays')?(searcher?['search','foldBoys','leaveLamb']:['foldBoys','leaveLamb']):['sing','bake','waterFlock'];
 ch=yield* choose('D3.2',shore);
 if(ch==='search'){s.flock+=1;s.strayed-=1;en(s,searcher,-1);}
 else if(ch==='foldBoys'){s.flock+=1;s.strayed-=1;s.oweFold=true;}
 else if(ch==='sing'){s.shaken=false;en(s,'Sarela',+1);}
 else if(ch==='bake')bake(s,1,'good');
 else if(ch==='waterFlock'){s.W-=2;s.fstep=-1;}
 if(ch==='search'||ch==='foldBoys')s.marks=s.marks.filter(m=>!(m.kind==='goat'&&m.day===3));
 if(ch==='sing')s.marks=s.marks.filter(m=>m.kind!=='afraid');
 say('R-D3.2-'+ch,{payer:searcher});yield* strip('R-D3.2',{result:'D3.2'});
 yield* night(th);
 yield {k:'story',id:'I1'};
 // Chapter II: Shur, days 4-6
 s.day=4;s.hungry=new Set();s.thirsty=new Set();s.loc='shur1';
 s.rule=yield* choose('D4.1',['full','half']);
 for(const day of [4,5,6]){
  yield* dawn(day,'shur'+(day-3),'shur'+(day-3));
  const need=s.rule==='full'?4:3;
  if(s.rule==='half')en(s,day%2===0?'Talven':'Sarela',-1);
  let watered=false;
  if(day===4){
   const f=falterOf(s);en(s,f,-1);s.falterNow=f;
   yield {k:'strip',id:'T4-noon',lines:[['T4-noon',{name:f}]],travel:true,ms:3000};
   const carrier=carrierFor(s,f);
   ch=yield* choose('D4.2',(canRide(s)&&!s.riding.size?['ride']:[]).concat(['carry'],s.W>=1?['shade']:[]));
   if(ch==='ride'){s.riding.add(f);if(s.extras.includes('seat'))en(s,f,+1);else{en(s,f,+1);s.fstep+=1;}}
   else if(ch==='carry'){en(s,f,+1);en(s,carrier,-1);s.carried[f]=carrier?'hand:'+carrier:'camp';}
   else{en(s,f,+1);s.W-=1;fallBack(s);}
   say(ch==='carry'&&!carrier?'R-carryByCamp':'R-D4.2-'+ch,{name:f,carrier});yield* strip('R-D4.2',{result:'D4.2'});
  }
  if(day===5&&s.house==='Doran'){// this house's own morning: a ewe lambs by the road
   const lambCarrier=worker(s,'Aviel');
   ch=yield* choose('H.Doran',lambCarrier?['wait','carry','give']:['wait','give']);
   if(ch==='wait'){s.flock+=1;fallBack(s);}
   else if(ch==='carry'){s.flock+=1;en(s,lambCarrier,-1);}
   else{s.flock-=1;s.gaveEwe+=1;s.ties.Fold+=1;st.kind.push(['ewe']);}
   say('R-H.Doran-'+ch,{payer:lambCarrier});yield* strip('R-H.Doran',{result:'H.Doran'});
  }
  if(day===5){
   const herd=drivers(s);
   ch=yield* choose('D5.1',(s.W>=2?['waterFlock']:[]).concat(herd.length?['drive']:[],s.oweFold?['letLag']:['foldHerd']));
   if(ch==='waterFlock'){s.W-=2;s.fstep=0;watered=true;}
   else if(ch==='drive'){for(const p of herd)en(s,p,-1);watered=true;}
   else if(ch==='foldHerd'){s.oweFold=true;watered=true;}
   say('R-D5.1-'+ch);yield* strip('R-D5.1',{result:'D5.1'});
  }
  if(day===6){
   ch=yield* choose('D6.1',(s.W>=3?['share']:worker(s,'Sarela',[],true)?['carryBaby']:[]).concat(['keep'],watered?[]:['flockShare']),{need:need+(s.heat[6]?1:0)});
   let by=null;
   if(ch==='share'){s.W-=3;s.ties.Loom+=1;fallBack(s);}
   else if(ch==='flockShare'){s.ties.Loom+=1;s.fstep+=1;}
   else if(ch==='carryBaby'){s.ties.Loom+=1;by=worker(s,'Sarela',[],true);en(s,by,-1);}
   if(ch!=='keep')st.kind.push(['baby']);
   else s.loomRefused=true;
   say('R-D6.1-'+ch,{payer:by});yield* strip('R-D6.1',{result:'D6.1'});
  }
  s.W=Math.max(0,s.W);
  th=drink(s,day,need,say);
  if(!L.length)say(s.rule==='half'?'N-drinkHalf':'N-drinkFull');
  yield* strip('T'+day+'-drink');
  flockDay(s,watered||(s.place===2&&day===4),say);
  yield* strip('F'+day,{cardsFirst:true});
  if(day===4&&s.house==='Daliya'){// this house's own evening: neighbors smell the baking
   ch=yield* choose('H.Daliya',s.D>=1?['give','trade','keep']:['keep'],{night:true});
   if(ch==='give'){s.D-=1;s.ties.Waterskins+=1;st.kind.push(['dough']);}
   else if(ch==='trade'){s.D-=1;s.W=Math.min(s.cap,s.W+3);}
   say('R-H.Daliya-'+ch);yield* strip('R-H.Daliya',{result:'H.Daliya',night:true});
  }
  if(day<6){
   const ev=yield* evening('EVE'+day,(s.D>=1?['bake']:[]).concat(s.B>=4?['short']:[],['full']));
   yield* night(th,ev==='short');
  }
 }
 // Marah (provision, the same for every household)
 s.loc='marahRoad';
 yield {k:'strip',id:'T6',lines:[['T6',{}]],travel:true,ms:4000};
 s.loc='marah';
 yield {k:'story',id:'S6-bitter'};
 for(const p of PEOPLE)en(s,p,+1);
 s.fstep=0;s.thirsty=new Set();
 yield {k:'story',id:'S6'};
 const a4=yield {k:'activity',id:'A4'};
 s.grades.A4=a4.grade;
 let draws=lineDraws(s)+{good:1,fine:0,rough:-1}[a4.grade];s.late=0;
 s.picks['A4.order']=a4.loomFirst?'loomFirst':'oursFirst';
 if(a4.loomFirst){draws-=2;s.ties.Loom+=1;s.loomRefused=false;st.kind.push(['line']);}
 s.W=Math.min(s.cap,s.W+Math.max(1,draws)*2);
 say(a4.loomFirst?'A4-resultLoom':'A4-result',{W:s.W});if(a4.loomFirst)say('A4-loomFirst');
 if(s.oweFold){
  s.picks['A4.fold']=a4.payFold?'payFold':'skip';
  if(a4.payFold){s.oweFold=false;const by=payer(s);en(s,by,-1);s.ties.Fold+=1;say('A4-paidFold',{payer:by});}
 }
 yield* strip('R-A4',{result:'A4'});
 const ev6=yield* evening('EVE6',s.D>=1?['bake','full']:['full'].concat(s.B>=4?['short']:[]));
 yield* night(new Set(),ev6==='short');
 // Day 7 Marah -> Elim
 yield* dawn(7,'elimRoad','elimRoad');
 th=drink(s,7,4,say);
 yield* strip('T7-drink');
 s.W=s.cap;s.fstep=0;s.thirsty=new Set();
 if(s.oweFold){
  if(s.flock>3){s.flock-=1;s.givenGoat+=1;s.events.push(['debtLamb']);mark(s,'debt');s.debt='goat';}
  else{en(s,payer(s),-1);s.events.push(['debtWork']);s.debt='work';}
  s.oweFold=false;
 }
 s.atElim=true;s.riding.clear();s.carried={};s.loc='elim';// shown only: at the wells nobody is riding any more
 s.elimDays=3-(s.late?1:0);s.late=0;
 yield {k:'story',id:'S7'};
 elimSupper();yield* strip('N'+s.day,{night:true});
 // Free days at Elim: real days, a supper each evening. Arriving late costs the first one.
 const jobs=['rest','liora','tradeGoat','help','moveUp'];
 if(s.elimDays<3){s.day=8;say('N-elimLate');yield* strip('ELIM-late',{night:false});}
 for(let slot=0;slot<s.elimDays;slot++){
  s.day=8+(3-s.elimDays)+slot;s.hungry=new Set();
  let offer=jobs.filter(j=>!(j==='tradeGoat'&&(s.flock<=3||s.elimTraded)));
  offer=offer.filter(j=>j!=='liora'||s.shaken);
  offer=offer.filter(j=>j!=='moveUp'||s.place<2);
  const job=yield {k:'choice',card:'ELIM',opts:offer,slot,days:s.elimDays};
  (s.picks.ELIM??=[]).push(job);
  const fam=FAMILIES.slice().sort((a,b)=>s.ties[a]-s.ties[b])[0];
  const by=payer(s);say('A5-'+job,{family:fam,payer:by});
  if(job==='rest'){for(const p of PEOPLE)en(s,p,+1);s.sore=new Set();}
  else if(job==='liora'){s.shaken=false;en(s,'Liora',+1);}
  else if(job==='tradeGoat'){s.flock-=1;s.tradedGoat+=1;s.D+=1;s.elimTraded=true;}
  else if(job==='help'){s.ties[fam]+=1;en(s,payer(s),-HELP_COST);if(fam==='Loom')s.loomRefused=false;st.kind.push(['day',fam]);}
  else if(job==='moveUp'){s.place=Math.min(2,s.place+1);en(s,payer(s),-MOVEUP_COST);}
  yield* strip('R-ELIM'+slot,{result:'ELIM'});// the day's work, told by itself
  elimSupper();
  yield* strip('N'+s.day,{night:true});// then the evening
 }
 s.W=s.cap;
 // A place pitched at the wells is not held on the road without neighbours.
 if(!FAMILIES.some(f=>tie(s,f)>=1))s.place=0;
 yield {k:'story',id:'I2'};
}

/* ---------- end card and chapter-3 carryover ---------- */
// Draws at Marah before the turn's own speed: your place, the families who hold it for you, the one who draws ahead, and lateness.
function lineDraws(s){return {0:4,1:6,2:8}[s.place]+HELP_DRAW*FAMILIES.filter(f=>tie(s,f)>=1).length-(s.loomRefused?REFUSE_DRAW:0)-s.late;}
function carry(s){
 const suppers=Math.floor(s.B/5)+2*s.D;
 return {house:s.house,place:PLACE[s.place],suppers,flock:s.flock,flock0:s.flock0,
  strength:PEOPLE.reduce((n,p)=>n+s.E[p],0),ties:FAMILIES.filter(f=>tie(s,f)>=1).length,
  together:FAMILIES.filter(f=>tie(s,f)>=2),helped:FAMILIES.filter(f=>tie(s,f)===1),apart:s.loomRefused?['Loom']:[],tradedGoat:s.tradedGoat,left:s.left.slice(),shaken:s.shaken,sore:[...s.sore].sort(),
  carriedDays:s.carriedDays,givenGoat:s.givenGoat,strayed:s.strayed,rearDays:s.rearDays,extras:s.extras.slice()};
}
function headlines(s){
 const c=carry(s);
 const hl1={front:'Close behind the cloud',middle:'In the thick of the camp',rear:'With the last families'}[c.place];
 let hl2;
 if(c.ties===0)hl2='The house that kept to itself';
 else if(c.ties>=3||c.together.length>=2)hl2='The house that carried others';
 else if(c.carriedDays>=2&&c.left.length)hl2='The house that lightened its load';
 else if(c.flock>=c.flock0&&c.carriedDays===0&&c.place!=='rear')hl2='The house that kept every lamb';
 else if(c.place==='rear'&&c.ties>=1)hl2='The house that walked at the back, together';
 else if(c.ties===0)hl2='The house that kept to itself';
 else if(c.carriedDays>=2)hl2='The house that walked tired';
 else if(c.flock<c.flock0)hl2='The house that gave up a goat';
 else hl2='The house that kept going';
 let hl3;
 if(c.left.length)hl3='left_by_road';
 else if(c.carriedDays)hl3='someone_carried';
 else if(c.strayed)hl3='goat_gone';
 else if(c.givenGoat)hl3='goat_debt';
 else if(c.shaken)hl3='liora_afraid';
 else if(s.thirstyDays)hl3='thirsty_day';
 else hl3='no_hard_day';
 const st=s.st;
 if(st.ended)return ['The road ended at '+st.ended.camp,'The house that could not keep up','run_ended'];
 if(st.gone.size)hl3='mourned';
 else if(st.donkeyGone)hl3='donkey_died';
 else if(st.goatsDied&&['goat_gone','goat_debt','liora_afraid','thirsty_day','no_hard_day'].includes(hl3))hl3='goat_died';
 else if(st.everGrave.size&&hl3==='no_hard_day')hl3='someone_gravely_ill';
 return [hl1,hl2,hl3];
}
function score(s){// the simulator's readiness score (dominance tests only; never shown)
 const c=carry(s),st=s.st;
 const v=2*Math.min(c.suppers,8)+3*c.flock+c.strength+2*c.ties+1*c.together.length+3*PLACE.indexOf(c.place)-2*c.left.length-3*(c.shaken?1:0)-2*c.carriedDays-3*c.sore.length;
 return v+TIE_STAKES*c.ties-12*st.gone.size-5*st.frail.size-3*st.goatsDied-8*(st.donkeyGone?1:0)-2*PEOPLE.filter(p=>st.sick[p]).length-(st.ended?40:0);
}
/* The score the journal page shows. */
function survivors(s){
 const st=s.st,c=carry(s),people=5-st.gone.size,well=PEOPLE.filter(p=>!st.gone.has(p)&&!st.sick[p]&&!st.frail.has(p)).length;
 return {people,well,flock:c.flock,donkey:!st.donkeyGone,suppers:c.suppers,friends:c.ties,ended:!!st.ended,
  points:50*people+10*well+10*c.flock+(st.donkeyGone?0:30)+5*Math.min(c.suppers,8)+45*c.ties+(st.ended?0:100)};
}
function softFailed(s){const c=carry(s);return {rear:c.place==='rear',carried:c.carriedDays>0,goat:c.flock<c.flock0,left:c.left.length>0};}

/* Drive the script with a simulator policy, in the simulator's own order of random draws. */
function run(policy,grades,house='Elior',seed=0,onNode){
 const rng=PyRandom(seed),s=newState(house,rng,seed),it=journey(s);
 const P=(card,opts)=>policy(card,opts,s),g=k=>grades(k,rng);
 let r=it.next();
 while(!r.done){
  const n=r.value;let input;
  if(onNode)onNode(n,s);
  if(n.k==='choice')input=P(n.card==='ELIM'?'ELIM':n.card,n.opts);
  else if(n.k==='activity'){
   if(n.id==='A1'){const pick=P('D1.1',COMBOS);input={pick,grade:g('A1')};}
   else if(n.id==='A2'){const bowls=P('A2.bowls',['1','2']);input={bowls,grade:g('A2')};}
   else if(n.id==='A3')input={grade:g('A3')};
   else if(n.id==='A4'){const grade=g('A4'),loomFirst=P('A4.order',['loomFirst','oursFirst'])==='loomFirst';
    input={grade,loomFirst};if(s.oweFold)input.payFold=P('A4.fold',['payFold','skip'])==='payFold';}
  }
  r=it.next(input);
 }
 return s;
}
return {able,worker,carrierFor,drivers,PEOPLE,WALKERS_COST,THIRST,FEED,EXTRAS,FAMILIES,HOUSEHOLDS,PLACE,COMBOS,SACK_BOWLS,HEAT_DAY,HEAT_P,TROUGH_PLUS,SEAT_CAP,PyRandom,newState,en,payer,tie,tieHelps,lineDraws,score,survivors,previewPace,previewSupper,paceStrain,canRide,falterOf,donkeyWord,ELDER,CHILDREN,CAMP,LAG_END,DONKEY_LAME,walkers,paceOpts,loose,journey,carry,headlines,softFailed,run};
});
