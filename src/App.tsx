import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, signInWithGoogle, signOutUser } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import TournamentSetup from './components/TournamentSetup';
import CategoryManager from './components/CategoryManager';
import PlayerManager from './components/PlayerManager';
import GroupManager from './components/GroupManager';
import HierarchyManager from './components/HierarchyManager';
import FixtureManager from './components/FixtureManager';
import MatchScoreManager from './components/MatchScoreManager';
import PointsTable from './components/PointsTable';
import TournamentList from './components/TournamentList';
import Dashboard from './components/Dashboard';
import SystemMonitor from './components/SystemMonitor';
import OBSTicker from './components/OBSTicker';
import RefereePanel from './components/RefereePanel';
import GlobalPlayerRegistry from './components/GlobalPlayerRegistry';
import RoleManager from './components/RoleManager';
import APIPortal from './components/APIPortal';
import PublicTournamentPortal from './components/PublicTournamentPortal';
import { 
  Home, 
  Calendar, 
  Trophy, 
  Medal, 
  MoreHorizontal, 
  X, 
  LogOut, 
  Code, 
  Users, 
  Settings, 
  Activity, 
  Shield, 
  UserCheck, 
  Menu, 
  PlusCircle, 
  Sparkles 
} from 'lucide-react';

type Step = 'home' | 'setup' | 'details' | 'categories' | 'players' | 'groups' | 'hierarchy' | 'fixtures' | 'scores' | 'points' | 'bracket' | 'champion' | 'monitor' | 'referee' | 'global-players' | 'roles' | 'apis';

export default function App() {
  const [step, setStep] = useState<Step>(() => (localStorage.getItem('app-step') as Step) || 'home');
  const [tournamentId, setTournamentId] = useState<string | null>(() => localStorage.getItem('tournament-id'));
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'scorer' | 'user'>('user');
  const [loading, setLoading] = useState(true);
  const [homeTab, setHomeTab] = useState<'tournaments' | 'hierarchy'>('tournaments');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('app-step', step);
    if (tournamentId) {
      localStorage.setItem('tournament-id', tournamentId);
    } else {
      localStorage.removeItem('tournament-id');
    }
  }, [step, tournamentId]);

  // Prevent standard 'user' role from staying on 'monitor' step
  useEffect(() => {
    if (step === 'monitor' && userRole === 'user') {
      setStep(tournamentId ? 'details' : 'home');
    }
  }, [step, userRole, tournamentId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setUserRole('user');
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const emailLower = (user.email || '').trim().toLowerCase();
    const isSuperAdmin = emailLower === 'jbmrsports@gmail.com';

    // Set up a listener for the user's role
    const unsubscribeRole = onSnapshot(doc(db, 'user_roles', emailLower), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUserRole(data.role || 'user');
        setLoading(false);
      } else {
        // If they are the super admin and no record exists, create one!
        if (isSuperAdmin) {
          setUserRole('admin');
          setDoc(doc(db, 'user_roles', emailLower), {
            email: emailLower,
            role: 'admin',
            displayName: user.displayName || 'Super Admin'
          }).then(() => {
            setLoading(false);
          }).catch((err) => {
            console.error("Error creating super admin:", err);
            setLoading(false);
          });
        } else {
          setUserRole('user');
          setLoading(false);
        }
      }
    }, (error) => {
      console.error("Error reading role:", error);
      setUserRole(isSuperAdmin ? 'admin' : 'user');
      setLoading(false);
    });

    return () => unsubscribeRole();
  }, [user]);

  const handleTournamentCreated = (id: string) => {
    setTournamentId(id);
    setStep('details');
  };

  const handleSelectTournament = (id: string) => {
    setTournamentId(id);
    setStep('details');
  };

  const goBack = () => {
    if (step === 'categories' || step === 'players' || step === 'groups' || step === 'hierarchy' || step === 'fixtures' || step === 'scores' || step === 'points' || step === 'monitor' || step === 'referee' || step === 'roles' || step === 'apis') {
      setStep('details');
    } else if (step === 'details' || step === 'global-players') {
      setStep('home');
      setTournamentId(null);
    } else if (step === 'setup') {
      setStep('home');
      setEditingTournamentId(null);
    }
  };

  // Check for OBS stream overlay mode
  const urlParams = new URLSearchParams(window.location.search);
  const isObsMode = urlParams.get('view') === 'obs' || urlParams.get('obs') === 'true';
  const obsTournamentId = urlParams.get('tournamentId') || '';
  const obsFixtureId = urlParams.get('fixtureId') || '';
  const obsCourt = urlParams.get('court') || '';

  if (isObsMode && obsTournamentId && (obsFixtureId || obsCourt)) {
    return <OBSTicker tournamentId={obsTournamentId} fixtureId={obsFixtureId} court={obsCourt} />;
  }

  // Check for Public Live Standings / Fixtures mode
  const isPublicMode = urlParams.get('view') === 'public';
  const publicTournamentId = urlParams.get('tournamentId') || '';

  if (isPublicMode && publicTournamentId) {
    return (
      <PublicTournamentPortal 
        tournamentId={publicTournamentId} 
        onBackToApp={user ? () => {
          // If logged in, clear parameter and show dashboard
          const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.pushState({ path: cleanUrl }, '', cleanUrl);
          setTournamentId(publicTournamentId);
          setStep('details');
        } : undefined}
      />
    );
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <div className="p-4 sm:p-6 flex-1">
        <header className="mb-6 sm:mb-8 border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-gray-900 leading-tight">Badminton Tournament Manager</h1>
            <p className="text-gray-500 text-xs sm:text-sm">Manage your tournament flow from start to finish.</p>
          </div>
          {user ? (
            <div className="flex gap-2 w-full sm:w-auto justify-between sm:justify-start">
              {step !== 'home' && <button onClick={goBack} className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-gray-200 text-gray-900 rounded-md font-semibold hover:bg-gray-300 text-xs sm:text-sm">Back</button>}
              <button onClick={signOutUser} className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-gray-200 text-gray-900 rounded-md font-semibold hover:bg-gray-300 text-xs sm:text-sm ml-auto sm:ml-0">Sign Out</button>
            </div>
          ) : (
            <button onClick={signInWithGoogle} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 text-sm">Sign In with Google</button>
          )}
        </header>

        <main className={`${step === 'monitor' || step === 'hierarchy' || (step === 'home' && homeTab === 'hierarchy') ? 'max-w-5xl' : 'max-w-4xl'} mx-auto transition-all duration-300`}>
          {!user ? (
            <div className="text-center py-20">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Tournament Manager</h2>
              <p className="text-gray-600 mb-8">Please sign in to manage your tournaments.</p>
              <button onClick={signInWithGoogle} className="px-6 py-3 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700">Sign In with Google</button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {step === 'home' && (
                <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                  {/* Home Screen Segmented Controls */}
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 max-w-md">
                    <button
                      onClick={() => setHomeTab('tournaments')}
                      className={`flex-1 py-2 px-4 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                        homeTab === 'tournaments'
                          ? 'bg-white text-indigo-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      🏆 Tournaments
                    </button>
                    <button
                      onClick={() => setHomeTab('hierarchy')}
                      className={`flex-1 py-2 px-4 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                        homeTab === 'hierarchy'
                          ? 'bg-white text-indigo-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      🌳 Master Hierarchy
                    </button>
                  </div>

                  {homeTab === 'tournaments' ? (
                    <TournamentList 
                      userRole={userRole}
                      onCreateTournament={() => {
                        setEditingTournamentId(null);
                        setStep('setup');
                      }} 
                      onSelectTournament={handleSelectTournament} 
                      onEditTournament={(id) => {
                        setEditingTournamentId(id);
                        setStep('setup');
                      }}
                      onViewGlobalPlayers={() => {
                        setStep('global-players');
                      }}
                    />
                  ) : (
                    <HierarchyManager userRole={userRole} />
                  )}
                </motion.div>
              )}
              {step === 'global-players' && (
                <motion.div key="global-players" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <GlobalPlayerRegistry />
                </motion.div>
              )}
              {step === 'setup' && (
                <motion.div key="setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <TournamentSetup 
                    userRole={userRole}
                    onNext={(id) => {
                      setEditingTournamentId(null);
                      handleTournamentCreated(id);
                    }} 
                    editingId={editingTournamentId}
                    onCancel={() => {
                      setEditingTournamentId(null);
                      setStep('home');
                    }}
                  />
                </motion.div>
              )}
              {step === 'details' && tournamentId && (
                <motion.div key="details" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Dashboard tournamentId={tournamentId} onNavigate={setStep} userRole={userRole} />
                </motion.div>
              )}
              {step === 'categories' && tournamentId && (
                <motion.div key="categories" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <CategoryManager tournamentId={tournamentId} onNext={() => setStep('players')} userRole={userRole} />
                </motion.div>
              )}
              {step === 'players' && tournamentId && (
                <motion.div key="players" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <PlayerManager tournamentId={tournamentId} userRole={userRole} />
                </motion.div>
              )}
              {step === 'groups' && tournamentId && (
                <motion.div key="groups" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <GroupManager tournamentId={tournamentId} onNext={() => setStep('fixtures')} userRole={userRole} />
                </motion.div>
              )}
              {step === 'hierarchy' && (
                <motion.div key="hierarchy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <HierarchyManager tournamentId={tournamentId || undefined} userRole={userRole} />
                </motion.div>
              )}
              {step === 'fixtures' && tournamentId && (
                <motion.div key="fixtures" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <FixtureManager tournamentId={tournamentId} onNext={() => setStep('scores')} userRole={userRole} />
                </motion.div>
              )}
              {step === 'scores' && tournamentId && (
                <motion.div key="scores" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <MatchScoreManager tournamentId={tournamentId} onNext={() => setStep('points')} userRole={userRole} />
                </motion.div>
              )}
              {step === 'points' && tournamentId && (
                <motion.div key="points" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <PointsTable tournamentId={tournamentId} />
                </motion.div>
              )}
              {step === 'monitor' && userRole !== 'user' && (
                <motion.div key="monitor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-none">
                  <SystemMonitor tournamentId={tournamentId || undefined} />
                </motion.div>
              )}
              {step === 'referee' && tournamentId && (
                <motion.div key="referee" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-none">
                  <RefereePanel tournamentId={tournamentId} userRole={userRole} />
                </motion.div>
              )}
              {step === 'roles' && (
                <motion.div key="roles" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <RoleManager />
                </motion.div>
              )}
              {step === 'apis' && (
                <motion.div key="apis" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <APIPortal currentTournamentId={tournamentId} onBack={() => setStep('details')} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation & Action Menu */}
      {tournamentId && step !== 'home' && step !== 'setup' && user && (
        <>
          {/* Bottom spacing helper */}
          <div className="h-20 md:hidden" />

          {/* Sticky Bottom Tab Bar */}
          <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] md:hidden h-16 flex items-center justify-around px-2">
            <button
              onClick={() => setStep('details')}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold gap-1 transition-all ${
                step === 'details' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Home className={`w-5 h-5 ${step === 'details' ? 'scale-110 text-indigo-600' : ''}`} />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setStep('fixtures')}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold gap-1 transition-all ${
                step === 'fixtures' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Calendar className={`w-5 h-5 ${step === 'fixtures' ? 'scale-110 text-indigo-600' : ''}`} />
              <span>Fixtures</span>
            </button>

            <button
              onClick={() => {
                if (userRole !== 'user') {
                  setStep('referee');
                } else {
                  setStep('scores');
                }
              }}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold gap-1 transition-all ${
                step === 'scores' || step === 'referee' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Trophy className={`w-5 h-5 ${step === 'scores' || step === 'referee' ? 'scale-110 text-indigo-600' : ''}`} />
              <span>{userRole !== 'user' ? 'Referee' : 'Scores'}</span>
            </button>

            <button
              onClick={() => setStep('points')}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold gap-1 transition-all ${
                step === 'points' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Medal className={`w-5 h-5 ${step === 'points' ? 'scale-110 text-indigo-600' : ''}`} />
              <span>Standings</span>
            </button>

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold gap-1 text-slate-400 hover:text-slate-600"
            >
              <MoreHorizontal className="w-5 h-5" />
              <span>More</span>
            </button>
          </nav>

          {/* Slide-Up Bottom Sheet Modal */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <>
                {/* Backdrop overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileMenuOpen(false)}
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 md:hidden"
                />

                {/* Bottom Sheet Panel */}
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                  className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 max-h-[85vh] overflow-y-auto md:hidden pb-10"
                >
                  {/* Pull Handle Indicator */}
                  <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-3" />

                  {/* Header */}
                  <div className="px-6 pb-4 flex justify-between items-center border-b border-slate-100">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-lg">Tournament Menu</h3>
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Tournament ID: {tournamentId}</p>
                    </div>
                    <button
                      onClick={() => setMobileMenuOpen(false)}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Options List */}
                  <div className="p-4 grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => {
                        setStep('players');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all min-h-[82px] ${
                        step === 'players' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-slate-50/60 border-slate-100 text-slate-700 font-bold hover:bg-slate-50'
                      }`}
                    >
                      <Users className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">Manage Players</span>
                    </button>

                    <button
                      onClick={() => {
                        setStep('groups');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all min-h-[82px] ${
                        step === 'groups' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-slate-50/60 border-slate-100 text-slate-700 font-bold hover:bg-slate-50'
                      }`}
                    >
                      <Settings className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">Manage Groups</span>
                    </button>

                    <button
                      onClick={() => {
                        setStep('categories');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all min-h-[82px] ${
                        step === 'categories' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-slate-50/60 border-slate-100 text-slate-700 font-bold hover:bg-slate-50'
                      }`}
                    >
                      <Settings className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">Categories</span>
                    </button>

                    <button
                      onClick={() => {
                        setStep('hierarchy');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all min-h-[82px] ${
                        step === 'hierarchy' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-slate-50/60 border-slate-100 text-slate-700 font-bold hover:bg-slate-50'
                      }`}
                    >
                      <Settings className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">Master Hierarchy</span>
                    </button>

                    <button
                      onClick={() => {
                        setStep('apis');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all min-h-[82px] ${
                        step === 'apis' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-slate-50/60 border-slate-100 text-slate-700 font-bold hover:bg-slate-50'
                      }`}
                    >
                      <Code className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">API Links</span>
                    </button>

                    {userRole === 'admin' && (
                      <button
                        onClick={() => {
                          setStep('roles');
                          setMobileMenuOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all min-h-[82px] ${
                          step === 'roles' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-slate-50/60 border-slate-100 text-slate-700 font-bold hover:bg-slate-50'
                        }`}
                      >
                        <UserCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">User Roles</span>
                      </button>
                    )}

                    {userRole !== 'user' && (
                      <button
                        onClick={() => {
                          setStep('monitor');
                          setMobileMenuOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all min-h-[82px] ${
                          step === 'monitor' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-slate-50/60 border-slate-100 text-slate-700 font-bold hover:bg-slate-50'
                        }`}
                      >
                        <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">System Monitor</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setStep('home');
                        setTournamentId(null);
                        setMobileMenuOpen(false);
                      }}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-rose-150 bg-rose-50/50 text-rose-700 font-bold text-center hover:bg-rose-50 col-span-2 mt-2 min-h-[60px]"
                    >
                      <LogOut className="w-4 h-4 text-rose-500 animate-pulse shrink-0" />
                      <span className="text-[11px] leading-tight break-words whitespace-normal tracking-tight">Exit Tournament</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
