// Mise à jour légère des scores et statuts en direct.
// Football-Data pour les championnats principaux ; ESPN pour les compétitions ajoutées via ESPN.
// Ce script ne recalcule pas les pronostics et ne consomme pas les quotas Odds/OpenAI.
const fs=require('fs');
const K=process.env.FOOTBALL_DATA_API_KEY||process.env.FOOTBALL_DATA_KEY;
if(!K){console.error('Clé Football Data manquante');process.exit(1)}
const CODES=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL,PPL,DED,ELC').split(',').map(x=>x.trim()).filter(Boolean);
const get=async(path)=>{const r=await fetch('https://api.football-data.org/v4'+path,{headers:{'X-Auth-Token':K}});if(!r.ok)throw new Error(path+' -> '+r.status);return r.json()};
const day=(n)=>{const d=new Date(Date.now()+n*864e5);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(d)};
const espnDay=(n)=>day(n).replace(/-/g,'');
const espnEvents=async(sport,date)=>{
 const url='https://site.api.espn.com/apis/site/v2/sports/soccer/'+sport+'/scoreboard?dates='+date;
 const response=await fetch(url,{headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('ESPN '+sport+' '+date+' -> '+response.status);
 const json=await response.json();
 return Array.isArray(json.events)?json.events:[];
};
const toEspnMatch=(event,prefix)=>{
 const competition=(event.competitions||[])[0];
 const teams=competition&&competition.competitors||[];
 const home=teams.find(t=>t.homeAway==='home'),away=teams.find(t=>t.homeAway==='away');
 if(!home||!away)return null;
 const status=competition.status||event.status||{};
 const type=status.type||{};
 const state=String(type.state||'').toLowerCase();
 const detail=[type.name,type.detail,type.shortDetail,status.displayClock].filter(Boolean).join(' ');
 const done=!!type.completed||state==='post';
 const halftime=/half.?time|halftime|half time|interval/i.test(detail)||(state==='in'&&Number(status.period)===1&&String(status.displayClock||'').startsWith('0:'));
 const suspended=/suspend/i.test(detail);
 const liveStatus=done?'FINISHED':suspended?'SUSPENDED':state==='in'?(halftime?'PAUSED':'IN_PLAY'):null;
 if(!liveStatus)return null;
 const scoreHome=home.score==null?null:Number(home.score);
 const scoreAway=away.score==null?null:Number(away.score);
 const liveScore=Number.isFinite(scoreHome)&&Number.isFinite(scoreAway)?{home:scoreHome,away:scoreAway}:null;
 const clock=String(status.displayClock||'');
 let minute=null;
 const clockMatch=clock.match(/^(\d+)/);
 if(clockMatch)minute=Number(clockMatch[1]);
 else if(Number.isFinite(Number(status.period)))minute=Number(status.period)>=2?45:0;
 let injuryTime=null;
 const addedMatch=detail.match(/(\d+)\s*\+\s*(\d+)/);
 if(addedMatch){minute=Number(addedMatch[1]);injuryTime=Number(addedMatch[2]);}
 return {id:prefix+String(event.id),status:liveStatus,minute,injuryTime,liveScore};
};
(async()=>{
 const file='data.json';if(!fs.existsSync(file))throw new Error('data.json introuvable');
 const data=JSON.parse(fs.readFileSync(file,'utf8'));const matches=data.matches||[];
 const ids=new Map(matches.map(m=>[String(m.id),m]));
 const from=day(-1),to=day(2);
 const results=await Promise.all(CODES.map(async code=>{try{return(await get('/competitions/'+code+'/matches?dateFrom='+from+'&dateTo='+to)).matches||[]}catch(e){console.log('Live '+code+' indisponible : '+e.message);return []}}));
 const fetched=results.flat();let espnFetched=0;
 // Les matchs Nations et UWCL ont des identifiants ESPN préfixés dans data.json.
 const dates=[-1,0,1,2].map(espnDay);
 const espnPacks=await Promise.all(['uefa.nations','uefa.wchampions'].flatMap(sport=>dates.map(async date=>{
  try{return(await espnEvents(sport,date)).map(event=>toEspnMatch(event,sport==='uefa.nations'?'nations-':'uwcl-')).filter(Boolean)}
  catch(e){console.log('Live ESPN '+sport+' indisponible : '+e.message);return []}
 })));
 const espnMatches=espnPacks.flat();espnFetched=espnMatches.length;
 for(const f of espnMatches){
  const m=ids.get(String(f.id));if(!m)continue;
  fetched.push({id:f.id,status:f.status,minute:f.minute,injuryTime:f.injuryTime,score:{fullTime:f.liveScore}});
 }
 let changed=0,tracked=0;
 for(const f of fetched){
  const m=ids.get(String(f.id));if(!m)continue;
  if(!['IN_PLAY','PAUSED','FINISHED','SUSPENDED','POSTPONED','CANCELLED','AWARDED'].includes(f.status))continue;
  tracked++;
  const rawScore=f.score&&f.score.fullTime;
  const liveScore=rawScore&&Number.isFinite(rawScore.home)&&Number.isFinite(rawScore.away)?[rawScore.home,rawScore.away]:null;
  const minute=Number.isFinite(f.minute)?f.minute:null,added=Number.isFinite(f.injuryTime)?f.injuryTime:null,status=f.status||null;
  const scoreChanged=JSON.stringify(m.liveScore||null)!==JSON.stringify(liveScore);
  const changedNow=m.liveStatus!==status||m.liveMinute!==minute||m.liveAdded!==added||scoreChanged;
  if(!changedNow)continue;
  m.liveStatus=status;m.liveMinute=minute;m.liveAdded=added;m.liveScore=liveScore;m.liveUpdatedAt=new Date().toISOString();
  if(status==='FINISHED'&&liveScore)m.r=liveScore;
  changed++;
 }
 if(changed>0)fs.writeFileSync(file,JSON.stringify(data));
 console.log('Suivi live : '+tracked+' matchs suivis ('+fetched.length+' rencontres Football-Data/ESPN reçues, dont '+espnFetched+' ESPN), '+changed+' changements enregistrés.');
})().catch(e=>{console.error(e);process.exit(1)});
