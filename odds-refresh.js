// Actualisation légère des cotes uniquement, sans recalculer tous les pronostics.
const fs = require('fs');
const OD = process.env.ODDS_API_KEY;
if (!OD) { console.log('ODDS_API_KEY absente : actualisation ignorée.'); process.exit(0); }
const file = 'data.json';
if (!fs.existsSync(file)) throw new Error('data.json introuvable');
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const matches = payload.matches || [];
const SPORT = {
  'Ligue 1':'soccer_france_ligue_one',
  'Premier League':'soccer_epl',
  'Primera Division':'soccer_spain_la_liga',
  'Serie A':'soccer_italy_serie_a',
  'Bundesliga':'soccer_germany_bundesliga',
  'UEFA Champions League':'soccer_uefa_champs_league',
  'Primeira Liga':'soccer_portugal_primeira_liga',
  'Eredivisie':'soccer_netherlands_eredivisie',
  'Championship':'soccer_efl_champ',
  'Ligue des champions féminine':'soccer_uefa_champs_league_women',
  'Ligue des nations UEFA':'soccer_uefa_nations_league'
};
const now = Date.now();
const wall = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()).replace(' ','T')+'Z';
const wallNow = Date.parse(wall);
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const same = (a,b) => { const x=norm(a),y=norm(b); return !!x&&!!y&&(x.includes(y)||y.includes(x)); };
const due = matches.filter(m => {
  if (m.lock || m.r || !m.d || !m.h || !SPORT[m.lg]) return false;
  const kickoff = Date.parse(m.d+'T'+m.h+':00Z');
  const mins = (kickoff-wallNow)/60000;
  if (mins < 0 || mins > 120) return false;
  const interval = mins <= 15 ? 5*60000 : 15*60000;
  const last = Date.parse(m.mkOddsAt || '');
  return !Number.isFinite(last) || now-last >= interval-30000;
});
if (!due.length) { console.log('Aucun match dans sa fenêtre de rafraîchissement des cotes.'); process.exit(0); }
const leagues = [...new Set(due.map(m=>m.lg))];
async function fetchOdds(code) {
  const url = 'https://api.the-odds-api.com/v4/sports/'+SPORT[code]+'/odds/?apiKey='+OD+'&regions=eu&markets=h2h,totals&oddsFormat=decimal';
  const res = await fetch(url);
  if (!res.ok) throw new Error('The Odds API '+code+' : HTTP '+res.status);
  return res.json();
}
function marketEvent(e) {
  const best={h2h:{},totals:{}}, p=[0,0,0]; let n=0,o=0,on=0;
  const save=(slot,key,price,bookmaker)=>{if(Number.isFinite(price)&&price>1&&(!best[slot][key]||price>best[slot][key].price))best[slot][key]={price,bookmaker};};
  for (const b of (e.bookmakers||[])) for (const mk of (b.markets||[])) {
    if (mk.key==='h2h') {
      const get=name=>mk.outcomes.find(x=>x.name===name);
      const h=get(e.home_team),d=get('Draw'),a=get(e.away_team);
      const inv=[h,d,a].map(x=>x&&x.price>1?1/x.price:0),total=inv.reduce((s,x)=>s+x,0);
      if(total&&inv.every(Boolean)){inv.forEach((x,i)=>p[i]+=x/total);n++;}
      save('h2h','home',h&&h.price,b.title); save('h2h','draw',d&&d.price,b.title); save('h2h','away',a&&a.price,b.title);
    }
    if(mk.key==='totals') {
      const over=mk.outcomes.find(x=>x.name==='Over'&&x.point===2.5),under=mk.outcomes.find(x=>x.name==='Under'&&x.point===2.5);
      if(over&&under&&over.price>1&&under.price>1){o+=(1/over.price)/(1/over.price+1/under.price);on++;}
      save('totals','over25',over&&over.price,b.title); save('totals','under25',under&&under.price,b.title);
    }
  }
  return {h:e.home_team,a:e.away_team,p:n?p.map(x=>x/n):null,o:on?o/on:null,quotes:best,oddsAt:new Date().toISOString()};
}
let changed=0;
for (const league of leagues) {
  try {
    const events=(await fetchOdds(league)).map(marketEvent);
    for (const m of due.filter(x=>x.lg===league)) {
      const ev=events.find(e=>(same(e.h,m.home))&&(same(e.a,m.away)));
      if(!ev) { console.log('Pas de cote correspondante : '+m.home+' - '+m.away); continue; }
      m.mkOdds=ev.quotes; m.mkOddsAt=ev.oddsAt;
      if(ev.p) {
        const base=m.raw||{p1:m.p1,pN:m.pN,p2:m.p2,o25:m.o25};
        const model=[base.p1,base.pN,base.p2],total=model.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
        if(model.every(Number.isFinite)&&total>0) {
          const probs=model.map((x,i)=>0.15*x/total+0.85*ev.p[i]);
          const sum=probs.reduce((s,x)=>s+x,0),final=probs.map(x=>Math.round(x/sum*1000)/1000);
          m.mk=1; m.mkp=ev.p.map(x=>Math.round(x*1000)/1000);
          m.b0=final; [m.p1,m.pN,m.p2]=final;
        }
        if(ev.o!=null&&base.o25!=null)m.o25=Math.round((0.5*base.o25+0.5*ev.o)*1000)/1000;
      }
      changed++;
    }
  } catch (e) { console.log(e.message); }
}
if(changed) {
  payload.updatedOddsAt=new Date().toISOString();
  fs.writeFileSync(file,JSON.stringify(payload));
}
console.log('Cotes actualisées : '+changed+' match(s). Fenêtres : 15 min à moins de 2 h du coup d’envoi, puis 5 min dans les 15 dernières minutes.');
