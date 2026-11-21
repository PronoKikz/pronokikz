// Mise à jour légère des scores et statuts en direct.
// Déclenche aussi une actualisation immédiate lors d'une correction du suivi live.
// Détection élargie des statuts ESPN pour les matchs internationaux.
// Football-Data pour les championnats principaux ; ESPN pour les compétitions ajoutées via ESPN.
// Ce script ne recalcule pas les pronostics et ne consomme pas les quotas Odds/OpenAI.
const fs=require('fs');
const K=process.env.FOOTBALL_DATA_API_KEY||process.env.FOOTBALL_DATA_KEY;
if(!K)console.log('Clé Football Data absente : ESPN et MatchEnDirect restent actifs en secours.');
const CODES=[...new Set([...(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL,PPL,ELC').split(',').map(x=>x.trim()) .filter(Boolean).filter(x=>x!=='DED'),'FL2'])];
const get=async(path)=>{if(!K)throw new Error('Clé Football Data absente');const r=await fetch('https://api.football-data.org/v4'+path,{headers:{'X-Auth-Token':K}});if(!r.ok)throw new Error(path+' -> '+r.status);return r.json()};
const day=(n)=>{const d=new Date(Date.now()+n*864e5);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(d)};
const dayOf=(date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
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
 // ESPN peut exposer un statut différent au niveau de l'événement et
 // de la compétition. Ne pas choisir un objet status simplement parce qu'il
 // existe : il peut être incomplet et masquer le véritable état du match.
 const eventStatus=event.status||{};
 const competitionStatus=competition.status||{};
 const eventType=eventStatus.type||{};
 const competitionType=competitionStatus.type||{};
 const type={...eventType,...competitionType};
 const status={...eventStatus,...competitionStatus,type};
 const states=[eventType.state,competitionType.state].map(x=>String(x||'').toLowerCase());
 const state=states.find(x=>['in','live','post'].includes(x))||states.find(Boolean)||'';
 const detail=[eventType.name,eventType.detail,eventType.shortDetail,competitionType.name,competitionType.detail,competitionType.shortDetail,eventStatus.displayClock,competitionStatus.displayClock].filter(Boolean).join(' ');
 const done=!!eventType.completed||!!competitionType.completed||states.includes('post');
 const clock=competitionStatus.displayClock||eventStatus.displayClock||status.displayClock||'';
 const period=competitionStatus.period??eventStatus.period??status.period;
 const halftime=/half.?time|halftime|half time|interval/i.test(detail)||(state==='in'&&Number(period)===1&&String(clock).startsWith('0:'));
 const suspended=/suspend/i.test(detail);
 const liveName=/in.?progress|in.?play|live/.test(detail.toLowerCase());
 const liveStatus=done?'FINISHED':suspended?'SUSPENDED':(states.includes('in')||states.includes('live')||liveName)?(halftime?'PAUSED':'IN_PLAY'):null;
 if(!liveStatus)return null;
 const scoreHome=home.score==null?null:Number(home.score);
 const scoreAway=away.score==null?null:Number(away.score);
 const liveScore=Number.isFinite(scoreHome)&&Number.isFinite(scoreAway)?{home:scoreHome,away:scoreAway}:null;
 let minute=null;
 const clockMatch=clock.match(/^(\d+)/);
 if(clockMatch)minute=Number(clockMatch[1]);
 else if(Number.isFinite(Number(competitionStatus.period??eventStatus.period??status.period)))minute=Number(competitionStatus.period??eventStatus.period??status.period)>=2?45:0;
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
 const fetched=results.flat().map(match=>({...match,source:'Football-Data'}));let espnFetched=0;
 // Les matchs Nations et UWCL ont des identifiants ESPN préfixés dans data.json.
 const dates=[-1,0,1,2].map(espnDay);
 const espnPacks=await Promise.all(['uefa.nations','uefa.wchampions'].flatMap(sport=>dates.map(async date=>{
  try{return(await espnEvents(sport,date)).map(event=>toEspnMatch(event,sport==='uefa.nations'?'nations-':'uwcl-')).filter(Boolean)}
  catch(e){console.log('Live ESPN '+sport+' indisponible : '+e.message);return []}
 })));
 const espnMatches=espnPacks.flat();espnFetched=espnMatches.length;
 for(const f of espnMatches){
  const m=ids.get(String(f.id));if(!m)continue;
  fetched.push({id:f.id,status:f.status,minute:f.minute,injuryTime:f.injuryTime,score:{fullTime:f.liveScore},source:'ESPN'});
 }

 // MatchEnDirect : source prioritaire pour les rencontres visibles sur son livescore.
 // On ne remplace une donnée existante que si les deux équipes et le score sont reconnus.
 const medAliases={
  'man city':'Manchester City','andorra':'Andorre','netherlands':'Pays-Bas','north macedonia':'Macédoine du Nord',
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
 // ESPN fournit un second flux de score pour la Premier League : on le rapproche
 // des rencontres Football-Data par date et noms d'équipes pour corriger les scores figés.
 let espnPlCount=0;
 const plPacks=await Promise.all([-1,0,1,2].map(async n=>{
  try{return await espnEvents('eng.1',espnDay(n))}
  catch(e){console.log('Live ESPN Premier League '+espnDay(n)+' indisponible : '+e.message);return []}
 }));
 for(const event of plPacks.flat()){
  const competition=(event.competitions||[])[0],teams=competition&&competition.competitors||[];
  const home=teams.find(t=>t.homeAway==='home'),away=teams.find(t=>t.homeAway==='away');
  if(!home||!away)continue;
  const eventDate=dayOf(new Date(event.date));
  const hName=medTeam(home.team&&(home.team.displayName||home.team.name||home.team.shortDisplayName));
  const aName=medTeam(away.team&&(away.team.displayName||away.team.name||away.team.shortDisplayName));
  const target=matches.find(m=>m.d===eventDate&&medTeam(m.home)===hName&&medTeam(m.away)===aName);
  if(!target)continue;
  const live=toEspnMatch(event,'');
  if(!live||!live.status)continue;
  fetched.push({id:String(target.id),status:live.status,minute:live.minute,injuryTime:live.injuryTime,
   score:{fullTime:live.liveScore},source:'ESPN'});
  espnPlCount++;
 }
 console.log('Live ESPN Premier League : '+espnPlCount+' matchs rapprochés.');
 // ESPN est prioritaire sur Football-Data pour les scores live, qui peuvent rester figés.
 const authoritativeIds=new Set(fetched.filter(x=>x.source==='ESPN'||x.source==='Football-Data').map(x=>String(x.id)));
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
   if(!m||!m.home||!m.away||authoritativeIds.has(String(m.id)))continue;
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
     // Le texte aplati de MatchEnDirect peut placer la minute d'un match voisin
     // juste avant le nom de l'équipe. On ne lit donc plus l'horloge dans "before".
     // Une minute n'est affichée que si elle suit immédiatement les deux équipes.
     // Ne pas lire les mots placés avant les équipes : ils peuvent appartenir
     // au match précédent dans le texte aplati de la page.
     const context=(between+' '+after).replace(/\s+/g,' ');
     const minuteMatches=[...after.matchAll(/(?:^|\s)(\d{1,3})(?:\s*\+\s*\d+)?\s*'/g)];
     const minute=minuteMatches.length?Number(minuteMatches[0][1]):null;
     const done=/\b(?:termine|terminee|fin du match|match fini|full.?time|finished|ended|apres prolongation|apres tirs au but|tirs au but|penalties|penalty shoot.?out)\b/.test(context)||/\bft\b/i.test(context);
     const halftime=/mi.?temps|half.?time|halftime|interval/.test(context);
     const suspended=/suspendu|suspended|interrompu/.test(context);
     // Sans horloge lisible, ou après 90' sans confirmation de fin, la source
     // textuelle est trop ambiguë pour publier un score/statut fiable.
     if(minute==null||minute>=90&&!done){cursor=ai+away.length;continue;}
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
 // Garde-fou : une rencontre ne peut pas être EN DIRECT avant son coup d'envoi local.
 // MatchEnDirect peut rapprocher par erreur un score voisin d'un match futur.
 const parisParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const parisNow=parisParts.filter(p=>['year','month','day','hour','minute'].includes(p.type)).reduce((o,p)=>(o[p.type]=p.value,o),{});
 const nowKey=parisNow.year+'-'+parisNow.month+'-'+parisNow.day+'T'+parisNow.hour+':'+parisNow.minute;
 const beforeKickoff=m=>!!(m&&m.d&&m.h&&String(m.d)+'T'+String(m.h).slice(0,5)>nowKey);
 const parisNowMs=Date.UTC(Number(parisNow.year),Number(parisNow.month)-1,Number(parisNow.day),Number(parisNow.hour),Number(parisNow.minute));
 // Filet de sécurité : un match encore marqué live plus de 1 h 50 après
 // son coup d'envoi local est clôturé si le fournisseur tarde à envoyer le FT.
 const afterExpectedEnd=m=>{
  if(!m||!m.d||!m.h)return false;
  const [y,mo,d]=String(m.d).split('-').map(Number);
  const [hh,mm]=String(m.h).slice(0,5).split(':').map(Number);
  if(!y||!mo||!d||!Number.isFinite(hh)||!Number.isFinite(mm))return false;
  return parisNowMs>=Date.UTC(y,mo-1,d,hh,mm)+110*60000;
 };
 const impossibleBeforeKickoff=['IN_PLAY','PAUSED','FINISHED'];
 // Un score final déjà enregistré (notamment le 5-0 Allemagne–Pays-Bas) est prioritaire sur tout ancien statut live.
 // Cela empêche un match terminé de rester bloqué sur MI-TEMPS si une source
 // secondaire renvoie encore un état PAUSED ou ne renvoie plus l'événement.
 for(const m of matches){
  if(Array.isArray(m.r)&&m.r.length===2&&m.r.every(Number.isFinite)){
   const finalScore=[m.r[0],m.r[1]];
   const scoreChanged=JSON.stringify(m.liveScore||null)!==JSON.stringify(finalScore);
   if(m.liveStatus!=='FINISHED'||scoreChanged||m.liveMinute!=null||m.liveAdded!=null){
    m.liveStatus='FINISHED';m.liveScore=finalScore;m.liveMinute=null;m.liveAdded=null;
    m.liveUpdatedAt=new Date().toISOString();changed++;
   }
  }
 }
 // Clôture les statuts live persistants après la durée maximale de sécurité.
 for(const m of matches){
  if(afterExpectedEnd(m)&&['IN_PLAY','PAUSED','SUSPENDED'].includes(m.liveStatus)){
   if(Array.isArray(m.liveScore)&&m.liveScore.length===2&&m.liveScore.every(Number.isFinite))m.r=[...m.liveScore];
   m.liveStatus='FINISHED';m.liveMinute=null;m.liveAdded=null;
   m.liveUpdatedAt=new Date().toISOString();changed++;
  }
 }
 // Efface un état live trop ancien si aucune source ne confirme encore le match.
 // On préfère afficher une donnée manquante plutôt qu'un faux EN DIRECT/MI-TEMPS figé.
 const staleBefore=Date.now()-10*60*1000;
 for(const m of matches){
  if(['IN_PLAY','PAUSED','SUSPENDED'].includes(m.liveStatus)&&m.liveUpdatedAt&&Date.parse(m.liveUpdatedAt)<staleBefore){
   delete m.liveStatus;delete m.liveMinute;delete m.liveAdded;delete m.liveScore;
   delete m.liveUpdatedAt;delete m.liveSource;changed++;
  }
 }
 // Nettoie aussi les statuts erronés déjà enregistrés (ex. Norvège avant 18h).
 for(const m of matches){
  if(beforeKickoff(m)&&impossibleBeforeKickoff.includes(m.liveStatus)){
   delete m.liveStatus;delete m.liveMinute;delete m.liveAdded;delete m.liveScore;
   delete m.liveUpdatedAt;delete m.liveSource;changed++;
  }
 }
 for(const f of fetched){
  const m=ids.get(String(f.id));if(!m)continue;
  if(beforeKickoff(m)&&impossibleBeforeKickoff.includes(f.status))continue;
  if(!['IN_PLAY','PAUSED','FINISHED','SUSPENDED','POSTPONED','CANCELLED','AWARDED'].includes(f.status))continue;
  tracked++;
  const rawScore=f.score&&f.score.fullTime;
  const liveScore=rawScore&&Number.isFinite(rawScore.home)&&Number.isFinite(rawScore.away)?[rawScore.home,rawScore.away]:null;
  const minute=Number.isFinite(f.minute)?f.minute:null,added=Number.isFinite(f.injuryTime)?f.injuryTime:null;let status=f.status||null;
  if(afterExpectedEnd(m)&&['IN_PLAY','PAUSED','SUSPENDED'].includes(status))status='FINISHED';
  const scoreChanged=JSON.stringify(m.liveScore||null)!==JSON.stringify(liveScore);
  const sourcePriority={'MatchEnDirect':1,'Football-Data':3,'ESPN':4};
  const incomingPriority=sourcePriority[f.source]||0,currentPriority=sourcePriority[m.liveSource]||0;
  // MI-TEMPS n'est pas un état final : un match peut reprendre en IN_PLAY.
  // On accepte donc la transition PAUSED -> IN_PLAY, même si la source entrante
  // est secondaire. Seul FINISHED est irréversible.
  const finalIncoming=status==='FINISHED';
  const finalCurrent=m.liveStatus==='FINISHED';
  if(finalCurrent&&!finalIncoming)continue;
  const resumeAfterHalftime=m.liveStatus==='PAUSED'&&status==='IN_PLAY';
  if(incomingPriority<currentPriority&&!resumeAfterHalftime&&!finalIncoming)continue;
  const changedNow=m.liveStatus!==status||m.liveMinute!==minute||m.liveAdded!==added||scoreChanged||m.liveSource!==f.source;
  if(!changedNow){
   // Une source structurée qui confirme encore l'événement rafraîchit aussi
   // sa fraîcheur, même si le score et la minute n'ont pas changé (mi-temps).
   if(f.source!=='MatchEnDirect')m.liveUpdatedAt=new Date().toISOString();
   continue;
  }
  m.liveStatus=status;m.liveMinute=minute;m.liveAdded=added;m.liveScore=liveScore;m.liveUpdatedAt=new Date().toISOString();m.liveSource=f.source;
  if(status==='FINISHED'&&liveScore)m.r=liveScore;
  changed++;
 }
 if(changed>0){
  fs.writeFileSync(file,JSON.stringify(data));
  // L'application charge data.js : synchronise aussi les statuts live dans M.
  const jsFile='data.js';
  if(fs.existsSync(jsFile)){
   let js=fs.readFileSync(jsFile,'utf8');
   const updated=js.replace(/const M=[\s\S]*?;\s*$/, 'const M='+JSON.stringify(matches)+';');
   const fresh=updated.replace(/const UPDATED=[^;]*;/, 'const UPDATED='+JSON.stringify(new Date().toISOString())+';');
   if(fresh!==js)fs.writeFileSync(jsFile,fresh);
  }
 }
 console.log('Suivi live : '+tracked+' matchs suivis ('+fetched.length+' rencontres Football-Data/ESPN reçues, dont '+espnFetched+' ESPN), '+changed+' changements enregistrés.');
})().catch(e=>{console.error(e);process.exit(1)});
