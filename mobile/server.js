require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3001);
// Les données sont partagées avec le site web à la racine du dépôt.
const DATA_FILE = path.join(__dirname, '..', 'data.json');

app.use(cors());
app.use(express.json());

function readData() {
  if (!fs.existsSync(DATA_FILE)) return { updatedAt: null, matches: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { updatedAt: parsed.updatedAt || null, matches: Array.isArray(parsed.matches) ? parsed.matches : [] };
  } catch (error) {
    console.error('Lecture de data.json impossible :', error.message);
    return { updatedAt: null, matches: [] };
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Pronokikz API fonctionne !', updatedAt: readData().updatedAt });
});

app.get('/api/matches', (req, res) => {
  const { matches, updatedAt } = readData();
  const date = req.query.date;
  const filtered = date ? matches.filter(match => match.d === date) : matches;
  res.json({ success: true, total: filtered.length, updatedAt, matches: filtered });
});

app.get('/api/stats', (_req, res) => {
  const { matches } = readData();
  const finished = matches.filter(match => Array.isArray(match.r) && match.r.length === 2);
  const upcoming = matches.filter(match => !match.r);
  let correct = 0;
  let evaluated = 0;
  for (const match of finished) {
    if (match.p1 == null || match.pN == null || match.p2 == null) continue;
    const predicted = match.p1 >= match.pN && match.p1 >= match.p2 ? '1'
      : match.pN >= match.p1 && match.pN >= match.p2 ? 'N' : '2';
    const actual = match.r[0] > match.r[1] ? '1' : match.r[0] === match.r[1] ? 'N' : '2';
    evaluated++;
    if (predicted === actual) correct++;
  }
  res.json({
    total: matches.length, upcoming: upcoming.length, finished: finished.length,
    evaluated, correct, accuracy: evaluated ? Math.round(correct / evaluated * 100) : null
  });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Pronokikz API démarrée sur le port ${PORT}`));
