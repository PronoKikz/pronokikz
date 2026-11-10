// Pronokikz : modèle statistique + apprentissage + cotes du marché (facultatif).
// Données : forme (5 et 10 derniers), domicile/extérieur, buts marqués/encaissés, attaque/défense,
// confrontations directes (saison en cours + précédente), jours de repos.
// Apprentissage : chaque prono est enregistré, comparé au résultat réel, et les écarts par championnat
// (buts totaux, avantage du domicile) corrigent progressivement les prochains calculs.
// Absences, enjeux : ajustés à la main dans expert.js (champ aj).
try { require('dotenv').config(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const fs=require('fs');
const K=process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_KEY,OD=process.env.ODDS_API_KEY,CODES=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL,PPL,DED,ELC').split(',');
if(!K){console.error('Clé Football Data manquante : renseigne FOOTBALL_DATA_API_KEY (ou FOOTBALL_DATA_KEY) dans .env ou dans les secrets GitHub.');process.exit(1)}
const SPORT={FL1:'soccer_france_ligue_one',PL:'soccer_epl',PD:'soccer_spain_la_liga',SA:'soccer_italy_serie_a',BL1:'soccer_germany_bundesliga',CL:'soccer_uefa_champs_league',PPL:'soccer_portugal_primeira_liga',DED:'soccer_netherlands_eredivisie',ELC:'soccer_efl_champ'};
const get=async(p,n=0)=>{const r=await fetch('https://api.football-data.org/v4'+p,{headers:{'X-Auth-Token':K}});if(r.status===429&&n<3){console.log('limite atteinte, pause 65 s');await new Promise(z=>setTimeout(z,65000));return get(p,n+1)}if(!r.ok)throw new Error(p+' -> '+r.status);return r.json()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tz={timeZone:'Europe/Paris'},day=d=>new Intl.DateTimeFormat('en-CA',tz).format(d),off=n=>new Date(Date.now()+n*864e5);
const nz=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const same=(a,b)=>{a=nz(a);b=nz(b);return !!a&&!!b&&(a.includes(b)||b.includes(a))};
const { model } = require('./predictor');
const r3=x=>Math.round(x*1000)/1000,r=(x,y)=>y?x/y:0,sum=a=>a.reduce((s,v)=>s+v,0);
// Poisson + correction Dixon-Coles ; sortie : 1N2, BTTS, +1,5, +2,5, scores les plus probables
const HL=70,fin=m=>m.status==='FINISHED'&&m.score&&m.score.fullTime&&m.score.fullTime.home!=null;
function stats(ms){const now=Date.now(),T={},t=id=>T[id]||(T[id]={w:0,gf:0,ga:0,pts:0,hw:0,hgf:0,hga:0,hpts:0,aw:0,agf:0,aga:0,apts:0,last:[],lastDate:0,g:0});let SH=0,SA=0,SW=0;
 ms.filter(fin).sort((a,b)=>a.utcDate.localeCompare(b.utcDate)).forEach(m=>{
  const hg=m.score.fullTime.home,ag=m.score.fullTime.away,H=t(m.homeTeam.id),A=t(m.awayTeam.id),ph=hg>ag?3:hg==ag?1:0,pa=ag>hg?3:ag==hg?1:0,dt=new Date(m.utcDate).getTime(),w=Math.pow(.5,(now-dt)/864e5/HL);
  H.w+=w;H.gf+=w*hg;H.ga+=w*ag;H.pts+=w*ph;H.hw+=w;H.hgf+=w*hg;H.hga+=w*ag;H.hpts+=w*ph;H.last.push(ph);H.lastDate=dt;H.g++;
  A.w+=w;A.gf+=w*ag;A.ga+=w*hg;A.pts+=w*pa;A.aw+=w;A.agf+=w*ag;A.aga+=w*hg;A.apts+=w*pa;A.last.push(pa);A.lastDate=dt;A.g++;
  SH+=w*hg;SA+=w*ag;SW+=w});
 T.avg={h:r(SH,SW)||1.5,a:r(SA,SW)||1.2};return T}
const meetsOf=ms=>ms.filter(fin).map(m=>({h:m.homeTeam.id,a:m.awayTeam.id,hg:m.score.fullTime.home,ag:m.score.fullTime.away,t:new Date(m.utcDate).getTime()}));
function h2h(meets,hid,aid){const L=meets.filter(m=>(m.h===hid&&m.a===aid)||(m.h===aid&&m.a===hid)).sort((a,b)=>b.t-a.t).slice(0,6);let w=0,d=0,l=0,gd=0;
 L.forEach(m=>{const hg=m.h===hid?m.hg:m.ag,ag=m.h===hid?m.ag:m.hg;hg>ag?w++:hg==ag?d++:l++;gd+=hg-ag});return{w,d,l,n:L.length,gd:L.length?gd/L.length:0}}
// apprentissage : correction progressive par championnat (buts totaux, avantage du domicile)
function calib(hist,lg){const a=hist.filter(e=>e.lg===lg&&e.x),n=a.length;if(n<20)return{n,gf:1,hf:1};
 const sa=sum(a.map(e=>e.r[0]+e.r[1])),sp=sum(a.map(e=>e.x[0]+e.x[1])),ha=sum(a.map(e=>e.r[0])),hp=sum(a.map(e=>e.x[0]));if(!sa||!sp||!hp)return{n,gf:1,hf:1};
 const k=n/(n+40),cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 return{n,gf:r3(1+cl(sa/sp-1,-.15,.15)*k),hf:r3(1+cl((ha/sa)/(hp/sp)-1,-.1,.1)*k)}}
// Calibration apprise sur l'historique : facteur de nuls et « température » (>1 = plus de contraste entre favori et outsider).
function temp(hist){const a=hist.filter(e=>(e.q||e.p)&&e.r),n=a.length;if(n<15)return{n,T:1,dr:1};
 const pd=a.reduce((s,e)=>s+(e.q||e.p)[1],0)/n,ad=a.filter(e=>e.r[0]===e.r[1]).length/n,k=n/(n+60),cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const dr=1+cl((ad/(pd||.25))-1,-.25,.25)*k;let best=1,bl=1e9;
 for(let T=.8;T<=1.6001;T+=.02){let l=0;a.forEach(e=>{const q=e.q||e.p,o=e.r[0]>e.r[1]?0:e.r[0]==e.r[1]?1:2,w=[q[0],q[1]*dr,q[2]].map(p=>Math.pow(Math.max(p,1e-6),T)),s=w[0]+w[1]+w[2];l-=Math.log(w[o]/s)});if(l<bl){bl=l;best=T}}
 return{n,T:r3(1+(best-1)*k),dr:r3(dr)}}
const adj1x2=(x,TT)=>{const w=[x.p1,x.pN*TT.dr,x.p2].map(p=>Math.pow(Math.max(p,1e-6),TT.T)),s=w[0]+w[1]+w[2];return w.map(v=>v/s)};
function predict(H,A,avg,when,hh,cal){
 const P=3,mid=(avg.h+avg.a)/2,sh=(s,n,a)=>(s+P*a)/(n+P);
 const mix=(venue,n,tot,w,ref,venRef)=>.5*sh(venue,n,venRef)/venRef+.5*sh(tot,w,ref)/ref;
 const attH=mix(H.hgf,H.hw,H.gf,H.w,mid,avg.h),defH=mix(H.hga,H.hw,H.ga,H.w,mid,avg.a);
 const attA=mix(A.agf,A.aw,A.gf,A.w,mid,avg.a),defA=mix(A.aga,A.aw,A.ga,A.w,mid,avg.h);
 let lh=avg.h*attH*defA,la=avg.a*attA*defH;
 const p5=x=>x.last.slice(-5),p10=x=>x.last.slice(-10),mean=(a,d)=>a.length?sum(a)/a.length:d,fg=x=>.6*mean(p5(x),1.35)+.4*mean(p10(x),1.35);
 const R=(x,v,vb)=>(.20*(r(x.pts,x.w)-1.35)+.20*(fg(x)-1.35)+.15*(v-vb)+.15*r(x.gf-x.ga,x.w)*.8)/.70;
 let d=R(H,H.hw>=2?r(H.hpts,H.hw):r(H.pts,H.w),1.5)-R(A,A.aw>=2?r(A.apts,A.aw):r(A.pts,A.w),1.1);
 if(hh.n>=2)d+=.10*Math.max(-3,Math.min(3,hh.gd));
 lh*=Math.exp(.08*d);la*=Math.exp(-.08*d);
 const rest=x=>x.lastDate?(when-x.lastDate)/864e5:7;if(rest(H)<3)lh*=.96;if(rest(A)<3)la*=.96;
 lh=Math.max(.3,lh*cal.gf*cal.hf);la=Math.max(.3,la*cal.gf/cal.hf);
 return{...model(lh,la),fm:[sum(p5(H)),sum(p5(A))],f10:[sum(p10(H)),sum(p10(A))],ng:[H.g,A.g],hh:[hh.w,hh.d,hh.l],x:[Math.round(lh*100)/100,Math.round(la*100)/100]}}
function aggregate(hist){const z=()=>({n:0,h:0,b:0,no:0,o:0,br:0,ll:0}),G={tot:z(),lg:{},bk:{'moins de 45 %':{n:0,h:0},'45 à 60 %':{n:0,h:0},'plus de 60 %':{n:0,h:0}}},E=[0,.2,.35,.5,.65,.8,1.01],cal=E.slice(0,-1).map((lo,i)=>({a:lo,b:Math.min(1,E[i+1]),n:0,sp:0,h:0}));
 hist.forEach(e=>{const[p1,pN,p2]=e.p,o=e.r[0]>e.r[1]?0:e.r[0]==e.r[1]?1:2,mx=Math.max(p1,pN,p2),hit=e.p.indexOf(mx)===o?1:0,
  bt=(e.b>=.5)==(e.r[0]>0&&e.r[1]>0)?1:0,br=e.p.reduce((s,p,i)=>s+(p-(i===o?1:0))**2,0),ll=-Math.log(Math.max(1e-6,e.p[o]));
  [G.tot,G.lg[e.lg]||(G.lg[e.lg]=z())].forEach(t=>{t.n++;t.h+=hit;t.b+=bt;t.br+=br;t.ll+=ll;if(e.o!=null){t.no++;t.o+=(e.o>=.5)==(e.r[0]+e.r[1]>2)?1:0}});
  const k=mx<.45?'moins de 45 %':mx<=.6?'45 à 60 %':'plus de 60 %';G.bk[k].n++;G.bk[k].h+=hit;
  e.p.forEach((p,i)=>{const c=cal.find(c=>p>=c.a&&p<c.b);if(c){c.n++;c.sp+=p;c.h+=i===o?1:0}})});
 G.cal=cal.filter(c=>c.n>0).map(c=>({a:c.a,b:c.b,n:c.n,p:r3(c.sp/c.n),f:r3(c.h/c.n)}));return G}
async function oddsFor(code){const res=await fetch(`https://api.the-odds-api.com/v4/sports/${SPORT[code]}/odds/?apiKey=${OD}&regions=eu&markets=h2h,totals&oddsFormat=decimal`);if(!res.ok)throw new Error('odds '+code+' -> '+res.status);
 return(await res.json()).map(e=>{const acc={p:[0,0,0],n:0,o:0,on:0};
  (e.bookmakers||[]).forEach(b=>(b.markets||[]).forEach(mk=>{
   if(mk.key==='h2h'){const g=n=>{const x=mk.outcomes.find(o=>o.name===n);return x?1/x.price:0},a=[g(e.home_team),g('Draw'),g(e.away_team)],s=a[0]+a[1]+a[2];if(s&&a[0]&&a[1]&&a[2]){for(let i=0;i<3;i++)acc.p[i]+=a[i]/s;acc.n++}}
   if(mk.key==='totals'){const ov=mk.outcomes.find(o=>o.name==='Over'&&o.point===2.5),un=mk.outcomes.find(o=>o.name==='Under'&&o.point===2.5);if(ov&&un){acc.o+=(1/ov.price)/(1/ov.price+1/un.price);acc.on++}}}));
  return{h:e.home_team,a:e.away_team,p:acc.n?acc.p.map(x=>x/acc.n):null,o:acc.on?acc.o/acc.on:null}})}
// Buteur : priorité à l'analyse OpenAI, avec repli statistique si la clé API est absente ou l'IA indisponible.
const { pickScorer } = require('./scorer');
const { buildHistoryEntry } = require('./history');
const { pickScorerWithAI } = require('./ai_scorer');
// Avis d'experts : lus dans expert.js et appliqués AVANT le coup d'envoi seulement
let EXPL=[];try{EXPL=require('vm').runInNewContext(fs.readFileSync('expert.js','utf8')+';EXPERTS')||[]}catch(e){console.log('expert.js illisible : '+e.message)}
function applyExperts(m){const e=EXPL.find(x=>(nz(m.home).includes(x.h)||x.h.includes(nz(m.home)))&&(nz(m.away).includes(x.a)||x.a.includes(nz(m.away))));
 let[p1,pN,p2]=m.b0||[m.p1,m.pN,m.p2];
 if(e&&e.aj){const k=Math.max(-.2,Math.min(.2,e.aj*.1));p1=Math.max(.02,p1+k);p2=Math.max(.02,p2-k);const t=p1+pN+p2;p1/=t;pN/=t;p2/=t}
 const s=[['1',p1],['N',pN],['2',p2]].sort((a,b)=>b[1]-a[1])[0],d=[['1N',p1+pN],['N2',pN+p2],['12',p1+p2]].sort((a,b)=>b[1]-a[1])[0];
 return{...m,b0:m.b0||[m.p1,m.pN,m.p2],p1:r3(p1),pN:r3(pN),p2:r3(p2),fin:e&&e.fin?e.fin:(s[1]>=.55?s[0]:d[0]),ex:(e&&e.ex)||'',bt:e&&e.bt?e.bt:m.bt,sv:1}}
(async()=>{
 const today=day(new Date()),from=day(off(-3)),last=day(off(6)),now=new Date(),S=now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
 const pj=fs.existsSync('data.json')?JSON.parse(fs.readFileSync('data.json')):{};
 const prev=pj.matches||[],hist=pj.hist||[],old=Object.fromEntries(prev.map(m=>[m.id,m])),TT=temp(hist);
 const fx=(await get(`/matches?dateFrom=${from}&dateTo=${off(7).toISOString().slice(0,10)}`)).matches
  .filter(f=>CODES.includes(f.competition.code)&&day(new Date(f.utcDate))>=from&&day(new Date(f.utcDate))<=last);
 const st={},sc={},oc={},CAL={},out=[],seen=new Set(),cal=lg=>CAL[lg]||(CAL[lg]=calib(hist,lg));
 const loadStats=async c=>{if(!st[c]){try{await sleep(6500);const cur=(await get('/competitions/'+c+'/matches?status=FINISHED')).matches||[];st[c]=stats(cur);let pm=[];
   try{await sleep(6500);pm=(await get('/competitions/'+c+'/matches?season='+(S-1)+'&status=FINISHED')).matches||[]}catch(e){console.log('saison précédente '+c+' : '+e.message)}
   st[c].meets=[...meetsOf(cur),...meetsOf(pm)]}catch(e){console.log('stats '+c+' : '+e.message);st[c]={}}}return st[c]};
 const loadScorers=async c=>{if(!sc[c]){try{await sleep(6500);sc[c]=(await get('/competitions/'+c+'/scorers?limit=100')).scorers||[]}catch(e){console.log('buteurs '+c+' : '+e.message);sc[c]=[]}}return sc[c]};
 for(const f of fx){
  const c=f.competition.code,started=new Date(f.utcDate).getTime()<=Date.now()||!['TIMED','SCHEDULED'].includes(f.status);let m=old[f.id];
  if(!m&&started)continue;                       // aucun prono n'est créé après le coup d'envoi
  if(m&&!m.lock&&started)m={...m,lock:1};        // gel définitif au coup d'envoi : plus aucune modification du prono
  if(!m){
   const T=await loadStats(c),H=T[f.homeTeam.id],A=T[f.awayTeam.id];if(!H||!A||H.g<3||A.g<3)continue;
   const x=predict(H,A,T.avg,new Date(f.utcDate).getTime(),h2h(T.meets||[],f.homeTeam.id,f.awayTeam.id),cal(f.competition.name));
   const cq=adj1x2(x,TT).map(r3);
   m={id:f.id,lg:f.competition.name,home:f.homeTeam.shortName||f.homeTeam.name,away:f.awayTeam.shortName||f.awayTeam.name,
    p1:cq[0],pN:cq[1],p2:cq[2],btts:r3(x.btts),o25:r3(x.o25),o15:r3(x.o15),scs:x.scs,fm:x.fm,f10:x.f10,ng:x.ng,hh:x.hh,x:x.x,q:[r3(x.p1),r3(x.pN),r3(x.p2)],
    raw:{p1:cq[0],pN:cq[1],p2:cq[2],o25:r3(x.o25)},b0:cq.slice(),
    ia:'Estimation : forme, niveau, domicile/extérieur, attaque/défense, confrontations, repos.'}}
  if(!m.lock){
   // 1) cotes du marché (une fois par jour)
   if(OD&&SPORT[c]&&m.mkAt!==today){
    if(!oc[c]){try{oc[c]=await oddsFor(c)}catch(e){console.log(e.message);oc[c]=[]}}
    const ev=oc[c].find(e=>(same(e.h,f.homeTeam.name)||same(e.h,f.homeTeam.shortName))&&(same(e.a,f.awayTeam.name)||same(e.a,f.awayTeam.shortName)));
    m={...m,mkAt:today};
    if(ev&&ev.p){const raw=m.raw||{p1:m.p1,pN:m.pN,p2:m.p2,o25:m.o25};
     m={...m,raw,mk:1,mkp:ev.p.map(r3),b0:[r3(.5*raw.p1+.5*ev.p[0]),r3(.5*raw.pN+.5*ev.p[1]),r3(.5*raw.p2+.5*ev.p[2])],o25:ev.o!=null&&raw.o25!=null?r3(.5*raw.o25+.5*ev.o):m.o25}}}
   // 2) buteur probable : IA OpenAI si OPENAI_API_KEY est configurée, sinon modèle statistique.
   if(m.btp===undefined||(process.env.OPENAI_API_KEY&&m.btSource!=='openai'&&!m.lock)){
    if(m.x){
     const T=await loadStats(c),H=T[f.homeTeam.id],A=T[f.awayTeam.id],players=await loadScorers(c);
     let aiPick=null;
     if(H&&A&&process.env.OPENAI_API_KEY){
      try{aiPick=await pickScorerWithAI(players,H,A,m.x,f.homeTeam.id,f.awayTeam.id,{home:m.home,away:m.away})}
      catch(e){console.log('IA buteur indisponible pour '+m.home+' - '+m.away+' : '+e.message)}
     }
     const fallback=H&&A?pickScorer(players,H,A,m.x,f.homeTeam.id,f.awayTeam.id):{bt:'',btp:0};
     m={...m,...(aiPick||fallback),btSource:aiPick?'openai':(fallback.bt?'statistical':'none')};
    } else m={...m,bt:'',btp:0,btSource:'none'}
   }
   // 3) avis d'experts (aj, fin, buteur manuel) puis horodatage du prono
   m={...applyExperts(m),pt:new Date().toISOString()}}
  const ft=f.score&&f.score.fullTime;
  out.push({...m,d:day(new Date(f.utcDate)),h:new Intl.DateTimeFormat('fr-FR',{...tz,hour:'2-digit',minute:'2-digit'}).format(new Date(f.utcDate)),
   hc:f.homeTeam.crest||'',ac:f.awayTeam.crest||'',r:(f.status==='FINISHED'&&ft&&ft.home!=null)?[ft.home,ft.away]:null});seen.add(f.id)}
 // Ligue des champions féminine UEFA : calendrier et résultats via le scoreboard ESPN.
 // Les matchs sont ajoutés au flux principal avec un modèle statistique dédié à la compétition.
 try {
  const seasonStart=new Date().getMonth()>=6?new Date().getFullYear():new Date().getFullYear()-1;
  const fromDate=String(seasonStart)+'0901',toDate=String(seasonStart+1)+'0630';
  // ESPN n'accepte pas toujours les plages de dates pour cette compétition : une requête par journée.
  const dates=['20260922','20260923','20260930','20261001','20261028','20261029',
   '20261110','20261111','20261112','20261118','20261119','20261216'];
  const packs=await Promise.all(dates.map(async date=>{
   const url='https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.wchampions/scoreboard?dates='+date;
   const response=await fetch(url,{headers:{'Accept':'application/json'}});
   if(!response.ok){console.log('ESPN UWCL '+response.status+' sur '+date);return []}
   const json=await response.json();
   return Array.isArray(json.events)?json.events:[];
  }));
  const events=[...new Map(packs.flat().map(e=>[String(e.id),e])).values()];
  const parsed=events.map(e=>{
   const comp=(e.competitions||[])[0],teams=comp&&comp.competitors||[];
   const home=teams.find(t=>t.homeAway==='home'),away=teams.find(t=>t.homeAway==='away');
   if(!home||!away||!home.team||!away.team||!e.date)return null;
   const status=comp.status&&comp.status.type,done=!!(status&&status.completed);
   const hs=home.score==null?null:Number(home.score),as=away.score==null?null:Number(away.score);
   return {event:e,home,away,done,hs,as,date:new Date(e.date),
    homeName:home.team.displayName||home.team.name||'Domicile',
    awayName:away.team.displayName||away.team.name||'Extérieur'};
  }).filter(e=>e&&Number.isFinite(e.date.getTime()));
  const completed=parsed.filter(e=>e.done&&Number.isFinite(e.hs)&&Number.isFinite(e.as));
  const form={};
  const teamStat=name=>form[name]||(form[name]={gf:0,ga:0,n:0});
  let goals=0,teamGames=0;
  completed.forEach(e=>{
   const h=teamStat(e.homeName),a=teamStat(e.awayName);
   h.gf+=e.hs;h.ga+=e.as;h.n++;
   a.gf+=e.as;a.ga+=e.hs;a.n++;
   goals+=e.hs+e.as;teamGames+=2;
  });
  const avgGoals=teamGames?goals/teamGames:2.8;
  const uwclOld=Object.fromEntries(prev.filter(m=>String(m.id).startsWith('uwcl-')).map(m=>[String(m.id),m]));
  for(const e of parsed){
   const d=day(e.date);
   if(d<day(off(-14))||d>day(off(45)))continue;
   const id='uwcl-'+e.event.id,oldW=uwclOld[id];
   const started=e.date.getTime()<=Date.now()||e.done;
   // Ne jamais créer rétroactivement un pronostic pour un match déjà commencé.
   if(started&&!oldW)continue;
   const h=teamStat(e.homeName),a=teamStat(e.awayName);
   // Lissage conservateur : les clubs ont peu de matchs dans cette compétition.
   const base=Math.max(1.8,Math.min(3.8,avgGoals||2.8));
   const smooth=(v,n)=>((v||0)+base*3)/(n+3);
   const hgf=smooth(h.gf,h.n),hga=smooth(h.ga,h.n),agf=smooth(a.gf,a.n),aga=smooth(a.ga,a.n);
   const lh=Math.max(.25,Math.min(3.8,1.48*(hgf/base)*(aga/base)));
   const la=Math.max(.25,Math.min(3.8,1.12*(agf/base)*(hga/base)));
   const px=model(lh,la);
   const score=e.done&&Number.isFinite(e.hs)&&Number.isFinite(e.as)?[e.hs,e.as]:null;
   let m={
    id,lg:"Ligue des champions féminine",home:e.homeName,away:e.awayName,
    d,h:new Intl.DateTimeFormat('fr-FR',{...tz,hour:'2-digit',minute:'2-digit'}).format(e.date),
    hc:e.home.team.logo||'',ac:e.away.team.logo||'',
    p1:r3(px.p1),pN:r3(px.pN),p2:r3(px.p2),
    btts:r3(px.btts),o25:r3(px.o25),o15:r3(px.o15),scs:px.scs,
    x:[r3(lh),r3(la)],fm:[h.n,a.n],ng:[h.n,a.n],r:score,lock:started?1:0,
    ia:'Pronostic statistique UWCL : résultats de la phase de ligue, buts marqués/encaissés et avantage du terrain. '+(Math.min(h.n,a.n)<3?'Échantillon limité : estimation indicative.':'Forme issue des matchs déjà joués dans la compétition.'),
    pt:new Date().toISOString(),b0:[r3(px.p1),r3(px.pN),r3(px.p2)]
   };
   if(oldW&&(oldW.lock||oldW.pt)){
    m={...m,...oldW,d,h:m.h,r:score||oldW.r||null,lock:oldW.lock||m.lock};
   } else {
    m=applyExperts(m);
   }
   out.push(m);seen.add(id);
  }
  console.log('Ligue des champions féminine :',parsed.length,'rencontres ESPN,',completed.length,'terminées');
 } catch(e) {
  console.log('Ligue des champions féminine indisponible pour cette mise à jour : '+e.message);
 }
 // Ligue des nations UEFA : calendrier et scores via le scoreboard public ESPN.
 // Les rencontres sont normalisées dans le même format que les autres compétitions.
 try {
  const ranges=['20260924','20260925','20260926','20260927','20260928','20260929','20261001','20261002','20261003','20261004','20261005','20261006','20261112','20261113','20261114','20261115','20261116','20261117'];
  const packs=await Promise.all(ranges.map(async date=>{
   const url='https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard?dates='+date;
   const response=await fetch(url,{headers:{'Accept':'application/json'}});
   if(!response.ok){console.log('ESPN '+response.status+' sur '+date);return []}
   const json=await response.json();
   return Array.isArray(json.events)?json.events:[];
  }));
  const events=[...new Map(packs.flat().map(e=>[String(e.id),e])).values()];
  const parsed=events.map(e=>{
   const comp=(e.competitions||[])[0],teams=comp&&comp.competitors||[];
   const home=teams.find(t=>t.homeAway==='home'),away=teams.find(t=>t.homeAway==='away');
   if(!home||!away||!home.team||!away.team)return null;
   const status=comp.status&&comp.status.type;
   const done=!!(status&&status.completed);
   const hs=home.score==null?null:Number(home.score),as=away.score==null?null:Number(away.score);
   return {event:e,comp,home,away,done,hs,as,date:new Date(e.date),homeName:home.team.displayName||home.team.name||'Domicile',awayName:away.team.displayName||away.team.name||'Extérieur'};
  }).filter(Boolean);
  const completed=parsed.filter(e=>e.done&&Number.isFinite(e.hs)&&Number.isFinite(e.as));
  const form={};
  const teamStat=name=>form[name]||(form[name]={gf:0,ga:0,n:0});
  let goals=0,teamGames=0;
  completed.forEach(e=>{
   const h=teamStat(e.homeName),a=teamStat(e.awayName);
   h.gf+=e.hs;h.ga+=e.as;h.n++;
   a.gf+=e.as;a.ga+=e.hs;a.n++;
   goals+=e.hs+e.as;teamGames+=2;
  });
  const avgGoals=teamGames?goals/teamGames:1.25;
  const nationsOld=Object.fromEntries(prev.filter(m=>String(m.id).startsWith('nations-')).map(m=>[String(m.id),m]));
  for(const e of parsed){
   const d=day(e.date);
   if(d<day(off(-14))||d>day(off(30)))continue;
   const id='nations-'+e.event.id,oldN=nationsOld[id];
   const h=teamStat(e.homeName),a=teamStat(e.awayName);
   // Lissage sur trois matchs : évite les probabilités extrêmes avec peu de recul.
   const base=Math.max(.8,avgGoals||1.25),smooth=(v,n)=>((v||0)+base*3)/(n+3);
   const hgf=smooth(h.gf,h.n),hga=smooth(h.ga,h.n),agf=smooth(a.gf,a.n),aga=smooth(a.ga,a.n);
   const lh=Math.max(.25,Math.min(3.8,1.35*(hgf/base)*(aga/base)));
   const la=Math.max(.25,Math.min(3.8,1.15*(agf/base)*(hga/base)));
   const px=model(lh,la);
   const started=e.date.getTime()<=Date.now()||e.done;
   const score=e.done&&Number.isFinite(e.hs)&&Number.isFinite(e.as)?[e.hs,e.as]:null;
   let m={
    id,lg:'Ligue des nations UEFA',home:e.homeName,away:e.awayName,
    d,h:new Intl.DateTimeFormat('fr-FR',{...tz,hour:'2-digit',minute:'2-digit'}).format(e.date),
    hc:e.home.team.logo||'',ac:e.away.team.logo||'',
    p1:r3(px.p1),pN:r3(px.pN),p2:r3(px.p2),
    btts:r3(px.btts),o25:r3(px.o25),scs:px.scs,
    x:[r3(lh),r3(la)],fm:[h.n,a.n],ng:[h.n,a.n],
    r:score,lock:started?1:0,
    ia:'Pronostic statistique ESPN : résultats récents de la Ligue des nations et modèle de buts attendus. '+(Math.min(h.n,a.n)<3?'Historique limité : estimation indicative.':'Forme basée sur les matchs déjà joués dans la compétition.'),
    pt:new Date().toISOString(),b0:[r3(px.p1),r3(px.pN),r3(px.p2)]
   };
   if(oldN&&(oldN.lock||oldN.pt)){
    m={...m,...oldN,d,h:m.h,r:score||oldN.r||null,lock:oldN.lock||m.lock};
   } else {
    m=applyExperts(m);
   }
   out.push(m);seen.add(id);
  }
  console.log('Ligue des nations UEFA :',parsed.length,'rencontres ESPN,',completed.length,'terminées');
 } catch(e) {
  console.log('Ligue des nations UEFA indisponible pour cette mise à jour : '+e.message);
 }
 // enregistrement définitif : un prono terminé entre dans l'historique une seule fois et n'est JAMAIS modifié ensuite
 const ids=new Set(hist.map(e=>e.i));
 out.forEach(m=>{if(m.r&&m.p1!=null&&(m.lock||m.pt)&&!ids.has(m.id)){hist.push(buildHistoryEntry(m, null));ids.add(m.id)}});
 const H2=hist.slice(-3000),keep=day(off(-14));
 const all=[...out,...prev.filter(m=>!seen.has(m.id)&&m.d&&m.d>=keep)].sort((a,b)=>(a.d+a.h).localeCompare(b.d+b.h));
 const learn={};[...new Set(H2.map(e=>e.lg))].forEach(lg=>{learn[lg]=calib(H2,lg)});learn._g=TT;
 fs.writeFileSync('data.json',JSON.stringify({updatedAt:new Date().toISOString(),matches:all,hist:H2}));
 const fr=new Intl.DateTimeFormat('fr-FR',{...tz,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
 fs.writeFileSync('data.js',`const DATE=${JSON.stringify(fr)};\nconst TODAY=${JSON.stringify(today)};\nconst UPDATED=${JSON.stringify(new Date().toISOString())};\nconst STAT=${JSON.stringify(aggregate(H2))};\nconst LEARN=${JSON.stringify(learn)};\nconst M=${JSON.stringify(all)};\n`);
 const nb={};all.forEach(m=>nb[m.d]=(nb[m.d]||0)+1);console.log(all.length+' matchs',JSON.stringify(nb),'| calibration T='+TT.T+' nuls×'+TT.dr+' (n='+TT.n+')','| historique',H2.length,OD?'| cotes marché activées':'| sans cotes marché');
})().catch(e=>{console.error(e.message);process.exit(1)});
