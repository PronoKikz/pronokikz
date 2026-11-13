'use strict';
const assert = require('node:assert/strict');
const { predictedScorerName, scorerHit, buildHistoryEntry } = require('../history');
const { evaluateAdvice } = require('../mobile/adviceHistory');

assert.equal(predictedScorerName('Kylian Mbappé (13 buts) · 72 % estimés'), 'Kylian Mbappé');
assert.equal(scorerHit('Kylian Mbappé', [{ scorer: { name: 'Kylian Mbappé' } }]), true);
assert.equal(scorerHit('Kylian Mbappé', [{ scorer: { name: 'Vinícius Júnior' } }]), false);
assert.equal(scorerHit('Kylian Mbappé', []), false);
assert.equal(scorerHit('Kylian Mbappé', undefined), null);
assert.equal(scorerHit('Kylian Mbappé', [{ assist: { name: 'Joueur' } }]), null);

const entry = buildHistoryEntry({
  id: 123, d: '2026-11-10', lg: 'Ligue 1',
  p1: 0.5, pN: 0.25, p2: 0.25, btts: 0.6, o25: 0.55,
  raw: { p1: 0.6, pN: 0.2, p2: 0.2 }, mkp: [0.45, 0.3, 0.25],
  x: [1.7, 1.1], q: [0.48, 0.27, 0.25], r: [2, 1],
  pt: '2026-11-10T10:00:00.000Z',
  bt: 'Kylian Mbappé (13 buts) · 72 % estimés', btp: 0.72, btSource: 'openai'
}, [{ scorer: { name: 'Kylian Mbappé' } }]);
assert.equal(entry.bt, 'Kylian Mbappé');
assert.deepEqual(entry.modelP, [0.6, 0.2, 0.2]);
assert.deepEqual(entry.marketP, [0.45, 0.3, 0.25]);
assert.equal(entry.bp, 0.72);
assert.equal(entry.bs, 'openai');
assert.equal(entry.bh, true);
assert.equal(entry.t, '2026-11-10T10:00:00.000Z');

const adviceMatches = [
  { id: 1, r: [2, 0] },
  { id: 2, r: [1, 1] },
  { id: 3, r: [0, 2] },
  { id: 4, r: [1, 1] }
];
const won = evaluateAdvice([
  { id: 1, market: 'Victoire domicile (1)' },
  { id: 2, market: 'Match nul (N)' }
], adviceMatches);
assert.deepEqual(won.states, [true, true]);
assert.equal(won.status, 'won');
const lostEarly = evaluateAdvice([
  { id: 1, market: 'Victoire extérieur (2)' },
  { id: 4, market: 'Match nul (N)' }
], adviceMatches);
assert.equal(lostEarly.status, 'lost');
const pending = evaluateAdvice([
  { id: 1, market: 'Victoire domicile (1)' },
  { id: 99, market: 'Match nul (N)' }
], adviceMatches);
assert.deepEqual(pending.states, [true, null]);
assert.equal(pending.status, 'pending');
assert.equal(evaluateAdvice([{ id: 1, market: 'Marché inconnu' }], adviceMatches).status, 'pending');
assert.equal(evaluateAdvice([{ id: 1, market: 'Match nul (N)' }], [{ id: 1, r: [-1, 0] }]).status, 'pending');

console.log('OK — archivage horodaté, buteurs et combinés');
