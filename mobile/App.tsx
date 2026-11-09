import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

const GREEN = '#4DA3FF', BG = '#080D12', CARD = '#121B23', MUTED = '#82909C';
// Les données sont publiées automatiquement sur GitHub : aucun serveur sur le PC n'est nécessaire.
const DATA_URL = 'https://raw.githubusercontent.com/quintrickilian10-jpg/pronokikz/main/data.json';

type Match = { id: string | number; lg?: string; home?: string; away?: string; d?: string; h?: string; hc?: string; ac?: string; p1?: number; pN?: number; p2?: number; btts?: number; o25?: number; r?: number[] | null; ia?: string; bt?: string; ex?: string; fin?: string };
type Stats = { total: number; upcoming: number; finished: number; evaluated: number; correct: number; accuracy: number | null };
const pct = (n?: number) => n == null ? '—' : Math.round(n * 100) + '%';
const dateLabel = (d?: string, h?: string) => { if (!d) return 'Date à confirmer'; const x = new Date(d + 'T' + (h || '12:00') + ':00'); return Number.isNaN(x.getTime()) ? d : x.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const prediction = (m: Match) => { if (m.r?.length === 2) return m.r[0] + ' - ' + m.r[1]; if (m.p1 == null || m.pN == null || m.p2 == null) return 'Analyse indisponible'; const best = Math.max(m.p1, m.pN, m.p2); return best === m.p1 ? '1 — domicile' : best === m.pN ? 'N — nul' : '2 — extérieur'; };
const formatSelection = (value?: string) => value ? value.replace(/^(1N|N2|12)$/, x => x.split('').join('/')) : '';
type ComboPick = { id: string; match: string; league: string; market: string; probability: number; odds: number };
type Combo = { picks: ComboPick[]; odds: number };
const buildCombo = (matches: Match[], min: number, max: number, seed: number): Combo | null => {
 const candidates: ComboPick[] = [];
 matches.forEach(m => {
  if (m.p1 == null || m.pN == null || m.p2 == null) return;
  const markets: [string, number][] = [
   ['1',m.p1],['N',m.pN],['2',m.p2],
   ['1/N',m.p1+m.pN],['N/2',m.pN+m.p2],['1/2',m.p1+m.p2],
   ...(m.o25 != null ? [['Plus de 2,5 buts',m.o25] as [string,number]] : []),
   ...(m.btts != null ? [['Les deux marquent',m.btts] as [string,number]] : [])
  ].filter(x => x[1] >= .35 && x[1] <= .94);
  if (!markets.length) return;
  const best = markets.sort((a,b)=>b[1]-a[1])[0];
  const probability = Math.min(.94, best[1]);
  candidates.push({id:String(m.id),match:(m.home||'?')+' – '+(m.away||'?'),league:m.lg||'Compétition',market:best[0],probability,odds:1/probability});
 });
 if (candidates.length < 2) return null;
 let best: Combo | null = null;
 let state = (seed+1) * 2654435761;
 const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
 for (let attempt=0; attempt<1600; attempt++) {
  const pool=[...candidates].sort(()=>rand()-.5);
  const picks: ComboPick[]=[]; let total=1;
  for (const pick of pool) {
   if (picks.length >= 20 || total*pick.odds > max) continue;
   picks.push(pick); total*=pick.odds;
   if (total >= min && total <= max) {
    if (!best || Math.abs(total-(min+max)/2)<Math.abs(best.odds-(min+max)/2)) best={picks:[...picks],odds:total};
    break;
   }
  }
  if (best && Math.abs(best.odds-(min+max)/2)<.08) break;
 }
 return best;
};


export default function App() {
 const [tab,setTab]=useState('Accueil'),[matches,setMatches]=useState<Match[]>([]),[stats,setStats]=useState<Stats|null>(null),[selected,setSelected]=useState<Match|null>(null),[leagueFilter,setLeagueFilter]=useState('Toutes');
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState<string|null>(null),[apiOnline,setApiOnline]=useState(false);
 const load=useCallback(async()=>{try{setError('');const response=await fetch(DATA_URL+'?t='+Date.now());if(!response.ok)throw new Error('Données indisponibles ('+response.status+').');const data=await response.json();const list=Array.isArray(data.matches)?data.matches:[];setMatches(list);setUpdatedAt(data.updatedAt||null);const finished=list.filter((m:Match)=>Array.isArray(m.r)&&m.r.length===2);const upcoming=list.filter((m:Match)=>!Array.isArray(m.r)||m.r.length!==2);let correct=0,evaluated=0;for(const m of finished){if(m.p1==null||m.pN==null||m.p2==null)continue;const predicted=m.p1>=m.pN&&m.p1>=m.p2?'1':m.pN>=m.p1&&m.pN>=m.p2?'N':'2';const actual=m.r![0]>m.r![1]?'1':m.r![0]===m.r![1]?'N':'2';evaluated++;if(predicted===actual)correct++;}setStats({total:list.length,upcoming:upcoming.length,finished:finished.length,evaluated,correct,accuracy:evaluated?Math.round(correct/evaluated*100):null});setApiOnline(true);}catch(e:any){setApiOnline(false);setError(e?.message||'Impossible de charger les données Pronokikz.');}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{load();},[load]);
 const upcoming=useMemo(()=>matches.filter(m=>!m.r).sort((a,b)=>(a.d||'').concat(a.h||'').localeCompare((b.d||'').concat(b.h||''))),[matches]);
 const finished=useMemo(()=>matches.filter(m=>!!m.r),[matches]);
 const leagueOptions=useMemo(()=>['Toutes',...Array.from(new Set(matches.map(m=>m.lg).filter((x):x is string=>!!x))).sort((a,b)=>a.localeCompare(b,'fr'))],[matches]); const visible=useMemo(()=>upcoming.filter(m=>leagueFilter==='Toutes'||m.lg===leagueFilter),[upcoming,leagueFilter]);
 const combos=useMemo(()=>({
  safe:buildCombo(upcoming,2,4,comboSeed+11),
  medium:buildCombo(upcoming,6,8,comboSeed+29),
  high:buildCombo(upcoming,35,45,comboSeed+47)
 }),[upcoming,comboSeed]);
 const ComboCard=({title,subtitle,combo}:{title:string;subtitle:string;combo:Combo|null})=><View style={s.card}>
  <Text style={s.comboTitle}>{title}</Text><Text style={s.info}>{subtitle}</Text>
  {combo?<><View style={s.comboOdds}><Text style={s.comboOddsLabel}>COTE ESTIMÉE</Text><Text style={s.comboOddsValue}> {combo.odds.toFixed(2).replace('.',',')}</Text><Text style={s.comboOddsLabel}>{combo.picks.length} sélections</Text></View>
   {combo.picks.map((p,i)=><View key={p.id} style={s.comboPick}><View style={{flex:1}}><Text style={s.comboMatch}>{p.match}</Text><Text style={s.comboMarket}>{p.market} · {p.league}</Text></View><View style={{alignItems:'flex-end'}}><Text style={s.comboProb}>{Math.round(p.probability*100)} %</Text><Text style={s.comboMarket}>Cote {p.odds.toFixed(2)}</Text></View></View>)}
  </>:<Text style={s.info}>Pas assez de matchs ou de probabilités disponibles pour construire ce combiné.</Text>}
 </View>;

 const Probability=({label,value,active=false}:{label:string;value?:number;active?:boolean})=><View style={[s.probCell,active&&s.probCellActive]}><Text style={[s.probLabel,active&&s.probLabelActive]}>{label}</Text><Text style={[s.probValue,active&&s.probValueActive]}>{pct(value)}</Text></View>;
 const winningOutcome=(m:Match)=>{if(m.p1==null||m.pN==null||m.p2==null)return null;const best=Math.max(m.p1,m.pN,m.p2);return { '1':m.p1===best,'N':m.pN===best,'2':m.p2===best };};
 const MatchCard=({match}:{match:Match})=><Pressable style={s.card} onPress={()=>setSelected(match)}>
  <View style={s.meta}><Text style={s.league}>{match.lg||'Compétition'}</Text><Text style={s.date}>{dateLabel(match.d,match.h)}</Text></View>
  <View style={s.teams}><View style={s.teamSide}>{!!match.hc&&<Image source={{uri:match.hc}} style={s.crest}/>}<Text style={s.team}>{match.home||'Domicile'}</Text></View><Text style={s.vs}>{match.r?match.r[0]+'-'+match.r[1]:'VS'}</Text><View style={s.teamSide}>{!!match.ac&&<Image source={{uri:match.ac}} style={s.crest}/>}<Text style={s.team}>{match.away||'Extérieur'}</Text></View></View>
  <View style={s.probs}><Probability label="1" value={match.p1} active={!!winningOutcome(match)?.['1']}/><Probability label="N" value={match.pN} active={!!winningOutcome(match)?.N}/><Probability label="2" value={match.p2} active={!!winningOutcome(match)?.['2']}/></View>
  <View style={s.footerRow}><Text style={s.pick}>PRONO : {prediction(match)}</Text><Text style={s.link}>Détails →</Text></View>
 </Pressable>;
 const StatBox=({label,value}:{label:string;value:string|number})=><View style={s.statBox}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
 return <SafeAreaView style={s.safe}><StatusBar barStyle="light-content"/><View style={s.container}>
  <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={GREEN}/>}>
   <View style={s.header}><View><Text style={s.logo}>PRONO<Text style={s.green}>KIKZ</Text></Text><Text style={s.subtitle}>SPORTS INTELLIGENCE</Text></View><View style={[s.status,!apiOnline&&s.offline]}><View style={[s.dot,!apiOnline&&s.offlineDot]}/><Text style={[s.statusText,!apiOnline&&s.offlineText]}>{apiOnline?'API EN LIGNE':'API HORS LIGNE'}</Text></View></View>
   {selected?<View><Pressable onPress={()=>setSelected(null)}><Text style={s.back}>← Retour</Text></Pressable><Text style={s.title}>Analyse du match</Text><View style={s.card}><Text style={s.league}>{selected.lg}</Text><Text style={s.detailTeams}>{selected.home} <Text style={s.green}>VS</Text> {selected.away}</Text><Text style={s.date}>{dateLabel(selected.d,selected.h)}</Text>{!!selected.r&&<Text style={s.result}>Résultat : {selected.r[0]} - {selected.r[1]}</Text>}<Text style={s.sectionTitle}>Probabilités 1N2</Text><View style={s.probs}><Probability label="1" value={selected.p1} active={!!winningOutcome(selected)?.['1']}/><Probability label="N" value={selected.pN} active={!!winningOutcome(selected)?.N}/><Probability label="2" value={selected.p2} active={!!winningOutcome(selected)?.['2']}/></View><Text style={s.sectionTitle}>Autres indicateurs</Text><Text style={s.info}>Les deux équipes marquent : {pct(selected.btts)}</Text><Text style={s.info}>Plus de 2,5 buts : {pct(selected.o25)}</Text>{!!selected.ia&&<Text style={s.info}>{selected.ia}</Text>}{!!selected.bt&&<Text style={s.info}>Buteur suggéré : {selected.bt}</Text>}{!!selected.ex&&<Text style={s.info}>Avis : {selected.ex}</Text>}{!!selected.fin&&<Text style={s.info}>Sélection : {formatSelection(selected.fin)}</Text>}<Text style={s.disclaimer}>Ces probabilités sont des estimations statistiques, pas des garanties de résultat.</Text></View></View>:<>
    <View style={s.hero}><Text style={s.tag}>TON ASSISTANT SPORTIF</Text><Text style={s.heroTitle}>Prédire mieux.{'\n'}<Text style={s.green}>Comprendre plus.</Text></Text><Text style={s.heroDesc}>Matchs, probabilités et analyses réunis au même endroit.</Text></View>
    {tab==='Accueil'&&<><View style={s.statsRow}><StatBox label="À venir" value={stats?.upcoming??upcoming.length}/><StatBox label="Terminés" value={stats?.finished??finished.length}/><StatBox label="Précision" value={stats?.accuracy==null?'—':stats.accuracy+'%'}/></View><View style={s.sectionHeader}><Text style={s.sectionTitle}>Prochains matchs</Text><Text style={s.counter}>{upcoming.length} MATCHS</Text></View>{loading?<ActivityIndicator color={GREEN} size="large"/>:error?<Text style={s.error}>{error}</Text>:upcoming.length?upcoming.slice(0,4).map(m=><MatchCard key={String(m.id)} match={m}/>):<Text style={s.info}>Aucun match disponible pour le moment.</Text>}<Pressable style={s.button} onPress={()=>setTab('Matchs')}><Text style={s.buttonText}>Voir tous les matchs →</Text></Pressable></>}
    {tab==='Matchs'&&<><Text style={s.title}>Tous les matchs</Text><Text style={s.heroDesc}>Rencontres à venir et analyses disponibles.</Text>{!loading&&!error&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>{leagueOptions.map(name=><Pressable key={name} onPress={()=>setLeagueFilter(name)} style={[s.filterChip,leagueFilter===name&&s.filterChipActive]}><Text style={[s.filterText,leagueFilter===name&&s.filterTextActive]}>{name}</Text></Pressable>)}</ScrollView>}{loading?<ActivityIndicator color={GREEN}/>:error?<Text style={s.error}>{error}</Text>:visible.map(m=><MatchCard key={String(m.id)} match={m}/>)}{!loading&&!error&&!visible.length&&<Text style={s.info}>{leagueFilter==='Toutes'?'Aucun match à venir pour le moment.':'Aucune rencontre à venir pour cette compétition. Les prochains matchs apparaîtront automatiquement dès leur publication.'}</Text>}</>}
    {tab==='Mon conseil'&&<><Text style={s.title}>Mon conseil</Text><Text style={s.heroDesc}>Des combinés construits à partir des probabilités estimées des matchs à venir.</Text><ComboCard title="SAFE · COTE 2 À 4" subtitle="Priorité aux marchés les plus probables disponibles." combo={combos.safe}/><ComboCard title="OBJECTIF · COTE 6/7" subtitle="Combiné à cote plus élevée, en conservant les probabilités individuelles les plus fortes." combo={combos.medium}/><ComboCard title="GROSSE COTE · 40" subtitle="Combiné long : le risque de perdre l'ensemble est très élevé." combo={combos.high}/><Pressable style={s.button} onPress={()=>setComboSeed(x=>x+1)}><Text style={s.buttonText}>↻ Relancer les combinés</Text></Pressable><Text style={s.disclaimer}>Important : les cotes affichées sont théoriques, calculées comme l'inverse des probabilités du modèle. Ce ne sont pas les cotes d'un bookmaker. Les probabilités de plusieurs matchs ne sont pas parfaitement indépendantes ; aucun combiné n'est garanti.</Text></>}
    {tab==='Résultats'&&<><Text style={s.title}>Résultats & historique</Text>{loading?<ActivityIndicator color={GREEN}/>:error?<Text style={s.error}>{error}</Text>:finished.map(m=><MatchCard key={String(m.id)} match={m}/>)}{!finished.length&&<Text style={s.info}>Les résultats apparaîtront après la mise à jour des données.</Text>}</>}
    {tab==='Stats'&&<><Text style={s.title}>Statistiques Pronokikz</Text><View style={s.statsRow}><StatBox label="Matchs" value={stats?.total??matches.length}/><StatBox label="Évalués" value={stats?.evaluated??0}/><StatBox label="Bons pronos" value={stats?.correct??0}/></View><View style={s.card}><Text style={s.sectionTitle}>Précision 1N2</Text><Text style={s.bigNumber}>{stats?.accuracy==null?'—':stats.accuracy+'%'}</Text><Text style={s.info}>Calculée sur les matchs terminés disposant d'un pronostic et d'un score final.</Text></View></>}
   </>}
   {!!updatedAt&&<Text style={s.updated}>Données mises à jour : {new Date(updatedAt).toLocaleString('fr-FR')}</Text>}<Text style={s.bottom}>PRONOKIKZ • VERSION 1.0</Text>
  </ScrollView>
  <View style={s.nav}>{['Accueil','Matchs','Mon conseil','Résultats','Stats'].map(item=><Pressable key={item} onPress={()=>{setSelected(null);setTab(item);}} style={s.navItem}><Text style={[s.navIcon,tab===item&&s.navActive]}>{item==='Accueil'?'⌂':item==='Matchs'?'⚽':item==='Résultats'?'◷':item==='Mon conseil'?'✦':'▥'}</Text><Text style={[s.navLabel,tab===item&&s.navActive]}>{item}</Text></Pressable>)}</View>
 </View></SafeAreaView>;
}
const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:BG},comboTitle:{color:'#FFF',fontSize:15,fontWeight:'900'},comboOdds:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',marginTop:12,marginBottom:10,backgroundColor:'#0B1218',padding:12,borderRadius:10},comboOddsLabel:{color:MUTED,fontSize:9,fontWeight:'800'},comboOddsValue:{color:GREEN,fontSize:26,fontWeight:'900'},comboPick:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:'#263640',gap:8},comboMatch:{color:'#FFF',fontSize:12,fontWeight:'800'},comboMarket:{color:MUTED,fontSize:10,marginTop:4},comboProb:{color:GREEN,fontSize:13,fontWeight:'900'},container:{flex:1,backgroundColor:BG},content:{padding:18,paddingBottom:28},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:30},logo:{color:'#FFF',fontSize:25,fontWeight:'900',letterSpacing:1},subtitle:{color:MUTED,fontSize:9,letterSpacing:2,marginTop:4},green:{color:GREEN},status:{flexDirection:'row',alignItems:'center',backgroundColor:'#142438',paddingHorizontal:10,paddingVertical:8,borderRadius:20},offline:{backgroundColor:'#321B20'},dot:{width:7,height:7,borderRadius:4,backgroundColor:GREEN,marginRight:7},offlineDot:{backgroundColor:'#FF647C'},statusText:{color:GREEN,fontWeight:'800',fontSize:9},offlineText:{color:'#FF8496'},hero:{marginBottom:25},tag:{color:GREEN,fontSize:10,fontWeight:'800',letterSpacing:2,marginBottom:12},heroTitle:{color:'#FFF',fontSize:30,fontWeight:'900',lineHeight:38},heroDesc:{color:MUTED,fontSize:13,lineHeight:21,marginTop:10,marginBottom:18},statsRow:{flexDirection:'row',gap:9,marginBottom:25},statBox:{flex:1,backgroundColor:CARD,borderRadius:13,padding:13,borderWidth:1,borderColor:'#1D2A34'},statValue:{color:GREEN,fontSize:21,fontWeight:'900'},statLabel:{color:MUTED,fontSize:10,marginTop:5},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:13},sectionTitle:{color:'#FFF',fontSize:16,fontWeight:'800',marginTop:18,marginBottom:12},counter:{color:GREEN,fontSize:10,fontWeight:'800'},card:{backgroundColor:CARD,borderRadius:16,padding:15,borderWidth:1,borderColor:'#1D2A34',marginBottom:12},meta:{flexDirection:'row',justifyContent:'space-between',gap:8,marginBottom:16},league:{color:GREEN,fontSize:11,fontWeight:'800'},date:{color:MUTED,fontSize:10},teams:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},teamSide:{flex:1,alignItems:'center',gap:6},team:{color:'#FFF',fontWeight:'700',fontSize:12,textAlign:'center'},crest:{width:28,height:28,resizeMode:'contain'},vs:{color:MUTED,fontSize:11,fontWeight:'900'},probs:{flexDirection:'row',gap:8,marginTop:18},probCell:{flex:1,alignItems:'center',backgroundColor:'#0B1218',padding:10,borderRadius:9,borderWidth:1,borderColor:'#1D2A34'},probCellActive:{backgroundColor:'#152D46',borderColor:GREEN},probLabel:{color:MUTED,fontSize:10},probLabelActive:{color:GREEN,fontWeight:'900'},probValue:{color:'#FFF',fontSize:17,fontWeight:'900',marginTop:4},probValueActive:{color:GREEN},footerRow:{flexDirection:'row',justifyContent:'space-between',marginTop:14},pick:{color:'#FFF',fontSize:10,fontWeight:'800',flex:1},link:{color:GREEN,fontSize:10,fontWeight:'800'},title:{color:'#FFF',fontSize:22,fontWeight:'900',marginBottom:10},detailTeams:{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:12},back:{color:GREEN,fontWeight:'800',marginBottom:18},result:{color:GREEN,fontWeight:'800',marginTop:12},info:{color:MUTED,fontSize:12,lineHeight:19,marginTop:8},disclaimer:{color:MUTED,fontSize:10,lineHeight:16,marginTop:18,fontStyle:'italic'},statsRowDummy:{},bigNumber:{color:GREEN,fontSize:38,fontWeight:'900'},button:{backgroundColor:GREEN,padding:15,borderRadius:12,alignItems:'center',marginTop:15},buttonText:{color:'#06110D',fontWeight:'900'},filters:{marginBottom:14,maxHeight:42},filtersContent:{gap:8,alignItems:'center'},filterChip:{borderWidth:1,borderColor:'#263640',backgroundColor:CARD,paddingHorizontal:12,paddingVertical:9,borderRadius:18},filterChipActive:{backgroundColor:'#15283C',borderColor:GREEN},filterText:{color:MUTED,fontSize:10,fontWeight:'700'},filterTextActive:{color:GREEN},error:{color:'#FF8496',fontSize:12,marginVertical:12},updated:{color:MUTED,fontSize:9,textAlign:'center',marginTop:18},bottom:{color:'#52616D',fontSize:9,textAlign:'center',marginTop:22,marginBottom:12},nav:{flexDirection:'row',justifyContent:'space-around',paddingTop:12,paddingBottom:48,backgroundColor:'#0D151C',borderTopWidth:1,borderTopColor:'#1D2A34'},navItem:{alignItems:'center',gap:4,flex:1},navIcon:{fontSize:18,color:MUTED},navLabel:{fontSize:9,color:MUTED},navActive:{color:GREEN,fontWeight:'900'}
});
