'use strict';
const assert = require('node:assert/strict');
const { pickScorer } = require('../scorer');

const home = { gf: 30, w: 20 };
const away = { gf: 20, w: 20 };
const players = [
  { team: { id: 1 }, player: { name: 'Buteur A' }, goals: 10, playedMatches: 20 },
  { team: { id: 2 }, player: { name: 'Buteur B' }, goals: 8, playedMatches: 10 },
  { team: { id: 1 }, player: { name: 'Trop peu de matchs' }, goals: 2, playedMatches: 4 },
  { team: { id: 1 }, player: { name: 'Données incomplètes' }, goals: null, playedMatches: 12 }
];

const result = pickScorer(players, home, away, [1.5, 1.2], 1, 2);
assert.match(result.bt, /^Buteur B/);
assert.ok(result.btp > 0 && result.btp <= 1);
assert.deepEqual(pickScorer([], home, away, [1, 1], 1, 2), { bt: '', btp: 0 });
assert.deepEqual(pickScorer(players, null, away, [1, 1], 1, 2), { bt: 'Buteur B (8 buts en 10 matchs) · 55 % de marquer', btp: 0.551 });
assert.deepEqual(pickScorer(players, home, away, [0, 0], 1, 2), { bt: '', btp: 0 });
console.log('OK — tests de sélection statistique des buteurs Pronokikz');
