// Moteur probabiliste Pronokikz v2 — module pur, sans dépendance externe.
// Les sorties sont des estimations statistiques, jamais des garanties.
'use strict';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function weightedRecent(team, key, fallback) {
  const rows = Array.isArray(team.last) ? team.last.slice(-5) : [];
  const valid = rows.filter(x => Number.isFinite(x[key]));
  if (!valid.length) return fallback;
  let total = 0, weight = 0;
  valid.forEach((row, i) => {
    const w = i + 1; // poids croissant : le match le plus récent pèse davantage
    total += row[key] * w;
    weight += w;
  });
  return total / weight;
}

function smoothedRate(total, games, priorRate, priorGames = 5) {
  if (!Number.isFinite(total) || !Number.isFinite(games) || games < 0) return priorRate;
  return (total + priorRate * priorGames) / (games + priorGames);
}

function teamRates(team, venue, leagueAvg) {
  const home = venue === 'home';
  const venueGames = home ? team.hg : team.ag;
  const venueFor = home ? team.hgf : team.agf;
  const venueAgainst = home ? team.hga : team.aga;
  const overallFor = team.g ? team.gf / team.g : leagueAvg;
  const overallAgainst = team.g ? team.ga / team.g : leagueAvg;
  const venueForRate = smoothedRate(venueFor, venueGames, leagueAvg);
  const venueAgainstRate = smoothedRate(venueAgainst, venueGames, leagueAvg);
  const seasonFor = Number.isFinite(overallFor) ? overallFor : leagueAvg;
  const seasonAgainst = Number.isFinite(overallAgainst) ? overallAgainst : leagueAvg;
  const recentFor = weightedRecent(team, 'gf', seasonFor);
  const recentAgainst = weightedRecent(team, 'ga', seasonAgainst);

  // Mélange prudent du rendement au lieu, de la saison et de la forme récente.
  return {
    attack: 0.55 * venueForRate + 0.25 * seasonFor + 0.20 * recentFor,
    defence: 0.55 * venueAgainstRate + 0.25 * seasonAgainst + 0.20 * recentAgainst
  };
}

function poisson(lambda, maxGoals) {
  const out = [Math.exp(-lambda)];
  for (let i = 1; i <= maxGoals; i++) out[i] = out[i - 1] * lambda / i;
  return out;
}

function predictMatch(home, away, options = {}) {
  if (!home || !away) throw new TypeError('Les statistiques des deux équipes sont nécessaires.');
  const leagueHome = Number.isFinite(options.leagueHomeAvg) ? options.leagueHomeAvg : 1.45;
  const leagueAway = Number.isFinite(options.leagueAwayAvg) ? options.leagueAwayAvg : 1.15;
  const h = teamRates(home, 'home', leagueHome);
  const a = teamRates(away, 'away', leagueAway);

  let homeXg = (h.attack + a.defence) / 2;
  let awayXg = (a.attack + h.defence) / 2;

  // Ajustement Elo volontairement modéré pour éviter qu'un seul indicateur domine.
  const eloHome = Number.isFinite(home.elo) ? home.elo : 1500;
  const eloAway = Number.isFinite(away.elo) ? away.elo : 1500;
  const eloFactor = clamp((eloHome - eloAway) / 400, -1.5, 1.5);
  homeXg *= Math.exp(0.10 * eloFactor);
  awayXg *= Math.exp(-0.10 * eloFactor);

  homeXg = clamp(homeXg, 0.15, 4.2);
  awayXg = clamp(awayXg, 0.15, 4.2);

  const maxGoals = 10;
  const hp = poisson(homeXg, maxGoals);
  const ap = poisson(awayXg, maxGoals);
  const rho = -0.08;
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0, over25 = 0;
  let best = { p: -1, home: 0, away: 0 };
  let total = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      let p = hp[i] * ap[j];
      // Correction Dixon-Coles limitée aux petits scores.
      if (i === 0 && j === 0) p *= 1 - homeXg * awayXg * rho;
      else if (i === 0 && j === 1) p *= 1 + homeXg * rho;
      else if (i === 1 && j === 0) p *= 1 + awayXg * rho;
      else if (i === 1 && j === 1) p *= 1 - rho;
      p = Math.max(0, p);
      total += p;
      if (i > j) homeWin += p;
      else if (i === j) draw += p;
      else awayWin += p;
      if (i > 0 && j > 0) btts += p;
      if (i + j > 2) over25 += p;
      if (p > best.p) best = { p, home: i, away: j };
    }
  }

  const round = x => Math.round((x / total) * 1000) / 1000;
  return {
    p1: round(homeWin),
    pN: round(draw),
    p2: round(awayWin),
    btts: round(btts),
    o25: round(over25),
    xgHome: Math.round(homeXg * 100) / 100,
    xgAway: Math.round(awayXg * 100) / 100,
    score: best.home + '-' + best.away
  };
}

module.exports = { predictMatch, poisson, smoothedRate };
