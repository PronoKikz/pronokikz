// Met à jour data.js (matchs du jour + pronos + résultats) via football-data.org
const fs=require('fs');
const K=process.env.FOOTBALL_DATA_KEY,CODES=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL').split(',');
if(!K){console.error('FOOTBALL_DATA_KEY manquante');process.exit(1)}
const get=async p=>{const r=await fetch('https://api.football-data.org/v4'+p,{headers:{'X-Auth-Token':K}});if(!r.ok)throw new Error(p+' -> '+r.status);return r.json()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tz={timeZone:'Europe/Paris'},day=d=>new Intl.DateTimeFormat('en-CA',tz).format(d);
const pois=(l,k)=>{let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p};
function model(lh,la){let h=0,n=0,a=0,b=[0,0,0];
 for(let i=0;i<=8;i++)for(let j=0;j<=8;j++){const p=pois(lh,i)*pois(la,j);i>j?h+=p:i==j?n+=p:a+=p;if(p>b[2])b=[i,j,p]}
 const t=h+n+a;return{p1:h/t,pN:n/t,p2:a/t,btts:(1-Math.exp(-lh))*(1-Math.exp(-la)),sc:b[0]+'-'+b[1]}}
const r3=x=>Math.round(x*1000)/1000;
(async()=>{
 const today=day(new Date());
 const prev=fs.existsSync('data.json')?JSON.parse(fs.readFileSync('data.json')):{date:null,matches:[]};
 const old=prev.date===today?Object.fromEntries(prev.matches.map(m=>[m.id,m])):{};
 const tmr=new Date(Date.now()+864e5).toISOString().slice(0,10),from=new Date(Date.now()-864e5).toISOString().slice(0,10);
 const fx=(await get(`/matches?dateFrom=${from}&dateTo=${tmr}`)).matches.filter(f=>CODES.includes(f.competition.code)&&day(new Date(f.utcDate))===today);
 const st={},out=[];
 for(const f of fx){
  let m=old[f.id];
  if(!m){
   const c=f.competition.code;
   if(!st[c]){await sleep(6500);const j=await get('/competitions/'+c+'/standings'),t=(j.standings||[]).find(x=>x.type==='TOTAL');st[c]=Object.fromEntries((t?t.table:[]).map(r=>[r.team.id,r]))}
   const H=st[c][f.homeTeam.id],A=st[c][f.awayTeam.id];if(!H||!A||!H.playedGames||!A.playedGames)continue;
   const lh=Math.max(.3,(H.goalsFor/H.playedGames+A.goalsAgainst/A.playedGames)/2*1.08),la=Math.max(.3,(A.goalsFor/A.playedGames+H.goalsAgainst/H.playedGames)/2*.92),x=model(lh,la);
   m={id:f.id,lg:f.competition.name,h:new Intl.DateTimeFormat('fr-FR',{...tz,hour:'2-digit',minute:'2-digit'}).format(new Date(f.utcDate)),
    home:f.homeTeam.shortName||f.homeTeam.name,away:f.awayTeam.shortName||f.awayTeam.name,p1:r3(x.p1),pN:r3(x.pN),p2:r3(x.p2),btts:r3(x.btts),ia:'Estimation statistique (buts marqués et encaissés). Score probable : '+x.sc}}
  const ft=f.score&&f.score.fullTime;
  out.push({...m,r:(f.status==='FINISHED'&&ft&&ft.home!=null)?[ft.home,ft.away]:null});
 }
 out.sort((a,b)=>a.h.localeCompare(b.h));
 fs.writeFileSync('data.json',JSON.stringify({date:today,matches:out}));
 const fr=new Intl.DateTimeFormat('fr-FR',{...tz,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
 fs.writeFileSync('data.js',`const DATE=${JSON.stringify(fr)};\nconst M=${JSON.stringify(out)};\n`);
 console.log(out.length+' matchs');
})().catch(e=>{console.error(e.message);process.exit(1)});
