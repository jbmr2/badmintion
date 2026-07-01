import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { Users, Trophy, ClipboardList, Target, Medal, Activity, Shield, UserCheck, Code, QrCode } from 'lucide-react';
import RecentMatches from './RecentMatches';
import TournamentQRCodeModal from './TournamentQRCodeModal';

export default function Dashboard({ 
  tournamentId, 
  onNavigate, 
  userRole = 'user' 
}: { 
  tournamentId: string; 
  onNavigate: (step: any) => void; 
  userRole?: 'admin' | 'scorer' | 'user'; 
}) {
  const [stats, setStats] = useState({ players: 0, completedMatches: 0, totalFixtures: 0 });
  const [tournamentName, setTournamentName] = useState(tournamentId);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    const tournamentRef = doc(db, 'tournaments', tournamentId);
    const unsubscribeTournament = onSnapshot(tournamentRef, (snapshot) => {
      if (snapshot.exists()) {
        setTournamentName(snapshot.data().name || tournamentId);
      }
    });

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
      unsubscribeTournament();
      unsubscribePlayers();
      unsubscribeMatches();
      unsubscribeFixtures();
    };
  }, [tournamentId]);

  const navItems = [
    { label: 'Manage Players', id: 'players', icon: Users },
    { label: 'Manage Groups', id: 'groups', icon: Target },
    { label: 'Master Hierarchy', id: 'hierarchy', icon: Users },
    { label: 'Manage Fixtures', id: 'fixtures', icon: ClipboardList },
    { label: 'Enter Scores', id: 'scores', icon: Trophy },
    { label: 'Referee Panel', id: 'referee', icon: Shield },
    { label: 'Points Table', id: 'points', icon: Medal },
    { label: 'API Links', id: 'apis', icon: Code },
  ];

  // System Monitor is hidden for normal 'user' role
  if (userRole !== 'user') {
    navItems.push({ label: 'System Monitor', id: 'monitor', icon: Activity });
  }

  // If the user is an admin, show the Roles page in dashboard
  if (userRole === 'admin') {
    navItems.push({ label: 'User Roles', id: 'roles', icon: UserCheck });
  }

  const getRoleBadge = () => {
    switch (userRole) {
      case 'admin':
        return <span className="px-3 py-1 bg-rose-50 text-rose-700 text-xs font-black rounded-full border border-rose-200">👑 Administrator</span>;
      case 'scorer':
        return <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-black rounded-full border border-amber-200">✏️ Scorer</span>;
      default:
        return <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-semibold rounded-full border border-slate-200">👁️ Read-Only Viewer</span>;
    }
  };

  return (
    <div className="space-y-8 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Tournament: {tournamentName}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowQR(true)}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black rounded-full border border-indigo-200 flex items-center gap-1.5 transition cursor-pointer hover:scale-[1.02] shadow-xs"
            title="Generate/View Live Board QR Code"
          >
            <QrCode className="w-3.5 h-3.5 text-indigo-600" /> Share Live QR
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Your Access:</span>
            {getRoleBadge()}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2.5 sm:gap-6">
        <div className="bg-white p-3 sm:p-6 rounded-2xl shadow-xs border border-slate-100 flex items-center gap-2 sm:gap-4">
          <div className="bg-indigo-100 p-2 sm:p-3 rounded-xl sm:rounded-full text-indigo-600 shrink-0">
            <Users className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-sm text-slate-500 font-bold sm:font-medium uppercase sm:normal-case tracking-wider sm:tracking-normal truncate">Players</p>
            <p className="text-base sm:text-2xl font-black sm:font-bold text-slate-900 mt-0.5 sm:mt-0">{stats.players}</p>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-6 rounded-2xl shadow-xs border border-slate-100 flex items-center gap-2 sm:gap-4">
          <div className="bg-emerald-100 p-2 sm:p-3 rounded-xl sm:rounded-full text-emerald-600 shrink-0">
            <Trophy className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-sm text-slate-500 font-bold sm:font-medium uppercase sm:normal-case tracking-wider sm:tracking-normal truncate">Completed</p>
            <p className="text-base sm:text-2xl font-black sm:font-bold text-slate-900 mt-0.5 sm:mt-0">{stats.completedMatches}</p>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-6 rounded-2xl shadow-xs border border-slate-100 flex items-center gap-2 sm:gap-4">
          <div className="bg-amber-100 p-2 sm:p-3 rounded-xl sm:rounded-full text-amber-600 shrink-0">
            <Target className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-sm text-slate-500 font-bold sm:font-medium uppercase sm:normal-case tracking-wider sm:tracking-normal truncate">Progress</p>
            <p className="text-base sm:text-2xl font-black sm:font-bold text-slate-900 mt-0.5 sm:mt-0">{stats.totalFixtures > 0 ? Math.round((stats.completedMatches / stats.totalFixtures) * 100) : 0}%</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Navigation Grid */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6">
          {navItems.map(item => (
              <button 
                  key={item.id} 
                  onClick={() => onNavigate(item.id)} 
                  className="flex flex-col items-center justify-center gap-1.5 sm:gap-3 p-3.5 sm:p-6 bg-white rounded-2xl shadow-xs sm:shadow-sm border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group min-h-[96px] sm:min-h-0"
              >
                  <item.icon className="w-4 h-4 sm:w-6 sm:h-6 text-indigo-500 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-bold sm:font-semibold text-slate-700 text-[11px] sm:text-sm tracking-tight text-center break-words leading-tight whitespace-normal">{item.label}</span>
              </button>
          ))}
        </div>

        {/* Recent Matches Sidebar Panel */}
        <div className="lg:col-span-1">
          <RecentMatches tournamentId={tournamentId} />
        </div>
      </div>

      {showQR && (
        <TournamentQRCodeModal 
          tournamentId={tournamentId} 
          tournamentName={tournamentName} 
          onClose={() => setShowQR(false)} 
        />
      )}
    </div>
  );
}
