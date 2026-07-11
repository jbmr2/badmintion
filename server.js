const express = require('express');
const path = require('path');
const fs = require('fs');

// Global crash logging for Hostinger shared hosting diagnostics
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  try {
    fs.appendFileSync(path.join(__dirname, 'server-crash.log'), `[${new Date().toISOString()}] UNCAUGHT EXCEPTION:\n${err.stack || err.message}\n\n`);
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  try {
    fs.appendFileSync(path.join(__dirname, 'server-crash.log'), `[${new Date().toISOString()}] UNHANDLED REJECTION:\n${reason?.stack || reason}\n\n`);
  } catch (e) {}
});

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

let db = null;
let firestoreModule = null;
let firebaseInitError = null;
const serverStartTime = new Date();

function initFirebase() {
  if (db && firestoreModule) {
    return { db, fs: firestoreModule };
  }
  
  try {
    const { initializeApp } = require('firebase/app');
    firestoreModule = require('firebase/firestore');

    const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
    let firebaseConfig = null;
    
    if (fs.existsSync(firebaseConfigPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
      console.log('Firebase configuration loaded from firebase-applet-config.json');
    } else {
      console.warn('firebase-applet-config.json not found, using built-in fallback configuration.');
      firebaseConfig = DEFAULT_FIREBASE_CONFIG;
    }

    const firebaseApp = initializeApp(firebaseConfig);
    db = firestoreModule.getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log('Firebase successfully initialized dynamically in server.js');
    return { db, fs: firestoreModule };
  } catch (error) {
    firebaseInitError = error;
    console.error('Failed to initialize Firebase dynamically in server.js:', error);
    throw error;
  }
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
    try {
      const fb = initFirebase();
      req.db = fb.db;
      req.fs = fb.fs;
      next();
    } catch (err) {
      return res.status(503).json({ 
        error: 'Database service is temporarily unavailable or not configured.',
        details: err.message,
        suggestion: 'Please verify that you have run "npm install" on Hostinger and that the "firebase" package is installed.'
      });
    }
  };

  // API routes first
  app.get('/api/health', (req, res) => {
    let firebaseConfigured = false;
    let errMessage = null;
    try {
      initFirebase();
      firebaseConfigured = true;
    } catch (err) {
      errMessage = err.message;
    }
    res.json({ 
      status: 'ok', 
      firebaseConfigured, 
      firebaseError: errMessage,
      timestamp: new Date().toISOString() 
    });
  });

  // GET server status & diagnostics
  app.get('/api/server/status', (req, res) => {
    res.json({
      status: 'online',
      uptime: Math.round((Date.now() - serverStartTime) / 1000),
      startTime: serverStartTime.toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage()
    });
  });

  // POST start server verification sequence
  app.post('/api/server/start', (req, res) => {
    try {
      initFirebase();
      res.json({
        success: true,
        message: 'Server engine verified and listening. Background connections, routing tables, and API integrations are fully operational.',
        uptime: Math.round((Date.now() - serverStartTime) / 1000),
        startTime: serverStartTime.toISOString()
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: 'Engine verify failed during startup check.',
        details: err.message
      });
    }
  });

  // POST soft restart server
  app.post('/api/server/restart', (req, res) => {
    res.json({
      success: true,
      message: 'Server restart initiated successfully. System will reload shortly.'
    });

    // Write Passenger restart file
    try {
      const tmpDir = path.join(__dirname, 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      fs.writeFileSync(path.join(tmpDir, 'restart.txt'), 'restart');
      console.log('Touched tmp/restart.txt to reload Passenger.');
    } catch (err) {
      console.error('Failed to touch tmp/restart.txt:', err);
    }

    // Schedule container/PM2 process restart
    setTimeout(() => {
      console.log('Restarting server process...');
      process.exit(0);
    }, 1000);
  });

  // GET all tournaments
  app.get('/api/tournaments', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { collection, getDocs } = fs;
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
      const { db, fs } = req;
      const { doc, getDoc } = fs;
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
      const { db, fs } = req;
      const { collection, getDocs } = fs;
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/players`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      try {
        const { playerHierarchyMap } = await getPlayerHierarchyMap(db, fs, tournamentId);
        const enrichedList = list.map(player => {
          const hierarchy = playerHierarchyMap[player.id];
          if (hierarchy) {
            return {
              ...player,
              level1Id: hierarchy.level1Id,
              level1Name: hierarchy.level1Name,
              level2Id: hierarchy.level2Id,
              level2Name: hierarchy.level2Name,
              rootId: hierarchy.rootId,
              rootName: hierarchy.rootName
            };
          }
          return player;
        });
        res.json(enrichedList);
      } catch (innerErr) {
        console.error("Error enriching players with hierarchy:", innerErr);
        res.json(list);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET groups in a tournament
  app.get('/api/tournaments/:tournamentId/groups', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { collection, getDocs } = fs;
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
      const { db, fs } = req;
      const { collection, getDocs } = fs;
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/fixtures`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      try {
        const { playerHierarchyMap, playerEmails } = await getPlayerHierarchyMap(db, fs, tournamentId);
        const enriched = enrichFixturesWithHierarchy(list, playerHierarchyMap, playerEmails);
        res.json(enriched);
      } catch (innerErr) {
        console.error("Error enriching fixtures with hierarchy:", innerErr);
        res.json(list);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // In-memory cache for player hierarchy maps to prevent concurrent/stampede Firestore requests
  const hierarchyCache = {};
  const activeHierarchyPromises = {};

  // Helper: Retrieve map of playerId -> hierarchy names (L1, L2, Root)
  async function getPlayerHierarchyMap(db, fs, tournamentId) {
    const cacheKey = tournamentId;
    const now = Date.now();

    // 1. Return valid cache (TTL: 10 seconds)
    if (hierarchyCache[cacheKey] && (now - hierarchyCache[cacheKey].timestamp < 10000)) {
      return hierarchyCache[cacheKey].data;
    }

    // 2. Return active promise to share concurrent fetches (prevents cache stampede)
    if (activeHierarchyPromises[cacheKey]) {
      return activeHierarchyPromises[cacheKey];
    }

    // 3. Initiate the asynchronous fetching
    const fetchPromise = (async () => {
      const { collection, getDocs } = fs;
      const playerHierarchyMap = {};
      const playerEmails = {};

      try {
        // Fetch direct tournament players to get emails AND roots concurrently
        let roots = [];
        let structureTournamentId = tournamentId;

        try {
          const [playersListSnap, rootsSnap] = await Promise.all([
            getDocs(collection(db, `tournaments/${tournamentId}/players`)),
            getDocs(collection(db, `tournaments/${tournamentId}/roots`))
          ]);

          playersListSnap.docs.forEach(pDoc => {
            const pData = pDoc.data();
            if (pData) {
              playerEmails[pDoc.id] = pData.email || '';
            }
          });

          roots = rootsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (pErr) {
          console.error("Error fetching tournament players/roots concurrently:", pErr);
        }

        if (roots.length === 0 && tournamentId !== '_master_') {
          try {
            const masterRootsSnap = await getDocs(collection(db, 'tournaments/_master_/roots'));
            roots = masterRootsSnap.docs.map(d => ({ id: d.id, isMasterFallback: true, ...d.data() }));
            structureTournamentId = '_master_';
          } catch (mErr) {
            console.error("Error fetching master roots fallback:", mErr);
          }
        }

        if (roots.length > 0) {
          // Fetch all Level1s for all roots in parallel
          const level1Promises = roots.map(async (root) => {
            try {
              const level1Snap = await getDocs(collection(db, `tournaments/${structureTournamentId}/roots/${root.id}/level1`));
              return level1Snap.docs.map(d => ({ id: d.id, rootId: root.id, rootName: root.name || '', ...d.data() }));
            } catch (e) {
              console.error(`Error fetching Level1 for root ${root.id}:`, e);
              return [];
            }
          });

          const level1sArrays = await Promise.all(level1Promises);
          const level1s = level1sArrays.flat();

          // Fetch all Level2s for all level1s in parallel
          const level2Promises = level1s.map(async (l1) => {
            try {
              const level2Snap = await getDocs(collection(db, `tournaments/${structureTournamentId}/roots/${l1.rootId}/level1/${l1.id}/level2`));
              return level2Snap.docs.map(d => ({ id: d.id, level1Id: l1.id, level1Name: l1.name || '', rootId: l1.rootId, rootName: l1.rootName || '', ...d.data() }));
            } catch (e) {
              console.error(`Error fetching Level2 for l1 ${l1.id}:`, e);
              return [];
            }
          });

          const level2sArrays = await Promise.all(level2Promises);
          const level2s = level2sArrays.flat();

          // Fetch all players for all level2s in parallel
          const playersPromises = level2s.map(async (l2) => {
            try {
              const playersSnap = await getDocs(collection(db, `tournaments/${tournamentId}/roots/${l2.rootId}/level1/${l2.level1Id}/level2/${l2.id}/players`));
              playersSnap.docs.forEach(pDoc => {
                playerHierarchyMap[pDoc.id] = {
                  level1Id: l2.level1Id,
                  level1Name: l2.level1Name || '',
                  level2Id: l2.id,
                  level2Name: l2.name || '',
                  rootId: l2.rootId,
                  rootName: l2.rootName || ''
                };
              });
            } catch (e) {
              console.error(`Error fetching players for l2 ${l2.id}:`, e);
            }
          });

          await Promise.all(playersPromises);
        }
      } catch (err) {
        console.error("Error building player hierarchy map:", err);
      }

      const result = { playerHierarchyMap, playerEmails };

      // Cache the result
      hierarchyCache[cacheKey] = {
        data: result,
        timestamp: Date.now()
      };

      return result;
    })();

    activeHierarchyPromises[cacheKey] = fetchPromise;

    try {
      const res = await fetchPromise;
      return res;
    } finally {
      delete activeHierarchyPromises[cacheKey];
    }
  }

  // Helper: Enrich fixture entries with their player hierarchy data
  function enrichFixturesWithHierarchy(fixturesList, playerHierarchyMap, playerEmails) {
    const emails = playerEmails || {};
    return fixturesList.map(f => {
      const enriched = { ...f };
      if (f.isDoubles) {
        // Attach player emails
        if (f.player1aId) enriched.player1aEmail = emails[f.player1aId] || '';
        if (f.player1bId) enriched.player1bEmail = emails[f.player1bId] || '';
        if (f.player2aId) enriched.player2aEmail = emails[f.player2aId] || '';
        if (f.player2bId) enriched.player2bEmail = emails[f.player2bId] || '';

        if (f.player1aId && playerHierarchyMap[f.player1aId]) {
          enriched.player1aL1Name = playerHierarchyMap[f.player1aId].level1Name;
          enriched.player1aL2Name = playerHierarchyMap[f.player1aId].level2Name;
          enriched.player1aRootName = playerHierarchyMap[f.player1aId].rootName;
        }
        if (f.player1bId && playerHierarchyMap[f.player1bId]) {
          enriched.player1bL1Name = playerHierarchyMap[f.player1bId].level1Name;
          enriched.player1bL2Name = playerHierarchyMap[f.player1bId].level2Name;
          enriched.player1bRootName = playerHierarchyMap[f.player1bId].rootName;
        }
        if (f.player2aId && playerHierarchyMap[f.player2aId]) {
          enriched.player2aL1Name = playerHierarchyMap[f.player2aId].level1Name;
          enriched.player2aL2Name = playerHierarchyMap[f.player2aId].level2Name;
          enriched.player2aRootName = playerHierarchyMap[f.player2aId].rootName;
        }
        if (f.player2bId && playerHierarchyMap[f.player2bId]) {
          enriched.player2bL1Name = playerHierarchyMap[f.player2bId].level1Name;
          enriched.player2bL2Name = playerHierarchyMap[f.player2bId].level2Name;
          enriched.player2bRootName = playerHierarchyMap[f.player2bId].rootName;
        }
      } else {
        // Attach player emails
        if (f.player1Id) enriched.player1Email = emails[f.player1Id] || '';
        if (f.player2Id) enriched.player2Email = emails[f.player2Id] || '';

        if (f.player1Id && playerHierarchyMap[f.player1Id]) {
          enriched.player1L1Name = playerHierarchyMap[f.player1Id].level1Name;
          enriched.player1L2Name = playerHierarchyMap[f.player1Id].level2Name;
          enriched.player1RootName = playerHierarchyMap[f.player1Id].rootName;
        }
        if (f.player2Id && playerHierarchyMap[f.player2Id]) {
          enriched.player2L1Name = playerHierarchyMap[f.player2Id].level1Name;
          enriched.player2L2Name = playerHierarchyMap[f.player2Id].level2Name;
          enriched.player2RootName = playerHierarchyMap[f.player2Id].rootName;
        }
      }
      return enriched;
    });
  }

  // GET matches/scores entered in a tournament
  app.get('/api/tournaments/:tournamentId/matches', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { collection, getDocs } = fs;
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
      const { db, fs } = req;
      const { collection, getDocs } = fs;
      const { tournamentId } = req.params;
      const colRef = collection(db, `tournaments/${tournamentId}/roots`);
      const snap = await getDocs(colRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global cache for the complete master hierarchy endpoints to prevent performance issues and "try again" errors
  const fullHierarchyCache = {};
  const activeHierarchyEndpoints = {};

  // GET complete master hierarchy (roots + level1 + level2 + players) in a tournament
  app.get('/api/tournaments/:tournamentId/hierarchy', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { collection, getDocs } = fs;
      const { tournamentId } = req.params;
      const now = Date.now();

      // Return cached hierarchy if available (TTL: 10 seconds)
      if (fullHierarchyCache[tournamentId] && (now - fullHierarchyCache[tournamentId].timestamp < 10000)) {
        return res.json(fullHierarchyCache[tournamentId].data);
      }

      if (activeHierarchyEndpoints[tournamentId]) {
        const cachedRes = await activeHierarchyEndpoints[tournamentId];
        return res.json(cachedRes);
      }

      const fetchPromise = (async () => {
        let roots = [];
        let structureTournamentId = tournamentId;

        // Fetch roots
        try {
          const rootsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/roots`));
          roots = rootsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
          console.error("Error fetching roots in hierarchy endpoint:", err);
        }

        if (roots.length === 0 && tournamentId !== '_master_') {
          try {
            const masterRootsSnap = await getDocs(collection(db, 'tournaments/_master_/roots'));
            roots = masterRootsSnap.docs.map(d => ({ id: d.id, isMasterFallback: true, ...d.data() }));
            structureTournamentId = '_master_';
          } catch (mErr) {
            console.error("Error fetching master roots fallback in hierarchy endpoint:", mErr);
          }
        }

        let level1s = [];
        let level2s = [];
        let assignedPlayers = [];

        if (roots.length > 0) {
          // Fetch Level1s
          const level1Promises = roots.map(async (root) => {
            try {
              const level1Snap = await getDocs(collection(db, `tournaments/${structureTournamentId}/roots/${root.id}/level1`));
              return level1Snap.docs.map(d => ({ id: d.id, rootId: root.id, rootName: root.name || '', ...d.data() }));
            } catch (e) {
              console.error(`Error fetching Level1 for root ${root.id} in hierarchy endpoint:`, e);
              return [];
            }
          });
          const level1sArrays = await Promise.all(level1Promises);
          level1s = level1sArrays.flat();

          // Fetch Level2s
          const level2Promises = level1s.map(async (l1) => {
            try {
              const level2Snap = await getDocs(collection(db, `tournaments/${structureTournamentId}/roots/${l1.rootId}/level1/${l1.id}/level2`));
              return level2Snap.docs.map(d => ({ id: d.id, level1Id: l1.id, level1Name: l1.name || '', rootId: l1.rootId, rootName: l1.rootName || '', ...d.data() }));
            } catch (e) {
              console.error(`Error fetching Level2 for l1 ${l1.id} in hierarchy endpoint:`, e);
              return [];
            }
          });
          const level2sArrays = await Promise.all(level2Promises);
          level2s = level2sArrays.flat();

          // Fetch assigned players
          const playersPromises = level2s.map(async (l2) => {
            try {
              const playersSnap = await getDocs(collection(db, `tournaments/${tournamentId}/roots/${l2.rootId}/level1/${l2.level1Id}/level2/${l2.id}/players`));
              return playersSnap.docs.map(pDoc => ({
                id: pDoc.id,
                level2Id: l2.id,
                level2Name: l2.name || '',
                level1Id: l2.level1Id,
                level1Name: l2.level1Name || '',
                rootId: l2.rootId,
                rootName: l2.rootName || '',
                ...pDoc.data()
              }));
            } catch (e) {
              console.error(`Error fetching players for l2 ${l2.id} in hierarchy endpoint:`, e);
              return [];
            }
          });
          const playersArrays = await Promise.all(playersPromises);
          assignedPlayers = playersArrays.flat();
        }

        const data = {
          roots,
          level1: level1s,
          level2: level2s,
          players: assignedPlayers
        };

        fullHierarchyCache[tournamentId] = {
          data,
          timestamp: Date.now()
        };

        return data;
      })();

      activeHierarchyEndpoints[tournamentId] = fetchPromise;
      const result = await fetchPromise;
      delete activeHierarchyEndpoints[tournamentId];
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET global player registry
  app.get('/api/global-players', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { collection, getDocs } = fs;
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
      const { db, fs } = req;
      const { doc, getDoc, collection, getDocs } = fs;
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

  // GET consolidated tournament data (Meta + Players + Groups + Fixtures + Matches + Roots + Standings)
  app.get('/api/tournaments/:tournamentId/consolidated', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { doc, getDoc, collection, getDocs } = fs;
      const { tournamentId } = req.params;

      // 1. Get Tournament config
      const tournamentRef = doc(db, 'tournaments', tournamentId);
      const tournamentSnap = await getDoc(tournamentRef);
      if (!tournamentSnap.exists()) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      const tournamentData = { id: tournamentSnap.id, ...tournamentSnap.data() };

      // 2. Get Players
      const playersSnap = await getDocs(collection(db, `tournaments/${tournamentId}/players`));
      let players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const playerMap = {};
      players.forEach(p => {
        playerMap[p.id] = p.name;
      });

      // 3. Get Groups
      const groupsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/groups`));
      const groups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 4. Get Fixtures
      const fixturesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/fixtures`));
      let fixtures = fixturesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      try {
        const { playerHierarchyMap, playerEmails } = await getPlayerHierarchyMap(db, fs, tournamentId);
        fixtures = enrichFixturesWithHierarchy(fixtures, playerHierarchyMap, playerEmails);
        
        // Enrich consolidated players with hierarchy
        players = players.map(player => {
          const hierarchy = playerHierarchyMap[player.id];
          if (hierarchy) {
            return {
              ...player,
              level1Id: hierarchy.level1Id,
              level1Name: hierarchy.level1Name,
              level2Id: hierarchy.level2Id,
              level2Name: hierarchy.level2Name,
              rootId: hierarchy.rootId,
              rootName: hierarchy.rootName
            };
          }
          return player;
        });
      } catch (innerErr) {
        console.error("Error enriching consolidated fixtures and players with hierarchy:", innerErr);
      }

      // 5. Get Matches
      const matchesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches`));
      const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 6. Get Roots (Hierarchy)
      const rootsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/roots`));
      const roots = rootsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 7. Calculate standings
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
        tournament: tournamentData,
        players,
        groups,
        fixtures,
        matches,
        roots,
        standings
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  function serveStaticProduction(appInstance) {
    const distPath = path.join(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    
    appInstance.use(express.static(distPath));
    
    // Fallback all other routes to index.html for SPA routing
    appInstance.get('*', (req, res) => {
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.status(404).send(`
          <div style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; color: #1e293b;">
            <h1 style="color: #4f46e5; font-size: 36px; font-weight: 900; margin-bottom: 10px;">Frontend Build Not Found</h1>
            <p style="font-size: 16px; color: #64748b; margin-bottom: 30px;">
              The Node.js API server is running perfectly, but the frontend static files have not been built or uploaded yet.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; display: inline-block; text-align: left; max-width: 500px; width: 100%;">
              <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 0;">How to resolve this:</h3>
              <ol style="font-size: 13px; color: #334155; line-height: 1.6; padding-left: 20px;">
                <li>Run <strong>npm run build</strong> on your machine to build the static production files.</li>
                <li>Upload the generated <strong>dist</strong> folder to your Hostinger server (put it next to your <strong>server.js</strong> file).</li>
                <li>Restart your Node.js application from your Hostinger control panel.</li>
              </ol>
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 40px;">Badminton Tournament Manager • Live Server</p>
          </div>
        `);
      }
    });
  }

  // Auto-detect production mode based on folder structure or environment variable
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(__dirname, 'dist'));

  if (isProduction) {
    const distPath = path.join(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      console.log('--- dist/index.html not found in production! Attempting auto-build on Hostinger... ---');
      try {
        const { execSync } = require('child_process');
        execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
        console.log('--- Auto-build completed successfully! ---');
      } catch (buildError) {
        console.error('Auto-build failed or skipped:', buildError.message);
      }
    }
  }

  if (!isProduction) {
    try {
      console.log('Starting server in DEVELOPMENT mode with Vite dev middleware...');
      const { createServer: createViteServer } = require('vite');
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

  // Defensive binding to support both standard ports and Passenger's named pipes/unix sockets on Hostinger
  if (isNaN(PORT)) {
    app.listen(PORT, () => {
      console.log(`Server running on Unix socket/pipe ${PORT}`);
    });
  } else {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  try {
    fs.writeFileSync(path.join(__dirname, 'server-crash.log'), `[${new Date().toISOString()}] SERVER START FAILURE:\n${err.stack || err.message}\n\n`);
  } catch (e) {
    console.error('Failed to write server-crash.log:', e);
  }
  process.exit(1);
});
