import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Users, Trophy, ClipboardList, Target, Medal, Activity, Shield } from 'lucide-react';

export default function Dashboard({ tournamentId, onNavigate }: { tournamentId: string, onNavigate: (step: any) => void }) {
  const [stats, setStats] = useState({ players: 0, completedMatches: 0, totalFixtures: 0 });

  useEffect(() => {
    const playersQuery = query(collection(db, `tournaments/${tournamentId}/players`));
    const unsubscribePlayers = onSnapshot(playersQuery, (snapshot) => {
      setStats(prev => ({ ...prev, players: snapshot.size }));
    });

    const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`));
    const unsubscribeMatches = onSnapshot(matchesQuery, (snapshot) => {
      setStats(prev => ({ ...prev, completedMatches: snapshot.size }));
    });
    
    const fixturesQuery = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribeFixtures = onSnapshot(fixturesQuery, (snapshot) => {
      setStats(prev => ({ ...prev, totalFixtures: snapshot.size }));
    });

    return () => {
      unsubscribePlayers();
      unsubscribeMatches();
      unsubscribeFixtures();
    };
  }, [tournamentId]);

  const navItems = [
    { label: 'Manage Players', id: 'players', icon: Users },
    { label: 'Manage Groups', id: 'groups', icon: Target },
    { label: 'Manage Hierarchy', id: 'hierarchy', icon: Users },
    { label: 'Manage Fixtures', id: 'fixtures', icon: ClipboardList },
    { label: 'Enter Scores', id: 'scores', icon: Trophy },
    { label: 'Referee Panel', id: 'referee', icon: Shield },
    { label: 'Points Table', id: 'points', icon: Medal },
    { label: 'System Monitor', id: 'monitor', icon: Activity },
  ];

  return (
    <div className="space-y-8 font-sans">
      <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Tournament: {tournamentId}</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="bg-indigo-100 p-3 rounded-full text-indigo-600"><Users /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Players</p>
            <p className="text-2xl font-bold text-slate-900">{stats.players}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="bg-emerald-100 p-3 rounded-full text-emerald-600"><Trophy /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Completed Matches</p>
            <p className="text-2xl font-bold text-slate-900">{stats.completedMatches}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="bg-amber-100 p-3 rounded-full text-amber-600"><Target /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Progress</p>
            <p className="text-2xl font-bold text-slate-900">{stats.totalFixtures > 0 ? Math.round((stats.completedMatches / stats.totalFixtures) * 100) : 0}%</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {navItems.map(item => (
            <button 
                key={item.id} 
                onClick={() => onNavigate(item.id)} 
                className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl shadow-sm border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group"
            >
                <item.icon className="text-indigo-500 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-slate-700">{item.label}</span>
            </button>
        ))}
      </div>
    </div>
  );
}
