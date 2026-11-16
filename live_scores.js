// Mise à jour légère des scores et statuts des matchs déjà présents dans data.js.
// Exécuté indépendamment du calcul des pronostics, toutes les 5 minutes.
const fs = require('node:fs');

const token = process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_KEY;
if (!token) {
  console.error('Clé Football-Data absente (FOOTBALL_DATA_API_KEY / FOOTBALL_DATA_KEY).');
  process.exit(1);
}

const dataPath = 'data.js';
if (!fs.existsSync(dataPath)) throw new Error('data.js introuvable');
const source = fs.readFileSync(dataPath, 'utf8');
const matchBlock = source.match(/const M=(\[[\s\S]*?\]);/);
if (!matchBlock) throw new Error('Tableau M introuvable dans data.js');

const matches = JSON.parse(matchBlock[1]);
const parisDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const shiftDate = (value, days) => {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};
const dateFrom = shiftDate(parisDate, -1);
const dateTo = shiftDate(parisDate, 1);

async function main() {
  const url = 'https://api.football-data.org/v4/matches?dateFrom=' + dateFrom + '&dateTo=' + dateTo;
  const response = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error('Football-Data HTTP ' + response.status + ': ' + await response.text());
  const payload = await response.json();
  const byId = new Map((payload.matches || []).map(match => [String(match.id), match]));
  const now = new Date().toISOString();
  const validStatuses = new Set(['IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED', 'POSTPONED', 'CANCELLED', 'AWARDED']);
  let updated = 0, live = 0, finished = 0;

  for (const item of matches) {
    const match = byId.get(String(item.id));
    if (!match || !validStatuses.has(match.status)) continue;

    const fullTime = match.score && match.score.fullTime;
    const regularTime = match.score && match.score.regularTime;
    const score = fullTime && fullTime.home != null && fullTime.away != null
      ? [Number(fullTime.home), Number(fullTime.away)]
      : regularTime && regularTime.home != null && regularTime.away != null
        ? [Number(regularTime.home), Number(regularTime.away)]
        : Array.isArray(item.liveScore) ? item.liveScore : null;

    item.liveStatus = match.status;
    item.liveScore = score;
    item.liveMinute = Number.isFinite(match.minute) ? match.minute : null;
    item.liveAdded = Number.isFinite(match.injuryTime) ? match.injuryTime : null;
    item.liveUpdatedAt = now;
    item.liveSource = 'football-data.org';

    if (match.status === 'FINISHED') {
      if (score && score.every(Number.isFinite)) item.r = score;
      finished++;
    } else if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
      live++;
    }
    updated++;
  }

  const replacement = 'const M=' + JSON.stringify(matches) + ';';
  const nextSource = source.replace(/const M=\[[\s\S]*?\];/, replacement);
  if (nextSource === source) throw new Error('Impossible de réécrire les données M');
  fs.writeFileSync(dataPath, nextSource);
  console.log('Scores synchronisés :', updated, '| en direct/mi-temps :', live, '| terminés :', finished);
}

main().catch(error => {
  console.error('Échec de la synchronisation des scores :', error.message);
  process.exit(1);
});
