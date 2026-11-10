'use strict';

// Choix de buteur par un modèle OpenAI à partir des seules statistiques vérifiées fournies.
// Aucun accès à la conversation ChatGPT : l'appel est fait côté GitHub Actions avec une clé secrète.
function extractText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

async function pickScorerWithAI(players, homeStats, awayStats, expectedGoals, homeId, awayId, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!Array.isArray(players) || !Array.isArray(expectedGoals) || expectedGoals.length < 2) return null;

  const candidates = players.filter(p =>
    p && p.team && (p.team.id === homeId || p.team.id === awayId) &&
    p.player && typeof p.player.name === 'string' &&
    Number.isFinite(p.goals) && p.goals >= 1 &&
    Number.isFinite(p.playedMatches) && p.playedMatches >= 3
  ).map(p => ({
    name: p.player.name,
    team: p.team.id === homeId ? 'Domicile' : 'Extérieur',
    position: p.player.position || 'inconnue',
    goals: p.goals,
    appearances: p.playedMatches,
    goalsPerAppearance: Math.round((p.goals / p.playedMatches) * 1000) / 1000
  })).sort((a, b) => b.goalsPerAppearance - a.goalsPerAppearance || b.goals - a.goals)
    .slice(0, 24);

  if (!candidates.length) return null;

  const payload = {
    home: options.home || 'Équipe à domicile',
    away: options.away || 'Équipe à l’extérieur',
    expectedGoals: { home: expectedGoals[0], away: expectedGoals[1] },
    homeStats: homeStats ? { goalsForPerMatch: homeStats.w ? homeStats.gf / homeStats.w : null, matches: homeStats.g || 0 } : null,
    awayStats: awayStats ? { goalsForPerMatch: awayStats.w ? awayStats.gf / awayStats.w : null, matches: awayStats.g || 0 } : null,
    candidates
  };

  const response = await (options.fetchImpl || fetch)('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      store: false,
      max_output_tokens: 220,
      temperature: 0.2,
      instructions: [
        'Tu es un analyste football spécialisé dans les buteurs.',
        'Choisis au maximum UN joueur parmi la liste fournie, ou aucun si les données ne permettent pas un choix défendable.',
        'Base-toi uniquement sur les données fournies : buts, apparitions, poste, équipe et buts attendus des équipes.',
        'Pondère le volume de buts par les apparitions, le poste si connu et le potentiel offensif de l’équipe.',
        'Ne prétends jamais connaître les titulaires, blessures, suspensions, minutes récentes ou actualités : ces informations ne sont pas fournies.',
        'La probabilité est une estimation subjective non calibrée, jamais une certitude. Si le choix est faible, retourne candidate_index -1 et probability 0.',
        'Ne crée aucun nom de joueur et ne sélectionne jamais un joueur absent de la liste.'
      ].join(' '),
      input: JSON.stringify(payload),
      text: {
        format: {
          type: 'json_schema',
          name: 'pronokikz_scorer_pick',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              candidate_index: { type: 'integer', minimum: -1, maximum: 23 },
              probability: { type: 'number', minimum: 0, maximum: 1 },
              reason: { type: 'string' }
            },
            required: ['candidate_index', 'probability', 'reason']
          }
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('OpenAI API ' + response.status + ': ' + detail.slice(0, 300));
  }
  const data = await response.json();
  const raw = extractText(data);
  if (!raw) throw new Error('Réponse OpenAI vide ou illisible');
  const result = JSON.parse(raw);
  const index = result.candidate_index;
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) return null;
  const player = candidates[index];
  const probability = Number(result.probability);
  if (!Number.isFinite(probability) || probability < 0.05 || probability > 0.95) return null;

  return {
    bt: player.name + ' (' + player.goals + ' buts en ' + player.appearances +
      ' matchs) · ' + Math.round(probability * 100) + ' % estimés',
    btp: Math.round(probability * 1000) / 1000,
    btSource: 'openai',
    btWhy: String(result.reason || '').slice(0, 220)
  };
}

module.exports = { pickScorerWithAI, extractText };
