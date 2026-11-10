'use strict';
const assert = require('node:assert/strict');
const { predictedScorerName, scorerHit, buildHistoryEntry } = require('../history');

assert.equal(predictedScorerName('Kylian Mbappé (13 buts) · 72 % estimés'), 'Kylian Mbappé');
assert.equal(scorerHit('Kylian Mbappé', [{ scorer: { name: 'Kylian Mbappé' } }]), true);
assert.equal(scorerHit('Kylian Mbappé', [{ scorer: { name: 'Vinícius Júnior' } }]), false);
assert.equal(scorerHit('Kylian Mbappé', []), false);
assert.equal(scorerHit('Kylian Mbappé', undefined), null);
assert.equal(scorerHit('Kylian Mbappé', [{ assist: { name: 'Joueur' } }]), null);

const entry = buildHistoryEntry({
  id: 123, d: '2026-11-10', lg: 'Ligue 1',
  p1: 0.5, pN: 0.25, p2: 0.25, btts: 0.6, o25: 0.55,
  x: [1.7, 1.1], q: [0.48, 0.27, 0.25], r: [2, 1],
  pt: '2026-11-10T10:00:00.000Z',
  bt: 'Kylian Mbappé (13 buts) · 72 % estimés', btp: 0.72, btSource: 'openai'
}, [{ scorer: { name: 'Kylian Mbappé' } }]);
assert.equal(entry.bt, 'Kylian Mbappé');
assert.equal(entry.bp, 0.72);
assert.equal(entry.bs, 'openai');
assert.equal(entry.bh, true);
assert.equal(entry.t, '2026-11-10T10:00:00.000Z');
console.log('OK — archivage horodaté et évaluation des buteurs');
