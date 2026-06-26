import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, updateDoc, doc, arrayUnion } from 'firebase/firestore';

const PREDEFINED_CATEGORIES = [
  "Men's Singles", "Women's Singles", "Men's Doubles", "Women's Doubles", 
  "Mixed Doubles", "U13", "U15", "U17", "U19", "Open"
];

export default function CategoryManager({ tournamentId, onNext }: { tournamentId: string, onNext: () => void }) {
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

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
      <h2 className="text-2xl font-bold text-slate-800">Select Categories</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PREDEFINED_CATEGORIES.map(cat => (
          <button 
            key={cat}
            onClick={() => toggleCategory(cat)}
            className={`p-3 rounded-xl border font-medium transition-all ${selected.includes(cat) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300'}`}
          >
            {cat}
          </button>
        ))}
      </div>
      <button onClick={handleAddSelected} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition">Add Selected</button>
      <ul className="space-y-2">
        {categories.map(c => <li key={c.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-medium text-slate-700">{c.name}</li>)}
      </ul>
      <button onClick={onNext} className="mt-4 px-6 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition">Next: Players</button>
    </div>
  );
}
