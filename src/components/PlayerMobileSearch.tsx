import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Phone, Search, User } from 'lucide-react';

export default function PlayerMobileSearch({ tournamentId }: { tournamentId: string }) {
  const [mobile, setMobile] = useState('');
  const [player, setPlayer] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!mobile) return;
    setLoading(true);
    setError('');
    setPlayer(null);

    try {
      const q = query(collection(db, `tournaments/${tournamentId}/players`), where('mobile', '==', mobile));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setPlayer(querySnapshot.docs[0].data());
      } else {
        setError('Player not found');
      }
    } catch (err) {
      setError('Error searching player');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
      <h3 className="font-black text-slate-800 flex items-center gap-2">
        <User className="w-5 h-5 text-indigo-500" /> Player Profile Check
      </h3>
      <div className="flex gap-2">
        <input 
          type="text"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="Enter Mobile Number"
          className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm"
        />
        <button 
          onClick={handleSearch}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2"
        >
          {loading ? '...' : <Search className="w-4 h-4" />} Search
        </button>
      </div>
      {error && <p className="text-xs text-rose-500 font-bold">{error}</p>}
      {player && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
          <p className="font-bold text-slate-800">{player.name}</p>
          <p className="text-slate-500">Mobile: {player.mobile}</p>
          <p className="text-slate-500">Age: {player.age}</p>
        </div>
      )}
    </div>
  );
}
