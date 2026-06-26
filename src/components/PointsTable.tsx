import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
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
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StandingPlayer {
  playerId: string;
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

export default function PointsTable({ tournamentId }: { tournamentId: string }) {
  const [matches, setMatches] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'standings' | 'brackets' | 'schedule'>('standings');
  const [fixtureToDelete, setFixtureToDelete] = useState<any | null>(null);

  // Manual scheduling state
  const [selectedP1, setSelectedP1] = useState('');
  const [selectedP2, setSelectedP2] = useState('');
  const [selectedStage, setSelectedStage] = useState<'quarter' | 'semi' | 'final'>('quarter');
  const [pointsTarget, setPointsTarget] = useState('21');

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
        setGroups(snapshot.docs.map(doc => doc.data()));
    });

    const qPlayers = query(collection(db, `tournaments/${tournamentId}/players`));
    const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
        setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
        unsubscribeMatches();
        unsubscribeFixtures();
        unsubscribeGroups();
        unsubscribePlayers();
    };
  }, [tournamentId]);

  const playerMap = Object.fromEntries(players.map(p => [p.id, p.name]));
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
    if (!fixture || !fixture.scores) return null;
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
  
  // Initialize with all groups and players
  groups.forEach(group => {
      groupedStats[group.name] = {};
      group.playerIds?.forEach((playerId: string) => {
          const playerName = playerMap[playerId];
          if (playerName) {
              groupedStats[group.name][playerName] = { 
                  playerId,
                  wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0 
              };
          }
      });
  });

  matches.forEach(match => {
      const fixture = fixtures.find(f => f.id === match.fixtureId);
      if (!fixture || !fixture.groupName) return;

      const groupName = fixture.groupName;
      const p1 = fixture.player1Name;
      const p2 = fixture.player2Name;
      const s = match.scores;

      // Ignore matches that are designated as knockout match types for group standings
      if (fixture.matchType && fixture.matchType !== 'league') return;

      if (!groupedStats[groupName]) groupedStats[groupName] = {};
      if (!groupedStats[groupName][p1]) {
        groupedStats[groupName][p1] = { playerId: fixture.player1Id, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0 };
      }
      if (!groupedStats[groupName][p2]) {
        groupedStats[groupName][p2] = { playerId: fixture.player2Id, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0 };
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
  });

  // Calculate sorted rankings for each group
  const groupRankings: Record<string, StandingPlayer[]> = {};
  Object.entries(groupedStats).forEach(([groupName, groupPlayers]) => {
    groupRankings[groupName] = Object.entries(groupPlayers).map(([playerName, stats]: any) => {
      const played = stats.wins + stats.losses;
      const matchPoints = stats.wins * 2;
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
  const quarters = fixtures.filter(f => f.matchType === 'quarter');
  const semis = fixtures.filter(f => f.matchType === 'semi');
  const finals = fixtures.filter(f => f.matchType === 'final');

  // Delete a fixture
  const handleDeleteFixture = async (id: string) => {
    try {
      await deleteDoc(doc(db, `tournaments/${tournamentId}/fixtures`, id));
      
      // Delete associated match document if completed
      const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`));
      const mSnap = await getDocs(matchesQuery);
      const assocMatch = mSnap.docs.find(doc => doc.data().fixtureId === id);
      if (assocMatch) {
        await deleteDoc(assocMatch.ref);
      }
      setFixtureToDelete(null);
    } catch (e) {
      console.error("Error deleting knockout match:", e);
    }
  };

  // Schedule a custom knockout match manually
  const scheduleKnockoutManual = async () => {
    if (!selectedP1 || !selectedP2 || selectedP1 === selectedP2) {
      alert("Please select two distinct players to schedule.");
      return;
    }
    try {
      setGenerating(true);
      const stageLabels = { quarter: 'Quarter Finals', semi: 'Semi Finals', final: 'Finals' };
      const docRef = await addDoc(collection(db, `tournaments/${tournamentId}/fixtures`), {
        player1Id: selectedP1,
        player1Name: playerMap[selectedP1],
        player2Id: selectedP2,
        player2Name: playerMap[selectedP2],
        groupName: stageLabels[selectedStage],
        matchType: selectedStage,
        pointsTarget: pointsTarget,
        status: 'pending',
        scores: { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 }
      });
      await updateDoc(docRef, { matchId: generateShortId() });
      
      setSelectedP1('');
      setSelectedP2('');
      setActiveTab('brackets');
    } catch (e) {
      console.error("Error scheduling knockout manual match:", e);
    } finally {
      setGenerating(false);
    }
  };

  // Automated Bracket Generation triggers
  const autoGenerateQuarters = async () => {
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
          if (!window.confirm(`Only ${completedQuarters.length} of ${quarters.length} Quarter Finals are finished. Proceed using current winners?`)) {
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
        if (!window.confirm(`Only ${completedSemis.length} of ${semis.length} Semi-Final matches are finished. Seeding Final with current winners?`)) {
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

        {/* Tab Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
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
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 text-xs font-extrabold rounded-xl transition ${
              activeTab === 'schedule' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚙️ Stage Planner
          </button>
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
            {Object.keys(groupRankings).length === 0 ? (
              <div className="bg-white border border-slate-100 p-10 rounded-3xl text-center shadow-sm">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-extrabold text-slate-800">No Groups Found</h3>
                <p className="text-slate-500 text-sm mt-1">Please create groups and complete matches to view standings.</p>
              </div>
            ) : (
              Object.entries(groupRankings).sort((a, b) => a[0].localeCompare(b[0])).map(([groupName, sortedPlayers]) => (
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
                    <table className="w-full border-collapse text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-extrabold uppercase">
                          <th className="p-3 text-center w-12">Rank</th>
                          <th className="p-3">Player / Team</th>
                          <th className="p-3 text-center font-bold">Played</th>
                          <th className="p-3 text-center text-emerald-600 font-bold">W</th>
                          <th className="p-3 text-center text-rose-600 font-bold">L</th>
                          <th className="p-3 text-center text-indigo-600 font-extrabold">Points</th>
                          <th className="p-3 text-center font-semibold">Sets Won</th>
                          <th className="p-3 text-center font-semibold">Sets Lost</th>
                          <th className="p-3 text-center">Set Diff</th>
                          <th className="p-3 text-center">Pts Scored</th>
                          <th className="p-3 text-center">Pts Against</th>
                          <th className="p-3 text-center">Pt Diff</th>
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
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-slate-800 text-sm">{p.playerName}</span>
                                  {isPromoted && (
                                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">
                                      Qualified
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Played / Wins / Losses */}
                              <td className="p-3 text-center text-slate-600 font-bold">{p.played}</td>
                              <td className="p-3 text-center font-bold text-emerald-600">{p.wins}</td>
                              <td className="p-3 text-center font-bold text-rose-600">{p.losses}</td>

                              {/* Total Standing Points */}
                              <td className="p-3 text-center font-black text-sm text-indigo-600">
                                {p.matchPoints}
                              </td>

                              {/* Sets Won / Lost */}
                              <td className="p-3 text-center font-mono">{p.gamesWon}</td>
                              <td className="p-3 text-center font-mono">{p.gamesLost}</td>
                              <td className={`p-3 text-center font-mono font-bold ${p.gameDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {p.gameDiff > 0 ? `+${p.gameDiff}` : p.gameDiff}
                              </td>

                              {/* Points Scored / Against / Diff */}
                              <td className="p-3 text-center text-slate-500 font-mono">{p.pointsScored}</td>
                              <td className="p-3 text-center text-slate-500 font-mono">{p.pointsAgainst}</td>
                              <td className={`p-3 text-center font-mono font-bold ${p.pointDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
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
            {quarters.length === 0 && semis.length === 0 && finals.length === 0 && (
              <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl text-center">
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

            {/* Bracket columns mapping */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              
              {/* STAGE A: QUARTER FINALS */}
              <div className="space-y-4">
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
                  <span className="font-black text-xs uppercase tracking-widest text-indigo-400">Quarter Finals</span>
                  <span className="text-[10px] bg-indigo-950 px-2 py-0.5 rounded font-bold font-mono">{quarters.length} Matches</span>
                </div>

                <div className="space-y-3.5">
                  {quarters.length === 0 ? (
                    <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-[11px] text-slate-400 font-bold bg-slate-50/40">
                      QF Bracket Pending Seeding
                    </div>
                  ) : (
                    quarters.map((f, idx) => {
                      const winner = getFixtureWinner(f);
                      return (
                        <div key={f.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative group overflow-hidden">
                          {/* Match Header info */}
                          <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 mb-2.5">
                            <span>MATCH {idx + 1} ({f.pointsTarget || '21'} pts) {f.court ? `• ${f.court}` : ''}</span>
                            <button 
                              onClick={() => setFixtureToDelete(f)}
                              className="text-slate-300 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"
                              title="Delete Fixture"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Players row */}
                          <div className="space-y-2">
                            {/* Player 1 */}
                            <div className="flex justify-between items-center text-xs">
                              <span className={`font-extrabold truncate max-w-[130px] ${
                                winner?.key === 'player1' ? 'text-indigo-600 font-black' : 'text-slate-700'
                              }`}>
                                {f.player1Name}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded">
                                {f.scores?.p1g1 || 0}-{f.scores?.p2g1 || 0} , {f.scores?.p1g2 || 0}-{f.scores?.p2g2 || 0}
                              </span>
                            </div>

                            {/* Player 2 */}
                            <div className="flex justify-between items-center text-xs">
                              <span className={`font-extrabold truncate max-w-[130px] ${
                                winner?.key === 'player2' ? 'text-indigo-600 font-black' : 'text-slate-700'
                              }`}>
                                {f.player2Name}
                              </span>
                              <span className="font-mono text-xs text-indigo-600 font-black">
                                {f.status === 'completed' && winner ? (
                                  <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] uppercase tracking-wide">Winner</span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 capitalize font-bold">{f.status || 'Pending'}</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* STAGE B: SEMI FINALS */}
              <div className="space-y-4">
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
                  <span className="font-black text-xs uppercase tracking-widest text-emerald-400">Semi Finals</span>
                  <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded font-bold font-mono">{semis.length} Matches</span>
                </div>

                <div className="space-y-3.5">
                  {semis.length === 0 ? (
                    <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-[11px] text-slate-400 font-bold bg-slate-50/40">
                      SF Bracket Pending Seeding
                    </div>
                  ) : (
                    semis.map((f, idx) => {
                      const winner = getFixtureWinner(f);
                      return (
                        <div key={f.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative group overflow-hidden">
                          {/* Match Header info */}
                          <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 mb-2.5">
                            <span>SEMI FINAL {idx + 1} ({f.pointsTarget || '21'} pts) {f.court ? `• ${f.court}` : ''}</span>
                            <button 
                              onClick={() => setFixtureToDelete(f)}
                              className="text-slate-300 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"
                              title="Delete Fixture"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Players row */}
                          <div className="space-y-2">
                            {/* Player 1 */}
                            <div className="flex justify-between items-center text-xs">
                              <span className={`font-extrabold truncate max-w-[130px] ${
                                winner?.key === 'player1' ? 'text-emerald-600 font-black' : 'text-slate-700'
                              }`}>
                                {f.player1Name}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded">
                                {f.scores?.p1g1 || 0}-{f.scores?.p2g1 || 0} , {f.scores?.p1g2 || 0}-{f.scores?.p2g2 || 0}
                              </span>
                            </div>

                            {/* Player 2 */}
                            <div className="flex justify-between items-center text-xs">
                              <span className={`font-extrabold truncate max-w-[130px] ${
                                winner?.key === 'player2' ? 'text-emerald-600 font-black' : 'text-slate-700'
                              }`}>
                                {f.player2Name}
                              </span>
                              <span className="font-mono text-xs text-emerald-600 font-black">
                                {f.status === 'completed' && winner ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 rounded text-[9px] uppercase tracking-wide">Winner</span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 capitalize font-bold">{f.status || 'Pending'}</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* STAGE C: GRAND FINAL */}
              <div className="space-y-4">
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-sm">
                  <span className="font-black text-xs uppercase tracking-widest text-amber-400">Grand Final</span>
                  <span className="text-[10px] bg-amber-950 px-2 py-0.5 rounded font-bold font-mono">1 Match</span>
                </div>

                <div className="space-y-3.5">
                  {finals.length === 0 ? (
                    <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center text-[11px] text-slate-400 font-bold bg-slate-50/40">
                      Final Pending Promotion
                    </div>
                  ) : (
                    finals.map((f) => {
                      const winner = getFixtureWinner(f);
                      return (
                        <div key={f.id} className="bg-indigo-950 text-white border border-indigo-900 rounded-2xl p-5 shadow-lg relative group overflow-hidden">
                          <div className="absolute top-0 right-0 p-1.5">
                            <Award className="w-5 h-5 text-amber-400 animate-pulse" />
                          </div>

                          {/* Match Header info */}
                          <div className="flex justify-between items-center text-[9px] font-black text-indigo-400 uppercase tracking-widest border-b border-indigo-900 pb-2 mb-3">
                            <span>CHAMPIONSHIP FINALS ({f.pointsTarget || '21'} pts) {f.court ? `• ${f.court}` : ''}</span>
                            <button 
                              onClick={() => setFixtureToDelete(f)}
                              className="text-indigo-800 hover:text-rose-400 transition opacity-0 group-hover:opacity-100"
                              title="Delete Fixture"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Players row */}
                          <div className="space-y-2.5">
                            {/* Player 1 */}
                            <div className="flex justify-between items-center text-sm">
                              <span className={`font-black truncate max-w-[130px] ${
                                winner?.key === 'player1' ? 'text-amber-400' : 'text-slate-200'
                              }`}>
                                {f.player1Name}
                              </span>
                              <span className="font-mono text-xs font-extrabold text-slate-300">
                                {f.scores?.p1g1 || 0}-{f.scores?.p2g1 || 0}
                              </span>
                            </div>

                            {/* Player 2 */}
                            <div className="flex justify-between items-center text-sm">
                              <span className={`font-black truncate max-w-[130px] ${
                                winner?.key === 'player2' ? 'text-amber-400' : 'text-slate-200'
                              }`}>
                                {f.player2Name}
                              </span>
                              <span className="font-mono text-xs font-extrabold text-slate-300">
                                {f.scores?.p1g2 || 0}-{f.scores?.p2g2 || 0}
                              </span>
                            </div>
                          </div>

                          {f.status === 'completed' && winner && (
                            <div className="mt-4 pt-3 border-t border-indigo-900 text-center space-y-1 bg-indigo-900/40 rounded-xl p-2">
                              <p className="text-[10px] font-black tracking-widest text-amber-400 uppercase">🏆 TOURNAMENT CHAMPION 🏆</p>
                              <p className="font-black text-lg tracking-tight text-white">{winner.name}</p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
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
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-extrabold text-base text-slate-800">Manual Stage Bracket Seeder</h3>
                </div>

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

                  {/* Stage & Target Point Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Knockout Stage</label>
                      <select 
                        value={selectedStage} 
                        onChange={e => setSelectedStage(e.target.value as any)} 
                        className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      >
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
                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Create Custom Stage Fixture
                  </button>
                </div>
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

    </div>
  );
}
