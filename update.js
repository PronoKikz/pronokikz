// Met à jour les pronostics et l'historique Pronokikz via football-data.org
require('dotenv').config();
// Critères automatiques : forme (5 derniers), niveau, domicile/extérieur, attaque/défense.
// Absences, enjeux, tactique, confrontations directes : ajustés à la main dans expert.js (champ aj).
const fs=require('fs');
const { predictMatch } = require('./predictor');
const K=process.env.FOOTBALL_DATA_API_KEY||process.env.FOOTBALL_DATA_KEY,CODES=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL').split(',');
if(!K){console.error('Clé API manquante : ajoute FOOTBALL_DATA_API_KEY dans .env ou configure le secret GitHub FOOTBALL_DATA_API_KEY.');process.exit(1)}
const get=async(p,n=0)=>{const r=await fetch('https://api.football-data.org/v4'+p,{headers:{'X-Auth-Token':K}});if(r.status===429&&n<3){console.log('limite atteinte, pause 65 s');await new Promise(z=>setTimeout(z,65000));return get(p,n+1)}if(!r.ok)throw new Error(p+' -> '+r.status);return r.json()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tz={timeZone:'Europe/Paris'},day=d=>new Intl.DateTimeFormat('en-CA',tz).format(d),off=n=>new Date(Date.now()+n*864e5);
const r3=x=>Math.round(x*1000)/1000,r=(x,y)=>y?x/y:0;
function stats(ms){const T={},t=id=>T[id]||(T[id]={g:0,gf:0,ga:0,pts:0,hg:0,hgf:0,hga:0,hpts:0,ag:0,agf:0,aga:0,apts:0,elo:1500,last:[]});
 ms.filter(m=>m.status==='FINISHED'&&m.score&&m.score.fullTime&&m.score.fullTime.home!=null).sort((a,b)=>a.utcDate.localeCompare(b.utcDate)).forEach(m=>{
  const hg=m.score.fullTime.home,ag=m.score.fullTime.away,H=t(m.homeTeam.id),A=t(m.awayTeam.id),ph=hg>ag?3:hg==ag?1:0,pa=ag>hg?3:ag==hg?1:0;
  const eh=1/(1+Math.pow(10,(A.elo-(H.elo+60))/400)),delta=20*((ph/3)-eh);H.elo+=delta;A.elo-=delta;
  H.g++;H.gf+=hg;H.ga+=ag;H.pts+=ph;H.hg++;H.hgf+=hg;H.hga+=ag;H.hpts+=ph;H.last.push({pts:ph,gf:hg,ga:ag});
  A.g++;A.gf+=ag;A.ga+=hg;A.pts+=pa;A.ag++;A.agf+=ag;A.aga+=hg;A.apts+=pa;A.last.push({pts:pa,gf:ag,ga:hg})});
 return T}
function predict(H,A){
 const x=predictMatch(H,A);
 const recent=xTeam=>xTeam.last.slice(-5).reduce((sum,m)=>sum+(m.pts||0),0);
 return{...x,fm:[recent(H),recent(A)]};
}
(async()=>{
 const today=day(new Date()),from=day(off(-1)),last=day(off(7));
 const prev=fs.existsSync('data.json')?(JSON.parse(fs.readFileSync('data.json')).matches||[]):[];
 const old=Object.fromEntries(prev.map(m=>[m.id,m]));
 const fx=(await get(`/matches?dateFrom=${from}&dateTo=${off(8).toISOString().slice(0,10)}`)).matches
  .filter(f=>CODES.includes(f.competition.code)&&day(new Date(f.utcDate))>=from&&day(new Date(f.utcDate))<=last);
 const st={},sc={},out=[],seen=new Set();
 for(const f of fx){
  const c=f.competition.code;let m=old[f.id];
  if(!m){
   if(!st[c]){try{await sleep(6500);st[c]=stats((await get('/competitions/'+c+'/matches?status=FINISHED')).matches||[])}catch(e){console.log('stats '+c+' : '+e.message);st[c]={}}}
   const H=st[c][f.homeTeam.id],A=st[c][f.awayTeam.id];if(!H||!A||H.g<3||A.g<3)continue;
   const x=predict(H,A);
   m={id:f.id,lg:f.competition.name,home:f.homeTeam.shortName||f.homeTeam.name,away:f.awayTeam.shortName||f.awayTeam.name,
    p1:r3(x.p1),pN:r3(x.pN),p2:r3(x.p2),btts:r3(x.btts),o25:r3(x.o25),fm:x.fm,ia:'Estimation : forme, niveau, domicile/extérieur, attaque/défense. Score probable : '+x.sc}}
  if(m.bt===undefined){
   try{if(!sc[c]){await sleep(6500);sc[c]=(await get('/competitions/'+c+'/scorers?limit=60')).scorers||[]}
    const tm=m.p1>=m.p2?f.homeTeam:f.awayTeam,b=sc[c].filter(x=>x.team&&x.team.id===tm.id).sort((x,y)=>y.goals-x.goals)[0];
    m={...m,bt:b?b.player.name+' ('+b.goals+' buts)':''}}catch(e){m={...m,bt:''}}}
  const ft=f.score&&f.score.fullTime;
  out.push({...m,d:day(new Date(f.utcDate)),h:new Intl.DateTimeFormat('fr-FR',{...tz,hour:'2-digit',minute:'2-digit'}).format(new Date(f.utcDate)),
   hc:f.homeTeam.crest||'',ac:f.awayTeam.crest||'',r:(f.status==='FINISHED'&&ft&&ft.home!=null)?[ft.home,ft.away]:null});seen.add(f.id)}
 const keep=day(off(-14));
 const all=[...out,...prev.filter(m=>!seen.has(m.id)&&m.d&&m.d>=keep)].sort((a,b)=>(a.d+a.h).localeCompare(b.d+b.h));
 fs.writeFileSync('data.json',JSON.stringify({matches:all}));
 const fr=new Intl.DateTimeFormat('fr-FR',{...tz,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
 fs.writeFileSync('data.js',`const DATE=${JSON.stringify(fr)};\nconst TODAY=${JSON.stringify(today)};\nconst UPDATED=${JSON.stringify(new Date().toISOString())};\nconst M=${JSON.stringify(all)};\n`);
 const nb={};all.forEach(m=>nb[m.d]=(nb[m.d]||0)+1);console.log(all.length+' matchs',JSON.stringify(nb));
})().catch(e=>{console.error(e.message);process.exit(1)});
