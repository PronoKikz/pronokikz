import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Updates from 'expo-updates';
const { evaluateAdvice } = require('./adviceHistory');
import { ActivityIndicator, AppState, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native';

type ThemeName = 'dark' | 'light' | 'pink' | 'football' | 'system';
type ThemePalette = { bg:string; card:string; muted:string; accent:string; text:string; border:string; surface:string; nav:string; activeSurface:string; buttonText:string; statusBar:'light-content'|'dark-content' };
const THEMES: Record<Exclude<ThemeName,'system'>,ThemePalette> = {
 dark:{bg:'#0B0D10',card:'#161A20',muted:'#9AA4B2',accent:'#38BDF8',text:'#F4F6F9',border:'#29313B',surface:'#111820',nav:'#10151B',activeSurface:'#102B3A',buttonText:'#061018',statusBar:'light-content'},
 light:{bg:'#F3F6FA',card:'#FFFFFF',muted:'#64748B',accent:'#2563EB',text:'#17212B',border:'#D8E0E8',surface:'#E9EFF5',nav:'#E7EDF4',activeSurface:'#DBEAFE',buttonText:'#FFFFFF',statusBar:'dark-content'},
 pink:{bg:'#160B16',card:'#281426',muted:'#D7A9C3',accent:'#FF2D95',text:'#FFF4FA',border:'#74304F',surface:'#35172B',nav:'#211020',activeSurface:'#5A1B3D',buttonText:'#FFFFFF',statusBar:'light-content'},
 football:{bg:'#0B0D10',card:'#161A20',muted:'#9AA4B2',accent:'#38BDF8',text:'#F4F6F9',border:'#29313B',surface:'#111820',nav:'#10151B',activeSurface:'#102B3A',buttonText:'#061018',statusBar:'light-content'}
};
const THEME_OPTIONS: {id:ThemeName;label:string;icon:string;hint:string}[] = [
 {id:'dark',label:'Sombre',icon:'🌙',hint:'Le style sombre actuel.'},
 {id:'light',label:'Clair',icon:'☀️',hint:'Une interface lumineuse et épurée.'},
 {id:'pink',label:'Rose néon',icon:'💗',hint:'Un fuchsia lumineux sur un fond sombre et contrasté.'},
 {id:'football',label:'Football',icon:'⚽',hint:'Vert pelouse et ambiance stade.'},
 {id:'system',label:'Automatique',icon:'📱',hint:'Suit le thème de ton téléphone.'}
];
// Les données sont publiées automatiquement sur GitHub : aucun serveur sur le PC n'est nécessaire.
const DATA_URL = 'https://raw.githubusercontent.com/PronoKikz/pronokikz/main/data.json';

type Match = { id: string | number; lg?: string; home?: string; away?: string; d?: string; h?: string; hc?: string; ac?: string; liveStatus?:string; liveMinute?:number|null; liveAdded?:number|null; liveScore?:number[]|null; liveUpdatedAt?:string; p1?: number; pN?: number; p2?: number; mkp?: number[]; raw?: {p1?:number;pN?:number;p2?:number}; btts?: number; o25?: number; mkOdds?: {h2h?:{home?:{price:number;bookmaker:string};draw?:{price:number;bookmaker:string};away?:{price:number;bookmaker:string}};totals?:{over25?:{price:number;bookmaker:string};under25?:{price:number;bookmaker:string}};btts?:{yes?:{price:number;bookmaker:string};no?:{price:number;bookmaker:string}}} | null; mkOddsAt?: string; r?: number[] | null; ia?: string; bt?: string; ex?: string; fin?: string };
type Stats = { total: number; upcoming: number; finished: number; evaluated: number; correct: number; accuracy: number | null };
type ProbabilityStats = { matches:number; accuracy:number|null; brier:number|null; logLoss:number|null };
type ComparisonStats = { matches:number; modelAccuracy:number|null; modelBrier:number|null; modelLogLoss:number|null; marketAccuracy:number|null; marketBrier:number|null; marketLogLoss:number|null };
const matchIdentity = (m: Match) => {
 const team = (v?:string) => { const key=String(v||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); const aliases:Record<string,string>={'turkiye':'turquie','turkey':'turquie','turquie':'turquie','italy':'italie','italie':'italie','croatia':'croatie','croatie':'croatie','belgium':'belgique','belgique':'belgique','spain':'espagne','espagne':'espagne','czechia':'tchequie','czechrepublic':'tchequie','tchequie':'tchequie','ivorycoast':'cotedivoire','cotedivoire':'cotedivoire','korearepublic':'coreedusud','southkorea':'coreedusud','koreadusud':'coreedusud','koreademocraticpeoplesrepublic':'coreedunord','northkorea':'coreedunord','unitedstates':'etatsunis','usa':'etatsunis','us':'etatsunis','etatsunis':'etatsunis','unitedarabemirates':'emiratsarabesunis','uae':'emiratsarabesunis','emiratsarabesunis':'emiratsarabesunis','netherlands':'paysbas','holland':'paysbas','paysbas':'paysbas','england':'angleterre','scotland':'ecosse','wales':'paysdegalles','bosniaandherzegovina':'bosnieherzegovine','bosnia':'bosnieherzegovine','northmacedonia':'macedoinedunord','macedonia':'macedoinedunord','capeverde':'capvert'}; return aliases[key]||key; };
 return [m.d||'',...[team(m.home),team(m.away)].sort()].join('|');
};
const deduplicateMatches = (items: Match[]) => {
 const unique = new Map<string,Match>();
 items.forEach(m => {
  if(!m || !m.home || !m.away) return;
  const key=matchIdentity(m),old=unique.get(key);
  if(!old || ((!old.r||!old.r.length)&&(!!m.r||!!m.liveScore)) || (old.p1==null&&m.p1!=null)) unique.set(key,m);
 });
 return [...unique.values()].sort((a,b)=>((a.d||'')+(a.h||'')).localeCompare((b.d||'')+(b.h||'')));
};
const pct = (n?: number) => n == null ? '—' : Math.round(n * 100) + '%';
const localDayKey = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
const dateLabel = (d?: string, h?: string) => { if (!d) return 'Date à confirmer'; const x = new Date(d + 'T' + (h || '12:00') + ':00'); return Number.isNaN(x.getTime()) ? d : x.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const TEAM_NAMES_FR: Record<string,string> = {
 // Clubs : ne franciser que les noms ayant un équivalent français clair.
 '1. fc koln':'FC Cologne','atleti':'Atlético Madrid','athletic':'Athletic Bilbao',
 'bayern':'Bayern Munich','dortmund':'Borussia Dortmund','frankfurt':'Eintracht Francfort',
 'bremen':'Werder Brême','brighton hove':'Brighton','celta':'Celta Vigo',
 'internazionale':'Inter Milan','inter':'Inter Milan','milan':'AC Milan',
 'napoli':'Naples','leverkusen':'Bayer Leverkusen','man city':'Manchester City',
 'man united':'Manchester United','newcastle':'Newcastle United',
 'nottingham':'Nottingham Forest','lazio':'Lazio Rome','roma':'AS Rome',
 'olympique lyon':'Olympique Lyonnais','psg':'Paris Saint-Germain',
 'valencia':'Valence CF','stuttgart':'VfB Stuttgart','sassuolo':'US Sassuolo',
 'schalke':'Schalke 04','santander':'Racing Santander',
 // Pays et sélections nationales.
 'albania':'Albanie','andorra':'Andorre','armenia':'Arménie','austria':'Autriche',
 'azerbaijan':'Azerbaïdjan','belarus':'Biélorussie','belgium':'Belgique',
 'bosnia-herzegovina':'Bosnie-Herzégovine','bulgaria':'Bulgarie','croatia':'Croatie',
 'cyprus':'Chypre','czechia':'Tchéquie','denmark':'Danemark','england':'Angleterre',
 'estonia':'Estonie','faroe islands':'Îles Féroé','finland':'Finlande',
 'georgia':'Géorgie','germany':'Allemagne','greece':'Grèce','hungary':'Hongrie',
 'iceland':'Islande','israel':'Israël','italy':'Italie','kazakhstan':'Kazakhstan',
 'latvia':'Lettonie','liechtenstein':'Liechtenstein','lithuania':'Lituanie',
 'luxembourg':'Luxembourg','malta':'Malte','moldova':'Moldavie',
 'montenegro':'Monténégro','netherlands':'Pays-Bas','north macedonia':'Macédoine du Nord',
 'northern ireland':'Irlande du Nord','norway':'Norvège','poland':'Pologne',
 'republic of ireland':'Irlande','romania':'Roumanie','san marino':'Saint-Marin',
 'scotland':'Écosse','serbia':'Serbie','slovakia':'Slovaquie','slovenia':'Slovénie',
 'spain':'Espagne','sweden':'Suède','switzerland':'Suisse','turkiye':'Turquie',
 'ukraine':'Ukraine','wales':'Pays de Galles'
};
const normalizeTeamName = (name:string) => name.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\\s+/g,' ').trim();
const displayTeamName = (name?:string) => { if(!name)return name||''; return TEAM_NAMES_FR[normalizeTeamName(name)]||name; };
const displayMatchName = (name?:string) => name ? name.split(' – ').map(displayTeamName).join(' – ') : '';

const hasFreshMarketOdds = (m: Match, maxAgeHours = 24): boolean => { const stamp=m.mkOddsAt?Date.parse(m.mkOddsAt):NaN; const age=Date.now()-stamp; return Number.isFinite(stamp)&&age>=-5*60*1000&&age<=maxAgeHours*60*60*1000; };
const effective1x2 = (m: Match): [number,number,number] => { const fresh=hasFreshMarketOdds(m),model=fresh?[m.p1??0,m.pN??0,m.p2??0]:[m.raw?.p1??m.p1??0,m.raw?.pN??m.pN??0,m.raw?.p2??m.p2??0]; if(fresh&&m.mkp?.length===3)return model; const q=fresh?m.mkOdds?.h2h:undefined,prices=[q?.home?.price,q?.draw?.price,q?.away?.price]; if(!prices.every(x=>Number.isFinite(x)&&x!>1))return model; const raw=prices.map(x=>1/(x as number)),sum=raw.reduce((a,b)=>a+b,0); if(!sum)return model; const market=raw.map(x=>x/sum); return model.map((p,i)=>0.15*p+0.85*market[i]) as [number,number,number]; };
const prediction = (m: Match) => { if (m.p1 == null || m.pN == null || m.p2 == null) return 'Analyse indisponible'; const [p1,pN,p2]=effective1x2(m),best = Math.max(p1,pN,p2); return best === p1 ? '1 — domicile' : best === pN ? 'N — nul' : '2 — extérieur'; };
const normalizeSelection = (value?: string) => String(value || '').toUpperCase().replace(/X/g,'N').replace(/[\s/|+_-]/g,'');
const predictionCorrect = (m: Match): boolean | null => {
 if (!m.r || m.r.length !== 2 || !Number.isFinite(m.r[0]) || !Number.isFinite(m.r[1])) return null;
 const actual = m.r[0] > m.r[1] ? '1' : m.r[0] === m.r[1] ? 'N' : '2';
 const selection = normalizeSelection(m.fin);
 if (['1','N','2','1N','N2','12'].includes(selection)) return selection.includes(actual);
 if (m.p1 == null || m.pN == null || m.p2 == null) return null;
 const [p1,pN,p2] = effective1x2(m), best = Math.max(p1,pN,p2);
 const predicted = best === p1 ? '1' : best === pN ? 'N' : '2';
 return predicted === actual;
};
const formatSelection = (value?: string) => value ? value.replace(/^(1N|N2|12)$/, x => x.split('').join('/')) : '';
const displayedPrediction = (m: Match) => formatSelection(m.fin) || prediction(m);
type ComboPick = { id: string; match: string; league: string; kickoff: string; market: string; probability: number; odds: number; bookmaker: string; oddsAt?: string; estimated?: boolean };
type Combo = { picks: ComboPick[]; odds: number; probability: number };
type DailyPick = ComboPick & { edge:number };
type AdviceTier = 'safe'|'medium'|'high'|'instinct'|'fun';
type SavedAdvice = { id:string; createdAt:string; day:string; groupId:string; tier:AdviceTier; title:string; odds:number; probability:number; picks:ComboPick[]; source:'auto'|'relance' };
const buildCombo = (matches: Match[], min: number, max: number, seed: number, minProbability = 0.35, allowEstimated = true): Combo | null => {
 const byMatch: ComboPick[][] = [];
 matches.forEach(m => {
  const [p1,pN,p2]=effective1x2(m),fresh=hasFreshMarketOdds(m,12),base={id:String(m.id),match:(m.home||'?')+' – '+(m.away||'?'),league:m.lg||'Compétition',kickoff:dateLabel(m.d,m.h)};
  const markets: ComboPick[] = [];
  const advised=normalizeSelection(m.fin);
  const doubleSelection=advised==='2N'?'N2':advised;
  const add=(market:string,probability:number,q?:{price:number;bookmaker:string})=>{if(fresh&&q&&Number.isFinite(q.price)&&q.price>1)markets.push({...base,market,probability,odds:q.price,bookmaker:q.bookmaker,oddsAt:m.mkOddsAt})};
  if(['1N','N2','12'].includes(doubleSelection)){
   const included=doubleSelection.split('');
   const probability=(included.includes('1')?p1:0)+(included.includes('N')?pN:0)+(included.includes('2')?p2:0);
   const quotes=[m.mkOdds?.h2h?.home,m.mkOdds?.h2h?.draw,m.mkOdds?.h2h?.away];
   const implied=quotes.map(q=>q&&Number.isFinite(q.price)&&q.price>1?1/q.price:0);
   const overround=implied.reduce((sum,value)=>sum+value,0);
   const selectedImplied=(included.includes('1')?implied[0]:0)+(included.includes('N')?implied[1]:0)+(included.includes('2')?implied[2]:0);
   if(fresh&&probability>0&&overround>0&&selectedImplied>0){
    markets.push({...base,market:'Double chance '+doubleSelection.split('').join('/'),probability,odds:overround/selectedImplied,bookmaker:'Cote estimée depuis le marché 1N2',oddsAt:m.mkOddsAt,estimated:true});
   }
  } else {
   const allowed=!advised||['1','N','2'].includes(advised);
   if(allowed){
    add('Victoire domicile (1)',p1,m.mkOdds?.h2h?.home);
    add('Match nul (N)',pN,m.mkOdds?.h2h?.draw);
    add('Victoire extérieur (2)',p2,m.mkOdds?.h2h?.away);
   }
  }
  if(m.o25!=null){add('Plus de 2,5 buts',m.o25,m.mkOdds?.totals?.over25);add('Moins de 2,5 buts',1-m.o25,m.mkOdds?.totals?.under25);}
  if(m.btts!=null&&m.btts>0&&m.btts<1){
   const options=[
    {label:'OUI',probability:m.btts,quote:fresh?m.mkOdds?.btts?.yes:undefined},
    {label:'NON',probability:1-m.btts,quote:fresh?m.mkOdds?.btts?.no:undefined}
   ];
   options.forEach(option=>{
    if(option.quote)add('Les 2 équipes marquent : '+option.label,option.probability,option.quote);
    else if(allowEstimated)markets.push({...base,market:'Les 2 équipes marquent : '+option.label,probability:option.probability,odds:1/option.probability,bookmaker:'Estimation du modèle',estimated:true});
   });
  }
  const picks=markets.filter(p=>p.probability>=minProbability&&p.probability<=.94&&Number.isFinite(p.odds)&&p.odds>1);
  if(picks.length)byMatch.push(picks);
 });
 if(byMatch.length<2)return null;
 let state=((seed+1)*2654435761)>>>0;
 const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const valid=new Map<string,Combo>();
 for(let attempt=0;attempt<5000;attempt++){
  const order=[...byMatch].map(group=>({group,key:rand()})).sort((a,b)=>a.key-b.key),picks:ComboPick[]=[];let total=1;
  for(const entry of order){
   const options=[...entry.group].sort((a,b)=>a.probability-b.probability),top=options.slice(-Math.min(4,options.length)),pick=top[Math.floor(rand()*top.length)];
   if(total*pick.odds>max)continue;
   picks.push(pick);total*=pick.odds;
   if(picks.length>=2&&total>=min&&total<=max){
    const signature=picks.map(p=>p.id+':'+p.market).sort().join('|');
    if(!valid.has(signature))valid.set(signature,{picks:[...picks],odds:total,probability:picks.reduce((product,p)=>product*p.probability,1)});
    break;
   }
  }
 }
 if(!valid.size)return null;
 const target=(min+max)/2,ranked=[...valid.values()].sort((a,b)=>b.probability-a.probability||Math.abs(a.odds-target)-Math.abs(b.odds-target));
 // Choisir parmi les meilleures combinaisons en faisant varier le résultat selon la graine.
 const pool=ranked.slice(0,Math.min(12,ranked.length));
 return pool[Math.abs(Math.trunc(seed))%pool.length];
};
const buildMyBetCombo = (matches: Match[], seed: number): Combo | null => {
 const myBets: ComboPick[] = [];
 const otherPicks: ComboPick[][] = [];
 matches.forEach(m=>{
  const fresh=hasFreshMarketOdds(m,12);
  if(!fresh)return;
  const [p1,pN,p2]=effective1x2(m);
  const base={id:String(m.id),match:(m.home||'?')+' – '+(m.away||'?'),league:m.lg||'Compétition',kickoff:dateLabel(m.d,m.h)};
  const outcomes:{label:string;probability:number;price?:number}[]=[];
  const advised=normalizeSelection(m.fin);
  if(advised==='1'||advised==='N'||advised==='2'){
   const index=advised==='1'?0:advised==='N'?1:2;
   const quote=[m.mkOdds?.h2h?.home,m.mkOdds?.h2h?.draw,m.mkOdds?.h2h?.away][index];
   if(quote)outcomes.push({label:advised==='1'?'Victoire domicile':advised==='N'?'Match nul':'Victoire extérieur',probability:[p1,pN,p2][index],price:quote.price});
  } else if(['1N','N2','12'].includes(advised)){
   const included=advised.split('');
   const probability=(included.includes('1')?p1:0)+(included.includes('N')?pN:0)+(included.includes('2')?p2:0);
   const quotes=[m.mkOdds?.h2h?.home,m.mkOdds?.h2h?.draw,m.mkOdds?.h2h?.away];
   const implied=quotes.map(q=>q&&q.price>1?1/q.price:0),sum=implied.reduce((a,b)=>a+b,0);
   const selected=implied.reduce((a,v,i)=>a+(included.includes(['1','N','2'][i])?v:0),0);
   if(sum>0&&selected>0)outcomes.push({label:'Double chance '+advised.split('').join('/'),probability,price:sum/selected});
  }
  const extras:{label:string;probability:number;price?:number}[]=[];
  if(m.o25!=null){
   if(m.mkOdds?.totals?.over25)extras.push({label:'Plus de 2,5 buts',probability:m.o25,price:m.mkOdds.totals.over25.price});
   if(m.mkOdds?.totals?.under25)extras.push({label:'Moins de 2,5 buts',probability:1-m.o25,price:m.mkOdds.totals.under25.price});
  }
  if(m.btts!=null){
   if(m.mkOdds?.btts?.yes)extras.push({label:'BTTS OUI',probability:m.btts,price:m.mkOdds.btts.yes.price});
   if(m.mkOdds?.btts?.no)extras.push({label:'BTTS NON',probability:1-m.btts,price:m.mkOdds.btts.no.price});
  }
  outcomes.forEach(a=>extras.forEach(b=>{
   if(!a.price||!b.price||a.price<=1||b.price<=1)return;
   // Conservative Fréchet lower bound for the probability of both events.
   const joint=Math.max(0,a.probability+b.probability-1);
   if(joint<0.12||joint>0.9)return;
   myBets.push({...base,market:'MYBET estimé : '+a.label+' + '+b.label,probability:joint,odds:a.price*b.price,bookmaker:'Cote indicative, non fournie par un bookmaker',estimated:true});
  }));
  const ordinary:ComboPick[]=[];
  const add=(market:string,p:number,q?:{price:number;bookmaker:string})=>{if(q&&q.price>1&&p>=0.3&&p<=0.9)ordinary.push({...base,market,probability:p,odds:q.price,bookmaker:q.bookmaker,oddsAt:m.mkOddsAt});};
  if(advised==='1'||advised==='N'||advised==='2'){
   const i=advised==='1'?0:advised==='N'?1:2;
   add(advised==='1'?'Victoire domicile (1)':advised==='N'?'Match nul (N)':'Victoire extérieur (2)',[p1,pN,p2][i],[m.mkOdds?.h2h?.home,m.mkOdds?.h2h?.draw,m.mkOdds?.h2h?.away][i]);
  } else if(['1N','N2','12'].includes(advised)){
   const included=advised.split(''),prob=(included.includes('1')?p1:0)+(included.includes('N')?pN:0)+(included.includes('2')?p2:0);
   const qs=[m.mkOdds?.h2h?.home,m.mkOdds?.h2h?.draw,m.mkOdds?.h2h?.away],imp=qs.map(q=>q&&q.price>1?1/q.price:0),sum=imp.reduce((x,y)=>x+y,0),sel=imp.reduce((x,v,i)=>x+(included.includes(['1','N','2'][i])?v:0),0);
   if(sum>0&&sel>0&&prob>=0.3&&prob<=0.9)ordinary.push({...base,market:'Double chance '+advised.split('').join('/'),probability:prob,odds:sum/sel,bookmaker:'Cote estimée depuis le marché 1N2',estimated:true});
  }
  add('Plus de 2,5 buts',m.o25??0,m.mkOdds?.totals?.over25);
  add('Moins de 2,5 buts',m.o25==null?0:1-m.o25,m.mkOdds?.totals?.under25);
  add('Les 2 équipes marquent : OUI',m.btts??0,m.mkOdds?.btts?.yes);
  add('Les 2 équipes marquent : NON',m.btts==null?0:1-m.btts,m.mkOdds?.btts?.no);
  if(ordinary.length)otherPicks.push(ordinary);
 });
 if(!myBets.length||otherPicks.length<1)return null;
 const candidates:Combo[]=[];
 myBets.sort((a,b)=>b.probability-a.probability);
 for(const my of myBets.slice(0,12)){
  const rankedGroups=otherPicks.map(group=>group.filter(p=>p.id!==my.id).sort((a,b)=>b.probability-a.probability)).filter(group=>group.length).sort((a,b)=>(b[0]?.probability||0)-(a[0]?.probability||0));
  const picks=[my];let odds=my.odds,probability=my.probability;
  for(const group of rankedGroups){
   const pick=group[0];
   if(!pick||picks.length>=4||odds*pick.odds>40)continue;
   picks.push(pick);odds*=pick.odds;probability*=pick.probability;
  }
  if(picks.length>=2&&odds>=3&&odds<=40)candidates.push({picks,odds,probability});
 }
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.probability-a.probability||a.odds-b.odds);
 return candidates[seed%candidates.length];
};
const buildInstinctPick = (matches: Match[], seed: number): Combo | null => {
 const candidates: ComboPick[] = [];
 matches.forEach(m => {
  const [p1,pN,p2]=effective1x2(m),q=hasFreshMarketOdds(m)?m.mkOdds?.h2h:undefined;
  const base={id:String(m.id),match:(m.home||'?')+' – '+(m.away||'?'),league:m.lg||'Compétition',kickoff:dateLabel(m.d,m.h)};
  const options=[
   {market:'Victoire domicile (1)',probability:p1,quote:q?.home},
   {market:'Match nul (N)',probability:pN,quote:q?.draw},
   {market:'Victoire extérieur (2)',probability:p2,quote:q?.away}
  ];
  options.forEach(o=>{
   if(o.quote&&Number.isFinite(o.quote.price)&&o.quote.price>=1.6&&o.quote.price<=8&&o.probability>=0.35&&o.probability<=0.85){
    candidates.push({...base,market:o.market,probability:o.probability,odds:o.quote.price,bookmaker:o.quote.bookmaker,oddsAt:m.mkOddsAt});
   }
  });
 });
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.probability-a.probability||((b.probability*b.odds)-(a.probability*a.odds)));
 const top=candidates.slice(0,Math.min(3,candidates.length));
 const chosen=top[seed%top.length];
 return {picks:[chosen],odds:chosen.odds,probability:chosen.probability};
};

export default function App() {
 const [themeName,setThemeName]=useState<ThemeName>('dark');
 const [themeLoaded,setThemeLoaded]=useState(false);
 const [updateChecking,setUpdateChecking]=useState(false);
 const [updateMessage,setUpdateMessage]=useState('');
 const themeFile=(FileSystem.documentDirectory||'')+'pronokikz-theme.json';
 useEffect(()=>{
  let active=true;
  (async()=>{
   try {
    const info=await FileSystem.getInfoAsync(themeFile);
    if(info.exists){
     const saved=JSON.parse(await FileSystem.readAsStringAsync(themeFile));
     if(active&&['dark','light','pink','football','system'].includes(saved?.theme))setThemeName(saved.theme);
    }
   } catch(e) { /* En cas de fichier absent ou illisible, conserver le thème sombre par défaut. */ }
   finally { if(active)setThemeLoaded(true); }
  })();
  return ()=>{active=false;};
 },[]);
 const systemScheme=useColorScheme();
 const palette=useMemo(()=>themeName==='system'?(systemScheme==='light'?THEMES.light:THEMES.dark):THEMES[themeName],[themeName,systemScheme]);
 const s=useMemo(()=>createStyles(palette),[palette]);
 // Déclenche une nouvelle publication OTA sur le canal preview.
const checkForAppUpdate=async()=>{
  if(updateChecking)return;
  if(!Updates.isEnabled){setUpdateMessage("Les mises à jour à distance ne sont pas activées pour cette installation.");return;}
  setUpdateChecking(true);
  setUpdateMessage("Recherche d’une mise à jour…");
  try{
   const check=await Updates.checkForUpdateAsync();
   if(!check.isAvailable){setUpdateMessage("Tu disposes déjà de la dernière version.");return;}
   setUpdateMessage("Mise à jour trouvée : téléchargement…");
   const result=await Updates.fetchUpdateAsync();
   if(result.isNew){setUpdateMessage("Mise à jour installée : redémarrage…");await Updates.reloadAsync();return;}
   setUpdateMessage("Aucune nouvelle version à installer.");
  }catch(e:any){
   setUpdateMessage(e?.message||"Impossible de vérifier les mises à jour. Réessaie plus tard.");
  }finally{setUpdateChecking(false);}
 };
 const changeTheme=(next:ThemeName)=>{
  setThemeName(next);
  FileSystem.writeAsStringAsync(themeFile,JSON.stringify({theme:next})).catch(()=>{});
 };
 const [tab,setTab]=useState('Accueil'),[matches,setMatches]=useState<Match[]>([]),[stats,setStats]=useState<Stats|null>(null),[probabilityStats,setProbabilityStats]=useState<ProbabilityStats|null>(null),[comparisonStats,setComparisonStats]=useState<ComparisonStats|null>(null),[selected,setSelected]=useState<Match|null>(null),[leagueFilter,setLeagueFilter]=useState('Toutes'),[matchStatusFilter,setMatchStatusFilter]=useState<'À venir'|'En direct'|'Terminés'>('À venir'),[resultFilter,setResultFilter]=useState<'Tous'|'Gagnés'|'Perdus'>('Tous'),[resultLeagueFilter,setResultLeagueFilter]=useState('Toutes'),[historyFilter,setHistoryFilter]=useState<'Tous'|'Gagnés'|'Perdus'|'En attente'>('Tous');
 const historyFile=(FileSystem.documentDirectory||'')+'pronokikz-history.json';
 const [savedAdvice,setSavedAdvice]=useState<SavedAdvice[]>([]),[historyLoaded,setHistoryLoaded]=useState(false);
 const [expandedAdviceId,setExpandedAdviceId]=useState<string|null>(null);
 const historyRef=useRef<SavedAdvice[]>([]),historyWriteRef=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{let active=true;(async()=>{try{const info=await FileSystem.getInfoAsync(historyFile);if(info.exists){const parsed=JSON.parse(await FileSystem.readAsStringAsync(historyFile));if(Array.isArray(parsed)){const byId=new Map<string,SavedAdvice>();for(const item of parsed){if(!item||!item.id||!Array.isArray(item.picks))continue;const key=[item.groupId,item.day,item.tier].join('|');const previous=byId.get(key);if(!previous||String(item.createdAt||'')>String(previous.createdAt||''))byId.set(key,item);}const clean=[...byId.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));historyRef.current=clean;if(active)setSavedAdvice(clean);if(clean.length!==parsed.length)historyWriteRef.current=FileSystem.writeAsStringAsync(historyFile,JSON.stringify(clean)).catch(()=>{});}}}catch(e){/* Historique absent ou illisible : démarrer avec une liste vide. */}finally{if(active)setHistoryLoaded(true);}})();return()=>{active=false;};},[]);
 const saveAdvice=(groupId:string,tier:AdviceTier,combo:Combo|null,source:'auto'|'relance')=>{if(!combo||!combo.picks.length)return;const day=localDayKey();const signature=(picks:ComboPick[])=>JSON.stringify(picks.map(p=>({id:String(p.id),market:p.market,odds:p.odds,probability:p.probability})));const currentSignature=signature(combo.picks);const existingIndex=historyRef.current.findIndex(item=>item.groupId===groupId&&item.day===day&&item.tier===tier);const existing=existingIndex>=0?historyRef.current[existingIndex]:undefined;if(existing&&signature(existing.picks)===currentSignature)return;const createdAt=new Date().toISOString(),titles:Record<AdviceTier,string>={safe:'COMBINÉ 1 · COTE 2 À 4',medium:'COMBINÉ 2 · COTE 4 À 8',high:'COMBINÉ 3 · COTE 8 À 15',instinct:'COMBINÉ 4 · COTE 15 À 25',fun:'COMBINÉ 5 · COTE 25 À 40'};const entry:SavedAdvice={id:createdAt+'-'+tier+'-'+groupId+'-'+(historyRef.current.length+1),createdAt,day,groupId,tier,title:titles[tier],odds:combo.odds,probability:combo.probability,picks:combo.picks.map(p=>({...p})),source};const next=historyRef.current.filter(item=>!(item.groupId===groupId&&item.day===day&&item.tier===tier));next.unshift(entry);next.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));historyRef.current=next;setSavedAdvice(next);historyWriteRef.current=historyWriteRef.current.then(()=>FileSystem.writeAsStringAsync(historyFile,JSON.stringify(next))).catch(()=>{});};
 const [comboRelaunch,setComboRelaunch]=useState<Record<number,number>>({}); const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState<string|null>(null),[apiOnline,setApiOnline]=useState(false),[clockNow,setClockNow]=useState(Date.now());
 const load=useCallback(async()=>{try{setError('');const response=await fetch(DATA_URL+'?t='+Date.now());if(!response.ok)throw new Error('Données indisponibles ('+response.status+').');const data=await response.json();const list=Array.isArray(data.matches)?data.matches.filter((m:any)=>String(m.lg||'').toLowerCase()!=='eredivisie'):[];setMatches(deduplicateMatches(list));setUpdatedAt(data.updatedAt||null);const history=Array.isArray(data.hist)?data.hist:[];const validHistory=history.filter((e:any)=>Array.isArray(e.p)&&e.p.length===3&&e.p.every((v:number)=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(e.p.reduce((a:number,b:number)=>a+b,0)-1)<=.005&&Array.isArray(e.r)&&e.r.length===2&&e.r.every((v:number)=>Number.isInteger(v)&&v>=0));let histCorrect=0,brier=0,logLoss=0;validHistory.forEach((e:any)=>{const outcome=e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2,best=e.p.indexOf(Math.max(...e.p));if(best===outcome)histCorrect++;brier+=e.p.reduce((sum:number,p:number,i:number)=>sum+(p-(i===outcome?1:0))**2,0);logLoss-=Math.log(Math.max(1e-15,e.p[outcome]));});setProbabilityStats({matches:validHistory.length,accuracy:validHistory.length?Math.round(histCorrect/validHistory.length*1000)/10:null,brier:validHistory.length?Math.round(brier/validHistory.length*10000)/10000:null,logLoss:validHistory.length?Math.round(logLoss/validHistory.length*10000)/10000:null});const paired=history.filter((e:any)=>Array.isArray(e.modelP)&&e.modelP.length===3&&e.modelP.every((v:number)=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(e.modelP.reduce((x:number,y:number)=>x+y,0)-1)<=.005&&Array.isArray(e.marketP)&&e.marketP.length===3&&e.marketP.every((v:number)=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(e.marketP.reduce((x:number,y:number)=>x+y,0)-1)<=.005&&Array.isArray(e.r)&&e.r.length===2&&e.r.every((v:number)=>Number.isInteger(v)&&v>=0));const score=(key:string)=>{let correct=0,bs=0,ll=0;paired.forEach((e:any)=>{const p=e[key],outcome=e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2;if(p.indexOf(Math.max(...p))===outcome)correct++;bs+=p.reduce((sum:number,v:number,i:number)=>sum+(v-(i===outcome?1:0))**2,0);ll-=Math.log(Math.max(1e-15,p[outcome]));});return{accuracy:paired.length?Math.round(correct/paired.length*1000)/10:null,brier:paired.length?Math.round(bs/paired.length*10000)/10000:null,logLoss:paired.length?Math.round(ll/paired.length*10000)/10000:null};};const modelScore=score('modelP'),marketScore=score('marketP');setComparisonStats({matches:paired.length,modelAccuracy:modelScore.accuracy,modelBrier:modelScore.brier,modelLogLoss:modelScore.logLoss,marketAccuracy:marketScore.accuracy,marketBrier:marketScore.brier,marketLogLoss:marketScore.logLoss});const finished=list.filter((m:Match)=>Array.isArray(m.r)&&m.r.length===2);const upcoming=list.filter((m:Match)=>!Array.isArray(m.r)||m.r.length!==2);let correct=0,evaluated=0;for(const m of finished){const hit=predictionCorrect(m);if(hit===null)continue;evaluated++;if(hit)correct++;}setStats({total:list.length,upcoming:upcoming.length,finished:finished.length,evaluated,correct,accuracy:evaluated?Math.round(correct/evaluated*100):null});setApiOnline(true);}catch(e:any){setApiOnline(false);setError(e?.message||'Impossible de charger les données Pronokikz.');}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>{const isLiveView=tab==='Matchs'&&matchStatusFilter==='En direct';const isAdviceView=tab==='Mon conseil';const isDailyView=tab==='Matchs du jour';const refresh=isLiveView?setInterval(()=>load(),15000):(isAdviceView||isDailyView)?setInterval(()=>load(),5*60*1000):null;const clock=setInterval(()=>setClockNow(Date.now()),60000);if(isLiveView||isAdviceView||isDailyView)load();const appState=AppState.addEventListener('change',state=>{if(state==='active'&&(isLiveView||isAdviceView||isDailyView))load();});return()=>{if(refresh)clearInterval(refresh);clearInterval(clock);appState.remove();};},[load,tab,matchStatusFilter]);
 const liveMatches=useMemo(()=>deduplicateMatches(matches).filter(m=>!(Array.isArray(m.r)&&m.r.length===2)&&String(m.liveStatus||'')!=='FINISHED'&&['IN_PLAY','PAUSED','SUSPENDED'].includes(String(m.liveStatus||''))).sort((a,b)=>(a.d||'').concat(a.h||'').localeCompare((b.d||'').concat(b.h||''))),[matches]);
 const todayMatches=useMemo(()=>deduplicateMatches(matches).filter(m=>m.d===localDayKey()).sort((a,b)=>(a.h||'').localeCompare(b.h||'')),[matches]);
 const liveLabel=(m:Match)=>{const status=String(m.liveStatus||'');if(status==='PAUSED')return 'MI-TEMPS';if(status==='SUSPENDED')return 'SUSPENDU';if(status==='IN_PLAY'){const hasSourceMinute=typeof m.liveMinute==='number'&&Number.isFinite(m.liveMinute);const kickoff=m.d&&m.h?new Date(m.d+'T'+m.h+':00').getTime():NaN;const elapsed=Number.isFinite(kickoff)?Math.max(0,Math.floor((clockNow-kickoff)/60000)):0;const minute=hasSourceMinute?m.liveMinute!:elapsed;return minute>0?`LIVE · ${minute}${m.liveAdded?`+${m.liveAdded}`:''}′`:'LIVE';}return '';};
 const liveScore=(m:Match)=>Array.isArray(m.liveScore)&&m.liveScore.length===2?m.liveScore:m.r;
 const upcoming=useMemo(()=>matches.filter(m=>{if(m.r||!m.d||!m.h)return false;const kickoff=new Date(m.d+'T'+m.h+':00');return !Number.isNaN(kickoff.getTime())&&kickoff.getTime()>Date.now();}).sort((a,b)=>(a.d||'').concat(a.h||'').localeCompare((b.d||'').concat(b.h||''))),[matches]);
 const dailyCombos=useMemo(()=>{const now=Date.now(),today=(()=>{const d=new Date(now);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();const eligible=upcoming.filter(m=>{const kickoff=new Date((m.d||'')+'T'+(m.h||'00:00')+':00').getTime();return m.d===today&&Number.isFinite(kickoff)&&kickoff>=now&&hasFreshMarketOdds(m,12);});const byDay=new Map<string,Match[]>();eligible.forEach(m=>{const day=m.d||'';if(!day)return;const group=byDay.get(day)||[];group.push(m);byDay.set(day,group);});const sameDay=[...byDay.entries()].filter(([,group])=>group.length>=2).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))[0]?.[1]||[];const bands:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[[2,4],[4,8],[8,15],[15,25],[25,40]];const selected:{id:string;combo:Combo}[]=[];const signatures=new Set<string>();bands.forEach(([min,max],i)=>{const combo=buildCombo(sameDay,min,max,((now/86400000)|0)+i*7919+37+(comboRelaunch[i]||0)*104729,0.25,false);if(!combo)return;const signature=combo.picks.map(p=>p.id+':'+p.market).sort().join('|');if(signatures.has(signature))return;signatures.add(signature);selected.push({id:'daily-'+i+'-'+signature,combo});});return selected;},[upcoming,comboRelaunch]);
 const dailyMyBetCombo=useMemo(()=>{const now=Date.now(),today=(()=>{const d=new Date(now);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();const eligible=upcoming.filter(m=>{const kickoff=new Date((m.d||'')+'T'+(m.h||'00:00')+':00').getTime();return m.d===today&&Number.isFinite(kickoff)&&kickoff>=now&&hasFreshMarketOdds(m,12);});return buildMyBetCombo(eligible,Math.floor(now/300000));},[upcoming]);
 const finished=useMemo(()=>matches.filter(m=>Array.isArray(m.r)&&m.r.length===2).sort((a,b)=>((b.d||'')+(b.h||'')).localeCompare((a.d||'')+(a.h||''))),[matches]);
 const visibleResults=useMemo(()=>finished.filter(m=>{
  const hit=predictionCorrect(m);
  return (resultLeagueFilter==='Toutes'||m.lg===resultLeagueFilter)&&(resultFilter==='Tous'||(resultFilter==='Gagnés'?hit===true:hit===false));
 }),[finished,resultFilter,resultLeagueFilter]);
 const resultGroups=useMemo(()=>{
  const groups:Record<string,Match[]>={};
  visibleResults.forEach(m=>{const date=m.d||'Date inconnue';(groups[date]||(groups[date]=[])).push(m);});
  return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));
 },[visibleResults]);
 const leagueOptions=useMemo(()=>['Toutes',...Array.from(new Set(matches.map(m=>m.lg).filter((x):x is string=>!!x))).sort((a,b)=>a.localeCompare(b,'fr'))],[matches]); const matchStatusMatches=useMemo(()=>matchStatusFilter==='En direct'?liveMatches:matchStatusFilter==='Terminés'?finished:upcoming,[matchStatusFilter,liveMatches,finished,upcoming]); const visible=useMemo(()=>deduplicateMatches(matchStatusMatches).filter(m=>leagueFilter==='Toutes'||m.lg===leagueFilter),[matchStatusMatches,leagueFilter]);
 const leagueStats=useMemo(()=>{
  const groups:Record<string,{evaluated:number;correct:number}>={};
  matches.forEach(m=>{
   const hit=predictionCorrect(m);if(!m.lg||hit===null)return;
   const g=groups[m.lg]||(groups[m.lg]={evaluated:0,correct:0});
   g.evaluated++;if(hit)g.correct++;
  });
  return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],'fr'));
 },[matches]);
 // L’historique est alimenté uniquement par les combinés réellement affichés dans « Mon conseil ».
 useEffect(()=>{if(!historyLoaded||loading||!dailyCombos.length)return;const today=localDayKey();const tiers:AdviceTier[]=['safe','medium','high','instinct','fun'];dailyCombos.forEach((item,index)=>saveAdvice(today,tiers[index],item.combo,'auto'));},[historyLoaded,loading,dailyCombos]);
 const competitionAccent=(league:string)=>{const name=league.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(name.includes('feminin')||name.includes('women'))return '#F472B6';if(name.includes('champions league')||name.includes('ligue des champions'))return '#60A5FA';if(name.includes('nations'))return '#F5B800';return '#FB923C';};
 const Probability=({label,value,active=false}:{label:string;value?:number;active?:boolean})=><View style={[s.probCell,active&&s.probCellActive]}><Text style={[s.probLabel,active&&s.probLabelActive]}>{label}</Text><Text style={[s.probValue,active&&s.probValueActive]}>{pct(value)}</Text></View>;
 const winningOutcome=(m:Match)=>{if(m.p1==null||m.pN==null||m.p2==null)return null;const [p1,pN,p2]=effective1x2(m),best=Math.max(p1,pN,p2);return { '1':p1===best,'N':pN===best,'2':p2===best };};
 const MatchCard=({match}:{match:Match})=><Pressable style={s.card} onPress={()=>setSelected(match)}>
  <View style={s.meta}><Text style={[s.league,{color:competitionAccent(match.lg||'Compétition')}]}>{match.lg||'Compétition'}</Text><View style={{flexDirection:'row',alignItems:'center',gap:8}}>{!Array.isArray(match.r)&&!!match.liveStatus&&['IN_PLAY','PAUSED','SUSPENDED'].includes(match.liveStatus)&&<Text style={{color:match.liveStatus==='PAUSED'?'#FBBF24':'#FF526B',fontSize:10,fontWeight:'900'}}>{liveLabel(match)}</Text>}<Text style={s.date}>{dateLabel(match.d,match.h)}</Text></View></View>
  <View style={s.teams}><View style={s.teamSide}>{!!match.hc&&<Image source={{uri:match.hc}} style={s.crest}/>}<Text style={s.team}>{displayTeamName(match.home)||'Domicile'}</Text></View><Text style={[s.vs,!!match.liveStatus&&{fontSize:18,color:palette.accent}]}>{liveScore(match)?liveScore(match)![0]+' - '+liveScore(match)![1]:'VS'}</Text><View style={s.teamSide}>{!!match.ac&&<Image source={{uri:match.ac}} style={s.crest}/>}<Text style={s.team}>{displayTeamName(match.away)||'Extérieur'}</Text></View></View>
  <View style={s.probs}><Probability label="1" value={effective1x2(match)[0]} active={!!winningOutcome(match)?.['1']}/><Probability label="N" value={effective1x2(match)[1]} active={!!winningOutcome(match)?.N}/><Probability label="2" value={effective1x2(match)[2]} active={!!winningOutcome(match)?.['2']}/></View>
  {!!match.r&&<View style={{marginTop:14,backgroundColor:predictionCorrect(match)===true?'#123D08':predictionCorrect(match)===false?'#45101D':palette.surface,borderWidth:1,borderColor:predictionCorrect(match)===true?'#39FF14':predictionCorrect(match)===false?'#FF1744':palette.border,borderRadius:10,paddingHorizontal:12,paddingVertical:11}}><Text style={{color:predictionCorrect(match)===true?'#39FF14':predictionCorrect(match)===false?'#FF4D6D':palette.muted,fontSize:13,fontWeight:'900',textAlign:'center',letterSpacing:0.5}}>{predictionCorrect(match)===null?'◷ PRONO NON ÉVALUÉ':predictionCorrect(match)?'✓ PRONO CORRECT':'✕ PRONO FAUX'}</Text></View>}
  <View style={s.footerRow}><Text style={s.pick}>PRONO : {displayedPrediction(match)}</Text><Text style={s.link}>Détails →</Text></View>
 </Pressable>;
 const StatBox=({label,value}:{label:string;value:string|number})=><View style={s.statBox}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
 return <SafeAreaView style={s.safe}><StatusBar barStyle={palette.statusBar}/><View style={s.container}>
  <ScrollView removeClippedSubviews={true} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} scrollEventThrottle={16} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={palette.accent}/>}>
   <View style={s.header}><View><Text style={s.logo}>PRONO<Text style={s.green}>KIKZ</Text></Text><Text style={s.subtitle}>SPORTS INTELLIGENCE</Text></View><View style={s.headerActions}><View style={[s.status,!apiOnline&&s.offline]}><View style={[s.dot,!apiOnline&&s.offlineDot]}/><Text style={[s.statusText,!apiOnline&&s.offlineText]}>{apiOnline?'FLUX DISPONIBLE':'FLUX INDISPONIBLE'}</Text></View><Pressable accessibilityLabel="Apparence" style={s.themeButton} onPress={()=>setTab('Apparence')}><Text style={s.themeButtonText}>⚙</Text></Pressable></View></View>
   {selected?<View><Pressable onPress={()=>setSelected(null)}><Text style={s.back}>← Retour</Text></Pressable><Text style={s.title}>Analyse du match</Text><View style={s.card}><Text style={s.league}>{selected.lg}</Text><Text style={s.detailTeams}>{displayTeamName(selected.home)} <Text style={s.green}>VS</Text> {displayTeamName(selected.away)}</Text><Text style={s.date}>{dateLabel(selected.d,selected.h)}</Text>{!!selected.r&&<Text style={s.result}>Résultat : {selected.r[0]} - {selected.r[1]}</Text>}<Text style={s.sectionTitle}>Probabilités 1N2</Text><View style={s.probs}><Probability label="1" value={effective1x2(selected)[0]} active={!!winningOutcome(selected)?.['1']}/><Probability label="N" value={effective1x2(selected)[1]} active={!!winningOutcome(selected)?.N}/><Probability label="2" value={effective1x2(selected)[2]} active={!!winningOutcome(selected)?.['2']}/></View><Text style={s.sectionTitle}>Autres indicateurs</Text><Text style={s.info}>Les deux équipes marquent : {pct(selected.btts)}</Text><Text style={s.info}>Plus de 2,5 buts : {pct(selected.o25)}</Text>{!!selected.ia&&<Text style={s.info}>{selected.ia}</Text>}{!!selected.ex&&<Text style={s.info}>Avis : {selected.ex}</Text>}{!!selected.fin&&<Text style={s.info}>Sélection : {formatSelection(selected.fin)}</Text>}<Text style={s.disclaimer}>Ces probabilités sont des estimations statistiques, pas des garanties de résultat.</Text></View></View>:<>
    <View style={s.heroCompact}><Text style={s.tag}>PRONOKIKZ</Text><Text style={s.heroCompactDesc}>Scores · Analyses · Pronostics</Text></View>
    {tab==='Accueil'&&<><Text style={s.title}>Tableau de bord</Text><Text style={s.heroDesc}>L’essentiel de Pronokikz en un coup d’œil.</Text><View style={s.statsRow}><StatBox label="À venir" value={upcoming.length}/><StatBox label="En direct" value={liveMatches.length}/><StatBox label="Réussite" value={stats?.accuracy==null?'—':stats.accuracy+'%'}/></View><View style={s.sectionHeader}><Text style={s.sectionTitle}>Prochains matchs</Text><Pressable onPress={()=>{setMatchStatusFilter('À venir');setTab('Matchs');}}><Text style={s.link}>Tous les matchs →</Text></Pressable></View>{loading?<ActivityIndicator color={palette.accent} size="large"/>:error?<Text style={s.error}>{error}</Text>:upcoming.length?upcoming.slice(0,4).map(m=><MatchCard key={String(m.id)} match={m}/>):<Text style={s.info}>Aucun match disponible pour le moment.</Text>}<Pressable style={s.button} onPress={()=>{setMatchStatusFilter('À venir');setTab('Matchs');}}><Text style={s.buttonText}>Explorer tous les matchs →</Text></Pressable></>}
    {tab==='Matchs du jour'&&<><Text style={s.title}>Matchs du jour</Text><Text style={s.heroDesc}>Tous les matchs programmés aujourd’hui, avec les pronostics et les scores actualisés automatiquement.</Text><View style={s.statsRow}><StatBox label="Matchs" value={todayMatches.length}/><StatBox label="En direct" value={todayMatches.filter(m=>['IN_PLAY','PAUSED','SUSPENDED'].includes(String(m.liveStatus||''))).length}/><StatBox label="Terminés" value={todayMatches.filter(m=>Array.isArray(m.r)&&m.r.length===2).length}/></View>{(()=>{const evaluated=todayMatches.map(m=>({match:m,hit:predictionCorrect(m)})).filter(x=>x.hit!==null);const won=evaluated.filter(x=>x.hit===true).length,lost=evaluated.length-won,rate=evaluated.length?Math.round(won/evaluated.length*100)+'%':'—';const pending=todayMatches.filter(m=>!Array.isArray(m.r)||m.r.length!==2).length;return <View style={s.card}><Text style={s.sectionTitle}>📊 Winrate du jour</Text><Text style={s.bigNumber}>{rate}</Text><View style={s.footerRow}><Text style={s.info}>Pronostics gagnés / perdus</Text><Text style={s.comboProb}>{won} / {lost}</Text></View><View style={s.footerRow}><Text style={s.info}>Matchs en cours / à venir</Text><Text style={s.comboProb}>{pending}</Text></View><Text style={s.info}>{evaluated.length?'Calculé uniquement sur les pronostics des matchs du jour ayant un score final.':'Le winrate sera calculé dès que les premiers matchs du jour seront terminés.'}</Text></View>})()}{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:todayMatches.length?todayMatches.map(m=><MatchCard key={String(m.id)} match={m}/>):<Text style={s.info}>Aucun match prévu aujourd’hui pour les compétitions suivies.</Text>}<Pressable style={s.button} onPress={()=>{setRefreshing(true);load();}}><Text style={s.buttonText}>↻ Actualiser les matchs</Text></Pressable></>}
    {tab==='Apparence'&&<><Text style={s.title}>Apparence</Text><Text style={s.heroDesc}>Choisis les couleurs de Pronokikz. Le changement s'applique immédiatement.</Text>{THEME_OPTIONS.map(option=><Pressable key={option.id} disabled={!themeLoaded} onPress={()=>changeTheme(option.id)} style={[s.card,s.themeOption,themeName===option.id&&s.themeOptionActive]}><View style={s.themeOptionLeft}><Text style={s.themeIcon}>{option.icon}</Text><View style={{flex:1}}><Text style={s.comboTitle}>{option.label}</Text><Text style={s.info}>{option.hint}</Text></View></View><Text style={s.themeCheck}>{themeName===option.id?'✓':'○'}</Text></Pressable>)}<Text style={s.sectionTitle}>Mise à jour</Text><View style={s.card}><Text style={s.info}>Vérifie si une nouvelle version de Pronokikz est disponible et installe-la automatiquement.</Text><Pressable disabled={updateChecking} onPress={checkForAppUpdate} style={[s.button,updateChecking&&{opacity:0.65}]}>{updateChecking?<ActivityIndicator color={palette.buttonText}/>:<Text style={s.buttonText}>↻ Vérifier et mettre à jour</Text>}</Pressable>{!!updateMessage&&<Text style={s.info}>{updateMessage}</Text>}</View></>}
    {tab==='Mon conseil'&&<><Text style={s.title}>Mon conseil</Text><Text style={s.heroDesc}>Jusqu’à 5 combinés composés uniquement des matchs d’aujourd’hui, issus de l’onglet Matchs. Objectifs de cotes variés : 2–4, 4–8, 8–15, 15–25 et 25–40, avec des cotes réelles et récentes. Actualisation automatique toutes les 5 minutes lorsque cet onglet est ouvert.</Text>{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:dailyCombos.length?dailyCombos.map((item,i)=><View key={item.id} style={[s.card,{borderLeftWidth:4,borderLeftColor:palette.accent}]}><View style={s.comboOdds}><View><Text style={s.comboTitle}>COMBINÉ {i+1}</Text><Text style={s.comboOddsLabel}>{item.combo.picks.length} MATCHS · COTE TOTALE</Text></View><Text style={s.comboOddsValue}>{item.combo.odds.toFixed(2).replace('.',',')}</Text></View>{item.combo.picks.map((p,j)=><View key={p.id+':'+p.market} style={s.comboPick}><View style={{flex:1}}><Text style={s.comboMatch}>{displayMatchName(p.match)}</Text><Text style={s.comboDate}>📅 {p.kickoff} · {p.league}</Text><Text style={[s.comboMarket,{color:palette.accent}]}>{p.market}</Text><Text style={s.info}>Cote : {p.odds.toFixed(2).replace('.',',')}</Text></View></View>)}<Text style={s.info}>Probabilité théorique combinée : {pct(item.combo.probability)}. Cotes relevées sur des marchés réels, à revérifier avant toute mise.</Text><Pressable style={s.button} onPress={()=>setComboRelaunch(value=>({...value,[i]:(value[i]||0)+1}))}><Text style={s.buttonText}>⟳ Relancer ce combiné</Text></Pressable></View>):<Text style={s.info}>Aucun combiné fiable dans la plage 2,00–40,00 avec suffisamment de cotes réelles et récentes. Je préfère ne pas en inventer.</Text>}{dailyMyBetCombo&&<View style={[s.card,{borderLeftWidth:4,borderLeftColor:palette.accent}]}><View style={s.comboOdds}><View><Text style={s.comboTitle}>COMBINÉ MYBET + PRONOS</Text><Text style={s.comboOddsLabel}>1 MYBET · AUTRES MATCHS</Text></View><Text style={s.comboOddsValue}>{dailyMyBetCombo.odds.toFixed(2).replace('.',',')}</Text></View>{dailyMyBetCombo.picks.map((p,j)=><View key={'mybet-'+p.id+':'+j} style={s.comboPick}><View style={{flex:1}}><Text style={s.comboMatch}>{displayMatchName(p.match)}</Text><Text style={s.comboDate}>📅 {p.kickoff} · {p.league}</Text><Text style={[s.comboMarket,{color:palette.accent}]}>{p.market}</Text><Text style={s.info}>Cote indicative : {p.odds.toFixed(2).replace('.',',')} · {p.bookmaker}</Text></View></View>)}<Text style={s.info}>Probabilité indicative : {pct(dailyMyBetCombo.probability)}. La probabilité MyBet utilise une borne prudente à partir des probabilités disponibles ; la cote est une approximation, pas une cote MyBet officielle.</Text></View>}{historyLoaded&&savedAdvice.length>0&&<View style={s.card}>
      <Text style={s.sectionTitle}>🏆 Historique de mes conseils</Text>
      <Text style={s.info}>Appuie sur un conseil pour afficher ses matchs et ses scores.</Text>
      <View style={{flexDirection:'row',gap:7,marginTop:12,marginBottom:8}}>
       {[
        {label:'GAGNÉS',value:savedAdvice.filter(item=>evaluateAdvice(item.picks,matches).status==='won').length,color:'#22C55E'},
        {label:'PERDUS',value:savedAdvice.filter(item=>evaluateAdvice(item.picks,matches).status==='lost').length,color:'#F87171'},
        {label:'EN ATTENTE',value:savedAdvice.filter(item=>evaluateAdvice(item.picks,matches).status==='pending').length,color:palette.accent}
       ].map(stat=><View key={stat.label} style={{flex:1,backgroundColor:palette.surface,borderRadius:9,paddingVertical:10,alignItems:'center',borderWidth:1,borderColor:palette.border}}>
        <Text style={{fontSize:19,fontWeight:'900',color:stat.color}}>{stat.value}</Text>
        <Text style={{fontSize:9,fontWeight:'900',color:palette.muted,marginTop:3}}>{stat.label}</Text>
       </View>)}
      </View>
      {Object.entries(savedAdvice.reduce<Record<string,SavedAdvice[]>>((groups,item)=>{(groups[item.day]||(groups[item.day]=[])).push(item);return groups;},{})).sort(([a],[b])=>b.localeCompare(a)).map(([day,dayAdvice])=><View key={'day-'+day} style={{marginTop:12}}>
       <View style={{backgroundColor:palette.activeSurface,borderRadius:10,padding:11,borderWidth:1,borderColor:palette.border}}>
        <Text style={{fontSize:13,fontWeight:'900',color:palette.text}}>CONSEILS DU {new Date(day+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})}</Text>
        <View style={{flexDirection:'row',gap:12,marginTop:6,flexWrap:'wrap'}}>
         <Text style={{fontSize:10,fontWeight:'800',color:'#22C55E'}}>✓ {dayAdvice.filter(item=>evaluateAdvice(item.picks,matches).status==='won').length} gagnés</Text>
         <Text style={{fontSize:10,fontWeight:'800',color:'#F87171'}}>✕ {dayAdvice.filter(item=>evaluateAdvice(item.picks,matches).status==='lost').length} perdus</Text>
         <Text style={{fontSize:10,fontWeight:'800',color:palette.accent}}>◷ {dayAdvice.filter(item=>evaluateAdvice(item.picks,matches).status==='pending').length} en attente</Text>
        </View>
       </View>
       {dayAdvice.sort((a,b)=>a.odds-b.odds).map(item=>{
       const evaluation=evaluateAdvice(item.picks,matches),won=evaluation.status==='won',lost=evaluation.status==='lost';
       const color=won?'#22C55E':lost?'#F87171':palette.accent;
       const expanded=expandedAdviceId===item.id;
       return <View key={item.id} style={{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:10,marginTop:8,overflow:'hidden'}}>
        <Pressable onPress={()=>setExpandedAdviceId(current=>current===item.id?null:item.id)} style={{padding:12}}>
         <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <View style={{flex:1}}>
           <Text style={{fontSize:12,fontWeight:'900',color:palette.text}}>{item.title}</Text>
           <Text style={{fontSize:10,color:palette.muted,marginTop:4}}>{new Date(item.day+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})} · Cote {item.odds.toFixed(2).replace('.',',')}</Text>
          </View>
          <View style={{backgroundColor:won?'#163B2B':lost?'#452323':palette.activeSurface,borderRadius:16,paddingHorizontal:9,paddingVertical:6}}>
           <Text style={{fontSize:9,fontWeight:'900',color}}>{won?'✓ GAGNÉ':lost?'✕ PERDU':'◷ EN ATTENTE'}</Text>
          </View>
          <Text style={{fontSize:15,color:palette.muted}}>{expanded?'−':'+'}</Text>
         </View>
         <Text style={{fontSize:10,color:palette.muted,marginTop:7}}>{item.picks.length} match{item.picks.length>1?'s':''} · {expanded?'Masquer le détail':'Afficher le détail'}</Text>
        </Pressable>
        {expanded&&<View style={{paddingHorizontal:12,paddingBottom:10,borderTopWidth:1,borderTopColor:palette.border}}>
         <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:9}}>
          <Text style={{fontSize:10,color:palette.muted}}>Probabilité estimée</Text>
          <Text style={{fontSize:11,fontWeight:'800',color:palette.text}}>{pct(item.probability)}</Text>
         </View>
         {item.picks.map((p,index)=>{
          const match=matches.find(m=>String(m.id)===String(p.id));
          const finished=!!(match&&Array.isArray(match.r)&&match.r.length===2);
          return <View key={p.id+':'+p.market} style={{paddingVertical:8,borderTopWidth:1,borderTopColor:palette.border}}>
           <Text style={{fontSize:11,fontWeight:'800',color:palette.text}}>{displayMatchName(p.match)}</Text>
           <Text style={{fontSize:10,color:palette.accent,marginTop:3}}>{p.market} · Cote {p.odds.toFixed(2).replace('.',',')}</Text>
           <Text style={{fontSize:10,color:finished?palette.text:palette.muted,marginTop:4}}>{finished?'Score final : '+match!.r![0]+' - '+match!.r![1]:'Match à venir ou en cours'}</Text>
          </View>;
         })}
        </View>}
       </View>;
       })}
      </View>)}
     </View>}<Pressable style={s.button} onPress={()=>{setRefreshing(true);load();}}><Text style={s.buttonText}>↻ Actualiser les combinés</Text></Pressable><Text style={s.disclaimer}>Une cote élevée augmente le risque de perte. Les probabilités combinées sont des estimations et ne garantissent aucun résultat. Ne mise que ce que tu peux te permettre de perdre.</Text></>}
    {tab==='Matchs'&&<><Text style={s.title}>Tous les matchs</Text><Text style={s.heroDesc}>À venir, en direct et terminés au même endroit. Les scores se mettent à jour automatiquement.</Text><View style={s.statsRow}>{(['À venir','En direct','Terminés'] as const).map(name=><Pressable key={name} onPress={()=>setMatchStatusFilter(name)} style={[s.statBox,matchStatusFilter===name&&{borderColor:palette.accent,backgroundColor:palette.activeSurface}]}><Text style={[s.statLabel,matchStatusFilter===name&&{color:palette.accent}]}>{name}</Text><Text style={[s.statValue,matchStatusFilter===name&&{color:palette.accent}]}>{name==='À venir'?upcoming.length:name==='En direct'?liveMatches.length:finished.length}</Text></Pressable>)}</View>{!loading&&!error&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{leagueOptions.map(name=><Pressable key={name} onPress={()=>setLeagueFilter(name)} style={[s.filterChip,leagueFilter===name&&s.filterChipActive]}><Text style={[s.filterText,leagueFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView>}{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:visible.map(m=><MatchCard key={String(m.id)} match={m}/>)}{!loading&&!error&&!visible.length&&<Text style={s.info}>{matchStatusFilter==='En direct'?'Aucun match en direct pour le moment.':matchStatusFilter==='Terminés'?'Aucun match terminé pour ce filtre.':'Aucun match à venir pour ce filtre.'}</Text>}</>}
    {tab==='Résultats'&&<><Text style={s.title}>Résultats & historique</Text><View style={s.statsRow}><StatBox label="Matchs évalués" value={stats?.evaluated??0}/><StatBox label="Bons pronos" value={stats?.correct??0}/><StatBox label="Réussite" value={stats?.accuracy==null?'—':stats.accuracy+'%'}/></View><Text style={s.sectionTitle}>Filtrer les résultats</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{(['Tous','Gagnés','Perdus'] as const).map(name=><Pressable key={name} onPress={()=>setResultFilter(name)} style={[s.filterChip,resultFilter===name&&s.filterChipActive]}><Text style={[s.filterText,resultFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{['Toutes',...Array.from(new Set(finished.map(m=>m.lg).filter((x):x is string=>!!x))).sort((a,b)=>a.localeCompare(b,'fr'))].map(name=><Pressable key={name} onPress={()=>setResultLeagueFilter(name)} style={[s.filterChip,resultLeagueFilter===name&&s.filterChipActive]}><Text style={[s.filterText,resultLeagueFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView>{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:resultGroups.map(([date,dayMatches])=><View key={date}><View style={s.sectionHeader}><Text style={s.sectionTitle}>{date==='Date inconnue'?date:new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</Text><Text style={s.counter}>{dayMatches.length} MATCH{dayMatches.length>1?'S':''}</Text></View>{dayMatches.map(m=><MatchCard key={String(m.id)} match={m}/>)}</View>)}{!loading&&!error&&!visibleResults.length&&<Text style={s.info}>{finished.length?'Aucun résultat ne correspond à ces filtres.':'Les résultats apparaîtront après la mise à jour des données.'}</Text>}</>}
    {tab==='Stats'&&<><Text style={s.title}>Statistiques Pronokikz</Text><View style={s.statsRow}><StatBox label="Matchs" value={stats?.total??matches.length}/><StatBox label="Évalués" value={stats?.evaluated??0}/><StatBox label="Bons pronos" value={stats?.correct??0}/></View><View style={s.card}><Text style={s.sectionTitle}>Taux de réussite global</Text><Text style={s.bigNumber}>{stats?.accuracy==null?'—':stats.accuracy+'%'}</Text><Text style={s.info}>Calculé sur les pronostics terminés affichés dans le calendrier, en tenant compte de la sélection (1, N, 2 ou double chance).</Text></View><View style={s.card}><Text style={s.sectionTitle}>Fiabilité des probabilités · historique</Text><View style={s.footerRow}><Text style={s.info}>Matchs analysés</Text><Text style={s.comboProb}>{probabilityStats?.matches??0}</Text></View><View style={s.footerRow}><Text style={s.info}>Réussite du résultat le plus probable</Text><Text style={s.comboProb}>{probabilityStats?.accuracy==null?'—':probabilityStats.accuracy+'%'}</Text></View><View style={s.footerRow}><Text style={s.info}>Brier Score (plus bas = mieux)</Text><Text style={s.comboProb}>{probabilityStats?.brier==null?'—':probabilityStats.brier.toFixed(4)}</Text></View><View style={s.footerRow}><Text style={s.info}>Log Loss (plus bas = mieux)</Text><Text style={s.comboProb}>{probabilityStats?.logLoss==null?'—':probabilityStats.logLoss.toFixed(4)}</Text></View><Text style={s.info}>{(probabilityStats?.matches??0)<100?'Échantillon encore limité : il faut idéalement 100 à 300 matchs ou plus avant de tirer des conclusions solides.':'Échantillon suffisant pour commencer à suivre la calibration ; les scores doivent être comparés dans le temps.'}</Text></View><View style={s.card}><Text style={s.sectionTitle}>Modèle vs bookmakers · mêmes matchs</Text><View style={s.footerRow}><Text style={s.info}>Matchs comparables</Text><Text style={s.comboProb}>{comparisonStats?.matches??0}</Text></View><Text style={s.comboTitle}>Modèle seul</Text><View style={s.footerRow}><Text style={s.info}>Réussite du favori</Text><Text style={s.comboProb}>{comparisonStats?.modelAccuracy==null?'—':comparisonStats.modelAccuracy+'%'}</Text></View><View style={s.footerRow}><Text style={s.info}>Brier / Log Loss</Text><Text style={s.comboProb}>{comparisonStats?.modelBrier==null?'—':comparisonStats.modelBrier.toFixed(4)+' / '+comparisonStats.modelLogLoss?.toFixed(4)}</Text></View><Text style={s.comboTitle}>Marché bookmakers</Text><View style={s.footerRow}><Text style={s.info}>Réussite du favori</Text><Text style={s.comboProb}>{comparisonStats?.marketAccuracy==null?'—':comparisonStats.marketAccuracy+'%'}</Text></View><View style={s.footerRow}><Text style={s.info}>Brier / Log Loss</Text><Text style={s.comboProb}>{comparisonStats?.marketBrier==null?'—':comparisonStats.marketBrier.toFixed(4)+' / '+comparisonStats.marketLogLoss?.toFixed(4)}</Text></View><Text style={s.info}>Seuls les matchs avec les deux probabilités enregistrées avant le coup d’envoi sont comparés. Les anciens résultats ne sont pas reconstitués artificiellement.</Text></View><Text style={s.sectionTitle}>Performance par compétition</Text>{leagueStats.length?leagueStats.map(([name,g])=><View key={name} style={s.card}><View style={s.footerRow}><Text style={s.comboTitle}>{name}</Text><Text style={s.comboProb}>{g.evaluated?Math.round(g.correct/g.evaluated*100)+'%':'—'}</Text></View><Text style={s.info}>{g.correct} bons pronostics sur {g.evaluated} matchs évalués</Text></View>):<Text style={s.info}>Les statistiques par compétition apparaîtront dès que les premiers matchs seront terminés et évalués.</Text>}</>}
   </>}
   {!!updatedAt&&<Text style={s.updated}>Données mises à jour : {new Date(updatedAt).toLocaleString('fr-FR')}</Text>}<Text style={s.bottom}>PRONOKIKZ • VERSION 1.0</Text>
  </ScrollView>
  <View style={s.nav}>{['Accueil','Matchs du jour','Matchs','Mon conseil','Résultats','Stats'].map(item=><Pressable key={item} onPress={()=>{setSelected(null);setTab(item);}} style={s.navItem}><Text style={[s.navIcon,tab===item&&s.navActive]}>{item==='Accueil'?'⌂':item==='Matchs du jour'?'📅':item==='Matchs'?'⚽':item==='Historique'?'▤':item==='Résultats'?'◷':item==='Mon conseil'?'✦':'▥'}</Text><Text style={[s.navLabel,tab===item&&s.navActive]}>{item}</Text></Pressable>)}</View>
 </View></SafeAreaView>;
}
const createStyles=(theme:ThemePalette)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:theme.bg},comboTitle:{color:theme.text,fontSize:15,fontWeight:'900'},rerollButton:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.accent,padding:11,borderRadius:10,alignItems:'center',marginTop:13},rerollText:{color:theme.accent,fontWeight:'900',fontSize:12},comboOdds:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',marginTop:12,marginBottom:10,backgroundColor:theme.surface,padding:12,borderRadius:10},comboOddsLabel:{color:theme.muted,fontSize:9,fontWeight:'800'},comboOddsValue:{color:theme.accent,fontSize:26,fontWeight:'900'},comboPick:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:theme.border,gap:8},comboMatch:{color:theme.text,fontSize:12,fontWeight:'800'},comboDate:{color:theme.muted,fontSize:11,fontWeight:'700',marginTop:4},comboMarket:{color:theme.muted,fontSize:11,marginTop:4},comboProb:{color:theme.accent,fontSize:13,fontWeight:'900'},container:{flex:1,backgroundColor:theme.bg},content:{padding:18,paddingBottom:28},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:30},headerActions:{flexDirection:'row',alignItems:'center'},themeButton:{width:38,height:38,borderRadius:12,marginLeft:8,alignItems:'center',justifyContent:'center',backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},themeButtonText:{color:theme.accent,fontSize:19,fontWeight:'900'},themeOption:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},themeOptionActive:{borderColor:theme.accent,borderWidth:2},themeOptionLeft:{flexDirection:'row',alignItems:'center',flex:1,gap:12},themeIcon:{fontSize:24,width:32,textAlign:'center'},themeCheck:{color:theme.accent,fontSize:22,fontWeight:'900',marginLeft:12},logo:{color:theme.text,fontSize:25,fontWeight:'900',letterSpacing:1},subtitle:{color:theme.muted,fontSize:9,letterSpacing:2,marginTop:4},green:{color:theme.accent},status:{flexDirection:'row',alignItems:'center',backgroundColor:theme.surface,paddingHorizontal:10,paddingVertical:8,borderRadius:20},offline:{backgroundColor:'#321B20'},dot:{width:7,height:7,borderRadius:4,backgroundColor:theme.accent,marginRight:7},offlineDot:{backgroundColor:'#FF647C'},statusText:{color:theme.accent,fontWeight:'800',fontSize:9},offlineText:{color:'#FF8496'},hero:{marginBottom:25},heroCompact:{marginBottom:12,paddingBottom:4},heroCompactDesc:{color:theme.muted,fontSize:11,marginTop:2,marginBottom:8},tag:{color:theme.accent,fontSize:10,fontWeight:'900',letterSpacing:2,marginBottom:3},heroTitle:{color:theme.text,fontSize:30,fontWeight:'900',lineHeight:38},heroDesc:{color:theme.muted,fontSize:13,lineHeight:21,marginTop:10,marginBottom:18},statsRow:{flexDirection:'row',gap:9,marginBottom:25},statBox:{flex:1,backgroundColor:theme.card,borderRadius:13,padding:13,borderWidth:1,borderColor:theme.border},statValue:{color:theme.accent,fontSize:21,fontWeight:'900'},statLabel:{color:theme.muted,fontSize:11,marginTop:5},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:13},sectionTitle:{color:theme.text,fontSize:16,fontWeight:'800',marginTop:18,marginBottom:12},counter:{color:theme.accent,fontSize:10,fontWeight:'800'},card:{backgroundColor:theme.card,borderRadius:16,padding:15,borderWidth:1,borderColor:theme.border,marginBottom:12},meta:{flexDirection:'row',justifyContent:'space-between',gap:8,marginBottom:16},league:{color:theme.accent,fontSize:11,fontWeight:'800'},date:{color:theme.muted,fontSize:11},teams:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},teamSide:{flex:1,alignItems:'center',gap:6},team:{color:theme.text,fontWeight:'700',fontSize:12,textAlign:'center'},crest:{width:28,height:28,resizeMode:'contain'},vs:{color:theme.muted,fontSize:11,fontWeight:'900'},probs:{flexDirection:'row',gap:8,marginTop:18},probCell:{flex:1,alignItems:'center',backgroundColor:theme.surface,padding:10,borderRadius:9,borderWidth:1,borderColor:theme.border},probCellActive:{backgroundColor:theme.activeSurface,borderColor:theme.accent},probLabel:{color:theme.muted,fontSize:11},probLabelActive:{color:theme.accent,fontWeight:'900'},probValue:{color:theme.text,fontSize:17,fontWeight:'900',marginTop:4},probValueActive:{color:theme.accent},footerRow:{flexDirection:'row',justifyContent:'space-between',marginTop:14},pick:{color:theme.text,fontSize:10,fontWeight:'800',flex:1},link:{color:theme.accent,fontSize:10,fontWeight:'800'},title:{color:theme.text,fontSize:22,fontWeight:'900',marginBottom:10},detailTeams:{color:theme.text,fontSize:20,fontWeight:'900',marginTop:12},back:{color:theme.accent,fontWeight:'800',marginBottom:18},result:{color:theme.accent,fontWeight:'800',marginTop:12},info:{color:theme.muted,fontSize:13,lineHeight:21,marginTop:8},disclaimer:{color:theme.muted,fontSize:11,lineHeight:16,marginTop:18,fontStyle:'italic'},statsRowDummy:{},bigNumber:{color:theme.accent,fontSize:38,fontWeight:'900'},button:{backgroundColor:theme.accent,padding:15,borderRadius:12,alignItems:'center',marginTop:15},buttonText:{color:theme.buttonText,fontWeight:'900'},filters:{marginBottom:14,maxHeight:42},filtersContent:{gap:8,alignItems:'center'},filterChip:{borderWidth:1,borderColor:theme.border,backgroundColor:theme.card,paddingHorizontal:12,paddingVertical:9,borderRadius:18},filterChipActive:{backgroundColor:theme.activeSurface,borderColor:theme.accent},filterText:{color:theme.muted,fontSize:11,fontWeight:'700'},filterTextActive:{color:theme.accent},error:{color:'#FF8496',fontSize:12,marginVertical:12},updated:{color:theme.muted,fontSize:9,textAlign:'center',marginTop:18},bottom:{color:theme.muted,fontSize:9,textAlign:'center',marginTop:22,marginBottom:12},nav:{flexDirection:'row',justifyContent:'space-around',paddingTop:12,paddingBottom:48,backgroundColor:theme.nav,borderTopWidth:1,borderTopColor:theme.border},navItem:{alignItems:'center',gap:4,flex:1},navIcon:{fontSize:18,color:theme.muted},navLabel:{fontSize:8,color:theme.muted},historyStatus:{fontSize:10,fontWeight:'900'},navActive:{color:theme.accent,fontWeight:'900'}
});