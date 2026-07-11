import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, getDocs, deleteDoc, doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
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

const getGroupOrderWeight = (name: string): number => {
  const n = name.toLowerCase().trim();
  if (n.includes('final') && !n.includes('semi') && !n.includes('quarter')) return 100;
  if (n.includes('semi')) return 90;
  if (n.includes('quarter') && !n.includes('pre')) return 80;
  if (n.includes('pre_quarter') || n.includes('pre-quarter') || n.includes('pre quarter')) return 70;
  
  // Try to match standard "group X" or "X group"
  const match = n.match(/group\s+([a-z0-9]+)/) || n.match(/([a-z0-9]+)\s+group/);
  if (match) {
    const code = match[1];
    const num = parseInt(code, 10);
    if (!isNaN(num)) {
      return 10 + num;
    }
    const charCode = code.charCodeAt(0);
    if (charCode >= 97 && charCode <= 122) { // a-z
      return 10 + (charCode - 97);
    }
  }
  
  if (n.includes('group')) {
    return 19;
  }
  return 50;
};

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
  const [tournamentInfo, setTournamentInfo] = useState<any | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeMenuPlayerId, setActiveMenuPlayerId] = useState<string | null>(null);
  const [bulkUpdateText, setBulkUpdateText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Custom confirmation modal states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        try {
          await onConfirm();
        } catch (e) {
          console.error(e);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Pair binder states
  const [binderP1Id, setBinderP1Id] = useState('');
  const [binderP2Id, setBinderP2Id] = useState('');
  const [isBinding, setIsBinding] = useState(false);
  const [showPairBinder, setShowPairBinder] = useState(false);

  // Hierarchy tracking states for L2 Data
  const [roots, setRoots] = useState<any[]>([]);
  const [allRootsLevel1, setAllRootsLevel1] = useState<any[]>([]);
  const [allRootsLevel2, setAllRootsLevel2] = useState<any[]>([]);
  const [allRootsPlayers, setAllRootsPlayers] = useState<any[]>([]);

  // Helper to determine if a player is in a doubles/mixed category
  const isDoublesOrMixedCategory = (playerId: string) => {
    const assignment = allRootsPlayers.find(ap => ap.id === playerId);
    if (!assignment) return false;
    const root = assignment.rootName?.toLowerCase() || '';
    const l1 = assignment.level1Name?.toLowerCase() || '';
    const l2 = assignment.level2Name?.toLowerCase() || '';
    
    return (
      root.includes('double') || root.includes('mix') ||
      l1.includes('double') || l1.includes('mix') ||
      l2.includes('double') || l2.includes('mix')
    );
  };

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

  // Fetch roots, level1s, level2s, and players assignments for L2 Data
  useEffect(() => {
    if (!tournamentId) return;
    const qRoots = query(collection(db, `tournaments/${tournamentId}/roots`));
    const unsubscribeRoots = onSnapshot(qRoots, (snapshot) => {
      setRoots(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error("Error fetching roots in GroupManager:", e));
    return () => unsubscribeRoots();
  }, [tournamentId]);

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
      }, (err) => console.error("Error fetching level1s in GroupManager:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [roots, tournamentId]);

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
      }, (err) => console.error("Error fetching level2s in GroupManager:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel1, tournamentId]);

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
      }, (err) => console.error("Error fetching assigned players in GroupManager:", err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel2, tournamentId]);

  useEffect(() => {
    const unsubPlayers = onSnapshot(collection(db, `tournaments/${tournamentId}/players`), (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
    });

    const unsubGroups = onSnapshot(collection(db, `tournaments/${tournamentId}/groups`), (snapshot) => {
      if (!snapshot.empty) {
        const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        
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

        const sortedGroups = uniqueFetchedGroups.map(g => ({ id: g.id, name: g.name })).sort((a, b) => {
          const wA = getGroupOrderWeight(a.name);
          const wB = getGroupOrderWeight(b.name);
          if (wA !== wB) return wA - wB;
          return a.name.localeCompare(b.name);
        });
        setGroups(sortedGroups);
        
        const newAssignments: { [playerId: string]: string } = {};
        uniqueFetchedGroups.forEach(group => {
          group.playerIds.forEach((playerId: string) => {
            newAssignments[playerId] = group.name;
          });
        });
        setPlayerAssignments(newAssignments);
      } else {
        if (isAdmin && groups.length === 0) {
          // Auto bootstrap default groups in Firestore so we have real generated IDs
          const bootstrapGroups = async () => {
            try {
              const col = collection(db, `tournaments/${tournamentId}/groups`);
              await addDoc(col, { name: 'Group A', playerIds: [] });
              await addDoc(col, { name: 'Group B', playerIds: [] });
            } catch (err) {
              console.error("Bootstrap groups failed:", err);
            }
          };
          bootstrapGroups();
        }
      }
    });
    
    const unsubTournament = onSnapshot(doc(db, 'tournaments', tournamentId), (snapshot) => {
      if (snapshot.exists()) {
        setTournamentInfo({ id: snapshot.id, ...snapshot.data() });
      }
    });
    
    return () => {
      unsubPlayers();
      unsubGroups();
      unsubTournament();
    };
  }, [tournamentId]);



  // Real-time Assignment updates to Firestore
  const assignPlayersToGroup = async (playerIds: string[], targetGroupName: string | null) => {
    try {
      const q = query(collection(db, `tournaments/${tournamentId}/groups`));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const gName = data.name || '';
        let currentIds: string[] = data.playerIds || [];
        
        let changed = false;
        if (gName !== targetGroupName) {
          const filtered = currentIds.filter(id => !playerIds.includes(id));
          if (filtered.length !== currentIds.length) {
            currentIds = filtered;
            changed = true;
          }
        } else {
          const merged = Array.from(new Set([...currentIds, ...playerIds]));
          if (merged.length !== currentIds.length) {
            currentIds = merged;
            changed = true;
          }
        }
        
        if (changed) {
          batch.update(docSnap.ref, { playerIds: currentIds });
        }
      });
      
      await batch.commit();
      setSuccessMessage(targetGroupName ? `Roster saved to ${targetGroupName}` : 'Player unassigned');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (e: any) {
      console.error("Failed to assign players:", e);
      handleFirestoreError(e, OperationType.UPDATE, `tournaments/${tournamentId}/groups`);
    }
  };

  // Add a new empty group in Firestore
  const addGroup = async () => {
    const nextLetter = String.fromCharCode(65 + groups.length);
    const newGroupName = `Group ${nextLetter}`;
    try {
      await addDoc(collection(db, `tournaments/${tournamentId}/groups`), {
        name: newGroupName,
        playerIds: []
      });
      setSuccessMessage(`Created ${newGroupName}`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (e: any) {
      console.error("Failed to create group:", e);
      alert("Failed to create group: " + e?.message);
    }
  };

  // Handle renaming a group directly in Firestore
  const handleRenameGroup = async (groupId: string, oldName: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const groupRef = doc(db, `tournaments/${tournamentId}/groups`, groupId);
      await updateDoc(groupRef, { name: newName.trim() });
    } catch (e: any) {
      console.error("Failed to rename group:", e);
    }
  };

  // Delete group and unassign its players automatically
  const deleteGroup = (groupId: string, groupName: string) => {
    showConfirm(
      `Delete ${groupName}?`,
      `Are you sure you want to delete ${groupName}? All assigned players will return to the unassigned pool.`,
      async () => {
        try {
          await deleteDoc(doc(db, `tournaments/${tournamentId}/groups`, groupId));
          setSuccessMessage(`Deleted ${groupName}`);
          setTimeout(() => setSuccessMessage(null), 2000);
        } catch (e: any) {
          console.error("Failed to delete group:", e);
          alert("Failed to delete group: " + e?.message);
        }
      }
    );
  };

  // Evenly distribute remaining unassigned players/pairs among current groups
  const autoDistributeRemaining = async () => {
    if (groups.length === 0) {
      alert("Please add at least one group first!");
      return;
    }
    const unassigned = players.filter(p => !playerAssignments[p.id]);
    if (unassigned.length === 0) {
      alert("All players are already assigned to groups!");
      return;
    }

    setSaving(true);
    try {
      const tempAssignments = { ...playerAssignments };
      
      // Group unassigned into units so pairs stay together
      const units: string[][] = [];
      const processed = new Set<string>();
      
      unassigned.forEach(p => {
        if (processed.has(p.id)) return;
        if (p.pairId) {
          const partner = unassigned.find(other => other.pairId === p.pairId && other.id !== p.id);
          if (partner) {
            units.push([p.id, partner.id]);
            processed.add(p.id);
            processed.add(partner.id);
          } else {
            units.push([p.id]);
            processed.add(p.id);
          }
        } else {
          units.push([p.id]);
          processed.add(p.id);
        }
      });

      // Distribute each unit to the group with lowest count
      units.forEach(unitPlayerIds => {
        const groupCounts = groups.map(g => ({
          name: g.name,
          count: players.filter(p => tempAssignments[p.id] === g.name).length
        }));
        groupCounts.sort((a, b) => a.count - b.count);
        const targetGroup = groupCounts[0].name;

        unitPlayerIds.forEach(id => {
          tempAssignments[id] = targetGroup;
        });
      });

      // Save assignments to Firestore
      const q = query(collection(db, `tournaments/${tournamentId}/groups`));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const gName = data.name || '';
        const groupPlayerIds = players
          .filter(p => tempAssignments[p.id] === gName)
          .map(p => p.id);

        batch.update(docSnap.ref, { playerIds: groupPlayerIds });
      });

      await batch.commit();
      setSuccessMessage('Unassigned players distributed evenly!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error(e);
      alert("Failed to auto-distribute: " + e?.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset all assignments back to unassigned in Firestore
  const resetAllAssignments = () => {
    showConfirm(
      "Reset Roster Assignments?",
      "Are you sure you want to clear ALL group assignments? This will unassign every player.",
      async () => {
        setSaving(true);
        try {
          const q = query(collection(db, `tournaments/${tournamentId}/groups`));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);

          snapshot.docs.forEach(docSnap => {
            batch.update(docSnap.ref, { playerIds: [] });
          });

          await batch.commit();
          setSuccessMessage("All roster assignments cleared successfully!");
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (e: any) {
          console.error(e);
          alert("Failed to reset assignments: " + e?.message);
        } finally {
          setSaving(false);
        }
      }
    );
  };

  // Bind two players as a doubles pair
  const handleBindGroupPair = async (p1Id: string, p2Id: string) => {
    if (!p1Id || !p2Id) return;
    try {
      const generatedPairId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      const p1Ref = doc(db, `tournaments/${tournamentId}/players`, p1Id);
      const p2Ref = doc(db, `tournaments/${tournamentId}/players`, p2Id);

      await updateDoc(p1Ref, { pairId: generatedPairId });
      await updateDoc(p2Ref, { pairId: generatedPairId });

      // Synchronize their group assignments in Firestore!
      const p1Group = playerAssignments[p1Id];
      const p2Group = playerAssignments[p2Id];
      const targetGroup = p1Group || p2Group || null;
      if (targetGroup) {
        await assignPlayersToGroup([p1Id, p2Id], targetGroup);
      }

      setSuccessMessage("Players successfully linked as a pair!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error(err);
      alert("Failed to bind pair: " + err?.message);
    }
  };

  // Unlink a doubles pair
  const handleUnlinkGroupPair = (pairId: string, pAName: string, pBName: string) => {
    showConfirm(
      "Unlink Doubles Pair",
      `Are you sure you want to unlink ${pAName} & ${pBName}?`,
      async () => {
        try {
          const paired = players.filter(p => p.pairId === pairId);
          for (const p of paired) {
            await updateDoc(doc(db, `tournaments/${tournamentId}/players`, p.id), { pairId: null });
          }
          setSuccessMessage("Players successfully unlinked.");
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
          console.error(err);
          alert("Failed to unlink pair: " + err?.message);
        }
      }
    );
  };

  // Map existing players to groups by copy-paste matching
  const handleBulkUpdate = async () => {
    const lines = bulkUpdateText.trim().split('\n');
    if (lines.length < 2) return;
    const groupNames = lines[0].split('\t').map(s => s.trim());
    const tempAssignments = { ...playerAssignments };
    
    for (let i = 1; i < lines.length; i++) {
      const playersInRow = lines[i].split('\t').map(s => s.trim());
      playersInRow.forEach((playerName, colIndex) => {
        if (colIndex < groupNames.length && playerName) {
          const matchedPlayer = players.find(p => p.name.trim().toLowerCase() === playerName.trim().toLowerCase());
          if (matchedPlayer) {
            tempAssignments[matchedPlayer.id] = groupNames[colIndex];
            
            // If they are paired, synchronize the partner to the same group
            if (matchedPlayer.pairId) {
              const partner = players.find(other => other.pairId === matchedPlayer.pairId && other.id !== matchedPlayer.id);
              if (partner) {
                tempAssignments[partner.id] = groupNames[colIndex];
              }
            }
          }
        }
      });
    }

    setSaving(true);
    try {
      const q = query(collection(db, `tournaments/${tournamentId}/groups`));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const gName = data.name || '';
        const groupPlayerIds = players
          .filter(p => tempAssignments[p.id] === gName)
          .map(p => p.id);

        batch.update(docSnap.ref, { playerIds: groupPlayerIds });
      });

      await batch.commit();
      setShowBulkModal(false);
      setBulkUpdateText('');
      setSuccessMessage('Bulk updated and saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error(e);
      alert("Failed to save bulk update: " + e?.message);
    } finally {
      setSaving(false);
    }
  };

  // Unassigned players list
  const unassignedPlayers = players.filter(p => !playerAssignments[p.id]);

  // Group unassigned players into single or pair entries
  const unassignedEntries: Array<{
    id: string;
    type: 'single' | 'pair';
    name: string;
    players: any[];
    pairId?: string;
  }> = [];
  
  const processedUnassignedIds = new Set<string>();
  unassignedPlayers.forEach(p => {
    if (processedUnassignedIds.has(p.id)) return;

    if (p.pairId) {
      const partner = players.find(other => other.pairId === p.pairId && other.id !== p.id);
      if (partner) {
        const partnerIsUnassigned = !playerAssignments[partner.id];
        if (partnerIsUnassigned) {
          unassignedEntries.push({
            id: `pair_${p.pairId}`,
            type: 'pair',
            name: `${p.name} & ${partner.name}`,
            players: [p, partner],
            pairId: p.pairId
          });
          processedUnassignedIds.add(p.id);
          processedUnassignedIds.add(partner.id);
        } else {
          unassignedEntries.push({
            id: p.id,
            type: 'single',
            name: p.name,
            players: [p]
          });
          processedUnassignedIds.add(p.id);
        }
      } else {
        unassignedEntries.push({
          id: p.id,
          type: 'single',
          name: p.name,
          players: [p]
        });
        processedUnassignedIds.add(p.id);
      }
    } else {
      unassignedEntries.push({
        id: p.id,
        type: 'single',
        name: p.name,
        players: [p]
      });
      processedUnassignedIds.add(p.id);
    }
  });

  const filteredUnassignedEntries = unassignedEntries.filter(entry => 
    entry.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const downloadGroupsPDF = () => {
    const doc = new jsPDF();
    
    // Header
    const sportName = tournamentInfo?.sport || "Badminton";
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text(`🏸 ${sportName.toUpperCase()} TOURNAMENT GROUPS`, 14, 16);
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    const titleText = tournamentInfo?.name || "Tournament Groups & Rosters";
    doc.text(titleText, 14, 23);
    
    // Draw horizontal line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 27, 196, 27);
    
    let y = 35;
    
    const playerL1Map = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level1Name || ap.parentName]));
    const playerL2Map = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level2Name || ap.chapterName]));

    const getPlayerDetailsWithHierarchy = (name: string, playerId: string) => {
      if (!playerId) return name;
      const l2 = playerL2Map[playerId];
      const l1 = playerL1Map[playerId];
      const parts = [];
      if (l1) parts.push(l1);
      if (l2) parts.push(l2);
      if (parts.length > 0) {
        return `${name} (${parts.join('/')})`;
      }
      return name;
    };

    groups.forEach((group) => {
      const groupPlayers = players.filter(p => playerAssignments[p.id] === group.name);
      
      // If we don't have enough space for the group header + a couple of players, add a page
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(group.name, 14, y);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`(${groupPlayers.length} players)`, 60, y);
      
      y += 4;
      doc.setDrawColor(230, 230, 230);
      doc.line(14, y, 196, y);
      y += 6;
      
      if (groupPlayers.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.text("No players assigned yet", 20, y);
        y += 8;
      } else {
        doc.setFont("helvetica", "bold");
        doc.text("#", 14, y);
        doc.text("Player Name (L1 / L2 Hierarchy)", 25, y);
        doc.text("Gender", 115, y);
        doc.text("Age", 135, y);
        doc.text("Phone / Mobile", 155, y);
        y += 4;
        doc.line(14, y, 196, y);
        y += 6;
        
        doc.setFont("helvetica", "normal");
        groupPlayers.forEach((p, idx) => {
          const nameStr = getPlayerDetailsWithHierarchy(p.name || "N/A", p.id);
          const nameLines: string[] = doc.splitTextToSize(nameStr, 85);
          const maxLines = Math.max(nameLines.length, 1);
          const rowHeight = maxLines * 4.5 + 2.5;

          if (y + rowHeight > 280) {
            doc.addPage();
            y = 20;
            doc.setFont("helvetica", "bold");
            doc.text(`${group.name} (Continued)`, 14, y);
            y += 6;
            doc.setFont("helvetica", "normal");
          }
          
          doc.text(String(idx + 1), 14, y);
          
          // Render name lines
          nameLines.forEach((line, idxLine) => {
            doc.text(line, 25, y + idxLine * 4.5);
          });

          doc.text(p.gender || "Male", 115, y);
          doc.text(p.age ? String(p.age) : "-", 135, y);
          doc.text(p.mobile || "-", 155, y);
          
          y += rowHeight;
        });
        y += 4; // Extra space after group
      }
    });
    
    doc.save("tournament_groups.pdf");
  };

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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0">
            <button
              onClick={downloadGroupsPDF}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-extrabold rounded-xl transition shadow-xs cursor-pointer"
              title="Download PDF Groups & Rosters"
            >
              PDF Download
            </button>
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
            <button 
              onClick={() => setShowBulkModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-purple-500" /> Bulk Update
            </button>
            <button 
              onClick={() => setShowPairBinder(!showPairBinder)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                showPairBinder 
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                  : 'bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-100/50'
              }`}
            >
              <Users className="w-4 h-4 text-indigo-600" /> {showPairBinder ? 'Hide Pair Binder' : 'Doubles Pair Binder'}
            </button>
          </div>

          {/* Bulk Update Modal */}
          {showBulkModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
              <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="font-black text-lg text-slate-800 tracking-tight">Bulk Board Allocation</h3>
                  <button 
                    onClick={() => {
                      setShowBulkModal(false);
                    }} 
                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Paste a spreadsheet table to assign existing roster players to groups. The first row defines group names, subsequent rows are player names.
                  </p>
                  <textarea 
                    value={bulkUpdateText}
                    onChange={e => setBulkUpdateText(e.target.value)}
                    className="w-full h-64 p-4 border border-slate-200 focus:border-indigo-500 rounded-2xl font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/10 transition"
                    placeholder="Group A   Group B   Group C&#10;Player1   Player2   Player3"
                  />
                  <div className="flex justify-end gap-3 pt-2">
                    <button 
                      onClick={() => setShowBulkModal(false)} 
                      className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleBulkUpdate} 
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-sm font-black transition shadow-xs cursor-pointer"
                    >
                      Apply Assignments
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <HelpCircle className="w-4 h-4 text-slate-300" />
            <span>Select a group below to fast-assign clicked players.</span>
          </div>
        </div>
      )}

      {/* Doubles Pair Binder Collapsible Panel */}
      {isAdmin && showPairBinder && (
        <div className="p-6 bg-slate-50/70 border border-slate-200/60 rounded-3xl space-y-6 animate-fade-in shadow-2xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" /> Doubles Pair Binder
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Visually bind two individual players together. These pairs will automatically stay linked and display as a team in the group card.</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-xs space-y-4">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> Link Two Players into a New Pair
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 block">First Option / Player 1</label>
                <select
                  value={binderP1Id}
                  onChange={(e) => setBinderP1Id(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
                >
                  <option value="">-- Choose First Player --</option>
                  {players
                    .filter(p => !p.pairId && isDoublesOrMixedCategory(p.id))
                    .map(p => {
                      const groupName = playerAssignments[p.id];
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} {groupName ? `[${groupName}]` : '[Unassigned]'}
                        </option>
                      );
                    })
                  }
                </select>
              </div>

              <div className="flex justify-center items-center pb-2.5 md:col-span-1 hidden md:flex text-slate-400 font-bold text-lg">&amp;</div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 block">Second Option / Player 2</label>
                <select
                  value={binderP2Id}
                  onChange={(e) => setBinderP2Id(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
                  disabled={!binderP1Id}
                >
                  <option value="">-- Choose Second Player --</option>
                  {players
                    .filter(p => !p.pairId && p.id !== binderP1Id && isDoublesOrMixedCategory(p.id))
                    .map(p => {
                      const groupName = playerAssignments[p.id];
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} {groupName ? `[${groupName}]` : '[Unassigned]'}
                        </option>
                      );
                    })
                  }
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={async () => {
                  if (!binderP1Id || !binderP2Id) {
                    alert("Please select both options/players.");
                    return;
                  }
                  setIsBinding(true);
                  try {
                    await handleBindGroupPair(binderP1Id, binderP2Id);
                    setBinderP1Id('');
                    setBinderP2Id('');
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setIsBinding(false);
                  }
                }}
                disabled={isBinding || !binderP1Id || !binderP2Id}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold rounded-xl transition text-xs shadow-xs flex items-center justify-center gap-1.5"
              >
                {isBinding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Bind Options as Pair
              </button>
            </div>
          </div>

          {/* Active Pairs List */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Active Linked Pairs</h4>
            {Array.from(
              players
                .filter(p => p.pairId)
                .reduce((map, p) => {
                  if (!map.has(p.pairId)) map.set(p.pairId, []);
                  map.get(p.pairId).push(p);
                  return map;
                }, new Map<string, any[]>())
                .entries()
            ).length === 0 ? (
              <div className="text-center py-8 bg-white border border-slate-200 rounded-2xl">
                <p className="text-slate-400 text-xs font-semibold">No active linked pairs. Use the form above or the dropdown inside group cards to link players together.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(
                  players
                    .filter(p => p.pairId)
                    .reduce((map, p) => {
                      if (!map.has(p.pairId)) map.set(p.pairId, []);
                      map.get(p.pairId).push(p);
                      return map;
                    }, new Map<string, any[]>())
                    .entries()
                ).map(([pairId, pairPlayers], idx) => {
                  const p1 = pairPlayers[0];
                  const p2 = pairPlayers[1] || null;

                  const p1Group = playerAssignments[p1.id];
                  const p2Group = p2 ? playerAssignments[p2.id] : null;

                  return (
                    <div key={pairId} className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider block mb-1">Pair #{idx + 1}</span>
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded bg-indigo-50 text-indigo-700 flex items-center justify-center text-[9px] font-bold">1</div>
                              <span className="font-bold text-slate-800 text-xs truncate max-w-[120px]">{p1.name}</span>
                              {p1Group && (
                                <span className="text-[8px] font-extrabold bg-slate-100 text-slate-600 px-1 py-0.5 rounded uppercase">{p1Group}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center text-[9px] font-bold">2</div>
                              {p2 ? (
                                <>
                                  <span className="font-bold text-slate-800 text-xs truncate max-w-[120px]">{p2.name}</span>
                                  {p2Group && (
                                    <span className="text-[8px] font-extrabold bg-slate-100 text-slate-600 px-1 py-0.5 rounded uppercase">{p2Group}</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-400 text-[10px] italic">No partner</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleUnlinkGroupPair(pairId, p1.name, p2 ? p2.name : 'Unknown')}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[9px] font-black uppercase rounded-lg border border-rose-100 transition-colors"
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
            {filteredUnassignedEntries.length > 0 ? (
              filteredUnassignedEntries.map(entry => (
                <div
                  key={entry.id}
                  className={`group relative flex items-center justify-between p-3 rounded-xl border transition duration-200 ${
                    entry.type === 'pair'
                      ? 'bg-indigo-50/40 border-indigo-100/80 hover:bg-indigo-50/70 hover:border-indigo-200'
                      : 'bg-slate-50/50 border-slate-100/80 hover:bg-white hover:border-indigo-200'
                  } ${
                    isAdmin ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => {
                    if (isAdmin && selectedGroup) {
                      assignPlayersToGroup(entry.players.map(p => p.id), selectedGroup);
                    } else if (isAdmin && groups.length > 0) {
                      setActiveMenuPlayerId(entry.id);
                    }
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${
                      entry.type === 'pair' ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {entry.type === 'pair' ? <Users className="w-3.5 h-3.5" /> : entry.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${entry.type === 'pair' ? 'text-indigo-950' : 'text-slate-700'}`}>
                        {entry.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1">
                        {entry.type === 'pair' ? (
                          <span className="text-indigo-600 font-extrabold uppercase text-[9px] tracking-wide bg-indigo-50 px-1.5 py-0.2 rounded">Linked Doubles Pair</span>
                        ) : (
                          entry.players[0].team || entry.players[0].club || 'Independent'
                        )}
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
                            setActiveMenuPlayerId(entry.id);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 transition flex items-center gap-0.5"
                        >
                          Assign
                          <ChevronRight className="w-2.5 h-2.5" />
                        </button>
                      )}

                      {/* Floating contextual drop-down menu */}
                      {activeMenuPlayerId === entry.id && (
                        <div className="absolute right-3 top-10 z-50 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 text-xs animate-fade-in">
                          <div className="px-3 py-1 text-[9px] text-slate-400 font-black uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1">
                            Assign to Group
                          </div>
                          {groups.map(g => (
                            <button
                              key={g.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                assignPlayersToGroup(entry.players.map(p => p.id), g.name);
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
                      {(() => {
                        const renderEntries: Array<{
                          id: string;
                          type: 'single' | 'pair';
                          name: string;
                          players: any[];
                          pairId?: string;
                        }> = [];

                        const processedPlayerIds = new Set<string>();

                        groupPlayers.forEach(p => {
                          if (processedPlayerIds.has(p.id)) return;

                          if (p.pairId) {
                            const partner = groupPlayers.find(other => other.pairId === p.pairId && other.id !== p.id);
                            if (partner) {
                              renderEntries.push({
                                id: `pair_${p.pairId}`,
                                type: 'pair',
                                name: `${p.name} & ${partner.name}`,
                                players: [p, partner],
                                pairId: p.pairId
                              });
                              processedPlayerIds.add(p.id);
                              processedPlayerIds.add(partner.id);
                            } else {
                              renderEntries.push({
                                id: p.id,
                                type: 'single',
                                name: p.name,
                                players: [p]
                              });
                              processedPlayerIds.add(p.id);
                            }
                          } else {
                            renderEntries.push({
                              id: p.id,
                              type: 'single',
                              name: p.name,
                              players: [p]
                            });
                            processedPlayerIds.add(p.id);
                          }
                        });

                        return renderEntries.length > 0 ? (
                          renderEntries.map(entry => (
                            <div 
                              key={entry.id} 
                              className={`group/player flex items-center justify-between p-2 rounded-lg border transition duration-150 text-xs ${
                                entry.type === 'pair' 
                                  ? 'bg-indigo-50/40 border-indigo-100 hover:border-indigo-200 hover:bg-indigo-50/80' 
                                  : 'bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-white'
                              }`}
                            >
                              <div className="min-w-0 flex flex-wrap items-center gap-1.5 max-w-[70%]">
                                {entry.type === 'pair' && <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                                <p className={`font-bold truncate ${entry.type === 'pair' ? 'text-indigo-950 text-xs sm:text-sm' : 'text-slate-700 text-xs sm:text-sm'}`}>
                                  {entry.name}
                                </p>
                                
                                {/* Inline Pairing & Unlinking controls */}
                                {isAdmin && entry.type === 'single' && isDoublesOrMixedCategory(entry.players[0].id) && (() => {
                                  const candidates = groupPlayers.filter(other => other.id !== entry.players[0].id && !other.pairId && isDoublesOrMixedCategory(other.id));
                                  if (candidates.length === 0) return null;
                                  return (
                                    <select
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={async (e) => {
                                        const partnerId = e.target.value;
                                        if (partnerId) {
                                          await handleBindGroupPair(entry.players[0].id, partnerId);
                                        }
                                      }}
                                      className="text-[9px] bg-indigo-50 hover:bg-indigo-100 border border-indigo-100/50 rounded px-1.5 py-0.5 text-indigo-700 font-extrabold outline-none cursor-pointer max-w-[120px] ml-1"
                                      value=""
                                    >
                                      <option value="">🔗 Pair with...</option>
                                      {candidates.map(other => (
                                        <option key={other.id} value={other.id}>{other.name}</option>
                                      ))}
                                    </select>
                                  );
                                })()}

                                {isAdmin && entry.type === 'pair' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnlinkGroupPair(entry.pairId!, entry.players[0].name, entry.players[1].name);
                                    }}
                                    className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-700 transition px-1.5 py-0.5 bg-rose-50 border border-rose-100 rounded-md shrink-0 ml-1"
                                  >
                                    Unlink Pair
                                  </button>
                                )}
                              </div>
                              {isAdmin && (
                                <div className="flex items-center shrink-0 relative">
                                  {/* Sub-menu to move player/pair to another group */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuPlayerId(entry.id);
                                    }}
                                    className="opacity-0 group-hover/player:opacity-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-indigo-600 transition"
                                  >
                                    Move
                                  </button>
                                  
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      assignPlayersToGroup(entry.players.map(ep => ep.id), null);
                                    }}
                                    title="Unassign Entry"
                                    className="p-0.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>

                                  {activeMenuPlayerId === entry.id && (
                                    <div className="absolute right-0 top-6 z-50 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 text-xs animate-fade-in">
                                      <div className="px-3 py-1 text-[9px] text-slate-400 font-black uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1">
                                        Move To Group
                                      </div>
                                      {groups.filter(g => g.name !== group.name).map(g => (
                                        <button
                                          key={g.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            assignPlayersToGroup(entry.players.map(ep => ep.id), g.name);
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
                                          assignPlayersToGroup(entry.players.map(ep => ep.id), null);
                                          setActiveMenuPlayerId(null);
                                        }}
                                        className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 font-bold border-t border-slate-100 transition mt-1"
                                      >
                                        Unassign
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
                        );
                      })()}
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
      {/* CUSTOM CONFIRMATION DIALOG */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 mb-2">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-black text-lg text-slate-800 tracking-tight">{confirmModal.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">{confirmModal.message}</p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                }}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
