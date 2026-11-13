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


function evaluateAdvice(picks, matches) {
  const states = (Array.isArray(picks) ? picks : []).map(pick => {
    const match = (Array.isArray(matches) ? matches : []).find(item => String(item.id) === String(pick && pick.id));
    if (!match || !Array.isArray(match.r) || match.r.length !== 2 ||
        !match.r.every(value => Number.isInteger(value) && value >= 0)) return null;
    const [home, away] = match.r;
    const market = String(pick.market || '');
    if (market.startsWith('Victoire domicile')) return home > away;
    if (market.startsWith('Match nul')) return home === away;
    if (market.startsWith('Victoire extérieur')) return home < away;
    if (market.includes('Les 2 équipes marquent')) {
      const yes = home > 0 && away > 0;
      return market.endsWith('OUI') ? yes : !yes;
    }
    return null;
  });
  const status = states.some(value => value === false) ? 'lost'
    : states.length > 0 && states.every(value => value === true) ? 'won' : 'pending';
  return { states, status };
}

module.exports = { normalizeName, predictedScorerName, actualScorerNames, scorerHit, buildHistoryEntry, evaluateAdvice };
