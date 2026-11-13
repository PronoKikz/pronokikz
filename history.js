'use strict';

function normalizeName(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function predictedScorerName(label) {
  if (typeof label !== 'string' || !label.trim()) return null;
  return label.split(/\s(?:\(|·)/)[0].trim() || null;
}

function actualScorerNames(goals) {
  if (!Array.isArray(goals)) return null;
  return goals.map(goal => goal && goal.scorer && goal.scorer.name)
    .filter(name => typeof name === 'string' && name.trim());
}

function scorerHit(predicted, goals) {
  if (!predicted) return null;
  const names = actualScorerNames(goals);
  if (names === null || (goals.length > 0 && names.length === 0)) return null;
  const target = normalizeName(predicted);
  return names.some(name => normalizeName(name) === target);
}

function buildHistoryEntry(match, goals) {
  const bt = predictedScorerName(match.bt);
  return {
    i: match.id,
    d: match.d,
    lg: match.lg,
    p: [match.p1, match.pN, match.p2],
    modelP: match.raw && [match.raw.p1, match.raw.pN, match.raw.p2].every(Number.isFinite) ? [match.raw.p1, match.raw.pN, match.raw.p2] : null,
    marketP: Array.isArray(match.mkp) && match.mkp.length === 3 && match.mkp.every(Number.isFinite) ? match.mkp : null,
    b: match.btts,
    o: match.o25 == null ? null : match.o25,
    x: match.x || null,
    q: match.q || null,
    r: match.r,
    t: match.pt || null,
    bt,
    bp: Number.isFinite(match.btp) ? match.btp : null,
    bs: match.btSource || 'unknown',
    bh: scorerHit(bt, goals),
    g: actualScorerNames(goals)
  };
}


module.exports = { normalizeName, predictedScorerName, actualScorerNames, scorerHit, buildHistoryEntry };
