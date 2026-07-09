import { useState, useEffect, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, writeBatch, increment } from 'firebase/firestore';
import { 
  Trophy, 
  Users, 
  Sparkles, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Award, 
  Activity, 
  Play, 
  Clock, 
  Check, 
  HelpCircle,
  TrendingUp,
  AlertCircle,
  Flame,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PlayerMatchesModal from './PlayerMatchesModal';

const getGroupOrderWeight = (name: string): number => {
  const n = name.toLowerCase().trim();
  if (n.includes('final') && !n.includes('semi') && !n.includes('quarter')) return 100;
  if (n.includes('semi')) return 90;
  if (n.includes('quarter') && !n.includes('pre')) return 80;
  if (n.includes('pre_quarter') || n.includes('pre-quarter') || n.includes('pre quarter')) return 70;
  
  // Try to match standard "group X" or "X group"
  const match = n.match(/group\s+([a-z0-9]+)/) || n.match(/([a-z0-9]+)\s+group/);
  if (match) {
    const code = match[1];
    const num = parseInt(code, 10);
    if (!isNaN(num)) {
      return 10 + num;
    }
    const charCode = code.charCodeAt(0);
    if (charCode >= 97 && charCode <= 122) { // a-z
      return 10 + (charCode - 97);
    }
  }
  
  if (n.includes('group')) {
    return 19;
  }
  return 50;
};

interface StandingPlayer {
  playerId: string;
  partnerId?: string;
  playerName: string;
  played: number;
  wins: number;
  losses: number;
  matchPoints: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  pointsScored: number;
  pointsAgainst: number;
  pointDiff: number;
}

export default function PointsTable({ 
  tournamentId, 
  userRole = 'user' 
}: { 
  tournamentId: string; 
  userRole?: 'admin' | 'scorer' | 'user'; 
}) {
  const canEdit = userRole === 'admin' || userRole === 'scorer';
  const [matches, setMatches] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [tournament, setTournament] = useState<any | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'standings' | 'brackets' | 'schedule' | 'leaderboards'>('standings');
  const [fixtureToDelete, setFixtureToDelete] = useState<any | null>(null);
  const [selectedPlayerForMatches, setSelectedPlayerForMatches] = useState<{ id: string; name: string } | null>(null);

  // States for Interactive Visual Brackets & Player Leaderboards
  const bracketContainerRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Array<{ path: string; isCompleted: boolean }>>([]);
  const [leaderboardSort, setLeaderboardSort] = useState<'pointsScored' | 'longestStreak' | 'pointDiff' | 'winRate'>('pointsScored');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');

  const isPlayerFemale = (pId?: string, groupName?: string): boolean => {
    if (!pId) return false;
    const p = players.find(x => x.id === pId);
    if (p?.gender === 'Female' || p?.gender?.toLowerCase() === 'female') {
      return true;
    }
    const gLower = (groupName || '').toLowerCase();
    if ((gLower.includes('women') || gLower.includes('female')) && !gLower.includes('mixed') && !gLower.includes('open')) {
      return true;
    }
    return false;
  };

  const safeConfirm = (msg: string): boolean => {
    try {
      return window.confirm(msg);
    } catch (e) {
      console.warn("window.confirm was blocked, auto-confirming:", e);
      return true;
    }
  };

  const alert = (msg: string) => {
    try {
      window.alert(msg);
    } catch (e) {
      console.warn("window.alert was blocked:", e);
    }
  };

  // Compile unique pairs from players for manual doubles seeding
  const registeredPairs: Array<{ id: string; name: string; pA: any; pB: any }> = [];
  const pairMapAccumulator = new Map<string, any[]>();
  players.forEach(p => {
    if (p.pairId) {
      if (!pairMapAccumulator.has(p.pairId)) {
        pairMapAccumulator.set(p.pairId, []);
      }
      pairMapAccumulator.get(p.pairId)!.push(p);
    }
  });
  pairMapAccumulator.forEach((pts, pid) => {
    if (pts.length >= 1) {
      const pA = pts[0];
      const pB = pts[1] || { id: '', name: 'No Partner' };
      registeredPairs.push({
        id: pid,
        name: pB.id ? `${pA.name} & ${pB.name}` : pA.name,
        pA,
        pB
      });
    }
  });

  // Hierarchy tracking states for L2 Data
  const [roots, setRoots] = useState<any[]>([]);
  const [allRootsLevel1, setAllRootsLevel1] = useState<any[]>([]);
  const [allRootsLevel2, setAllRootsLevel2] = useState<any[]>([]);
  const [rawRootsPlayers, setRawRootsPlayers] = useState<any[]>([]);

  const isStructureMaster = tournamentId !== '_master_' && (roots.length === 0 || roots.some(r => r.isMasterFallback));
  const structureTournamentId = isStructureMaster ? '_master_' : tournamentId;

  const allRootsPlayers = useMemo(() => {
    const level1Map = new Map(allRootsLevel1.map(l1 => [l1.id, l1]));
    const level2Map = new Map(allRootsLevel2.map(l2 => [l2.id, l2]));
    const rootMap = new Map(roots.map(r => [r.id, r]));

    return rawRootsPlayers.map(ap => {
      const l2 = level2Map.get(ap.level2Id) as any;
      const l1 = level1Map.get(ap.level1Id || (l2 ? l2.level1Id : '')) as any;
      const r = rootMap.get(ap.rootId || (l1 ? l1.rootId : '')) as any;
      return {
        ...ap,
        level2Name: l2 ? l2.name : ap.level2Name,
        level1Name: l1 ? l1.name : ap.level1Name,
        rootName: r ? r.name : ap.rootName,
      };
    });
  }, [rawRootsPlayers, allRootsLevel2, allRootsLevel1, roots]);

  // Manual scheduling state
  const [selectedP1, setSelectedP1] = useState('');
  const [selectedP2, setSelectedP2] = useState('');
  const [selectedStage, setSelectedStage] = useState<'pre_quarter' | 'quarter' | 'semi' | 'final'>('quarter');
  const [pointsTarget, setPointsTarget] = useState('21');

  // Manual doubles bracket states
  const [manualIsDoubles, setManualIsDoubles] = useState(false);
  const [selectedPair1, setSelectedPair1] = useState('');
  const [selectedPair2, setSelectedPair2] = useState('');
  const [selectedP1a, setSelectedP1a] = useState('');
  const [selectedP1b, setSelectedP1b] = useState('');
  const [selectedP2a, setSelectedP2a] = useState('');
  const [selectedP2b, setSelectedP2b] = useState('');
  const [doublesSelectionMode, setDoublesSelectionMode] = useState<'pair' | 'custom'>('pair');

  // Fetch roots, level1s, level2s, and players assignments for L2 Data
  useEffect(() => {
    if (!tournamentId) return;
    const qRoots = query(collection(db, `tournaments/${tournamentId}/roots`));
    const unsubscribeRoots = onSnapshot(qRoots, (snapshot) => {
      if (snapshot.empty && tournamentId !== '_master_') {
        const qMasterRoots = query(collection(db, `tournaments/_master_/roots`));
        const unsubscribeMasterRoots = onSnapshot(qMasterRoots, (masterSnap) => {
          setRoots(masterSnap.docs.map(d => ({ id: d.id, isMasterFallback: true, ...d.data() })));
        }, (e) => console.error("Error fetching master roots in PointsTable:", e));
        return () => unsubscribeMasterRoots();
      } else {
        setRoots(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    }, (e) => console.error("Error fetching roots in PointsTable:", e));
    return () => unsubscribeRoots();
  }, [tournamentId]);

  useEffect(() => {
    if (roots.length === 0 || !structureTournamentId) {
      setAllRootsLevel1([]);
      return;
    }
    const unsubscribes = roots.map(root => {
      const q = query(collection(db, `tournaments/${structureTournamentId}/roots/${root.id}/level1`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsLevel1(prev => {
          const filtered = prev.filter(item => item.rootId !== root.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, rootId: root.id, rootName: root.name, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching level1s in PointsTable:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [roots, structureTournamentId]);

  useEffect(() => {
    if (allRootsLevel1.length === 0 || !structureTournamentId) {
      setAllRootsLevel2([]);
      return;
    }
    const unsubscribes = allRootsLevel1.map(l1 => {
      const q = query(collection(db, `tournaments/${structureTournamentId}/roots/${l1.rootId}/level1/${l1.id}/level2`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsLevel2(prev => {
          const filtered = prev.filter(item => item.level1Id !== l1.id);
          const newItems = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            level1Id: l1.id, 
            level1Name: l1.name,
            rootId: l1.rootId, 
            rootName: l1.rootName,
            ...doc.data() 
          }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching level2s in PointsTable:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel1, structureTournamentId]);

  useEffect(() => {
    if (allRootsLevel2.length === 0 || !tournamentId) {
      setRawRootsPlayers([]);
      return;
    }
    const unsubscribes = allRootsLevel2.map(l2 => {
      const q = query(collection(db, `tournaments/${tournamentId}/roots/${l2.rootId}/level1/${l2.level1Id}/level2/${l2.id}/players`));
      return onSnapshot(q, (snapshot) => {
        setRawRootsPlayers(prev => {
          const filtered = prev.filter(item => item.level2Id !== l2.id);
          const newItems = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            level2Id: l2.id, 
            level2Name: l2.name,
            level1Id: l2.level1Id, 
            level1Name: l2.level1Name,
            rootId: l2.rootId, 
            rootName: l2.rootName,
            ...doc.data() 
          }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching assigned players in PointsTable:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel2, tournamentId]);

  useEffect(() => {
    const qMatches = query(collection(db, `tournaments/${tournamentId}/matches`));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
        setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    const qFixtures = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribeFixtures = onSnapshot(qFixtures, (snapshot) => {
        setFixtures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qGroups = query(collection(db, `tournaments/${tournamentId}/groups`));
    const unsubscribeGroups = onSnapshot(qGroups, (snapshot) => {
        const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        const uniqueGroups: any[] = [];
        const seenNames = new Set<string>();
        fetchedGroups.forEach(g => {
          const nameLower = (g.name || '').trim().toLowerCase();
          if (nameLower && !seenNames.has(nameLower)) {
            seenNames.add(nameLower);
            uniqueGroups.push({
              id: g.id,
              name: g.name,
              playerIds: g.playerIds || []
            });
          } else if (nameLower) {
            // Merge playerIds to keep standings accurate
            const existing = uniqueGroups.find(x => x.name.trim().toLowerCase() === nameLower);
            if (existing) {
              existing.playerIds = Array.from(new Set([
                ...(existing.playerIds || []),
                ...(g.playerIds || [])
              ]));
            }
          }
        });
        const sortedUniqueGroups = uniqueGroups.sort((a, b) => {
          const wA = getGroupOrderWeight(a.name);
          const wB = getGroupOrderWeight(b.name);
          if (wA !== wB) return wA - wB;
          return a.name.localeCompare(b.name);
        });
        setGroups(sortedUniqueGroups);
    });

    const qPlayers = query(collection(db, `tournaments/${tournamentId}/players`));
    const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
        setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeTournament = onSnapshot(doc(db, 'tournaments', tournamentId), (snapshot) => {
        if (snapshot.exists()) {
          setTournament({ id: snapshot.id, ...snapshot.data() });
        }
    });

    return () => {
        unsubscribeMatches();
        unsubscribeFixtures();
        unsubscribeGroups();
        unsubscribePlayers();
        unsubscribeTournament();
    };
  }, [tournamentId]);

  const playerMap = Object.fromEntries(players.map(p => [p.id, p.name]));
  const playerL1Map = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level1Name]));
  const playerL2Map = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level2Name]));
  const playerRootMap = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.rootName]));

  const hierarchyStats = useMemo(() => {
    const parentStatsMap: Record<string, { wins: number; losses: number; points: number }> = {};
    const rootStatsMap: Record<string, { wins: number; losses: number; points: number }> = {};

    // Initialize all parent names and root names
    allRootsLevel1.forEach(l1 => {
      if (l1.name) {
        parentStatsMap[l1.name] = { wins: 0, losses: 0, points: 0 };
      }
    });
    roots.forEach(r => {
      if (r.name) {
        rootStatsMap[r.name] = { wins: 0, losses: 0, points: 0 };
      }
    });

    matches.forEach(match => {
      const fixture = fixtures.find(f => f.id === match.fixtureId);
      if (!fixture) return;

      const team1PlayerIds: string[] = [];
      const team2PlayerIds: string[] = [];

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

      // Check if family/kids category (to ignore for points)
      let belongsToFamilyOrKids = false;
      const allMatchPlayerIds = [...team1PlayerIds, ...team2PlayerIds];
      for (const pId of allMatchPlayerIds) {
        const p = allRootsPlayers.find(item => item.id === pId);
        if (p) {
          const rName = p.rootName?.toLowerCase() || '';
          const pName = p.level1Name?.toLowerCase() || '';
          const cName = p.level2Name?.toLowerCase() || '';

          if (
            rName.includes('family') || rName.includes('kids') || rName.includes('kid') ||
            pName.includes('family') || pName.includes('kids') || pName.includes('kid') ||
            cName.includes('family') || cName.includes('kids') || cName.includes('kid')
          ) {
            belongsToFamilyOrKids = true;
            break;
          }
        }
      }

      const isTournamentFamilyOrKids = !!(
        tournament?.name?.toLowerCase().includes('family') ||
        tournament?.name?.toLowerCase().includes('kids') ||
        tournament?.name?.toLowerCase().includes('kid') ||
        (tournament?.categories && Array.isArray(tournament.categories) && tournament.categories.some((cat: string) => 
          cat.toLowerCase().includes('family') || cat.toLowerCase().includes('kids') || cat.toLowerCase().includes('kid')
        ))
      );

      const isFamilyCategory = 
        fixture.groupName?.toLowerCase().includes('family') || 
        fixture.groupName?.toLowerCase().includes('kids') || 
        belongsToFamilyOrKids ||
        isTournamentFamilyOrKids;

      // Win points delta
      const t = fixture.matchType?.toLowerCase() || 'league';
      let matchWinPoints = 5;
      if (t.includes('pre_quarter') || t.includes('pre-quarter') || t.includes('pre quarter')) matchWinPoints = 5;
      else if (t.includes('quarter') || t.includes('quater')) matchWinPoints = 10;
      else if (t.includes('semi')) matchWinPoints = 15;
      else if (t.includes('final')) matchWinPoints = 25;

      const team1Parents = new Set<string>();
      const team1Roots = new Set<string>();
      team1PlayerIds.forEach(pId => {
        const pLoc = allRootsPlayers.find(item => item.id === pId);
        if (pLoc) {
          if (pLoc.level1Name) team1Parents.add(pLoc.level1Name);
          if (pLoc.rootName) team1Roots.add(pLoc.rootName);
        }
      });

      const team2Parents = new Set<string>();
      const team2Roots = new Set<string>();
      team2PlayerIds.forEach(pId => {
        const pLoc = allRootsPlayers.find(item => item.id === pId);
        if (pLoc) {
          if (pLoc.level1Name) team2Parents.add(pLoc.level1Name);
          if (pLoc.rootName) team2Roots.add(pLoc.rootName);
        }
      });

      // Update Parent Team stats
      team1Parents.forEach(pName => {
        if (!parentStatsMap[pName]) parentStatsMap[pName] = { wins: 0, losses: 0, points: 0 };
        if (match.winner === 'player1') {
          parentStatsMap[pName].wins++;
          parentStatsMap[pName].points += isFamilyCategory ? 0 : matchWinPoints;
        } else if (match.winner === 'player2') {
          parentStatsMap[pName].losses++;
        }
      });

      team2Parents.forEach(pName => {
        if (!parentStatsMap[pName]) parentStatsMap[pName] = { wins: 0, losses: 0, points: 0 };
        if (match.winner === 'player2') {
          parentStatsMap[pName].wins++;
          parentStatsMap[pName].points += isFamilyCategory ? 0 : matchWinPoints;
        } else if (match.winner === 'player1') {
          parentStatsMap[pName].losses++;
        }
      });

      // Update Root stats
      team1Roots.forEach(rName => {
        if (!rootStatsMap[rName]) rootStatsMap[rName] = { wins: 0, losses: 0, points: 0 };
        if (match.winner === 'player1') {
          rootStatsMap[rName].wins++;
          rootStatsMap[rName].points += isFamilyCategory ? 0 : matchWinPoints;
        } else if (match.winner === 'player2') {
          rootStatsMap[rName].losses++;
        }
      });

      team2Roots.forEach(rName => {
        if (!rootStatsMap[rName]) rootStatsMap[rName] = { wins: 0, losses: 0, points: 0 };
        if (match.winner === 'player2') {
          rootStatsMap[rName].wins++;
          rootStatsMap[rName].points += isFamilyCategory ? 0 : matchWinPoints;
        } else if (match.winner === 'player1') {
          rootStatsMap[rName].losses++;
        }
      });
    });

    // Add female player bonus points (+5 points flat for 1st match played) to parent/root
    const playersWithHierarchyBonus = new Set<string>();
    fixtures.forEach(fixture => {
      const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
      const team1PlayerIds: string[] = [];
      const team2PlayerIds: string[] = [];
      if (isDoublesMatch) {
        if (fixture.player1aId) team1PlayerIds.push(fixture.player1aId);
        if (fixture.player1bId) team1PlayerIds.push(fixture.player1bId);
        if (fixture.player2aId) team2PlayerIds.push(fixture.player2aId);
        if (fixture.player2bId) team2PlayerIds.push(fixture.player2bId);
      } else {
        if (fixture.player1Id) team1PlayerIds.push(fixture.player1Id);
        if (fixture.player2Id) team2PlayerIds.push(fixture.player2Id);
      }

      let belongsToFamilyOrKids = false;
      const allMatchPlayerIds = [...team1PlayerIds, ...team2PlayerIds];
      for (const pId of allMatchPlayerIds) {
        const p = allRootsPlayers.find(item => item.id === pId);
        if (p) {
          const rName = p.rootName?.toLowerCase() || '';
          const pName = p.level1Name?.toLowerCase() || '';
          const cName = p.level2Name?.toLowerCase() || '';
          if (
            rName.includes('family') || rName.includes('kids') || rName.includes('kid') ||
            pName.includes('family') || pName.includes('kids') || pName.includes('kid') ||
            cName.includes('family') || cName.includes('kids') || cName.includes('kid')
          ) {
            belongsToFamilyOrKids = true;
            break;
          }
        }
      }

      const isTournamentFamilyOrKids = !!(
        tournament?.name?.toLowerCase().includes('family') ||
        tournament?.name?.toLowerCase().includes('kids') ||
        tournament?.name?.toLowerCase().includes('kid') ||
        (tournament?.categories && Array.isArray(tournament.categories) && tournament.categories.some((cat: string) => 
          cat.toLowerCase().includes('family') || cat.toLowerCase().includes('kids') || cat.toLowerCase().includes('kid')
        ))
      );

      const isFamilyCategory = 
        fixture.groupName?.toLowerCase().includes('family') || 
        fixture.groupName?.toLowerCase().includes('kids') || 
        belongsToFamilyOrKids ||
        isTournamentFamilyOrKids;

      if (!isFamilyCategory) {
        const allPlayerIds = [...team1PlayerIds, ...team2PlayerIds];
        allPlayerIds.forEach(pId => {
          const playedAny = matches.some(m => m.fixtureId === fixture.id);
          if (playedAny && isPlayerFemale(pId, fixture.groupName) && !playersWithHierarchyBonus.has(pId)) {
            playersWithHierarchyBonus.add(pId);
            const pLoc = allRootsPlayers.find(item => item.id === pId);
            if (pLoc) {
              if (pLoc.level1Name) {
                if (!parentStatsMap[pLoc.level1Name]) parentStatsMap[pLoc.level1Name] = { wins: 0, losses: 0, points: 0 };
                parentStatsMap[pLoc.level1Name].points += 5;
              }
              if (pLoc.rootName) {
                if (!rootStatsMap[pLoc.rootName]) rootStatsMap[pLoc.rootName] = { wins: 0, losses: 0, points: 0 };
                rootStatsMap[pLoc.rootName].points += 5;
              }
            }
          }
        });
      }
    });

    return { parentStatsMap, rootStatsMap };
  }, [matches, fixtures, allRootsPlayers, roots, allRootsLevel1, tournament]);

  const sortedParentTeams = useMemo(() => {
    return Object.entries(hierarchyStats.parentStatsMap).map(([name, stats]) => {
      const playerWithTeam = allRootsPlayers.find(p => p.level1Name === name);
      const rootName = playerWithTeam ? playerWithTeam.rootName : 'Unknown';
      return {
        name,
        rootName,
        wins: (stats as any).wins || 0,
        losses: (stats as any).losses || 0,
        points: (stats as any).points || 0
      };
    }).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.wins - a.wins;
    });
  }, [hierarchyStats.parentStatsMap, allRootsPlayers]);

  const sortedRoots = useMemo(() => {
    return Object.entries(hierarchyStats.rootStatsMap).map(([name, stats]) => {
      return {
        name,
        wins: (stats as any).wins || 0,
        losses: (stats as any).losses || 0,
        points: (stats as any).points || 0
      };
    }).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.wins - a.wins;
    });
  }, [hierarchyStats.rootStatsMap]);

  const downloadPointsTablePDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Badminton Tournament Points Table & Standings", 14, 22);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Tournament ID: ${tournamentId}`, 14, 34);
    
    // Draw horizontal line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 38, 196, 38);
    
    let y = 46;
    
    // Sort groups by getGroupOrderWeight
    const sortedGroupsList = [...groups].sort((a, b) => {
      const wA = getGroupOrderWeight(a.name);
      const wB = getGroupOrderWeight(b.name);
      if (wA !== wB) return wA - wB;
      return a.name.localeCompare(b.name);
    });
    
    sortedGroupsList.forEach((group) => {
      const rankings = groupRankings[group.name] || [];
      
      if (y > 230) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(group.name, 14, y);
      
      y += 4;
      doc.setDrawColor(230, 230, 230);
      doc.line(14, y, 196, y);
      y += 6;
      
      if (rankings.length === 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text("No standings recorded yet for this group", 20, y);
        y += 10;
      } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Pos", 14, y);
        doc.text("Player/Team Name", 25, y);
        doc.text("Pld", 85, y);
        doc.text("W", 95, y);
        doc.text("L", 105, y);
        doc.text("GW", 115, y);
        doc.text("GL", 125, y);
        doc.text("GD", 135, y);
        doc.text("PD", 145, y);
        doc.text("Pts", 165, y);
        
        y += 3;
        doc.line(14, y, 196, y);
        y += 6;
        
        doc.setFont("helvetica", "normal");
        rankings.forEach((p, idx) => {
          if (y > 280) {
            doc.addPage();
            y = 20;
            doc.setFont("helvetica", "bold");
            doc.text(`${group.name} (Continued)`, 14, y);
            y += 6;
          }
          
          doc.text(String(idx + 1), 14, y);
          
          const nameStr = p.playerName || "N/A";
          const truncatedName = nameStr.length > 28 ? nameStr.substring(0, 26) + ".." : nameStr;
          doc.text(truncatedName, 25, y);
          
          doc.text(String(p.played), 85, y);
          doc.text(String(p.wins), 95, y);
          doc.text(String(p.losses), 105, y);
          doc.text(String(p.gamesWon), 115, y);
          doc.text(String(p.gamesLost), 125, y);
          doc.text(String(p.gameDiff), 135, y);
          doc.text(String(p.pointDiff), 145, y);
          doc.text(String(p.matchPoints), 165, y);
          
          y += 7;
        });
        y += 5; // spacing after group table
      }
    });
    
    doc.save("points_table_standings.pdf");
  };

  const generateShortId = () => Math.random().toString(36).substring(2, 6);

  // Helper to check if a set is finished (badminton professional rules)
  const isSetFinished = (p1: number, p2: number, pointsLimit: number) => {
    const target = pointsLimit || 21;
    if (p1 >= target || p2 >= target) {
      if (Math.abs(p1 - p2) >= 2) return true;
      if (p1 === 30 || p2 === 30) return true;
    }
    return false;
  };

  // Helper to retrieve the winner name/key of a knockout fixture
  const getFixtureWinner = (fixture: any) => {
    if (!fixture) return null;
    if (fixture.isWalkover) {
      if (fixture.walkoverWinner === 'player1') {
        return { key: 'player1', name: fixture.player1Name, id: fixture.player1Id };
      }
      if (fixture.walkoverWinner === 'player2') {
        return { key: 'player2', name: fixture.player2Name, id: fixture.player2Id };
      }
    }
    if (!fixture.scores) return null;
    const s = fixture.scores;
    const target = Number(fixture.pointsTarget) || 21;
    
    let p1Games = 0;
    let p2Games = 0;
    for (let i = 1; i <= 3; i++) {
      const p1 = s[`p1g${i}`] || 0;
      const p2 = s[`p2g${i}`] || 0;
      if (isSetFinished(p1, p2, target)) {
        if (p1 > p2) p1Games++;
        else p2Games++;
      }
    }
    
    if (p1Games > p2Games) return { key: 'player1', name: fixture.player1Name, id: fixture.player1Id };
    if (p2Games > p1Games) return { key: 'player2', name: fixture.player2Name, id: fixture.player2Id };
    return null;
  };

  // Calculate points grouped by groupName
  const groupedStats: Record<string, Record<string, any>> = {};
  
  // Initialize with all groups and players/pairs
  groups.forEach(group => {
      groupedStats[group.name] = {};
      
      const groupPlayers = players.filter(p => group.playerIds?.includes(p.id));
      const hasPairs = groupPlayers.some(p => p.pairId);

      if (hasPairs) {
        // We are in a doubles group. Group players by their pairId or treat single player pairs correctly
        const processedPlayerIds = new Set<string>();
        
        groupPlayers.forEach(p => {
          if (processedPlayerIds.has(p.id)) return;
          
          if (p.pairId) {
            // Find partner
            const partner = groupPlayers.find(other => other.pairId === p.pairId && other.id !== p.id);
            if (partner) {
              const pairName = `${p.name} & ${partner.name}`;
              groupedStats[group.name][pairName] = {
                playerId: p.id, // we can use the main player's ID for references
                partnerId: partner.id,
                wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0,
                femaleBonusPoints: 0
              };
              processedPlayerIds.add(p.id);
              processedPlayerIds.add(partner.id);
            } else {
              groupedStats[group.name][p.name] = {
                playerId: p.id,
                wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0,
                femaleBonusPoints: 0
              };
              processedPlayerIds.add(p.id);
            }
          } else {
            groupedStats[group.name][p.name] = {
              playerId: p.id,
              wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0,
              femaleBonusPoints: 0
            };
            processedPlayerIds.add(p.id);
          }
        });
      } else {
        // Singles group
        group.playerIds?.forEach((playerId: string) => {
            const playerName = playerMap[playerId];
            if (playerName) {
                groupedStats[group.name][playerName] = { 
                    playerId,
                    wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0,
                    femaleBonusPoints: 0
                };
            }
        });
      }
  });

  const awardedFemaleBonuses = new Set<string>();

  matches.forEach(match => {
      const fixture = fixtures.find(f => f.id === match.fixtureId);
      if (!fixture || !fixture.groupName) return;

      const groupName = fixture.groupName;
      const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
      const p1 = isDoublesMatch
        ? (fixture.player1bName ? `${fixture.player1aName} & ${fixture.player1bName}` : fixture.player1aName)
        : fixture.player1Name;
      const p2 = isDoublesMatch
        ? (fixture.player2bName ? `${fixture.player2aName} & ${fixture.player2bName}` : fixture.player2aName)
        : fixture.player2Name;
      const s = match.scores;

      // Ignore matches that are designated as knockout match types for group standings
      if (fixture.matchType && fixture.matchType !== 'league') return;

      if (!groupedStats[groupName]) groupedStats[groupName] = {};
      if (!groupedStats[groupName][p1]) {
        groupedStats[groupName][p1] = { 
          playerId: isDoublesMatch ? fixture.player1aId : fixture.player1Id, 
          partnerId: isDoublesMatch ? fixture.player1bId : undefined,
          wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0,
          femaleBonusPoints: 0
        };
      }
      if (!groupedStats[groupName][p2]) {
        groupedStats[groupName][p2] = { 
          playerId: isDoublesMatch ? fixture.player2aId : fixture.player2Id, 
          partnerId: isDoublesMatch ? fixture.player2bId : undefined,
          wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0,
          femaleBonusPoints: 0
        };
      }

      // Update P1
      if (match.winner === 'player1') groupedStats[groupName][p1].wins++;
      else if (match.winner === 'player2') groupedStats[groupName][p1].losses++;
      
      groupedStats[groupName][p1].gamesWon += match.p1Games || 0;
      groupedStats[groupName][p1].gamesLost += match.p2Games || 0;
      groupedStats[groupName][p1].pointsScored += (s.p1g1 || 0) + (s.p1g2 || 0) + (s.p1g3 || 0);
      groupedStats[groupName][p1].pointsAgainst += (s.p2g1 || 0) + (s.p2g2 || 0) + (s.p2g3 || 0);

      // Update P2
      if (match.winner === 'player2') groupedStats[groupName][p2].wins++;
      else if (match.winner === 'player1') groupedStats[groupName][p2].losses++;
      
      groupedStats[groupName][p2].gamesWon += match.p2Games || 0;
      groupedStats[groupName][p2].gamesLost += match.p1Games || 0;
      groupedStats[groupName][p2].pointsScored += (s.p2g1 || 0) + (s.p2g2 || 0) + (s.p2g3 || 0);
      groupedStats[groupName][p2].pointsAgainst += (s.p1g1 || 0) + (s.p1g2 || 0) + (s.p1g3 || 0);

      // Award female player bonus points (+5 points flat for 1st match played)
      const playerRootMap = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.rootName || '']));
      const team1Player1 = isDoublesMatch ? fixture.player1aId : fixture.player1Id;
      const team1Player2 = isDoublesMatch ? fixture.player1bId : null;
      const team2Player1 = isDoublesMatch ? fixture.player2aId : fixture.player2Id;
      const team2Player2 = isDoublesMatch ? fixture.player2bId : null;
      const allPlayersInMatch = [team1Player1, team1Player2, team2Player1, team2Player2].filter(Boolean);

      let belongsToFamilyOrKids = false;
      for (const pId of allPlayersInMatch) {
        if (!pId) continue;
        const rName = (playerRootMap[pId] || '').toLowerCase();
        const l1Name = (playerL1Map[pId] || '').toLowerCase();
        const l2Name = (playerL2Map[pId] || '').toLowerCase();
        if (
          rName.includes('family') || rName.includes('kids') || rName.includes('kid') ||
          l1Name.includes('family') || l1Name.includes('kids') || l1Name.includes('kid') ||
          l2Name.includes('family') || l2Name.includes('kids') || l2Name.includes('kid')
        ) {
          belongsToFamilyOrKids = true;
          break;
        }
      }

      const isTournamentFamilyOrKids = !!(
        tournament?.name?.toLowerCase().includes('family') ||
        tournament?.name?.toLowerCase().includes('kids') ||
        tournament?.name?.toLowerCase().includes('kid') ||
        (tournament?.categories && Array.isArray(tournament.categories) && tournament.categories.some((cat: string) => 
          cat.toLowerCase().includes('family') || cat.toLowerCase().includes('kids') || cat.toLowerCase().includes('kid')
        ))
      );

      const isFamilyCategory = 
        fixture.groupName?.toLowerCase().includes('family') || 
        fixture.groupName?.toLowerCase().includes('kids') || 
        belongsToFamilyOrKids ||
        isTournamentFamilyOrKids;
      if (!isFamilyCategory) {
        // Team 1
        const t1Player1 = isDoublesMatch ? fixture.player1aId : fixture.player1Id;
        const t1Player2 = isDoublesMatch ? fixture.player1bId : null;
        if (t1Player1 && isPlayerFemale(t1Player1, fixture.groupName)) {
          const key = `${groupName}-${t1Player1}`;
          if (!awardedFemaleBonuses.has(key)) {
            awardedFemaleBonuses.add(key);
            groupedStats[groupName][p1].femaleBonusPoints = (groupedStats[groupName][p1].femaleBonusPoints || 0) + 5;
          }
        }
        if (t1Player2 && isPlayerFemale(t1Player2, fixture.groupName)) {
          const key = `${groupName}-${t1Player2}`;
          if (!awardedFemaleBonuses.has(key)) {
            awardedFemaleBonuses.add(key);
            groupedStats[groupName][p1].femaleBonusPoints = (groupedStats[groupName][p1].femaleBonusPoints || 0) + 5;
          }
        }

        // Team 2
        const t2Player1 = isDoublesMatch ? fixture.player2aId : fixture.player2Id;
        const t2Player2 = isDoublesMatch ? fixture.player2bId : null;
        if (t2Player1 && isPlayerFemale(t2Player1, fixture.groupName)) {
          const key = `${groupName}-${t2Player1}`;
          if (!awardedFemaleBonuses.has(key)) {
            awardedFemaleBonuses.add(key);
            groupedStats[groupName][p2].femaleBonusPoints = (groupedStats[groupName][p2].femaleBonusPoints || 0) + 5;
          }
        }
        if (t2Player2 && isPlayerFemale(t2Player2, fixture.groupName)) {
          const key = `${groupName}-${t2Player2}`;
          if (!awardedFemaleBonuses.has(key)) {
            awardedFemaleBonuses.add(key);
            groupedStats[groupName][p2].femaleBonusPoints = (groupedStats[groupName][p2].femaleBonusPoints || 0) + 5;
          }
        }
      }
  });

  // Calculate sorted rankings for each group
  const isRoundRobinA = tournament?.tournamentType?.toLowerCase().includes('round robin a') || tournament?.tournamentType?.toLowerCase().includes('robin a');
  const winPointsValue = tournament?.winPoints !== undefined ? Number(tournament.winPoints) : 5;
  const lossPointsValue = tournament?.lossPoints !== undefined ? Number(tournament.lossPoints) : 0;

  const groupRankings: Record<string, StandingPlayer[]> = {};

  Object.entries(groupedStats).forEach(([groupName, groupPlayers]) => {
    groupRankings[groupName] = Object.entries(groupPlayers).map(([playerName, stats]: any) => {
      const played = stats.wins + stats.losses;
      let matchPoints = (stats.wins * winPointsValue) + (stats.losses * lossPointsValue);
      
      const playerRootMapForRankings = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.rootName || '']));
      const checkPlayerFamilyOrKids = (id: string) => {
        if (!id) return false;
        const rName = (playerRootMapForRankings[id] || '').toLowerCase();
        const l1Name = (playerL1Map[id] || '').toLowerCase();
        const l2Name = (playerL2Map[id] || '').toLowerCase();
        return (
          rName.includes('family') || rName.includes('kids') || rName.includes('kid') ||
          l1Name.includes('family') || l1Name.includes('kids') || l1Name.includes('kid') ||
          l2Name.includes('family') || l2Name.includes('kids') || l2Name.includes('kid')
        );
      };

      const isTournamentFamilyOrKids = !!(
        tournament?.name?.toLowerCase().includes('family') ||
        tournament?.name?.toLowerCase().includes('kids') ||
        tournament?.name?.toLowerCase().includes('kid') ||
        (tournament?.categories && Array.isArray(tournament.categories) && tournament.categories.some((cat: string) => 
          cat.toLowerCase().includes('family') || cat.toLowerCase().includes('kids') || cat.toLowerCase().includes('kid')
        ))
      );

      const belongsToFamilyOrKidsGroup = checkPlayerFamilyOrKids(stats.playerId) || (stats.partnerId && checkPlayerFamilyOrKids(stats.partnerId));
      const isFamilyGroup = 
        groupName.toLowerCase().includes('family') || 
        groupName.toLowerCase().includes('kids') || 
        belongsToFamilyOrKidsGroup ||
        isTournamentFamilyOrKids;
      
      if (isFamilyGroup) {
        matchPoints = 0;
      } else {
        matchPoints += stats.femaleBonusPoints || 0;
      }

      const gameDiff = stats.gamesWon - stats.gamesLost;
      const pointDiff = stats.pointsScored - stats.pointsAgainst;
      return {
        playerId: stats.playerId,
        partnerId: stats.partnerId,
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
      // If Round Robin A, sort by Wins first
      if (isRoundRobinA) {
        if (b.wins !== a.wins) return b.wins - a.wins;
      }
      
      // 1. Sort by total match points
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
      // 2. Sort by overall game difference
      if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
      // 3. Sort by overall points difference
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      // 4. Sort by total wins
      return b.wins - a.wins;
    });
  });

  // Filter fixtures by stage/matchType
  const preQuarters = fixtures.filter(f => f.matchType === 'pre_quarter');
  const quarters = fixtures.filter(f => f.matchType === 'quarter');
  const semis = fixtures.filter(f => f.matchType === 'semi');
  const finals = fixtures.filter(f => f.matchType === 'final');

  // Helper to determine points delta based on matchType (League: 5 | QF: 10 | SF: 15 | Final: 25)
  const getPointsDelta = (fixture?: any) => {
    if (!fixture) return 5;
    const t = fixture.matchType?.toLowerCase() || 'league';
    if (t.includes('pre_quarter') || t.includes('pre-quarter') || t.includes('pre quarter')) return 5;
    if (t.includes('quarter') || t.includes('quater')) return 10;
    if (t.includes('semi')) return 15;
    if (t.includes('final')) return 25;
    return 5;
  };

  const adjustTeamPoints = async (winnerPlayerId: string, delta: number, fixture?: any) => {
    if (
      fixture?.groupName?.toLowerCase().includes('family') ||
      fixture?.groupName?.toLowerCase().includes('kids')
    ) {
      return;
    }
    try {
      const teamsSnapshot = await getDocs(collection(db, `tournaments/${tournamentId}/teams`));
      const teamDoc = teamsSnapshot.docs.find(doc => doc.data().playerIds?.includes(winnerPlayerId));
      if (teamDoc) {
        const teamData = teamDoc.data();
        if (
          teamData?.name?.toLowerCase().includes('family') ||
          teamData?.name?.toLowerCase().includes('kids')
        ) {
          return;
        }
        await updateDoc(teamDoc.ref, { points: increment(delta) });
      }
    } catch (e) {
      console.error("Error adjusting team points:", e);
    }
  };

  // Delete a fixture
  const handleDeleteFixture = async (id: string) => {
    try {
      const fixtureObj = fixtures.find(f => f.id === id) || fixtureToDelete;
      
      // Delete associated match document if completed and adjust points
      const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`));
      const mSnap = await getDocs(matchesQuery);
      const assocMatch = mSnap.docs.find(doc => doc.data().fixtureId === id);
      
      if (assocMatch && fixtureObj) {
        const mData = assocMatch.data();
        if (mData && mData.winner) {
          const isDoublesMatch = !!(fixtureObj.isDoubles || fixtureObj.player1aId || fixtureObj.player1bId || fixtureObj.player2aId || fixtureObj.player2bId);
          const winnerPlayerId = mData.winner === 'player1'
            ? (isDoublesMatch ? fixtureObj.player1aId : fixtureObj.player1Id)
            : (isDoublesMatch ? fixtureObj.player2aId : fixtureObj.player2Id);
          
          if (winnerPlayerId) {
            const pointsDelta = getPointsDelta(fixtureObj);
            await adjustTeamPoints(winnerPlayerId, -pointsDelta, fixtureObj);
          }
        }
        await deleteDoc(assocMatch.ref);
      }

      await deleteDoc(doc(db, `tournaments/${tournamentId}/fixtures`, id));
      setFixtureToDelete(null);
    } catch (e) {
      console.error("Error deleting knockout match:", e);
    }
  };

  // Schedule a custom knockout match manually
  const scheduleKnockoutManual = async () => {
    try {
      setGenerating(true);
      const stageLabels = { pre_quarter: 'Pre-Quarters', quarter: 'Quarter Finals', semi: 'Semi Finals', final: 'Finals' };
      const groupName = stageLabels[selectedStage] || 'Knockout';

      let fixtureData: any = {
        groupName,
        matchType: selectedStage,
        pointsTarget: pointsTarget,
        status: 'pending',
        scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 }
      };

      if (manualIsDoubles) {
        fixtureData.isDoubles = true;
        let p1a = '', p1b = '', p2a = '', p2b = '';

        if (doublesSelectionMode === 'pair') {
          if (!selectedPair1 || !selectedPair2 || selectedPair1 === selectedPair2) {
            alert("Please select two distinct doubles pairs.");
            setGenerating(false);
            return;
          }
          // Find players for pair 1
          const pair1Players = players.filter(p => p.pairId === selectedPair1);
          if (pair1Players.length === 0) {
            alert("Could not find players for the selected Team 1 pair.");
            setGenerating(false);
            return;
          }
          p1a = pair1Players[0].id;
          p1b = pair1Players[1]?.id || '';

          // Find players for pair 2
          const pair2Players = players.filter(p => p.pairId === selectedPair2);
          if (pair2Players.length === 0) {
            alert("Could not find players for the selected Team 2 pair.");
            setGenerating(false);
            return;
          }
          p2a = pair2Players[0].id;
          p2b = pair2Players[1]?.id || '';
        } else {
          // Custom selection
          if (!selectedP1a || !selectedP2a) {
            alert("Both teams must have at least one main player (Player A).");
            setGenerating(false);
            return;
          }
          p1a = selectedP1a;
          p1b = selectedP1b;
          p2a = selectedP2a;
          p2b = selectedP2b;

          // Check for duplicates
          const selectedIds = [p1a, p1b, p2a, p2b].filter(Boolean);
          const uniqueIds = new Set(selectedIds);
          if (selectedIds.length !== uniqueIds.size) {
            alert("The same player cannot be selected multiple times in the same match.");
            setGenerating(false);
            return;
          }
        }

        // Assign fields
        fixtureData.player1aId = p1a;
        fixtureData.player1aName = playerMap[p1a] || '';
        fixtureData.player1bId = p1b;
        fixtureData.player1bName = playerMap[p1b] || '';
        fixtureData.player2aId = p2a;
        fixtureData.player2aName = playerMap[p2a] || '';
        fixtureData.player2bId = p2b;
        fixtureData.player2bName = playerMap[p2b] || '';

        // For backward compatibility / standard views fallback
        fixtureData.player1Id = p1a;
        fixtureData.player1Name = p1b ? `${playerMap[p1a]} & ${playerMap[p1b]}` : playerMap[p1a];
        fixtureData.player2Id = p2a;
        fixtureData.player2Name = p2b ? `${playerMap[p2a]} & ${playerMap[p2b]}` : playerMap[p2a];
      } else {
        // Singles match
        if (!selectedP1 || !selectedP2 || selectedP1 === selectedP2) {
          alert("Please select two distinct players to schedule.");
          setGenerating(false);
          return;
        }
        fixtureData.isDoubles = false;
        fixtureData.player1Id = selectedP1;
        fixtureData.player1Name = playerMap[selectedP1] || '';
        fixtureData.player2Id = selectedP2;
        fixtureData.player2Name = playerMap[selectedP2] || '';
      }

      const docRef = await addDoc(collection(db, `tournaments/${tournamentId}/fixtures`), fixtureData);
      await updateDoc(docRef, { matchId: generateShortId() });
      
      // Reset states
      setSelectedP1('');
      setSelectedP2('');
      setSelectedP1a('');
      setSelectedP1b('');
      setSelectedP2a('');
      setSelectedP2b('');
      setSelectedPair1('');
      setSelectedPair2('');
      setActiveTab('brackets');
    } catch (e) {
      console.error("Error scheduling knockout manual match:", e);
    } finally {
      setGenerating(false);
    }
  };

  // Automated Bracket Generation triggers
  const autoGeneratePreQuarters = async () => {
    const sortedGroups = Object.keys(groupRankings).sort();
    if (sortedGroups.length < 2) {
      alert("You need at least 2 groups with matches to automatically seed Pre-Quarters.");
      return;
    }

    try {
      setGenerating(true);
      const batch = writeBatch(db);
      const fixturesCol = collection(db, `tournaments/${tournamentId}/fixtures`);

      const pairings: Array<{ p1: StandingPlayer; p2: StandingPlayer }> = [];

      // If we have 2 groups: top 8 of Group A vs top 8 of Group B
      if (sortedGroups.length === 2) {
        const gA = groupRankings[sortedGroups[0]] || [];
        const gB = groupRankings[sortedGroups[1]] || [];
        for (let i = 0; i < 8; i++) {
          if (gA[i] && gB[7 - i]) {
            pairings.push({ p1: gA[i], p2: gB[7 - i] });
          }
        }
      } else if (sortedGroups.length === 4) {
        const gA = groupRankings[sortedGroups[0]] || [];
        const gB = groupRankings[sortedGroups[1]] || [];
        const gC = groupRankings[sortedGroups[2]] || [];
        const gD = groupRankings[sortedGroups[3]] || [];
        
        if (gA[0] && gB[3]) pairings.push({ p1: gA[0], p2: gB[3] });
        if (gA[1] && gB[2]) pairings.push({ p1: gA[1], p2: gB[2] });
        if (gB[0] && gA[3]) pairings.push({ p1: gB[0], p2: gA[3] });
        if (gB[1] && gA[2]) pairings.push({ p1: gB[1], p2: gA[2] });

        if (gC[0] && gD[3]) pairings.push({ p1: gC[0], p2: gD[3] });
        if (gC[1] && gD[2]) pairings.push({ p1: gC[1], p2: gD[2] });
        if (gD[0] && gC[3]) pairings.push({ p1: gD[0], p2: gC[3] });
        if (gD[1] && gC[2]) pairings.push({ p1: gD[1], p2: gC[2] });
      } else {
        // Fallback pair adjacent groups
        for (let gIdx = 0; gIdx < sortedGroups.length; gIdx += 2) {
          if (sortedGroups[gIdx] && sortedGroups[gIdx + 1]) {
            const g1 = groupRankings[sortedGroups[gIdx]] || [];
            const g2 = groupRankings[sortedGroups[gIdx + 1]] || [];
            if (g1[0] && g2[1]) pairings.push({ p1: g1[0], p2: g2[1] });
            if (g2[0] && g1[1]) pairings.push({ p1: g2[0], p2: g1[1] });
          }
        }
      }

      if (pairings.length === 0) {
        alert("Standings are empty or insufficient players. Please input league match scores first to find group leaders.");
        setGenerating(false);
        return;
      }

      for (let i = 0; i < pairings.length; i++) {
        const { p1, p2 } = pairings[i];
        const newDocRef = doc(fixturesCol);
        batch.set(newDocRef, {
          player1Id: p1.playerId,
          player1Name: p1.playerName,
          player2Id: p2.playerId,
          player2Name: p2.playerName,
          groupName: 'Pre-Quarters',
          matchType: 'pre_quarter',
          pointsTarget: '15',
          status: 'pending',
          scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
          matchId: generateShortId()
        });
      }

      await batch.commit();
      setActiveTab('brackets');
      alert(`Successfully generated ${pairings.length} Pre-Quarter matches!`);
    } catch (e) {
      console.error("Error auto generating pre-quarters:", e);
    } finally {
      setGenerating(false);
    }
  };

  const autoGenerateQuarters = async () => {
    if (preQuarters.length > 0) {
      try {
        setGenerating(true);
        const batch = writeBatch(db);
        const fixturesCol = collection(db, `tournaments/${tournamentId}/fixtures`);

        const completedPreQuarters = preQuarters.filter(q => q.status === 'completed');
        if (completedPreQuarters.length < preQuarters.length) {
          if (!safeConfirm(`Only ${completedPreQuarters.length} of ${preQuarters.length} Pre-Quarters are finished. Proceed using current winners?`)) {
            setGenerating(false);
            return;
          }
        }

        const winners = preQuarters.map(q => getFixtureWinner(q)).filter(Boolean);
        if (winners.length < 2) {
          alert("At least 2 Pre-Quarter winners are required to seed Quarter-Finals.");
          setGenerating(false);
          return;
        }

        // Pair up: PQ1 Winner vs PQ2 Winner, PQ3 Winner vs PQ4 Winner, etc.
        for (let i = 0; i < winners.length; i += 2) {
          if (winners[i] && winners[i + 1]) {
            const newDocRef = doc(fixturesCol);
            batch.set(newDocRef, {
              player1Id: winners[i]?.id,
              player1Name: winners[i]?.name,
              player2Id: winners[i + 1]?.id,
              player2Name: winners[i + 1]?.name,
              groupName: 'Quarter Finals',
              matchType: 'quarter',
              pointsTarget: '15',
              status: 'pending',
              scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
              matchId: generateShortId()
            });
          }
        }

        await batch.commit();
        setActiveTab('brackets');
        alert(`Successfully generated Quarter Final matches from Pre-Quarter winners!`);
      } catch (e) {
        console.error("Error auto generating quarters from pre quarters:", e);
      } finally {
        setGenerating(false);
      }
      return;
    }

    const sortedGroups = Object.keys(groupRankings).sort();
    if (sortedGroups.length < 2) {
      alert("You need at least 2 groups with matches to automatically seed Quarter-Finals.");
      return;
    }

    try {
      setGenerating(true);
      const batch = writeBatch(db);
      const fixturesCol = collection(db, `tournaments/${tournamentId}/fixtures`);

      // Determine seeds
      // Seed 1: Group A 1st vs Group B 2nd
      // Seed 2: Group B 1st vs Group A 2nd
      // If we have C and D groups:
      // Seed 3: Group C 1st vs Group D 2nd
      // Seed 4: Group D 1st vs Group C 2nd
      const gA = groupRankings[sortedGroups[0]] || [];
      const gB = groupRankings[sortedGroups[1]] || [];
      const gC = sortedGroups[2] ? groupRankings[sortedGroups[2]] : [];
      const gD = sortedGroups[3] ? groupRankings[sortedGroups[3]] : [];

      const pairings: Array<{ p1: StandingPlayer; p2: StandingPlayer }> = [];

      if (gA[0] && gB[1]) pairings.push({ p1: gA[0], p2: gB[1] });
      if (gB[0] && gA[1]) pairings.push({ p1: gB[0], p2: gA[1] });

      if (sortedGroups.length >= 4) {
        if (gC[0] && gD[1]) pairings.push({ p1: gC[0], p2: gD[1] });
        if (gD[0] && gC[1]) pairings.push({ p1: gD[0], p2: gC[1] });
      }

      if (pairings.length === 0) {
        alert("Standings are empty. Please input league match scores first to find group leaders.");
        setGenerating(false);
        return;
      }

      for (let i = 0; i < pairings.length; i++) {
        const { p1, p2 } = pairings[i];
        const newDocRef = doc(fixturesCol);
        batch.set(newDocRef, {
          player1Id: p1.playerId,
          player1Name: p1.playerName,
          player2Id: p2.playerId,
          player2Name: p2.playerName,
          groupName: 'Quarter Finals',
          matchType: 'quarter',
          pointsTarget: '21',
          status: 'pending',
          scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
          matchId: generateShortId()
        });
      }

      await batch.commit();
      setActiveTab('brackets');
      alert(`Successfully generated ${pairings.length} Quarter Final matches!`);
    } catch (e) {
      console.error("Error auto generating quarters:", e);
    } finally {
      setGenerating(false);
    }
  };

  const autoGenerateSemis = async () => {
    // If Quarter finals exist, generate from Quarter-Final winners.
    // If not, we can generate from 2 Group winners directly!
    try {
      setGenerating(true);
      const batch = writeBatch(db);
      const fixturesCol = collection(db, `tournaments/${tournamentId}/fixtures`);

      if (quarters.length > 0) {
        // Find winners of completed Quarter Finals
        const completedQuarters = quarters.filter(q => q.status === 'completed');
        if (completedQuarters.length < quarters.length) {
          if (!safeConfirm(`Only ${completedQuarters.length} of ${quarters.length} Quarter Finals are finished. Proceed using current winners?`)) {
            setGenerating(false);
            return;
          }
        }

        const winners = quarters.map(q => getFixtureWinner(q)).filter(Boolean);
        if (winners.length < 2) {
          alert("At least 2 Quarter-Final winners are required to seed Semi-Finals.");
          setGenerating(false);
          return;
        }

        // Pair up: QF1 Winner vs QF2 Winner, QF3 Winner vs QF4 Winner (if exists)
        if (winners[0] && winners[1]) {
          const newDocRef = doc(fixturesCol);
          batch.set(newDocRef, {
            player1Id: winners[0]?.id,
            player1Name: winners[0]?.name,
            player2Id: winners[1]?.id,
            player2Name: winners[1]?.name,
            groupName: 'Semi Finals',
            matchType: 'semi',
            pointsTarget: '21',
            status: 'pending',
            scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
            matchId: generateShortId()
          });
        }

        if (winners[2] && winners[3]) {
          const newDocRef = doc(fixturesCol);
          batch.set(newDocRef, {
            player1Id: winners[2]?.id,
            player1Name: winners[2]?.name,
            player2Id: winners[3]?.id,
            player2Name: winners[3]?.name,
            groupName: 'Semi Finals',
            matchType: 'semi',
            pointsTarget: '21',
            status: 'pending',
            scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
            matchId: generateShortId()
          });
        }
      } else {
        // Seed directly from 2 groups: Winner Group A vs Runner Group B, and Winner Group B vs Runner Group A
        const sortedGroups = Object.keys(groupRankings).sort();
        if (sortedGroups.length < 2) {
          alert("At least 2 groups are required to generate Semi Finals from league play.");
          setGenerating(false);
          return;
        }

        const gA = groupRankings[sortedGroups[0]] || [];
        const gB = groupRankings[sortedGroups[1]] || [];

        if (!gA[0] || !gB[0]) {
          alert("Standings are empty. Please complete league scores first.");
          setGenerating(false);
          return;
        }

        // Match 1
        const r1 = doc(fixturesCol);
        batch.set(r1, {
          player1Id: gA[0].playerId,
          player1Name: gA[0].playerName,
          player2Id: gB[1]?.playerId || gB[0].playerId,
          player2Name: gB[1]?.playerName || gB[0].playerName,
          groupName: 'Semi Finals',
          matchType: 'semi',
          pointsTarget: '21',
          status: 'pending',
          scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
          matchId: generateShortId()
        });

        // Match 2
        const r2 = doc(fixturesCol);
        batch.set(r2, {
          player1Id: gB[0].playerId,
          player1Name: gB[0].playerName,
          player2Id: gA[1]?.playerId || gA[0].playerId,
          player2Name: gA[1]?.playerName || gA[0].playerName,
          groupName: 'Semi Finals',
          matchType: 'semi',
          pointsTarget: '21',
          status: 'pending',
          scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
          matchId: generateShortId()
        });
      }

      await batch.commit();
      setActiveTab('brackets');
      alert("Successfully seeded Semi Finals!");
    } catch (e) {
      console.error("Error auto generating semis:", e);
    } finally {
      setGenerating(false);
    }
  };

  const autoGenerateFinals = async () => {
    try {
      setGenerating(true);
      const batch = writeBatch(db);
      const fixturesCol = collection(db, `tournaments/${tournamentId}/fixtures`);

      const completedSemis = semis.filter(s => s.status === 'completed');
      if (completedSemis.length < semis.length && semis.length > 0) {
        if (!safeConfirm(`Only ${completedSemis.length} of ${semis.length} Semi-Final matches are finished. Seeding Final with current winners?`)) {
          setGenerating(false);
          return;
        }
      }

      // If semis exist
      if (semis.length > 0) {
        const winners = semis.map(s => getFixtureWinner(s)).filter(Boolean);
        if (winners.length < 2) {
          alert("Two completed Semi-Final winners are required to seed the Final.");
          setGenerating(false);
          return;
        }

        const newDocRef = doc(fixturesCol);
        batch.set(newDocRef, {
          player1Id: winners[0]?.id,
          player1Name: winners[0]?.name,
          player2Id: winners[1]?.id,
          player2Name: winners[1]?.name,
          groupName: 'Finals',
          matchType: 'final',
          pointsTarget: '21',
          status: 'pending',
          scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
          matchId: generateShortId()
        });
      } else {
        // Direct Final from 1 group (Top 1 vs Top 2)
        const sortedGroups = Object.keys(groupRankings).sort();
        if (sortedGroups.length === 0) {
          alert("Standings are empty.");
          setGenerating(false);
          return;
        }
        const gA = groupRankings[sortedGroups[0]] || [];
        if (gA.length < 2) {
          alert("At least 2 league players are required to schedule a Final.");
          setGenerating(false);
          return;
        }

        const newDocRef = doc(fixturesCol);
        batch.set(newDocRef, {
          player1Id: gA[0].playerId,
          player1Name: gA[0].playerName,
          player2Id: gA[1].playerId,
          player2Name: gA[1].playerName,
          groupName: 'Finals',
          matchType: 'final',
          pointsTarget: '21',
          status: 'pending',
          scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 },
          matchId: generateShortId()
        });
      }

      await batch.commit();
      setActiveTab('brackets');
      alert("Grand Final Scheduled! Ready to crown the champion.");
    } catch (e) {
      console.error("Error auto generating final:", e);
    } finally {
      setGenerating(false);
    }
  };

  const renderBracketMatchCard = (f: any, idx: number, stageLabel: string, isGrandFinal = false) => {
    const winner = getFixtureWinner(f);
    const isDoublesMatch = !!(f.isDoubles || f.player1aId || f.player1bId || f.player2aId || f.player2bId);

    // Determine scores safely
    const s = f.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    const isCompleted = f.status === 'completed';

    // Show Game 3 if Game 3 has any scores or if the match was a 3-set match
    const showG3 = (s.p1g3 > 0 || s.p2g3 > 0 || (isCompleted && (s.p1g1 > 0 || s.p1g2 > 0) && !((s.p1g1 > s.p2g1 && s.p1g2 > s.p2g2) || (s.p2g1 > s.p1g1 && s.p2g2 > s.p1g2))));

    // Determine team displays and L2 names
    const p1NameMain = isDoublesMatch ? f.player1aName : f.player1Name;
    const p1NamePartner = isDoublesMatch ? f.player1bName : null;
    const p1L2Main = isDoublesMatch ? playerL2Map[f.player1aId] : playerL2Map[f.player1Id];
    const p1L2Partner = isDoublesMatch ? playerL2Map[f.player1bId] : null;

    const p2NameMain = isDoublesMatch ? f.player2aName : f.player2Name;
    const p2NamePartner = isDoublesMatch ? f.player2bName : null;
    const p2L2Main = isDoublesMatch ? playerL2Map[f.player2aId] : playerL2Map[f.player2Id];
    const p2L2Partner = isDoublesMatch ? playerL2Map[f.player2bId] : null;

    if (isGrandFinal) {
      return (
        <div key={f.id} id={`match-card-${stageLabel}-${idx}`} className="bg-slate-900 text-white border-2 border-amber-400/40 rounded-3xl p-5 shadow-xl relative group overflow-hidden hover:border-amber-400 transition-all duration-300 w-[260px] mx-auto shrink-0">
          <div className="absolute top-0 right-0 p-2.5">
            <Award className="w-6 h-6 text-amber-400 animate-pulse" />
          </div>

          {/* Match Header info */}
          <div className="flex justify-between items-center text-[10px] font-black text-amber-400 uppercase tracking-widest border-b border-slate-800 pb-2.5 mb-3.5 pr-6">
            <span>CHAMPIONSHIP FINALS ({f.pointsTarget || '21'} pts) {f.court ? `• ${f.court}` : ''}</span>
            {canEdit && (
              <button 
                onClick={() => setFixtureToDelete(f)}
                className="text-amber-500/60 hover:text-rose-400 transition p-1 hover:bg-slate-800 rounded-lg shrink-0"
                title="Delete Grand Final"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Players row with scores */}
          <div className="space-y-3.5">
            {/* Row 1: Player/Team 1 */}
            <div className={`flex items-center justify-between gap-3 ${isCompleted && winner?.key === 'player2' ? 'opacity-40' : ''}`}>
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-black truncate block ${winner?.key === 'player1' ? 'text-amber-400' : 'text-slate-100'}`}>
                  {p1NameMain || 'TBD'}
                </span>
                {p1NamePartner && (
                  <span className={`text-xs font-black truncate block -mt-0.5 ${winner?.key === 'player1' ? 'text-amber-400/90' : 'text-slate-300'}`}>
                    & {p1NamePartner}
                  </span>
                )}
                {/* L2 Badge */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {p1L2Main && (
                    <span className="text-[8px] text-amber-300 font-extrabold bg-amber-950/60 border border-amber-900/40 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Level 2">
                      {p1L2Main}
                    </span>
                  )}
                  {p1L2Partner && p1L2Partner !== p1L2Main && (
                    <span className="text-[8px] text-amber-300 font-extrabold bg-amber-950/60 border border-amber-900/40 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Partner Level 2">
                      {p1L2Partner}
                    </span>
                  )}
                </div>
              </div>

              {/* Scores Column */}
              <div className="flex gap-1 shrink-0 items-center font-mono text-xs font-black">
                {f.isWalkover ? (
                  f.walkoverWinner === 'player1' ? (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 font-extrabold px-2 py-1 rounded border border-amber-500/30">W.O. WIN</span>
                  ) : (
                    <span className="text-[10px] bg-slate-800 text-slate-400 font-semibold px-2 py-1 rounded border border-slate-700/50">L via W.O.</span>
                  )
                ) : (
                  <>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                      isCompleted && s.p1g1 > s.p2g1 ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {s.p1g1 || 0}
                    </span>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                      isCompleted && s.p1g2 > s.p2g2 ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {s.p1g2 || 0}
                    </span>
                    {showG3 && (
                      <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                        isCompleted && s.p1g3 > s.p2g3 ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {s.p1g3 || 0}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="border-t border-slate-800" />

            {/* Row 2: Player/Team 2 */}
            <div className={`flex items-center justify-between gap-3 ${isCompleted && winner?.key === 'player1' ? 'opacity-40' : ''}`}>
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-black truncate block ${winner?.key === 'player2' ? 'text-amber-400' : 'text-slate-100'}`}>
                  {p2NameMain || 'TBD'}
                </span>
                {p2NamePartner && (
                  <span className={`text-xs font-black truncate block -mt-0.5 ${winner?.key === 'player2' ? 'text-amber-400/90' : 'text-slate-300'}`}>
                    & {p2NamePartner}
                  </span>
                )}
                {/* L2 Badge */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {p2L2Main && (
                    <span className="text-[8px] text-amber-300 font-extrabold bg-amber-950/60 border border-amber-900/40 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Level 2">
                      {p2L2Main}
                    </span>
                  )}
                  {p2L2Partner && p2L2Partner !== p2L2Main && (
                    <span className="text-[8px] text-amber-300 font-extrabold bg-amber-950/60 border border-amber-900/40 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Partner Level 2">
                      {p2L2Partner}
                    </span>
                  )}
                </div>
              </div>

              {/* Scores Column */}
              <div className="flex gap-1 shrink-0 items-center font-mono text-xs font-black">
                {f.isWalkover ? (
                  f.walkoverWinner === 'player2' ? (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 font-extrabold px-2 py-1 rounded border border-amber-500/30">W.O. WIN</span>
                  ) : (
                    <span className="text-[10px] bg-slate-800 text-slate-400 font-semibold px-2 py-1 rounded border border-slate-700/50">L via W.O.</span>
                  )
                ) : (
                  <>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                      isCompleted && s.p2g1 > s.p1g1 ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {s.p2g1 || 0}
                    </span>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                      isCompleted && s.p2g2 > s.p1g2 ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {s.p2g2 || 0}
                    </span>
                    {showG3 && (
                      <span className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                        isCompleted && s.p2g3 > s.p1g3 ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {s.p2g3 || 0}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {isCompleted && winner && (
            <div className="mt-4 pt-3 border-t border-slate-850 text-center space-y-1 bg-amber-500/10 rounded-2xl p-2.5 border border-amber-500/20">
              <p className="text-[10px] font-black tracking-widest text-amber-400 uppercase">🏆 TOURNAMENT CHAMPION 🏆</p>
              <p className="font-black text-base tracking-tight text-white">{winner.name}</p>
            </div>
          )}
        </div>
      );
    }

    // Default design for Pre-Quarters, Quarters, Semis
    return (
      <div key={f.id} id={`match-card-${stageLabel}-${idx}`} className="bg-white border border-slate-150 rounded-2xl shadow-sm relative group overflow-hidden hover:border-slate-300 hover:shadow-md transition duration-200 w-[260px] mx-auto shrink-0">
        {/* Match Header info */}
        <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100 px-3 py-1.5">
          <span>{stageLabel} {idx + 1} ({f.pointsTarget || '21'} pts) {f.court ? `• ${f.court}` : ''}</span>
          {canEdit && (
            <button 
              onClick={() => setFixtureToDelete(f)}
              className="text-slate-400 hover:text-rose-600 transition p-1 hover:bg-rose-50 rounded-lg shrink-0 opacity-0 group-hover:opacity-100"
              title="Delete Fixture"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Players list with scores on the right */}
        <div className="p-3.5 space-y-3">
          {/* Row 1: Player/Team 1 */}
          <div className={`flex items-center justify-between gap-3 ${isCompleted && winner?.key === 'player2' ? 'opacity-40' : ''}`}>
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-extrabold truncate block text-slate-800 ${winner?.key === 'player1' ? 'text-indigo-600 font-black' : ''}`}>
                {p1NameMain || 'TBD'}
              </span>
              {p1NamePartner && (
                <span className={`text-[11px] font-extrabold truncate block text-slate-500 -mt-0.5 ${winner?.key === 'player1' ? 'text-indigo-500/80 font-black' : ''}`}>
                  & {p1NamePartner}
                </span>
              )}
              {/* L2 Badge */}
              <div className="flex flex-wrap gap-1 mt-0.5">
                {p1L2Main && (
                  <span className="text-[8px] text-indigo-600 font-extrabold bg-indigo-50 px-1 py-0.25 rounded" title="Level 2">
                    {p1L2Main}
                  </span>
                )}
                {p1L2Partner && p1L2Partner !== p1L2Main && (
                  <span className="text-[8px] text-indigo-600 font-extrabold bg-indigo-50 px-1 py-0.25 rounded" title="Partner Level 2">
                    {p1L2Partner}
                  </span>
                )}
              </div>
            </div>

            {/* Scores Set 1, 2, 3 columns */}
            <div className="flex gap-1 shrink-0 items-center font-mono text-[11px] font-bold">
              {f.isWalkover ? (
                f.walkoverWinner === 'player1' ? (
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded border border-amber-200">W.O. WIN</span>
                ) : (
                  <span className="text-[10px] bg-slate-50 text-slate-400 font-semibold px-1.5 py-0.5 rounded border border-slate-150">L via W.O.</span>
                )
              ) : (
                <>
                  <span className={`w-7 h-7 flex items-center justify-center rounded-md ${
                    isCompleted && s.p1g1 > s.p2g1 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {s.p1g1 || 0}
                  </span>
                  <span className={`w-7 h-7 flex items-center justify-center rounded-md ${
                    isCompleted && s.p1g2 > s.p2g2 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {s.p1g2 || 0}
                  </span>
                  {showG3 && (
                    <span className={`w-7 h-7 flex items-center justify-center rounded-md ${
                      isCompleted && s.p1g3 > s.p2g3 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500'
                    }`}>
                      {s.p1g3 || 0}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Divider line between players */}
          <div className="border-t border-slate-100" />

          {/* Row 2: Player/Team 2 */}
          <div className={`flex items-center justify-between gap-3 ${isCompleted && winner?.key === 'player1' ? 'opacity-40' : ''}`}>
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-extrabold truncate block text-slate-800 ${winner?.key === 'player2' ? 'text-indigo-600 font-black' : ''}`}>
                {p2NameMain || 'TBD'}
              </span>
              {p2NamePartner && (
                <span className={`text-[11px] font-extrabold truncate block text-slate-500 -mt-0.5 ${winner?.key === 'player2' ? 'text-indigo-500/80 font-black' : ''}`}>
                  & {p2NamePartner}
                </span>
              )}
              {/* L2 Badge */}
              <div className="flex flex-wrap gap-1 mt-0.5">
                {p2L2Main && (
                  <span className="text-[8px] text-indigo-600 font-extrabold bg-indigo-50 px-1 py-0.25 rounded" title="Level 2">
                    {p2L2Main}
                  </span>
                )}
                {p2L2Partner && p2L2Partner !== p2L2Main && (
                  <span className="text-[8px] text-indigo-600 font-extrabold bg-indigo-50 px-1 py-0.25 rounded" title="Partner Level 2">
                    {p2L2Partner}
                  </span>
                )}
              </div>
            </div>

            {/* Scores Set 1, 2, 3 columns */}
            <div className="flex gap-1 shrink-0 items-center font-mono text-[11px] font-bold">
              {f.isWalkover ? (
                f.walkoverWinner === 'player2' ? (
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded border border-amber-200">W.O. WIN</span>
                ) : (
                  <span className="text-[10px] bg-slate-50 text-slate-400 font-semibold px-1.5 py-0.5 rounded border border-slate-150">L via W.O.</span>
                )
              ) : (
                <>
                  <span className={`w-7 h-7 flex items-center justify-center rounded-md ${
                    isCompleted && s.p2g1 > s.p1g1 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {s.p2g1 || 0}
                  </span>
                  <span className={`w-7 h-7 flex items-center justify-center rounded-md ${
                    isCompleted && s.p2g2 > s.p1g2 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {s.p2g2 || 0}
                  </span>
                  {showG3 && (
                    <span className={`w-7 h-7 flex items-center justify-center rounded-md ${
                      isCompleted && s.p2g3 > s.p1g3 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500'
                    }`}>
                      {s.p2g3 || 0}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Grand Winner Badge if Completed */}
        {isCompleted && winner && (
          <div className="bg-indigo-50/50 border-t border-slate-100 px-3 py-1.5 flex items-center justify-between">
            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">Completed</span>
            <span className="text-[9px] font-black text-emerald-700 flex items-center gap-0.5 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              Winner: {winner.name}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Helper to render placeholder card to keep visual tree symmetry
  const renderBracketPlaceholderCard = (stageLabel: string, idx: number) => {
    return (
      <div 
        id={`match-card-${stageLabel}-${idx}`}
        className="bg-slate-50/40 border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center flex flex-col justify-center items-center h-[120px] w-[260px] mx-auto select-none shrink-0"
      >
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
          {stageLabel === 'PQ' ? 'Pre-Quarter' : stageLabel === 'QF' ? 'Quarter Final' : stageLabel === 'SF' ? 'Semi Final' : 'Grand Final'} {idx + 1}
        </span>
        <p className="text-[10px] font-bold text-slate-400/80">Waiting for Seeding</p>
      </div>
    );
  };

  // Leaderboard Calculation Hook
  const computedLeaderboard = useMemo(() => {
    const statsMap: Record<string, any> = {};

    // Initialize all registered tournament players
    players.forEach(p => {
      statsMap[p.id] = {
        id: p.id,
        name: p.name,
        pointsScored: 0,
        pointsAgainst: 0,
        pointDiff: 0,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        currentStreak: 0,
        longestStreak: 0,
        streakHistory: []
      };
    });

    // Sort matches by finalizedAt
    const sortedMatches = [...matches].sort((a, b) => (a.finalizedAt || 0) - (b.finalizedAt || 0));

    sortedMatches.forEach(match => {
      const fixture = fixtures.find(f => f.id === match.fixtureId);
      if (!fixture) return;

      const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
      
      const team1Ids = isDoublesMatch 
        ? [fixture.player1aId, fixture.player1bId].filter(Boolean)
        : [fixture.player1Id].filter(Boolean);
      const team2Ids = isDoublesMatch 
        ? [fixture.player2aId, fixture.player2bId].filter(Boolean)
        : [fixture.player2Id].filter(Boolean);

      const s = match.scores || {};
      const team1Points = (s.p1g1 || 0) + (s.p1g2 || 0) + (s.p1g3 || 0);
      const team2Points = (s.p2g1 || 0) + (s.p2g2 || 0) + (s.p2g3 || 0);

      const winnerKey = match.winner;

      team1Ids.forEach(pid => {
        if (!statsMap[pid]) {
          statsMap[pid] = {
            id: pid,
            name: playerMap[pid] || pid,
            pointsScored: 0, pointsAgainst: 0, pointDiff: 0,
            matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
            currentStreak: 0, longestStreak: 0, streakHistory: []
          };
        }
        const pStats = statsMap[pid];
        pStats.matchesPlayed++;
        pStats.pointsScored += team1Points;
        pStats.pointsAgainst += team2Points;
        const isWin = winnerKey === 'player1';
        if (isWin) pStats.wins++;
        else pStats.losses++;
        pStats.streakHistory.push(isWin);
      });

      team2Ids.forEach(pid => {
        if (!statsMap[pid]) {
          statsMap[pid] = {
            id: pid,
            name: playerMap[pid] || pid,
            pointsScored: 0, pointsAgainst: 0, pointDiff: 0,
            matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
            currentStreak: 0, longestStreak: 0, streakHistory: []
          };
        }
        const pStats = statsMap[pid];
        pStats.matchesPlayed++;
        pStats.pointsScored += team2Points;
        pStats.pointsAgainst += team1Points;
        const isWin = winnerKey === 'player2';
        if (isWin) pStats.wins++;
        else pStats.losses++;
        pStats.streakHistory.push(isWin);
      });
    });

    Object.values(statsMap).forEach(pStats => {
      pStats.pointDiff = pStats.pointsScored - pStats.pointsAgainst;
      pStats.winRate = pStats.matchesPlayed > 0 ? (pStats.wins / pStats.matchesPlayed) * 100 : 0;

      let current = 0;
      let longest = 0;
      pStats.streakHistory.forEach((isWin: boolean) => {
        if (isWin) {
          current++;
          if (current > longest) longest = current;
        } else {
          current = 0;
        }
      });
      pStats.currentStreak = current;
      pStats.longestStreak = longest;
    });

    return Object.values(statsMap);
  }, [players, matches, fixtures, playerMap]);

  // Leaderboard filter & sorting
  const filteredLeaderboard = useMemo(() => {
    let list = computedLeaderboard;
    
    if (leaderboardSearch.trim()) {
      const q = leaderboardSearch.toLowerCase().trim();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      if (leaderboardSort === 'pointsScored') {
        return b.pointsScored - a.pointsScored;
      }
      if (leaderboardSort === 'longestStreak') {
        if (b.longestStreak !== a.longestStreak) {
          return b.longestStreak - a.longestStreak;
        }
        return b.wins - a.wins;
      }
      if (leaderboardSort === 'pointDiff') {
        return b.pointDiff - a.pointDiff;
      }
      if (leaderboardSort === 'winRate') {
        const aPlayed = a.matchesPlayed > 0 ? 1 : 0;
        const bPlayed = b.matchesPlayed > 0 ? 1 : 0;
        if (bPlayed !== aPlayed) return bPlayed - aPlayed;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.wins - a.wins;
      }
      return 0;
    });

    return list;
  }, [computedLeaderboard, leaderboardSort, leaderboardSearch]);

  // Bracket connector lines drawer
  const updateBracketLines = () => {
    if (!bracketContainerRef.current || activeTab !== 'brackets') return;
    const container = bracketContainerRef.current;
    
    // Find first child which is the relative inner container
    const inner = container.firstElementChild as HTMLElement;
    if (!inner) return;
    
    const innerRect = inner.getBoundingClientRect();
    const newConnections: Array<{ path: string; isCompleted: boolean }> = [];

    const showPQ = preQuarters.length > 0;

    const connectStructuralRounds = (stageA: string, sizeA: number, stageB: string, sizeB: number) => {
      for (let idx = 0; idx < sizeA; idx++) {
        const elA = document.getElementById(`match-card-${stageA}-${idx}`);
        const targetIdx = Math.floor(idx / 2);
        const elB = document.getElementById(`match-card-${stageB}-${targetIdx}`);

        if (elA && elB) {
          const rectA = elA.getBoundingClientRect();
          const rectB = elB.getBoundingClientRect();

          const x1 = rectA.right - innerRect.left;
          const y1 = rectA.top + rectA.height / 2 - innerRect.top;
          
          const x2 = rectB.left - innerRect.left;
          const y2 = rectB.top + rectB.height / 2 - innerRect.top;

          const controlOffset = Math.min(50, Math.abs(x2 - x1) / 2);
          const path = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;

          // Highlight path as completed if stageA match was completed and the winner matches
          let isCompleted = false;
          if (stageA === 'PQ' && preQuarters[idx]?.status === 'completed') isCompleted = true;
          if (stageA === 'QF' && quarters[idx]?.status === 'completed') isCompleted = true;
          if (stageA === 'SF' && semis[idx]?.status === 'completed') isCompleted = true;

          newConnections.push({ path, isCompleted });
        }
      }
    };

    if (showPQ) {
      connectStructuralRounds('PQ', 8, 'QF', 4);
      connectStructuralRounds('QF', 4, 'SF', 2);
      connectStructuralRounds('SF', 2, 'FINAL', 1);
    } else {
      connectStructuralRounds('QF', 4, 'SF', 2);
      connectStructuralRounds('SF', 2, 'FINAL', 1);
    }

    setConnections(newConnections);
  };

  useEffect(() => {
    if (activeTab === 'brackets') {
      const timer = setTimeout(() => {
        updateBracketLines();
      }, 150);

      window.addEventListener('resize', updateBracketLines);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateBracketLines);
      };
    }
  }, [activeTab, preQuarters, quarters, semis, finals]);

  return (
    <div className="space-y-8 font-sans">
      
      {/* Header Tabs */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">League Standings & Brackets</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tournament Results & Pathway Seeding</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={downloadPointsTablePDF}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
            title="Download PDF Standings"
          >
            Download PDF
          </button>
          {/* Tab Buttons */}
          <div className="flex flex-wrap bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('standings')}
            className={`px-4 py-2 text-xs font-extrabold rounded-xl transition ${
              activeTab === 'standings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📊 Group Standings
          </button>
          <button
            onClick={() => setActiveTab('brackets')}
            className={`px-4 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1 ${
              activeTab === 'brackets' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🏆 Knockout Bracket
            {(quarters.length > 0 || semis.length > 0 || finals.length > 0) && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('leaderboards')}
            className={`px-4 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1 ${
              activeTab === 'leaderboards' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🥇 Player Leaderboards
          </button>
          {canEdit && (
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition ${
                activeTab === 'schedule' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚙️ Stage Planner
            </button>
          )}
        </div>
      </div>
    </div>

      <AnimatePresence mode="wait">
        {/* 1. STANDINGS TAB */}
        {activeTab === 'standings' && (
          <motion.div
            key="standings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            {/* Real-time Team and Root Standings Overview */}
            {sortedParentTeams.length > 0 && (
              <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-200/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-indigo-600" />
                      Team-wise Hierarchy Standings
                    </h3>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Real-time aggregated wins and points from all individual matches
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
                    Points: League (5) • QF (10) • SF (15) • Final (25)
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Parent Teams (Level 1) Card */}
                  <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-3">
                    <h4 className="font-black text-xs text-indigo-700 bg-indigo-50/50 px-3 py-1 rounded-md inline-block">
                      Parent Teams Standings (Level 1)
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                            <th className="p-2 w-10 text-center">Rank</th>
                            <th className="p-2">Team Name</th>
                            <th className="p-2">Root Group</th>
                            <th className="p-2 text-center text-emerald-600">Wins</th>
                            <th className="p-2 text-center text-rose-500">Losses</th>
                            <th className="p-2 text-center bg-indigo-50/30 text-indigo-600 font-black">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedParentTeams.map((pt, idx) => (
                            <tr key={pt.name} className="hover:bg-slate-50/50 transition">
                              <td className="p-2 text-center font-bold text-slate-400">#{idx + 1}</td>
                              <td className="p-2 font-extrabold text-slate-800">{pt.name}</td>
                              <td className="p-2 text-slate-500 font-semibold">{pt.rootName}</td>
                              <td className="p-2 text-center font-bold text-emerald-600">{pt.wins}</td>
                              <td className="p-2 text-center font-bold text-rose-500">{pt.losses}</td>
                              <td className="p-2 text-center font-black text-indigo-600 bg-indigo-50/20">{pt.points} Pts</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Roots Standings Card */}
                  <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-3">
                    <h4 className="font-black text-xs text-amber-700 bg-amber-50/50 px-3 py-1 rounded-md inline-block">
                      Root Bases Standings
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                            <th className="p-2 w-10 text-center">Rank</th>
                            <th className="p-2">Root Name</th>
                            <th className="p-2 text-center text-emerald-600">Wins</th>
                            <th className="p-2 text-center text-rose-500">Losses</th>
                            <th className="p-2 text-center bg-amber-50/30 text-amber-700 font-black">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedRoots.map((rt, idx) => (
                            <tr key={rt.name} className="hover:bg-slate-50/50 transition">
                              <td className="p-2 text-center font-bold text-slate-400">#{idx + 1}</td>
                              <td className="p-2 font-extrabold text-slate-800">{rt.name}</td>
                              <td className="p-2 text-center font-bold text-emerald-600">{rt.wins}</td>
                              <td className="p-2 text-center font-bold text-rose-500">{rt.losses}</td>
                              <td className="p-2 text-center font-black text-amber-700 bg-amber-50/20">{rt.points} Pts</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {Object.keys(groupRankings).length === 0 ? (
              <div className="bg-white border border-slate-100 p-10 rounded-3xl text-center shadow-sm">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-extrabold text-slate-800">No Groups Found</h3>
                <p className="text-slate-500 text-sm mt-1">Please create groups and complete matches to view standings.</p>
              </div>
            ) : (
              Object.entries(groupRankings).sort((a, b) => {
                const wA = getGroupOrderWeight(a[0]);
                const wB = getGroupOrderWeight(b[0]);
                if (wA !== wB) return wA - wB;
                return a[0].localeCompare(b[0]);
              }).map(([groupName, sortedPlayers]) => (
                <div key={groupName} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-base text-indigo-700 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full inline-block">
                      {groupName} Standings
                    </h3>
                    <span className="text-[10px] font-black tracking-widest text-emerald-600 uppercase bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Top 2 Promoted
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-150">
                    <table className="min-w-[1000px] w-full border-collapse text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-extrabold uppercase">
                          <th className="p-3 text-center w-12 whitespace-nowrap">Rank</th>
                          <th className="p-3 whitespace-nowrap">Player / Team</th>
                          <th className="p-3 text-center font-bold whitespace-nowrap">Played</th>
                          <th className="p-3 text-center text-emerald-600 font-bold whitespace-nowrap">W</th>
                          <th className="p-3 text-center text-rose-600 font-bold whitespace-nowrap">L</th>
                          <th className="p-3 text-center text-indigo-600 font-extrabold whitespace-nowrap">Points</th>
                          <th className="p-3 text-center text-indigo-500 font-bold whitespace-nowrap">Parent Team Wins</th>
                          <th className="p-3 text-center text-amber-600 font-bold whitespace-nowrap">Root Wins</th>
                          <th className="p-3 text-center font-semibold whitespace-nowrap">Sets Won</th>
                          <th className="p-3 text-center font-semibold whitespace-nowrap">Sets Lost</th>
                          <th className="p-3 text-center whitespace-nowrap">Set Diff</th>
                          <th className="p-3 text-center whitespace-nowrap">Pts Scored</th>
                          <th className="p-3 text-center whitespace-nowrap">Pts Against</th>
                          <th className="p-3 text-center whitespace-nowrap">Pt Diff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {sortedPlayers.map((p, idx) => {
                          const isPromoted = idx < 2; // Top 2 qualify
                          return (
                            <tr 
                              key={p.playerName} 
                              className={`hover:bg-slate-50/50 transition ${
                                isPromoted ? 'bg-emerald-50/20 border-l-4 border-l-emerald-500' : ''
                              }`}
                            >
                              {/* Rank position */}
                              <td className="p-3 text-center font-mono">
                                {idx === 0 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-black text-[11px] shadow-sm">
                                    1st
                                  </span>
                                ) : idx === 1 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-[11px] shadow-sm">
                                    2nd
                                  </span>
                                ) : (
                                  <span className="font-extrabold text-slate-400">{idx + 1}</span>
                                )}
                              </td>

                              {/* Player Name */}
                              <td 
                                className="p-3 cursor-pointer group/cell whitespace-nowrap"
                                onClick={() => setSelectedPlayerForMatches({ id: p.playerId, name: p.playerName })}
                                title="Click to view all matches for this player"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-800 text-sm group-hover/cell:text-indigo-600 transition-colors flex items-center gap-1">
                                      {p.playerName}
                                      <TrendingUp className="w-3.5 h-3.5 text-slate-300 group-hover/cell:text-indigo-500 transition-colors shrink-0" />
                                    </span>
                                    {isPromoted && (
                                      <span className="text-[8px] font-black text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">
                                        Qualified
                                      </span>
                                    )}
                                  </div>
                                  {(playerL1Map[p.playerId] || playerL2Map[p.playerId] || (p.partnerId && (playerL1Map[p.partnerId] || playerL2Map[p.partnerId]))) && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      {playerL1Map[p.playerId] && (
                                        <span className="text-[8px] font-bold text-slate-500 bg-slate-100 border border-slate-200/60 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Player Level 1">
                                          {playerL1Map[p.playerId]}
                                        </span>
                                      )}
                                      {playerL2Map[p.playerId] && (
                                        <span className="text-[8px] font-black text-indigo-700 bg-indigo-50 border border-indigo-150 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Player Level 2">
                                          {playerL2Map[p.playerId]}
                                        </span>
                                      )}
                                      {p.partnerId && playerL1Map[p.partnerId] && playerL1Map[p.partnerId] !== playerL1Map[p.playerId] && (
                                        <span className="text-[8px] font-bold text-slate-500 bg-slate-100 border border-slate-200/60 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Partner Level 1">
                                          {playerL1Map[p.partnerId]}
                                        </span>
                                      )}
                                      {p.partnerId && playerL2Map[p.partnerId] && playerL2Map[p.partnerId] !== playerL2Map[p.playerId] && (
                                        <span className="text-[8px] font-black text-indigo-700 bg-indigo-50 border border-indigo-150 px-1.5 py-0.25 rounded uppercase tracking-wider" title="Partner Level 2">
                                          {playerL2Map[p.partnerId]}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Played / Wins / Losses */}
                              <td className="p-3 text-center text-slate-600 font-bold whitespace-nowrap">{p.played}</td>
                              <td className="p-3 text-center font-bold text-emerald-600 whitespace-nowrap">{p.wins}</td>
                              <td className="p-3 text-center font-bold text-rose-600 whitespace-nowrap">{p.losses}</td>

                               {/* Total Standing Points */}
                              <td className="p-3 text-center font-black text-sm text-indigo-600 whitespace-nowrap">
                                {p.matchPoints}
                              </td>

                              {/* Parent Team Wins */}
                              <td className="p-3 text-center whitespace-nowrap">
                                {(() => {
                                  const pL1 = playerL1Map[p.playerId] || (p.partnerId && playerL1Map[p.partnerId]);
                                  if (pL1) {
                                    const stat = hierarchyStats.parentStatsMap[pL1];
                                    return (
                                      <div className="flex flex-col items-center justify-center">
                                        <span className="font-extrabold text-indigo-600 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-full text-[10px]">
                                          {stat ? `${stat.wins}W - ${stat.losses}L` : '0W - 0L'}
                                        </span>
                                        <span className="text-[8px] text-slate-400 mt-0.5 font-bold uppercase truncate max-w-[100px]" title={pL1}>
                                          {pL1}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return <span className="text-slate-300">-</span>;
                                })()}
                              </td>

                              {/* Root Wins */}
                              <td className="p-3 text-center whitespace-nowrap">
                                {(() => {
                                  const pRoot = playerRootMap[p.playerId] || (p.partnerId && playerRootMap[p.partnerId]);
                                  if (pRoot) {
                                    const stat = hierarchyStats.rootStatsMap[pRoot];
                                    return (
                                      <div className="flex flex-col items-center justify-center">
                                        <span className="font-extrabold text-amber-600 bg-amber-50/80 border border-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                                          {stat ? `${stat.wins}W - ${stat.losses}L` : '0W - 0L'}
                                        </span>
                                        <span className="text-[8px] text-slate-400 mt-0.5 font-bold uppercase truncate max-w-[100px]" title={pRoot}>
                                          {pRoot}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return <span className="text-slate-300">-</span>;
                                })()}
                              </td>

                              {/* Sets Won / Lost */}
                              <td className="p-3 text-center font-mono whitespace-nowrap">{p.gamesWon}</td>
                              <td className="p-3 text-center font-mono whitespace-nowrap">{p.gamesLost}</td>
                              <td className={`p-3 text-center font-mono font-bold whitespace-nowrap ${p.gameDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {p.gameDiff > 0 ? `+${p.gameDiff}` : p.gameDiff}
                              </td>

                              {/* Points Scored / Against / Diff */}
                              <td className="p-3 text-center text-slate-500 font-mono whitespace-nowrap">{p.pointsScored}</td>
                              <td className="p-3 text-center text-slate-500 font-mono whitespace-nowrap">{p.pointsAgainst}</td>
                              <td className={`p-3 text-center font-mono font-bold whitespace-nowrap ${p.pointDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {p.pointDiff > 0 ? `+${p.pointDiff}` : p.pointDiff}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}

        {/* 2. KNOCKOUT BRACKET VISUALIZER TAB */}
        {activeTab === 'brackets' && (
          <motion.div
            key="brackets"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Quick alert if no brackets scheduled */}
            {preQuarters.length === 0 && quarters.length === 0 && semis.length === 0 && finals.length === 0 && (
              <div className="bg-white border border-slate-100 p-10 rounded-3xl text-center shadow-sm">
                <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h4 className="font-extrabold text-slate-800">No Bracket Matches Scheduled</h4>
                <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
                  To start your knockout stages, visit the <strong className="text-indigo-600">Stage Planner</strong> tab to automatically or manually promote your top group leaders.
                </p>
                <button
                  onClick={() => setActiveTab('schedule')}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs transition"
                >
                  Configure Stages & Seeding
                </button>
              </div>
            )}

            {preQuarters.length > 0 || quarters.length > 0 || semis.length > 0 || finals.length > 0 ? (
              <div 
                ref={bracketContainerRef} 
                className="overflow-x-auto pb-6 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin select-none"
              >
                <div className="relative min-w-[1150px] pb-4 pr-12">
                  
                  {/* Dynamic SVG Connection Overlay */}
                  <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
                    {connections.map((conn, i) => (
                      <path
                        key={i}
                        d={conn.path}
                        fill="none"
                        stroke={conn.isCompleted ? '#6366f1' : '#cbd5e1'}
                        strokeWidth={conn.isCompleted ? '3' : '2'}
                        strokeDasharray={conn.isCompleted ? undefined : '4 4'}
                        className="transition-all duration-300"
                      />
                    ))}
                  </svg>

                  {/* Symmetrical Columns Row */}
                  <div className={`relative z-20 grid ${preQuarters.length > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-16 items-stretch min-h-[720px]`}>
                    
                    {/* STAGE PQ: PRE-QUARTERS */}
                    {preQuarters.length > 0 && (
                      <div className="flex flex-col justify-between h-full space-y-4">
                        <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
                          <span className="font-black text-xs uppercase tracking-widest text-indigo-400">Pre-Quarters</span>
                          <span className="text-[10px] bg-indigo-950 px-2 py-0.5 rounded font-bold font-mono">{preQuarters.length} Matches</span>
                        </div>
                        <div className="flex flex-col justify-around flex-grow py-4 space-y-4">
                          {preQuarters.map((f, idx) => renderBracketMatchCard(f, idx, 'PQ'))}
                        </div>
                      </div>
                    )}

                    {/* STAGE QF: QUARTER FINALS */}
                    <div className="flex flex-col justify-between h-full space-y-4">
                      <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
                        <span className="font-black text-xs uppercase tracking-widest text-indigo-400">Quarter Finals</span>
                        <span className="text-[10px] bg-indigo-950 px-2 py-0.5 rounded font-bold font-mono">
                          {quarters.length > 0 ? `${quarters.length} Matches` : '4 Slots'}
                        </span>
                      </div>
                      <div className="flex flex-col justify-around flex-grow py-4 space-y-4">
                        {(quarters.length > 0 ? quarters : Array(4).fill(null)).map((f, idx) => 
                          f ? renderBracketMatchCard(f, idx, 'QF') : renderBracketPlaceholderCard('QF', idx)
                        )}
                      </div>
                    </div>

                    {/* STAGE SF: SEMI FINALS */}
                    <div className="flex flex-col justify-between h-full space-y-4">
                      <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
                        <span className="font-black text-xs uppercase tracking-widest text-emerald-400">Semi Finals</span>
                        <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded font-bold font-mono">
                          {semis.length > 0 ? `${semis.length} Matches` : '2 Slots'}
                        </span>
                      </div>
                      <div className="flex flex-col justify-around flex-grow py-4 space-y-4">
                        {(semis.length > 0 ? semis : Array(2).fill(null)).map((f, idx) => 
                          f ? renderBracketMatchCard(f, idx, 'SF') : renderBracketPlaceholderCard('SF', idx)
                        )}
                      </div>
                    </div>

                    {/* STAGE FINAL: GRAND FINAL */}
                    <div className="flex flex-col justify-between h-full space-y-4">
                      <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
                        <span className="font-black text-xs uppercase tracking-widest text-amber-400">Grand Final</span>
                        <span className="text-[10px] bg-amber-950 px-2 py-0.5 rounded font-bold font-mono">
                          {finals.length > 0 ? '1 Match' : '1 Slot'}
                        </span>
                      </div>
                      <div className="flex flex-col justify-around flex-grow py-4 space-y-4">
                        {(finals.length > 0 ? finals : Array(1).fill(null)).map((f, idx) => 
                          f ? renderBracketMatchCard(f, idx, 'FINAL', true) : renderBracketPlaceholderCard('FINAL', idx)
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* 4. PLAYER LEADERBOARDS TAB */}
        {activeTab === 'leaderboards' && (
          <motion.div
            key="leaderboards"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Control Panel: Search & Select Metric */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search player name..."
                  value={leaderboardSearch}
                  onChange={(e) => setLeaderboardSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs font-bold rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              {/* Metric Selectors */}
              <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                <button
                  onClick={() => setLeaderboardSort('pointsScored')}
                  className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 ${
                    leaderboardSort === 'pointsScored' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  🎯 Top Scorers
                </button>
                <button
                  onClick={() => setLeaderboardSort('longestStreak')}
                  className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 ${
                    leaderboardSort === 'longestStreak' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  🔥 Win Streak
                </button>
                <button
                  onClick={() => setLeaderboardSort('pointDiff')}
                  className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 ${
                    leaderboardSort === 'pointDiff' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ⚖️ Point Diff
                </button>
                <button
                  onClick={() => setLeaderboardSort('winRate')}
                  className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 ${
                    leaderboardSort === 'winRate' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  📈 Win Rate %
                </button>
              </div>
            </div>

            {filteredLeaderboard.length === 0 ? (
              <div className="bg-white border border-slate-100 p-10 rounded-3xl text-center shadow-sm">
                <HelpCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="font-extrabold text-slate-800">No Leaders Found</h4>
                <p className="text-slate-400 text-xs mt-1">
                  {leaderboardSearch ? 'Try a different search query' : 'Complete group matches to compute individual performance metrics!'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* TOP 3 PODIUM */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                  
                  {/* 2nd Place (Silver) */}
                  {filteredLeaderboard[1] && (
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-3xl shadow-sm text-center relative overflow-hidden order-2 md:order-1 md:h-64 flex flex-col justify-center">
                      <div className="absolute top-3 right-3 bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1 rounded-full">
                        RANK #2
                      </div>
                      <div className="w-11 h-11 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-3.5 shadow-sm">
                        <Award className="w-6 h-6 text-slate-500" />
                      </div>
                      <h4 className="font-black text-slate-800 tracking-tight leading-snug">{filteredLeaderboard[1].name}</h4>
                      <p className="text-[10px] font-extrabold text-slate-400 uppercase mt-0.5 tracking-wider">Silver Medalist</p>
                      
                      <div className="mt-4 inline-block bg-white border border-slate-100 rounded-2xl px-3.5 py-2 mx-auto">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {leaderboardSort === 'pointsScored' && 'Points Scored'}
                          {leaderboardSort === 'longestStreak' && 'Winning Streak'}
                          {leaderboardSort === 'pointDiff' && 'Point Differential'}
                          {leaderboardSort === 'winRate' && 'Win Rate %'}
                        </p>
                        <p className="text-lg font-black text-slate-800 mt-0.5">
                          {leaderboardSort === 'pointsScored' && `${filteredLeaderboard[1].pointsScored} pts`}
                          {leaderboardSort === 'longestStreak' && `${filteredLeaderboard[1].longestStreak} wins`}
                          {leaderboardSort === 'pointDiff' && (filteredLeaderboard[1].pointDiff > 0 ? `+${filteredLeaderboard[1].pointDiff}` : filteredLeaderboard[1].pointDiff)}
                          {leaderboardSort === 'winRate' && `${filteredLeaderboard[1].winRate.toFixed(1)}%`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 1st Place (Gold) */}
                  {filteredLeaderboard[0] && (
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300/60 p-6 rounded-3xl shadow-md text-center relative overflow-hidden order-1 md:order-2 md:h-72 flex flex-col justify-center ring-4 ring-amber-300/10">
                      <div className="absolute top-3 right-3 bg-amber-400 text-amber-950 font-black text-[10px] px-3 py-1 rounded-full shadow-sm">
                        CHAMPION #1
                      </div>
                      <div className="w-14 h-14 bg-amber-100 border border-amber-300/40 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm animate-bounce">
                        <Trophy className="w-8 h-8 text-amber-600" />
                      </div>
                      <h4 className="font-black text-slate-900 text-lg tracking-tight leading-snug">{filteredLeaderboard[0].name}</h4>
                      <p className="text-[10px] font-black text-amber-600 uppercase mt-0.5 tracking-wider">Tournament Gold</p>
                      
                      <div className="mt-5 inline-block bg-white border border-amber-100 rounded-2xl px-4 py-2.5 mx-auto shadow-sm">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                          {leaderboardSort === 'pointsScored' && 'Points Scored'}
                          {leaderboardSort === 'longestStreak' && 'Winning Streak'}
                          {leaderboardSort === 'pointDiff' && 'Point Differential'}
                          {leaderboardSort === 'winRate' && 'Win Rate %'}
                        </p>
                        <p className="text-xl font-black text-slate-900 mt-0.5">
                          {leaderboardSort === 'pointsScored' && `${filteredLeaderboard[0].pointsScored} pts`}
                          {leaderboardSort === 'longestStreak' && `${filteredLeaderboard[0].longestStreak} wins`}
                          {leaderboardSort === 'pointDiff' && (filteredLeaderboard[0].pointDiff > 0 ? `+${filteredLeaderboard[0].pointDiff}` : filteredLeaderboard[0].pointDiff)}
                          {leaderboardSort === 'winRate' && `${filteredLeaderboard[0].winRate.toFixed(1)}%`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 3rd Place (Bronze) */}
                  {filteredLeaderboard[2] && (
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-3xl shadow-sm text-center relative overflow-hidden order-3 md:h-64 flex flex-col justify-center">
                      <div className="absolute top-3 right-3 bg-amber-100 text-amber-800 font-extrabold text-[10px] px-2.5 py-1 rounded-full">
                        RANK #3
                      </div>
                      <div className="w-11 h-11 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3.5 shadow-sm">
                        <Award className="w-6 h-6 text-amber-700" />
                      </div>
                      <h4 className="font-black text-slate-800 tracking-tight leading-snug">{filteredLeaderboard[2].name}</h4>
                      <p className="text-[10px] font-extrabold text-amber-700/80 uppercase mt-0.5 tracking-wider">Bronze Medalist</p>
                      
                      <div className="mt-4 inline-block bg-white border border-slate-100 rounded-2xl px-3.5 py-2 mx-auto">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {leaderboardSort === 'pointsScored' && 'Points Scored'}
                          {leaderboardSort === 'longestStreak' && 'Winning Streak'}
                          {leaderboardSort === 'pointDiff' && 'Point Differential'}
                          {leaderboardSort === 'winRate' && 'Win Rate %'}
                        </p>
                        <p className="text-lg font-black text-slate-800 mt-0.5">
                          {leaderboardSort === 'pointsScored' && `${filteredLeaderboard[2].pointsScored} pts`}
                          {leaderboardSort === 'longestStreak' && `${filteredLeaderboard[2].longestStreak} wins`}
                          {leaderboardSort === 'pointDiff' && (filteredLeaderboard[2].pointDiff > 0 ? `+${filteredLeaderboard[2].pointDiff}` : filteredLeaderboard[2].pointDiff)}
                          {leaderboardSort === 'winRate' && `${filteredLeaderboard[2].winRate.toFixed(1)}%`}
                        </p>
                      </div>
                    </div>
                  )}

                </div>

                {/* OTHER PLAYERS DETAILS TABLE */}
                <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                  <div className="p-4 bg-slate-50 border-b border-slate-100">
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-600">Leaderboard Rankings</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-extrabold bg-slate-50/50 uppercase text-[10px]">
                          <th className="p-3.5 text-center w-12">Rank</th>
                          <th className="p-3.5">Player Name</th>
                          <th className="p-3.5 text-center">Matches</th>
                          <th className="p-3.5 text-center">Wins</th>
                          <th className="p-3.5 text-center">Losses</th>
                          <th className="p-3.5 text-center">Points Scored</th>
                          <th className="p-3.5 text-center">Points Against</th>
                          <th className="p-3.5 text-center">Point Diff</th>
                          <th className="p-3.5 text-center">Win Rate</th>
                          <th className="p-3.5 text-center">Longest Streak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeaderboard.map((p, idx) => {
                          const isTopThree = idx < 3;
                          return (
                            <tr 
                              key={p.id}
                              className={`border-b border-slate-50 hover:bg-slate-50/50 transition font-bold text-slate-700 ${
                                isTopThree ? 'bg-indigo-50/10' : ''
                              }`}
                            >
                              <td className="p-3.5 text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-[11px] ${
                                  idx === 0 ? 'bg-amber-100 text-amber-800' :
                                  idx === 1 ? 'bg-slate-100 text-slate-800' :
                                  idx === 2 ? 'bg-orange-100 text-orange-800' :
                                  'text-slate-400'
                                }`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="p-3.5">
                                <div className="font-black text-slate-800">{p.name}</div>
                              </td>
                              <td className="p-3.5 text-center font-mono text-slate-600">{p.matchesPlayed}</td>
                              <td className="p-3.5 text-center text-emerald-600 font-mono">{p.wins}</td>
                              <td className="p-3.5 text-center text-rose-500 font-mono">{p.losses}</td>
                              <td className="p-3.5 text-center font-mono text-slate-600">{p.pointsScored}</td>
                              <td className="p-3.5 text-center font-mono text-slate-600">{p.pointsAgainst}</td>
                              <td className={`p-3.5 text-center font-mono ${p.pointDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {p.pointDiff > 0 ? `+${p.pointDiff}` : p.pointDiff}
                              </td>
                              <td className="p-3.5 text-center text-indigo-600 font-mono">{p.winRate.toFixed(1)}%</td>
                              <td className="p-3.5 text-center font-mono text-amber-600">
                                <span className="inline-flex items-center gap-0.5">
                                  <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                                  {p.longestStreak}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </motion.div>
        )}

        {/* 3. STAGE PLANNER & AUTOMATED GENERATOR */}
        {activeTab === 'schedule' && (
          <motion.div
            key="schedule"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Seeding & Pathway board */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left Column: Seeding Helpers */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-extrabold text-base text-slate-800">Automatic Seeding Assistant</h3>
                </div>

                <p className="text-slate-500 text-xs leading-relaxed font-medium">
                  Advance top players automatically from current group standings. Select the stage below to query the top seeds and build the bracket.
                </p>

                <div className="space-y-3">
                  {/* Pre-Quarters Seeding Card */}
                  <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wider text-slate-800">Pre-Quarter Finals (Top 16)</h4>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Seedy crossover: Top players from Group A and Group B paired up.</p>
                    </div>
                    <button
                      onClick={autoGeneratePreQuarters}
                      disabled={generating}
                      className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-black text-xs rounded-xl shadow-sm transition shrink-0 disabled:opacity-50"
                    >
                      {generating ? "Seeding..." : "Auto-Seed PQ"}
                    </button>
                  </div>

                  {/* Quarters Seeding Card */}
                  <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wider text-slate-800">Quarter Finals (Top 8)</h4>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Seedy crossover: Winner of Group A vs Runner-up Group B, etc.</p>
                    </div>
                    <button
                      onClick={autoGenerateQuarters}
                      disabled={generating}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-sm transition shrink-0 disabled:opacity-50"
                    >
                      {generating ? "Seeding..." : "Auto-Seed QF"}
                    </button>
                  </div>

                  {/* Semis Seeding Card */}
                  <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wider text-slate-800">Semi Finals (Top 4)</h4>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Seeds QF winners. If no QFs, seeds Group Winners and Runners directly.</p>
                    </div>
                    <button
                      onClick={autoGenerateSemis}
                      disabled={generating}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-sm transition shrink-0 disabled:opacity-50"
                    >
                      {generating ? "Seeding..." : "Auto-Seed SF"}
                    </button>
                  </div>

                  {/* Final Seeding Card */}
                  <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wider text-slate-800">Grand Championship Final</h4>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Pairs the two completed Semi-Final winners for the ultimate duel.</p>
                    </div>
                    <button
                      onClick={autoGenerateFinals}
                      disabled={generating}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-sm transition shrink-0 disabled:opacity-50"
                    >
                      {generating ? "Seeding..." : "Auto-Seed Final"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Custom Seeding Manual Selections */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3 justify-between">
                  <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-extrabold text-base text-slate-800">Manual Stage Bracket Seeder</h3>
                  </div>
                </div>

                {/* Format Toggle: Singles vs Doubles */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Match Format</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setManualIsDoubles(false)}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        !manualIsDoubles 
                          ? 'bg-white text-slate-800 shadow-xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      👤 Singles
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualIsDoubles(true)}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        manualIsDoubles 
                          ? 'bg-white text-slate-800 shadow-xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      👥 Doubles / Mixed
                    </button>
                  </div>
                </div>

                {manualIsDoubles && (
                  <div className="space-y-3">
                    {/* Doubles Mode Selector */}
                    <div className="flex gap-4 border-b border-slate-100 pb-2">
                      <button
                        type="button"
                        onClick={() => setDoublesSelectionMode('pair')}
                        className={`text-xs font-extrabold pb-1 border-b-2 transition cursor-pointer ${
                          doublesSelectionMode === 'pair' 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        Select Registered Pairs
                      </button>
                      <button
                        type="button"
                        onClick={() => setDoublesSelectionMode('custom')}
                        className={`text-xs font-extrabold pb-1 border-b-2 transition cursor-pointer ${
                          doublesSelectionMode === 'custom' 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        Custom Pair Combo
                      </button>
                    </div>

                    {doublesSelectionMode === 'pair' ? (
                      <div className="space-y-3.5">
                        {/* Team 1 Pair Selection */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select Opponent Team 1</label>
                          <select 
                            value={selectedPair1} 
                            onChange={e => setSelectedPair1(e.target.value)} 
                            className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                          >
                            <option value="">Choose Team (Pair)</option>
                            {registeredPairs.map(pair => (
                              <option key={pair.id} value={pair.id}>
                                {pair.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Team 2 Pair Selection */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select Opponent Team 2</label>
                          <select 
                            value={selectedPair2} 
                            onChange={e => setSelectedPair2(e.target.value)} 
                            className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                          >
                            <option value="">Choose Team (Pair)</option>
                            {registeredPairs.map(pair => (
                              <option key={pair.id} value={pair.id}>
                                {pair.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Custom Team 1 Selections */}
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150 space-y-3">
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block">Opponent Team 1</span>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1 text-left">
                              <label className="text-[9px] font-bold text-slate-400 block">Player A</label>
                              <select 
                                value={selectedP1a} 
                                onChange={e => setSelectedP1a(e.target.value)} 
                                className="w-full border border-slate-200 p-2 rounded-lg bg-white font-bold text-xs"
                              >
                                <option value="">Select...</option>
                                {players.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1 text-left">
                              <label className="text-[9px] font-bold text-slate-400 block">Player B</label>
                              <select 
                                value={selectedP1b} 
                                onChange={e => setSelectedP1b(e.target.value)} 
                                className="w-full border border-slate-200 p-2 rounded-lg bg-white font-bold text-xs"
                              >
                                <option value="">Select...</option>
                                {players.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Custom Team 2 Selections */}
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150 space-y-3">
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block">Opponent Team 2</span>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1 text-left">
                              <label className="text-[9px] font-bold text-slate-400 block">Player A</label>
                              <select 
                                value={selectedP2a} 
                                onChange={e => setSelectedP2a(e.target.value)} 
                                className="w-full border border-slate-200 p-2 rounded-lg bg-white font-bold text-xs"
                              >
                                <option value="">Select...</option>
                                {players.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1 text-left">
                              <label className="text-[9px] font-bold text-slate-400 block">Player B</label>
                              <select 
                                value={selectedP2b} 
                                onChange={e => setSelectedP2b(e.target.value)} 
                                className="w-full border border-slate-200 p-2 rounded-lg bg-white font-bold text-xs"
                              >
                                <option value="">Select...</option>
                                {players.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!manualIsDoubles && (
                  <div className="space-y-4">
                    {/* Player 1 Selection */}
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select Opponent 1</label>
                      <select 
                        value={selectedP1} 
                        onChange={e => setSelectedP1(e.target.value)} 
                        className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      >
                        <option value="">Choose Player/Team</option>
                        {players.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Player 2 Selection */}
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select Opponent 2</label>
                      <select 
                        value={selectedP2} 
                        onChange={e => setSelectedP2(e.target.value)} 
                        className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      >
                        <option value="">Choose Player/Team</option>
                        {players.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Stage & Target Point Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Knockout Stage</label>
                    <select 
                      value={selectedStage} 
                      onChange={e => setSelectedStage(e.target.value as any)} 
                      className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                    >
                      <option value="pre_quarter">Pre-Quarter</option>
                      <option value="quarter">Quarter Final</option>
                      <option value="semi">Semi Final</option>
                      <option value="final">Final</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Points Target</label>
                    <select 
                      value={pointsTarget} 
                      onChange={e => setPointsTarget(e.target.value)} 
                      className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                    >
                      <option value="11">11 Points</option>
                      <option value="15">15 Points</option>
                      <option value="21">21 Points</option>
                    </select>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  onClick={scheduleKnockoutManual}
                  disabled={generating}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Create Custom Stage Fixture
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal for Fixture Deletion */}
      <AnimatePresence>
        {fixtureToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFixtureToDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            {/* Modal Box */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl relative z-10 border border-slate-100"
            >
              <div className="flex items-center gap-3 text-rose-600 mb-3.5">
                <div className="p-2 bg-rose-50 rounded-xl">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-slate-900">Delete Fixture?</h3>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Are you sure you want to delete this knockout fixture between <strong className="text-slate-800 font-bold">{fixtureToDelete.player1Name}</strong> and <strong className="text-slate-800 font-bold">{fixtureToDelete.player2Name}</strong>? This will also clean up any associated matches. This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setFixtureToDelete(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteFixture(fixtureToDelete.id)}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition"
                >
                  Delete Fixture
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Player Match History Modal */}
      <AnimatePresence>
        {selectedPlayerForMatches && (
          <PlayerMatchesModal
            playerId={selectedPlayerForMatches.id}
            playerName={selectedPlayerForMatches.name}
            tournamentId={tournamentId}
            onClose={() => setSelectedPlayerForMatches(null)}
            playerL1Map={playerL1Map}
            playerL2Map={playerL2Map}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
