import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  User, 
  Users,
  Plus, 
  Trash2, 
  Edit3, 
  Sparkles, 
  X, 
  Search, 
  CheckCircle, 
  Award,
  BookOpen,
  Calendar,
  Layers,
  Save,
  Undo2
} from 'lucide-react';

export default function PlayerManager({ tournamentId }: { tournamentId: string }) {
  const [players, setPlayers] = useState<any[]>([]);
  const [player, setPlayer] = useState({ name: '', age: '' });
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Group tracking states
  const [groups, setGroups] = useState<any[]>([]);
  
  // Hierarchy tracking states
  const [roots, setRoots] = useState<any[]>([]);
  const [allRootsLevel1, setAllRootsLevel1] = useState<any[]>([]);
  const [allRootsLevel2, setAllRootsLevel2] = useState<any[]>([]);
  const [allRootsPlayers, setAllRootsPlayers] = useState<any[]>([]);

  // Editing state
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', age: '', chapterId: '', groupId: '' });
  const [playerToDelete, setPlayerToDelete] = useState<any | null>(null);

  // 1. Fetch Players list
  useEffect(() => {
    if (!tournamentId) return;
    const q = query(collection(db, `tournaments/${tournamentId}/players`));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/players`)
    );
    return () => unsubscribe();
  }, [tournamentId]);

  // 1b. Fetch Groups list
  useEffect(() => {
    if (!tournamentId) return;
    const q = query(collection(db, `tournaments/${tournamentId}/groups`));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => console.error("Error fetching groups:", error)
    );
    return () => unsubscribe();
  }, [tournamentId]);

  // 2. Fetch Roots
  useEffect(() => {
    if (!tournamentId) return;
    const qRoots = query(collection(db, `tournaments/${tournamentId}/roots`));
    return onSnapshot(qRoots, (snapshot) => {
      setRoots(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error("Error fetching roots:", e));
  }, [tournamentId]);

  // 3. Fetch Level 1s
  useEffect(() => {
    if (roots.length === 0 || !tournamentId) {
      setAllRootsLevel1([]);
      return;
    }
    const unsubscribes = roots.map(root => {
      const q = query(collection(db, `tournaments/${tournamentId}/roots/${root.id}/level1`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsLevel1(prev => {
          const filtered = prev.filter(item => item.rootId !== root.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, rootId: root.id, rootName: root.name, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching level1s:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [roots, tournamentId]);

  // 4. Fetch Level 2s (Chapters)
  useEffect(() => {
    if (allRootsLevel1.length === 0 || !tournamentId) {
      setAllRootsLevel2([]);
      return;
    }
    const unsubscribes = allRootsLevel1.map(l1 => {
      const q = query(collection(db, `tournaments/${tournamentId}/roots/${l1.rootId}/level1/${l1.id}/level2`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsLevel2(prev => {
          const filtered = prev.filter(item => item.level1Id !== l1.id);
          const newItems = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            level1Id: l1.id, 
            level1Name: l1.name,
            rootId: l1.rootId, 
            rootName: l1.rootName,
            ...doc.data() 
          }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching level2s:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel1, tournamentId]);

  // 5. Fetch all roster players assignments
  useEffect(() => {
    if (allRootsLevel2.length === 0 || !tournamentId) {
      setAllRootsPlayers([]);
      return;
    }
    const unsubscribes = allRootsLevel2.map(l2 => {
      const q = query(collection(db, `tournaments/${tournamentId}/roots/${l2.rootId}/level1/${l2.level1Id}/level2/${l2.id}/players`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsPlayers(prev => {
          const filtered = prev.filter(item => item.level2Id !== l2.id);
          const newItems = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            level2Id: l2.id, 
            level2Name: l2.name,
            level1Id: l2.level1Id, 
            level1Name: l2.level1Name,
            rootId: l2.rootId, 
            rootName: l2.rootName,
            ...doc.data() 
          }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching assigned players:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel2, tournamentId]);

  // Create player + optional assignment
  const handleAdd = async () => {
    if (!player.name.trim()) return;
    try {
      // Generate standard ID
      const playersCol = collection(db, `tournaments/${tournamentId}/players`);
      const newPlayerRef = doc(playersCol);
      const newId = newPlayerRef.id;

      const playerData = {
        name: player.name.trim(),
        age: player.age ? Number(player.age) : '',
        createdAt: new Date().toISOString()
      };

      // Set main player
      await setDoc(newPlayerRef, playerData);

      // If chapter assignment selected
      if (selectedChapterId) {
        const chapter = allRootsLevel2.find(c => c.id === selectedChapterId);
        if (chapter) {
          const rosterRef = doc(db, `tournaments/${tournamentId}/roots/${chapter.rootId}/level1/${chapter.level1Id}/level2/${chapter.id}/players`, newId);
          await setDoc(rosterRef, {
            name: playerData.name,
            age: playerData.age,
            assignedAt: new Date().toISOString()
          });
        }
      }

      // If group assignment selected
      if (selectedGroupId) {
        const targetGroup = groups.find(g => g.id === selectedGroupId);
        if (targetGroup) {
          const updatedPlayerIds = [...(targetGroup.playerIds || []), newId];
          await updateDoc(doc(db, `tournaments/${tournamentId}/groups`, targetGroup.id), {
            playerIds: updatedPlayerIds
          });
        }
      }

      setPlayer({ name: '', age: '' });
      setSelectedChapterId('');
      setSelectedGroupId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tournaments/${tournamentId}/players`);
    }
  };

  // Delete player + assignment cleanup
  const handleDeletePlayer = async (playerId: string) => {
    try {
      // Find assignment & remove it
      const assignments = allRootsPlayers.filter(ap => ap.id === playerId);
      for (const assignment of assignments) {
        const rosterRef = doc(db, `tournaments/${tournamentId}/roots/${assignment.rootId}/level1/${assignment.level1Id}/level2/${assignment.level2Id}/players`, playerId);
        await deleteDoc(rosterRef);
      }

      // Clean up from groups
      for (const g of groups) {
        if (g.playerIds?.includes(playerId)) {
          const updatedPlayerIds = (g.playerIds || []).filter((id: string) => id !== playerId);
          await updateDoc(doc(db, `tournaments/${tournamentId}/groups`, g.id), {
            playerIds: updatedPlayerIds
          });
        }
      }

      // Delete main player doc
      await deleteDoc(doc(db, `tournaments/${tournamentId}/players`, playerId));
      setPlayerToDelete(null);
    } catch (err: any) {
      console.error(err);
      alert("Failed to delete player: " + err?.message);
    }
  };

  // Save edit changes
  const handleSaveEdit = async () => {
    if (!editingPlayerId || !editForm.name.trim()) return;
    try {
      const playerRef = doc(db, `tournaments/${tournamentId}/players`, editingPlayerId);
      const updatedData = {
        name: editForm.name.trim(),
        age: editForm.age ? Number(editForm.age) : ''
      };
      
      // Update main player doc
      await updateDoc(playerRef, updatedData);

      const prevAssignment = allRootsPlayers.find(ap => ap.id === editingPlayerId);
      const prevChapterId = prevAssignment ? prevAssignment.level2Id : '';
      const nextChapterId = editForm.chapterId;

      if (prevChapterId !== nextChapterId) {
        // Unassign from old chapter if existed
        if (prevAssignment) {
          const oldRosterRef = doc(db, `tournaments/${tournamentId}/roots/${prevAssignment.rootId}/level1/${prevAssignment.level1Id}/level2/${prevAssignment.level2Id}/players`, editingPlayerId);
          await deleteDoc(oldRosterRef);
        }

        // Assign to new chapter if selected
        if (nextChapterId) {
          const nextChapter = allRootsLevel2.find(c => c.id === nextChapterId);
          if (nextChapter) {
            const newRosterRef = doc(db, `tournaments/${tournamentId}/roots/${nextChapter.rootId}/level1/${nextChapter.level1Id}/level2/${nextChapter.id}/players`, editingPlayerId);
            await setDoc(newRosterRef, {
              name: updatedData.name,
              age: updatedData.age,
              assignedAt: new Date().toISOString()
            });
          }
        }
      } else if (nextChapterId) {
        // Update roster details if chapter didn't change but details did
        const chapter = allRootsLevel2.find(c => c.id === nextChapterId);
        if (chapter) {
          const rosterRef = doc(db, `tournaments/${tournamentId}/roots/${chapter.rootId}/level1/${chapter.level1Id}/level2/${chapter.id}/players`, editingPlayerId);
          await updateDoc(rosterRef, {
            name: updatedData.name,
            age: updatedData.age
          });
        }
      }

      // Group Assignment updates
      const prevGroup = groups.find(g => g.playerIds?.includes(editingPlayerId));
      const prevGroupId = prevGroup ? prevGroup.id : '';
      const nextGroupId = editForm.groupId;

      if (prevGroupId !== nextGroupId) {
        // Remove from old group
        if (prevGroup) {
          const updatedPlayerIds = (prevGroup.playerIds || []).filter((id: string) => id !== editingPlayerId);
          await updateDoc(doc(db, `tournaments/${tournamentId}/groups`, prevGroup.id), {
            playerIds: updatedPlayerIds
          });
        }
        // Add to new group
        if (nextGroupId) {
          const targetGroup = groups.find(g => g.id === nextGroupId);
          if (targetGroup) {
            const updatedPlayerIds = [...(targetGroup.playerIds || []), editingPlayerId];
            await updateDoc(doc(db, `tournaments/${tournamentId}/groups`, targetGroup.id), {
              playerIds: updatedPlayerIds
            });
          }
        }
      }

      setEditingPlayerId(null);
    } catch (err: any) {
      console.error(err);
      alert("Failed to update player: " + err?.message);
    }
  };

  // Start edit
  const startEdit = (p: any) => {
    const activeAssignment = allRootsPlayers.find(ap => ap.id === p.id);
    const playerGroup = groups.find(g => g.playerIds?.includes(p.id));
    setEditingPlayerId(p.id);
    setEditForm({
      name: p.name,
      age: String(p.age || ''),
      chapterId: activeAssignment ? activeAssignment.level2Id : '',
      groupId: playerGroup ? playerGroup.id : ''
    });
  };

  // Filter & Search
  const filteredPlayersList = players.filter(p => {
    const q = searchQuery.toLowerCase();
    const assignedGroup = groups.find(g => g.playerIds?.includes(p.id));
    return p.name.toLowerCase().includes(q) || 
           (assignedGroup && assignedGroup.name.toLowerCase().includes(q));
  });

  // Sort chapters for dropdown selection
  const sortedChapters = [...allRootsLevel2].sort((a, b) => {
    const rootCompare = (a.rootName || '').localeCompare(b.rootName || '');
    if (rootCompare !== 0) return rootCompare;
    const l1Compare = (a.level1Name || '').localeCompare(b.level1Name || '');
    if (l1Compare !== 0) return l1Compare;
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-100 font-sans">
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <User className="text-indigo-600 w-7 h-7" /> Manage Tournament Players
        </h2>
        <p className="text-slate-500 text-sm font-medium mt-0.5">Add, edit, delete, and directly assign players to Chapters (Level 2 rosters).</p>
      </div>

      {/* Adding Section */}
      <div className="p-5 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-500" /> Add New Player Profile
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {/* Name input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">Player Name</label>
            <input 
              value={player.name} 
              onChange={(e) => setPlayer({...player, name: e.target.value})} 
              className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
              placeholder="e.g. John Doe" 
            />
          </div>

          {/* Age input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">Age</label>
            <input 
              value={player.age} 
              onChange={(e) => setPlayer({...player, age: e.target.value})} 
              className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
              placeholder="e.g. 24" 
              type="number" 
            />
          </div>

          {/* Chapter Assignment Dropdown */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-500" /> Assign Chapter (L2)
            </label>
            <select 
              value={selectedChapterId} 
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
            >
              <option value="">-- Choose Chapter --</option>
              {sortedChapters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.rootName} &gt; {c.level1Name} &gt; {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Group Assignment Dropdown */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-indigo-500" /> Group Assignment
            </label>
            <select 
              value={selectedGroupId} 
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
            >
              <option value="">-- Choose Group --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Add Profile Button */}
          <div>
            <button 
              onClick={handleAdd} 
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition text-sm shadow-sm hover:shadow flex items-center justify-center gap-1.5 h-[42px]"
            >
              <Plus className="w-4 h-4" /> Add Profile
            </button>
          </div>
        </div>
      </div>

      {/* Main Players List Toolbar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search players by name or group..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-sm font-medium outline-none transition focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl self-end sm:self-auto">
            Total Tournament Pool: {players.length} Players
          </span>
        </div>

        {/* Players Cards Grid */}
        {filteredPlayersList.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center justify-center space-y-2">
            <div className="p-3 bg-slate-100 rounded-full text-slate-400"><User className="w-6 h-6" /></div>
            <p className="font-bold text-slate-700 text-sm">No players found</p>
            <p className="text-slate-400 text-xs">Add new players above or adjust your search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPlayersList.map(p => {
              const isEditing = editingPlayerId === p.id;
              const assignment = allRootsPlayers.find(ap => ap.id === p.id);
              const assignedGroup = groups.find(g => g.playerIds?.includes(p.id));

              return (
                <div 
                  key={p.id} 
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 bg-white shadow-xs hover:shadow-sm ${
                    isEditing ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-slate-100'
                  }`}
                >
                  {isEditing ? (
                    /* Inline Editing Mode */
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                          <Edit3 className="w-3.5 h-3.5" /> Editing Profile
                        </span>
                        <button onClick={() => setEditingPlayerId(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Name</label>
                          <input 
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full border border-slate-200 p-2 rounded-lg text-xs font-medium outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Age</label>
                          <input 
                            value={editForm.age}
                            onChange={e => setEditForm({ ...editForm, age: e.target.value })}
                            className="w-full border border-slate-200 p-2 rounded-lg text-xs font-medium outline-none focus:border-indigo-500"
                            type="number"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block">Chapter (L2) Assignment</label>
                          <select 
                            value={editForm.chapterId}
                            onChange={e => setEditForm({ ...editForm, chapterId: e.target.value })}
                            className="w-full border border-slate-200 p-2 rounded-lg text-xs font-medium outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="">-- Choose Chapter (Keep Unassigned) --</option>
                            {sortedChapters.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.rootName} &gt; {c.level1Name} &gt; {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block">Group Assignment</label>
                          <select 
                            value={editForm.groupId}
                            onChange={e => setEditForm({ ...editForm, groupId: e.target.value })}
                            className="w-full border border-slate-200 p-2 rounded-lg text-xs font-medium outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="">-- Choose Group (Keep Unassigned) --</option>
                            {groups.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-2">
                        <button 
                          onClick={() => setEditingPlayerId(null)}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Cancel
                        </button>
                        <button 
                          onClick={handleSaveEdit}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Save className="w-3.5 h-3.5" /> Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Card Mode */
                    <>
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-3">
                          {/* Profile Avatar Icon representation */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm uppercase ${
                            assignment ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {p.name.charAt(0) || <User className="w-4 h-4" />}
                          </div>

                          <div className="space-y-0.5">
                            <h4 className="font-bold text-slate-800 text-base tracking-tight">{p.name}</h4>
                            <div className="flex flex-wrap items-center gap-2 text-slate-500 text-xs font-medium">
                              {p.age && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400" /> {p.age} yrs
                                </span>
                              )}
                              {assignedGroup && (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-black uppercase tracking-wider border border-indigo-100/60">
                                  <Users className="w-3 h-3 text-indigo-500" /> {assignedGroup.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Top corner actions */}
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => startEdit(p)}
                            className="p-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Edit player details"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setPlayerToDelete(p)}
                            className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
                            title="Delete Player"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Assignment Status Badge Footer */}
                      <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                        {assignment ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100/60 px-2.5 py-1 rounded-xl w-full">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">
                              Assigned: {assignment.rootName} &gt; {assignment.level1Name} &gt; {assignment.level2Name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-100/60 px-2.5 py-1 rounded-xl w-full">
                            <BookOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Unassigned (Available in Pool)</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {playerToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPlayerToDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            {/* Modal Box */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl relative z-10 border border-slate-100"
            >
              <div className="flex items-center gap-3 text-rose-600 mb-3.5">
                <div className="p-2 bg-rose-50 rounded-xl">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-slate-900">Delete Player?</h3>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Are you sure you want to delete <strong className="text-slate-800 font-bold">{playerToDelete.name}</strong>? 
                This will remove them from the tournament and automatically unassign them from any Chapters or Groups. This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setPlayerToDelete(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeletePlayer(playerToDelete.id)}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition"
                >
                  Delete Player
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
