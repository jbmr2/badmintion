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

      // Calculate status for each tournament
      const enhancedList = await Promise.all(list.map(async (t) => {
        if (t.status) return t; // Already has explicit status

        try {
          const fixturesSnap = await getDocs(collection(db, `tournaments/${t.id}/fixtures`));
          if (fixturesSnap.empty) {
            return { ...t, status: 'upcoming' };
          }
          const fixtures = fixturesSnap.docs.map(doc => doc.data());
          const total = fixtures.length;
          const completed = fixtures.filter(f => f.status === 'completed').length;
          const live = fixtures.filter(f => f.status === 'live').length;

          let status = 'upcoming';
          if (completed === total && total > 0) {
            status = 'completed';
          } else if (live > 0 || (completed > 0 && completed < total)) {
            status = 'active';
          }
          return { ...t, status };
        } catch (e) {
          console.error(`Error calculating status for tournament ${t.id}:`, e);
          return { ...t, status: 'upcoming' };
        }
      }));

      res.json(enhancedList);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global cache for all consolidated tournaments
  let allConsolidatedCache = {
    data: null,
    timestamp: 0
  };

  // Global cache for calculated master hierarchy
  let masterHierarchyCalcCache = {
    data: null,
    timestamp: 0
  };

  async function fetchConsolidatedPayload(db, fs) {
    const now = Date.now();
    if (allConsolidatedCache.data && (now - allConsolidatedCache.timestamp < 10000)) {
      return allConsolidatedCache.data;
    }

    const { collection, getDocs } = fs;
    // Fetch all tournaments
    const colRef = collection(db, 'tournaments');
    const tournamentsSnap = await getDocs(colRef);
    const tournamentList = tournamentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Concurrently build consolidated data for each tournament
    const consolidatedTournaments = await Promise.all(tournamentList.map(async (t) => {
      const tournamentId = t.id;
      try {
        // 1. Get Players
        const playersSnap = await getDocs(collection(db, `tournaments/${tournamentId}/players`));
        let players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const playerMap = {};
        players.forEach(p => {
          playerMap[p.id] = p.name;
        });

        // 2. Get Groups
        const groupsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/groups`));
        const groups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 3. Get Fixtures
        const fixturesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/fixtures`));
        let fixtures = fixturesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        try {
          const { playerHierarchyMap, playerEmails } = await getPlayerHierarchyMap(db, fs, tournamentId);
          fixtures = enrichFixturesWithHierarchy(fixtures, playerHierarchyMap, playerEmails);
          
          // Enrich players with hierarchy
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
          console.error(`Error enriching for tournament ${tournamentId}:`, innerErr);
        }

        // 4. Get Matches
        const matchesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches`));
        const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 5. Get Roots (Hierarchy)
        const rootsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/roots`));
        const roots = rootsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 6. Calculate standings
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

        const isRoundRobinA = (t.tournamentType || '').toLowerCase().includes('round robin a') || (t.tournamentType || '').toLowerCase().includes('robin a');
        const winPointsValue = t.winPoints !== undefined ? Number(t.winPoints) : 2;
        const lossPointsValue = t.lossPoints !== undefined ? Number(t.lossPoints) : 0;

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

        return {
          id: tournamentId,
          tournament: t,
          players,
          groups,
          fixtures,
          matches,
          roots,
          standings
        };
      } catch (err) {
        console.error(`Failed to load consolidated data for tournament ${tournamentId}:`, err);
        return {
          id: tournamentId,
          tournament: t,
          error: err.message,
          players: [],
          groups: [],
          fixtures: [],
          matches: [],
          roots: [],
          standings: {}
        };
      }
    }));

    // Group them by sport
    const bySport = {
      badminton: [],
      table_tennis: [],
      pickleball: [],
      others: []
    };

    consolidatedTournaments.forEach(item => {
      const sportRaw = (item.tournament.sport || item.tournament.tournamentType || 'badminton').toLowerCase();
      if (sportRaw.includes('badminton')) {
        bySport.badminton.push(item);
      } else if (sportRaw.includes('table_tennis') || sportRaw.includes('table tennis') || sportRaw.includes('tt')) {
        bySport.table_tennis.push(item);
      } else if (sportRaw.includes('pickleball') || sportRaw.includes('pickle')) {
        bySport.pickleball.push(item);
      } else {
        bySport.others.push(item);
      }
    });

    const responsePayload = {
      timestamp: new Date().toISOString(),
      totalTournaments: consolidatedTournaments.length,
      bySport,
      tournaments: consolidatedTournaments
    };

    allConsolidatedCache = {
      data: responsePayload,
      timestamp: now
    };

    return responsePayload;
  }

  // GET all tournaments consolidated (Rosters, Standings, Groups, Fixtures, Matches, Roots) in 1 combined API
  app.get('/api/tournaments/all/consolidated', checkDb, async (req, res) => {
    try {
      const data = await fetchConsolidatedPayload(req.db, req.fs);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET Badminton tournaments consolidated
  app.get(['/api/tournaments/badminton/consolidated', '/api/badminton/master-hierarchy'], checkDb, async (req, res) => {
    try {
      const data = await fetchConsolidatedPayload(req.db, req.fs);
      res.json({
        sport: 'badminton',
        timestamp: data.timestamp,
        totalTournaments: data.bySport.badminton.length,
        tournaments: data.bySport.badminton
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET Table Tennis tournaments consolidated
  app.get(['/api/tournaments/table_tennis/consolidated', '/api/tournaments/table-tennis/consolidated', '/api/table-tennis/master-hierarchy'], checkDb, async (req, res) => {
    try {
      const data = await fetchConsolidatedPayload(req.db, req.fs);
      res.json({
        sport: 'table_tennis',
        timestamp: data.timestamp,
        totalTournaments: data.bySport.table_tennis.length,
        tournaments: data.bySport.table_tennis
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET Pickleball tournaments consolidated
  app.get(['/api/tournaments/pickleball/consolidated', '/api/pickleball/master-hierarchy'], checkDb, async (req, res) => {
    try {
      const data = await fetchConsolidatedPayload(req.db, req.fs);
      res.json({
        sport: 'pickleball',
        timestamp: data.timestamp,
        totalTournaments: data.bySport.pickleball.length,
        tournaments: data.bySport.pickleball
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET complete calculated master hierarchy (roots + level1 + level2) across all 3 games (all tournaments)
  app.get('/api/master-hierarchy', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { collection, getDocs } = fs;
      const now = Date.now();

      // Return cached calculated hierarchy if valid (TTL: 10 seconds)
      if (masterHierarchyCalcCache.data && (now - masterHierarchyCalcCache.timestamp < 10000)) {
        return res.json(masterHierarchyCalcCache.data);
      }

      // 1. Fetch complete master structure
      let roots = [];
      try {
        const rootsSnap = await getDocs(collection(db, 'tournaments/_master_/roots'));
        roots = rootsSnap.docs.map(d => ({ id: d.id, name: (d.data().name || '').trim() }));
      } catch (err) {
        console.error("Error fetching master roots:", err);
      }

      let level1s = [];
      if (roots.length > 0) {
        const level1Promises = roots.map(async (root) => {
          try {
            const level1Snap = await getDocs(collection(db, `tournaments/_master_/roots/${root.id}/level1`));
            return level1Snap.docs.map(d => ({ id: d.id, name: (d.data().name || '').trim(), rootId: root.id }));
          } catch (e) {
            return [];
          }
        });
        const level1sArrays = await Promise.all(level1Promises);
        level1s = level1sArrays.flat();
      }

      let level2s = [];
      if (level1s.length > 0) {
        const level2Promises = level1s.map(async (l1) => {
          try {
            const level2Snap = await getDocs(collection(db, `tournaments/_master_/roots/${l1.rootId}/level1/${l1.id}/level2`));
            return level2Snap.docs.map(d => ({ id: d.id, name: (d.data().name || '').trim(), level1Id: l1.id, rootId: l1.rootId }));
          } catch (e) {
            return [];
          }
        });
        const level2sArrays = await Promise.all(level2Promises);
        level2s = level2sArrays.flat();
      }

      // 2. Fetch all consolidated tournament data
      const consolidated = await fetchConsolidatedPayload(db, fs);
      const tournamentsList = consolidated.tournaments.filter(t => t.id !== '_master_' && t.id !== 'all');

      // 3. Aggregate all matches, fixtures, tournament players, and assigned players
      let allMatches = [];
      let allFixtures = [];
      let allTournamentPlayers = [];
      let allAssignedPlayers = [];

      tournamentsList.forEach(tItem => {
        const tId = tItem.id;
        if (tItem.matches) {
          tItem.matches.forEach(m => {
            allMatches.push({ ...m, tournamentId: tId });
          });
        }
        if (tItem.fixtures) {
          tItem.fixtures.forEach(f => {
            allFixtures.push({ ...f, tournamentId: tId });
          });
        }
        if (tItem.players) {
          tItem.players.forEach(p => {
            allTournamentPlayers.push({ ...p, tournamentId: tId });
            if (p.level2Id) {
              allAssignedPlayers.push({ ...p, tournamentId: tId });
            }
          });
        }
      });

      // Maps for stats
      const chapterStatsMap = {};
      const parentStatsMap = {};
      const rootStatsMap = {};

      // Initialize with canonical master structures
      level2s.forEach(l2 => {
        const parent = level1s.find(l1 => l1.id === l2.level1Id);
        const root = roots.find(r => r.id === l2.rootId);
        
        const rName = (root ? root.name : 'Unknown').trim();
        const pName = (parent ? parent.name : 'Unknown').trim();
        const cName = l2.name.trim();
        
        const key = `${rName}::${pName}::${cName}`.toLowerCase();
        
        if (!chapterStatsMap[key]) {
          chapterStatsMap[key] = {
            id: key, name: cName, parentName: pName, rootName: rName,
            wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, playerCount: 0, points: 0
          };
        }
      });

      level1s.forEach(l1 => {
        const root = roots.find(r => r.id === l1.rootId);
        const rName = (root ? root.name : 'Unknown').trim();
        const pName = l1.name.trim();
        const key = `${rName}::${pName}`.toLowerCase();

        if (!parentStatsMap[key]) {
          parentStatsMap[key] = {
            id: key, name: pName, rootName: rName,
            wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, chapterCount: 0, points: 0
          };
        }
      });

      roots.forEach(r => {
        const rName = r.name.trim();
        const key = rName.toLowerCase();

        if (!rootStatsMap[key]) {
          rootStatsMap[key] = {
            id: key, name: rName,
            wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, parentCount: 0, points: 0
          };
        }
      });

      // Helper to fetch player's Chapter, Parent and Root keys
      const getPlayerLocation = (pId) => {
        const p = allAssignedPlayers.find(item => item.id === pId);
        if (!p) return null;
        
        const l2 = level2s.find(item => item.id === p.level2Id);
        if (!l2) {
          if (p.rootName && p.level1Name && p.level2Name) {
            const rName = p.rootName.trim();
            const pName = p.level1Name.trim();
            const cName = p.level2Name.trim();
            return {
              chapterKey: `${rName}::${pName}::${cName}`.toLowerCase(),
              parentKey: `${rName}::${pName}`.toLowerCase(),
              rootKey: rName.toLowerCase(),
              rName, pName, cName
            };
          }
          return null;
        }
        
        const parent = level1s.find(l1 => l1.id === l2.level1Id);
        const root = roots.find(r => r.id === l2.rootId);

        const rName = (root ? root.name : (p.rootName || 'Unknown')).trim();
        const pName = (parent ? parent.name : (p.level1Name || 'Unknown')).trim();
        const cName = l2.name.trim();

        return {
          chapterKey: `${rName}::${pName}::${cName}`.toLowerCase(),
          parentKey: `${rName}::${pName}`.toLowerCase(),
          rootKey: rName.toLowerCase(),
          rName, pName, cName
        };
      };

      const ensureChapterInit = (key, loc) => {
        if (!chapterStatsMap[key]) {
          chapterStatsMap[key] = {
            id: key, name: loc.cName, parentName: loc.pName, rootName: loc.rName,
            wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, playerCount: 0, points: 0
          };
        }
      };

      const ensureParentInit = (key, loc) => {
        if (!parentStatsMap[key]) {
          parentStatsMap[key] = {
            id: key, name: loc.pName, rootName: loc.rName,
            wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, chapterCount: 0, points: 0
          };
        }
      };

      const ensureRootInit = (key, loc) => {
        if (!rootStatsMap[key]) {
          rootStatsMap[key] = {
            id: key, name: loc.rName,
            wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, parentCount: 0, points: 0
          };
        }
      };

      const playersWithHierarchyBonus = new Set();

      // Accumulate matches
      allMatches.forEach(match => {
        const fixture = allFixtures.find(f => f.id === match.fixtureId);
        if (!fixture) return;

        const team1PlayerIds = [];
        const team2PlayerIds = [];

        const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
        if (isDoublesMatch) {
          if (fixture.player1aId) team1PlayerIds.push(fixture.player1aId);
          if (fixture.player1bId) team1PlayerIds.push(fixture.player1bId);
          if (fixture.player2aId) team2PlayerIds.push(fixture.player2aId);
          if (fixture.player2bId) team2PlayerIds.push(fixture.player2bId);

          if (team1PlayerIds.length === 0 && fixture.player1Id) team1PlayerIds.push(fixture.player1Id);
          if (team2PlayerIds.length === 0 && fixture.player2Id) team2PlayerIds.push(fixture.player2Id);
        } else {
          if (fixture.player1Id) team1PlayerIds.push(fixture.player1Id);
          if (fixture.player2Id) team2PlayerIds.push(fixture.player2Id);
        }

        const s = match.scores || {};

        let belongsToFamilyOrKids = false;
        const allMatchPlayerIds = [...team1PlayerIds, ...team2PlayerIds];
        for (const pId of allMatchPlayerIds) {
          const loc = getPlayerLocation(pId);
          if (loc) {
            const rLower = loc.rName.toLowerCase();
            const pLower = loc.pName.toLowerCase();
            const cLower = loc.cName.toLowerCase();
            if (
              rLower.includes('family') || rLower.includes('kids') || rLower.includes('kid') ||
              pLower.includes('family') || pLower.includes('kids') || pLower.includes('kid') ||
              cLower.includes('family') || cLower.includes('kids') || cLower.includes('kid')
            ) {
              belongsToFamilyOrKids = true;
              break;
            }
          }
        }

        const tId = fixture.tournamentId;
        const tItem = tournamentsList.find(x => x.id === tId);
        const tDoc = tItem ? tItem.tournament : null;
        const isTournamentFamilyOrKids = !!(
          tDoc?.name?.toLowerCase().includes('family') ||
          tDoc?.name?.toLowerCase().includes('kids') ||
          tDoc?.name?.toLowerCase().includes('kid') ||
          (tDoc?.categories && Array.isArray(tDoc.categories) && tDoc.categories.some(cat => 
            cat.toLowerCase().includes('family') || cat.toLowerCase().includes('kids') || cat.toLowerCase().includes('kid')
          ))
        );

        const isFamilyCategory = 
          fixture.groupName?.toLowerCase().includes('family') || 
          fixture.groupName?.toLowerCase().includes('kids') || 
          belongsToFamilyOrKids ||
          isTournamentFamilyOrKids;

        // Get match win points based on stage
        const stage = (fixture.matchType || 'league').toLowerCase();
        let matchWinPoints = 5;
        if (stage.includes('pre_quarter') || stage.includes('pre-quarter') || stage.includes('pre quarter')) matchWinPoints = 5;
        else if (stage.includes('quarter') || stage.includes('quater')) matchWinPoints = 10;
        else if (stage.includes('semi')) matchWinPoints = 15;
        else if (stage.includes('final')) matchWinPoints = 25;

        const team1Chapters = new Set();
        const team1Parents = new Set();
        const team1Roots = new Set();

        team1PlayerIds.forEach(pId => {
          const loc = getPlayerLocation(pId);
          if (loc) {
            if (loc.chapterKey) team1Chapters.add(loc.chapterKey);
            if (loc.parentKey) team1Parents.add(loc.parentKey);
            if (loc.rootKey) team1Roots.add(loc.rootKey);
          }
        });

        const team2Chapters = new Set();
        const team2Parents = new Set();
        const team2Roots = new Set();

        team2PlayerIds.forEach(pId => {
          const loc = getPlayerLocation(pId);
          if (loc) {
            if (loc.chapterKey) team2Chapters.add(loc.chapterKey);
            if (loc.parentKey) team2Parents.add(loc.parentKey);
            if (loc.rootKey) team2Roots.add(loc.rootKey);
          }
        });

        // Update Team 1 Chapter, Parent and Root Stats
        team1Chapters.forEach(chKey => {
          const loc = getPlayerLocation(team1PlayerIds[0]);
          ensureChapterInit(chKey, loc);
          if (match.winner === 'player1') {
            chapterStatsMap[chKey].wins++;
            chapterStatsMap[chKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player2') {
            chapterStatsMap[chKey].losses++;
          }
          chapterStatsMap[chKey].gamesWon += Number(match.p1Games || 0);
          chapterStatsMap[chKey].gamesLost += Number(match.p2Games || 0);
          chapterStatsMap[chKey].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
          chapterStatsMap[chKey].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        });

        team1Parents.forEach(pKey => {
          const loc = getPlayerLocation(team1PlayerIds[0]);
          ensureParentInit(pKey, loc);
          if (match.winner === 'player1') {
            parentStatsMap[pKey].wins++;
            parentStatsMap[pKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player2') {
            parentStatsMap[pKey].losses++;
          }
          parentStatsMap[pKey].gamesWon += Number(match.p1Games || 0);
          parentStatsMap[pKey].gamesLost += Number(match.p2Games || 0);
          parentStatsMap[pKey].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
          parentStatsMap[pKey].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        });

        team1Roots.forEach(rKey => {
          const loc = getPlayerLocation(team1PlayerIds[0]);
          ensureRootInit(rKey, loc);
          if (match.winner === 'player1') {
            rootStatsMap[rKey].wins++;
            rootStatsMap[rKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player2') {
            rootStatsMap[rKey].losses++;
          }
          rootStatsMap[rKey].gamesWon += Number(match.p1Games || 0);
          rootStatsMap[rKey].gamesLost += Number(match.p2Games || 0);
          rootStatsMap[rKey].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
          rootStatsMap[rKey].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        });

        // Update Team 2 Chapter, Parent and Root Stats
        team2Chapters.forEach(chKey => {
          const loc = getPlayerLocation(team2PlayerIds[0]);
          ensureChapterInit(chKey, loc);
          if (match.winner === 'player2') {
            chapterStatsMap[chKey].wins++;
            chapterStatsMap[chKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player1') {
            chapterStatsMap[chKey].losses++;
          }
          chapterStatsMap[chKey].gamesWon += Number(match.p2Games || 0);
          chapterStatsMap[chKey].gamesLost += Number(match.p1Games || 0);
          chapterStatsMap[chKey].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
          chapterStatsMap[chKey].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        });

        team2Parents.forEach(pKey => {
          const loc = getPlayerLocation(team2PlayerIds[0]);
          ensureParentInit(pKey, loc);
          if (match.winner === 'player2') {
            parentStatsMap[pKey].wins++;
            parentStatsMap[pKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player1') {
            parentStatsMap[pKey].losses++;
          }
          parentStatsMap[pKey].gamesWon += Number(match.p2Games || 0);
          parentStatsMap[pKey].gamesLost += Number(match.p1Games || 0);
          parentStatsMap[pKey].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
          parentStatsMap[pKey].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        });

        team2Roots.forEach(rKey => {
          const loc = getPlayerLocation(team2PlayerIds[0]);
          ensureRootInit(rKey, loc);
          if (match.winner === 'player2') {
            rootStatsMap[rKey].wins++;
            rootStatsMap[rKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player1') {
            rootStatsMap[rKey].losses++;
          }
          rootStatsMap[rKey].gamesWon += Number(match.p2Games || 0);
          rootStatsMap[rKey].gamesLost += Number(match.p1Games || 0);
          rootStatsMap[rKey].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
          rootStatsMap[rKey].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        });

        const isPlayerFemale = (pId, groupName) => {
          const p = allTournamentPlayers.find(x => x.id === pId);
          if (p?.gender === 'Female' || p?.gender?.toLowerCase() === 'female') {
            return true;
          }
          const gLower = (groupName || '').toLowerCase();
          if ((gLower.includes('women') || gLower.includes('female')) && !gLower.includes('mixed') && !gLower.includes('open')) {
            return true;
          }
          return false;
        };

        // Award female player bonus points (+5 points flat for 1st match played) to chapter/parent/root
        if (!isFamilyCategory) {
          team1PlayerIds.forEach(pId => {
            const bonusKey = `${tId}::${pId}`;
            if (isPlayerFemale(pId, fixture.groupName) && !playersWithHierarchyBonus.has(bonusKey)) {
              playersWithHierarchyBonus.add(bonusKey);
              const loc = getPlayerLocation(pId);
              if (loc) {
                if (loc.chapterKey) {
                  ensureChapterInit(loc.chapterKey, loc);
                  chapterStatsMap[loc.chapterKey].points += 5;
                }
                if (loc.parentKey) {
                  ensureParentInit(loc.parentKey, loc);
                  parentStatsMap[loc.parentKey].points += 5;
                }
                if (loc.rootKey) {
                  ensureRootInit(loc.rootKey, loc);
                  rootStatsMap[loc.rootKey].points += 5;
                }
              }
            }
          });

          team2PlayerIds.forEach(pId => {
            const bonusKey = `${tId}::${pId}`;
            if (isPlayerFemale(pId, fixture.groupName) && !playersWithHierarchyBonus.has(bonusKey)) {
              playersWithHierarchyBonus.add(bonusKey);
              const loc = getPlayerLocation(pId);
              if (loc) {
                if (loc.chapterKey) {
                  ensureChapterInit(loc.chapterKey, loc);
                  chapterStatsMap[loc.chapterKey].points += 5;
                }
                if (loc.parentKey) {
                  ensureParentInit(loc.parentKey, loc);
                  parentStatsMap[loc.parentKey].points += 5;
                }
                if (loc.rootKey) {
                  ensureRootInit(loc.rootKey, loc);
                  rootStatsMap[loc.rootKey].points += 5;
                }
              }
            }
          });
        }
      });

      // Calculate player counts
      const chapterPlayersSet = {};
      allAssignedPlayers.forEach(p => {
        const loc = getPlayerLocation(p.id);
        if (loc && loc.chapterKey) {
          if (!chapterPlayersSet[loc.chapterKey]) {
            chapterPlayersSet[loc.chapterKey] = new Set();
          }
          chapterPlayersSet[loc.chapterKey].add(p.id);
        }
      });

      Object.keys(chapterStatsMap).forEach(key => {
        chapterStatsMap[key].playerCount = chapterPlayersSet[key] ? chapterPlayersSet[key].size : 0;
      });

      // Calculate chapter counts per parent
      const parentChaptersSet = {};
      Object.keys(chapterStatsMap).forEach(chKey => {
        const ch = chapterStatsMap[chKey];
        const pKey = `${ch.rootName}::${ch.parentName}`.toLowerCase();
        if (!parentChaptersSet[pKey]) {
          parentChaptersSet[pKey] = new Set();
        }
        parentChaptersSet[pKey].add(chKey);
      });

      Object.keys(parentStatsMap).forEach(key => {
        parentStatsMap[key].chapterCount = parentChaptersSet[key] ? parentChaptersSet[key].size : 0;
      });

      // Calculate parent counts per root
      const rootParentsSet = {};
      Object.keys(parentStatsMap).forEach(pKey => {
        const p = parentStatsMap[pKey];
        const rKey = p.rootName.toLowerCase();
        if (!rootParentsSet[rKey]) {
          rootParentsSet[rKey] = new Set();
        }
        rootParentsSet[rKey].add(pKey);
      });

      Object.keys(rootStatsMap).forEach(key => {
        rootStatsMap[key].parentCount = rootParentsSet[key] ? rootParentsSet[key].size : 0;
      });

      // Sort lists
      const sortStatsList = (list) => {
        return [...list].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.wins !== a.wins) return b.wins - a.wins;

          const aGD = a.gamesWon - a.gamesLost;
          const bGD = b.gamesWon - b.gamesLost;
          if (bGD !== aGD) return bGD - aGD;

          const aPD = a.pointsScored - a.pointsAgainst;
          const bPD = b.pointsScored - b.pointsAgainst;
          if (bPD !== aPD) return bPD - aPD;

          return a.name.localeCompare(b.name);
        });
      };

      const finalResponse = {
        timestamp: new Date().toISOString(),
        roots: sortStatsList(Object.values(rootStatsMap)),
        parents: sortStatsList(Object.values(parentStatsMap)),
        chapters: sortStatsList(Object.values(chapterStatsMap))
      };

      // Store in cache
      masterHierarchyCalcCache = {
        data: finalResponse,
        timestamp: now
      };

      res.json(finalResponse);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET specific tournament details
  app.get('/api/tournaments/:tournamentId', checkDb, async (req, res) => {
    try {
      const { db, fs } = req;
      const { doc, getDoc, collection, getDocs } = fs;
      const { tournamentId } = req.params;
      const docRef = doc(db, 'tournaments', tournamentId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      
      const t = { id: snap.id, ...snap.data() };
      if (t.status) {
        return res.json(t);
      }

      // Calculate dynamic status based on fixtures
      let status = 'upcoming';
      try {
        const fixturesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/fixtures`));
        if (!fixturesSnap.empty) {
          const fixtures = fixturesSnap.docs.map(doc => doc.data());
          const total = fixtures.length;
          const completed = fixtures.filter(f => f.status === 'completed').length;
          const live = fixtures.filter(f => f.status === 'live').length;

          if (completed === total && total > 0) {
            status = 'completed';
          } else if (live > 0 || (completed > 0 && completed < total)) {
            status = 'active';
          }
        }
      } catch (e) {
        console.error(`Error calculating status for specific tournament ${tournamentId}:`, e);
      }

      res.json({ ...t, status });
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
          const [playersListSnap, rootsSnap, globalPlayersSnap] = await Promise.all([
            getDocs(collection(db, `tournaments/${tournamentId}/players`)),
            getDocs(collection(db, `tournaments/${tournamentId}/roots`)),
            getDocs(collection(db, 'players')).catch(() => null)
          ]);

          const globalEmailsByMobile = {};
          if (globalPlayersSnap) {
            globalPlayersSnap.docs.forEach(gpDoc => {
              const gpData = gpDoc.data();
              if (gpData && gpData.mobile && gpData.email) {
                globalEmailsByMobile[gpData.mobile] = gpData.email;
              }
            });
          }

          playersListSnap.docs.forEach(pDoc => {
            const pData = pDoc.data();
            if (pData) {
              let email = pData.email || '';
              if (!email && pData.mobile && globalEmailsByMobile[pData.mobile]) {
                email = globalEmailsByMobile[pData.mobile];
              }
              playerEmails[pDoc.id] = email;
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

      // Calculate Winner Key, Name, and IDs
      let winnerKey = null;
      if (f.status === 'completed') {
        if (f.walkoverWinner) {
          winnerKey = f.walkoverWinner;
        } else if (f.scores) {
          const s = f.scores;
          let p1Games = 0;
          let p2Games = 0;

          if ((s.p1g1 !== undefined && s.p2g1 !== undefined) && (s.p1g1 > 0 || s.p2g1 > 0)) {
            if (s.p1g1 > s.p2g1) p1Games++;
            else if (s.p2g1 > s.p1g1) p2Games++;
          }
          if ((s.p1g2 !== undefined && s.p2g2 !== undefined) && (s.p1g2 > 0 || s.p2g2 > 0)) {
            if (s.p1g2 > s.p2g2) p1Games++;
            else if (s.p2g2 > s.p1g2) p2Games++;
          }
          if ((s.p1g3 !== undefined && s.p2g3 !== undefined) && (s.p1g3 > 0 || s.p2g3 > 0)) {
            if (s.p1g3 > s.p2g3) p1Games++;
            else if (s.p2g3 > s.p1g3) p2Games++;
          }

          if (p1Games > p2Games) {
            winnerKey = 'player1';
          } else if (p2Games > p1Games) {
            winnerKey = 'player2';
          }
        }
      }

      if (winnerKey) {
        enriched.winnerKey = winnerKey;
        const isDoubles = !!(f.isDoubles || f.player1aId || f.player1bId || f.player2aId || f.player2bId);
        if (isDoubles) {
          if (winnerKey === 'player1') {
            enriched.winnerId = f.player1aId || '';
            enriched.winner1Id = f.player1aId || '';
            enriched.winner2Id = f.player1bId || '';
            enriched.winnerIds = [f.player1aId, f.player1bId].filter(Boolean);
            enriched.winnerName = f.player1bName ? `${f.player1aName} & ${f.player1bName}` : (f.player1aName || '');
          } else {
            enriched.winnerId = f.player2aId || '';
            enriched.winner1Id = f.player2aId || '';
            enriched.winner2Id = f.player2bId || '';
            enriched.winnerIds = [f.player2aId, f.player2bId].filter(Boolean);
            enriched.winnerName = f.player2bName ? `${f.player2aName} & ${f.player2bName}` : (f.player2aName || '');
          }
        } else {
          if (winnerKey === 'player1') {
            enriched.winnerId = f.player1Id || '';
            enriched.winnerIds = [f.player1Id].filter(Boolean);
            enriched.winnerName = f.player1Name || '';
          } else {
            enriched.winnerId = f.player2Id || '';
            enriched.winnerIds = [f.player2Id].filter(Boolean);
            enriched.winnerName = f.player2Name || '';
          }
        }
      } else {
        enriched.winnerKey = null;
        enriched.winnerId = null;
        enriched.winnerName = null;
        enriched.winnerIds = [];
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
