'use strict';

function evaluateAdvice(picks, matches) {
  const states = (Array.isArray(picks) ? picks : []).map(pick => {
    const match = (Array.isArray(matches) ? matches : []).find(item => String(item.id) === String(pick && pick.id));
    if (!match || !Array.isArray(match.r) || match.r.length !== 2 ||
        !match.r.every(value => Number.isInteger(value) && value >= 0)) return null;
    const [home, away] = match.r;
    const market = String(pick.market || '');
    if (market.startsWith('Double chance')) {
      const selection = market.replace('Double chance', '').replace(/[^1N2]/g, '');
      const actual = home > away ? '1' : home === away ? 'N' : '2';
      return selection.includes(actual);
    }
    if (market.startsWith('Victoire domicile')) return home > away;
    if (market.startsWith('Match nul')) return home === away;
    if (market.startsWith('Victoire extérieur')) return home < away;
    if (market.startsWith('Plus de 2,5 buts')) return home + away > 2.5;
    if (market.startsWith('Moins de 2,5 buts')) return home + away < 2.5;
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

module.exports = { evaluateAdvice };
