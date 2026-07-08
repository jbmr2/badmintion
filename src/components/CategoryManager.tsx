import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, updateDoc, doc, arrayUnion } from 'firebase/firestore';

const PREDEFINED_CATEGORIES = [
  "Badminton - Solo - Mens Single - Open Category",
  "Badminton - Solo - Mens Single - 35 Plus",
  "Badminton - Solo - Mens Single - 45 Plus",
  "Badminton - Solo - Mens Single - 55 Plus",
  "Badminton - Solo - Womens Single - Open Category",
  "Badminton - Solo - Womens Single - 35 Plus",
  "Badminton - Doubles - Mens Doubles - Open Category",
  "Badminton - Doubles - Mens Doubles - 35 Plus",
  "Badminton - Doubles - Mens Doubles - 45 Plus",
  "Badminton - Doubles - Mens Doubles - 55 Plus",
  "Badminton - Doubles - Womens Doubles - Open Category",
  "Badminton - Doubles - Womens Doubles - 35 Plus",
  "Badminton - Doubles - Mixed Doubles - Open Category",
  "Badminton - Family - Mens Doubles - Open Category",
  "Badminton - Family - Mixed Doubles - Open Category",
  "Badminton - Kids - Under 12",
  "Badminton - Kids - Under 16"
];

export default function CategoryManager({ 
  tournamentId, 
  onNext,
  userRole = 'user',
  selectedGame = 'badminton'
}: { 
  tournamentId: string; 
  onNext: () => void;
  userRole?: 'admin' | 'scorer' | 'user';
  selectedGame?: 'badminton' | 'pickleball' | 'table_tennis';
}) {
  const getGameTitle = (game: string) => {
    if (game === 'table_tennis') return 'Table Tennis';
    if (game === 'pickleball') return 'Pickleball';
    return 'Badminton';
  };

  const gameName = getGameTitle(selectedGame);

  const getPredefinedCategories = () => {
    return PREDEFINED_CATEGORIES.map(cat => cat.replace('Badminton', gameName));
  };

  const predefinedList = getPredefinedCategories();

  const [categories, setCategories] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const q = query(collection(db, `tournaments/${tournamentId}/categories`));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/categories`)
    );
    return () => unsubscribe();
  }, [tournamentId]);

  const toggleCategory = (cat: string) => {
    setSelected(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleAddSelected = async () => {
    try {
      for (const name of selected) {
        await addDoc(collection(db, `tournaments/${tournamentId}/categories`), { name, tournamentId });
      }

      const tournamentRef = doc(db, 'tournaments', tournamentId);
      await updateDoc(tournamentRef, {
        categories: arrayUnion(...selected)
      });
      
      setSelected([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tournaments/${tournamentId}/categories`);
    }
  };

  const isAdmin = userRole === 'admin';

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-center pb-2 border-b">
        <h2 className="text-2xl font-bold text-slate-800">Tournament Categories</h2>
        {!isAdmin && (
          <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
            👁️ Read-Only
          </span>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
          ⚠️ Read-Only Mode: You must be an administrator to configure tournament categories.
        </div>
      )}

      {isAdmin && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {predefinedList.map(cat => (
              <button 
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`p-3 rounded-xl border font-medium transition-all text-xs text-left ${selected.includes(cat) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300'}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <button 
            onClick={handleAddSelected} 
            disabled={selected.length === 0}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold rounded-xl transition cursor-pointer"
          >
            Add Selected
          </button>
        </>
      )}

      <div className="space-y-2">
        <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider">Active Tournament Categories</h3>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No categories added to this tournament yet.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map(c => <li key={c.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-medium text-slate-700 text-sm">{c.name}</li>)}
          </ul>
        )}
      </div>

      <button onClick={onNext} className="mt-4 px-6 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition cursor-pointer">
        Next: Players
      </button>
    </div>
  );
}
