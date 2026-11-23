'use strict';
const assert = require('node:assert/strict');
const { evaluate } = require('../backtest');
const temporal = { predictionAt: '2026-11-01T10:00:00Z', kickoffAt: '2026-11-01T12:00:00Z', resultAvailableAt: '2026-11-01T14:00:00Z' };
const report = evaluate([
  { ...temporal, lg: 'Ligue 1', p: [0.7, 0.2, 0.1], r: [2, 0], b: 0.2, o: 0.3 },
  { ...temporal, lg: 'Ligue 1', p: [0.2, 0.3, 0.5], r: [1, 1], b: 0.8, o: 0.3 },
  { ...temporal, lg: 'Premier League', p: [0.1, 0.2, 0.7], r: [0, 2], b: 0.2, o: 0.3 },
  { lg: 'Données incohérentes', p: [0.7, 0.7, 0.1], r: [1, 0], b: 0.2, o: 0.3 },
  { lg: 'Score invalide', p: [0.3, 0.3, 0.4], r: [-1, 0], b: 0.2, o: 0.3 },
  { lg: 'Proba invalide', p: [0.3, 0.3, 0.4], r: [1, 0], b: 1.5, o: 0.3 }
]);
assert.equal(report.total.matches, 3);
assert.equal(report.ignored, 3);
assert.equal(evaluate([{...temporal,p:[0.4,0.3,0.3],r:[1,0],resultAvailableAt:'2026-11-01T11:59:59Z'}]).total.matches,0,'résultat déclaré disponible avant le coup d’envoi invalide');
assert.equal(evaluate([{p:[0.4,0.3,0.3],r:[1,0]}]).total.matches,0,'historique sans horodatage exclu');
assert.equal(report.total.accuracy, 66.7);
assert.ok(report.total.brier >= 0 && report.total.brier <= 2);
assert.ok(report.total.logLoss > 0);
assert.equal(report.total.bttsAccuracy, 100);
assert.equal(report.total.over25Accuracy, 100);
assert.equal(report.leagues['Ligue 1'].matches, 2);
assert.ok(report.warning);
assert.equal(evaluate([]).total.matches, 0);
console.log('OK — tests du rapport de précision Pronokikz');