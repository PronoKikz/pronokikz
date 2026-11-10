'use strict';

// Sélection statistique du meilleur buteur probable parmi les joueurs fournis par l'API.
// Ce calcul n'est PAS une IA conversationnelle et ne connaît pas les titularisations,
// minutes récentes, blessures ou suspensions : ne pas présenter le résultat comme certain.
function pickScorer(list, homeStats, awayStats, expectedGoals, homeId, awayId) {
  if (!Array.isArray(list) || !Array.isArray(expectedGoals) || expectedGoals.length < 2) {
    return { bt: '', btp: 0 };
  }
  const candidates = [];
  [[homeId, homeStats, expectedGoals[0]], [awayId, awayStats, expectedGoals[1]]]
    .forEach(([teamId, team, teamXg]) => {
      if (!team || !Number.isFinite(teamXg) || teamXg <= 0) return;
      const teamAverage = Number.isFinite(team.gf) && Number.isFinite(team.w) && team.w > 0
        ? team.gf / team.w : 1;
      const ratio = Math.max(0.6, Math.min(1.6, teamXg / Math.max(teamAverage, 0.1)));
      list.filter(player =>
        player && player.team && player.team.id === teamId &&
        player.player && typeof player.player.name === 'string' &&
        Number.isFinite(player.playedMatches) && player.playedMatches >= 5 &&
        Number.isFinite(player.goals) && player.goals >= 3
      ).forEach(player => {
        // Approximation de Poisson : P(au moins un but) = 1 - exp(-taux).
        const rate = (player.goals / player.playedMatches) * ratio;
        const probability = 1 - Math.exp(-rate);
        candidates.push({
          name: player.player.name,
          goals: player.goals,
          matches: player.playedMatches,
          probability
        });
      });
    });
  candidates.sort((a, b) => b.probability - a.probability);
  const best = candidates[0];
  if (!best || best.probability < 0.25) return { bt: '', btp: 0 };
  return {
    bt: best.name + ' (' + best.goals + ' buts en ' + best.matches +
      ' matchs) · ' + Math.round(best.probability * 100) + ' % de marquer',
    btp: Math.round(best.probability * 1000) / 1000
  };
}

module.exports = { pickScorer };
