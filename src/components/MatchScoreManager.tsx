import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  updateDoc, 
  doc, 
  getDocs, 
  deleteDoc,
  increment,
  where
} from 'firebase/firestore';
import { 
  Trophy, 
  Play, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  RotateCcw, 
  Search, 
  Award,
  ChevronRight,
  Sparkles,
  Info,
  Minus,
  Plus,
  RefreshCw,
  Shuffle,
  ChevronLeft,
  Copy,
  Check
} from 'lucide-react';

export default function MatchScoreManager({ 
  tournamentId, 
  onNext,
  userRole = 'user'
}: { 
  tournamentId: string; 
  onNext: () => void;
  userRole?: 'admin' | 'scorer' | 'user';
}) {
  const canScore = userRole === 'admin' || userRole === 'scorer';
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [scores, setScores] = useState<any>({});
  const [activeFixtureId, setActiveFixtureId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<string[]>(['Court 1', 'Court 2', 'Court 3', 'Court 4', 'Court 5', 'Court 6']);
  const [tournament, setTournament] = useState<any | null>(null);

  // Hierarchy tracking states for L2 Data
  const [roots, setRoots] = useState<any[]>([]);
  const [allRootsLevel1, setAllRootsLevel1] = useState<any[]>([]);
  const [allRootsLevel2, setAllRootsLevel2] = useState<any[]>([]);
  const [allRootsPlayers, setAllRootsPlayers] = useState<any[]>([]);

  // Set-by-set & Court interactive state
  const [currentSetIndex, setCurrentSetIndex] = useState<number>(1);
  const [servingPlayer, setServingPlayer] = useState<'player1' | 'player2' | null>(null);
  const [isSwapped, setIsSwapped] = useState<boolean>(false);

  // Set-by-set completed popup state
  const [completedSetPopup, setCompletedSetPopup] = useState<{
    setIndex: number;
    winnerName: string;
    winnerKey: 'player1' | 'player2';
    scoreStr: string;
    isMatchOver: boolean;
    matchWinnerName: string;
    fixtureId: string;
  } | null>(null);

  // OBS Stream URL Copy State
  const [copiedFixtureId, setCopiedFixtureId] = useState<string | null>(null);
  const [copiedCourtName, setCopiedCourtName] = useState<string | null>(null);

  const copyObsUrl = (fixtureId: string) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('view', 'obs');
    url.searchParams.set('tournamentId', tournamentId);
    url.searchParams.set('fixtureId', fixtureId);
    
    navigator.clipboard.writeText(url.toString());
    setCopiedFixtureId(fixtureId);
    setTimeout(() => setCopiedFixtureId(null), 2500);
  };

  const copyCourtObsUrl = (courtName: string) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('view', 'obs');
    url.searchParams.set('tournamentId', tournamentId);
    url.searchParams.set('court', courtName);
    
    navigator.clipboard.writeText(url.toString());
    setCopiedCourtName(courtName);
    setTimeout(() => setCopiedCourtName(null), 2500);
  };

  // Subscribe to fixtures
  useEffect(() => {
    const qFixtures = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribeFixtures = onSnapshot(qFixtures,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setFixtures(data);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/fixtures`)
    );

    // Subscribe to completed match results
    const qMatches = query(collection(db, `tournaments/${tournamentId}/matches`));
    const unsubscribeMatches = onSnapshot(qMatches,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMatches(data);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/matches`)
    );

    // Subscribe to tournament document for custom courts
    const unsubscribeTournament = onSnapshot(doc(db, 'tournaments', tournamentId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setTournament({ id: snapshot.id, ...data });
          if (data && data.courts && Array.isArray(data.courts) && data.courts.length > 0) {
            setCourts(data.courts);
          }
        }
      },
      (error) => console.error("Error fetching tournament courts:", error)
    );

    return () => {
      unsubscribeFixtures();
      unsubscribeMatches();
      unsubscribeTournament();
    };
  }, [tournamentId]);

  // Fetch roots, level1s, level2s, and players assignments for L2 Data
  useEffect(() => {
    if (!tournamentId) return;
    const qRoots = query(collection(db, `tournaments/${tournamentId}/roots`));
    const unsubscribeRoots = onSnapshot(qRoots, (snapshot) => {
      setRoots(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error("Error fetching roots in MatchScoreManager:", e));
    return () => unsubscribeRoots();
  }, [tournamentId]);

  useEffect(() => {
    if (roots.length === 0 || !tournamentId) {
      setAllRootsLevel1([]);
      return;
    }
    const unsubscribes = roots.map(root => {
      const q = query(collection(db, `tournaments/${tournamentId}/roots/${root.id}/level1`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsLevel1(prev => {
          const filtered = prev.filter(item => item.rootId !== root.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, rootId: root.id, rootName: root.name, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching level1s in MatchScoreManager:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [roots, tournamentId]);

  useEffect(() => {
    if (allRootsLevel1.length === 0 || !tournamentId) {
      setAllRootsLevel2([]);
      return;
    }
    const unsubscribes = allRootsLevel1.map(l1 => {
      const q = query(collection(db, `tournaments/${tournamentId}/roots/${l1.rootId}/level1/${l1.id}/level2`));
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
      }, (err) => console.error("Error fetching level2s in MatchScoreManager:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel1, tournamentId]);

  useEffect(() => {
    if (allRootsLevel2.length === 0 || !tournamentId) {
      setAllRootsPlayers([]);
      return;
    }
    const unsubscribes = allRootsLevel2.map(l2 => {
      const q = query(collection(db, `tournaments/${tournamentId}/roots/${l2.rootId}/level1/${l2.level1Id}/level2/${l2.id}/players`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsPlayers(prev => {
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
      }, (err) => console.error("Error fetching assigned players in MatchScoreManager:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel2, tournamentId]);

  const playerL2Map = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level2Name]));

  // Helper to check if a set is completed by professional rules
  const isSetFinished = (p1: number, p2: number, pointsTarget: number) => {
    const target = pointsTarget || 21;
    if (p1 >= target || p2 >= target) {
      if (Math.abs(p1 - p2) >= 2) return true;
      if (p1 === 30 || p2 === 30) return true;
    }
    return false;
  };

  // Sync scores state whenever activeFixtureId changes
  useEffect(() => {
    if (activeFixtureId) {
      const matchDoc = matches.find(m => m.fixtureId === activeFixtureId);
      const fixtureDoc = fixtures.find(f => f.id === activeFixtureId);
      
      let s = { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
      if (matchDoc && matchDoc.scores) {
        s = { ...matchDoc.scores };
      } else if (fixtureDoc && fixtureDoc.scores) {
        s = { ...fixtureDoc.scores };
      } else if (scores[activeFixtureId]) {
        s = { ...scores[activeFixtureId] };
      }

      setScores((prev: any) => ({
        ...prev,
        [activeFixtureId]: s
      }));

      // Auto-detect recommended active set
      if (fixtureDoc) {
        const target = Number(fixtureDoc.pointsTarget) || (fixtureDoc.matchType === 'league' ? 15 : 21);
        const g1Done = isSetFinished(s.p1g1, s.p2g1, target);
        const g2Done = isSetFinished(s.p1g2, s.p2g2, target);
        
        if (!g1Done) {
          setCurrentSetIndex(1);
        } else if (!g2Done) {
          setCurrentSetIndex(2);
        } else {
          setCurrentSetIndex(3);
        }
      }
    }
  }, [activeFixtureId, matches, fixtures]);

  // Helper to adjust team points
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

  // Update a single score field locally and sync to Firestore if live
  const updateScore = async (fixtureId: string, field: string, delta: number) => {
    if (!canScore) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture && !fixture.court) {
      alert("Assigning a court is mandatory before you can enter scores.");
      return;
    }
    const currentScores = scores[fixtureId] || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    
    // In professional badminton, max score is capped at 30 points
    const updatedValue = Math.max(0, Math.min(30, (currentScores[field] || 0) + delta));
    const newScores = {
      ...currentScores,
      [field]: updatedValue
    };

    setScores((prev: any) => ({
      ...prev,
      [fixtureId]: newScores
    }));

    // If it's currently pending or live (not completed), update its status to 'live' and save current draft scores
    if (fixture) {
      // Detect if a set was completed by this specific score update
      const matchFields = field.match(/^p(1|2)g([1-3])$/);
      if (matchFields) {
        const setIndex = Number(matchFields[2]);
        const target = Number(fixture.pointsTarget) || (fixture.matchType === 'league' ? 15 : 21);
        
        const p1Old = currentScores[`p1g${setIndex}`] || 0;
        const p2Old = currentScores[`p2g${setIndex}`] || 0;
        const wasFinished = isSetFinished(p1Old, p2Old, target);

        const p1New = newScores[`p1g${setIndex}`] || 0;
        const p2New = newScores[`p2g${setIndex}`] || 0;
        const isFinishedNow = isSetFinished(p1New, p2New, target);

        // Only trigger if transitioning from active/incomplete to completed
        if (!wasFinished && isFinishedNow) {
          const setWinnerKey = p1New > p2New ? 'player1' : 'player2';
          const setWinnerName = setWinnerKey === 'player1' 
            ? (fixture.isDoubles ? (fixture.player1bName ? `${fixture.player1aName} & ${fixture.player1bName}` : fixture.player1aName) : fixture.player1Name)
            : (fixture.isDoubles ? (fixture.player2bName ? `${fixture.player2aName} & ${fixture.player2bName}` : fixture.player2aName) : fixture.player2Name);
          const scoreStr = `${Math.max(p1New, p2New)} - ${Math.min(p1New, p2New)}`;

          // Calculate overall sets won to check if match is completed
          let p1Sets = 0;
          let p2Sets = 0;
          for (let i = 1; i <= 3; i++) {
            const p1S = newScores[`p1g${i}`] || 0;
            const p2S = newScores[`p2g${i}`] || 0;
            if (isSetFinished(p1S, p2S, target)) {
              if (p1S > p2S) p1Sets++;
              else p2Sets++;
            }
          }

          const isMatchOver = p1Sets >= 2 || p2Sets >= 2;
          const matchWinnerKey = p1Sets >= 2 ? 'player1' : 'player2';
          const matchWinnerName = matchWinnerKey === 'player1' 
            ? (fixture.isDoubles ? (fixture.player1bName ? `${fixture.player1aName} & ${fixture.player1bName}` : fixture.player1aName) : fixture.player1Name)
            : (fixture.isDoubles ? (fixture.player2bName ? `${fixture.player2aName} & ${fixture.player2bName}` : fixture.player2aName) : fixture.player2Name);

          setCompletedSetPopup({
            setIndex,
            winnerName: setWinnerName,
            winnerKey: setWinnerKey,
            scoreStr,
            isMatchOver,
            matchWinnerName,
            fixtureId
          });
        }
      }

      if (fixture.status !== 'completed') {
        try {
          await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, fixtureId), {
            status: 'live',
            scores: newScores
          });
        } catch (err) {
          console.error("Error updating live score in Firestore:", err);
        }
      }
    }
  };

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

  // Reset a live match or completed match back to pending
  const resetMatch = async (fixtureId: string) => {
    if (saving) return;
    if (!window.confirm("Are you sure you want to reset this match? This will clear all scores and status, and subtract any points gained from team standings.")) return;
    
    try {
      setSaving(true);

      // Check if there's a completed match document
      const existingMatch = matches.find(m => m.fixtureId === fixtureId);
      if (existingMatch) {
        const fixture = fixtures.find(f => f.id === fixtureId);
        if (fixture) {
          const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
          const winnerPlayerId = existingMatch.winner === 'player1' 
            ? (isDoublesMatch ? fixture.player1aId : fixture.player1Id) 
            : (isDoublesMatch ? fixture.player2aId : fixture.player2Id);
          // Subtract winner's team points
          const pointsDelta = getPointsDelta(fixture);
          await adjustTeamPoints(winnerPlayerId, -pointsDelta, fixture);
        }
        // Delete match document
        await deleteDoc(doc(db, `tournaments/${tournamentId}/matches`, existingMatch.id));
      }

      // Update fixture status back to pending and clear scores
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, fixtureId), {
        status: 'pending',
        scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 }
      });

      setScores((prev: any) => ({
        ...prev,
        [fixtureId]: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 }
      }));

      setActiveFixtureId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tournaments/${tournamentId}/fixtures`);
    } finally {
      setSaving(false);
    }
  };

  // Save the score as completed
  const saveScore = async (fixtureId: string) => {
    if (saving) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    if (!fixture.court) {
      alert("Assigning a court is mandatory before you can enter scores.");
      return;
    }
    const s = scores[fixtureId] || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };

    setSaving(true);
    const maxPoints = Number(fixture.pointsTarget) || (fixture.matchType === 'league' ? 15 : 21);
    
    try {
      // Calculate won games per player
      const p1Games = (s.p1g1 > s.p2g1 ? 1 : 0) + (s.p1g2 > s.p2g2 ? 1 : 0) + (s.p1g3 > s.p2g3 ? 1 : 0);
      const p2Games = (s.p2g1 > s.p1g1 ? 1 : 0) + (s.p2g2 > s.p1g2 ? 1 : 0) + (s.p2g3 > s.p1g3 ? 1 : 0);
      const winner = p1Games > p2Games ? 'player1' : 'player2';
      
      const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
      const winnerPlayerId = winner === 'player1' 
        ? (isDoublesMatch ? fixture.player1aId : fixture.player1Id) 
        : (isDoublesMatch ? fixture.player2aId : fixture.player2Id);

      // Check if there was an existing match document
      const existingMatch = matches.find(m => m.fixtureId === fixtureId);
      
      const pointsDelta = getPointsDelta(fixture);

      if (existingMatch) {
        const oldWinner = existingMatch.winner;
        const oldWinnerPlayerId = oldWinner === 'player1' 
          ? (isDoublesMatch ? fixture.player1aId : fixture.player1Id) 
          : (isDoublesMatch ? fixture.player2aId : fixture.player2Id);
        
        // Update existing match document
        await updateDoc(doc(db, `tournaments/${tournamentId}/matches`, existingMatch.id), {
          scores: s,
          winner,
          p1Games,
          p2Games,
          maxPoints,
          finalizedAt: Date.now()
        });

        // Adjust team standings if winner changed
        if (oldWinnerPlayerId !== winnerPlayerId) {
          await adjustTeamPoints(oldWinnerPlayerId, -pointsDelta, fixture);
          await adjustTeamPoints(winnerPlayerId, pointsDelta, fixture);
        }
      } else {
        // Create new match document
        await addDoc(collection(db, `tournaments/${tournamentId}/matches`), { 
          fixtureId, 
          scores: s, 
          winner, 
          p1Games, 
          p2Games, 
          maxPoints,
          finalizedAt: Date.now()
        });

        // Add points to winning team
        await adjustTeamPoints(winnerPlayerId, pointsDelta, fixture);
      }

      // Update fixture status to completed
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, fixtureId), { 
        status: 'completed',
        scores: s,
        finalizedAt: Date.now()
      });
      
      setActiveFixtureId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tournaments/${tournamentId}/matches`);
    } finally {
      setSaving(false);
    }
  };

  // Check if a player has game point or match point
  const getScoringBadge = (fixture: any, setIndex: number, playerKey: 'player1' | 'player2') => {
    if (!fixture) return null;
    const target = Number(fixture.pointsTarget) || (fixture.matchType === 'league' ? 15 : 21);
    const s = scores[fixture.id] || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    
    const p1Score = s[`p1g${setIndex}`] || 0;
    const p2Score = s[`p2g${setIndex}`] || 0;
    
    const playerScore = playerKey === 'player1' ? p1Score : p2Score;
    const opponentScore = playerKey === 'player1' ? p2Score : p1Score;

    // If set is already completed
    if (isSetFinished(p1Score, p2Score, target)) {
      if (playerScore > opponentScore) {
        return { text: "SET WON", className: "bg-emerald-500 text-white animate-pulse" };
      }
      return null;
    }

    // Must win by 2 points.
    // If they have reached (target - 1) or more, and they lead by at least 1, they are 1 point away from winning this set
    let isGamePoint = false;
    if (playerScore >= target - 1 && playerScore > opponentScore) {
      if (playerScore >= target) {
        // e.g. 21-20, need to reach 22
        isGamePoint = true;
      } else {
        // e.g. 20-18 or 20-19, need to reach 21
        isGamePoint = true;
      }
    }

    if (isGamePoint) {
      // Determine if they won another set
      let setsWonAlready = 0;
      for (let i = 1; i <= 3; i++) {
        if (i === setIndex) continue;
        const p1Set = s[`p1g${i}`] || 0;
        const p2Set = s[`p2g${i}`] || 0;
        if (isSetFinished(p1Set, p2Set, target)) {
          if (playerKey === 'player1' && p1Set > p2Set) setsWonAlready++;
          if (playerKey === 'player2' && p2Set > p1Set) setsWonAlready++;
        }
      }

      if (setsWonAlready === 1 || setIndex === 3) {
        return { text: "MATCH POINT", className: "bg-rose-600 text-white animate-pulse font-black shadow-lg shadow-rose-600/30" };
      }
      return { text: "GAME POINT", className: "bg-indigo-600 text-white/90 font-extrabold" };
    }

    return null;
  };

  const activeFixture = fixtures.find(f => f.id === activeFixtureId);

  // Classify and filter fixtures
  const counts = {
    all: fixtures.length,
    live: fixtures.filter(f => f.status === 'live').length,
    upcoming: fixtures.filter(f => !f.status || f.status === 'pending').length,
    completed: fixtures.filter(f => f.status === 'completed').length,
  };

  const filteredFixtures = fixtures.filter(f => {
    const status = f.status || 'pending';
    const matchesFilter = filter === 'all' || 
      (filter === 'live' && status === 'live') ||
      (filter === 'upcoming' && status === 'pending') ||
      (filter === 'completed' && status === 'completed');
      
    if (!matchesFilter) return false;
    
    const searchLower = search.toLowerCase();
    return (
      f.player1Name?.toLowerCase().includes(searchLower) ||
      f.player2Name?.toLowerCase().includes(searchLower) ||
      f.matchId?.toLowerCase().includes(searchLower) ||
      f.groupName?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-100 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Trophy className="text-indigo-600 w-7 h-7" /> Match Dashboard & Scoring
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Track, schedule, start live scoring, or edit past match results.</p>
        </div>
        {!activeFixtureId && (
          <button 
            onClick={onNext}
            className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-sm hover:bg-slate-800 transition shadow-sm hover:shadow flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
          >
            View Points Standings <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {!activeFixtureId ? (
        <div className="space-y-6">
          {/* OBS Streamer Channels Control Panel */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="space-y-1">
                <h3 className="text-base font-black tracking-tight flex items-center gap-2 text-indigo-400">
                  <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" /> Live OBS Court Tickers
                </h3>
                <p className="text-slate-400 text-xs">
                  Copy a permanent OBS browser source URL for each court. It will automatically switch and stream whatever match is currently active on that court! No URL updates needed during your broadcast.
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pt-1">
              {courts.map(courtOpt => {
                const isCopied = copiedCourtName === courtOpt;
                return (
                  <button
                    key={courtOpt}
                    onClick={() => copyCourtObsUrl(courtOpt)}
                    className={`px-3 py-2 text-xs font-black rounded-xl border flex flex-col items-center gap-1.5 transition ${
                      isCopied 
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' 
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-[10px] uppercase text-slate-400 font-extrabold tracking-wider">{courtOpt}</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-black">
                      {isCopied ? <Check className="w-3 h-3 text-emerald-200" /> : <Copy className="w-3 h-3" />}
                      {isCopied ? "Copied!" : "Copy Stream"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters and Search Bar */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search by player name, group, or Match ID..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-sm font-medium outline-none transition focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-xl overflow-x-auto whitespace-nowrap self-start md:self-auto">
              <button 
                onClick={() => setFilter('all')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All <span className="px-1.5 py-0.5 rounded-md bg-slate-200 text-[10px] text-slate-700 font-bold">{counts.all}</span>
              </button>
              <button 
                onClick={() => setFilter('live')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${filter === 'live' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-600 hover:text-red-500'}`}
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Live <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-[10px] text-red-700 font-bold">{counts.live}</span>
              </button>
              <button 
                onClick={() => setFilter('upcoming')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${filter === 'upcoming' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-indigo-500'}`}
              >
                <Calendar className="w-3 h-3" />
                Upcoming <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-[10px] text-indigo-700 font-bold">{counts.upcoming}</span>
              </button>
              <button 
                onClick={() => setFilter('completed')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${filter === 'completed' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-emerald-500'}`}
              >
                <CheckCircle2 className="w-3 h-3" />
                Completed <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-[10px] text-emerald-700 font-bold">{counts.completed}</span>
              </button>
            </div>
          </div>

          {/* Matches List Grid */}
          {filteredFixtures.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center justify-center space-y-3">
              <div className="p-3.5 bg-slate-100 rounded-full text-slate-400"><Clock className="w-6 h-6" /></div>
              <div>
                <p className="font-bold text-slate-700 text-sm">No matches found</p>
                <p className="text-slate-400 text-xs mt-1">Try choosing a different filter tab or search term.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredFixtures.map((f, idx) => {
                const status = f.status || 'pending';
                const matchResult = matches.find(m => m.fixtureId === f.id);
                const currentScores = f.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
                
                // Accent border/ring according to status
                let statusAccent = 'border-l-slate-300';
                let statusBg = 'bg-slate-50 text-slate-600';
                if (status === 'completed') {
                  statusAccent = 'border-l-emerald-500 ring-emerald-500/10';
                  statusBg = 'bg-emerald-50 text-emerald-700';
                } else if (status === 'live') {
                  statusAccent = 'border-l-indigo-500 ring-indigo-500/10 shadow-indigo-100/60 shadow-md animate-pulse';
                  statusBg = 'bg-indigo-50 text-indigo-700';
                } else if (status === 'pending') {
                  statusAccent = 'border-l-amber-400 ring-amber-400/10';
                  statusBg = 'bg-amber-50 text-amber-700';
                }

                const p1DisplayName = f.isDoubles
                  ? (f.player1bName ? `${f.player1aName} & ${f.player1bName}` : f.player1aName)
                  : f.player1Name;
                const p2DisplayName = f.isDoubles
                  ? (f.player2bName ? `${f.player2aName} & ${f.player2bName}` : f.player2aName)
                  : f.player2Name;

                return (
                  <div 
                    key={f.id} 
                    className={`bg-white border border-slate-150/80 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300 transition-all p-3.5 flex flex-col justify-between min-h-[195px] h-auto border-l-4 ${statusAccent}`}
                  >
                    {/* Card Top: Match Info */}
                    <div className="flex justify-between items-start gap-1.5">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border border-slate-150/60 px-1.5 py-0.5 rounded">
                            #{f.matchId?.toUpperCase() || 'PND'}
                          </span>
                          <span className="text-[9px] font-black text-slate-500 truncate max-w-[85px]" title={f.groupName}>
                            {f.groupName}
                          </span>
                        </div>
                      </div>
                      
                      <div className="shrink-0">
                        {status === 'live' && (
                          <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[8px] font-black rounded border border-red-100 flex items-center gap-0.5">
                            <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse"></span> LIVE
                          </span>
                        )}
                        {status === 'completed' && (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black rounded border border-emerald-100">
                            🏆 DONE
                          </span>
                        )}
                        {status === 'pending' && (
                          <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 text-[8px] font-black rounded border border-slate-150">
                            SCHED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Middle: Matchup and Score Presentation */}
                    <div className="space-y-2.5 py-1.5 flex-grow flex flex-col justify-center">
                      {/* Player 1 Row */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`text-xs font-black truncate max-w-[140px] ${status === 'completed' && matchResult?.winner === 'player2' ? 'text-slate-400 font-normal line-through' : 'text-slate-800'}`} title={p1DisplayName}>
                            {p1DisplayName}
                          </span>
                          {f.isDoubles ? (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {playerL2Map[f.player1aId] && (
                                <span className="text-[9px] text-indigo-600/90 font-semibold truncate bg-indigo-50/50 px-1 py-0.25 rounded self-start" title={playerL2Map[f.player1aId]}>
                                  {playerL2Map[f.player1aId]}
                                </span>
                              )}
                              {playerL2Map[f.player1bId] && playerL2Map[f.player1bId] !== playerL2Map[f.player1aId] && (
                                <span className="text-[9px] text-indigo-600/90 font-semibold truncate bg-indigo-50/50 px-1 py-0.25 rounded self-start" title={playerL2Map[f.player1bId]}>
                                  {playerL2Map[f.player1bId]}
                                </span>
                              )}
                            </div>
                          ) : (
                            playerL2Map[f.player1Id] && (
                              <span className="text-[9px] text-indigo-600/90 font-semibold truncate mt-0.5 bg-indigo-50/50 px-1 py-0.25 rounded self-start" title={playerL2Map[f.player1Id]}>
                                {playerL2Map[f.player1Id]}
                              </span>
                            )
                          )}
                        </div>
                        {/* Scores displays */}
                        {(status === 'live' || status === 'completed') && (
                          <div className="flex gap-1 shrink-0 mt-0.5">
                            <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${currentScores.p1g1 > currentScores.p2g1 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{currentScores.p1g1}</span>
                            <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${currentScores.p1g2 > currentScores.p2g2 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{currentScores.p1g2}</span>
                            {(currentScores.p1g3 > 0 || currentScores.p2g3 > 0) && (
                              <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${currentScores.p1g3 > currentScores.p2g3 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{currentScores.p1g3}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* VS Divider or Separation */}
                      {status === 'pending' && (
                        <div className="relative flex items-center justify-center py-0.5">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-100/80"></div>
                          </div>
                          <span className="relative px-1.5 bg-white text-[9px] font-black text-slate-300 rounded-full border border-slate-100/50 tracking-wider">
                            VS
                          </span>
                        </div>
                      )}
                      {(status === 'live' || status === 'completed') && (
                        <div className="border-t border-slate-50 my-0.5"></div>
                      )}

                      {/* Player 2 Row */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`text-xs font-black truncate max-w-[140px] ${status === 'completed' && matchResult?.winner === 'player1' ? 'text-slate-400 font-normal line-through' : 'text-slate-800'}`} title={p2DisplayName}>
                            {p2DisplayName}
                          </span>
                          {f.isDoubles ? (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {playerL2Map[f.player2aId] && (
                                <span className="text-[9px] text-indigo-600/90 font-semibold truncate bg-indigo-50/50 px-1 py-0.25 rounded self-start" title={playerL2Map[f.player2aId]}>
                                  {playerL2Map[f.player2aId]}
                                </span>
                              )}
                              {playerL2Map[f.player2bId] && playerL2Map[f.player2bId] !== playerL2Map[f.player2aId] && (
                                <span className="text-[9px] text-indigo-600/90 font-semibold truncate bg-indigo-50/50 px-1 py-0.25 rounded self-start" title={playerL2Map[f.player2bId]}>
                                  {playerL2Map[f.player2bId]}
                                </span>
                              )}
                            </div>
                          ) : (
                            playerL2Map[f.player2Id] && (
                              <span className="text-[9px] text-indigo-600/90 font-semibold truncate mt-0.5 bg-indigo-50/50 px-1 py-0.25 rounded self-start" title={playerL2Map[f.player2Id]}>
                                {playerL2Map[f.player2Id]}
                              </span>
                            )
                          )}
                        </div>
                        {/* Scores displays */}
                        {(status === 'live' || status === 'completed') && (
                          <div className="flex gap-1 shrink-0 mt-0.5">
                            <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${currentScores.p2g1 > currentScores.p1g1 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{currentScores.p2g1}</span>
                            <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${currentScores.p2g2 > currentScores.p1g2 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{currentScores.p2g2}</span>
                            {(currentScores.p1g3 > 0 || currentScores.p2g3 > 0) && (
                              <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${currentScores.p2g3 > currentScores.p1g3 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{currentScores.p2g3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Bottom: Meta info and Action Buttons */}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <div className="flex flex-col">
                        <select
                          value={f.court || ""}
                          onChange={async (e) => {
                            await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, f.id), {
                              court: e.target.value
                            });
                          }}
                          className="text-[9px] font-extrabold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[95px]"
                        >
                          <option value="">No Court</option>
                          {courts.map(courtOpt => {
                            const isOtherLive = fixtures.some(x => x.status === 'live' && x.court === courtOpt && x.id !== f.id);
                            if (courtOpt === 'Court 1' && isOtherLive) return null;
                            return (
                              <option key={courtOpt} value={courtOpt}>{courtOpt}</option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyObsUrl(f.id)}
                          className={`p-1 rounded-lg border transition ${
                            copiedFixtureId === f.id
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : 'bg-white text-slate-400 hover:text-slate-700 border-slate-200'
                          }`}
                          title="Copy OBS Overlay"
                        >
                          {copiedFixtureId === f.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>

                        {status === 'pending' && (
                          <button 
                            onClick={() => setActiveFixtureId(f.id)} 
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-lg transition flex items-center gap-1 shadow-sm"
                          >
                            <Play className="w-2.5 h-2.5 fill-white" /> Start
                          </button>
                        )}
                        {status === 'live' && (
                          <>
                            <button 
                              onClick={() => setActiveFixtureId(f.id)} 
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black rounded-lg transition flex items-center gap-1 shadow-sm animate-pulse"
                            >
                              <Play className="w-2.5 h-2.5 fill-white" /> Live
                            </button>
                            <button 
                              onClick={() => resetMatch(f.id)}
                              className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition"
                              title="Reset Match"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        {status === 'completed' && (
                          <>
                            <button 
                              onClick={() => setActiveFixtureId(f.id)} 
                              className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] font-black rounded-lg transition flex items-center gap-0.5"
                            >
                              <Edit3 className="w-2.5 h-2.5" /> Edit
                            </button>
                            <button 
                              onClick={() => resetMatch(f.id)}
                              className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition"
                              title="Reset Completed"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Active Scoring View Panel */
        <div className="space-y-6 border border-slate-200 p-4 sm:p-6 rounded-3xl bg-slate-50/50 shadow-md">
          {!canScore && (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
              ⚠️ Read-Only Mode: You must be an administrator or a designated scorer to record match scores or modify game parameters.
            </div>
          )}
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-200">
            <button 
              onClick={() => setActiveFixtureId(null)} 
              className="text-xs font-bold text-slate-500 hover:text-slate-800 transition flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl border border-slate-200"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Match List
            </button>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsSwapped(!isSwapped)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                title="Swap Player Sides visually to match the physical courts"
              >
                <Shuffle className="w-3.5 h-3.5" /> Swap Sides Visually
              </button>

              {activeFixture && (
                <button 
                  onClick={() => copyObsUrl(activeFixture.id)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 border ${
                    copiedFixtureId === activeFixture.id
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-white text-indigo-600 hover:text-indigo-800 border-indigo-100 hover:bg-indigo-50/50'
                  }`}
                  title="Copy professional OBS browser-source URL for streaming overlays"
                >
                  {copiedFixtureId === activeFixture.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedFixtureId === activeFixture.id ? "Copied OBS!" : "Copy OBS"}
                </button>
              )}

              {activeFixture?.status === 'live' && (
                <span className="px-3 py-1 bg-red-100 text-red-700 text-[10px] font-black tracking-wider uppercase rounded-full flex items-center gap-1.5 animate-pulse border border-red-200">
                  <span className="w-2 h-2 bg-red-600 rounded-full"></span> LIVE
                </span>
              )}
              {activeFixture?.status === 'completed' && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black tracking-wider uppercase rounded-full flex items-center gap-1.5 border border-emerald-200">
                  🏆 COMPLETED
                </span>
              )}
            </div>
          </div>

          {/* Match & Mode Details */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div>
                <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                  {activeFixture?.groupName || "Main Event"}
                </span>
                <p className="font-extrabold text-lg text-slate-800 tracking-tight mt-1">
                  {activeFixture?.isDoubles ? (activeFixture.player1bName ? `${activeFixture.player1aName} & ${activeFixture.player1bName}` : activeFixture.player1aName) : activeFixture?.player1Name} <span className="text-slate-400 font-medium text-sm mx-1">VS</span> {activeFixture?.isDoubles ? (activeFixture.player2bName ? `${activeFixture.player2aName} & ${activeFixture.player2bName}` : activeFixture.player2aName) : activeFixture?.player2Name}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-mono text-slate-400 font-semibold uppercase">MATCH ID: {activeFixture?.matchId?.toUpperCase()}</p>
                <p className="text-xs font-bold text-slate-500 mt-0.5">
                  {activeFixture?.matchType || 'league'} mode • Best of 3 Sets ({activeFixture?.pointsTarget || (activeFixture?.matchType === 'league' ? 15 : 21)} pts)
                </p>
              </div>
            </div>
          </div>

          {/* Court selector */}
          <div className="bg-white p-4 rounded-2xl border border-slate-150 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Assign Court:</span>
              <div className="flex flex-wrap gap-1">
                {courts.map(courtOpt => {
                  const isSelected = activeFixture?.court === courtOpt;
                  const isOtherLive = fixtures.some(f => f.status === 'live' && f.court === courtOpt && f.id !== activeFixture?.id);
                  if (courtOpt === 'Court 1' && isOtherLive) return null;
                  return (
                    <button
                      key={courtOpt}
                      disabled={!canScore}
                      onClick={async () => {
                        await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, activeFixture.id), {
                          court: courtOpt
                        });
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${
                        isSelected 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {courtOpt}
                    </button>
                  );
                })}
                {activeFixture?.court && (
                  <button
                    onClick={async () => {
                      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, activeFixture.id), {
                        court: ""
                      });
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {activeFixture?.court ? (
              <span className="px-3 py-1 bg-amber-50 border border-amber-150 text-amber-800 text-xs font-black rounded-lg uppercase tracking-wider flex items-center gap-1 shrink-0 self-start sm:self-auto">
                📍 {activeFixture.court} Active
              </span>
            ) : (
              <span className="text-slate-400 text-xs font-medium italic shrink-0 self-start sm:self-auto">
                No court assigned yet
              </span>
            )}
          </div>

          {/* Interactive Set selector tabs */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Set Score Selector</label>
            <div className="grid grid-cols-3 gap-2 bg-slate-200/60 p-1 rounded-2xl border border-slate-200">
              {[1, 2, 3].map((setNum) => {
                const p1Field = `p1g${setNum}`;
                const p2Field = `p2g${setNum}`;
                const p1Score = scores[activeFixture.id]?.[p1Field] || 0;
                const p2Score = scores[activeFixture.id]?.[p2Field] || 0;
                const target = Number(activeFixture.pointsTarget) || (activeFixture.matchType === 'league' ? 15 : 21);
                const finished = isSetFinished(p1Score, p2Score, target);
                const isActive = currentSetIndex === setNum;

                return (
                  <button
                    key={setNum}
                    onClick={() => setCurrentSetIndex(setNum)}
                    className={`py-3 px-2 sm:px-4 rounded-xl font-black text-xs sm:text-sm transition-all flex flex-col items-center justify-center gap-0.5 relative ${
                      isActive 
                        ? 'bg-slate-900 text-white shadow-md scale-[1.01]' 
                        : 'text-slate-600 hover:bg-white/70 bg-transparent'
                    }`}
                  >
                    <span>Set {setNum}</span>
                    <span className="font-mono text-xs font-bold opacity-80">
                      {p1Score} - {p2Score}
                    </span>
                    {finished && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* MAIN ARENA / SCOREBOARD */}
          <div className="space-y-4">
            {/* Active Set Meta Status */}
            <div className="flex justify-between items-center text-xs text-slate-500 font-bold px-1">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                Scoring Set {currentSetIndex}
              </span>
              <span>
                First to {activeFixture?.pointsTarget || (activeFixture?.matchType === 'league' ? 15 : 21)} points (Win by 2)
              </span>
            </div>

            {/* Side-by-Side Arena Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left & Right Player Blocks, taking swap into account */}
              {[
                { 
                  playerKey: 'player1' as const, 
                  name: activeFixture?.isDoubles 
                    ? (activeFixture.player1bName ? `${activeFixture.player1aName} & ${activeFixture.player1bName}` : activeFixture.player1aName) 
                    : activeFixture?.player1Name, 
                  label: activeFixture?.isDoubles ? "Team 1" : "Player 1" 
                },
                { 
                  playerKey: 'player2' as const, 
                  name: activeFixture?.isDoubles 
                    ? (activeFixture.player2bName ? `${activeFixture.player2aName} & ${activeFixture.player2bName}` : activeFixture.player2aName) 
                    : activeFixture?.player2Name, 
                  label: activeFixture?.isDoubles ? "Team 2" : "Player 2" 
                }
              ].map((p, idx, arr) => {
                // Determine actual index after court swap state
                const actualIndex = isSwapped ? (idx === 0 ? 1 : 0) : idx;
                const playerObj = arr[actualIndex];
                
                const scoreField = `${playerObj.playerKey === 'player1' ? 'p1' : 'p2'}g${currentSetIndex}`;
                const score = scores[activeFixture.id]?.[scoreField] || 0;
                
                const badge = getScoringBadge(activeFixture, currentSetIndex, playerObj.playerKey);
                const isServing = servingPlayer === playerObj.playerKey;

                return (
                  <div 
                    key={playerObj.playerKey}
                    className={`bg-white rounded-3xl border p-6 flex flex-col justify-between space-y-4 transition-all duration-300 ${
                      isServing 
                        ? 'border-yellow-400 shadow-lg shadow-yellow-400/5 ring-1 ring-yellow-400/20' 
                        : 'border-slate-100 shadow-sm'
                    }`}
                  >
                    {/* Top: Player Name & Serving & Badges */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{playerObj.label}</span>
                        <h3 className="font-extrabold text-lg text-slate-800 tracking-tight block truncate max-w-[200px]" title={playerObj.name}>
                          {playerObj.name}
                        </h3>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        {/* Service Indicator */}
                        <button
                          onClick={() => setServingPlayer(isServing ? null : playerObj.playerKey)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold tracking-wider transition-all flex items-center gap-1 border uppercase ${
                            isServing 
                              ? 'bg-yellow-400 hover:bg-yellow-500 text-slate-900 border-yellow-400' 
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          🏸 {isServing ? "Serving" : "Serve?"}
                        </button>
                        {isServing && (
                          <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md uppercase text-right tracking-tight">
                            {score % 2 === 0 ? "Serve from Right" : "Serve from Left"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Giant LED Score Display */}
                    <div className="relative">
                      {/* Interactive Touch score area */}
                      <div 
                        onClick={() => updateScore(activeFixture.id, scoreField, 1)}
                        className="cursor-pointer bg-slate-950 text-emerald-400 font-mono text-7xl md:text-9xl font-black py-8 px-4 rounded-3xl shadow-inner text-center tracking-normal select-none relative overflow-hidden border border-slate-800 active:bg-slate-900 transition-colors flex items-center justify-center h-48 md:h-56"
                      >
                        {/* Subtle background score lines for arcade feeling */}
                        <div className="absolute inset-0 opacity-[0.03] bg-radial-gradient pointer-events-none" />
                        
                        <span className="relative z-10">{score}</span>

                        {/* Top-Right Badge Overlay */}
                        {badge && (
                          <span className={`absolute top-3 right-3 text-[10px] sm:text-xs font-black uppercase px-2.5 py-1 rounded-md tracking-wider border border-white/10 z-20 shadow-md ${badge.className}`}>
                            {badge.text}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom: Increment/Decrement Controls */}
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => updateScore(activeFixture.id, scoreField, -1)} 
                        className="py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300 font-black rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs text-xs sm:text-sm"
                      >
                        <Minus className="w-4 h-4 text-slate-500" /> DECREASE (-1)
                      </button>
                      <button 
                        onClick={() => updateScore(activeFixture.id, scoreField, 1)} 
                        className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 shadow-sm text-xs sm:text-sm"
                      >
                        <Plus className="w-4 h-4" /> INCREASE (+1)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Deuce Alert Prompt if scores are close or tied above threshold */}
            {(() => {
              const target = Number(activeFixture?.pointsTarget) || (activeFixture?.matchType === 'league' ? 15 : 21);
              const p1Score = scores[activeFixture.id]?.[`p1g${currentSetIndex}`] || 0;
              const p2Score = scores[activeFixture.id]?.[`p2g${currentSetIndex}`] || 0;
              const isDeuce = p1Score >= target - 1 && p2Score >= target - 1 && Math.abs(p1Score - p2Score) < 2;

              if (isDeuce) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center text-amber-900 animate-bounce">
                    <p className="text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5">
                      ⚠️ DEUCE IN PLAY!
                    </p>
                    <p className="text-xs font-semibold mt-1">
                      A player must lead by at least 2 clear points to win this set (up to a limit of 30 points).
                    </p>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* TV-style Broadcast Scoreboard Card */}
          <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-xl space-y-4">
            <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-indigo-400" /> Live Match Overview (Set by Set)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5">Player</th>
                    <th className="py-2.5 text-center w-16">Set 1</th>
                    <th className="py-2.5 text-center w-16">Set 2</th>
                    <th className="py-2.5 text-center w-16">Set 3</th>
                    <th className="py-2.5 text-center w-16 bg-slate-800/40 rounded-t-lg">Sets Won</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs font-semibold">
                  {/* Player 1 Row */}
                  <tr className="hover:bg-slate-800/20">
                    <td className="py-3 font-extrabold max-w-[150px] truncate">
                      {activeFixture?.isDoubles 
                        ? (activeFixture.player1bName ? `${activeFixture.player1aName} & ${activeFixture.player1bName}` : activeFixture.player1aName) 
                        : activeFixture?.player1Name}
                    </td>
                    {[1, 2, 3].map(num => {
                      const p1 = scores[activeFixture.id]?.[`p1g${num}`] || 0;
                      const p2 = scores[activeFixture.id]?.[`p2g${num}`] || 0;
                      const target = Number(activeFixture.pointsTarget) || (activeFixture.matchType === 'league' ? 15 : 21);
                      const isWinner = isSetFinished(p1, p2, target) && p1 > p2;
                      return (
                        <td key={num} className={`py-3 text-center font-mono ${isWinner ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}`}>
                          {p1} {isWinner && "✓"}
                        </td>
                      );
                    })}
                    <td className="py-3 text-center font-black bg-slate-800/20 font-mono text-indigo-400 text-sm">
                      {(() => {
                        let count = 0;
                        const target = Number(activeFixture.pointsTarget) || (activeFixture.matchType === 'league' ? 15 : 21);
                        if (isSetFinished(scores[activeFixture.id]?.p1g1 || 0, scores[activeFixture.id]?.p2g1 || 0, target) && (scores[activeFixture.id]?.p1g1 || 0) > (scores[activeFixture.id]?.p2g1 || 0)) count++;
                        if (isSetFinished(scores[activeFixture.id]?.p1g2 || 0, scores[activeFixture.id]?.p2g2 || 0, target) && (scores[activeFixture.id]?.p1g2 || 0) > (scores[activeFixture.id]?.p2g2 || 0)) count++;
                        if (isSetFinished(scores[activeFixture.id]?.p1g3 || 0, scores[activeFixture.id]?.p2g3 || 0, target) && (scores[activeFixture.id]?.p1g3 || 0) > (scores[activeFixture.id]?.p2g3 || 0)) count++;
                        return count;
                      })()}
                    </td>
                  </tr>

                  {/* Player 2 Row */}
                  <tr className="hover:bg-slate-800/20">
                    <td className="py-3 font-extrabold max-w-[150px] truncate">
                      {activeFixture?.isDoubles 
                        ? (activeFixture.player2bName ? `${activeFixture.player2aName} & ${activeFixture.player2bName}` : activeFixture.player2aName) 
                        : activeFixture?.player2Name}
                    </td>
                    {[1, 2, 3].map(num => {
                      const p1 = scores[activeFixture.id]?.[`p1g${num}`] || 0;
                      const p2 = scores[activeFixture.id]?.[`p2g${num}`] || 0;
                      const target = Number(activeFixture.pointsTarget) || (activeFixture.matchType === 'league' ? 15 : 21);
                      const isWinner = isSetFinished(p1, p2, target) && p2 > p1;
                      return (
                        <td key={num} className={`py-3 text-center font-mono ${isWinner ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}`}>
                          {p2} {isWinner && "✓"}
                        </td>
                      );
                    })}
                    <td className="py-3 text-center font-black bg-slate-800/20 font-mono text-indigo-400 text-sm">
                      {(() => {
                        let count = 0;
                        const target = Number(activeFixture.pointsTarget) || (activeFixture.matchType === 'league' ? 15 : 21);
                        if (isSetFinished(scores[activeFixture.id]?.p1g1 || 0, scores[activeFixture.id]?.p2g1 || 0, target) && (scores[activeFixture.id]?.p2g1 || 0) > (scores[activeFixture.id]?.p1g1 || 0)) count++;
                        if (isSetFinished(scores[activeFixture.id]?.p1g2 || 0, scores[activeFixture.id]?.p2g2 || 0, target) && (scores[activeFixture.id]?.p2g2 || 0) > (scores[activeFixture.id]?.p1g2 || 0)) count++;
                        if (isSetFinished(scores[activeFixture.id]?.p1g3 || 0, scores[activeFixture.id]?.p2g3 || 0, target) && (scores[activeFixture.id]?.p2g3 || 0) > (scores[activeFixture.id]?.p1g3 || 0)) count++;
                        return count;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 pt-1 justify-center border-t border-slate-800">
              <Info className="w-3 h-3" /> Live results are broadcast instantly to participants.
            </div>
          </div>

          {/* Scoring Actions Block */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200">
            {canScore ? (
              <>
                <button 
                  onClick={() => saveScore(activeFixture.id)} 
                  disabled={saving}
                  className="px-6 py-3.5 bg-emerald-600 text-white font-extrabold rounded-xl hover:bg-emerald-700 transition w-full sm:w-auto shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" /> {saving ? "Saving Match..." : "Save Match & End"}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear current set's scores back to 0?")) {
                      updateScore(activeFixture.id, `p1g${currentSetIndex}`, -scores[activeFixture.id]?.[`p1g${currentSetIndex}`] || 0);
                      updateScore(activeFixture.id, `p2g${currentSetIndex}`, -scores[activeFixture.id]?.[`p2g${currentSetIndex}`] || 0);
                    }
                  }}
                  className="px-5 py-3.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-100 font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className="w-4 h-4 text-slate-400" /> Clear Set {currentSetIndex}
                </button>
                <button 
                  onClick={() => resetMatch(activeFixture.id)}
                  disabled={saving}
                  className="px-5 py-3.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition w-full sm:w-auto flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" /> Reset Whole Match
                </button>
              </>
            ) : (
              <div className="text-sm font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-4 py-3 rounded-xl flex items-center gap-2">
                🔒 Match finalization is locked (Read-Only Mode)
              </div>
            )}
            <button 
              onClick={() => setActiveFixtureId(null)}
              className="px-5 py-3.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition w-full sm:w-auto text-center sm:ml-auto"
            >
              Close Scoreboard
            </button>
          </div>
        </div>
      )}

      {/* Set Completed Professional Modal */}
      {completedSetPopup && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl p-6 text-center transform scale-100 transition-all duration-300 relative overflow-hidden">
            
            {/* Ambient success light glow on top */}
            <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-500 via-indigo-500 to-emerald-500" />
            
            <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 border border-emerald-100 animate-bounce">
              <Trophy className="w-8 h-8" />
            </div>

            <span className="text-[10px] font-black tracking-widest uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
              Set {completedSetPopup.setIndex} Completed
            </span>

            <h3 className="font-black text-2xl text-slate-800 tracking-tight mt-4">
              {completedSetPopup.winnerName} Wins!
            </h3>

            <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-wider">
              Set score: <span className="font-mono text-emerald-600 font-black text-sm">{completedSetPopup.scoreStr}</span>
            </p>

            {/* Match Status Overview */}
            <div className="my-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center border-b border-slate-200 pb-1.5">
                Current Standings (Set-by-Set)
              </p>
              {activeFixture && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 truncate max-w-[180px]">{activeFixture.player1Name}</span>
                    <span className="font-mono text-slate-500">
                      {[1, 2, 3].map(num => {
                        const isS = num === completedSetPopup.setIndex;
                        const s = scores[activeFixture.id]?.[`p1g${num}`] || 0;
                        return <span key={num} className={isS ? "text-emerald-600 font-black mx-1" : "mx-1"}>{s}</span>;
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-700 truncate max-w-[180px]">{activeFixture.player2Name}</span>
                    <span className="font-mono text-slate-500">
                      {[1, 2, 3].map(num => {
                        const isS = num === completedSetPopup.setIndex;
                        const s = scores[activeFixture.id]?.[`p2g${num}`] || 0;
                        return <span key={num} className={isS ? "text-emerald-600 font-black mx-1" : "mx-1"}>{s}</span>;
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {completedSetPopup.isMatchOver ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-bold">
                  🎉 Match completed! <strong>{completedSetPopup.matchWinnerName}</strong> wins the entire match (Best of 3)!
                </div>
                
                <button
                  onClick={async () => {
                    const fid = completedSetPopup.fixtureId;
                    setCompletedSetPopup(null);
                    await saveScore(fid);
                  }}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition shadow-lg hover:shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-5 h-5" /> Save Match Standings
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const nextSet = completedSetPopup.setIndex + 1;
                    setCompletedSetPopup(null);
                    setCurrentSetIndex(nextSet);
                  }}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
                >
                  Start Set {completedSetPopup.setIndex + 1} <ChevronRight className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => setCompletedSetPopup(null)}
                  className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-700 font-bold rounded-xl text-xs transition"
                >
                  Stay on Set {completedSetPopup.setIndex} (Correct Score)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
