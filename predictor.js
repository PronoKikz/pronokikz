'use strict';

// Modèle Poisson avec correction Dixon-Coles, extrait du moteur principal Pronokikz.
// Les probabilités sont des estimations et ne constituent jamais une garantie.
const r3 = x => Math.round(x * 1000) / 1000;

function poisson(lambda, goals) {
  let probability = Math.exp(-lambda);
  for (let i = 1; i <= goals; i++) probability *= lambda / i;
  return probability;
}

function model(lambdaHome, lambdaAway) {
  if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway) || lambdaHome <= 0 || lambdaAway <= 0) {
    throw new TypeError('Les buts attendus doivent être des nombres positifs.');
  }
  const rho = -0.08;
  const cells = [];
  let total = 0;
  for (let home = 0; home <= 10; home++) {
    for (let away = 0; away <= 10; away++) {
      let probability = poisson(lambdaHome, home) * poisson(lambdaAway, away);
      if (home < 2 && away < 2) {
        probability *= home === 0 && away === 0 ? 1 - lambdaHome * lambdaAway * rho
          : home === 0 && away === 1 ? 1 + lambdaHome * rho
          : home === 1 && away === 0 ? 1 + lambdaAway * rho
          : 1 - rho;
      }
      cells.push([home, away, probability]);
      total += probability;
    }
  }
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0, over25 = 0, over15 = 0;
  cells.forEach(cell => {
    cell[2] /= total;
    const [home, away, probability] = cell;
    if (home > away) homeWin += probability;
    else if (home === away) draw += probability;
    else awayWin += probability;
    if (home > 0 && away > 0) btts += probability;
    if (home + away > 2) over25 += probability;
    if (home + away > 1) over15 += probability;
  });
  const scores = cells.slice().sort((a, b) => b[2] - a[2]).slice(0, 3)
    .map(cell => [cell[0] + '-' + cell[1], r3(cell[2])]);
  return { p1: homeWin, pN: draw, p2: awayWin, btts, o25: over25, o15: over15, scs: scores };
}

module.exports = { model, poisson };
