'use strict';
const { model } = require('./predictor');
const DAY = 86400000;
const HALF_LIFE_DAYS = 120;
const MIN_EFFECTIVE_LEAGUE_MATCHES = 20;
const MIN_TEAM_MATCHES = 3;

function isFinished(m) {
  return m && m.status === 'FINISHED' && m.score && m.score.fullTime &&
    Number.isFinite(m.score.fullTime.home) && Number.isFinite(m.score.fullTime.away) &&
    m.homeTeam && m.awayTeam && m.homeTeam.id != null && m.awayTeam.id != null;
}

function weightedStats(matches, cutoff) {
  const teams = new Map();
  let homeGoals = 0, awayGoals = 0, totalWeight = 0;
  const get = id => {
    if (!teams.has(id)) teams.set(id, { games:0,gf:0,ga:0,weight:0,homeGames:0,homeGF:0,homeGA:0,homeWeight:0,awayGames:0,awayGF:0,awayGA:0,awayWeight:0 });
    return teams.get(id);
  };
  for (const m of matches) {
    const time = Date.parse(m.utcDate);
    if (!Number.isFinite(time) || time >= cutoff || !isFinished(m)) continue;
    const w = Math.pow(0.5, Math.max(0, cutoff-time)/DAY/HALF_LIFE_DAYS);
    const hg=m.score.fullTime.home, ag=m.score.fullTime.away;
    const h=get(m.homeTeam.id), a=get(m.awayTeam.id);
    h.games++; h.gf+=hg*w; h.ga+=ag*w; h.weight+=w; h.homeGames++; h.homeGF+=hg*w; h.homeGA+=ag*w; h.homeWeight+=w;
    a.games++; a.gf+=ag*w; a.ga+=hg*w; a.weight+=w; a.awayGames++; a.awayGF+=ag*w; a.awayGA+=hg*w; a.awayWeight+=w;
    homeGoals+=hg*w; awayGoals+=ag*w; totalWeight+=w;
  }
  return {teams,homeAverage:totalWeight?homeGoals/totalWeight:1.45,awayAverage:totalWeight?awayGoals/totalWeight:1.15,leagueGames:totalWeight};
}

function venueRates(team, venue, league) {
  const home=venue==='home', weight=home?team.homeWeight:team.awayWeight;
  const gf=home?team.homeGF:team.awayGF, ga=home?team.homeGA:team.awayGA;
  const baseGF=home?league.homeAverage:league.awayAverage, baseGA=home?league.awayAverage:league.homeAverage;
  return {attack:(gf+4*baseGF)/(weight+4)/baseGF,defence:(ga+4*baseGA)/(weight+4)/baseGA};
}

function predictBeforeMatch(match, allMatches) {
  const kickoff=Date.parse(match.utcDate);
  if (!Number.isFinite(kickoff)) return null;
  const comp=match.competition&&(match.competition.code||match.competition.id||match.competition.name);\n  // Sans identifiant de compétition fiable, ne jamais mélanger les statistiques de plusieurs ligues.\n  if (comp == null) return null;
  const prior=allMatches.filter(m=>{
    if (!isFinished(m)||Date.parse(m.utcDate)>=kickoff) return false;
    const key=m.competition&&(m.competition.code||m.competition.id||m.competition.name);
    return key===comp;
  });
  const league=weightedStats(prior,kickoff), home=league.teams.get(match.homeTeam.id), away=league.teams.get(match.awayTeam.id);
  if (league.leagueGames<MIN_EFFECTIVE_LEAGUE_MATCHES||!home||!away||home.games<MIN_TEAM_MATCHES||away.games<MIN_TEAM_MATCHES) return null;
  const h=venueRates(home,'home',league), a=venueRates(away,'away',league);
  const lh=Math.max(.15,Math.min(4.5,league.homeAverage*h.attack*a.defence));
  const la=Math.max(.15,Math.min(4.5,league.awayAverage*a.attack*h.defence));
  return {...model(lh,la),lambdaHome:lh,lambdaAway:la,priorMatches:prior.length};
}

function evaluateMatches(matches) {
  const finished=(matches||[]).filter(isFinished).slice().sort((a,b)=>Date.parse(a.utcDate)-Date.parse(b.utcDate));
  const predictions=[], skipped={insufficientHistory:0,invalid:(matches||[]).length-finished.length};
  for (const m of finished) {
    const p=predictBeforeMatch(m,finished);
    if (!p) { skipped.insufficientHistory++; continue; }
    const hg=m.score.fullTime.home, ag=m.score.fullTime.away, outcome=hg>ag?0:hg===ag?1:2;
    const probs=[p.p1,p.pN,p.p2], best=probs.indexOf(Math.max(...probs));
    const brier=probs.reduce((s,v,i)=>s+(v-(i===outcome?1:0))**2,0);
    predictions.push({date:m.utcDate,competition:m.competition?.name||'Inconnue',home:m.homeTeam.name,away:m.awayTeam.name,score:`${hg}-${ag}`,probabilities:probs.map(v=>Number(v.toFixed(4))),predicted:['1','N','2'][best],correct:best===outcome,brier,logLoss:-Math.log(Math.max(1e-12,probs[outcome])),bttsProbability:p.btts,over25Probability:p.o25,priorMatches:p.priorMatches});
  }
  const n=predictions.length, sum=k=>predictions.reduce((s,p)=>s+p[k],0);
  const report={matchesTested:n,accuracy1x2:n?sum('correct')/n:null,brierScore:n?sum('brier')/n:null,logLoss:n?sum('logLoss')/n:null,bttsAccuracy:null,over25Accuracy:null,skipped,predictions};
  if(n){
    report.bttsAccuracy=predictions.filter(p=>(p.bttsProbability>=.5)===(Number(p.score.split('-')[0])>0&&Number(p.score.split('-')[1])>0)).length/n;
    report.over25Accuracy=predictions.filter(p=>(p.over25Probability>=.5)===(Number(p.score.split('-')[0])+Number(p.score.split('-')[1])>2)).length/n;
  }
  return report;
}

async function main() {
  try { require('dotenv').config(); } catch(e) { if(e.code!=='MODULE_NOT_FOUND') throw e; }
  const key=process.env.FOOTBALL_DATA_API_KEY||process.env.FOOTBALL_DATA_KEY;
  if(!key) throw new Error('Clé API manquante : FOOTBALL_DATA_API_KEY (ou FOOTBALL_DATA_KEY).');
  const codes=(process.env.LEAGUES||'FL1,PL,PD,SA,BL1,PPL,DED,ELC').split(',').map(s=>s.trim()).filter(Boolean);
  const now=new Date(), season=now.getUTCMonth()>=7?now.getUTCFullYear():now.getUTCFullYear()-1, all=[];
  for(let i=0;i<codes.length;i++){
    const code=codes[i], url=`https://api.football-data.org/v4/competitions/${encodeURIComponent(code)}/matches?season=${season}&status=FINISHED`;
    const response=await fetch(url,{headers:{'X-Auth-Token':key}});
    if(!response.ok) throw new Error(`${code}: API Football Data répond ${response.status}`);
    const body=await response.json(); all.push(...(body.matches||[]));
    console.log(`${code}: ${(body.matches||[]).length} matchs terminés récupérés`);
    if(i<codes.length-1) await new Promise(resolve=>setTimeout(resolve,6500));
  }
  const r=evaluateMatches(all);
  console.log('\n=== BACKTEST CHRONOLOGIQUE PRONOKIKZ ===');
  console.log(`Matchs testés : ${r.matchesTested}`);
  console.log(`Matchs ignorés (historique insuffisant) : ${r.skipped.insufficientHistory}`);
  console.log(`Précision 1N2 : ${r.accuracy1x2==null?'N/A':(r.accuracy1x2*100).toFixed(1)+'%'}`);
  console.log(`Brier score : ${r.brierScore==null?'N/A':r.brierScore.toFixed(4)} (plus bas = mieux)`);
  console.log(`Log loss : ${r.logLoss==null?'N/A':r.logLoss.toFixed(4)} (plus bas = mieux)`);
  console.log(`BTTS : ${r.bttsAccuracy==null?'N/A':(r.bttsAccuracy*100).toFixed(1)+'%'}`);
  console.log(`Plus de 2,5 buts : ${r.over25Accuracy==null?'N/A':(r.over25Accuracy*100).toFixed(1)+'%'}`);
  if(r.matchesTested<100) console.log('Échantillon limité : viser au moins 100 matchs, idéalement plusieurs centaines.');
  if(process.env.WALKFORWARD_JSON==='1') require('node:fs').writeFileSync('walkforward-report.json',JSON.stringify(r,null,2));
}
if(require.main===module) main().catch(e=>{console.error(e.message);process.exit(1)});
module.exports={evaluateMatches,predictBeforeMatch,weightedStats};
