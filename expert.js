// Avis d'experts + mon prono final, remplis à la main (une ligne par match).
// h / a : début du nom de l'équipe domicile / extérieur (minuscules, sans accents)
// fin : 1, N, 2 (résultat) ou 1N, N2, 12 (double chance) ; ex : avis des experts ; bt : buteur conseillé
// aj : ajustement manuel (absences, enjeux, tactique, confrontations) de -1 à +1 ; positif = avantage à l'équipe à domicile
const EXPERTS=[
{h:'turquie',a:'belgique',fin:'2',ex:'Experts : victoire de la Belgique.',bt:''},
{h:'italie',a:'france',fin:'N2',ex:'Experts : la France gagne ou fait nul, moins de 2,5 buts. Italie sans Kean, Retegui ni Raspadori.',bt:'Mbappé (France)'},
{h:'angleterre',a:'croatie',fin:'1',ex:'Experts : victoire de l’Angleterre, plus de 2,5 buts (moins de 3,5 pour certains). 7-0 à l’aller.',bt:'Kane (Angleterre)'}
];
// Combiné conseillé choisi à la main (facultatif). Si vide, l'appli choisit le plus sûr.
// Exemple : const COMBO={legs:[{m:'PSG – Troyes',l:'PSG gagne',p:0.8}],note:'Mon avis'};
const COMBO=null;
// Matchs ajoutés à la main (sélections, coupes...), non couverts par l'API gratuite.
// Exemple : {id:'x1',lg:'Ligue des nations',d:'2026-11-12',h:'20:45',home:'Italie',away:'France',p1:.30,pN:.28,p2:.42,btts:.55,o25:.48,r:null,ia:'Score probable : 1-1'}
const EXTRA=[
{
"id": "nl-1",
"lg": "Ligue des nations",
"d": "2026-11-12",
"h": "18:00",
"home": "Turquie",
"away": "Belgique",
"p1": 0.17,
"pN": 0.22,
"p2": 0.61,
"btts": 0.55,
"o25": 0.6,
"r": null,
"ia": "Estimation à la main + avis d'experts. Score probable : 1-2",
"bt": "",
"ex": ""
},
{
"id": "nl-2",
"lg": "Ligue des nations",
"d": "2026-11-12",
"h": "20:45",
"home": "Italie",
"away": "France",
"p1": 0.26,
"pN": 0.27,
"p2": 0.47,
"btts": 0.5,
"o25": 0.4,
"r": null,
"ia": "Estimation à la main + avis d'experts. Score probable : 0-1",
"bt": "",
"ex": ""
},
{
"id": "nl-3",
"lg": "Ligue des nations",
"d": "2026-11-12",
"h": "20:45",
"home": "Tchéquie",
"away": "Espagne",
"p1": 0.1,
"pN": 0.17,
"p2": 0.73,
"btts": 0.48,
"o25": 0.6,
"r": null,
"ia": "Estimation à la main (classement après 4 journées). Score probable : 0-2",
"bt": "",
"ex": ""
},
{
"id": "nl-4",
"lg": "Ligue des nations",
"d": "2026-11-12",
"h": "20:45",
"home": "Angleterre",
"away": "Croatie",
"p1": 0.72,
"pN": 0.17,
"p2": 0.11,
"btts": 0.45,
"o25": 0.68,
"r": null,
"ia": "Estimation à la main + avis d'experts. Score probable : 3-0",
"bt": "",
"ex": ""
},
{
"id": "nl-5",
"lg": "Ligue des nations",
"d": "2026-11-15",
"h": "20:45",
"home": "Belgique",
"away": "Italie",
"p1": 0.35,
"pN": 0.27,
"p2": 0.38,
"btts": 0.62,
"o25": 0.6,
"r": null,
"ia": "Estimation à la main (classement après 4 journées). Score probable : 1-1",
"bt": "",
"ex": ""
},
{
"id": "nl-6",
"lg": "Ligue des nations",
"d": "2026-11-15",
"h": "20:45",
"home": "France",
"away": "Turquie",
"p1": 0.82,
"pN": 0.12,
"p2": 0.06,
"btts": 0.38,
"o25": 0.62,
"r": null,
"ia": "Estimation à la main (classement après 4 journées). Score probable : 3-0",
"bt": "",
"ex": ""
},
{
"id": "nl-7",
"lg": "Ligue des nations",
"d": "2026-11-15",
"h": "20:45",
"home": "Croatie",
"away": "Tchéquie",
"p1": 0.48,
"pN": 0.26,
"p2": 0.26,
"btts": 0.55,
"o25": 0.5,
"r": null,
"ia": "Estimation à la main (classement après 4 journées). Score probable : 1-1",
"bt": "",
"ex": ""
},
{
"id": "nl-8",
"lg": "Ligue des nations",
"d": "2026-11-15",
"h": "20:45",
"home": "Espagne",
"away": "Angleterre",
"p1": 0.5,
"pN": 0.26,
"p2": 0.24,
"btts": 0.5,
"o25": 0.48,
"r": null,
"ia": "Estimation à la main (classement après 4 journées). Score probable : 2-1",
"bt": "",
"ex": ""
}
];
