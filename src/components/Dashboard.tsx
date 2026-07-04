import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { Users, Trophy, ClipboardList, Target, Medal, Activity, Shield, UserCheck, Code, QrCode } from 'lucide-react';
import PlayerMobileSearch from './PlayerMobileSearch';
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
  const [playersCount, setPlayersCount] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
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
      setPlayersCount(snapshot.size);
    });

    const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`));
    const unsubscribeMatches = onSnapshot(matchesQuery, (snapshot) => {
      setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    const fixturesQuery = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribeFixtures = onSnapshot(fixturesQuery, (snapshot) => {
      setFixtures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeTournament();
      unsubscribePlayers();
      unsubscribeMatches();
      unsubscribeFixtures();
    };
  }, [tournamentId]);

  const stats = useMemo(() => {
    // Filter out any matches where the corresponding fixture has been deleted (safeguard)
    const validMatchesCount = matches.filter(m => fixtures.some(f => f.id === m.fixtureId)).length;
    // Also, count completed fixtures as double-check
    const completedFixturesCount = fixtures.filter(f => f.status === 'completed').length;
    
    return {
      players: playersCount,
      completedMatches: Math.min(validMatchesCount, completedFixturesCount),
      totalFixtures: fixtures.length
    };
  }, [playersCount, matches, fixtures]);

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
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 hover:border-indigo-100 transition-colors">
          <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Players</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{stats.players}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 hover:border-emerald-100 transition-colors">
          <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600 shrink-0">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Completed Matches</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{stats.completedMatches}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 hover:border-amber-100 transition-colors">
          <div className="bg-amber-50 p-3 rounded-2xl text-amber-600 shrink-0">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Progress</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{stats.totalFixtures > 0 ? Math.round((stats.completedMatches / stats.totalFixtures) * 100) : 0}%</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Navigation Grid */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {navItems.map(item => (
              <button 
                  key={item.id} 
                  onClick={() => onNavigate(item.id)} 
                  className="flex flex-col items-center justify-center gap-3 p-5 bg-white rounded-3xl shadow-sm border border-slate-100 hover:border-indigo-200 hover:shadow-indigo-50/50 hover:shadow-lg transition-all group aspect-square"
              >
                  <item.icon className="w-7 h-7 text-indigo-500 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="font-bold text-slate-700 text-xs tracking-tight text-center leading-tight">{item.label}</span>
              </button>
          ))}
        </div>

        {/* Recent Matches Sidebar Panel */}
        <div className="lg:col-span-1 space-y-8">
          <RecentMatches tournamentId={tournamentId} />
          <PlayerMobileSearch tournamentId={tournamentId} />
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
