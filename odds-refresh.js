// Actualisation légère des cotes uniquement, sans recalculer tous les pronostics.
// Le connecteur APIFootball limite get_odds à cinq jours ; voir apifootball-odds.js.
const fs = require('fs');

(async () => {
const OD = process.env.APIFOOTBALL_API_KEY;
if (!OD) { console.log('APIFOOTBALL_API_KEY absente : actualisation ignorée.'); process.exit(0); }
const file = 'data.json';
if (!fs.existsSync(file)) throw new Error('data.json introuvable');
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const matches = payload.matches || [];
const SPORT = {
  'Ligue 1':'soccer_france_ligue_one',
  'Ligue 2':'soccer_france_ligue_two',
  'Premier League':'soccer_epl',
  'Primera Division':'soccer_spain_la_liga',
  'Serie A':'soccer_italy_serie_a',
  'Bundesliga':'soccer_germany_bundesliga',
  'UEFA Champions League':'soccer_uefa_champs_league',
  'Primeira Liga':'soccer_portugal_primeira_liga',
  'Eredivisie':'soccer_netherlands_eredivisie',
  'Ligue des champions féminine':'soccer_uefa_champs_league_women',
  'Ligue des nations UEFA':'soccer_uefa_nations_league'
};
const now = Date.now();
const wall = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()).replace(' ','T')+'Z';
const wallNow = Date.parse(wall);
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const same = (a,b) => { const x=norm(a),y=norm(b); return !!x&&!!y&&(x.includes(y)||y.includes(x)); };
function findOddsMatch(events,home,away) {
  const direct=events.find(e=>same(e.h,home)&&same(e.a,away));
  if(direct)return direct;
  const reverse=events.find(e=>same(e.h,away)&&same(e.a,home));
  if(!reverse)return null;
  return {...reverse,h:home,a:away,p:Array.isArray(reverse.p)?[reverse.p[2],reverse.p[1],reverse.p[0]]:reverse.p,
    quotes:reverse.quotes?{h2h:reverse.quotes.h2h?{home:reverse.quotes.h2h.away,draw:reverse.quotes.h2h.draw,away:reverse.quotes.h2h.home}:reverse.quotes.h2h,totals:reverse.quotes.totals}:reverse.quotes};
}
const due = matches.filter(m => {
  if (m.lock || m.r || !m.d || !m.h || !SPORT[m.lg]) return false;
  const kickoff = Date.parse(m.d+'T'+m.h+':00Z');
  const mins = (kickoff-wallNow)/60000;
  if (mins < 0 || mins > 24*60) return false;
  const interval = mins <= 15 ? 5*60000 : mins <= 120 ? 15*60000 : 30*60000;
  const last = Date.parse(m.mkOddsAt || '');
  return !Number.isFinite(last) || now-last >= interval-30000;
});
if (!due.length) { console.log('Aucun match dans la fenêtre de 24 h nécessitant une actualisation des cotes.'); process.exit(0); }
let apifootballOddsPromise=null;
async function fetchOdds() {
  if(!apifootballOddsPromise)apifootballOddsPromise=require('./apifootball-odds').fetchOdds(OD);
  return apifootballOddsPromise;
}
const events = await fetchOdds();
let changed=0;
for (const m of due) {
  const ev=findOddsMatch(events,m.home,m.away);
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
if(changed) {
  payload.updatedOddsAt=new Date().toISOString();
  fs.writeFileSync(file,JSON.stringify(payload));
}
console.log('Cotes actualisées : '+changed+' match(s). Fenêtre : 24 h, fréquence 30 min au-delà de 2 h, 15 min entre 2 h et 15 min, puis 5 min avant le coup d’envoi.');
})().catch(error => { console.error(error); process.exit(1); });
