'use strict';

// Analyse IA du résultat le plus pertinent pour chaque match.
// L'IA ne reçoit que des données vérifiées par le pipeline : elle ne doit pas inventer
// les compositions, blessures, suspensions ou informations d'actualité absentes du payload.
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

async function pickMatchWithAI(m, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey || !m || ![m.p1, m.pN, m.p2].every(Number.isFinite)) return null;

  const payload = {
    match: { competition: m.lg, date: m.d, kickoff: m.h, home: m.home, away: m.away },
    probabilities: {
      model: m.raw ? [m.raw.p1, m.raw.pN, m.raw.p2] : (m.q || [m.p1, m.pN, m.p2]),
      market: Array.isArray(m.mkp) ? m.mkp : null,
      blended: [m.p1, m.pN, m.p2]
    },
    bestAvailableBookmakerOdds: m.mkOdds || null,
    expectedGoals: Array.isArray(m.x) ? { home: m.x[0], away: m.x[1] } : null,
    recentFormPoints: { last5: m.fm || null, last10: m.f10 || null },
    matchesSampled: m.ng || null,
    headToHead: m.hh || null,
    goalMarkets: { bothTeamsToScore: m.btts, over2_5: m.o25 },
    modelScorePredictions: m.scs || null,
    additionalVerifiedNotes: m.ex || ''
  };

  const response = await (options.fetchImpl || fetch)('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model || process.env.OPENAI_MODEL || 'gpt-6-astra',
      store: false,
      max_output_tokens: 320,
      temperature: 0.2,
      instructions: [
        'Tu es l’analyste football de Pronokikz. Tu dois formuler TON avis de sélection pour ce match, pas appliquer une règle mécanique.',
        'Analyse ensemble les probabilités du modèle, le consensus du marché si disponible, les cotes, les buts attendus, la forme récente, l’échantillon, les confrontations et les marchés de buts.',
        'Choisis une seule sélection parmi 1, N, 2, 1N, N2, 12. 1N signifie domicile ou nul ; N2 signifie nul ou extérieur ; 12 signifie pas de nul.',
        'Ne choisis pas automatiquement la double chance qui affiche le pourcentage le plus élevé : évalue le scénario footballistique, le risque de nul, l’écart de niveau, la fiabilité des données et la cohérence du marché.',
        'Un 1 ou un 2 sec est pertinent seulement si le favori est réellement solide. Si le match est équilibré, préfère la double chance adaptée. Le 12 n’est pertinent que si le nul paraît suffisamment peu probable.',
        'Ne cherche pas à forcer un favori. Si les données sont faibles ou contradictoires, choisis la couverture la plus défendable et signale clairement le risque.',
        'N’invente jamais de blessure, suspension, composition, motivation, actualité ou cote. Si ces informations ne figurent pas dans les données, considère-les comme inconnues et ne prétends pas les avoir vérifiées.',
        'La confiance est une appréciation prudente de la qualité du choix, pas la probabilité mathématique de gagner. Reste mesuré.',
        'Rédige une justification concrète et courte en français, liée aux données du match.'
      ].join(' '),
      input: JSON.stringify(payload),
      text: {
        format: {
          type: 'json_schema',
          name: 'pronokikz_match_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              choice: { type: 'string', enum: ['1', 'N', '2', '1N', 'N2', '12'] },
              confidence: { type: 'integer', minimum: 1, maximum: 100 },
              reason: { type: 'string' },
              risk: { type: 'string' }
            },
            required: ['choice', 'confidence', 'reason', 'risk']
          }
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('OpenAI API ' + response.status + ': ' + detail.slice(0, 260));
  }
  const data = await response.json();
  const raw = extractText(data);
  if (!raw) throw new Error('Réponse IA vide ou illisible');
  const result = JSON.parse(raw);
  if (!['1', 'N', '2', '1N', 'N2', '12'].includes(result.choice)) return null;
  return {
    fin: result.choice,
    aiFin: result.choice,
    aiConfidence: Math.max(1, Math.min(100, Number(result.confidence) || 1)),
    aiWhy: String(result.reason || '').slice(0, 420),
    aiRisk: String(result.risk || '').slice(0, 220),
    aiAt: new Date().toISOString().slice(0, 10),
    aiSource: 'openai'
  };
}

module.exports = { pickMatchWithAI };
