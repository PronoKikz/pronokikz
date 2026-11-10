import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

type ThemeName = 'dark' | 'light' | 'pink' | 'football' | 'system';
type ThemePalette = { bg:string; card:string; muted:string; accent:string; text:string; border:string; surface:string; nav:string; activeSurface:string; buttonText:string; statusBar:'light-content'|'dark-content' };
const THEMES: Record<Exclude<ThemeName,'system'>,ThemePalette> = {
 dark:{bg:'#0A1117',card:'#182630',muted:'#B0BEC9',accent:'#4DA3FF',text:'#FFFFFF',border:'#30414D',surface:'#14212B',nav:'#111D26',activeSurface:'#152D46',buttonText:'#06110D',statusBar:'light-content'},
 light:{bg:'#F3F6FA',card:'#FFFFFF',muted:'#64748B',accent:'#2563EB',text:'#17212B',border:'#D8E0E8',surface:'#E9EFF5',nav:'#E7EDF4',activeSurface:'#DBEAFE',buttonText:'#FFFFFF',statusBar:'dark-content'},
 pink:{bg:'#FFF6FA',card:'#FFFFFF',muted:'#946D80',accent:'#D85B9A',text:'#4A2638',border:'#F0C8DC',surface:'#FCEAF2',nav:'#FBEAF2',activeSurface:'#F8D8E8',buttonText:'#FFFFFF',statusBar:'dark-content'},
 football:{bg:'#071B12',card:'#10291D',muted:'#B0CDB9',accent:'#65D68A',text:'#F1FFF5',border:'#28523A',surface:'#153624',nav:'#0C2117',activeSurface:'#19452C',buttonText:'#052010',statusBar:'light-content'}
};
const THEME_OPTIONS: {id:ThemeName;label:string;icon:string;hint:string}[] = [
 {id:'dark',label:'Sombre',icon:'🌙',hint:'Le style sombre actuel.'},
 {id:'light',label:'Clair',icon:'☀️',hint:'Une interface lumineuse et épurée.'},
 {id:'pink',label:'Rose / lavande',icon:'💗',hint:'Des tons doux rose et lavande.'},
 {id:'football',label:'Football',icon:'⚽',hint:'Vert pelouse et ambiance stade.'},
 {id:'system',label:'Automatique',icon:'📱',hint:'Suit le thème de ton téléphone.'}
];
const THEME_FILE = FileSystem.documentDirectory ? FileSystem.documentDirectory + 'pronokikz-theme.json' : null;
// Les données sont publiées automatiquement sur GitHub : aucun serveur sur le PC n'est nécessaire.
const DATA_URL = 'https://raw.githubusercontent.com/PronoKikz/pronokikz/main/data.json';

type Match = { id: string | number; lg?: string; home?: string; away?: string; d?: string; h?: string; hc?: string; ac?: string; p1?: number; pN?: number; p2?: number; btts?: number; o25?: number; r?: number[] | null; ia?: string; bt?: string; ex?: string; fin?: string };
type Stats = { total: number; upcoming: number; finished: number; evaluated: number; correct: number; accuracy: number | null };
const pct = (n?: number) => n == null ? '—' : Math.round(n * 100) + '%';
const dateLabel = (d?: string, h?: string) => { if (!d) return 'Date à confirmer'; const x = new Date(d + 'T' + (h || '12:00') + ':00'); return Number.isNaN(x.getTime()) ? d : x.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const prediction = (m: Match) => { if (m.r?.length === 2) return m.r[0] + ' - ' + m.r[1]; if (m.p1 == null || m.pN == null || m.p2 == null) return 'Analyse indisponible'; const best = Math.max(m.p1, m.pN, m.p2); return best === m.p1 ? '1 — domicile' : best === m.pN ? 'N — nul' : '2 — extérieur'; };
const formatSelection = (value?: string) => value ? value.replace(/^(1N|N2|12)$/, x => x.split('').join('/')) : '';
type ComboPick = { id: string; match: string; league: string; kickoff: string; market: string; probability: number; odds: number };
type Combo = { picks: ComboPick[]; odds: number };
const buildCombo = (matches: Match[], min: number, max: number, seed: number): Combo | null => {
 const byMatch: ComboPick[][] = [];
 matches.forEach(m => {
  const markets: [string, number][] = [];
  if (m.p1 != null) markets.push(['Victoire domicile (1)',m.p1]);
  if (m.pN != null) markets.push(['Match nul (N)',m.pN]);
  if (m.p2 != null) markets.push(['Victoire extérieur (2)',m.p2]);
  if (m.p1 != null && m.pN != null) markets.push(['1 ou N',m.p1+m.pN]);
  if (m.pN != null && m.p2 != null) markets.push(['N ou 2',m.pN+m.p2]);
  if (m.p1 != null && m.p2 != null) markets.push(['1 ou 2 (pas de nul)',m.p1+m.p2]);
  if (m.btts != null) {
   markets.push(['Les deux équipes marquent : OUI',m.btts]);
   markets.push(['Les deux équipes marquent : NON',1-m.btts]);
  }
  if (m.o25 != null) {
   markets.push(['Plus de 2,5 buts',m.o25]);
   markets.push(['Moins de 2,5 buts',1-m.o25]);
  }
  const picks = markets
   .filter(([market,p]) => Number.isFinite(p) && p >= .35 && p <= .94)
   .map(([market,probability]) => ({
    id:String(m.id),match:(m.home||'?')+' – '+(m.away||'?'),league:m.lg||'Compétition',kickoff:dateLabel(m.d,m.h),
    market,probability,odds:1/probability
   }));
  if (picks.length) byMatch.push(picks);
 });
 if (byMatch.length < 2) return null;
 let best: Combo | null = null;
 let state = ((seed+1) * 2654435761) >>> 0;
 const rand = () => { state = (Math.imul(state,1664525)+1013904223) >>> 0; return state/4294967296; };
 for (let attempt=0; attempt<2400; attempt++) {
  const order = [...byMatch].map(group=>({group,key:rand()})).sort((a,b)=>a.key-b.key);
  const picks: ComboPick[]=[]; let total=1;
  for (const entry of order) {
   const options=[...entry.group].sort((a,b)=>a.probability-b.probability);
   // Favorise les marchés les plus probables, tout en variant les choix au reroll.
   const top=options.slice(-Math.min(4,options.length));
   const pick=top[Math.floor(rand()*top.length)];
   if (total*pick.odds > max) continue;
   picks.push(pick); total*=pick.odds;
   if (total >= min && total <= max) {
    const distance=Math.abs(total-(min+max)/2);
    if (!best || distance<Math.abs(best.odds-(min+max)/2)) best={picks:[...picks],odds:total};
    break;
   }
  }
  if (best && Math.abs(best.odds-(min+max)/2)<.05) break;
 }
 return best;
};


export default function App() {
 const [themeName,setThemeName]=useState<ThemeName>('dark');
 const systemScheme=useColorScheme();
 const palette=useMemo(()=>themeName==='system'?(systemScheme==='light'?THEMES.light:THEMES.dark):THEMES[themeName],[themeName,systemScheme]);
 const s=useMemo(()=>createStyles(palette),[palette]);
 const changeTheme=(next:ThemeName)=>{
  setThemeName(next);
  if(THEME_FILE)FileSystem.writeAsStringAsync(THEME_FILE,JSON.stringify(next)).catch(()=>{});
 };
 useEffect(()=>{
  if(!THEME_FILE)return;
  FileSystem.readAsStringAsync(THEME_FILE).then(raw=>{
   const saved=JSON.parse(raw);
   if(['dark','light','pink','football','system'].includes(saved))setThemeName(saved);
  }).catch(()=>{});
 },[]);
 const [tab,setTab]=useState('Accueil'),[matches,setMatches]=useState<Match[]>([]),[stats,setStats]=useState<Stats|null>(null),[selected,setSelected]=useState<Match|null>(null),[leagueFilter,setLeagueFilter]=useState('Toutes');
 const [leagueSeeds,setLeagueSeeds]=useState<Record<string,{safe:number;medium:number;high:number}>>({});
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState<string|null>(null),[apiOnline,setApiOnline]=useState(false);
 const load=useCallback(async()=>{try{setError('');const response=await fetch(DATA_URL+'?t='+Date.now());if(!response.ok)throw new Error('Données indisponibles ('+response.status+').');const data=await response.json();const list=Array.isArray(data.matches)?data.matches:[];setMatches(list);setUpdatedAt(data.updatedAt||null);const finished=list.filter((m:Match)=>Array.isArray(m.r)&&m.r.length===2);const upcoming=list.filter((m:Match)=>!Array.isArray(m.r)||m.r.length!==2);let correct=0,evaluated=0;for(const m of finished){if(m.p1==null||m.pN==null||m.p2==null)continue;const predicted=m.p1>=m.pN&&m.p1>=m.p2?'1':m.pN>=m.p1&&m.pN>=m.p2?'N':'2';const actual=m.r![0]>m.r![1]?'1':m.r![0]===m.r![1]?'N':'2';evaluated++;if(predicted===actual)correct++;}setStats({total:list.length,upcoming:upcoming.length,finished:finished.length,evaluated,correct,accuracy:evaluated?Math.round(correct/evaluated*100):null});setApiOnline(true);}catch(e:any){setApiOnline(false);setError(e?.message||'Impossible de charger les données Pronokikz.');}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{load();},[load]);
 const upcoming=useMemo(()=>matches.filter(m=>{if(m.r||!m.d||!m.h)return false;const kickoff=new Date(m.d+'T'+m.h+':00');return !Number.isNaN(kickoff.getTime())&&kickoff.getTime()>Date.now();}).sort((a,b)=>(a.d||'').concat(a.h||'').localeCompare((b.d||'').concat(b.h||''))),[matches]);
 const finished=useMemo(()=>matches.filter(m=>!!m.r),[matches]);
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
  const groups:Record<string,Match[]>={};
  upcoming.forEach(m=>{
   const league=(m.lg||'Compétition non classée').trim();
   (groups[league]||(groups[league]=[])).push(m);
  });
  return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],'fr')).map(([league,leagueMatches])=>({
   league,
   safe:buildCombo(leagueMatches,2,4,(leagueSeeds[league]?.safe??0)+11),
   medium:buildCombo(leagueMatches,6,8,(leagueSeeds[league]?.medium??0)+29),
   high:buildCombo(leagueMatches,35,45,(leagueSeeds[league]?.high??0)+47)
  }));
 },[upcoming,leagueSeeds]);
 const rerollLeagueCombo=(league:string,tier:'safe'|'medium'|'high')=>{
  setLeagueSeeds(current=>({...current,[league]:{
   safe:current[league]?.safe??0,
   medium:current[league]?.medium??0,
   high:current[league]?.high??0,
   [tier]:(current[league]?.[tier]??0)+1
  }}));
 };
 const ComboCard=({title,subtitle,combo,onReroll,accent}:{title:string;subtitle:string;combo:Combo|null;onReroll:()=>void;accent:string})=><View style={[s.card,{borderColor:accent,borderLeftWidth:4}]}>
  <Text style={s.comboTitle}>{title}</Text><Text style={s.info}>{subtitle}</Text>
  {combo?<><View style={s.comboOdds}><Text style={s.comboOddsLabel}>COTE ESTIMÉE</Text><Text style={s.comboOddsValue}> {combo.odds.toFixed(2).replace('.',',')}</Text><Text style={s.comboOddsLabel}>{combo.picks.length} sélections</Text></View>
   {combo.picks.map((p,i)=><View key={p.id} style={s.comboPick}><View style={{flex:1}}><Text style={s.comboMatch}>{p.match}</Text><Text style={s.comboDate}>📅 {p.kickoff}</Text><Text style={s.comboMarket}>{p.market} · {p.league}</Text></View><View style={{alignItems:'flex-end'}}><Text style={s.comboProb}>{Math.round(p.probability*100)} %</Text><Text style={s.comboMarket}>Cote estimée {p.odds.toFixed(2)}</Text></View></View>)}
  </>:<Text style={s.info}>Pas assez de matchs ou de probabilités disponibles pour construire ce combiné.</Text>}
  <Pressable style={s.rerollButton} onPress={onReroll}><Text style={s.rerollText}>↻ Relancer ce combiné</Text></Pressable>
 </View>;

 const competitionAccent=(league:string)=>{const name=league.toLocaleLowerCase('fr').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');if(name.includes('feminin')||name.includes('women'))return '#A78BFA';if(name.includes('champions league')||name.includes('ligue des champions'))return '#60A5FA';if(name.includes('nations'))return '#34D399';return '#FB923C';};
 const Probability=({label,value,active=false}:{label:string;value?:number;active?:boolean})=><View style={[s.probCell,active&&s.probCellActive]}><Text style={[s.probLabel,active&&s.probLabelActive]}>{label}</Text><Text style={[s.probValue,active&&s.probValueActive]}>{pct(value)}</Text></View>;
 const winningOutcome=(m:Match)=>{if(m.p1==null||m.pN==null||m.p2==null)return null;const best=Math.max(m.p1,m.pN,m.p2);return { '1':m.p1===best,'N':m.pN===best,'2':m.p2===best };};
 const MatchCard=({match}:{match:Match})=><Pressable style={s.card} onPress={()=>setSelected(match)}>
  <View style={s.meta}><Text style={s.league}>{match.lg||'Compétition'}</Text><Text style={s.date}>{dateLabel(match.d,match.h)}</Text></View>
  <View style={s.teams}><View style={s.teamSide}>{!!match.hc&&<Image source={{uri:match.hc}} style={s.crest}/>}<Text style={s.team}>{match.home||'Domicile'}</Text></View><Text style={s.vs}>{match.r?match.r[0]+'-'+match.r[1]:'VS'}</Text><View style={s.teamSide}>{!!match.ac&&<Image source={{uri:match.ac}} style={s.crest}/>}<Text style={s.team}>{match.away||'Extérieur'}</Text></View></View>
  <View style={s.probs}><Probability label="1" value={match.p1} active={!!winningOutcome(match)?.['1']}/><Probability label="N" value={match.pN} active={!!winningOutcome(match)?.N}/><Probability label="2" value={match.p2} active={!!winningOutcome(match)?.['2']}/></View>
  <View style={s.footerRow}><Text style={s.pick}>PRONO : {prediction(match)}</Text><Text style={s.link}>Détails →</Text></View>
 </Pressable>;
 const StatBox=({label,value}:{label:string;value:string|number})=><View style={s.statBox}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
 return <SafeAreaView style={s.safe}><StatusBar barStyle={palette.statusBar}/><View style={s.container}>
  <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={palette.accent}/>}>
   <View style={s.header}><View><Text style={s.logo}>PRONO<Text style={s.green}>KIKZ</Text></Text><Text style={s.subtitle}>SPORTS INTELLIGENCE</Text></View><View style={s.headerActions}><View style={[s.status,!apiOnline&&s.offline]}><View style={[s.dot,!apiOnline&&s.offlineDot]}/><Text style={[s.statusText,!apiOnline&&s.offlineText]}>{apiOnline?'API EN LIGNE':'API HORS LIGNE'}</Text></View><Pressable accessibilityLabel="Apparence" style={s.themeButton} onPress={()=>setTab('Apparence')}><Text style={s.themeButtonText}>⚙</Text></Pressable></View></View>
   {selected?<View><Pressable onPress={()=>setSelected(null)}><Text style={s.back}>← Retour</Text></Pressable><Text style={s.title}>Analyse du match</Text><View style={s.card}><Text style={s.league}>{selected.lg}</Text><Text style={s.detailTeams}>{selected.home} <Text style={s.green}>VS</Text> {selected.away}</Text><Text style={s.date}>{dateLabel(selected.d,selected.h)}</Text>{!!selected.r&&<Text style={s.result}>Résultat : {selected.r[0]} - {selected.r[1]}</Text>}<Text style={s.sectionTitle}>Probabilités 1N2</Text><View style={s.probs}><Probability label="1" value={selected.p1} active={!!winningOutcome(selected)?.['1']}/><Probability label="N" value={selected.pN} active={!!winningOutcome(selected)?.N}/><Probability label="2" value={selected.p2} active={!!winningOutcome(selected)?.['2']}/></View><Text style={s.sectionTitle}>Autres indicateurs</Text><Text style={s.info}>Les deux équipes marquent : {pct(selected.btts)}</Text><Text style={s.info}>Plus de 2,5 buts : {pct(selected.o25)}</Text>{!!selected.ia&&<Text style={s.info}>{selected.ia}</Text>}{!!selected.bt&&<Text style={s.info}>Buteur suggéré : {selected.bt}</Text>}{!!selected.ex&&<Text style={s.info}>Avis : {selected.ex}</Text>}{!!selected.fin&&<Text style={s.info}>Sélection : {formatSelection(selected.fin)}</Text>}<Text style={s.disclaimer}>Ces probabilités sont des estimations statistiques, pas des garanties de résultat.</Text></View></View>:<>
    <View style={s.hero}><Text style={s.tag}>TON ASSISTANT SPORTIF</Text><Text style={s.heroTitle}>Prédire mieux.{'\n'}<Text style={s.green}>Comprendre plus.</Text></Text><Text style={s.heroDesc}>Matchs, probabilités et analyses réunis au même endroit.</Text></View>
    {tab==='Accueil'&&<><View style={s.statsRow}><StatBox label="À venir" value={stats?.upcoming??upcoming.length}/><StatBox label="Terminés" value={stats?.finished??finished.length}/><StatBox label="Précision" value={stats?.accuracy==null?'—':stats.accuracy+'%'}/></View><View style={s.sectionHeader}><Text style={s.sectionTitle}>Prochains matchs</Text><Text style={s.counter}>{upcoming.length} MATCHS</Text></View>{loading?<ActivityIndicator color={palette.accent} size="large"/>:error?<Text style={s.error}>{error}</Text>:upcoming.length?upcoming.slice(0,4).map(m=><MatchCard key={String(m.id)} match={m}/>):<Text style={s.info}>Aucun match disponible pour le moment.</Text>}<Pressable style={s.button} onPress={()=>setTab('Matchs')}><Text style={s.buttonText}>Voir tous les matchs →</Text></Pressable></>}
    {tab==='Apparence'&&<><Text style={s.title}>Apparence</Text><Text style={s.heroDesc}>Choisis les couleurs de Pronokikz. Ton choix est conservé sur ce téléphone.</Text>{THEME_OPTIONS.map(option=><Pressable key={option.id} onPress={()=>changeTheme(option.id)} style={[s.card,s.themeOption,themeName===option.id&&s.themeOptionActive]}><View style={s.themeOptionLeft}><Text style={s.themeIcon}>{option.icon}</Text><View style={{flex:1}}><Text style={s.comboTitle}>{option.label}</Text><Text style={s.info}>{option.hint}</Text></View></View><Text style={s.themeCheck}>{themeName===option.id?'✓':'○'}</Text></Pressable>)}</>}
    {tab==='Matchs'&&<><Text style={s.title}>Tous les matchs</Text><Text style={s.heroDesc}>Rencontres à venir et analyses disponibles.</Text>{!loading&&!error&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{leagueOptions.map(name=><Pressable key={name} onPress={()=>setLeagueFilter(name)} style={[s.filterChip,leagueFilter===name&&s.filterChipActive]}><Text style={[s.filterText,leagueFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView>}{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:visible.map(m=><MatchCard key={String(m.id)} match={m}/>)}{!loading&&!error&&!visible.length&&<Text style={s.info}>{leagueFilter==='Toutes'?'Aucun match à venir pour le moment.':'Aucune rencontre à venir pour cette compétition. Les prochains matchs apparaîtront automatiquement dès leur publication.'}</Text>}</>}
    {tab==='Mon conseil'&&<><Text style={s.title}>Mon conseil</Text><Text style={s.heroDesc}>Les combinés sont séparés par compétition : aucune sélection ne mélange deux tournois différents.</Text>{competitionCombos.map(group=>{const accent=competitionAccent(group.league);return <View key={group.league} style={{marginTop:18}}><Text style={[s.sectionTitle,{color:accent}]}>{group.league}</Text><ComboCard title="SAFE · COTE 2 À 4" subtitle="Sélections de cette compétition uniquement." combo={group.safe} onReroll={()=>rerollLeagueCombo(group.league,'safe')}/><ComboCard title="OBJECTIF · COTE 6/7" subtitle="Sélections de cette compétition uniquement." combo={group.medium} onReroll={()=>rerollLeagueCombo(group.league,'medium')}/><ComboCard title="GROSSE COTE · 40" subtitle="Sélections de cette compétition uniquement." combo={group.high} onReroll={()=>rerollLeagueCombo(group.league,'high')}/></View>})}{!competitionCombos.length&&<Text style={s.info}>Aucun match à venir avec des probabilités exploitables.</Text>}<Text style={s.disclaimer}>Important : les cotes affichées sont théoriques, calculées comme l'inverse des probabilités du modèle. Ce ne sont pas les cotes d'un bookmaker. Aucun combiné n'est garanti. Chaque combiné reste limité à une seule compétition.</Text></>}
    {tab==='Résultats'&&<><Text style={s.title}>Résultats & historique</Text>{loading?<ActivityIndicator color={palette.accent}/>:error?<Text style={s.error}>{error}</Text>:finished.map(m=><MatchCard key={String(m.id)} match={m}/>)}{!finished.length&&<Text style={s.info}>Les résultats apparaîtront après la mise à jour des données.</Text>}</>}
    {tab==='Stats'&&<><Text style={s.title}>Statistiques Pronokikz</Text><View style={s.statsRow}><StatBox label="Matchs" value={stats?.total??matches.length}/><StatBox label="Évalués" value={stats?.evaluated??0}/><StatBox label="Bons pronos" value={stats?.correct??0}/></View><View style={s.card}><Text style={s.sectionTitle}>Précision 1N2 globale</Text><Text style={s.bigNumber}>{stats?.accuracy==null?'—':stats.accuracy+'%'}</Text><Text style={s.info}>Calculée sur les matchs terminés disposant d'un pronostic et d'un score final.</Text></View><Text style={s.sectionTitle}>Performance par compétition</Text>{leagueStats.length?leagueStats.map(([name,g])=><View key={name} style={s.card}><View style={s.footerRow}><Text style={s.comboTitle}>{name}</Text><Text style={s.comboProb}>{g.evaluated?Math.round(g.correct/g.evaluated*100)+'%':'—'}</Text></View><Text style={s.info}>{g.correct} bons pronostics sur {g.evaluated} matchs évalués</Text></View>):<Text style={s.info}>Les statistiques par compétition apparaîtront dès que les premiers matchs seront terminés et évalués.</Text>}</>}
   </>}
   {!!updatedAt&&<Text style={s.updated}>Données mises à jour : {new Date(updatedAt).toLocaleString('fr-FR')}</Text>}<Text style={s.bottom}>PRONOKIKZ • VERSION 1.0</Text>
  </ScrollView>
  <View style={s.nav}>{['Accueil','Matchs','Mon conseil','Résultats','Stats'].map(item=><Pressable key={item} onPress={()=>{setSelected(null);setTab(item);}} style={s.navItem}><Text style={[s.navIcon,tab===item&&s.navActive]}>{item==='Accueil'?'⌂':item==='Matchs'?'⚽':item==='Résultats'?'◷':item==='Mon conseil'?'✦':'▥'}</Text><Text style={[s.navLabel,tab===item&&s.navActive]}>{item}</Text></Pressable>)}</View>
 </View></SafeAreaView>;
}
const createStyles=(theme:ThemePalette)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:theme.bg},comboTitle:{color:theme.text,fontSize:15,fontWeight:'900'},rerollButton:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.accent,padding:11,borderRadius:10,alignItems:'center',marginTop:13},rerollText:{color:theme.accent,fontWeight:'900',fontSize:12},comboOdds:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',marginTop:12,marginBottom:10,backgroundColor:theme.surface,padding:12,borderRadius:10},comboOddsLabel:{color:theme.muted,fontSize:9,fontWeight:'800'},comboOddsValue:{color:theme.accent,fontSize:26,fontWeight:'900'},comboPick:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:theme.border,gap:8},comboMatch:{color:theme.text,fontSize:12,fontWeight:'800'},comboDate:{color:'#D6E0E8',fontSize:11,fontWeight:'700',marginTop:4},comboMarket:{color:theme.muted,fontSize:11,marginTop:4},comboProb:{color:theme.accent,fontSize:13,fontWeight:'900'},container:{flex:1,backgroundColor:theme.bg},content:{padding:18,paddingBottom:28},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:30},headerActions:{flexDirection:'row',alignItems:'center'},themeButton:{width:38,height:38,borderRadius:12,marginLeft:8,alignItems:'center',justifyContent:'center',backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},themeButtonText:{color:theme.accent,fontSize:19,fontWeight:'900'},themeOption:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},themeOptionActive:{borderColor:theme.accent,borderWidth:2},themeOptionLeft:{flexDirection:'row',alignItems:'center',flex:1,gap:12},themeIcon:{fontSize:24,width:32,textAlign:'center'},themeCheck:{color:theme.accent,fontSize:22,fontWeight:'900',marginLeft:12},logo:{color:theme.text,fontSize:25,fontWeight:'900',letterSpacing:1},subtitle:{color:theme.muted,fontSize:9,letterSpacing:2,marginTop:4},green:{color:theme.accent},status:{flexDirection:'row',alignItems:'center',backgroundColor:theme.surface,paddingHorizontal:10,paddingVertical:8,borderRadius:20},offline:{backgroundColor:'#321B20'},dot:{width:7,height:7,borderRadius:4,backgroundColor:theme.accent,marginRight:7},offlineDot:{backgroundColor:'#FF647C'},statusText:{color:theme.accent,fontWeight:'800',fontSize:9},offlineText:{color:'#FF8496'},hero:{marginBottom:25},tag:{color:theme.accent,fontSize:10,fontWeight:'800',letterSpacing:2,marginBottom:12},heroTitle:{color:theme.text,fontSize:30,fontWeight:'900',lineHeight:38},heroDesc:{color:theme.muted,fontSize:13,lineHeight:21,marginTop:10,marginBottom:18},statsRow:{flexDirection:'row',gap:9,marginBottom:25},statBox:{flex:1,backgroundColor:theme.card,borderRadius:13,padding:13,borderWidth:1,borderColor:theme.border},statValue:{color:theme.accent,fontSize:21,fontWeight:'900'},statLabel:{color:theme.muted,fontSize:11,marginTop:5},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:13},sectionTitle:{color:theme.text,fontSize:16,fontWeight:'800',marginTop:18,marginBottom:12},counter:{color:theme.accent,fontSize:10,fontWeight:'800'},card:{backgroundColor:theme.card,borderRadius:16,padding:15,borderWidth:1,borderColor:theme.border,marginBottom:12},meta:{flexDirection:'row',justifyContent:'space-between',gap:8,marginBottom:16},league:{color:theme.accent,fontSize:11,fontWeight:'800'},date:{color:theme.muted,fontSize:11},teams:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},teamSide:{flex:1,alignItems:'center',gap:6},team:{color:theme.text,fontWeight:'700',fontSize:12,textAlign:'center'},crest:{width:28,height:28,resizeMode:'contain'},vs:{color:theme.muted,fontSize:11,fontWeight:'900'},probs:{flexDirection:'row',gap:8,marginTop:18},probCell:{flex:1,alignItems:'center',backgroundColor:theme.surface,padding:10,borderRadius:9,borderWidth:1,borderColor:theme.border},probCellActive:{backgroundColor:theme.activeSurface,borderColor:theme.accent},probLabel:{color:theme.muted,fontSize:11},probLabelActive:{color:theme.accent,fontWeight:'900'},probValue:{color:theme.text,fontSize:17,fontWeight:'900',marginTop:4},probValueActive:{color:theme.accent},footerRow:{flexDirection:'row',justifyContent:'space-between',marginTop:14},pick:{color:theme.text,fontSize:10,fontWeight:'800',flex:1},link:{color:theme.accent,fontSize:10,fontWeight:'800'},title:{color:theme.text,fontSize:22,fontWeight:'900',marginBottom:10},detailTeams:{color:theme.text,fontSize:20,fontWeight:'900',marginTop:12},back:{color:theme.accent,fontWeight:'800',marginBottom:18},result:{color:theme.accent,fontWeight:'800',marginTop:12},info:{color:theme.muted,fontSize:13,lineHeight:21,marginTop:8},disclaimer:{color:theme.muted,fontSize:11,lineHeight:16,marginTop:18,fontStyle:'italic'},statsRowDummy:{},bigNumber:{color:theme.accent,fontSize:38,fontWeight:'900'},button:{backgroundColor:theme.accent,padding:15,borderRadius:12,alignItems:'center',marginTop:15},buttonText:{color:theme.buttonText,fontWeight:'900'},filters:{marginBottom:14,maxHeight:42},filtersContent:{gap:8,alignItems:'center'},filterChip:{borderWidth:1,borderColor:theme.border,backgroundColor:theme.card,paddingHorizontal:12,paddingVertical:9,borderRadius:18},filterChipActive:{backgroundColor:theme.activeSurface,borderColor:theme.accent},filterText:{color:theme.muted,fontSize:11,fontWeight:'700'},filterTextActive:{color:theme.accent},error:{color:'#FF8496',fontSize:12,marginVertical:12},updated:{color:theme.muted,fontSize:9,textAlign:'center',marginTop:18},bottom:{color:theme.muted,fontSize:9,textAlign:'center',marginTop:22,marginBottom:12},nav:{flexDirection:'row',justifyContent:'space-around',paddingTop:12,paddingBottom:48,backgroundColor:theme.nav,borderTopWidth:1,borderTopColor:theme.border},navItem:{alignItems:'center',gap:4,flex:1},navIcon:{fontSize:18,color:theme.muted},navLabel:{fontSize:9,color:theme.muted},navActive:{color:theme.accent,fontWeight:'900'}
});
