// Met à jour data.js (matchs sur 3 jours, pronos, résultats, historique) via football-data.org
const fs=require('fs');
const K=process.env.FOOTBALL_DATA_KEY,CODES=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL').split(',');
if(!K){console.error('FOOTBALL_DATA_KEY manquante');process.exit(1)}
const get=async p=>{const r=await fetch('https://api.football-data.org/v4'+p,{headers:{'X-Auth-Token':K}});if(!r.ok)throw new Error(p+' -> '+r.status);return r.json()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tz={timeZone:'Europe/Paris'},day=d=>new Intl.DateTimeFormat('en-CA',tz).format(d),off=n=>new Date(Date.now()+n*864e5);
const pois=(l,k)=>{let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p};
function model(lh,la){let h=0,n=0,a=0,b=[0,0,0];
 for(let i=0;i<=8;i++)for(let j=0;j<=8;j++){const p=pois(lh,i)*pois(la,j);i>j?h+=p:i==j?n+=p:a+=p;if(p>b[2])b=[i,j,p]}
 const t=h+n+a,o25=1-[0,1,2].reduce((s,k)=>s+pois(lh+la,k),0);
 return{p1:h/t,pN:n/t,p2:a/t,btts:(1-Math.exp(-lh))*(1-Math.exp(-la)),o25,sc:b[0]+'-'+b[1]}}
const r3=x=>Math.round(x*1000)/1000;
(async()=>{
 const today=day(new Date()),from=day(off(-2)),last=day(off(2));
 const prev=fs.existsSync('data.json')?(JSON.parse(fs.readFileSync('data.json')).matches||[]):[];
 const old=Object.fromEntries(prev.map(m=>[m.id,m]));
 const fx=(await get(`/matches?dateFrom=${from}&dateTo=${off(3).toISOString().slice(0,10)}`)).matches
  .filter(f=>CODES.includes(f.competition.code)&&day(new Date(f.utcDate))>=from&&day(new Date(f.utcDate))<=last);
 const st={},sc={},out=[],seen=new Set();
 for(const f of fx){
  const c=f.competition.code;let m=old[f.id];
  if(!m){
   if(!st[c]){await sleep(6500);const j=await get('/competitions/'+c+'/standings'),t=(j.standings||[]).find(x=>x.type==='TOTAL');st[c]=Object.fromEntries((t?t.table:[]).map(r=>[r.team.id,r]))}
   const H=st[c][f.homeTeam.id],A=st[c][f.awayTeam.id];if(!H||!A||!H.playedGames||!A.playedGames)continue;
   const lh=Math.max(.3,(H.goalsFor/H.playedGames+A.goalsAgainst/A.playedGames)/2*1.08),la=Math.max(.3,(A.goalsFor/A.playedGames+H.goalsAgainst/H.playedGames)/2*.92),x=model(lh,la);
   m={id:f.id,lg:f.competition.name,home:f.homeTeam.shortName||f.homeTeam.name,away:f.awayTeam.shortName||f.awayTeam.name,
    p1:r3(x.p1),pN:r3(x.pN),p2:r3(x.p2),btts:r3(x.btts),o25:r3(x.o25),ia:'Estimation statistique (buts marqués et encaissés). Score probable : '+x.sc}}
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
 console.log(all.length+' matchs');
})().catch(e=>{console.error(e.message);process.exit(1)});
