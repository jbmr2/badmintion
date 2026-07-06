import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trophy, Calendar, Medal, MapPin, ExternalLink, Activity, Sparkles, ArrowLeft, Info, HelpCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PointsTable from './PointsTable';
import FixtureManager from './FixtureManager';

interface Tournament {
  name: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  tournamentType?: string;
}

export default function PublicTournamentPortal({ 
  tournamentId, 
  onBackToApp 
}: { 
  tournamentId: string; 
  onBackToApp?: () => void; 
}) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<'standings' | 'fixtures'>('standings');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournamentId) return;
    const docRef = doc(db, 'tournaments', tournamentId);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setTournament(snapshot.data() as Tournament);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error loading tournament details for public portal:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Loading Live Tournament Portal...</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-150 p-8 text-center shadow-xl space-y-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100">
            <Info className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Tournament Not Found</h2>
            <p className="text-slate-500 text-sm">
              The tournament with ID <strong className="text-indigo-600 font-mono font-black">{tournamentId}</strong> does not exist or may have been deleted.
            </p>
          </div>
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl text-xs transition-all shadow-md"
            >
              Go Back to Main App
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12 font-sans selection:bg-indigo-100">
      
      {/* Dynamic top ribbon */}
      <div className="bg-indigo-950 text-white text-[10px] sm:text-xs py-2 px-4 font-black tracking-widest text-center uppercase flex items-center justify-center gap-1.5 shadow-inner">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
        Live Public View Board • Real-time Automatic Standings Updates
      </div>

      {/* Main Container */}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-8">
        
        {/* Public Header Card */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Trophy className="w-48 h-48 text-indigo-900" />
          </div>

          <div className="space-y-3.5 relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
                🏆 {tournament.tournamentType || 'League'}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full flex items-center gap-1">
                <Activity className="w-3 h-3 animate-pulse" /> Live Status
              </span>
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3.5xl font-black text-slate-800 tracking-tight leading-tight">
                {tournament.name}
              </h1>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-wider flex flex-wrap items-center gap-x-3 gap-y-1">
                {tournament.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> {tournament.venue}
                  </span>
                )}
                {tournament.startDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> {tournament.startDate} to {tournament.endDate}
                  </span>
                )}
                {tournament.startTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> {tournament.startTime}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Actions / Home Redirection */}
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs transition shadow-md hover:scale-[1.02] cursor-pointer flex items-center justify-center gap-1.5 self-start md:self-center shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Main Dashboard
            </button>
          )}
        </div>

        {/* Public view Tabs */}
        <div className="flex bg-slate-200/60 p-1.5 rounded-2xl border border-slate-200/50 max-w-md shadow-xs">
          <button
            onClick={() => setActiveTab('standings')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'standings'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Medal className="w-4 h-4 text-indigo-500" />
            Standings & Brackets
          </button>
          <button
            onClick={() => setActiveTab('fixtures')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'fixtures'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4 text-indigo-500" />
            League Fixtures
          </button>
        </div>

        {/* Render Tab Contents */}
        <AnimatePresence mode="wait">
          {activeTab === 'standings' ? (
            <motion.div
              key="standings-portal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <PointsTable tournamentId={tournamentId} userRole="user" />
            </motion.div>
          ) : (
            <motion.div
              key="fixtures-portal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <FixtureManager 
                tournamentId={tournamentId} 
                onNext={() => {}} 
                userRole="user" 
              />
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
