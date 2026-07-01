import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { 
  Users, 
  Plus, 
  Trash2, 
  Save, 
  ArrowRight, 
  Search, 
  Sparkles, 
  X, 
  RefreshCw, 
  Edit3, 
  Shuffle,
  ChevronRight,
  UserCheck,
  Check,
  UserMinus,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeMenuPlayerId, setActiveMenuPlayerId] = useState<string | null>(null);

  const isAdmin = userRole === 'admin';
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveMenuPlayerId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        } else {
          // Auto bootstrap with default groups if empty and user is admin
          if (isAdmin && groups.length === 0) {
            setGroups([
              { id: '1', name: 'Group A' },
              { id: '2', name: 'Group B' }
            ]);
          }
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

  // Save changes to Firestore
  const saveGroups = async () => {
    setSaving(true);
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
        setSuccessMessage('Groups saved successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `tournaments/${tournamentId}/groups`);
    } finally {
        setSaving(false);
    }
  };

  // Add a new empty group
  const addGroup = () => {
    const nextLetter = String.fromCharCode(65 + groups.length);
    const newGroupName = `Group ${nextLetter}`;
    const newGroupId = Date.now().toString();
    setGroups([...groups, { id: newGroupId, name: newGroupName }]);
    if (!selectedGroup) {
      setSelectedGroup(newGroupName);
    }
  };

  // Handle renaming a group & syncing assignments correctly
  const handleRenameGroup = (groupId: string, oldName: string, newName: string) => {
    setGroups(groups.map(g => g.id === groupId ? { ...g, name: newName } : g));
    
    // Auto-update assignments mapped to the old group name to use the new group name
    const updatedAssignments = { ...playerAssignments };
    Object.keys(updatedAssignments).forEach(playerId => {
      if (updatedAssignments[playerId] === oldName) {
        updatedAssignments[playerId] = newName;
      }
    });
    setPlayerAssignments(updatedAssignments);
    
    if (selectedGroup === oldName) {
      setSelectedGroup(newName);
    }
  };

  // Delete group and return its players to the unassigned pool
  const deleteGroup = (groupId: string, groupName: string) => {
    if (window.confirm(`Are you sure you want to delete ${groupName}? All assigned players will return to the unassigned pool.`)) {
      setGroups(groups.filter(g => g.id !== groupId));
      
      const updatedAssignments = { ...playerAssignments };
      Object.keys(updatedAssignments).forEach(playerId => {
        if (updatedAssignments[playerId] === groupName) {
          delete updatedAssignments[playerId];
        }
      });
      setPlayerAssignments(updatedAssignments);
      
      if (selectedGroup === groupName) {
        setSelectedGroup(groups.find(g => g.id !== groupId)?.name || null);
      }
    }
  };

  // Evenly distribute remaining unassigned players among current groups
  const autoDistributeRemaining = () => {
    if (groups.length === 0) {
      alert("Please add at least one group first!");
      return;
    }
    const unassigned = players.filter(p => !playerAssignments[p.id]);
    if (unassigned.length === 0) {
      alert("All players are already assigned to groups!");
      return;
    }

    const newAssignments = { ...playerAssignments };
    
    // Balance distribution based on existing counts
    unassigned.forEach(player => {
      const groupCounts = groups.map(g => ({
        name: g.name,
        count: players.filter(p => newAssignments[p.id] === g.name).length
      }));
      groupCounts.sort((a, b) => a.count - b.count);
      const targetGroup = groupCounts[0].name;
      newAssignments[player.id] = targetGroup;
    });

    setPlayerAssignments(newAssignments);
    setSuccessMessage('Unassigned players distributed evenly!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Reset all assignments back to unassigned
  const resetAllAssignments = () => {
    if (window.confirm("Are you sure you want to clear ALL group assignments? This will unassign every player.")) {
      setPlayerAssignments({});
    }
  };

  // Unassigned players list filtered by search
  const unassignedPlayers = players.filter(p => !playerAssignments[p.id]);
  const filteredUnassigned = unassignedPlayers.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Users className="w-40 h-40" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-400/20 px-3 py-1 rounded-full text-xs font-semibold text-indigo-300">
              <Users className="w-3.5 h-3.5" />
              Roster & Balancing
            </div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl flex items-center gap-3">
              Group Stage Allocator
              {!isAdmin && (
                <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold rounded-full">
                  👁️ Read-Only Mode
                </span>
              )}
            </h2>
            <p className="text-slate-300 text-sm max-w-2xl">
              Organize your players into robust tournament groups for round-robin play. Click a group to set it as target, then tap players to assign them instantly.
            </p>
          </div>
          
          {/* Quick Counter Info */}
          <div className="flex gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 shrink-0">
            <div className="text-center px-4 border-r border-slate-700/50">
              <div className="text-2xl font-black text-indigo-400 font-mono">{players.length}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Players</div>
            </div>
            <div className="text-center px-4 border-r border-slate-700/50">
              <div className="text-2xl font-black text-emerald-400 font-mono">{groups.length}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Groups</div>
            </div>
            <div className="text-center px-4">
              <div className="text-2xl font-black text-amber-400 font-mono">{unassignedPlayers.length}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Unassigned</div>
            </div>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-semibold text-sm flex items-center gap-2 shadow-xs animate-fade-in">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* READ ONLY WARNING */}
      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>Read-Only Mode: You must be an administrator to configure groups, rename them, or modify player assignments.</span>
        </div>
      )}

      {/* ADMIN CONTROL PANEL BAR */}
      {isAdmin && (
        <div className="flex flex-wrap gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs justify-between items-center">
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={addGroup}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Group
            </button>
            <button 
              onClick={autoDistributeRemaining}
              disabled={unassignedPlayers.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 disabled:hover:bg-slate-100 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <Shuffle className="w-4 h-4 text-slate-500" /> Auto-Distribute Remaining
            </button>
            <button 
              onClick={resetAllAssignments}
              disabled={Object.keys(playerAssignments).length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:opacity-50 disabled:hover:bg-rose-50 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-rose-500" /> Reset Roster
            </button>
          </div>

          <div className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <HelpCircle className="w-4 h-4 text-slate-300" />
            <span>Select a group below to fast-assign clicked players.</span>
          </div>
        </div>
      )}

      {/* CORE BOARD WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" ref={dropdownRef}>
        
        {/* UNASSIGNED PLAYERS POOL SIDEBAR */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col h-[340px] lg:h-[580px]">
          <div className="pb-4 border-b border-slate-100 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                Unassigned Pool
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-mono text-xs font-bold">
                  {unassignedPlayers.length}
                </span>
              </h3>
              {selectedGroup && isAdmin && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md animate-pulse">
                  Target: {selectedGroup}
                </span>
              )}
            </div>

            {/* Roster Search bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search players..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Roster List Scroll */}
          <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-1.5 custom-scrollbar">
            {filteredUnassigned.length > 0 ? (
              filteredUnassigned.map(p => (
                <div
                  key={p.id}
                  className={`group relative flex items-center justify-between p-3 rounded-xl border border-slate-100/80 bg-slate-50/50 hover:bg-white hover:border-indigo-200 hover:shadow-xs transition duration-200 ${
                    isAdmin ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => {
                    if (isAdmin && selectedGroup) {
                      setPlayerAssignments({ ...playerAssignments, [p.id]: selectedGroup });
                    } else if (isAdmin && groups.length > 0) {
                      setActiveMenuPlayerId(p.id);
                    }
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">
                        {p.team || p.club || 'Independent'}
                      </p>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Plus icon shown on hover/status */}
                      {selectedGroup ? (
                        <div className="opacity-0 group-hover:opacity-100 p-1 bg-indigo-600 text-white rounded-lg transition-all duration-200 shadow-xs">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuPlayerId(p.id);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 transition flex items-center gap-0.5"
                        >
                          Assign
                          <ChevronRight className="w-2.5 h-2.5" />
                        </button>
                      )}

                      {/* Floating contextual drop-down menu */}
                      {activeMenuPlayerId === p.id && (
                        <div className="absolute right-3 top-10 z-50 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 text-xs animate-fade-in">
                          <div className="px-3 py-1 text-[9px] text-slate-400 font-black uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1">
                            Assign to Group
                          </div>
                          {groups.map(g => (
                            <button
                              key={g.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlayerAssignments({ ...playerAssignments, [p.id]: g.name });
                                setActiveMenuPlayerId(null);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-semibold transition flex items-center justify-between"
                            >
                              <span>{g.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-100 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-2.5">
                  <UserCheck className="w-5 h-5 text-slate-400" />
                </div>
                {unassignedPlayers.length === 0 ? (
                  <>
                    <p className="text-xs font-extrabold text-slate-700">All Set!</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[180px]">
                      Every registered player is assigned to a tournament group.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-500">No Match Found</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      No unassigned players matched &ldquo;{searchQuery}&rdquo;.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* GROUPS BOARD GRID */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {groups.length > 0 ? (
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
              {groups.map(group => {
                const groupPlayers = players.filter(p => playerAssignments[p.id] === group.name);
                const isSelected = selectedGroup === group.name;

                return (
                  <div 
                    key={group.id} 
                    className={`relative p-5 rounded-3xl border transition-all duration-300 flex flex-col h-[280px] bg-white ${
                      isAdmin ? 'cursor-pointer' : ''
                    } ${
                      isSelected && isAdmin
                        ? 'border-indigo-600 ring-2 ring-indigo-500/10 shadow-md shadow-indigo-50/50' 
                        : 'border-slate-200 shadow-xs hover:border-slate-300'
                    }`}
                    onClick={() => isAdmin && setSelectedGroup(group.name)}
                  >
                    {/* Selected Active Target Highlight Corner Ring */}
                    {isSelected && isAdmin && (
                      <span className="absolute top-3 right-3 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                      </span>
                    )}

                    {/* Group Card Header */}
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className={`w-4 h-4 shrink-0 ${isSelected && isAdmin ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {isAdmin ? (
                          <input 
                            value={group.name} 
                            onClick={e => e.stopPropagation()}
                            onChange={(e) => handleRenameGroup(group.id, group.name, e.target.value)}
                            placeholder="Group Name"
                            className="font-extrabold text-sm text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:ring-0 outline-none p-0.5 w-32 truncate"
                          />
                        ) : (
                          <span className="font-extrabold text-sm text-slate-800 truncate">{group.name}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                          {groupPlayers.length} Plyr
                        </span>
                        {isAdmin && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              deleteGroup(group.id, group.name); 
                            }} 
                            title="Delete Group"
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Assigned Players List Scroll */}
                    <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-1.5 custom-scrollbar">
                      {groupPlayers.length > 0 ? (
                        groupPlayers.map(p => (
                          <div 
                            key={p.id} 
                            className="group/player flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-slate-200 hover:bg-white transition duration-150 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-slate-700 truncate">{p.name}</p>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center shrink-0">
                                {/* Sub-menu to move player to another group */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuPlayerId(p.id);
                                  }}
                                  className="opacity-0 group-hover/player:opacity-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-indigo-600 transition"
                                >
                                  Move
                                </button>
                                
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = { ...playerAssignments };
                                    delete updated[p.id];
                                    setPlayerAssignments(updated);
                                  }}
                                  title="Unassign Player"
                                  className="p-0.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>

                                {activeMenuPlayerId === p.id && (
                                  <div className="absolute z-50 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 text-xs animate-fade-in">
                                    <div className="px-3 py-1 text-[9px] text-slate-400 font-black uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1">
                                      Move Player To
                                    </div>
                                    {groups.filter(g => g.name !== group.name).map(g => (
                                      <button
                                        key={g.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPlayerAssignments({ ...playerAssignments, [p.id]: g.name });
                                          setActiveMenuPlayerId(null);
                                        }}
                                        className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-semibold transition"
                                      >
                                        {g.name}
                                      </button>
                                    ))}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updated = { ...playerAssignments };
                                        delete updated[p.id];
                                        setPlayerAssignments(updated);
                                        setActiveMenuPlayerId(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 font-bold border-t border-slate-100 transition mt-1"
                                    >
                                      Unassign Pool
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                          <p className="text-[10px] font-bold text-slate-400">Empty Group</p>
                          {isAdmin && (
                            <p className="text-[9px] text-slate-400 mt-0.5">
                              {isSelected ? 'Click unassigned players to add them' : 'Click to select & start adding'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl min-h-[300px]">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xs text-slate-400 mb-3">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-sm">No Active Groups</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Groups represent the different categories or pools players are seeded into. Create your first group to start assigning players!
              </p>
              {isAdmin && (
                <button 
                  onClick={addGroup}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add First Group
                </button>
              )}
            </div>
          )}

          {/* BOTTOM MAIN CONTROL BUTTONS */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100 justify-end">
            {isAdmin && (
              <button 
                onClick={saveGroups} 
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" /> 
                {saving ? "Saving Rosters..." : "Save Groups"}
              </button>
            )}
            <button 
              onClick={onNext}
              className="inline-flex items-center justify-center gap-1.5 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-black text-xs rounded-xl transition shadow-xs cursor-pointer"
            >
              Next Component
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
