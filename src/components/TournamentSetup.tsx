import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, deleteDoc, setDoc } from 'firebase/firestore';

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
  "Badminton - Doubles - Womens Doubles - Open Category",
  "Badminton - Doubles - Womens Doubles - 35 Plus",
  "Badminton - Doubles - Mixed Doubles - Open Category",
  "Badminton - Family - Mens Doubles - Open Category",
  "Badminton - Family - Mixed Doubles - Open Category",
  "Badminton - Kids - Under 12",
  "Badminton - Kids - Under 16"
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
  onCancel,
  userRole = 'user',
  selectedGame = 'badminton'
}: { 
  onNext: (tournamentId: string) => void, 
  editingId?: string | null, 
  onCancel?: () => void,
  userRole?: 'admin' | 'scorer' | 'user',
  selectedGame?: 'badminton' | 'pickleball' | 'table_tennis'
}) {
  const getGameTitle = (game: string) => {
    if (game === 'table_tennis') return 'Table Tennis';
    if (game === 'pickleball') return 'Pickleball';
    return 'Badminton';
  };

  const gameName = getGameTitle(selectedGame);

  const [formData, setFormData] = useState({
    name: `Summer ${gameName} Championship 2026`,
    organizer: '',
    venue: 'Yamuna Sports Complex',
    startDate: '2026-07-10',
    endDate: '2026-07-12',
    startTime: '',
    logo: '',
    tournamentType: 'League',
    matchFormat: 'Best of 3',
    gamePoints: selectedGame === 'badminton' ? 21 : 11,
    winByTwo: true,
    maxPoint: selectedGame === 'badminton' ? 30 : 15,
    winPoints: 2,
    lossPoints: 0,
  });

  const getPredefinedCategories = () => {
    return PREDEFINED_CATEGORIES.map(cat => cat.replace('Badminton', gameName));
  };

  const predefinedList = getPredefinedCategories();

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState('');

  const [selectedCourts, setSelectedCourts] = useState<string[]>([
    "Court 1", "Court 2", "Court 3", "Court 4"
  ]);

  useEffect(() => {
    if (!editingId) {
      const defaultName = `Summer ${gameName} Championship 2026`;
      const points = selectedGame === 'badminton' ? 21 : 11;
      const maxPt = selectedGame === 'badminton' ? 30 : 15;
      
      setFormData(prev => ({
        ...prev,
        name: defaultName,
        gamePoints: points,
        maxPoint: maxPt
      }));

      setSelectedCategories([
        `${gameName} - Solo - Mens Single - Open Category`,
        `${gameName} - Solo - Womens Single - Open Category`
      ]);
    }
  }, [editingId, selectedGame]);
  const [customCourt, setCustomCourt] = useState('');
  const [loading, setLoading] = useState(false);
  const [customId, setCustomId] = useState('');

  useEffect(() => {
    if (editingId) return;
    const generateShortId = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'tournaments'));
        const existingIds = querySnapshot.docs.map(doc => doc.id.toUpperCase());
        
        let seq = existingIds.length + 1;
        let generatedId = '';
        let isUnique = false;
        
        while (!isUnique) {
          const numPart = String(seq).padStart(4, '0');
          const letterPart = 'A';
          generatedId = `${numPart}${letterPart}`;
          if (!existingIds.includes(generatedId)) {
            isUnique = true;
          } else {
            seq++;
          }
        }
        setCustomId(generatedId);
      } catch (err) {
        console.error("Error generating short ID:", err);
      }
    };
    generateShortId();
  }, [editingId]);

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
            startTime: data.startTime || '',
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
        courts: selectedCourts,
        sport: selectedGame
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
        // Ensure a valid short ID exists
        let finalId = customId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!finalId) {
          // Fallback ID generation
          const querySnapshot = await getDocs(collection(db, 'tournaments'));
          const existingIds = querySnapshot.docs.map(doc => doc.id.toUpperCase());
          let seq = existingIds.length + 1;
          let isUnique = false;
          while (!isUnique) {
            const numPart = String(seq).padStart(4, '0');
            const letterPart = 'A';
            finalId = `${numPart}${letterPart}`;
            if (!existingIds.includes(finalId)) {
              isUnique = true;
            } else {
              seq++;
            }
          }
        }

        const docRef = doc(db, 'tournaments', finalId);
        await setDoc(docRef, dataToSave);

        // Add each selected category to the subcollection for full system compatibility
        for (const name of selectedCategories) {
          await addDoc(collection(db, `tournaments/${finalId}/categories`), { name, tournamentId: finalId });
        }

        onNext(finalId);
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

      {userRole !== 'admin' && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
          ⚠️ Read-Only Mode: You must be an administrator to make changes or create tournaments.
        </div>
      )}

      <FormField label="Tournament Name" required><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>

      {!editingId && (
        <FormField label="Tournament ID (Short Code / Custom ID)" required>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={customId} 
              onChange={(e) => setCustomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} 
              maxLength={12}
              placeholder="e.g. 0001A"
              className="flex-1 p-2.5 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase bg-slate-50" 
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const querySnapshot = await getDocs(collection(db, 'tournaments'));
                  const existingIds = querySnapshot.docs.map(doc => doc.id.toUpperCase());
                  let seq = existingIds.length + 1;
                  let generatedId = '';
                  let isUnique = false;
                  while (!isUnique) {
                    const numPart = String(seq).padStart(4, '0');
                    const letterPart = 'A';
                    generatedId = `${numPart}${letterPart}`;
                    if (!existingIds.includes(generatedId)) {
                      isUnique = true;
                    } else {
                      seq++;
                    }
                  }
                  setCustomId(generatedId);
                } catch (err) {
                  console.error(err);
                }
              }}
              className="px-3.5 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-colors border border-indigo-200"
            >
              Regenerate
            </button>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">
            Short, readable ID used in URLs & stream overlays. Leave as is or type a custom one like "FINALS" or "0001A".
          </span>
        </FormField>
      )}
      <FormField label="Organizer" required><input type="text" value={formData.organizer} onChange={(e) => setFormData({ ...formData, organizer: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      <FormField label="Venue" required><input type="text" value={formData.venue} onChange={(e) => setFormData({ ...formData, venue: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Date" required><input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
        <FormField label="End Date" required><input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      </div>
      <FormField label="Start Time (e.g. 12 PM to 3 PM)">
        <input 
          type="text" 
          value={formData.startTime} 
          onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} 
          placeholder="e.g. 12 PM to 3 PM or 12:00 PM - 03:00 PM" 
          className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
        />
      </FormField>
      <FormField label="Logo URL (Optional)"><input type="text" value={formData.logo} onChange={(e) => setFormData({ ...formData, logo: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></FormField>
      
      {/* CATEGORIES OPTION SECTION */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Select Tournament Categories</label>
        <div className="flex flex-wrap gap-2">
          {predefinedList.map(cat => {
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
          {selectedCategories.filter(cat => !predefinedList.includes(cat)).map(cat => (
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
        <select 
          value={formData.tournamentType} 
          onChange={(e) => {
            const val = e.target.value;
            let override = {};
            if (val === 'Round Robin A' || val === 'Qualify Only (Round Robin A)') {
              override = {
                matchFormat: 'Best of 3',
                gamePoints: 15,
                winPoints: 5,
                lossPoints: 0,
                maxPoint: 15,
                winByTwo: true
              };
            }
            setFormData({ 
              ...formData, 
              tournamentType: val,
              ...override
            });
          }} 
          className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option>League</option>
          <option>Knockout</option>
          <option>League + Knockout</option>
          <option>Round Robin A</option>
          <option>Qualify Only (Round Robin A)</option>
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
          disabled={userRole !== 'admin' || loading}
          className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold transition shadow-md disabled:shadow-none cursor-pointer"
        >
          {editingId ? 'Save Changes' : 'Create Tournament'}
        </button>
      </div>
    </form>
  );
}

