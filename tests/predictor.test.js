'use strict';
const assert = require('node:assert/strict');
const { model, poisson } = require('../predictor');

assert.ok(poisson(1.5, 10) > 0 && poisson(1.5, 10) < 1);
const balanced = model(1.45, 1.45);
assert.ok(Math.abs(balanced.p1 + balanced.pN + balanced.p2 - 1) < 1e-9);
assert.ok(Math.abs(balanced.p1 - balanced.p2) < 1e-9);
for (const key of ['p1', 'pN', 'p2', 'btts', 'o25', 'o15']) {
  assert.ok(balanced[key] >= 0 && balanced[key] <= 1, key + ' doit être une probabilité valide');
}
assert.ok(balanced.o15 >= balanced.o25, 'Plus de 1,5 doit être au moins aussi probable que plus de 2,5');
assert.equal(balanced.scs.length, 3);
assert.ok(balanced.scs[0][1] >= balanced.scs[1][1] && balanced.scs[1][1] >= balanced.scs[2][1]);
assert.ok(model(2.2, 0.8).p1 > model(2.2, 0.8).p2, 'Une espérance supérieure à domicile doit favoriser le domicile');
assert.ok(model(0.8, 2.2).p2 > model(0.8, 2.2).p1, 'Une espérance supérieure à l’extérieur doit favoriser l’extérieur');
assert.throws(() => model(0, 1.2), TypeError);
assert.throws(() => model(1.2, Number.NaN), TypeError);
console.log('OK — tests du modèle statistique principal Pronokikz');
