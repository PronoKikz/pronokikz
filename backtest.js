'use strict';
const fs = require('node:fs');

function evaluate(history) {
  const valid = (history || []).filter(e => Array.isArray(e.p) && e.p.length === 3 &&
    e.p.every(Number.isFinite) && e.p.every(p => p >= 0 && p <= 1) &&
    Array.isArray(e.r) && e.r.length === 2 && e.r.every(Number.isFinite));
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
  return { total: finish(total), leagues: Object.fromEntries(Object.entries(leagues).map(([name, value]) => [name, finish(value)])), warning: valid.length < 100 ? 'Échantillon trop petit pour conclure : viser au moins 100 matchs, idéalement plusieurs centaines.' : null };
}

if (require.main === module) {
  const file = process.argv[2] || 'data.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(evaluate(data.hist || []), null, 2));
}
module.exports = { evaluate };
