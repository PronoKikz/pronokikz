'use strict';
const assert=require('node:assert/strict');
const {evaluateMatches,predictBeforeMatch}=require('../walkforward');
const teams=[{id:1,name:'A'},{id:2,name:'B'},{id:3,name:'C'},{id:4,name:'D'}];
const start=Date.parse('2026-08-01T12:00:00Z'), matches=[];
for(let i=0;i<32;i++){
  const home=teams[i%4],away=teams[(i+1+(i%2))%4];
  matches.push({utcDate:new Date(start+i*86400000).toISOString(),resultAvailableAt:new Date(start+i*86400000+2*3600000).toISOString(),status:'FINISHED',competition:{code:'TST',name:'Test League'},homeTeam:home,awayTeam:away,score:{fullTime:{home:1+(i%3===0?1:0),away:i%4===0?1:0}}});
}
const target={utcDate:new Date(start+32*86400000).toISOString(),resultAvailableAt:new Date(start+32*86400000+2*3600000).toISOString(),status:'FINISHED',competition:{code:'TST',name:'Test League'},homeTeam:teams[0],awayTeam:teams[1],score:{fullTime:{home:2,away:0}}};
const prediction=predictBeforeMatch(target,[...matches,target]);
assert.ok(prediction,'historique suffisant pour calculer un prono');
const withoutCompetition={...target}; delete withoutCompetition.competition;
assert.equal(predictBeforeMatch(withoutCompetition,[...matches,target]),null,'ne jamais mélanger des compétitions non identifiées');
assert.ok(prediction.priorMatches<=32,'aucun résultat futur ne doit être utilisé');
const noEvidence=matches.map(m=>({...m,resultAvailableAt:null}));
assert.equal(predictBeforeMatch(target,[...noEvidence,target]),null,'sans preuve de disponibilité, aucun résultat historique ne doit être utilisé');
const lateEvidence=matches.map((m,i)=>i===0?{...m,resultAvailableAt:target.utcDate}:m);
const excludesLate=predictBeforeMatch(target,[...lateEvidence,target]);
assert.ok(excludesLate&&excludesLate.priorMatches<32,'un résultat publié après le coup d’envoi cible doit être exclu');
assert.ok(Math.abs(prediction.p1+prediction.pN+prediction.p2-1)<1e-9);
const report=evaluateMatches([...matches,target]);
assert.ok(report.matchesTested>0);
assert.ok(report.accuracy1x2>=0&&report.accuracy1x2<=1);
assert.ok(report.brierScore>=0&&report.logLoss>=0);
console.log('OK — backtest chronologique avec preuve de disponibilité des résultats');
