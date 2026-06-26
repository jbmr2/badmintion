import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, deleteDoc } from 'firebase/firestore';

const PREDEFINED_CATEGORIES = [
  "Member - Men's Singles (Open)",
  "Member - Men's Singles (35+)",
  "Member - Men's Singles (45+)",
  "Member - Men's Singles (55+)",
  "Member - Men's Doubles (Open)",
  "Member - Men's Doubles (35+)",
  "Member - Men's Doubles (45+)",
  "Member - Men's Doubles (55+)",
  "Member - Women's Singles (Open)",
  "Member - Women's Singles (35+)",
  "Member - Women's Doubles (Open)",
  "Member - Women's Doubles (35+)",
  "Member - Mixed Doubles (Open)",
  "Family - Men's Doubles (Open)",
  "Family - Mixed Doubles (Open)",
  "Family - Kids' Singles (U12)",
  "Family - Kids' Singles (U16)"
];

function FormField({ label, required, children }: { label: string, required?: boolean, children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700 flex items-center justify-between">
        {label}
        {required && <span className="text-green-600 text-xs font-bold">✅</span>}
      </label>
      {children}
    </div>
  );
}

export default function TournamentSetup({ 
  onNext, 
  editingId = null, 
  onCancel 
}: { 
  onNext: (tournamentId: string) => void, 
  editingId?: string | null, 
  onCancel?: () => void 
}) {
  const [formData, setFormData] = useState({
    name: 'Summer Badminton Championship 2026',
    organizer: '',
    venue: 'Indoor Stadium',
    startDate: '2026-07-10',
    endDate: '2026-07-12',
    logo: '',
    tournamentType: 'League',
    matchFormat: 'Best of 3',
    gamePoints: 21,
    winByTwo: true,
    maxPoint: 30,
    winPoints: 2,
    lossPoints: 0,
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "Member - Men's Singles (Open)", "Member - Women's Singles (Open)"
  ]);
  const [customCategory, setCustomCategory] = useState('');

  const [selectedCourts, setSelectedCourts] = useState<string[]>([
    "Court 1", "Court 2", "Court 3", "Court 4"
  ]);
  const [customCourt, setCustomCourt] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    const fetchTournament = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'tournaments', editingId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            name: data.name || '',
            organizer: data.organizer || '',
            venue: data.venue || '',
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            logo: data.logo || '',
            tournamentType: data.tournamentType || 'League',
            matchFormat: data.matchFormat || 'Best of 3',
            gamePoints: Number(data.gamePoints) || 21,
            winByTwo: data.winByTwo !== undefined ? data.winByTwo : true,
            maxPoint: Number(data.maxPoint) || 30,
            winPoints: data.winPoints !== undefined ? Number(data.winPoints) : 2,
            lossPoints: data.lossPoints !== undefined ? Number(data.lossPoints) : 0,
          });
          if (data.categories && Array.isArray(data.categories)) {
            setSelectedCategories(data.categories);
          }
          if (data.courts && Array.isArray(data.courts)) {
            setSelectedCourts(data.courts);
          }
        }
      } catch (error) {
        console.error('Error fetching tournament details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchTournament();
  }, [editingId]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleAddCustomCategory = (e: React.MouseEvent) => {
    e.preventDefault();
    const trimmed = customCategory.trim();
    if (trimmed && !selectedCategories.includes(trimmed)) {
      setSelectedCategories(prev => [...prev, trimmed]);
      setCustomCategory('');
    }
  };

  const toggleCourt = (court: string) => {
    setSelectedCourts(prev =>
      prev.includes(court) ? prev.filter(c => c !== court) : [...prev, court]
    );
  };

  const handleAddCustomCourt = (e: React.MouseEvent) => {
    e.preventDefault();
    const trimmed = customCourt.trim();
    if (trimmed && !selectedCourts.includes(trimmed)) {
      setSelectedCourts(prev => [...prev, trimmed]);
      setCustomCourt('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave = {
        ...formData,
        categories: selectedCategories,
        courts: selectedCourts
      };

      if (editingId) {
        const docRef = doc(db, 'tournaments', editingId);
        await updateDoc(docRef, dataToSave);

        // Sync categories in subcollection
        const catColRef = collection(db, `tournaments/${editingId}/categories`);
        const catSnapshot = await getDocs(catColRef);
        const existingCatsMap: { [name: string]: string } = {}; // name -> docId
        catSnapshot.forEach(doc => {
          existingCatsMap[doc.data().name] = doc.id;
        });

        // Add categories that are selected but don't exist
        for (const name of selectedCategories) {
          if (!existingCatsMap[name]) {
            await addDoc(catColRef, { name, tournamentId: editingId });
          }
        }

        // Delete categories that are no longer selected
        for (const name of Object.keys(existingCatsMap)) {
          if (!selectedCategories.includes(name)) {
            const catDocRef = doc(db, `tournaments/${editingId}/categories`, existingCatsMap[name]);
            await deleteDoc(catDocRef);
          }
        }

        onNext(editingId);
      } else {
        const docRef = await addDoc(collection(db, 'tournaments'), dataToSave);

        // Add each selected category to the subcollection for full system compatibility
        for (const name of selectedCategories) {
          await addDoc(collection(db, `tournaments/${docRef.id}/categories`), { name, tournamentId: docRef.id });
        }

        onNext(docRef.id);
      }
    } catch (error) {
      console.error('Error saving document: ', error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
        <p className="text-slate-500 text-sm font-bold">Loading tournament details...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
        <h2 className="text-xl font-extrabold text-slate-900">
          {editingId ? 'Edit Tournament Details' : 'Configure New Tournament'}
        </h2>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-500 hover:text-slate-800 font-bold border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      <FormField label="Tournament Name" required><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      <FormField label="Organizer" required><input type="text" value={formData.organizer} onChange={(e) => setFormData({ ...formData, organizer: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      <FormField label="Venue" required><input type="text" value={formData.venue} onChange={(e) => setFormData({ ...formData, venue: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Date" required><input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
        <FormField label="End Date" required><input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      </div>
      <FormField label="Logo URL (Optional)"><input type="text" value={formData.logo} onChange={(e) => setFormData({ ...formData, logo: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      
      {/* CATEGORIES OPTION SECTION */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Select Tournament Categories</label>
        <div className="flex flex-wrap gap-2">
          {PREDEFINED_CATEGORIES.map(cat => {
            const isSelected = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  isSelected 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {cat}
              </button>
            );
          })}
          {selectedCategories.filter(cat => !PREDEFINED_CATEGORIES.includes(cat)).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-indigo-600 border-indigo-600 text-white shadow-sm"
            >
              {cat} ✕
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add custom category..."
            value={customCategory}
            onChange={e => setCustomCategory(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleAddCustomCategory}
            type="button"
            className="px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition cursor-pointer"
          >
            Add
          </button>
        </div>
      </div>

      {/* COURTS CONFIGURATION SECTION */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-sm font-semibold text-slate-700 block">Configure Courts (Manual open courts)</label>
          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
            {selectedCourts.length} Courts Open
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-normal">
          Toggle which courts are open/available for this tournament, or add custom court names/numbers below.
        </p>
        <div className="flex flex-wrap gap-2">
          {["Court 1", "Court 2", "Court 3", "Court 4", "Court 5", "Court 6"].map(court => {
            const isSelected = selectedCourts.includes(court);
            return (
              <button
                key={court}
                type="button"
                onClick={() => toggleCourt(court)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  isSelected 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {court}
              </button>
            );
          })}
          {selectedCourts.filter(court => !["Court 1", "Court 2", "Court 3", "Court 4", "Court 5", "Court 6"].includes(court)).map(court => (
            <button
              key={court}
              type="button"
              onClick={() => toggleCourt(court)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-indigo-600 border-indigo-600 text-white shadow-sm"
            >
              {court} ✕
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add custom court (e.g. Court A, Arena 1)..."
            value={customCourt}
            onChange={e => setCustomCourt(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleAddCustomCourt}
            type="button"
            className="px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition cursor-pointer"
          >
            Add Court
          </button>
        </div>
      </div>

      <FormField label="Tournament Type" required>
        <select value={formData.tournamentType} onChange={(e) => setFormData({ ...formData, tournamentType: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          <option>League</option>
          <option>Knockout</option>
          <option>League + Knockout</option>
        </select>
      </FormField>
      <FormField label="Match Format" required><input type="text" value={formData.matchFormat} onChange={(e) => setFormData({ ...formData, matchFormat: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      <div className="grid grid-cols-4 gap-4">
        <FormField label="Game Points" required><input type="number" value={formData.gamePoints} onChange={(e) => setFormData({ ...formData, gamePoints: Number(e.target.value) })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
        <FormField label="Max Point" required><input type="number" value={formData.maxPoint} onChange={(e) => setFormData({ ...formData, maxPoint: Number(e.target.value) })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
        <FormField label="Win Points" required><input type="number" value={formData.winPoints} onChange={(e) => setFormData({ ...formData, winPoints: Number(e.target.value) })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
        <FormField label="Loss Points" required><input type="number" value={formData.lossPoints} onChange={(e) => setFormData({ ...formData, lossPoints: Number(e.target.value) })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      </div>
      <FormField label="Win by 2">
        <input type="checkbox" checked={formData.winByTwo} onChange={(e) => setFormData({ ...formData, winByTwo: e.target.checked })} className="mt-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded" />
      </FormField>
      
      <div className="flex gap-4 pt-4">
        {onCancel && (
          <button 
            type="button" 
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button 
          type="submit" 
          className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-md shadow-indigo-200 cursor-pointer"
        >
          {editingId ? 'Save Changes' : 'Create Tournament'}
        </button>
      </div>
    </form>
  );
}

