import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase configuration for API routes
const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
let db = null;

// Built-in fallback config to ensure API works even if the config file is missing on Hostinger
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "jbmrcricket",
  appId: "1:289363783537:web:c529572a78b4369fef50d0",
  apiKey: "AIzaSyDEeuHrw5Q5lu-rOYcTNMQbfQ-ejjUFam4",
  authDomain: "jbmrcricket.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-28fe81ba-7106-49f6-bb9e-31bfd6aedf1a",
  storageBucket: "jbmrcricket.firebasestorage.app",
  messagingSenderId: "289363783537",
  measurementId: ""
};

try {
  let firebaseConfig = null;
  if (fs.existsSync(firebaseConfigPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    console.log('Firebase configuration loaded from firebase-applet-config.json');
  } else {
    console.warn('firebase-applet-config.json not found, using built-in fallback configuration.');
    firebaseConfig = DEFAULT_FIREBASE_CONFIG;
  }

  if (firebaseConfig) {
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log('Firebase successfully initialized in server.js');
  }
} catch (error) {
  console.error('Failed to initialize Firebase in server.js:', error);
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Custom CORS middleware to allow stream setups / widgets (OBS) to fetch data
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Middleware
  app.use(express.json());

  // API middleware check
  const checkDb = (req, res, next) => {
    if (!db) {
      return res.status(503).json({ error: 'Database service is temporarily unavailable or not configured.' });
    }
    next();
  };

  // API routes first
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', firebaseConfigured: !!db, timestamp: new Date().toISOString() });
  });

  // GET all tournaments
  app.get('/api/tournaments', checkDb, async (req, res) => {
    try {
      const colRef = collection(db, 'tournaments');
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET specific tournament details
  app.get('/api/tournaments/:tournamentId', checkDb, async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const docRef = doc(db, 'tournaments', tournamentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      res.json({ id: snap.id, ...snap.data() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET players in a tournament
  app.get('/api/tournaments/:tournamentId/players', checkDb, async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/players`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET groups in a tournament
  app.get('/api/tournaments/:tournamentId/groups', checkDb, async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/groups`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET fixtures in a tournament
  app.get('/api/tournaments/:tournamentId/fixtures', checkDb, async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/fixtures`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET matches/scores entered in a tournament
  app.get('/api/tournaments/:tournamentId/matches', checkDb, async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/matches`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET hierarchy organization roots in a tournament
  app.get('/api/tournaments/:tournamentId/roots', checkDb, async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/roots`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET global player registry
  app.get('/api/global-players', checkDb, async (req, res) => {
    try {
      const colRef = collection(db, 'players');
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET calculated points standings for a tournament
  app.get('/api/tournaments/:tournamentId/standings', checkDb, async (req, res) => {
    try {
      const { tournamentId } = req.params;
      
      // Get Tournament config
      const tournamentRef = doc(db, 'tournaments', tournamentId);
      const tournamentSnap = await getDoc(tournamentRef);
      if (!tournamentSnap.exists()) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      const tournamentData = tournamentSnap.data();

      // Get Players
      const playersSnap = await getDocs(collection(db, `tournaments/${tournamentId}/players`));
      const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const playerMap = {};
      players.forEach(p => {
        playerMap[p.id] = p.name;
      });

      // Get Groups
      const groupsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/groups`));
      const groups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Get Fixtures
      const fixturesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/fixtures`));
      const fixtures = fixturesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Get Matches
      const matchesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches`));
      const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Calculate standings grouping by groupName
      const groupedStats = {};
      groups.forEach(group => {
        groupedStats[group.name] = {};
        if (group.playerIds) {
          group.playerIds.forEach(playerId => {
            const playerName = playerMap[playerId];
            if (playerName) {
              groupedStats[group.name][playerName] = {
                playerId,
                wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0
              };
            }
          });
        }
      });

      matches.forEach(match => {
        const fixture = fixtures.find(f => f.id === match.fixtureId);
        if (!fixture || !fixture.groupName) return;

        const groupName = fixture.groupName;
        const p1 = fixture.player1Name;
        const p2 = fixture.player2Name;
        const s = match.scores;

        if (fixture.matchType && fixture.matchType !== 'league') return;

        if (!groupedStats[groupName]) groupedStats[groupName] = {};
        if (!groupedStats[groupName][p1]) {
          groupedStats[groupName][p1] = { playerId: fixture.player1Id, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0 };
        }
        if (!groupedStats[groupName][p2]) {
          groupedStats[groupName][p2] = { playerId: fixture.player2Id, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0 };
        }

        if (match.winner === 'player1') groupedStats[groupName][p1].wins++;
        else if (match.winner === 'player2') groupedStats[groupName][p1].losses++;

        groupedStats[groupName][p1].gamesWon += match.p1Games || 0;
        groupedStats[groupName][p1].gamesLost += match.p2Games || 0;
        groupedStats[groupName][p1].pointsScored += (s.p1g1 || 0) + (s.p1g2 || 0) + (s.p1g3 || 0);
        groupedStats[groupName][p1].pointsAgainst += (s.p2g1 || 0) + (s.p2g2 || 0) + (s.p2g3 || 0);

        if (match.winner === 'player2') groupedStats[groupName][p2].wins++;
        else if (match.winner === 'player1') groupedStats[groupName][p2].losses++;

        groupedStats[groupName][p2].gamesWon += match.p2Games || 0;
        groupedStats[groupName][p2].gamesLost += match.p1Games || 0;
        groupedStats[groupName][p2].pointsScored += (s.p2g1 || 0) + (s.p2g2 || 0) + (s.p2g3 || 0);
        groupedStats[groupName][p2].pointsAgainst += (s.p1g1 || 0) + (s.p1g2 || 0) + (s.p1g3 || 0);
      });

      const isRoundRobinA = (tournamentData.tournamentType || '').toLowerCase().includes('round robin a') || (tournamentData.tournamentType || '').toLowerCase().includes('robin a');
      const winPointsValue = tournamentData.winPoints !== undefined ? Number(tournamentData.winPoints) : 2;
      const lossPointsValue = tournamentData.lossPoints !== undefined ? Number(tournamentData.lossPoints) : 0;

      const standings = {};
      Object.entries(groupedStats).forEach(([groupName, groupPlayers]) => {
        standings[groupName] = Object.entries(groupPlayers).map(([playerName, stats]) => {
          const played = stats.wins + stats.losses;
          const matchPoints = (stats.wins * winPointsValue) + (stats.losses * lossPointsValue);
          const gameDiff = stats.gamesWon - stats.gamesLost;
          const pointDiff = stats.pointsScored - stats.pointsAgainst;
          return {
            playerId: stats.playerId,
            playerName,
            played,
            wins: stats.wins,
            losses: stats.losses,
            matchPoints,
            gamesWon: stats.gamesWon,
            gamesLost: stats.gamesLost,
            gameDiff,
            pointsScored: stats.pointsScored,
            pointsAgainst: stats.pointsAgainst,
            pointDiff
          };
        }).sort((a, b) => {
          if (isRoundRobinA) {
            if (b.wins !== a.wins) return b.wins - a.wins;
          }
          if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
          if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
          if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
          return 0;
        });
      });

      res.json({
        tournamentId,
        tournamentType: tournamentData.tournamentType,
        standings
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  function serveStaticProduction(appInstance) {
    const distPath = path.join(__dirname, 'dist');
    appInstance.use(express.static(distPath));
    
    // Fallback all other routes to index.html for SPA routing
    appInstance.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Auto-detect production mode based on folder structure or environment variable
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(__dirname, 'dist'));

  if (!isProduction) {
    try {
      console.log('Starting server in DEVELOPMENT mode with Vite dev middleware...');
      // Dynamic import to prevent crash in production environments where vite might not be available
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (error) {
      console.error('Failed to start Vite dev server, falling back to static production serving:', error);
      serveStaticProduction(app);
    }
  } else {
    console.log('Starting server in PRODUCTION mode (serving built dist/ folder)...');
    serveStaticProduction(app);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
