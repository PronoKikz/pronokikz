// APIFootball API v3: jointure des fixtures et des lignes de cotes via match_id.
function asOdds(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)&&n>1?n:null;}
function dateParis(d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function plusDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
async function api(action,key,from,to){
 const url=new URL('https://apiv3.apifootball.com/');
 url.searchParams.set('action',action);url.searchParams.set('APIkey',key);
 url.searchParams.set('from',from);url.searchParams.set('to',to);
 const res=await fetch(url,{headers:{Accept:'application/json'}});
 if(!res.ok)throw new Error('APIFootball '+action+' HTTP '+res.status);
 const data=await res.json();
 if(!Array.isArray(data))throw new Error('APIFootball '+action+' : '+(data&&data.message?data.message:JSON.stringify(data)));
 return data;
}
async function fetchOdds(key){
 const from=dateParis(),to=plusDays(from,7);
 const [fixtures,rows]=await Promise.all([api('get_events',key,from,to),api('get_odds',key,from,to)]);
 const fixtureMap=new Map(fixtures.map(f=>[String(f.match_id),f])),grouped=new Map();
 for(const row of rows){const id=String(row.match_id||'');if(!id||!fixtureMap.has(id))continue;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(row);}
 const result=[];
 for(const [id,bookRows] of grouped){
  const f=fixtureMap.get(id),p=[0,0,0],counts=[0,0,0],best={h2h:{},totals:{},btts:{}};
  let btts=0,bttsN=0,o25=0,o25N=0;
  const save=(slot,k,v,book)=>{if(v&&(!best[slot][k]||v>best[slot][k].price))best[slot][k]={price:v,bookmaker:book};};
  for(const row of bookRows){
   const vals=[asOdds(row.odd_1),asOdds(row.odd_x),asOdds(row.odd_2)];
   if(vals.every(Boolean)){
    const inv=vals.map(v=>1/v),sum=inv.reduce((a,b)=>a+b,0);
    inv.forEach((v,i)=>{p[i]+=v/sum;counts[i]++;});
    save('h2h','home',vals[0],row.odd_bookmakers);save('h2h','draw',vals[1],row.odd_bookmakers);save('h2h','away',vals[2],row.odd_bookmakers);
   }
   const yes=asOdds(row.bts_yes),no=asOdds(row.bts_no);
   if(yes&&no){btts+=(1/yes)/(1/yes+1/no);bttsN++;}
   const over=asOdds(row['o+2.5']),under=asOdds(row['u+2.5']);
   if(over&&under){o25+=(1/over)/(1/over+1/under);o25N++;}
   save('totals','over25',over,row.odd_bookmakers);save('totals','under25',under,row.odd_bookmakers);
   save('btts','yes',yes,row.odd_bookmakers);save('btts','no',no,row.odd_bookmakers);
  }
  if(!counts.every(Boolean))continue;
  result.push({h:f.match_hometeam_name,a:f.match_awayteam_name,p:p.map((v,i)=>v/counts[i]),o:o25N?o25/o25N:null,btts:bttsN?btts/bttsN:null,quotes:best,oddsAt:new Date().toISOString(),matchId:id,league:f.league_name,matchDate:f.match_date});
 }
 console.log('APIFootball : '+fixtures.length+' fixtures, '+rows.length+' lignes bookmakers, '+result.length+' matchs avec cotes 1N2 ('+from+' → '+to+').');
 return result;
}
module.exports={fetchOdds};
