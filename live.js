// Mise à jour légère des scores et statuts en direct.
// Ce script ne recalcule pas les pronostics et ne consomme pas les quotas Odds/OpenAI.
const fs=require('fs');
const K=process.env.FOOTBALL_DATA_API_KEY||process.env.FOOTBALL_DATA_KEY;
if(!K){console.error('Clé Football Data manquante');process.exit(1)}
const CODES=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL,PPL,DED,ELC').split(',');
const get=async(path)=>{const r=await fetch('https://api.football-data.org/v4'+path,{headers:{'X-Auth-Token':K}});if(!r.ok)throw new Error(path+' -> '+r.status);return r.json()};
const day=(n)=>{const d=new Date(Date.now()+n*864e5);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(d)};
(async()=>{
 const file='data.json';if(!fs.existsSync(file))throw new Error('data.json introuvable');
 const data=JSON.parse(fs.readFileSync(file,'utf8'));const matches=data.matches||[];
 const ids=new Map(matches.map(m=>[String(m.id),m]));
 const from=day(-1),to=day(2);
 const results=await Promise.all(CODES.map(async code=>{try{return(await get('/competitions/'+code+'/matches?dateFrom='+from+'&dateTo='+to)).matches||[]}catch(e){console.log('Live '+code+' indisponible : '+e.message);return []}}));
 const fetched=results.flat();let changed=0;
 for(const f of fetched){
  const m=ids.get(String(f.id));if(!m)continue;
  const score=f.score&&f.score.fullTime;
  const liveScore=score&&Number.isFinite(score.home)&&Number.isFinite(score.away)?[score.home,score.away]:null;
  const next={...m,liveStatus:f.status||null,liveMinute:Number.isFinite(f.minute)?f.minute:null,liveAdded:Number.isFinite(f.injuryTime)?f.injuryTime:null,liveScore,liveUpdatedAt:new Date().toISOString()};
  if(f.status==='FINISHED'&&liveScore)next.r=liveScore;
  Object.assign(m,next);changed++;
 }
 data.liveUpdatedAt=new Date().toISOString();
 fs.writeFileSync(file,JSON.stringify(data));
 console.log('Suivi live actualisé : '+changed+' matchs suivis, '+fetched.length+' rencontres reçues. Statuts IN_PLAY/PAUSED et minute fournis par Football-Data.');
})().catch(e=>{console.error(e);process.exit(1)});
