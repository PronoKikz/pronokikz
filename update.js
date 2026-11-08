// Met à jour data.js (matchs sur plusieurs jours, pronos, résultats, historique) via football-data.org
// Critères automatiques : forme (5 derniers), niveau, domicile/extérieur, attaque/défense.
// Absences, enjeux, tactique, confrontations directes : ajustés à la main dans expert.js (champ aj).
const fs=require('fs');
const K=process.env.FOOTBALL_DATA_KEY,CODES=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL').split(',');
if(!K){console.error('FOOTBALL_DATA_KEY manquante');process.exit(1)}
const get=async(p,n=0)=>{const r=await fetch('https://api.football-data.org/v4'+p,{headers:{'X-Auth-Token':K}});if(r.status===429&&n<3){console.log('limite atteinte, pause 65 s');await new Promise(z=>setTimeout(z,65000));return get(p,n+1)}if(!r.ok)throw new Error(p+' -> '+r.status);return r.json()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tz={timeZone:'Europe/Paris'},day=d=>new Intl.DateTimeFormat('en-CA',tz).format(d),off=n=>new Date(Date.now()+n*864e5);
const pois=(l,k)=>{let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p};
function model(lh,la){let h=0,n=0,a=0,b=[0,0,0];
 for(let i=0;i<=8;i++)for(let j=0;j<=8;j++){const p=pois(lh,i)*pois(la,j);i>j?h+=p:i==j?n+=p:a+=p;if(p>b[2])b=[i,j,p]}
 const t=h+n+a,o25=1-[0,1,2].reduce((s,k)=>s+pois(lh+la,k),0);
 return{p1:h/t,pN:n/t,p2:a/t,btts:(1-Math.exp(-lh))*(1-Math.exp(-la)),o25,sc:b[0]+'-'+b[1]}}
const r3=x=>Math.round(x*1000)/1000,r=(x,y)=>y?x/y:0;
function stats(ms){const T={},t=id=>T[id]||(T[id]={g:0,gf:0,ga:0,pts:0,hg:0,hgf:0,hga:0,hpts:0,ag:0,agf:0,aga:0,apts:0,last:[]});
 ms.filter(m=>m.status==='FINISHED'&&m.score&&m.score.fullTime&&m.score.fullTime.home!=null).sort((a,b)=>a.utcDate.localeCompare(b.utcDate)).forEach(m=>{
  const hg=m.score.fullTime.home,ag=m.score.fullTime.away,H=t(m.homeTeam.id),A=t(m.awayTeam.id),ph=hg>ag?3:hg==ag?1:0,pa=ag>hg?3:ag==hg?1:0;
  H.g++;H.gf+=hg;H.ga+=ag;H.pts+=ph;H.hg++;H.hgf+=hg;H.hga+=ag;H.hpts+=ph;H.last.push(ph);
  A.g++;A.gf+=ag;A.ga+=hg;A.pts+=pa;A.ag++;A.agf+=ag;A.aga+=hg;A.apts+=pa;A.last.push(pa)});
 return T}
function predict(H,A){
 const bl=(a,na,b,nb)=>na>=2?.6*r(a,na)+.4*r(b,nb):r(b,nb);
 const attH=bl(H.hgf,H.hg,H.gf,H.g),defH=bl(H.hga,H.hg,H.ga,H.g),attA=bl(A.agf,A.ag,A.gf,A.g),defA=bl(A.aga,A.ag,A.ga,A.g);
 let lh=(attH+defA)/2,la=(attA+defH)/2;
 const fp=x=>x.last.slice(-5),fpts=x=>fp(x).reduce((a,b)=>a+b,0),fpg=x=>fp(x).length?fpts(x)/fp(x).length:1.35;
 const R=(x,v,vb)=>(.20*(r(x.pts,x.g)-1.35)+.20*(fpg(x)-1.35)+.15*(v-vb)+.15*r(x.gf-x.ga,x.g)*.8)/.70;
 const d=R(H,H.hg>=2?r(H.hpts,H.hg):r(H.pts,H.g),1.5)-R(A,A.ag>=2?r(A.apts,A.ag):r(A.pts,A.g),1.1);
 lh=Math.max(.3,lh*Math.exp(.12*d));la=Math.max(.3,la*Math.exp(-.12*d));
 return{...model(lh,la),fm:[fpts(H),fpts(A)]}}
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
