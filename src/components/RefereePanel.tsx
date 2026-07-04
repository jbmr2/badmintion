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
  increment
} from 'firebase/firestore';
import { 
  Shield, 
  Search, 
  CheckCircle2, 
  Clock, 
  Play, 
  Plus, 
  Minus, 
  RotateCcw, 
  ChevronLeft, 
  Check, 
  Info,
  ArrowLeftRight,
  Trophy,
  Activity,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';

interface RefereePanelProps {
  tournamentId: string;
  userRole?: 'admin' | 'scorer' | 'user';
}

export default function RefereePanel({ tournamentId, userRole = 'user' }: RefereePanelProps) {
  const canScore = userRole === 'admin' || userRole === 'scorer';
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [courts, setCourts] = useState<string[]>(['Court 1', 'Court 2', 'Court 3', 'Court 4', 'Court 5', 'Court 6']);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all');
  const [filterCourt, setFilterCourt] = useState<string>('all');

  // Active scoring match state
  const [activeFixtureId, setActiveFixtureId] = useState<string | null>(null);
  const [currentSetIndex, setCurrentSetIndex] = useState<number>(1);
  const [pointsTarget, setPointsTarget] = useState<number>(21);
  const [isSwapped, setIsSwapped] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  // Set completion prompt states
  const [completedSetPopup, setCompletedSetPopup] = useState<{
    setIndex: number;
    winnerName: string;
    scoreStr: string;
    nextSetIndex: number;
    isMatchOver: boolean;
  } | null>(null);
  const [lastPromptedSet, setLastPromptedSet] = useState<number>(0);

  // Real-time listener for fixtures, matches, and tournament courts
  useEffect(() => {
    setLoading(true);
    
    // 1. Fixtures listener
    const fixturesQuery = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribeFixtures = onSnapshot(fixturesQuery, 
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setFixtures(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/fixtures`);
        setLoading(false);
      }
    );

    // 2. Matches listener
    const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`));
    const unsubscribeMatches = onSnapshot(matchesQuery, 
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setMatches(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/matches`)
    );

    // 3. Tournament courts listener
    const unsubscribeTournament = onSnapshot(doc(db, 'tournaments', tournamentId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
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

  const activeFixture = fixtures.find(f => f.id === activeFixtureId);

  // Sync point targets and current set index when opening a match
  useEffect(() => {
    if (activeFixture) {
      setPointsTarget(Number(activeFixture.pointsTarget) || (activeFixture.matchType === 'league' ? 15 : 21));
      setLastPromptedSet(0);
      setCompletedSetPopup(null);
      
      // Auto detect active set index
      const s = activeFixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
      const target = Number(activeFixture.pointsTarget) || (activeFixture.matchType === 'league' ? 15 : 21);
      
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
  }, [activeFixtureId]);

  // Check if current set has finished to prompt starting the next set
  useEffect(() => {
    if (!activeFixture) return;
    const s = activeFixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    const p1 = s[`p1g${currentSetIndex}`] || 0;
    const p2 = s[`p2g${currentSetIndex}`] || 0;
    const target = pointsTarget;
    
    if (isSetFinished(p1, p2, target)) {
      // Find how many sets are finished in total
      let p1Sets = 0;
      let p2Sets = 0;
      for (let num = 1; num <= 3; num++) {
        const sp1 = s[`p1g${num}`] || 0;
        const sp2 = s[`p2g${num}`] || 0;
        if (isSetFinished(sp1, sp2, target)) {
          if (sp1 > sp2) p1Sets++;
          else p2Sets++;
        }
      }
      const isMatchOver = p1Sets >= 2 || p2Sets >= 2;
      
      // Show prompt if we have not prompted for this set yet
      if (lastPromptedSet !== currentSetIndex) {
        setCompletedSetPopup({
          setIndex: currentSetIndex,
          winnerName: p1 > p2 ? activeFixture.player1Name : activeFixture.player2Name,
          scoreStr: `${Math.max(p1, p2)} - ${Math.min(p1, p2)}`,
          nextSetIndex: currentSetIndex < 3 ? currentSetIndex + 1 : 3,
          isMatchOver: isMatchOver
        });
        setLastPromptedSet(currentSetIndex);
      }
    }
  }, [activeFixture?.scores, currentSetIndex, pointsTarget, lastPromptedSet, activeFixture]);

  // Helper to check if a set is completed by standard badminton rules
  function isSetFinished(p1: number, p2: number, target: number) {
    const minTarget = target || 21;
    if (p1 >= minTarget || p2 >= minTarget) {
      if (Math.abs(p1 - p2) >= 2) return true;
      if (p1 === 30 || p2 === 30) return true;
    }
    return false;
  }

  const getSetStatusText = () => {
    if (!activeFixture) return null;
    const s = activeFixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    const p1 = s[`p1g${currentSetIndex}`] || 0;
    const p2 = s[`p2g${currentSetIndex}`] || 0;
    const target = pointsTarget;

    if (isSetFinished(p1, p2, target)) {
      const winnerName = p1 > p2 ? activeFixture.player1Name : activeFixture.player2Name;
      return {
        text: `🏆 Set ${currentSetIndex} finished! Winner: ${winnerName} (${Math.max(p1, p2)}-${Math.min(p1, p2)})`,
        className: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
      };
    }

    if (p1 >= target - 1 && p2 >= target - 1) {
      if (p1 === 29 && p2 === 29) {
        return {
          text: `⚡ Golden Point! First to 30 points wins Set ${currentSetIndex}.`,
          className: 'bg-rose-950/80 text-rose-400 border border-rose-800/40 animate-pulse'
        };
      }
      return {
        text: `⚖️ Deuce! A player must lead by 2 clear points to win Set ${currentSetIndex} (Limit: 30).`,
        className: 'bg-amber-950/80 text-amber-400 border border-amber-800/40'
      };
    }

    if (p1 === target - 1 || p2 === target - 1) {
      const leaderName = p1 === target - 1 ? activeFixture.player1Name : activeFixture.player2Name;
      return {
        text: `🎯 Game Point! ${leaderName} is 1 point away from winning Set ${currentSetIndex}.`,
        className: 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/40'
      };
    }

    return {
      text: `🏸 Set ${currentSetIndex} in Progress • First to ${target} (Win by 2, capped at 30)`,
      className: 'bg-slate-800/50 text-slate-300 border border-slate-700/50'
    };
  };

  // Adjust team points in standings
  const adjustTeamPoints = async (winnerPlayerId: string, delta: number, fixture?: any) => {
    if (fixture?.groupName?.toLowerCase().includes('family')) {
      return;
    }
    try {
      const teamsSnapshot = await getDocs(collection(db, `tournaments/${tournamentId}/teams`));
      const teamDoc = teamsSnapshot.docs.find(doc => doc.data().playerIds?.includes(winnerPlayerId));
      if (teamDoc) {
        const teamData = teamDoc.data();
        if (teamData?.name?.toLowerCase().includes('family')) {
          return;
        }
        await updateDoc(teamDoc.ref, { points: increment(delta) });
      }
    } catch (e) {
      console.error("Error adjusting team points:", e);
    }
  };

  // Live scoring increment/decrement
  const handleScoreChange = async (field: string, delta: number) => {
    if (!activeFixture) return;
    const currentScores = activeFixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    
    // Prevent increasing score if current set is already finished
    const currentP1 = currentScores[`p1g${currentSetIndex}`] || 0;
    const currentP2 = currentScores[`p2g${currentSetIndex}`] || 0;
    if (delta > 0 && isSetFinished(currentP1, currentP2, pointsTarget)) {
      return;
    }

    const val = currentScores[field] || 0;
    const newVal = Math.max(0, Math.min(30, val + delta));

    const updatedScores = {
      ...currentScores,
      [field]: newVal
    };

    // Determine and update status to 'live' if it's currently pending
    const updatedStatus = activeFixture.status === 'completed' ? 'completed' : 'live';

    try {
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, activeFixture.id), {
        scores: updatedScores,
        status: updatedStatus
      });
    } catch (error) {
      console.error("Error saving score update:", error);
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

  // Reset current match state
  const resetMatch = async () => {
    if (!activeFixture) return;
    if (!window.confirm("Are you sure you want to reset this match? This will clear all scores and restore status to pending, subtracting any awarded points from team standings.")) return;

    try {
      setSaving(true);
      
      // 1. Delete completed match record if exists
      const existingMatch = matches.find(m => m.fixtureId === activeFixture.id);
      if (existingMatch) {
        const isDoublesMatch = !!(activeFixture.isDoubles || activeFixture.player1aId || activeFixture.player1bId || activeFixture.player2aId || activeFixture.player2bId);
        const winnerPlayerId = existingMatch.winner === 'player1' 
          ? (isDoublesMatch ? activeFixture.player1aId : activeFixture.player1Id) 
          : (isDoublesMatch ? activeFixture.player2aId : activeFixture.player2Id);
        const pointsDelta = getPointsDelta(activeFixture);
        await adjustTeamPoints(winnerPlayerId, -pointsDelta, activeFixture);
        await deleteDoc(doc(db, `tournaments/${tournamentId}/matches`, existingMatch.id));
      }

      // 2. Update fixture doc
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, activeFixture.id), {
        status: 'pending',
        scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 }
      });
      
      setCurrentSetIndex(1);
    } catch (error) {
      console.error("Error resetting match:", error);
    } finally {
      setSaving(false);
    }
  };

  // Complete and save match results
  const completeMatch = async () => {
    if (!activeFixture) return;
    const s = activeFixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    
    // Validate if enough sets are finished to determine a winner
    const target = pointsTarget;
    const g1Done = isSetFinished(s.p1g1, s.p2g1, target);
    const g2Done = isSetFinished(s.p1g2, s.p2g2, target);
    const g3Done = isSetFinished(s.p1g3, s.p2g3, target);

    let p1Games = 0;
    let p2Games = 0;

    if (g1Done) {
      if (s.p1g1 > s.p2g1) p1Games++;
      else p2Games++;
    }
    if (g2Done) {
      if (s.p1g2 > s.p2g2) p1Games++;
      else p2Games++;
    }
    if (g3Done) {
      if (s.p1g3 > s.p2g3) p1Games++;
      else p2Games++;
    }

    const minGamesNeeded = activeFixture.matchType === 'knockout' ? 2 : 1; // standard matches usually best of 3

    if (p1Games === 0 && p2Games === 0) {
      alert("Please score at least one completed set before finalizing.");
      return;
    }

    if (!window.confirm(`Are you sure you want to finalize this match? Winner will be declared based on sets won.`)) return;

    setSaving(true);
    try {
      const isDoublesMatch = !!(activeFixture.isDoubles || activeFixture.player1aId || activeFixture.player1bId || activeFixture.player2aId || activeFixture.player2bId);
      const winner = p1Games > p2Games ? 'player1' : 'player2';
      const winnerPlayerId = winner === 'player1' 
        ? (isDoublesMatch ? activeFixture.player1aId : activeFixture.player1Id) 
        : (isDoublesMatch ? activeFixture.player2aId : activeFixture.player2Id);

      const pointsDelta = getPointsDelta(activeFixture);

      // 1. Check existing match doc
      const existingMatch = matches.find(m => m.fixtureId === activeFixture.id);
      if (existingMatch) {
        const oldWinner = existingMatch.winner;
        const oldWinnerPlayerId = oldWinner === 'player1' 
          ? (isDoublesMatch ? activeFixture.player1aId : activeFixture.player1Id) 
          : (isDoublesMatch ? activeFixture.player2aId : activeFixture.player2Id);

        await updateDoc(doc(db, `tournaments/${tournamentId}/matches`, existingMatch.id), {
          scores: s,
          winner,
          p1Games,
          p2Games,
          maxPoints: target,
          finalizedAt: Date.now()
        });

        if (oldWinnerPlayerId !== winnerPlayerId) {
          await adjustTeamPoints(oldWinnerPlayerId, -pointsDelta, activeFixture);
          await adjustTeamPoints(winnerPlayerId, pointsDelta, activeFixture);
        }
      } else {
        // Create new match doc
        await addDoc(collection(db, `tournaments/${tournamentId}/matches`), {
          fixtureId: activeFixture.id,
          scores: s,
          winner,
          p1Games,
          p2Games,
          maxPoints: target,
          finalizedAt: Date.now()
        });

        await adjustTeamPoints(winnerPlayerId, pointsDelta, activeFixture);
      }

      // 2. Update fixture
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, activeFixture.id), {
        status: 'completed',
        scores: s,
        finalizedAt: Date.now()
      });

      setActiveFixtureId(null);
    } catch (error) {
      console.error("Error completing match:", error);
    } finally {
      setSaving(false);
    }
  };

  // Change Court for the active match
  const handleCourtChange = async (courtName: string) => {
    if (!activeFixture) return;
    try {
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, activeFixture.id), {
        court: courtName
      });
    } catch (error) {
      console.error("Error setting court:", error);
    }
  };

  // Change point target for the active match
  const handleTargetChange = async (target: number) => {
    if (!activeFixture) return;
    try {
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, activeFixture.id), {
        pointsTarget: target
      });
      setPointsTarget(target);
    } catch (error) {
      console.error("Error setting points target:", error);
    }
  };

  // Get status badge styles
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return <span className="px-2 py-1 bg-rose-500 text-white font-extrabold text-[10px] rounded-full animate-pulse flex items-center gap-1"><Activity className="w-3 h-3" /> LIVE</span>;
      case 'completed':
        return <span className="px-2 py-1 bg-emerald-500 text-white font-extrabold text-[10px] rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> COMPLETED</span>;
      default:
        return <span className="px-2 py-1 bg-slate-200 text-slate-700 font-extrabold text-[10px] rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> UPCOMING</span>;
    }
  };

  // Get game point or match point indications
  const getPointBadge = (setNum: number, playerKey: 'player1' | 'player2') => {
    if (!activeFixture) return null;
    const s = activeFixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
    const p1 = s[`p1g${setNum}`] || 0;
    const p2 = s[`p2g${setNum}`] || 0;

    const currentScore = playerKey === 'player1' ? p1 : p2;
    const oppScore = playerKey === 'player1' ? p2 : p1;

    if (isSetFinished(p1, p2, pointsTarget)) {
      if (currentScore > oppScore) {
        return <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded font-black">SET WON</span>;
      }
      return null;
    }

    // Lead by 1 or more, reached target-1 or more
    if (currentScore >= pointsTarget - 1 && currentScore > oppScore) {
      // Determine if they already won another set to declare Match Point
      let setsWon = 0;
      for (let i = 1; i <= 3; i++) {
        if (i === setNum) continue;
        const s1 = s[`p1g${i}`] || 0;
        const s2 = s[`p2g${i}`] || 0;
        if (isSetFinished(s1, s2, pointsTarget)) {
          if (playerKey === 'player1' && s1 > s2) setsWon++;
          if (playerKey === 'player2' && s2 > s1) setsWon++;
        }
      }

      if (setsWon === 1 || setNum === 3) {
        return <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded font-black animate-pulse shadow-sm">MATCH POINT</span>;
      }
      return <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-black">GAME POINT</span>;
    }
    return null;
  };

  // Filters calculation
  const filteredFixtures = fixtures.filter(f => {
    const p1Name = (f.player1Name || '').toLowerCase();
    const p2Name = (f.player2Name || '').toLowerCase();
    const searchLower = search.toLowerCase();

    // Match search query
    const matchesSearch = p1Name.includes(searchLower) || p2Name.includes(searchLower);

    // Match status filter
    const status = f.status || 'pending';
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'live' && status === 'live') ||
      (filterStatus === 'upcoming' && status === 'pending') ||
      (filterStatus === 'completed' && status === 'completed');

    // Match court filter
    const matchesCourt = filterCourt === 'all' || f.court === filterCourt;

    return matchesSearch && matchesStatus && matchesCourt;
  });

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 flex flex-col font-sans">
      
      {/* Top Banner & Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Referee Control Tower</h2>
            <p className="text-slate-400 text-xs font-semibold">Real-time badminton score sheet & court assignments</p>
          </div>
        </div>
        {activeFixtureId && (
          <button 
            onClick={() => setActiveFixtureId(null)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Match Board
          </button>
        )}
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
        {!activeFixtureId ? (
          /* Match Board / List View */
          <div className="space-y-6">
            
            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Search */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search player name..."
                  className="pl-10 pr-4 py-2 w-full text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2 w-full md:w-auto items-center justify-end">
                {/* Status filter */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-500 mr-1">Status:</span>
                  <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
                    {(['all', 'live', 'upcoming', 'completed'] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setFilterStatus(opt)}
                        className={`text-xs font-extrabold px-2.5 py-1 rounded-md transition-all uppercase ${
                          filterStatus === opt 
                            ? 'bg-white text-slate-900 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Court filter */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-500 mr-1">Court:</span>
                  <select
                    value={filterCourt}
                    onChange={e => setFilterCourt(e.target.value)}
                    className="text-xs font-bold bg-white border border-slate-200 rounded-lg p-1.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Courts</option>
                    <option value="">No Court Assigned</option>
                    {courts.map(court => (
                      <option key={court} value={court}>{court}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Match Grid */}
            {loading ? (
              <div className="text-center py-20 text-slate-500 font-medium">Loading match sheet...</div>
            ) : filteredFixtures.length === 0 ? (
              <div className="bg-white text-center py-16 rounded-2xl border border-slate-200 space-y-2">
                <p className="text-lg font-bold text-slate-700">No matches found</p>
                <p className="text-slate-400 text-xs">Try adjusting your filters or search criteria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFixtures.map(fixture => {
                  const s = fixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
                  const target = Number(fixture.pointsTarget) || (fixture.matchType === 'league' ? 15 : 21);
                  return (
                    <div 
                      key={fixture.id}
                      onClick={() => setActiveFixtureId(fixture.id)}
                      className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition flex flex-col justify-between space-y-4 relative group"
                    >
                      {/* Top Row with Match info */}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase bg-slate-100 px-2 py-0.5 rounded">
                          {fixture.groupName || "General Group"} • {fixture.matchType || "League"}
                        </span>
                        {getStatusBadge(fixture.status)}
                      </div>

                      {/* Main Player Display & Score preview */}
                      <div className="space-y-3">
                        {/* Player 1 Row */}
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 text-sm truncate max-w-[160px] group-hover:text-indigo-600 transition-colors">
                            {fixture.player1Name}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-500">
                            <span className={s.p1g1 > s.p2g1 && isSetFinished(s.p1g1, s.p2g1, target) ? 'text-emerald-500 font-black' : ''}>{s.p1g1}</span>
                            <span>•</span>
                            <span className={s.p1g2 > s.p2g2 && isSetFinished(s.p1g2, s.p2g2, target) ? 'text-emerald-500 font-black' : ''}>{s.p1g2}</span>
                            {isSetFinished(s.p1g2, s.p2g2, target) && (
                              <>
                                <span>•</span>
                                <span className={s.p1g3 > s.p2g3 && isSetFinished(s.p1g3, s.p2g3, target) ? 'text-emerald-500 font-black' : ''}>{s.p1g3}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Player 2 Row */}
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 text-sm truncate max-w-[160px] group-hover:text-indigo-600 transition-colors">
                            {fixture.player2Name}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-500">
                            <span className={s.p2g1 > s.p1g1 && isSetFinished(s.p1g1, s.p2g1, target) ? 'text-emerald-500 font-black' : ''}>{s.p2g1}</span>
                            <span>•</span>
                            <span className={s.p2g2 > s.p1g2 && isSetFinished(s.p1g2, s.p2g2, target) ? 'text-emerald-500 font-black' : ''}>{s.p2g2}</span>
                            {isSetFinished(s.p1g2, s.p2g2, target) && (
                              <>
                                <span>•</span>
                                <span className={s.p2g3 > s.p1g3 && isSetFinished(s.p1g3, s.p2g3, target) ? 'text-emerald-500 font-black' : ''}>{s.p2g3}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom row: court assignment & action indicator */}
                      <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-semibold">
                          {fixture.court ? `📍 ${fixture.court}` : "⚠️ No Court assigned"}
                        </span>
                        <span className="text-indigo-600 font-extrabold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Referee Match <Play className="w-3 h-3 fill-indigo-600" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Active Interactive Referee Score Sheet */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left/Middle Column: Score Keeper and Set toggles */}
            <div className="lg:col-span-2 space-y-6">
              
              {!canScore && (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
                  ⚠️ Read-Only Mode: You must be an administrator or a designated scorer to record match scores or modify game parameters.
                </div>
              )}
              
              {/* Setup / Configuration Widget */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Active Court:</span>
                  <select
                    value={activeFixture?.court || ''}
                    disabled={!canScore}
                    onChange={e => handleCourtChange(e.target.value)}
                    className="text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg p-1.5 focus:outline-hidden disabled:opacity-75"
                  >
                    <option value="">No Court Assigned</option>
                    {courts.map(court => (
                      <option key={court} value={court}>{court}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Points Target:</span>
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                    {[11, 15, 21, 30].map(pt => (
                      <button
                        key={pt}
                        disabled={!canScore}
                        onClick={() => handleTargetChange(pt)}
                        className={`px-2 py-1 text-[10px] font-black rounded-md ${
                          pointsTarget === pt 
                            ? 'bg-white text-slate-900 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        } disabled:opacity-75`}
                      >
                        {pt} pts
                      </button>
                    ))}
                  </div>
                </div>

                {canScore && (
                  <div>
                    <button 
                      onClick={() => setIsSwapped(!isSwapped)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" /> Swap Sides
                    </button>
                  </div>
                )}
              </div>

              {/* Main Score Controller Card */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500" />
                
                {/* Active Set indicator and status */}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">
                    {activeFixture?.groupName || "Tournament Pool"} • Best of 3 Sets
                  </span>
                  {getStatusBadge(activeFixture?.status || 'pending')}
                </div>

                {/* Live Rule & State Monitor Banner */}
                {(() => {
                  const statusInfo = getSetStatusText();
                  if (!statusInfo) return null;
                  return (
                    <div className={`mb-6 p-2.5 rounded-xl text-center text-xs font-bold border transition-all duration-300 ${statusInfo.className}`}>
                      {statusInfo.text}
                    </div>
                  );
                })()}

                {/* Big Interactive Scoring Fields */}
                <div className="grid grid-cols-2 gap-4 relative">
                  
                  {/* Vertical Divider */}
                  <div className="absolute inset-y-0 left-1/2 w-px bg-slate-800 -translate-x-1/2" />

                  {/* Player Side 1 */}
                  {(() => {
                    const player1Key = isSwapped ? 'player2' : 'player1';
                    const player1Label = isSwapped ? activeFixture?.player2Name : activeFixture?.player1Name;
                    const fieldName = isSwapped ? `p2g${currentSetIndex}` : `p1g${currentSetIndex}`;
                    const currentScore = activeFixture?.scores?.[fieldName] || 0;

                    return (
                      <div className="flex flex-col items-center justify-between space-y-6 text-center">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">
                            {isSwapped ? "Right Court" : "Left Court"}
                          </span>
                          <h3 className="text-base sm:text-lg font-black tracking-tight max-w-[140px] sm:max-w-[200px] truncate leading-tight">
                            {player1Label}
                          </h3>
                        </div>

                        {/* Point badge indications (Game Point, Match Point) */}
                        <div className="h-6">
                          {getPointBadge(currentSetIndex, player1Key)}
                        </div>

                        {/* Interactive Score Tapper */}
                        <div className="flex flex-col items-center gap-4">
                          <button
                            onClick={() => handleScoreChange(fieldName, 1)}
                            disabled={!canScore || activeFixture?.status === 'completed'}
                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 border-2 border-slate-700 hover:border-indigo-500 text-white transition flex flex-col items-center justify-center relative shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="text-4xl sm:text-5xl font-black font-mono tracking-tighter">{currentScore}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">{canScore ? "TAP TO ADD" : "READ ONLY"}</span>
                          </button>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleScoreChange(fieldName, -1)}
                              disabled={!canScore}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Subtract Point"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Player Side 2 */}
                  {(() => {
                    const player2Key = isSwapped ? 'player1' : 'player2';
                    const player2Label = isSwapped ? activeFixture?.player1Name : activeFixture?.player2Name;
                    const fieldName = isSwapped ? `p1g${currentSetIndex}` : `p2g${currentSetIndex}`;
                    const currentScore = activeFixture?.scores?.[fieldName] || 0;

                    return (
                      <div className="flex flex-col items-center justify-between space-y-6 text-center">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">
                            {isSwapped ? "Left Court" : "Right Court"}
                          </span>
                          <h3 className="text-base sm:text-lg font-black tracking-tight max-w-[140px] sm:max-w-[200px] truncate leading-tight">
                            {player2Label}
                          </h3>
                        </div>

                        {/* Point badge indications (Game Point, Match Point) */}
                        <div className="h-6">
                          {getPointBadge(currentSetIndex, player2Key)}
                        </div>

                        {/* Interactive Score Tapper */}
                        <div className="flex flex-col items-center gap-4">
                          <button
                            onClick={() => handleScoreChange(fieldName, 1)}
                            disabled={!canScore || activeFixture?.status === 'completed'}
                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 border-2 border-slate-700 hover:border-indigo-500 text-white transition flex flex-col items-center justify-center relative shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="text-4xl sm:text-5xl font-black font-mono tracking-tighter">{currentScore}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">{canScore ? "TAP TO ADD" : "READ ONLY"}</span>
                          </button>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleScoreChange(fieldName, -1)}
                              disabled={!canScore}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Subtract Point"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* Set Selector Tabs */}
                <div className="border-t border-slate-800 mt-8 pt-6">
                  <p className="text-center text-[10px] font-extrabold text-slate-500 tracking-wider uppercase mb-3">
                    Active Set Control Panel
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(num => {
                      const isActive = currentSetIndex === num;
                      const s = activeFixture?.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
                      const isDone = isSetFinished(s[`p1g${num}`] || 0, s[`p2g${num}`] || 0, pointsTarget);
                      
                      return (
                        <button
                          key={num}
                          onClick={() => setCurrentSetIndex(num)}
                          className={`py-2.5 rounded-xl text-xs font-black transition ${
                            isActive 
                              ? 'bg-indigo-600 text-white shadow-lg' 
                              : isDone 
                                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          SET {num}
                          {isDone && <span className="block text-[8px] font-medium text-emerald-400">Set Finished</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Set Results Overview Table */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-slate-400" /> Match Summary Table
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-extrabold">
                        <th className="pb-2">PLAYER</th>
                        <th className="pb-2 text-center">SET 1</th>
                        <th className="pb-2 text-center">SET 2</th>
                        <th className="pb-2 text-center">SET 3</th>
                        <th className="pb-2 text-center bg-slate-50 rounded-t-lg">SETS WON</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold text-slate-700">
                      <tr className="border-b border-slate-50">
                        <td className="py-2.5 truncate max-w-[150px]">{activeFixture?.player1Name}</td>
                        <td className="text-center py-2.5 font-mono">{activeFixture?.scores?.p1g1 || 0}</td>
                        <td className="text-center py-2.5 font-mono">{activeFixture?.scores?.p1g2 || 0}</td>
                        <td className="text-center py-2.5 font-mono">{activeFixture?.scores?.p1g3 || 0}</td>
                        <td className="text-center py-2.5 font-mono text-indigo-600 bg-slate-50/50">
                          {(() => {
                            let sets = 0;
                            const s = activeFixture?.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
                            if (isSetFinished(s.p1g1, s.p2g1, pointsTarget) && s.p1g1 > s.p2g1) sets++;
                            if (isSetFinished(s.p1g2, s.p2g2, pointsTarget) && s.p1g2 > s.p2g2) sets++;
                            if (isSetFinished(s.p1g3, s.p2g3, pointsTarget) && s.p1g3 > s.p2g3) sets++;
                            return sets;
                          })()}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 truncate max-w-[150px]">{activeFixture?.player2Name}</td>
                        <td className="text-center py-2.5 font-mono">{activeFixture?.scores?.p2g1 || 0}</td>
                        <td className="text-center py-2.5 font-mono">{activeFixture?.scores?.p2g2 || 0}</td>
                        <td className="text-center py-2.5 font-mono">{activeFixture?.scores?.p2g3 || 0}</td>
                        <td className="text-center py-2.5 font-mono text-indigo-600 bg-slate-50/50 rounded-b-lg">
                          {(() => {
                            let sets = 0;
                            const s = activeFixture?.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
                            if (isSetFinished(s.p1g1, s.p2g1, pointsTarget) && s.p2g1 > s.p1g1) sets++;
                            if (isSetFinished(s.p1g2, s.p2g2, pointsTarget) && s.p2g2 > s.p1g2) sets++;
                            if (isSetFinished(s.p1g3, s.p2g3, pointsTarget) && s.p2g3 > s.p1g3) sets++;
                            return sets;
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Right Column: Complete / Reset / Metadata Panel */}
            <div className="space-y-6">
              
              {/* Referee Action Box */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-4">
                <h3 className="font-extrabold text-slate-800 text-sm">Match Finalization</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Review the scores and finalize this match to sync results with brackets, standings, and public displays.
                </p>

                <div className="space-y-2.5 pt-2">
                  {canScore ? (
                    <>
                      <button
                        onClick={completeMatch}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm py-3 px-4 rounded-xl transition shadow-xs disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Save & Finalize Match
                      </button>

                      <button
                        onClick={resetMatch}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs py-2.5 px-4 rounded-xl transition disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset Match
                      </button>
                    </>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 text-slate-500 rounded-xl text-[11px] font-medium text-center">
                      🔒 Match finalization is locked (Read-Only Mode)
                    </div>
                  )}
                </div>
              </div>

              {/* Referee Integrity and Guidelines */}
              <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-200/60 space-y-3">
                <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-amber-800 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Referee Quick Guide
                </h4>
                <ul className="text-[11px] text-amber-900/80 font-medium space-y-1.5 list-disc list-inside">
                  <li>Standard matches require best 2-of-3 set wins.</li>
                  <li>A player must win a set by 2 clear points up to a maximum cap of 30 points.</li>
                  <li>Clicking "Swap Sides" changes their layout positions for physical orientation matches.</li>
                  <li>Setting the match to 'live' will stream results directly to courtside screens and OBS ticker overlays.</li>
                </ul>
              </div>

            </div>

          </div>
        )}
      </div>

      {completedSetPopup && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl p-6 text-center transform scale-100 transition-all duration-300 relative overflow-hidden">
            
            {/* Ambient success light glow on top */}
            <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-500 via-indigo-500 to-emerald-500" />
            
            <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 border border-emerald-100">
              <Trophy className="w-8 h-8" />
            </div>

            <span className="text-[10px] font-black tracking-widest uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
              {completedSetPopup.isMatchOver ? 'Match Completed' : `Set ${completedSetPopup.setIndex} Completed`}
            </span>

            <h3 className="font-black text-2xl text-slate-800 tracking-tight mt-4">
              {completedSetPopup.winnerName} Wins!
            </h3>

            <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-wider">
              {completedSetPopup.isMatchOver ? 'Match finished' : `Set score`}: <span className="font-mono text-emerald-600 font-black text-sm">{completedSetPopup.scoreStr}</span>
            </p>

            <div className="mt-6 space-y-2">
              {completedSetPopup.isMatchOver ? (
                <button
                  onClick={async () => {
                    setCompletedSetPopup(null);
                    await completeMatch();
                  }}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition shadow-lg hover:shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer text-sm"
                >
                  🏆 Save & Finalize Match
                </button>
              ) : (
                <button
                  onClick={() => {
                    setCurrentSetIndex(completedSetPopup.nextSetIndex);
                    setCompletedSetPopup(null);
                  }}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer text-sm"
                >
                  Start Set {completedSetPopup.nextSetIndex} <ChevronRight className="w-4 h-4" />
                </button>
              )}
              
              <button
                onClick={() => setCompletedSetPopup(null)}
                className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Stay on Set {completedSetPopup.setIndex} (Correct Score)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
