'use strict';
const assert=require('node:assert/strict');
const {evaluateMatches,predictBeforeMatch}=require('../walkforward');
const teams=[{id:1,name:'A'},{id:2,name:'B'},{id:3,name:'C'},{id:4,name:'D'}];
const start=Date.parse('2026-08-01T12:00:00Z'), matches=[];
for(let i=0;i<32;i++){
  const home=teams[i%4],away=teams[(i+1+(i%2))%4];
  matches.push({utcDate:new Date(start+i*86400000).toISOString(),status:'FINISHED',competition:{code:'TST',name:'Test League'},homeTeam:home,awayTeam:away,score:{fullTime:{home:1+(i%3===0?1:0),away:i%4===0?1:0}}});
}
const target={utcDate:new Date(start+32*86400000).toISOString(),status:'FINISHED',competition:{code:'TST',name:'Test League'},homeTeam:teams[0],awayTeam:teams[1],score:{fullTime:{home:2,away:0}}};
const prediction=predictBeforeMatch(target,[...matches,target]);
assert.ok(prediction,'historique suffisant pour calculer un prono');\nconst withoutCompetition={...target}; delete withoutCompetition.competition;\nassert.equal(predictBeforeMatch(withoutCompetition,[...matches,target]),null,'ne jamais mélanger des compétitions non identifiées');
assert.ok(prediction.priorMatches<=32,'aucun résultat futur ne doit être utilisé');
assert.ok(Math.abs(prediction.p1+prediction.pN+prediction.p2-1)<1e-9);
const report=evaluateMatches([...matches,target]);
assert.ok(report.matchesTested>0);
assert.ok(report.accuracy1x2>=0&&report.accuracy1x2<=1);
assert.ok(report.brierScore>=0&&report.logLoss>=0);
console.log('OK — backtest chronologique sans fuite de résultats futurs');
