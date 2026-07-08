import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Trophy, Calendar, Sparkles, Clock, Star } from 'lucide-react';

interface Fixture {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  status: string;
  groupName?: string;
  matchType?: string;
  court?: string;
  isWalkover?: boolean;
  walkoverWinner?: string;
  scores?: {
    p1g1: number;
    p2g1: number;
    p1g2: number;
    p2g2: number;
    p1g3: number;
    p2g3: number;
  };
  finalizedAt?: number;
}

export default function RecentMatches({ tournamentId }: { tournamentId: string }) {
  const [recentFixtures, setRecentFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fixturesQuery = query(
      collection(db, `tournaments/${tournamentId}/fixtures`),
      where('status', '==', 'completed')
    );

    const unsubscribe = onSnapshot(fixturesQuery, (snapshot) => {
      const completedList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Fixture[];

      // Sort in-memory: finalizedAt descending. 
      // If finalizedAt is missing, fallback to doc ID comparison.
      completedList.sort((a, b) => {
        const timeA = a.finalizedAt || 0;
        const timeB = b.finalizedAt || 0;
        if (timeB !== timeA) {
          return timeB - timeA;
        }
        return b.id.localeCompare(a.id);
      });

      // Keep top 5
      setRecentFixtures(completedList.slice(0, 5));
      setLoading(false);
    }, (error) => {
      console.error("Error listening to completed fixtures: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tournamentId]);

  // Helper to determine the winner of a completed fixture
  const getWinner = (f: Fixture) => {
    if (f.isWalkover) return f.walkoverWinner as 'player1' | 'player2';
    if (!f.scores) return null;
    const s = f.scores;
    const p1Sets = (s.p1g1 > s.p2g1 ? 1 : 0) + (s.p1g2 > s.p2g2 ? 1 : 0) + (s.p1g3 > s.p2g3 ? 1 : 0);
    const p2Sets = (s.p2g1 > s.p1g1 ? 1 : 0) + (s.p2g2 > s.p1g2 ? 1 : 0) + (s.p2g3 > s.p1g3 ? 1 : 0);
    if (p1Sets > p2Sets) return 'player1';
    if (p2Sets > p1Sets) return 'player2';
    return null;
  };

  // Helper to format the time since completion
  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'Completed';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Helper to format match type labels beautifully
  const formatStage = (type?: string, group?: string) => {
    if (!type || type === 'league') {
      return group ? `Group ${group}` : 'League Match';
    }
    const clean = type.replace('_', ' ').replace('-', ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4 animate-pulse">
        <div className="h-6 w-1/3 bg-slate-100 rounded"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 bg-slate-50 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-150/70 rounded-3xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 tracking-tight text-lg">Recent Matches</h3>
            <p className="text-xs text-slate-400 font-medium">Real-time finalized scores</p>
          </div>
        </div>
        {recentFixtures.length > 0 && (
          <span className="text-[10px] bg-slate-100 px-2.5 py-1 rounded-full font-black text-slate-500 uppercase tracking-wider font-mono">
            Latest 5
          </span>
        )}
      </div>

      {recentFixtures.length === 0 ? (
        <div className="py-10 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="font-bold text-slate-700 text-sm">No matches completed yet</h4>
          <p className="text-xs text-slate-400 max-w-[250px] mx-auto mt-1 font-medium">
            Once match scores are submitted or referee matches are finished, they will appear here!
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {recentFixtures.map((f) => {
            const winner = getWinner(f);
            const p1Won = winner === 'player1';
            const p2Won = winner === 'player2';

            return (
              <div 
                key={f.id} 
                className="flex items-center justify-between p-4 bg-slate-50/60 rounded-2xl hover:bg-slate-50 transition border border-slate-100/80 group"
              >
                {/* Players & Scores Section */}
                <div className="space-y-2 flex-grow min-w-0 pr-4">
                  {/* Player 1 Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {p1Won && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                      <span className={`text-sm truncate ${p1Won ? 'font-black text-indigo-600' : 'font-semibold text-slate-600'}`}>
                        {f.player1Name}
                      </span>
                    </div>
                    {/* Game Scores for Player 1 */}
                    <div className="flex items-center gap-1.5 font-mono text-xs pl-2 shrink-0">
                      {f.isWalkover ? (
                        f.walkoverWinner === 'player1' ? (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded border border-amber-200 shrink-0">W.O. WIN</span>
                        ) : (
                          <span className="text-[10px] bg-slate-50 text-slate-400 font-semibold px-1.5 py-0.5 rounded border border-slate-150 shrink-0">L via W.O.</span>
                        )
                      ) : (
                        f.scores && (
                          <>
                            <span className={`px-1.5 py-0.5 rounded ${f.scores.p1g1 > f.scores.p2g1 ? 'bg-indigo-100/70 font-black text-indigo-700' : 'text-slate-400'}`}>
                              {f.scores.p1g1}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded ${f.scores.p1g2 > f.scores.p2g2 ? 'bg-indigo-100/70 font-black text-indigo-700' : 'text-slate-400'}`}>
                              {f.scores.p1g2}
                            </span>
                            {(f.scores.p1g3 > 0 || f.scores.p2g3 > 0) && (
                              <span className={`px-1.5 py-0.5 rounded ${f.scores.p1g3 > f.scores.p2g3 ? 'bg-indigo-100/70 font-black text-indigo-700' : 'text-slate-400'}`}>
                                {f.scores.p1g3}
                              </span>
                            )}
                          </>
                        )
                      )}
                    </div>
                  </div>

                  {/* Player 2 Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {p2Won && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                      <span className={`text-sm truncate ${p2Won ? 'font-black text-indigo-600' : 'font-semibold text-slate-600'}`}>
                        {f.player2Name}
                      </span>
                    </div>
                    {/* Game Scores for Player 2 */}
                    <div className="flex items-center gap-1.5 font-mono text-xs pl-2 shrink-0">
                      {f.isWalkover ? (
                        f.walkoverWinner === 'player2' ? (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded border border-amber-200 shrink-0">W.O. WIN</span>
                        ) : (
                          <span className="text-[10px] bg-slate-50 text-slate-400 font-semibold px-1.5 py-0.5 rounded border border-slate-150 shrink-0">L via W.O.</span>
                        )
                      ) : (
                        f.scores && (
                          <>
                            <span className={`px-1.5 py-0.5 rounded ${f.scores.p2g1 > f.scores.p1g1 ? 'bg-indigo-100/70 font-black text-indigo-700' : 'text-slate-400'}`}>
                              {f.scores.p2g1}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded ${f.scores.p2g2 > f.scores.p1g2 ? 'bg-indigo-100/70 font-black text-indigo-700' : 'text-slate-400'}`}>
                              {f.scores.p2g2}
                            </span>
                            {(f.scores.p1g3 > 0 || f.scores.p2g3 > 0) && (
                              <span className={`px-1.5 py-0.5 rounded ${f.scores.p2g3 > f.scores.p1g3 ? 'bg-indigo-100/70 font-black text-indigo-700' : 'text-slate-400'}`}>
                                {f.scores.p2g3}
                              </span>
                            )}
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Match Info & Status Section */}
                <div className="text-right flex flex-col justify-between h-12 shrink-0 border-l border-slate-100 pl-4 min-w-[90px]">
                  <span className="text-[10px] font-extrabold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full inline-block self-end">
                    {formatStage(f.matchType, f.groupName)}
                  </span>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 font-bold font-mono">
                    <Clock className="w-3 h-3 text-slate-300" />
                    <span>{formatTimeAgo(f.finalizedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
