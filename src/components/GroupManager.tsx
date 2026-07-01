import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, getDocs, deleteDoc, doc } from 'firebase/firestore';

export default function GroupManager({ 
  tournamentId, 
  onNext,
  userRole = 'user'
}: { 
  tournamentId: string; 
  onNext: () => void;
  userRole?: 'admin' | 'scorer' | 'user';
}) {
  const [players, setPlayers] = useState<any[]>([]);
  const [playerAssignments, setPlayerAssignments] = useState<{ [playerId: string]: string }>({});
  const [groups, setGroups] = useState<{id: string, name: string}[]>([]);

  const [groupsCreated, setGroupsCreated] = useState<boolean>(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const isAdmin = userRole === 'admin';

  // const groupOptions = Array.from({ length: numberOfGroups }, (_, i) => `Group ${String.fromCharCode(65 + i)}`);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const q = query(collection(db, `tournaments/${tournamentId}/players`));
        const snapshot = await getDocs(q);
        setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/players`);
      }
    };
    
    const fetchGroups = async () => {
      try {
        const q = query(collection(db, `tournaments/${tournamentId}/groups`));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          
          // De-duplicate groups by name and merge playerIds
          const uniqueFetchedGroups: any[] = [];
          const seenNames = new Set<string>();
          fetchedGroups.forEach(group => {
            const nameLower = (group.name || '').trim().toLowerCase();
            if (!nameLower) return;
            if (!seenNames.has(nameLower)) {
              seenNames.add(nameLower);
              uniqueFetchedGroups.push({
                id: group.id,
                name: group.name,
                playerIds: group.playerIds || []
              });
            } else {
              const existingGroup = uniqueFetchedGroups.find(g => g.name.trim().toLowerCase() === nameLower);
              if (existingGroup) {
                existingGroup.playerIds = Array.from(new Set([
                  ...(existingGroup.playerIds || []),
                  ...(group.playerIds || [])
                ]));
              }
            }
          });

          setGroups(uniqueFetchedGroups.map(g => ({ id: g.id, name: g.name })));
          
          const newAssignments: { [playerId: string]: string } = {};
          uniqueFetchedGroups.forEach(group => {
            group.playerIds.forEach((playerId: string) => {
              newAssignments[playerId] = group.name;
            });
          });
          setPlayerAssignments(newAssignments);
          setGroupsCreated(true);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/groups`);
      }
    };

    const fetchAll = async () => {
        await fetchPlayers();
        await fetchGroups();
    };
    fetchAll();
  }, [tournamentId]);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const saveGroups = async () => {
    try {
        // Delete existing groups first
        const qGroups = query(collection(db, `tournaments/${tournamentId}/groups`));
        const snapshot = await getDocs(qGroups);
        for (const document of snapshot.docs) {
            await deleteDoc(doc(db, `tournaments/${tournamentId}/groups`, document.id));
        }
        
        const groupsData = groups.map(group => ({
          name: group.name,
          playerIds: players.filter(p => playerAssignments[p.id] === group.name).map(p => p.id)
        }));
    
        for (const group of groupsData) {
          await addDoc(collection(db, `tournaments/${tournamentId}/groups`), group);
        }
        setSuccessMessage('Groups successfully created!');
        setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `tournaments/${tournamentId}/groups`);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-center pb-2 border-b">
        <h2 className="text-2xl font-bold text-slate-800">Manual Group Assignment</h2>
        {!isAdmin && (
          <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
            👁️ Read-Only
          </span>
        )}
      </div>
      
      {successMessage && <div className="p-4 bg-emerald-100 text-emerald-800 rounded-xl font-medium">{successMessage}</div>}
      
      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
          ⚠️ Read-Only Mode: You must be an administrator to configure groups or assign players.
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-4 items-center">
          <button onClick={() => setGroups([...groups, {id: Date.now().toString(), name: `Group ${String.fromCharCode(65 + groups.length)}`}])} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition cursor-pointer">Add Group</button>
          <button onClick={() => setGroupsCreated(true)} className="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition cursor-pointer">Apply Groups</button>
        </div>
      )}

      {(groupsCreated || !isAdmin) && (
        <>
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {groups.map(group => (
                    <div 
                      key={group.id} 
                      className={`p-4 rounded-2xl border transition-all ${isAdmin ? 'cursor-pointer' : ''} ${selectedGroup === group.name && isAdmin ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-slate-200'}`}
                      onClick={() => isAdmin && setSelectedGroup(group.name)}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <input 
                                value={group.name} 
                                readOnly={!isAdmin}
                                onChange={(e) => setGroups(groups.map(g => g.id === group.id ? {...g, name: e.target.value} : g))}
                                className="font-bold text-lg text-slate-800 border-none bg-transparent w-full focus:ring-0 outline-none"
                            />
                            {isAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); setGroups(groups.filter(g => g.id !== group.id)); }} className="text-rose-500 hover:text-rose-700 text-sm font-medium cursor-pointer">Delete</button>
                            )}
                        </div>
                        <ul className="text-sm text-slate-600 space-y-1">
                            {players.filter(p => playerAssignments[p.id] === group.name).map(p => (
                                <li key={p.id} className="bg-slate-50 p-2 rounded-lg text-xs font-medium text-slate-700">{p.name}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {isAdmin && selectedGroup && (
              <div className="space-y-4 border-t border-slate-100 pt-6">
                  <h3 className="font-bold text-slate-800">Assign Players to {selectedGroup}</h3>
                  <div className="flex flex-wrap gap-2">
                    {players
                      .filter(p => !playerAssignments[p.id])
                      .map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPlayerAssignments({...playerAssignments, [p.id]: selectedGroup})}
                        className="px-4 py-2 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 rounded-xl transition font-medium cursor-pointer"
                      >
                          {p.name}
                      </button>
                    ))}
                  </div>
              </div>
            )}
            <div className="flex gap-4 pt-4">
                {isAdmin && (
                  <button onClick={saveGroups} className="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition cursor-pointer">Save Groups</button>
                )}
                <button onClick={onNext} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition cursor-pointer">Next: Fixtures</button>
            </div>
        </>
      )}
    </div>
  );
}
