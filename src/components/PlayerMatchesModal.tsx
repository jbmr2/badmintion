import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { 
  X, Trophy, Clock, Play, MapPin, Award, 
  TrendingUp, Star, Users, CheckCircle, Flame, Calendar
} from 'lucide-react';
import { motion } from 'motion/react';

interface Fixture {
  id: string;
  matchId?: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  status: string; // 'pending' | 'live' | 'completed'
  groupName?: string;
  matchType?: string;
  pointsTarget?: string;
  court?: string;
  scores?: {
    p1g1?: number;
    p2g1?: number;
    p1g2?: number;
    p2g2?: number;
    p1g3?: number;
    p2g3?: number;
  };
  finalizedAt?: number;
}

interface PlayerMatchesModalProps {
  playerId: string;
  playerName: string;
  tournamentId: string;
  onClose: () => void;
  playerL1Map?: Record<string, string>;
  playerL2Map?: Record<string, string>;
}

export default function PlayerMatchesModal({ 
  playerId, 
  playerName, 
  tournamentId, 
  onClose,
  playerL1Map = {},
  playerL2Map = {}
}: PlayerMatchesModalProps) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'completed' | 'scheduled'>('all');

  useEffect(() => {
    if (!tournamentId || !playerId) return;

    const qFixtures = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribe = onSnapshot(qFixtures, (snapshot) => {
      const allFixtures = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Fixture[];

      // Filter to only fixtures involving this player
      const filtered = allFixtures.filter(f => f.player1Id === playerId || f.player2Id === playerId);

      // Sort: Completed matches sorted by finalizedAt desc, other matches sorted by matchId/type or insertion
      filtered.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return -1;
        if (a.status !== 'completed' && b.status === 'completed') return 1;
        if (a.status === 'completed' && b.status === 'completed') {
          return (b.finalizedAt || 0) - (a.finalizedAt || 0);
        }
        return (a.matchId || '').localeCompare(b.matchId || '');
      });

      setFixtures(filtered);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching player fixtures:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tournamentId, playerId]);

  // Helper to check if a set was won by a specific player in a fixture
  const didPlayerWinSet = (scores: any, setNum: number, isPlayer1: boolean) => {
    if (!scores) return false;
    const p1 = scores[`p1g${setNum}`] ?? 0;
    const p2 = scores[`p2g${setNum}`] ?? 0;
    if (p1 === 0 && p2 === 0) return false;
    return isPlayer1 ? p1 > p2 : p2 > p1;
  };

  // Calculate Statistics
  const stats = fixtures.reduce((acc, f) => {
    if (f.status !== 'completed' || !f.scores) return acc;
    
    acc.played++;
    const isP1 = f.player1Id === playerId;
    const s = f.scores;

    // Count sets won and lost
    let setsWon = 0;
    let setsLost = 0;
    let ptsScored = 0;
    let ptsAgainst = 0;

    for (let i = 1; i <= 3; i++) {
      const p1 = s[`p1g${i}`] ?? 0;
      const p2 = s[`p2g${i}`] ?? 0;
      
      if (p1 > 0 || p2 > 0) {
        ptsScored += isP1 ? p1 : p2;
        ptsAgainst += isP1 ? p2 : p1;

        if (p1 > p2) {
          isP1 ? setsWon++ : setsLost++;
        } else if (p2 > p1) {
          isP1 ? setsLost++ : setsWon++;
        }
      }
    }

    acc.setsWon += setsWon;
    acc.setsLost += setsLost;
    acc.ptsScored += ptsScored;
    acc.ptsAgainst += ptsAgainst;

    if (setsWon > setsLost) {
      acc.wins++;
    } else {
      acc.losses++;
    }

    return acc;
  }, { played: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, ptsScored: 0, ptsAgainst: 0 });

  const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  const setDiff = stats.setsWon - stats.setsLost;
  const pointDiff = stats.ptsScored - stats.ptsAgainst;

  // Filter fixtures for view sub-tabs
  const displayedFixtures = fixtures.filter(f => {
    if (activeSubTab === 'completed') return f.status === 'completed';
    if (activeSubTab === 'scheduled') return f.status === 'pending' || f.status === 'live';
    return true;
  });

  const getMatchTypeLabel = (type?: string, group?: string) => {
    if (!type || type === 'league') {
      return group ? `Group ${group}` : 'League';
    }
    const clean = type.replace('_', ' ').replace('-', ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  const getMatchTypeBadgeClass = (type?: string) => {
    if (!type || type === 'league') return 'bg-indigo-50 border border-indigo-100 text-indigo-700';
    if (type === 'live') return 'bg-rose-50 border border-rose-100 text-rose-700 animate-pulse';
    return 'bg-amber-50 border border-amber-100 text-amber-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-slate-50 border border-slate-200/80 w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] z-10 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="bg-white border-b border-slate-150 p-5 sm:p-6 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-4.5">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <Trophy className="w-6 h-6 sm:w-7 h-7" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight truncate">
                {playerName}
              </h2>
              {/* Hierarchy Info */}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {playerL1Map[playerId] && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200/60 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {playerL1Map[playerId]}
                  </span>
                )}
                {playerL2Map[playerId] && (
                  <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-150 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {playerL2Map[playerId]}
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 border border-slate-150 px-2 py-0.5 rounded">
                  ID: {playerId.slice(0, 6).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Scroll Container */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-grow">
          {/* Bento-style Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* Win Rate Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-150/80 shadow-xs flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                <Flame className="w-3 h-3 text-indigo-500" /> Win Rate
              </span>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-indigo-900 leading-none">{winRate}%</span>
                <span className="text-[10px] font-bold text-slate-400">ratio</span>
              </div>
            </div>

            {/* Match Win-Loss Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-150/80 shadow-xs flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-500" /> Matches
              </span>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-black text-slate-800 leading-none">
                  {stats.wins}
                </span>
                <span className="text-xs text-slate-400 font-bold">W</span>
                <span className="text-slate-300 font-black">/</span>
                <span className="text-xl font-extrabold text-slate-500 leading-none">
                  {stats.losses}
                </span>
                <span className="text-xs text-slate-400 font-bold">L</span>
              </div>
            </div>

            {/* Set Diff Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-150/80 shadow-xs flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-500" /> Sets Record
              </span>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-slate-800 leading-none">
                  {stats.setsWon}-{stats.setsLost}
                </span>
                <span className={`text-[10px] font-black ml-1.5 px-1.5 py-0.25 rounded uppercase ${setDiff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {setDiff >= 0 ? `+${setDiff}` : setDiff} diff
                </span>
              </div>
            </div>

            {/* Point Diff Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-150/80 shadow-xs flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-slate-500" /> Points Ratio
              </span>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-2xl font-black text-slate-800 leading-none" title={`${stats.ptsScored} scored / ${stats.ptsAgainst} conceded`}>
                  {stats.ptsScored}:{stats.ptsAgainst}
                </span>
                <span className={`text-[10px] font-black ml-1.5 px-1.5 py-0.25 rounded uppercase ${pointDiff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {pointDiff >= 0 ? `+${pointDiff}` : pointDiff} diff
                </span>
              </div>
            </div>
          </div>

          {/* Sub-Tab Navigation for Matches List */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl">
              <button
                onClick={() => setActiveSubTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSubTab === 'all' 
                    ? 'bg-white text-slate-800 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All ({fixtures.length})
              </button>
              <button
                onClick={() => setActiveSubTab('completed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSubTab === 'completed' 
                    ? 'bg-white text-slate-800 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Completed ({fixtures.filter(f => f.status === 'completed').length})
              </button>
              <button
                onClick={() => setActiveSubTab('scheduled')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSubTab === 'scheduled' 
                    ? 'bg-white text-slate-800 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Unplayed ({fixtures.filter(f => f.status !== 'completed').length})
              </button>
            </div>
            
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">
              Match History
            </span>
          </div>

          {/* Matches List */}
          {loading ? (
            <div className="space-y-3.5 py-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-20 bg-slate-100 rounded-2xl animate-pulse"></div>
              ))}
            </div>
          ) : displayedFixtures.length === 0 ? (
            <div className="py-12 text-center bg-white border border-slate-150 rounded-2xl shadow-xs">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="font-extrabold text-slate-800 text-sm">No matches found</h4>
              <p className="text-xs text-slate-400 max-w-[280px] mx-auto mt-1 font-medium">
                There are no matches under this category for this player.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {displayedFixtures.map((f) => {
                const isP1 = f.player1Id === playerId;
                const isP2 = f.player2Id === playerId;
                
                // Determine winner
                let winnerKey: 'player1' | 'player2' | null = null;
                if (f.status === 'completed' && f.scores) {
                  const s = f.scores;
                  const p1Sets = (s.p1g1! > s.p2g1! ? 1 : 0) + (s.p1g2! > s.p2g2! ? 1 : 0) + (s.p1g3! > s.p2g3! ? 1 : 0);
                  const p2Sets = (s.p2g1! > s.p1g1! ? 1 : 0) + (s.p2g2! > s.p1g2! ? 1 : 0) + (s.p2g3! > s.p1g3! ? 1 : 0);
                  winnerKey = p1Sets > p2Sets ? 'player1' : p2Sets > p1Sets ? 'player2' : null;
                }

                const didUserWin = (isP1 && winnerKey === 'player1') || (isP2 && winnerKey === 'player2');
                const didUserLose = (isP1 && winnerKey === 'player2') || (isP2 && winnerKey === 'player1');

                // Determine border and coloring based on result
                let cardBorder = 'border-slate-150 hover:border-slate-300';
                let indicatorBg = 'bg-slate-300';
                let resultBadge = null;

                if (f.status === 'completed') {
                  if (didUserWin) {
                    cardBorder = 'border-emerald-200/90 hover:border-emerald-300 bg-emerald-50/10';
                    indicatorBg = 'bg-emerald-500';
                    resultBadge = (
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">
                        WON
                      </span>
                    );
                  } else if (didUserLose) {
                    cardBorder = 'border-rose-150 hover:border-rose-250 bg-rose-50/10';
                    indicatorBg = 'bg-rose-500';
                    resultBadge = (
                      <span className="text-[9px] font-black text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded uppercase">
                        LOST
                      </span>
                    );
                  }
                } else if (f.status === 'live') {
                  cardBorder = 'border-indigo-400 ring-4 ring-indigo-50 bg-indigo-50/5';
                  indicatorBg = 'bg-indigo-500 animate-ping';
                  resultBadge = (
                    <span className="text-[9px] font-black text-indigo-700 bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded uppercase animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" /> LIVE
                    </span>
                  );
                } else {
                  resultBadge = (
                    <span className="text-[9px] font-black text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                      PENDING
                    </span>
                  );
                }

                return (
                  <div 
                    key={f.id}
                    className={`bg-white border rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 transition shadow-xs ${cardBorder}`}
                  >
                    {/* Left Column: Match Type & Opponent Info */}
                    <div className="flex-grow space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${getMatchTypeBadgeClass(f.matchType)}`}>
                          {getMatchTypeLabel(f.matchType, f.groupName)}
                        </span>
                        {resultBadge}
                        <span className="font-mono text-[9px] font-black text-slate-400 tracking-wider">
                          #{f.matchId?.toUpperCase() || 'PND'}
                        </span>
                      </div>

                      <div className="flex flex-col space-y-1.5 mt-2">
                        {/* Player 1 Row */}
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${f.status === 'completed' && winnerKey === 'player1' ? 'bg-emerald-500' : 'bg-transparent'}`} />
                          <span className={`text-sm ${
                            isP1 
                              ? 'font-black text-indigo-700 underline decoration-indigo-200 decoration-2 underline-offset-2' 
                              : f.status === 'completed' && winnerKey === 'player1' 
                                ? 'font-bold text-slate-800' 
                                : 'font-medium text-slate-600'
                          }`}>
                            {f.player1Name}
                          </span>
                          {isP1 && (
                            <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">
                              You
                            </span>
                          )}
                        </div>

                        {/* Player 2 Row */}
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${f.status === 'completed' && winnerKey === 'player2' ? 'bg-emerald-500' : 'bg-transparent'}`} />
                          <span className={`text-sm ${
                            isP2 
                              ? 'font-black text-indigo-700 underline decoration-indigo-200 decoration-2 underline-offset-2' 
                              : f.status === 'completed' && winnerKey === 'player2' 
                                ? 'font-bold text-slate-800' 
                                : 'font-medium text-slate-600'
                          }`}>
                            {f.player2Name}
                          </span>
                          {isP2 && (
                            <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Game Scores or Match Settings */}
                    <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-3 border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0 shrink-0">
                      {f.status === 'completed' && f.scores ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                            Set Scores
                          </span>
                          <div className="flex items-center gap-1.5 font-mono">
                            {[1, 2, 3].map((gIndex) => {
                              const p1G = f.scores?.[`p1g${gIndex}` as keyof typeof f.scores];
                              const p2G = f.scores?.[`p2g${gIndex}` as keyof typeof f.scores];
                              
                              if (p1G === undefined || p2G === undefined || (p1G === 0 && p2G === 0)) return null;

                              const isUserHigher = (isP1 && p1G > p2G) || (isP2 && p2G > p1G);
                              const isOpponentHigher = (isP1 && p2G > p1G) || (isP2 && p1G > p2G);

                              return (
                                <div 
                                  key={gIndex} 
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border transition ${
                                    isUserHigher 
                                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' 
                                      : isOpponentHigher 
                                        ? 'bg-slate-50 border-slate-200 text-slate-500' 
                                        : 'bg-slate-50 border-slate-150 text-slate-600'
                                  }`}
                                >
                                  <span>{isP1 ? p1G : p2G}</span>
                                  <span className="text-slate-300 font-black">-</span>
                                  <span>{isP1 ? p2G : p1G}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                          <span className="font-bold text-slate-500 text-[10px] flex items-center gap-0.5">
                            🎯 Target: {f.pointsTarget || '15'} pts
                          </span>
                          {f.court && (
                            <span className="font-black text-amber-700 bg-amber-50 border border-amber-100/70 px-2 py-0.5 rounded flex items-center gap-1 text-[9px] uppercase tracking-wider">
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              {f.court}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-white border-t border-slate-150 p-4 sm:p-5 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs hover:bg-slate-700 transition"
          >
            Close History
          </button>
        </div>
      </motion.div>
    </div>
  );
}
