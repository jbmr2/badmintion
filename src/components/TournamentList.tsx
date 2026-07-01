import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { Pencil, Trash2, AlertTriangle } from 'lucide-react';

export default function TournamentList({ 
  onCreateTournament, 
  onSelectTournament,
  onEditTournament,
  onViewGlobalPlayers,
  userRole = 'user'
}: { 
  onCreateTournament: () => void; 
  onSelectTournament: (id: string) => void;
  onEditTournament: (id: string) => void;
  onViewGlobalPlayers: () => void;
  userRole?: 'admin' | 'scorer' | 'user';
}) {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [tournamentToDelete, setTournamentToDelete] = useState<any | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'tournaments'));
    const unsubscribe = onSnapshot(q,
      (snapshot) => setTournaments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'tournaments')
    );
    return () => unsubscribe();
  }, []);

  const isAdmin = userRole === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Active Tournaments</h2>
          <p className="text-xs text-gray-500 font-medium">Select a tournament to manage its details, or use the controls to edit/delete.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button 
            onClick={onViewGlobalPlayers}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-sm transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            👤 Global Player Profiles
          </button>
          {isAdmin && (
            <button 
              onClick={onCreateTournament}
              className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 text-sm transition shadow-sm cursor-pointer"
            >
              Create New Tournament
            </button>
          )}
        </div>
      </div>
      
      {tournaments.length === 0 ? (
        <div className="p-12 border-2 border-dashed border-gray-200 rounded-2xl text-center text-gray-400 bg-white">
          <p className="font-bold text-slate-600">No tournaments found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            {isAdmin 
              ? "Get started by creating your first badminton tournament using the setup wizard."
              : "Contact your tournament administrator to set up a new tournament."
            }
          </p>
          {isAdmin && (
            <button
              onClick={onCreateTournament}
              className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Create Tournament
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {tournaments.map(t => (
            <div 
              key={t.id} 
              onClick={() => onSelectTournament(t.id)} 
              className="p-5 bg-white border border-slate-100 rounded-2xl shadow-xs hover:shadow-md hover:border-indigo-100 transition duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                  {t.tournamentType || 'League'}
                </span>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition mt-2">{t.name}</h3>
                <p className="text-xs text-slate-500 font-medium">
                  📍 {t.venue || 'No Venue'} | 📅 {t.startDate || 'No Date'} to {t.endDate || 'No Date'}
                </p>
                {t.categories && Array.isArray(t.categories) && t.categories.length > 0 && (
                  <p className="text-[11px] text-slate-400 font-bold mt-1">
                    Categories: {t.categories.slice(0, 3).join(', ')}{t.categories.length > 3 ? '...' : ''}
                  </p>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 mt-2 sm:mt-0 self-end sm:self-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTournament(t.id);
                    }}
                    className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition cursor-pointer border border-slate-100 bg-slate-50/50 hover:scale-105"
                    title="Edit Tournament Settings"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTournamentToDelete(t);
                    }}
                    className="p-2.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer border border-slate-100 bg-slate-50/50 hover:scale-105"
                    title="Delete Tournament"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Custom beautiful deletion modal */}
      {tournamentToDelete && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl p-6 text-center transform scale-100 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-rose-500" />
            <div className="mx-auto w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4 border border-rose-100">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-black text-xl text-slate-800 tracking-tight">Delete Tournament?</h3>
            <p className="text-slate-500 text-xs mt-2 leading-relaxed">
              Are you sure you want to delete <span className="font-extrabold text-slate-800">"{tournamentToDelete.name}"</span>?
            </p>
            <p className="text-rose-600 text-[11px] font-bold mt-2 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl text-left">
              ⚠️ This will permanently remove all matches, configurations, categories, players, and standings. This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setTournamentToDelete(null)}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                No, Keep It
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'tournaments', tournamentToDelete.id));
                    setTournamentToDelete(null);
                  } catch (err) {
                    console.error('Error deleting tournament:', err);
                  }
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs transition shadow-md shadow-rose-100 cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
