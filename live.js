// Pronokikz Live v2 — suivi strict : minute fournisseur uniquement, heartbeat des matchs en cours.
const fs=require('fs');
const KEY=process.env.FOOTBALL_DATA_API_KEY||process.env.FOOTBALL_DATA_KEY||'';
const LEAGUES=[...new Set((process.env.LEAGUES||'FL1,PL,PD,SA,BL1,CL,PPL,ELC,FL2').split(',').map(x=>x.trim()).filter(x=>x&&x!=='DED'))];
const ESPN=['eng.1','esp.1','ita.1','ger.1','fra.1','por.1','uefa.champions','uefa.europa','uefa.nations','uefa.wchampions'];
const day=n=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(Date.now()+n*864e5));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const score=(h,a)=>h!=null&&a!=null&&Number.isFinite(Number(h))&&Number.isFinite(Number(a))?[Number(h),Number(a)]:null;
const mapStatus=s=>({IN_PLAY:'IN_PLAY',PAUSED:'PAUSED',FINISHED:'FINISHED',SUSPENDED:'SUSPENDED',POSTPONED:'POSTPONED',CANCELLED:'CANCELLED',AWARDED:'FINISHED'})[s]||null;
// Horloge ESPN de l'événement correspondant uniquement. Aucun calcul local de minute.
function clockOf(event,comp){
 const vals=[comp?.status?.type?.shortDetail,comp?.status?.type?.detail,event?.status?.type?.shortDetail,event?.status?.type?.detail,comp?.status?.displayClock,event?.status?.displayClock].filter(Boolean);
 for(const v of vals){const s=String(v);let m=s.match(/\b(\d{1,3})\s*\+\s*(\d{1,2})\s*['’]?/);if(m)return {minute:+m[1],added:+m[2]};
 m=s.match(/\b(\d{1,3})\s*['’]/);if(m)return {minute:+m[1],added:null};
 if(/^\d{1,2}:\d{2}$/.test(s)&&String(comp?.status?.type?.state||event?.status?.type?.state)==='in')return {minute:+s.split(':')[0],added:null};}
 return {minute:null,added:null};
}
(async()=>{
 const data=JSON.parse(fs.readFileSync('data.json','utf8')),matches=data.matches||[],byId=new Map(matches.map(m=>[String(m.id),m])),updates=new Map();
 const from=day(-1),to=day(2);
 if(KEY){
  const packs=await Promise.all(LEAGUES.map(async c=>{try{const r=await fetch('https://api.football-data.org/v4/competitions/'+c+'/matches?dateFrom='+from+'&dateTo='+to,{headers:{'X-Auth-Token':KEY}});if(!r.ok)throw Error('HTTP '+r.status);return (await r.json()).matches||[];}catch(e){console.log('Football-Data '+c+': '+e.message);return [];}}));
  for(const x of packs.flat()){const m=byId.get(String(x.id)),st=mapStatus(x.status);if(!m||!st)continue;updates.set(String(m.id),{status:st,score:score(x.score?.fullTime?.home,x.score?.fullTime?.away),minute:null,added:null,source:'Football-Data'});}
 }
 const dates=[-1,0,1,2].map(n=>day(n).replace(/-/g,''));
 const packs=await Promise.all(ESPN.flatMap(l=>dates.map(async d=>{try{const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/'+l+'/scoreboard?dates='+d);if(!r.ok)throw Error('HTTP '+r.status);return (await r.json()).events||[];}catch(e){console.log('ESPN '+l+': '+e.message);return [];}})));
 for(let i=0;i<packs.length;i++){const events=packs[i],league=ESPN[Math.floor(i/4)];for(const e of events){
  const c=(e.competitions||[])[0],ts=c?.competitors||[],h=ts.find(t=>t.homeAway==='home'),a=ts.find(t=>t.homeAway==='away');if(!h||!a)continue;
  const type=c?.status?.type||e.status?.type||{},state=String(type.state||'').toLowerCase();
  const detail=[type.name,type.description,type.detail,type.shortDetail].filter(Boolean).join(' ');const halftime=/half.?time|halftime|break/i.test(detail);const st=type.completed||state==='post'?'FINISHED':halftime?'PAUSED':state==='in'?'IN_PLAY':null;if(!st)continue;
  let m=null;if(league==='uefa.nations')m=byId.get('nations-'+e.id);if(league==='uefa.wchampions')m=byId.get('uwcl-'+e.id);
  if(!m){const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(e.date));const hn=norm(h.team?.displayName||h.team?.name),an=norm(a.team?.displayName||a.team?.name);m=matches.find(x=>x.d===d&&norm(x.home)===hn&&norm(x.away)===an);}
  if(!m)continue;const cl=st==='IN_PLAY'?clockOf(e,c):{minute:null,added:null};
  updates.set(String(m.id),{status:st,score:score(h.score,a.score),minute:cl.minute,added:cl.added,source:'ESPN'});
 }}
 const now=new Date().toISOString();let changed=0;
 for(const m of matches){const u=updates.get(String(m.id));if(!u){
  if(['IN_PLAY','PAUSED','SUSPENDED'].includes(m.liveStatus)&&m.liveUpdatedAt&&Date.now()-Date.parse(m.liveUpdatedAt)>8*60000){for(const k of ['liveStatus','liveScore','liveMinute','liveAdded','liveUpdatedAt','liveSource'])delete m[k];changed++;}continue;}
  if(m.liveStatus==='FINISHED'&&u.status!=='FINISHED')continue;
  const sc=u.score||m.liveScore||null,min=u.status==='IN_PLAY'?u.minute:null,add=u.status==='IN_PLAY'?u.added:null;
  const previousUpdate=Date.parse(m.liveUpdatedAt||'');const heartbeatDue=['IN_PLAY','PAUSED','SUSPENDED'].includes(u.status)&&(!Number.isFinite(previousUpdate)||Date.now()-previousUpdate>120000);
  if(m.liveStatus!==u.status||JSON.stringify(m.liveScore||null)!==JSON.stringify(sc)||m.liveMinute!==min||m.liveAdded!==add||m.liveSource!==u.source||heartbeatDue)changed++;
  m.liveStatus=u.status;m.liveScore=sc;m.liveMinute=min;m.liveAdded=add;m.liveUpdatedAt=now;m.liveSource=u.source;
  if(u.status==='FINISHED'&&sc)m.r=sc;
 }
 if(changed){data.updatedAt=now;fs.writeFileSync('data.json',JSON.stringify(data));let js=fs.readFileSync('data.js','utf8');js=js.replace(/const M=[\s\S]*?;\s*$/,'const M='+JSON.stringify(matches)+';').replace(/const UPDATED=[^;]*;/,'const UPDATED='+JSON.stringify(now)+';');fs.writeFileSync('data.js',js);}
 console.log('Pronokikz Live v2: '+updates.size+' matchs reconnus, '+changed+' changements. Aucun chrono inventé.');
})().catch(e=>{console.error(e);process.exit(1)});
