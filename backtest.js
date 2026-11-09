'use strict';
const fs = require('node:fs');

function isProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function evaluate(history) {
  const valid = (history || []).filter(e => {
    if (!e || !Array.isArray(e.p) || e.p.length !== 3 || !e.p.every(isProbability)) return false;
    // Refuse malformed 1N2 distributions instead of silently scoring impossible probabilities.
    if (Math.abs(e.p.reduce((sum, value) => sum + value, 0) - 1) > 0.005) return false;
    if (!Array.isArray(e.r) || e.r.length !== 2 ||
        !e.r.every(value => Number.isInteger(value) && value >= 0)) return false;
    if (e.b != null && !isProbability(e.b)) return false;
    if (e.o != null && !isProbability(e.o)) return false;
    return true;
  });
  const blank = () => ({ n: 0, correct: 0, brier: 0, logLoss: 0, bttsN: 0, bttsCorrect: 0, over25N: 0, over25Correct: 0 });
  const total = blank();
  const leagues = {};
  for (const e of valid) {
    const target = e.r[0] > e.r[1] ? 0 : e.r[0] === e.r[1] ? 1 : 2;
    const max = Math.max(...e.p);
    const hit = e.p.indexOf(max) === target;
    const score = e.p.reduce((s, p, i) => s + (p - (i === target ? 1 : 0)) ** 2, 0);
    const loss = -Math.log(Math.max(1e-15, e.p[target]));
    const groups = [total, leagues[e.lg || 'Non renseigné'] || (leagues[e.lg || 'Non renseigné'] = blank())];
    for (const g of groups) {
      g.n++;
      if (hit) g.correct++;
      g.brier += score;
      g.logLoss += loss;
      if (typeof e.b === 'number') {
        g.bttsN++;
        if ((e.b >= 0.5) === (e.r[0] > 0 && e.r[1] > 0)) g.bttsCorrect++;
      }
      if (typeof e.o === 'number') {
        g.over25N++;
        if ((e.o >= 0.5) === (e.r[0] + e.r[1] > 2)) g.over25Correct++;
      }
    }
  }
  const finish = g => ({
    matches: g.n,
    accuracy: g.n ? +(100 * g.correct / g.n).toFixed(1) : null,
    brier: g.n ? +(g.brier / g.n).toFixed(4) : null,
    logLoss: g.n ? +(g.logLoss / g.n).toFixed(4) : null,
    bttsAccuracy: g.bttsN ? +(100 * g.bttsCorrect / g.bttsN).toFixed(1) : null,
    over25Accuracy: g.over25N ? +(100 * g.over25Correct / g.over25N).toFixed(1) : null
  });
  return {
    total: finish(total),
    leagues: Object.fromEntries(Object.entries(leagues).map(([name, value]) => [name, finish(value)])),
    ignored: (history || []).length - valid.length,
    warning: valid.length < 100 ? 'Échantillon trop petit pour conclure : viser au moins 100 matchs, idéalement plusieurs centaines.' : null
  };
}

if (require.main === module) {
  const file = process.argv[2] || 'data.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(evaluate(data.hist || []), null, 2));
}
module.exports = { evaluate };