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

 // MatchEnDirect : source prioritaire pour les rencontres visibles sur son livescore.
 // On ne remplace une donnée existante que si les deux équipes et le score sont reconnus.
 const medAliases={
  'andorra':'Andorre','netherlands':'Pays-Bas','north macedonia':'Macédoine du Nord',
  'faroe islands':'Îles Féroé','azerbaijan':'Azerbaïdjan','iceland':'Islande',
  'slovenia':'Slovénie','switzerland':'Suisse','germany':'Allemagne','serbia':'Serbie',
  'slovakia':'Slovaquie','bulgaria':'Bulgarie','estonia':'Estonie','luxembourg':'Luxembourg',
  'liechtenstein':'Liechtenstein','gibraltar':'Gibraltar','moldova':'Moldavie',
  'kazakhstan':'Kazakhstan','scotland':'Écosse','israel':'Israël','kosovo':'Kosovo',
  'georgia':'Géorgie','hungary':'Hongrie','norway':'Norvège','wales':'Pays de Galles',
  'austria':'Autriche','republic of ireland':'Irlande','northern ireland':'Irlande du Nord',
  'ukraine':'Ukraine','portugal':'Portugal','denmark':'Danemark','romania':'Roumanie',
  'poland':'Pologne','sweden':'Suède','bosnia-herzegovina':'Bosnie-Herzégovine',
  'cyprus':'Chypre','montenegro':'Monténégro','latvia':'Lettonie','armenia':'Arménie',
  'belarus':'Bélarus','albania':'Albanie','finland':'Finlande','san marino':'Saint-Marin',
  'belgium':'Belgique','italy':'Italie','croatia':'Croatie','czechia':'République Tchèque',
  'france':'France','spain':'Espagne','england':'Angleterre','malta':'Malte'
 };
 const medNorm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s'-]/g,' ').replace(/\s+/g,' ').trim();
 const medTeam=s=>medNorm(medAliases[String(s||'').toLowerCase()]||s);
 try{
  const response=await fetch('https://www.matchendirect.fr/live-score/',{headers:{'User-Agent':'Mozilla/5.0 (compatible; PronokikzLive/1.0)','Accept':'text/html'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const html=await response.text();
  const visible=html.replace(/<script[\s\S]*?<\/script>/gi,' ')
   .replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
   .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
   .replace(/&eacute;/gi,'é').replace(/&egrave;/gi,'è').replace(/&ecirc;/gi,'ê')
   .replace(/&agrave;/gi,'à').replace(/&ccedil;/gi,'ç').replace(/&#39;|&apos;/gi,"'")
   .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
  const textMed=medNorm(visible);
  let medCount=0;
  for(const m of matches){
   if(!m||!m.home||!m.away)continue;
   const home=medTeam(m.home),away=medTeam(m.away);
   if(!home||!away)continue;
   let cursor=0,found=null;
   while(cursor<textMed.length){
    const hi=textMed.indexOf(home,cursor);if(hi<0)break;
    const ai=textMed.indexOf(away,hi+home.length);
    if(ai<0){cursor=hi+1;continue}
    const between=textMed.slice(hi+home.length,ai);
    const scoreMatches=[...between.matchAll(/(?:^|\s)(\d{1,2})\s*-\s*(\d{1,2})(?=\s|$)/g)];
    if(scoreMatches.length&&ai-hi<180){
     const score=scoreMatches[scoreMatches.length-1];
     const before=textMed.slice(Math.max(0,hi-70),hi);
     const after=textMed.slice(ai+away.length,ai+away.length+140);
     const context=before+' '+between+' '+after;
     const minuteMatches=[...before.matchAll(/(\d{1,3})(?:\s*\+\s*\d+)?\s*'/g)];
     const minute=minuteMatches.length?Number(minuteMatches[minuteMatches.length-1][1]):null;
     const done=/\b(?:termine|fin du match|full time|finished|ended|apres prolongation|apres tirs au but|tirs au but|penalties)\b/.test(context)||/\bFT\b/.test(context);
     const halftime=/mi temps|half time|halftime|interval/.test(context);
     const suspended=/suspendu|suspended|interrompu/.test(context);
     found={id:String(m.id),status:done?'FINISHED':suspended?'SUSPENDED':halftime?'PAUSED':'IN_PLAY',
      minute,score:{home:Number(score[1]),away:Number(score[2])}};
     break;
    }
    cursor=hi+1;
   }
   if(found){fetched.push({id:found.id,status:found.status,minute:found.minute,score:{fullTime:found.score},source:'MatchEnDirect'});medCount++}
  }
  console.log('MatchEnDirect : '+medCount+' matchs rapprochés sur '+matches.length+' matchs du calendrier.');
 }catch(e){console.log('MatchEnDirect indisponible : '+e.message+' (sources de secours conservées)')}
 let changed=0,tracked=0;
 for(const f of fetched){
  const m=ids.get(String(f.id));if(!m)continue;
  if(!['IN_PLAY','PAUSED','FINISHED','SUSPENDED','POSTPONED','CANCELLED','AWARDED'].includes(f.status))continue;
  tracked++;
  const rawScore=f.score&&f.score.fullTime;
  const liveScore=rawScore&&Number.isFinite(rawScore.home)&&Number.isFinite(rawScore.away)?[rawScore.home,rawScore.away]:null;
  const minute=Number.isFinite(f.minute)?f.minute:null,added=Number.isFinite(f.injuryTime)?f.injuryTime:null,status=f.status||null;
  const scoreChanged=JSON.stringify(m.liveScore||null)!==JSON.stringify(liveScore);
  const changedNow=m.liveStatus!==status||m.liveMinute!==minute||m.liveAdded!==added||scoreChanged||(!!f.source&&m.liveSource!==f.source);
  if(!changedNow)continue;
  m.liveStatus=status;m.liveMinute=minute;m.liveAdded=added;m.liveScore=liveScore;m.liveUpdatedAt=new Date().toISOString();if(f.source)m.liveSource=f.source;
  if(status==='FINISHED'&&liveScore)m.r=liveScore;
  changed++;
 }
 if(changed>0)fs.writeFileSync(file,JSON.stringify(data));
 console.log('Suivi live : '+tracked+' matchs suivis ('+fetched.length+' rencontres Football-Data/ESPN reçues, dont '+espnFetched+' ESPN), '+changed+' changements enregistrés.');
})().catch(e=>{console.error(e);process.exit(1)});
