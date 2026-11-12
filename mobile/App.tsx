import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { ActivityIndicator, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native';

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

type Match = { id: string | number; lg?: string; home?: string; away?: string; d?: string; h?: string; hc?: string; ac?: string; p1?: number; pN?: number; p2?: number; mkp?: number[]; btts?: number; o25?: number; mkOdds?: {h2h?:{home?:{price:number;bookmaker:string};draw?:{price:number;bookmaker:string};away?:{price:number;bookmaker:string}};totals?:{over25?:{price:number;bookmaker:string};under25?:{price:number;bookmaker:string}}} | null; mkOddsAt?: string; r?: number[] | null; ia?: string; bt?: string; ex?: string; fin?: string };
type Stats = { total: number; upcoming: number; finished: number; evaluated: number; correct: number; accuracy: number | null };
const pct = (n?: number) => n == null ? '—' : Math.round(n * 100) + '%';
const dateLabel = (d?: string, h?: string) => { if (!d) return 'Date à confirmer'; const x = new Date(d + 'T' + (h || '12:00') + ':00'); return Number.isNaN(x.getTime()) ? d : x.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const effective1x2 = (m: Match): [number,number,number] => { const model=[m.p1??0,m.pN??0,m.p2??0]; if(m.mkp?.length===3)return model; const q=m.mkOdds?.h2h,prices=[q?.home?.price,q?.draw?.price,q?.away?.price]; if(!prices.every(x=>Number.isFinite(x)&&x!>1))return model; const raw=prices.map(x=>1/(x as number)),sum=raw.reduce((a,b)=>a+b,0); if(!sum)return model; const market=raw.map(x=>x/sum); return model.map((p,i)=>0.15*p+0.85*market[i]) as [number,number,number]; };
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
type ComboPick = { id: string; match: string; league: string; kickoff: string; market: string; probability: number; odds: number; bookmaker: string };
type Combo = { picks: ComboPick[]; odds: number; probability: number };
const buildCombo = (matches: Match[], min: number, max: number, seed: number, minProbability = 0.35): Combo | null => {
 const byMatch: ComboPick[][] = [];
 matches.forEach(m => {
  const [p1,pN,p2]=effective1x2(m);
  const markets: [string, number | undefined, {price:number;bookmaker:string}|undefined][] = [
   ['Victoire domicile (1)',p1,m.mkOdds?.h2h?.home],['Match nul (N)',pN,m.mkOdds?.h2h?.draw],
   ['Victoire extérieur (2)',p2,m.mkOdds?.h2h?.away],['Plus de 2,5 buts',m.o25,m.mkOdds?.totals?.over25],
   ['Moins de 2,5 buts',m.o25==null?undefined:1-m.o25,m.mkOdds?.totals?.under25]
  ];
  const picks=markets.filter(([market,p,q])=>p!==undefined&&Number.isFinite(p)&&p>=minProbability&&p<=.94&&!!q&&Number.isFinite(q.price)&&q.price>1)
   .map(([market,probability,q])=>({id:String(m.id),match:(m.home||'?')+' – '+(m.away||'?'),league:m.lg||'Compétition',kickoff:dateLabel(m.d,m.h),market,probability:probability!,odds:q!.price,bookmaker:q!.bookmaker}));
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
   if(total>=min&&total<=max){
    const signature=picks.map(p=>p.id+':'+p.market).sort().join('|');
    if(!valid.has(signature))valid.set(signature,{picks:[...picks],odds:total,probability:picks.reduce((product,p)=>product*p.probability,1)});
    break;
   }
  }
 }
 if(!valid.size)return null;
 const target=(min+max)/2,ranked=[...valid.values()].sort((a,b)=>b.probability-a.probability||Math.abs(a.odds-target)-Math.abs(b.odds-target));
 // Choisir parmi plusieurs combinaisons valides proches de la cote cible pour que chaque relance puisse réellement varier.
 const pool=ranked.slice(0,Math.min(40,ranked.length));
 return pool[Math.floor(rand()*pool.length)];
};

export default function App() {
 const [themeName,setThemeName]=useState<ThemeName>('dark');
 const [themeLoaded,setThemeLoaded]=useState(false);
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
 const changeTheme=(next:ThemeName)=>{
  setThemeName(next);
  FileSystem.writeAsStringAsync(themeFile,JSON.stringify({theme:next})).catch(()=>{});
 };
 const [tab,setTab]=useState('Accueil'),[matches,setMatches]=useState<Match[]>([]),[stats,setStats]=useState<Stats|null>(null),[selected,setSelected]=useState<Match|null>(null),[leagueFilter,setLeagueFilter]=useState('Toutes'),[resultFilter,setResultFilter]=useState<'Tous'|'Gagnés'|'Perdus'>('Tous'),[resultLeagueFilter,setResultLeagueFilter]=useState('Toutes');
 const [leagueSeeds,setLeagueSeeds]=useState<Record<string,{safe:number;medium:number;high:number}>>({});
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState<string|null>(null),[apiOnline,setApiOnline]=useState(false);
 const load=useCallback(async()=>{try{setError('');const response=await fetch(DATA_URL+'?t='+Date.now());if(!response.ok)throw new Error('Données indisponibles ('+response.status+').');const data=await response.json();const list=Array.isArray(data.matches)?data.matches:[];setMatches(list);setUpdatedAt(data.updatedAt||null);const finished=list.filter((m:Match)=>Array.isArray(m.r)&&m.r.length===2);const upcoming=list.filter((m:Match)=>!Array.isArray(m.r)||m.r.length!==2);let correct=0,evaluated=0;for(const m of finished){if(m.p1==null||m.pN==null||m.p2==null)continue;const predicted=m.p1>=m.pN&&m.p1>=m.p2?'1':m.pN>=m.p1&&m.pN>=m.p2?'N':'2';const actual=m.r![0]>m.r![1]?'1':m.r![0]===m.r![1]?'N':'2';evaluated++;if(predicted===actual)correct++;}setStats({total:list.length,upcoming:upcoming.length,finished:finished.length,evaluated,correct,accuracy:evaluated?Math.round(correct/evaluated*100):null});setApiOnline(true);}catch(e:any){setApiOnline(false);setError(e?.message||'Impossible de charger les données Pronokikz.');}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{load();},[load]);
 const upcoming=useMemo(()=>matches.filter(m=>{if(m.r||!m.d||!m.h)return false;const kickoff=new Date(m.d+'T'+m.h+':00');return !Number.isNaN(kickoff.getTime())&&kickoff.getTime()>Date.now();}).sort((a,b)=>(a.d||'').concat(a.h||'').localeCompare((b.d||'').concat(b.h||''))),[matches]);
 const finished=useMemo(()=>matches.filter(m=>Array.isArray(m.r)&&m.r.length===2).sort((a,b)=>((b.d||'')+(b.h||'')).localeCompare((a.d||'')+(a.h||''))),[matches]);
 const visibleResults=useMemo(()=>finished.filter(m=>{
  const [p1,pN,p2]=effective1x2(m);
  const predicted=m.p1==null||m.pN==null||m.p2==null?null:p1>=pN&&p1>=p2?'1':pN>=p1&&pN>=p2?'N':'2';
  const actual=m.r![0]>m.r![1]?'1':m.r![0]===m.r![1]?'N':'2';
  const correct=predicted!==null&&predicted===actual;
  return (resultLeagueFilter==='Toutes'||m.lg===resultLeagueFilter)&&(resultFilter==='Tous'||(resultFilter==='Gagnés'?correct:predicted!==null&&!correct));
 }),[finished,resultFilter,resultLeagueFilter]);
 const resultGroups=useMemo(()=>{
  const groups:Record<string,Match[]>={};
  visibleResults.forEach(m=>{const date=m.d||'Date inconnue';(groups[date]||(groups[date]=[])).push(m);});
  return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));
 },[visibleResults]);
 const leagueOptions=useMemo(()=>['Toutes',...Array.from(new Set(matches.map(m=>m.lg).filter((x):x is string=>!!x))).sort((a,b)=>a.localeCompare(b,'fr'))],[matches]); const visible=useMemo(()=>upcoming.filter(m=>leagueFilter==='Toutes'||m.lg===leagueFilter),[upcoming,leagueFilter]);
 const leagueStats=useMemo(()=>{
  const groups:Record<string,{evaluated:number;correct:number}>={};
  matches.forEach(m=>{
   if(!m.lg||!m.r||m.r.length!==2||m.p1==null||m.pN==null||m.p2==null)return;
   const g=groups[m.lg]||(groups[m.lg]={evaluated:0,correct:0});
   const predicted=m.p1>=m.pN&&m.p1>=m.p2?'1':m.pN>=m.p1&&m.pN>=m.p2?'N':'2';
   const actual=m.r[0]>m.r[1]?'1':m.r[0]===m.r[1]?'N':'2';
   g.evaluated++;if(predicted===actual)g.correct++;
  });
  return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],'fr'));
 },[matches]);
 const competitionCombos=useMemo(()=>{
  // Trois conseils pour la prochaine journée disponible, sans mélanger les dates.
  const nextDate=upcoming.find(m=>m.d)?.d;
  if(!nextDate)return [];
  const dayMatches=upcoming.filter(m=>m.d===nextDate);
  const day=new Date(nextDate+'T12:00:00');
  const round=day.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  const groupId=nextDate;
  return [{
   groupId,round,matches:dayMatches,
   safe:buildCombo(dayMatches,2,4,(leagueSeeds[groupId]?.safe??0)+11,0.60),
   medium:buildCombo(dayMatches,6,8,(leagueSeeds[groupId]?.medium??0)+29,0.48),
   high:buildCombo(dayMatches,30,45,(leagueSeeds[groupId]?.high??0)+47,0.40)
  }];
 },[upcoming,leagueSeeds]);
 const rerollLeagueCombo=(groupId:string,tier:'safe'|'medium'|'high')=>{
  setLeagueSeeds(current=>({...current,[groupId]:{
   safe:current[groupId]?.safe??0,
   medium:current[groupId]?.medium??0,
   high:current[groupId]?.high??0,
   [tier]:(current[groupId]?.[tier]??0)+1
  }}));
 };
 const ComboCard=({title,combo,accent,groupId,tier}:{title:string;combo:Combo|null;accent:string;groupId:string;tier:'safe'|'medium'|'high'})=><View style={[s.card,{borderColor:accent,borderLeftWidth:4}]}>
  <Text style={s.comboTitle}>{title}</Text>
  {combo?<><View style={s.comboOdds}><Text style={s.comboOddsLabel}>COTE</Text><Text style={s.comboOddsValue}>{combo.odds.toFixed(2).replace('.',',')}</Text></View>
   {combo.picks.map((p,i)=><View key={p.id+':'+p.market} style={s.comboPick}><View style={{flex:1}}><Text style={s.comboMatch}>{p.match}</Text><Text style={[s.comboMarket,{color:competitionAccent(p.league)}]}>{p.market}</Text></View></View>)}
  </>:<Text style={s.info}>Pas assez de matchs ou de cotes disponibles pour ce conseil.</Text>}
  <Pressable style={s.rerollButton} onPress={()=>rerollLeagueCombo(groupId,tier)}><Text style={s.rerollText}>↻ Relancer ce conseil</Text></Pressable>
 </View>;

 const competitionAccent=(league:string)=>{const name=league.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(name.includes('feminin')||name.includes('women'))return '#F472B6';if(name.includes('champions league')||name.includes('ligue des champions'))return '#60A5FA';if(name.includes('nations'))return '#F5B800';return '#FB923C';};
 const Probability=({label,value,active=false}:{label:string;value?:number;active?:boolean})=><View style={[s.probCell,active&&s.probCellActive]}><Text style={[s.probLabel,active&&s.probLabelActive]}>{label}</Text><Text style={[s.probValue,active&&s.probValueActive]}>{pct(value)}</Text></View>;
 const winningOutcome=(m:Match)=>{if(m.p1==null||m.pN==null||m.p2==null)return null;const [p1,pN,p2]=effective1x2(m),best=Math.max(p1,pN,p2);return { '1':p1===best,'N':pN===best,'2':p2===best };};
 const MatchCard=({match}:{match:Match})=><Pressable style={s.card} onPress={()=>setSelected(match)}>
  <View style={s.meta}><Text style={[s.league,{color:competitionAccent(match.lg||'Compétition')}]}>{match.lg||'Compétition'}</Text><Text style={s.date}>{dateLabel(match.d,match.h)}</Text></View>
  <View style={s.teams}><View style={s.teamSide}>{!!match.hc&&<Image source={{uri:match.hc}} style={s.crest}/>}<Text style={s.team}>{match.home||'Domicile'}</Text></View><Text style={s.vs}>{match.r?match.r[0]+'-'+match.r[1]:'VS'}</Text><View style={s.teamSide}>{!!match.ac&&<Image source={{uri:match.ac}} style={s.crest}/>}<Text style={s.team}>{match.away||'Extérieur'}</Text></View></View>
  <View style={s.probs}><Probability label="1" value={effective1x2(match)[0]} active={!!winningOutcome(match)?.['1']}/><Probability label="N" value={effective1x2(match)[1]} active={!!winningOutcome(match)?.N}/><Probability label="2" value={effective1x2(match)[2]} active={!!winningOutcome(match)?.['2']}/></View>
  <View style={s.footerRow}><Text style={s.pick}>PRONO : {displayedPrediction(match)}</Text>{!!match.r&&<Text style={{color:predictionCorrect(match)===true?palette.accent:predictionCorrect(match)===false?'#FF6B8A':palette.muted,fontSize:10,fontWeight:"900"}}>{predictionCorrect(match)===null?'NON ÉVALUÉ':predictionCorrect(match)?'✓ PRONO CORRECT':'✕ PRONO FAUX'}</Text>}<Text style={s.link}> · Détails →</Text></View>
 </Pressable>;
 const StatBox=({label,value}:{label:string;value:string|number})=><View style={s.statBox}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
 return <SafeAreaView style={s.safe}><StatusBar barStyle={palette.statusBar}/><View style={s.container}>
  <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={palette.accent}/>}>
   <View style={s.header}><View><Text style={s.logo}>PRONO<Text style={s.green}>KIKZ</Text></Text><Text style={s.subtitle}>SPORTS INTELLIGENCE</Text></View><View style={s.headerActions}><View style={[s.status,!apiOnline&&s.offline]}><View style={[s.dot,!apiOnline&&s.offlineDot]}/><Text style={[s.statusText,!apiOnline&&s.offlineText]}>{apiOnline?'API EN LIGNE':'API HORS LIGNE'}</Text></View><Pressable accessibilityLabel="Apparence" style={s.themeButton} onPress={()=>setTab('Apparence')}><Text style={s.themeButtonText}>⚙</Text></Pressable></View></View>
   {selected?<View><Pressable onPress={()=>setSelected(null)}><Text style={s.back}>← Retour</Text></Pressable><Text style={s.title}>Analyse du match</Text><View style={s.card}><Text style={s.league}>{selected.lg}</Text><Text style={s.detailTeams}>{selected.home} <Text style={s.green}>VS</Text> {selected.away}</Text><Text style={s.date}>{dateLabel(selected.d,selected.h)}</Text>{!!selected.r&&<Text style={s.result}>Résultat : {selected.r[0]} - {selected.r[1]}</Text>}<Text style={s.sectionTitle}>Probabilités 1N2</Text><View style={s.probs}><Probability label="1" value={effective1x2(selected)[0]} active={!!winningOutcome(selected)?.['1']}/><Probability label="N" value={effective1x2(selected)[1]} active={!!winningOutcome(selected)?.N}/><Probability label="2" value={effective1x2(selected)[2]} active={!!winningOutcome(selected)?.['2']}/></View><Text style={s.sectionTitle}>Autres indicateurs</Text><Text style={s.info}>Les deux équipes marquent : {pct(selected.btts)}</Text><Text style={s.info}>Plus de 2,5 buts : {pct(selected.o25)}</Text>{!!selected.ia&&<Text style={s.info}>{selected.ia}</Text>}{!!selected.bt&&<Text style={s.info}>Buteur suggéré : {selected.bt}</Text>}{!!selected.ex&&<Text style={s.info}>Avis : {selected.ex}</Text>}{!!selected.fin&&<Text style={s.info}>Sélection : {formatSelection(selected.fin)}</Text>}<Text style={s.disclaimer}>Ces probabilités sont des estimations statistiques, pas des garanties de résultat.</Text></View></View>:<>
    <View style={s.hero}><Text style={s.tag}>TON ASSISTANT SPORTIF</Text><Text style={s.heroTitle}>Prédire mieux.{'\n'}<Text style={s.green}>Comprendre plus.</Text></Text><Text style={s.heroDesc}>Matchs, probabilités et analyses réunis au même endroit.</Text></View>
    {tab==='Accueil'&&<><View style={s.statsRow}><StatBox label="À venir" value={stats?.upcoming??upcoming.length}/><StatBox label="Terminés" value={stats?.finished??finished.length}/><StatBox label="Précision" value={stats?.accuracy==null?'—':stats.accuracy+'%'}/></View><View style={s.sectionHeader}><Text style={s.sectionTitle}>Prochains matchs</Text><Text style={s.counter}>{upcoming.length} MATCHS</Text></View>{loading?<ActivityIndicator color={palette.accent} size="large"/>:error?<Text style={s.error}>{error}</Text>:upcoming.length?upcoming.slice(0,4).map(m=><MatchCard key={String(m.id)} match={m}/>):<Text style={s.info}>Aucun match disponible pour le moment.</Text>}<Pressable style={s.button} onPress={()=>setTab('Matchs')}><Text style={s.buttonText}>Voir tous les matchs →</Text></Pressable></>}
    {tab==='Apparence'&&<><Text style={s.title}>Apparence</Text><Text style={s.heroDesc}>Choisis les couleurs de Pronokikz. Le changement s'applique immédiatement.</Text>{THEME_OPTIONS.map(option=><Pressable key={option.id} disabled={!themeLoaded} onPress={()=>changeTheme(option.id)} style={[s.card,s.themeOption,themeName===option.id&&s.themeOptionActive]}><View style={s.themeOptionLeft}><Text style={s.themeIcon}>{option.icon}</Text><View style={{flex:1}}><Text style={s.comboTitle}>{option.label}</Text><Text style={s.info}>{option.hint}</Text></View></View><Text style={s.themeCheck}>{themeName===option.id?'✓':'○'}</Text></Pressable>)}</>}
    {tab==='Matchs'&&<><Text style={s.title}>Tous les matchs</Text><Text style={s.heroDesc}>Rencontres à venir et analyses disponibles.</Text>{!loading&&!error&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{leagueOptions.map(name=><Pressable key={name} onPress={()=>setLeagueFilter(name)} style={[s.filterChip,leagueFilter===name&&s.filterChipActive]}><Text style={[s.filterText,leagueFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView>}{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:visible.map(m=><MatchCard key={String(m.id)} match={m}/>)}{!loading&&!error&&!visible.length&&<Text style={s.info}>{leagueFilter==='Toutes'?'Aucun match à venir pour le moment.':'Aucune rencontre à venir pour cette compétition. Les prochains matchs apparaîtront automatiquement dès leur publication.'}</Text>}</>}
    {tab==='Mon conseil'&&<><Text style={s.title}>Mon conseil</Text>{competitionCombos.map(group=><View key={group.groupId} style={{marginTop:8}}><ComboCard title="SAFE" combo={group.safe} accent={palette.accent} groupId={group.groupId} tier="safe"/><ComboCard title="ÉQUILIBRÉ · COTE 6/7" combo={group.medium} accent={palette.accent} groupId={group.groupId} tier="medium"/><ComboCard title="FUN" combo={group.high} accent={palette.accent} groupId={group.groupId} tier="high"/></View>)}{!competitionCombos.length&&<Text style={s.info}>Aucun match à venir pour le moment.</Text>}</>}
    {tab==='Résultats'&&<><Text style={s.title}>Résultats & historique</Text><View style={s.statsRow}><StatBox label="Matchs évalués" value={stats?.evaluated??0}/><StatBox label="Bons pronos" value={stats?.correct??0}/><StatBox label="Réussite" value={stats?.accuracy==null?'—':stats.accuracy+'%'}/></View><Text style={s.sectionTitle}>Filtrer les résultats</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{(['Tous','Gagnés','Perdus'] as const).map(name=><Pressable key={name} onPress={()=>setResultFilter(name)} style={[s.filterChip,resultFilter===name&&s.filterChipActive]}><Text style={[s.filterText,resultFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{['Toutes',...Array.from(new Set(finished.map(m=>m.lg).filter((x):x is string=>!!x))).sort((a,b)=>a.localeCompare(b,'fr'))].map(name=><Pressable key={name} onPress={()=>setResultLeagueFilter(name)} style={[s.filterChip,resultLeagueFilter===name&&s.filterChipActive]}><Text style={[s.filterText,resultLeagueFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView>{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:resultGroups.map(([date,dayMatches])=><View key={date}><View style={s.sectionHeader}><Text style={s.sectionTitle}>{date==='Date inconnue'?date:new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</Text><Text style={s.counter}>{dayMatches.length} MATCH{dayMatches.length>1?'S':''}</Text></View>{dayMatches.map(m=><MatchCard key={String(m.id)} match={m}/>)}</View>)}{!loading&&!error&&!visibleResults.length&&<Text style={s.info}>{finished.length?'Aucun résultat ne correspond à ces filtres.':'Les résultats apparaîtront après la mise à jour des données.'}</Text>}</>}
    {tab==='Stats'&&<><Text style={s.title}>Statistiques Pronokikz</Text><View style={s.statsRow}><StatBox label="Matchs" value={stats?.total??matches.length}/><StatBox label="Évalués" value={stats?.evaluated??0}/><StatBox label="Bons pronos" value={stats?.correct??0}/></View><View style={s.card}><Text style={s.sectionTitle}>Précision 1N2 globale</Text><Text style={s.bigNumber}>{stats?.accuracy==null?'—':stats.accuracy+'%'}</Text><Text style={s.info}>Calculée sur les matchs terminés disposant d'un pronostic et d'un score final.</Text></View><Text style={s.sectionTitle}>Performance par compétition</Text>{leagueStats.length?leagueStats.map(([name,g])=><View key={name} style={s.card}><View style={s.footerRow}><Text style={s.comboTitle}>{name}</Text><Text style={s.comboProb}>{g.evaluated?Math.round(g.correct/g.evaluated*100)+'%':'—'}</Text></View><Text style={s.info}>{g.correct} bons pronostics sur {g.evaluated} matchs évalués</Text></View>):<Text style={s.info}>Les statistiques par compétition apparaîtront dès que les premiers matchs seront terminés et évalués.</Text>}</>}
   </>}
   {!!updatedAt&&<Text style={s.updated}>Données mises à jour : {new Date(updatedAt).toLocaleString('fr-FR')}</Text>}<Text style={s.bottom}>PRONOKIKZ • VERSION 1.0</Text>
  </ScrollView>
  <View style={s.nav}>{['Accueil','Matchs','Mon conseil','Résultats','Stats'].map(item=><Pressable key={item} onPress={()=>{setSelected(null);setTab(item);}} style={s.navItem}><Text style={[s.navIcon,tab===item&&s.navActive]}>{item==='Accueil'?'⌂':item==='Matchs'?'⚽':item==='Résultats'?'◷':item==='Mon conseil'?'✦':'▥'}</Text><Text style={[s.navLabel,tab===item&&s.navActive]}>{item}</Text></Pressable>)}</View>
 </View></SafeAreaView>;
}
const createStyles=(theme:ThemePalette)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:theme.bg},comboTitle:{color:theme.text,fontSize:15,fontWeight:'900'},rerollButton:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.accent,padding:11,borderRadius:10,alignItems:'center',marginTop:13},rerollText:{color:theme.accent,fontWeight:'900',fontSize:12},comboOdds:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',marginTop:12,marginBottom:10,backgroundColor:theme.surface,padding:12,borderRadius:10},comboOddsLabel:{color:theme.muted,fontSize:9,fontWeight:'800'},comboOddsValue:{color:theme.accent,fontSize:26,fontWeight:'900'},comboPick:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:theme.border,gap:8},comboMatch:{color:theme.text,fontSize:12,fontWeight:'800'},comboDate:{color:theme.muted,fontSize:11,fontWeight:'700',marginTop:4},comboMarket:{color:theme.muted,fontSize:11,marginTop:4},comboProb:{color:theme.accent,fontSize:13,fontWeight:'900'},container:{flex:1,backgroundColor:theme.bg},content:{padding:18,paddingBottom:28},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:30},headerActions:{flexDirection:'row',alignItems:'center'},themeButton:{width:38,height:38,borderRadius:12,marginLeft:8,alignItems:'center',justifyContent:'center',backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},themeButtonText:{color:theme.accent,fontSize:19,fontWeight:'900'},themeOption:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},themeOptionActive:{borderColor:theme.accent,borderWidth:2},themeOptionLeft:{flexDirection:'row',alignItems:'center',flex:1,gap:12},themeIcon:{fontSize:24,width:32,textAlign:'center'},themeCheck:{color:theme.accent,fontSize:22,fontWeight:'900',marginLeft:12},logo:{color:theme.text,fontSize:25,fontWeight:'900',letterSpacing:1},subtitle:{color:theme.muted,fontSize:9,letterSpacing:2,marginTop:4},green:{color:theme.accent},status:{flexDirection:'row',alignItems:'center',backgroundColor:theme.surface,paddingHorizontal:10,paddingVertical:8,borderRadius:20},offline:{backgroundColor:'#321B20'},dot:{width:7,height:7,borderRadius:4,backgroundColor:theme.accent,marginRight:7},offlineDot:{backgroundColor:'#FF647C'},statusText:{color:theme.accent,fontWeight:'800',fontSize:9},offlineText:{color:'#FF8496'},hero:{marginBottom:25},tag:{color:theme.accent,fontSize:10,fontWeight:'800',letterSpacing:2,marginBottom:12},heroTitle:{color:theme.text,fontSize:30,fontWeight:'900',lineHeight:38},heroDesc:{color:theme.muted,fontSize:13,lineHeight:21,marginTop:10,marginBottom:18},statsRow:{flexDirection:'row',gap:9,marginBottom:25},statBox:{flex:1,backgroundColor:theme.card,borderRadius:13,padding:13,borderWidth:1,borderColor:theme.border},statValue:{color:theme.accent,fontSize:21,fontWeight:'900'},statLabel:{color:theme.muted,fontSize:11,marginTop:5},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:13},sectionTitle:{color:theme.text,fontSize:16,fontWeight:'800',marginTop:18,marginBottom:12},counter:{color:theme.accent,fontSize:10,fontWeight:'800'},card:{backgroundColor:theme.card,borderRadius:16,padding:15,borderWidth:1,borderColor:theme.border,marginBottom:12},meta:{flexDirection:'row',justifyContent:'space-between',gap:8,marginBottom:16},league:{color:theme.accent,fontSize:11,fontWeight:'800'},date:{color:theme.muted,fontSize:11},teams:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},teamSide:{flex:1,alignItems:'center',gap:6},team:{color:theme.text,fontWeight:'700',fontSize:12,textAlign:'center'},crest:{width:28,height:28,resizeMode:'contain'},vs:{color:theme.muted,fontSize:11,fontWeight:'900'},probs:{flexDirection:'row',gap:8,marginTop:18},probCell:{flex:1,alignItems:'center',backgroundColor:theme.surface,padding:10,borderRadius:9,borderWidth:1,borderColor:theme.border},probCellActive:{backgroundColor:theme.activeSurface,borderColor:theme.accent},probLabel:{color:theme.muted,fontSize:11},probLabelActive:{color:theme.accent,fontWeight:'900'},probValue:{color:theme.text,fontSize:17,fontWeight:'900',marginTop:4},probValueActive:{color:theme.accent},footerRow:{flexDirection:'row',justifyContent:'space-between',marginTop:14},pick:{color:theme.text,fontSize:10,fontWeight:'800',flex:1},link:{color:theme.accent,fontSize:10,fontWeight:'800'},title:{color:theme.text,fontSize:22,fontWeight:'900',marginBottom:10},detailTeams:{color:theme.text,fontSize:20,fontWeight:'900',marginTop:12},back:{color:theme.accent,fontWeight:'800',marginBottom:18},result:{color:theme.accent,fontWeight:'800',marginTop:12},info:{color:theme.muted,fontSize:13,lineHeight:21,marginTop:8},disclaimer:{color:theme.muted,fontSize:11,lineHeight:16,marginTop:18,fontStyle:'italic'},statsRowDummy:{},bigNumber:{color:theme.accent,fontSize:38,fontWeight:'900'},button:{backgroundColor:theme.accent,padding:15,borderRadius:12,alignItems:'center',marginTop:15},buttonText:{color:theme.buttonText,fontWeight:'900'},filters:{marginBottom:14,maxHeight:42},filtersContent:{gap:8,alignItems:'center'},filterChip:{borderWidth:1,borderColor:theme.border,backgroundColor:theme.card,paddingHorizontal:12,paddingVertical:9,borderRadius:18},filterChipActive:{backgroundColor:theme.activeSurface,borderColor:theme.accent},filterText:{color:theme.muted,fontSize:11,fontWeight:'700'},filterTextActive:{color:theme.accent},error:{color:'#FF8496',fontSize:12,marginVertical:12},updated:{color:theme.muted,fontSize:9,textAlign:'center',marginTop:18},bottom:{color:theme.muted,fontSize:9,textAlign:'center',marginTop:22,marginBottom:12},nav:{flexDirection:'row',justifyContent:'space-around',paddingTop:12,paddingBottom:48,backgroundColor:theme.nav,borderTopWidth:1,borderTopColor:theme.border},navItem:{alignItems:'center',gap:4,flex:1},navIcon:{fontSize:18,color:theme.muted},navLabel:{fontSize:9,color:theme.muted},navActive:{color:theme.accent,fontWeight:'900'}
});
