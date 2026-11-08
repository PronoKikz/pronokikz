'use strict';
const assert = require('node:assert/strict');
const { predictMatch, poisson, smoothedRate } = require('../predictor');

const balanced = {
  g: 10, gf: 14, ga: 14,
  hg: 5, hgf: 8, hga: 7,
  ag: 5, agf: 6, aga: 7,
  elo: 1500,
  last: [{ gf: 1, ga: 1 }, { gf: 2, ga: 0 }, { gf: 1, ga: 2 }, { gf: 2, ga: 1 }, { gf: 1, ga: 1 }]
};
const strong = {
  g: 10, gf: 24, ga: 8,
  hg: 5, hgf: 14, hga: 4,
  ag: 5, agf: 10, aga: 4,
  elo: 1650,
  last: [{ gf: 2, ga: 0 }, { gf: 3, ga: 1 }, { gf: 2, ga: 0 }, { gf: 3, ga: 1 }, { gf: 2, ga: 0 }]
};

assert.ok(Math.abs(poisson(1.5, 10).reduce((a, b) => a + b, 0) - 1) < 0.001);
assert.equal(smoothedRate(0, 0, 1.4), 1.4);

const neutral = predictMatch(balanced, balanced);
assert.ok(Math.abs(neutral.p1 + neutral.pN + neutral.p2 - 1) < 0.002);
assert.ok(neutral.p1 > 0 && neutral.pN > 0 && neutral.p2 > 0);
assert.ok(neutral.btts >= 0 && neutral.btts <= 1);
assert.ok(neutral.o25 >= 0 && neutral.o25 <= 1);
assert.match(neutral.score, /^\d+-\d+$/);

const mismatch = predictMatch(strong, balanced);
assert.ok(mismatch.p1 > mismatch.p2, 'L’équipe forte à domicile doit être favorite');
assert.ok(mismatch.xgHome > mismatch.xgAway, 'Les buts attendus doivent refléter l’écart de niveau');

const reversed = predictMatch(balanced, strong);
assert.ok(reversed.p2 > reversed.p1, 'L’équipe forte à l’extérieur doit être favorite');

console.log('OK — tests du moteur prédictif Pronokikz v2');
