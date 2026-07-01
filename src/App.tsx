import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, signInWithGoogle, signOutUser } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import SystemHealthHeader from './components/SystemHealthHeader';
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

type Step = 'home' | 'setup' | 'details' | 'categories' | 'players' | 'groups' | 'hierarchy' | 'fixtures' | 'scores' | 'points' | 'bracket' | 'champion' | 'monitor' | 'referee' | 'global-players' | 'roles';

export default function App() {
  const [step, setStep] = useState<Step>(() => (localStorage.getItem('app-step') as Step) || 'home');
  const [tournamentId, setTournamentId] = useState<string | null>(() => localStorage.getItem('tournament-id'));
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'scorer' | 'user'>('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem('app-step', step);
    if (tournamentId) {
      localStorage.setItem('tournament-id', tournamentId);
    } else {
      localStorage.removeItem('tournament-id');
    }
  }, [step, tournamentId]);

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
    if (step === 'categories' || step === 'players' || step === 'groups' || step === 'hierarchy' || step === 'fixtures' || step === 'scores' || step === 'points' || step === 'monitor' || step === 'referee' || step === 'roles') {
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

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <SystemHealthHeader />
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

        <main className={`${step === 'monitor' || step === 'hierarchy' ? 'max-w-5xl' : 'max-w-4xl'} mx-auto transition-all duration-300`}>
          {!user ? (
            <div className="text-center py-20">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Tournament Manager</h2>
              <p className="text-gray-600 mb-8">Please sign in to manage your tournaments.</p>
              <button onClick={signInWithGoogle} className="px-6 py-3 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700">Sign In with Google</button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {step === 'home' && (
                <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
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
              {step === 'monitor' && (
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
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}
