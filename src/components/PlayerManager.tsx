import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDoc,
  where,
  getDocs,
  limit
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
  Undo2,
  Phone,
  FileSpreadsheet,
  Upload,
  Check,
  AlertTriangle,
  RefreshCw,
  FileText,
  Trophy
} from 'lucide-react';
import PlayerMatchesModal from './PlayerMatchesModal';

export default function PlayerManager({ 
  tournamentId,
  userRole = 'user'
}: { 
  tournamentId: string;
  userRole?: 'admin' | 'scorer' | 'user';
}) {
  const isAdmin = userRole === 'admin';
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedPlayerForMatches, setSelectedPlayerForMatches] = useState<{ id: string; name: string } | null>(null);
  const [player, setPlayer] = useState({ name: '', age: '', mobile: '', gender: 'Male', email: '' });
  const [partnerGender, setPartnerGender] = useState('Female');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);
  const [isDoublesImport, setIsDoublesImport] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerMobile, setPartnerMobile] = useState('');
  const [isDoublesMode, setIsDoublesMode] = useState(false);
  const [linkWithGlobal, setLinkWithGlobal] = useState(true);
  const [partnerPlayer, setPartnerPlayer] = useState<{ id: string; name: string } | null>(null);
  
  // Bulk import states
  const [importMode, setImportMode] = useState<'single' | 'bulk' | 'pairs'>('single');
  const [bulkText, setBulkText] = useState('');
  const [parsedPlayers, setParsedPlayers] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Pair Binder states
  const [binderPlayer1Id, setBinderPlayer1Id] = useState('');
  const [binderPlayer2Id, setBinderPlayer2Id] = useState('');
  const [isBinding, setIsBinding] = useState(false);

  // Master profile lookup states
  const [isSearchingMobile, setIsSearchingMobile] = useState(false);
  const [matchedMasterProfile, setMatchedMasterProfile] = useState<{ name: string; age: string; mobile: string } | null>(null);
  
  // Group tracking states
  const [groups, setGroups] = useState<any[]>([]);
  
  // Hierarchy tracking states
  const [roots, setRoots] = useState<any[]>([]);
  const [allRootsLevel1, setAllRootsLevel1] = useState<any[]>([]);
  const [allRootsLevel2, setAllRootsLevel2] = useState<any[]>([]);
  const [allRootsPlayers, setAllRootsPlayers] = useState<any[]>([]);

  // Editing state
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', age: '', mobile: '', gender: 'Male', chapterId: '', groupId: '' });
  const [playerToDelete, setPlayerToDelete] = useState<any | null>(null);

  // Master Global Registry state
  const [masterRegistry, setMasterRegistry] = useState<any[]>([]);

  // Fetch Master Registry profiles
  useEffect(() => {
    const q = query(collection(db, 'players'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMasterRegistry(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Error loading master players in PlayerManager:", err));
    return () => unsubscribe();
  }, []);

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

  // Real-time lookup of master player profile by mobile number (debounced)
  useEffect(() => {
    const cleaned = player.mobile.trim().replace(/[^0-9+]/g, '');
    if (cleaned.length < 5) {
      setMatchedMasterProfile(null);
      return;
    }

    // Skip if we already matched this exact number to prevent unnecessary loops
    if (matchedMasterProfile && matchedMasterProfile.mobile === cleaned) {
      return;
    }

    const delayDebounce = setTimeout(async () => {
      if (!linkWithGlobal) {
        setMatchedMasterProfile(null);
        return;
      }
      setIsSearchingMobile(true);
      try {
        let data = null;
        const docRef = doc(db, 'players', cleaned);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          data = docSnap.data();
        } else {
          // Fallback: Query collection by 'mobile' field
          const qGlobal = query(collection(db, 'players'), where('mobile', '==', cleaned), limit(1));
          const qSnap = await getDocs(qGlobal);
          if (!qSnap.empty) {
            data = qSnap.docs[0].data();
          }
        }

        if (data) {
          const master = {
            name: data.name || '',
            age: data.age !== undefined && data.age !== null ? String(data.age) : '',
            mobile: cleaned,
            l2: data.l2 || ''
          };
          setMatchedMasterProfile(master);
          
          // Auto-fill form fields if they are currently blank
          setPlayer(prev => ({
            ...prev,
            name: prev.name.trim() === '' ? master.name : prev.name,
            age: prev.age.trim() === '' ? master.age : prev.age,
            gender: data.gender || prev.gender || 'Male'
          }));

          // Auto-select the Level 2 Chapter/Category if matched!
          if (master.l2) {
            const matchedChapter = allRootsLevel2.find(c => c.name.toLowerCase() === master.l2.toLowerCase());
            if (matchedChapter) {
              setSelectedChapterId(matchedChapter.id);
            }
          }
        } else {
          setMatchedMasterProfile(null);
        }
      } catch (err) {
        console.error("Error looking up master profile:", err);
      } finally {
        setIsSearchingMobile(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounce);
  }, [player.mobile, linkWithGlobal]);

  // 1b. Fetch Groups list
  useEffect(() => {
    if (!tournamentId) return;
    const q = query(collection(db, `tournaments/${tournamentId}/groups`));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        const uniqueGroups: any[] = [];
        const seenNames = new Set<string>();
        fetchedGroups.forEach(g => {
          const nameLower = (g.name || '').trim().toLowerCase();
          if (nameLower && !seenNames.has(nameLower)) {
            seenNames.add(nameLower);
            uniqueGroups.push({
              id: g.id,
              name: g.name,
              playerIds: g.playerIds || []
            });
          } else if (nameLower) {
            // Merge playerIds to keep assignments accurate
            const existing = uniqueGroups.find(x => x.name.trim().toLowerCase() === nameLower);
            if (existing) {
              existing.playerIds = Array.from(new Set([
                ...(existing.playerIds || []),
                ...(g.playerIds || [])
              ]));
            }
          }
        });
        setGroups(uniqueGroups);
      },
      (error) => console.error("Error fetching groups:", error)
    );
    return () => unsubscribe();
  }, [tournamentId]);

  // Fetch complete master hierarchy from the high-performance cached API endpoint
  const loadHierarchy = async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/hierarchy`);
      if (!res.ok) throw new Error('Failed to load hierarchy');
      const data = await res.json();
      setRoots(data.roots || []);
      setAllRootsLevel1(data.level1 || []);
      setAllRootsLevel2(data.level2 || []);
      setAllRootsPlayers(data.players || []);
    } catch (err) {
      console.error("Error loading hierarchy in PlayerManager:", err);
    }
  };

  useEffect(() => {
    loadHierarchy();
  }, [tournamentId]);

  // Create player + optional assignment
  const handleAdd = async () => {
    if (!player.name.trim()) return;
    
    const mobileTrimmed = player.mobile.trim().replace(/[^0-9+]/g, '');
    if (!mobileTrimmed) {
      alert("Mobile number is required as a unique player ID.");
      return;
    }

    // Uniqueness validation
    const isMobileDuplicate = players.some(p => p.mobile && p.mobile.trim().replace(/[^0-9+]/g, '') === mobileTrimmed);
    if (isMobileDuplicate) {
      alert("This mobile number is already registered for another player. Mobile numbers must be unique.");
      return;
    }

    let partnerMobileCleaned = "";
    if (isDoublesMode) {
      if (!partnerName.trim() || !partnerMobile.trim()) {
        alert("Partner details are required for doubles registration.");
        return;
      }
      partnerMobileCleaned = partnerMobile.trim().replace(/[^0-9+]/g, '');
      if (!partnerMobileCleaned) {
        alert("Partner mobile number is required as a unique player ID.");
        return;
      }
      if (partnerMobileCleaned === mobileTrimmed) {
        alert("The player and partner cannot have the same mobile number.");
        return;
      }
      const isPartnerMobileDuplicate = players.some(p => p.mobile && p.mobile.trim().replace(/[^0-9+]/g, '') === partnerMobileCleaned);
      if (isPartnerMobileDuplicate) {
        alert(`The partner's mobile number (${partnerMobileCleaned}) is already registered in this tournament. Mobile numbers must be unique.`);
        return;
      }
    }

    try {
      // Helper to add a player
      const addPlayerToDb = async (pName: string, pAge: string, pMobile: string, pGender: string, pEmail?: string, pairId?: string) => {
        const pMobileTrimmed = pMobile.trim().replace(/[^0-9+]/g, '');
        let playerChapterId = selectedChapterId;
        
        // Auto-connect with master registry L2
        let matchedGlobalL2Name = "";
        let globalData = null;
        const globalPlayerSnap = await getDoc(doc(db, 'players', pMobileTrimmed));
        if (globalPlayerSnap.exists()) {
          globalData = globalPlayerSnap.data();
        } else {
          const qGlobal = query(collection(db, 'players'), where('mobile', '==', pMobileTrimmed), limit(1));
          const qSnap = await getDocs(qGlobal);
          if (!qSnap.empty) {
            globalData = qSnap.docs[0].data();
          }
        }

        if (globalData) {
          if (globalData.l2) {
            matchedGlobalL2Name = globalData.l2;
            if (!playerChapterId) {
              const globalL2Normalized = globalData.l2.trim().toLowerCase();
              const matchingChapter = allRootsLevel2.find(c => c.name.trim().toLowerCase() === globalL2Normalized);
              if (matchingChapter) {
                playerChapterId = matchingChapter.id;
              } else {
                console.log("No matching chapter found for:", globalData.l2);
              }
            }
          }
        }

        const playersCol = collection(db, `tournaments/${tournamentId}/players`);
        const pRef = doc(playersCol);
        const pId = pRef.id;

        await setDoc(pRef, {
          name: pName.trim(),
          age: pAge ? Number(pAge) : '',
          mobile: pMobileTrimmed,
          email: pEmail || '',
          gender: pGender,
          pairId: pairId || null,
          createdAt: new Date().toISOString()
        });

        // Resolve chapter name for global player sync
        let finalL2Name = matchedGlobalL2Name;
        if (playerChapterId) {
          const chapter = allRootsLevel2.find(c => c.id === playerChapterId);
          if (chapter) {
            finalL2Name = chapter.name;
            // Write tournament-specific assignment linking to the master hierarchy
            const newRosterRef = doc(db, `tournaments/${tournamentId}/roots/${chapter.rootId}/level1/${chapter.level1Id}/level2/${chapter.id}/players`, pId);
            await setDoc(newRosterRef, {
              name: pName.trim(),
              age: pAge ? Number(pAge) : '',
              mobile: pMobileTrimmed,
              gender: pGender || 'Male',
              assignedAt: new Date().toISOString()
            });
          }
        }

        const globalPlayerRef = doc(db, 'players', pMobileTrimmed);
        await setDoc(globalPlayerRef, {
          name: pName.trim(),
          age: pAge ? Number(pAge) : '',
          mobile: pMobileTrimmed,
          email: pEmail || '',
          gender: pGender,
          ...(finalL2Name ? { l2: finalL2Name } : {}),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return { id: pId, name: pName.trim(), gender: pGender, pairId: pairId || null };
      };

      const pairId = isDoublesMode ? `pair_${Date.now()}` : undefined;
      const player1 = await addPlayerToDb(player.name, player.age, mobileTrimmed, player.gender || 'Male', player.email, pairId);
      let playersAdded = [player1];

      if (isDoublesMode) {
        const player2 = await addPlayerToDb(partnerName, '', partnerMobileCleaned, partnerGender || 'Female', undefined, pairId);
        playersAdded.push(player2);
      }

      // Assign to group
      if (selectedGroupId) {
        const targetGroup = groups.find(g => g.id === selectedGroupId);
        if (targetGroup) {
          const updatedPlayerIds = [...(targetGroup.playerIds || []), ...playersAdded.map(p => p.id)];
          await updateDoc(doc(db, `tournaments/${tournamentId}/groups`, targetGroup.id), {
            playerIds: updatedPlayerIds
          });
        }
      }

      setPlayer({ name: '', age: '', mobile: '', gender: 'Male', email: '' });
      setPartnerName('');
      setPartnerMobile('');
      setPartnerGender('Female');
      setSelectedChapterId('');
      setSelectedGroupId('');
      setMatchedMasterProfile(null);
      await loadHierarchy();
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
      await loadHierarchy();
    } catch (err: any) {
      console.error(err);
      alert("Failed to delete player: " + err?.message);
    }
  };

  // Manual Pair Binder handlers
  const handleBindPair = async () => {
    if (!binderPlayer1Id || !binderPlayer2Id) {
      alert("Please select both players to create a pair.");
      return;
    }
    if (binderPlayer1Id === binderPlayer2Id) {
      alert("You cannot pair a player with themselves.");
      return;
    }

    setIsBinding(true);
    try {
      const generatedPairId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      const p1Ref = doc(db, `tournaments/${tournamentId}/players`, binderPlayer1Id);
      const p2Ref = doc(db, `tournaments/${tournamentId}/players`, binderPlayer2Id);

      await updateDoc(p1Ref, { pairId: generatedPairId });
      await updateDoc(p2Ref, { pairId: generatedPairId });

      setBinderPlayer1Id('');
      setBinderPlayer2Id('');
      alert("Success! Players successfully linked as a doubles pair.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to bind pair: " + err?.message);
    } finally {
      setIsBinding(false);
    }
  };

  const handleUnlinkPair = async (pairId: string) => {
    if (!window.confirm("Are you sure you want to unlink this pair? Both players will become individual entries.")) {
      return;
    }
    try {
      const paired = players.filter(p => p.pairId === pairId);
      for (const p of paired) {
        await updateDoc(doc(db, `tournaments/${tournamentId}/players`, p.id), { pairId: null });
      }
      alert("Success! Players successfully unlinked.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to unlink pair: " + err?.message);
    }
  };

  // Save edit changes
  const handleSaveEdit = async () => {
    if (!editingPlayerId || !editForm.name.trim()) return;

    const mobileTrimmed = editForm.mobile.trim().replace(/[^0-9+]/g, '');
    if (!mobileTrimmed) {
      alert("Mobile number is required as a unique player ID.");
      return;
    }

    // Uniqueness validation
    const isMobileDuplicate = players.some(p => p.id !== editingPlayerId && p.mobile && p.mobile.trim().replace(/[^0-9+]/g, '') === mobileTrimmed);
    if (isMobileDuplicate) {
      alert("This mobile number is already registered for another player. Mobile numbers must be unique.");
      return;
    }

    try {
      const oldPlayer = players.find(p => p.id === editingPlayerId);
      const oldMobileCleaned = oldPlayer?.mobile?.trim().replace(/[^0-9+]/g, '');

      const playerRef = doc(db, `tournaments/${tournamentId}/players`, editingPlayerId);
      const updatedData = {
        name: editForm.name.trim(),
        age: editForm.age ? Number(editForm.age) : '',
        mobile: mobileTrimmed,
        gender: editForm.gender || 'Male'
      };
      
      // Update main player doc
      await updateDoc(playerRef, updatedData);

      // Sync edit to global master players registry (keyed by mobile)
      const globalPlayerRef = doc(db, 'players', mobileTrimmed);
      let globalL2 = "";
      if (editForm.chapterId) {
        const chapter = allRootsLevel2.find(c => c.id === editForm.chapterId);
        if (chapter) {
          globalL2 = chapter.name;
        }
      }

      await setDoc(globalPlayerRef, {
        name: updatedData.name,
        age: updatedData.age,
        mobile: updatedData.mobile,
        gender: updatedData.gender,
        ...(globalL2 ? { l2: globalL2 } : {}),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Clean up old global profile if the mobile number changed
      if (oldMobileCleaned && oldMobileCleaned !== mobileTrimmed) {
        await deleteDoc(doc(db, 'players', oldMobileCleaned));
      }

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
              mobile: updatedData.mobile,
              gender: updatedData.gender,
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
            age: updatedData.age,
            mobile: updatedData.mobile,
            gender: updatedData.gender
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

      await loadHierarchy();
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
      mobile: String(p.mobile || ''),
      gender: p.gender || 'Male',
      chapterId: activeAssignment ? activeAssignment.level2Id : '',
      groupId: playerGroup ? playerGroup.id : ''
    });
  };

  // Filter & Search
  const filteredPlayersList = players.filter(p => {
    const q = searchQuery.toLowerCase();
    const assignedGroup = groups.find(g => g.playerIds?.includes(p.id));
    const assignment = allRootsPlayers.find(ap => ap.id === p.id);
    const l2Name = assignment ? assignment.level2Name?.toLowerCase() : '';
    
    return p.name.toLowerCase().includes(q) || 
           (p.mobile && p.mobile.toLowerCase().includes(q)) ||
           (assignedGroup && assignedGroup.name.toLowerCase().includes(q)) ||
           (l2Name && l2Name.includes(q));
  });

  const downloadPlayersPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Badminton Tournament Players Pool", 14, 22);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Total Players: ${players.length}`, 14, 34);
    
    // Draw horizontal line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 38, 196, 38);
    
    let y = 46;
    doc.setFontSize(10);
    
    // Headers
    doc.setFont("helvetica", "bold");
    doc.text("#", 14, y);
    doc.text("Name", 22, y);
    doc.text("Gender", 75, y);
    doc.text("Age", 95, y);
    doc.text("Phone", 110, y);
    doc.text("Group", 140, y);
    doc.text("Chapter (L2)", 170, y);
    
    doc.line(14, y + 2, 196, y + 2);
    y += 8;
    
    doc.setFont("helvetica", "normal");
    filteredPlayersList.forEach((p, index) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
        doc.setFont("helvetica", "bold");
        doc.text("#", 14, y);
        doc.text("Name", 22, y);
        doc.text("Gender", 75, y);
        doc.text("Age", 95, y);
        doc.text("Phone", 110, y);
        doc.text("Group", 140, y);
        doc.text("Chapter (L2)", 170, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 8;
        doc.setFont("helvetica", "normal");
      }
      
      const assignedGroup = groups.find(g => g.playerIds?.includes(p.id));
      const assignment = allRootsPlayers.find(ap => ap.id === p.id);
      
      const numStr = String(index + 1);
      const nameStr = p.name || "N/A";
      const genderStr = p.gender || "Male";
      const ageStr = p.age ? String(p.age) : "-";
      const phoneStr = p.mobile || "-";
      const groupStr = assignedGroup ? assignedGroup.name : "-";
      const chapterStr = assignment ? assignment.chapterName : "-";
      
      doc.text(numStr, 14, y);
      // Truncate name if too long
      const truncatedName = nameStr.length > 24 ? nameStr.substring(0, 22) + ".." : nameStr;
      doc.text(truncatedName, 22, y);
      doc.text(genderStr, 75, y);
      doc.text(ageStr, 95, y);
      doc.text(phoneStr, 110, y);
      doc.text(groupStr, 140, y);
      
      const truncatedChapter = chapterStr.length > 12 ? chapterStr.substring(0, 10) + ".." : chapterStr;
      doc.text(truncatedChapter, 170, y);
      
      y += 7;
    });
    
    doc.save("players_list.pdf");
  };

  // Sort chapters for dropdown selection
  const sortedChapters = [...allRootsLevel2].sort((a, b) => {
    const rootCompare = (a.rootName || '').localeCompare(b.rootName || '');
    if (rootCompare !== 0) return rootCompare;
    const l1Compare = (a.level1Name || '').localeCompare(b.level1Name || '');
    if (l1Compare !== 0) return l1Compare;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Fuzzy match pasted category name to database level 2 chapters
  const matchChapter = (pastedL2: string) => {
    if (!pastedL2) return "";
    const cleaned = pastedL2.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleaned) return "";
    
    // Try exact match on cleaned combined string: rootName + level1Name + name
    for (const c of sortedChapters) {
      const combined = `${c.rootName || ''} ${c.level1Name || ''} ${c.name || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (combined === cleaned) return c.id;
    }
    
    // Try exact match of c.name (Chapter name itself)
    for (const c of sortedChapters) {
      const cleanName = (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanName === cleaned) return c.id;
    }

    // Try substring match on cleaned combined string
    for (const c of sortedChapters) {
      const combined = `${c.rootName || ''} ${c.level1Name || ''} ${c.name || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (combined.includes(cleaned) || cleaned.includes(combined)) return c.id;
    }

    // Try segment/contains matching
    for (const c of sortedChapters) {
      const cleanL2Name = (c.name || '').toLowerCase();
      const cleanL1Name = (c.level1Name || '').toLowerCase();
      const cleanRootName = (c.rootName || '').toLowerCase();
      const pastedLower = pastedL2.toLowerCase();
      if (
        pastedLower.includes(cleanL2Name) && 
        (pastedLower.includes(cleanL1Name) || cleanL1Name === 'solo' || cleanL1Name === 'doubles')
      ) {
        return c.id;
      }
    }

    return "";
  };

  // Fuzzy match pasted group/team name to database groups
  const matchGroup = (pastedGrp: string) => {
    if (!pastedGrp) return "";
    const cleaned = pastedGrp.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleaned) return "";

    for (const g of groups) {
      const cleanName = (g.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanName === cleaned) return g.id;
    }

    for (const g of groups) {
      const cleanName = (g.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanName.includes(cleaned) || cleaned.includes(cleanName)) return g.id;
    }

    return "";
  };

  // Parse Excel text (Tab-separated) or CSV (Comma-separated)
  const parseBulkData = () => {
    if (!bulkText.trim()) {
      alert("Please paste some Excel data or upload a file first.");
      return;
    }

    const lines = bulkText.split(/\r?\n/);
    const result: any[] = [];
    let isFirstLineHeader = false;

    // Check if first line contains common keywords suggesting header row
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (
        firstLine.includes('name') || 
        firstLine.includes('age') || 
        firstLine.includes('phone') || 
        firstLine.includes('mobile') || 
        firstLine.includes('group') || 
        firstLine.includes('team')
      ) {
        isFirstLineHeader = true;
      }
    }

    const seenMobilesInPasted = new Set<string>();
    const startIndex = isFirstLineHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Excel uses Tabs. Standard CSV uses Comma or Semicolon
      let cols = line.split('\t');
      if (cols.length <= 1) {
        cols = line.split(',');
      }
      if (cols.length <= 1) {
        cols = line.split(';');
      }

      // Strip surrounding quotes
      const cleanCols = cols.map(c => {
        let val = c.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1).trim();
        }
        return val;
      });

      if (cleanCols.length === 0 || cleanCols.every(c => !c)) continue;

      const createPlayerEntry = (name: string, age: string, mobile: string, originalGroup: string, pairTeam: string = "", pairId?: string) => {
        const mobileCleanedInput = mobile.replace(/[^0-9+]/g, '').trim();
        let mobileCleaned = mobileCleanedInput;
        let nameTrimmed = name.trim();

        // Check master global registry for automatic lookup & auto-fill!
        let isAutoFilledFromGlobal = false;
        let matchedGlobalL2Name = "";
        
        // 1. Try lookup by mobile first
        let matchedMaster = null;
        if (mobileCleaned) {
          matchedMaster = masterRegistry.find(mr => mr.mobile === mobileCleaned || mr.id === mobileCleaned);
        }
        // 2. Try lookup by name if lookup by mobile failed or is not possible
        if (!matchedMaster && nameTrimmed) {
          matchedMaster = masterRegistry.find(mr => mr.name && mr.name.toLowerCase() === nameTrimmed.toLowerCase());
        }
        
        if (matchedMaster) {
          if (!nameTrimmed && matchedMaster.name) {
            nameTrimmed = matchedMaster.name;
            isAutoFilledFromGlobal = true;
          }
          if (!mobileCleaned && matchedMaster.mobile) {
            mobileCleaned = matchedMaster.mobile;
            isAutoFilledFromGlobal = true;
          }
          if ((!age || age.trim() === '' || age.trim() === 'undefined' || age.trim() === 'null') && matchedMaster.age !== undefined && matchedMaster.age !== null) {
            age = String(matchedMaster.age);
            isAutoFilledFromGlobal = true;
          }
          if (matchedMaster.l2) {
            matchedGlobalL2Name = matchedMaster.l2;
          }
        }

        // Row-level validation
        let isValid = true;
        let errorMsg = "";

        if (!nameTrimmed) {
          isValid = false;
          errorMsg = "Name is required.";
        } else if (!mobileCleaned && !isDoublesImport) {
          isValid = false;
          errorMsg = "Mobile number is required.";
        } else if (seenMobilesInPasted.has(mobileCleaned) && mobileCleaned) {
          isValid = false;
          errorMsg = "Duplicate phone number in pasted list.";
        } else if (!isDoublesImport) {
          const isDbDuplicate = players.some(p => p.mobile && p.mobile.trim().replace(/[^0-9+]/g, '') === mobileCleaned);
          if (isDbDuplicate) {
            isValid = false;
            errorMsg = "Phone number already exists in database.";
          }
        }

        if (mobileCleaned) {
          seenMobilesInPasted.add(mobileCleaned);
        }

        // Auto-fuzzy match group
        let matchedGroupId = matchGroup(originalGroup);

        // Auto-fuzzy match chapter from global registry
        let matchedChapterId = "";
        let matchedChapterName = "";
        if (matchedGlobalL2Name) {
          const chapter = allRootsLevel2.find(c => c.name.toLowerCase() === matchedGlobalL2Name.toLowerCase());
          if (chapter) {
            matchedChapterId = chapter.id;
            matchedChapterName = chapter.name;
          }
        }

        // If the pasted column matches an L2 chapter, let's assign it as the matchedChapterId!
        if (!matchedChapterId && originalGroup) {
          const chapterIdFromCol = matchChapter(originalGroup);
          if (chapterIdFromCol) {
            const chapter = allRootsLevel2.find(c => c.id === chapterIdFromCol);
            if (chapter) {
              matchedChapterId = chapter.id;
              matchedChapterName = chapter.name;
              // Clear matchedGroupId so it doesn't get assigned as a group
              matchedGroupId = "";
            }
          }
        }

        return {
          tempId: `parsed-${Date.now()}-${Math.random()}`,
          name: nameTrimmed,
          age: age ? String(Number(age) || '') : '',
          mobile: mobileCleaned,
          originalGroup: originalGroup,
          pairTeam: pairTeam,
          groupId: matchedGroupId,
          chapterId: matchedChapterId,
          matchedChapterName,
          isValid,
          errorMsg,
          isAutoFilledFromGlobal,
          pairId: pairId || null
        };
      };
      
      let name = "";
      let age = "";
      let mobile = "";
      let originalGroup = "";

      if (isDoublesImport) {
        // Doubles format: Name1 [sep] Name2 [sep] TeamName
        const name1 = cleanCols[0] || "";
        const name2 = cleanCols[1] || "";
        originalGroup = cleanCols[2] || "";
        const importPairId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        // Add Player 1
        result.push(createPlayerEntry(name1, "", "", originalGroup, originalGroup, importPairId));
        // Add Player 2
        result.push(createPlayerEntry(name2, "", "", originalGroup, originalGroup, importPairId));
        continue;
      }

      if (isFirstLineHeader) {
        const headers = lines[0].toLowerCase().split(/\t|,|;/).map(h => h.trim().replace(/"/g, ''));
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('player'));
        const ageIdx = headers.findIndex(h => h.includes('age'));
        const mobileIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('tel'));
        
        // Identify Group (Team) Index
        let grpIdx = headers.findIndex(h => h.includes('group') || h.includes('team') || h.includes('club'));

        name = nameIdx !== -1 ? cleanCols[nameIdx] || "" : cleanCols[0] || "";
        age = ageIdx !== -1 ? cleanCols[ageIdx] || "" : cleanCols[1] || "";
        mobile = mobileIdx !== -1 ? cleanCols[mobileIdx] || "" : cleanCols[2] || "";
        originalGroup = grpIdx !== -1 ? cleanCols[grpIdx] || "" : "";
      } else {
        // Fallback positional values: Name (0), Age (1), Mobile (2), Group (3)
        name = cleanCols[0] || "";
        age = cleanCols[1] || "";
        mobile = cleanCols[2] || "";
        originalGroup = cleanCols[3] || "";
      }

      const mobileCleanedInput = mobile.replace(/[^0-9+]/g, '').trim();
      let mobileCleaned = mobileCleanedInput;
      let nameTrimmed = name.trim();

      // Check master global registry for automatic lookup & auto-fill!
      let isAutoFilledFromGlobal = false;
      let matchedGlobalL2Name = "";
      
      // 1. Try lookup by mobile first
      let matchedMaster = null;
      if (mobileCleaned) {
        matchedMaster = masterRegistry.find(mr => mr.mobile === mobileCleaned || mr.id === mobileCleaned);
      }
      // 2. Try lookup by name if lookup by mobile failed or is not possible
      if (!matchedMaster && nameTrimmed) {
        matchedMaster = masterRegistry.find(mr => mr.name && mr.name.toLowerCase() === nameTrimmed.toLowerCase());
      }
      
      if (matchedMaster) {
        if (!nameTrimmed && matchedMaster.name) {
          nameTrimmed = matchedMaster.name;
          isAutoFilledFromGlobal = true;
        }
        if (!mobileCleaned && matchedMaster.mobile) {
          mobileCleaned = matchedMaster.mobile;
          isAutoFilledFromGlobal = true;
        }
        if ((!age || age.trim() === '' || age.trim() === 'undefined' || age.trim() === 'null') && matchedMaster.age !== undefined && matchedMaster.age !== null) {
          age = String(matchedMaster.age);
          isAutoFilledFromGlobal = true;
        }
        if (matchedMaster.l2) {
          matchedGlobalL2Name = matchedMaster.l2;
        }
      }

      // Row-level validation
      let isValid = true;
      let errorMsg = "";

      if (!nameTrimmed) {
        isValid = false;
        errorMsg = "Name is required.";
      } else if (!mobileCleaned) {
        isValid = false;
        errorMsg = "Mobile number is required.";
      } else if (seenMobilesInPasted.has(mobileCleaned)) {
        isValid = false;
        errorMsg = "Duplicate phone number in pasted list.";
      } else {
        const isDbDuplicate = players.some(p => p.mobile && p.mobile.trim().replace(/[^0-9+]/g, '') === mobileCleaned);
        if (isDbDuplicate) {
          isValid = false;
          errorMsg = "Phone number already exists in database.";
        }
      }

      if (mobileCleaned) {
        seenMobilesInPasted.add(mobileCleaned);
      }

      // Auto-fuzzy match group
      let matchedGroupId = matchGroup(originalGroup);

      // Auto-fuzzy match chapter from global registry
      let matchedChapterId = "";
      let matchedChapterName = "";
      if (matchedGlobalL2Name) {
        const chapter = allRootsLevel2.find(c => c.name.toLowerCase() === matchedGlobalL2Name.toLowerCase());
        if (chapter) {
          matchedChapterId = chapter.id;
          matchedChapterName = chapter.name;
        }
      }

      // If the pasted column matches an L2 chapter, let's assign it as the matchedChapterId!
      if (!matchedChapterId && originalGroup) {
        const chapterIdFromCol = matchChapter(originalGroup);
        if (chapterIdFromCol) {
          const chapter = allRootsLevel2.find(c => c.id === chapterIdFromCol);
          if (chapter) {
            matchedChapterId = chapter.id;
            matchedChapterName = chapter.name;
            // Clear matchedGroupId so it doesn't get assigned as a group
            matchedGroupId = "";
          }
        }
      }

      result.push({
        tempId: `parsed-${i}-${Date.now()}`,
        name: nameTrimmed,
        age: age ? String(Number(age) || '') : '',
        mobile: mobileCleaned,
        originalGroup: originalGroup,
        groupId: matchedGroupId,
        chapterId: matchedChapterId,
        matchedChapterName: matchedChapterName,
        isAutoFilledFromGlobal,
        isValid,
        errorMsg
      });
    }

    if (result.length === 0) {
      alert("Could not extract any rows from pasted text. Please verify formatting.");
      return;
    }

    const seenMobiles = new Set();
    const hasDuplicates = result.some(p => {
      if (p.mobile && seenMobiles.has(p.mobile)) return true;
      if (p.mobile) seenMobiles.add(p.mobile);
      return false;
    });

    if (hasDuplicates) {
      alert("Duplicate players detected in the pasted list.");
    }

    setParsedPlayers(result);
  };

  // Drag and drop spreadsheet/CSV files handlers
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readAndSetFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readAndSetFile(file);
    }
  };

  const readAndSetFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setBulkText(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  // Save bulk parsed players directly to Firestore
  const handleImportSubmit = async () => {
    const validPlayers = parsedPlayers.filter(p => p.isValid);
    if (validPlayers.length === 0) {
      alert("No valid player profiles to import. Please check validation status.");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;
    const total = validPlayers.length;
    const tempGroups = [...groups];

    for (let idx = 0; idx < total; idx++) {
      const pData = validPlayers[idx];
      try {
        const playersCol = collection(db, `tournaments/${tournamentId}/players`);
        const newPlayerRef = doc(playersCol);
        const newId = newPlayerRef.id;

        const playerProfile: any = {
          name: pData.name,
          age: pData.age ? Number(pData.age) : '',
          mobile: pData.mobile,
          createdAt: new Date().toISOString()
        };

        if (pData.pairId) {
          playerProfile.pairId = pData.pairId;
        }

        // Create player profile
        await setDoc(newPlayerRef, playerProfile);

        // Nested Chapter L2 Assignment
        let finalChapterId = pData.chapterId || selectedChapterId;
        let finalL2Name = "";
        if (finalChapterId) {
          const chapter = allRootsLevel2.find(c => c.id === finalChapterId);
          if (chapter) {
            finalL2Name = chapter.name;
            const rosterRef = doc(db, `tournaments/${tournamentId}/roots/${chapter.rootId}/level1/${chapter.level1Id}/level2/${chapter.id}/players`, newId);
            await setDoc(rosterRef, {
              name: playerProfile.name,
              age: playerProfile.age,
              mobile: playerProfile.mobile,
              assignedAt: new Date().toISOString()
            });
          }
        }

        // Sync to global master players registry (keyed by mobile)
        if (playerProfile.mobile) {
          const globalPlayerRef = doc(db, 'players', playerProfile.mobile);
          await setDoc(globalPlayerRef, {
            name: playerProfile.name,
            age: playerProfile.age,
            mobile: playerProfile.mobile,
            ...(finalL2Name ? { l2: finalL2Name } : {}),
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }

        // Group/Team Assignment
        let finalGroupId = pData.groupId;
        
        // Check if the originalGroup string actually matches any L2 chapter
        const isOriginalGroupAL2Chapter = finalChapterId && allRootsLevel2.some(
          c => c.id === finalChapterId && c.name.toLowerCase() === pData.originalGroup?.trim().toLowerCase()
        );

        if (!finalGroupId && pData.originalGroup && !isOriginalGroupAL2Chapter) {
          const groupNameTrimmed = pData.originalGroup.trim();
          let matchedGroup = tempGroups.find(g => (g.name || '').trim().toLowerCase() === groupNameTrimmed.toLowerCase());
          if (matchedGroup) {
            finalGroupId = matchedGroup.id;
          } else {
            // Auto-create new group in Firestore!
            const groupsCol = collection(db, `tournaments/${tournamentId}/groups`);
            const newGroupRef = doc(groupsCol);
            await setDoc(newGroupRef, {
              name: groupNameTrimmed,
              playerIds: []
            });
            const newGroupObj = { id: newGroupRef.id, name: groupNameTrimmed, playerIds: [] };
            tempGroups.push(newGroupObj);
            finalGroupId = newGroupRef.id;
          }
        }

        // Fallback to general dropdown selection if no row-level group matches
        if (!finalGroupId && selectedGroupId) {
          finalGroupId = selectedGroupId;
        }

        if (finalGroupId) {
          const targetGroup = tempGroups.find(g => g.id === finalGroupId);
          if (targetGroup) {
            const updatedPlayerIds = [...(targetGroup.playerIds || []), newId];
            await updateDoc(doc(db, `tournaments/${tournamentId}/groups`, targetGroup.id), {
              playerIds: updatedPlayerIds
            });
            // Reflect locally for next loop if same group is updated
            targetGroup.playerIds = updatedPlayerIds;
          }
        }

        successCount++;
      } catch (err) {
        console.error(`Failed to import player profile ${pData.name}:`, err);
      }
      setImportProgress(Math.round(((idx + 1) / total) * 100));
    }

    await loadHierarchy();
    setIsImporting(false);
    alert(`Bulk import completed! Successfully registered ${successCount} of ${total} player profiles.`);
    setParsedPlayers([]);
    setBulkText('');
    setImportMode('single');
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-100 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <User className="text-indigo-600 w-7 h-7" /> Manage Tournament Players
            {!isAdmin && (
              <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                👁️ Read-Only
              </span>
            )}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Add, edit, delete, and directly assign players to Chapters (Level 2 rosters).</p>
        </div>
        
        {/* Toggle between Single, Pairs, and Bulk Excel Imports - Admin only */}
        {isAdmin && (
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 self-stretch sm:self-auto">
            <button
              onClick={() => { setImportMode('single'); setParsedPlayers([]); }}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                importMode === 'single'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Single Profile
            </button>
            <button
              onClick={() => { setImportMode('pairs'); setParsedPlayers([]); }}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                importMode === 'pairs'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" /> Manual Pair Binder
            </button>
            <button
              onClick={() => { setImportMode('bulk'); setParsedPlayers([]); }}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                importMode === 'bulk'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Bulk Excel Import
            </button>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
          ⚠️ Read-Only Mode: Only administrators can add, edit, or delete player registrations.
        </div>
      )}

      {/* -------------------- SINGLE PLAYER FORM (Admin only) -------------------- */}
      {isAdmin && importMode === 'single' && (
        <div className="p-5 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 justify-between">
            <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-indigo-500" /> Add New Player Profile</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={linkWithGlobal} onChange={(e) => setLinkWithGlobal(e.target.checked)} />
                Link with Global Registry
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDoublesMode} onChange={(e) => setIsDoublesMode(e.target.checked)} />
                Doubles Registration
              </label>
            </div>
          </h3>
          
          <div className="space-y-4">
            {/* Primary Player Block */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-500">{isDoublesMode ? 'Primary Player Name' : 'Player Name'}</label>
                <input 
                  value={player.name} 
                  onChange={(e) => setPlayer({...player, name: e.target.value})} 
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
                  placeholder="e.g. John Doe" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Mobile</label>
                <input 
                  value={player.mobile} 
                  onChange={(e) => setPlayer({...player, mobile: e.target.value})} 
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
                  placeholder="e.g. 9876543210" 
                  type="tel"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Email</label>
                <input 
                  value={player.email} 
                  onChange={(e) => setPlayer({...player, email: e.target.value})} 
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
                  placeholder="e.g. john@example.com" 
                  type="email"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Gender</label>
                <select 
                  value={player.gender} 
                  onChange={(e) => setPlayer({...player, gender: e.target.value})} 
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            {/* Partner Block (Doubles Only) */}
            {isDoublesMode && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-2 border-t border-dashed border-slate-200">
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-xs font-bold text-slate-500">Partner Player Name</label>
                  <input 
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
                    placeholder="e.g. Jane Smith" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Partner Mobile</label>
                  <input 
                    value={partnerMobile}
                    onChange={(e) => setPartnerMobile(e.target.value)}
                    className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
                    placeholder="e.g. 9876543211" 
                    type="tel"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Partner Gender</label>
                  <select 
                    value={partnerGender} 
                    onChange={(e) => setPartnerGender(e.target.value)} 
                    className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
            )}

            {/* Metadata (Age + Add button) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Age</label>
                <input 
                  value={player.age} 
                  onChange={(e) => setPlayer({...player, age: e.target.value})} 
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition" 
                  placeholder="e.g. 25" 
                  type="number"
                />
              </div>
              <div className="space-y-1">
                <button 
                  onClick={handleAdd} 
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition text-sm shadow-sm hover:shadow flex items-center justify-center gap-1.5 h-[42px]"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
          </div>
          
          <div className="min-h-[18px] flex flex-wrap gap-1 mt-1">
            {isSearchingMobile && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 animate-pulse">
                🔍 Looking up master registry...
              </span>
            )}
            {!isSearchingMobile && matchedMasterProfile && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-extrabold animate-fade-in">
                👤 Profile Found: {matchedMasterProfile.name} ({matchedMasterProfile.age || 'No Age'})
              </span>
            )}
            {!isSearchingMobile && player.mobile.trim().replace(/[^0-9+]/g, '').length >= 5 && !matchedMasterProfile && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-extrabold animate-fade-in">
                🆕 New profile (will register globally)
              </span>
            )}
            {!isSearchingMobile && player.mobile.trim().replace(/[^0-9+]/g, '').length >= 5 && players.some(p => p.mobile && p.mobile.trim().replace(/[^0-9+]/g, '') === player.mobile.trim().replace(/[^0-9+]/g, '')) && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-extrabold animate-fade-in w-full">
                ⚠️ Already in this tournament
              </span>
            )}
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
      )}

      {/* -------------------- MANUAL PAIR BINDER (Admin only) -------------------- */}
      {isAdmin && importMode === 'pairs' && (
        <div className="p-6 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" /> Doubles Pair Binder
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Bind two individual players together to play as a team/pair in doubles category matches.</p>
            </div>
          </div>

          {/* Binding Form */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/60 shadow-xs space-y-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Link Two Players into a New Pair</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500">Player 1</label>
                <select
                  value={binderPlayer1Id}
                  onChange={(e) => setBinderPlayer1Id(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
                >
                  <option value="">-- Choose First Player --</option>
                  {players
                    .filter(p => !p.pairId)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.mobile ? `(${p.mobile})` : ''}</option>
                    ))
                  }
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500">Player 2</label>
                <select
                  value={binderPlayer2Id}
                  onChange={(e) => setBinderPlayer2Id(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
                  disabled={!binderPlayer1Id}
                >
                  <option value="">-- Choose Second Player --</option>
                  {players
                    .filter(p => !p.pairId && p.id !== binderPlayer1Id)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.mobile ? `(${p.mobile})` : ''}</option>
                    ))
                  }
                </select>
              </div>

              <div>
                <button
                  onClick={handleBindPair}
                  disabled={isBinding || !binderPlayer1Id || !binderPlayer2Id}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl transition text-sm shadow-sm flex items-center justify-center gap-1.5 h-[42px]"
                >
                  {isBinding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Bind as Pair
                </button>
              </div>
            </div>
          </div>

          {/* Active Pairs List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Active Linked Pairs</h4>
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
              <div className="text-center py-8 bg-white border border-slate-200 rounded-xl">
                <p className="text-slate-500 text-xs font-semibold">No active linked pairs. Use the form above to link players together.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  const p1Group = groups.find(g => g.playerIds?.includes(p1.id));
                  const p2Group = p2 ? groups.find(g => g.playerIds?.includes(p2.id)) : null;

                  return (
                    <div key={pairId} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider block mb-1">Pair #{idx + 1}</span>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-bold">1</div>
                              <span className="font-bold text-slate-800 text-sm">{p1.name}</span>
                              {p1Group && (
                                <span className="text-[9px] font-extrabold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">{p1Group.name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center text-[10px] font-bold">2</div>
                              {p2 ? (
                                <>
                                  <span className="font-bold text-slate-800 text-sm">{p2.name}</span>
                                  {p2Group && (
                                    <span className="text-[9px] font-extrabold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">{p2Group.name}</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-400 text-xs italic">No partner (individual)</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleUnlinkPair(pairId)}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded-lg border border-rose-100 transition-colors"
                        >
                          Unlink Pair
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

      {/* -------------------- BULK IMPORT WORKBENCH (Admin only) -------------------- */}
      {isAdmin && importMode === 'bulk' && (
        <div className="space-y-5">
          {parsedPlayers.length === 0 ? (
            /* Paste area / Dropzone */
            <div className="space-y-4">
              <div className="p-4.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-slate-700 text-xs leading-relaxed space-y-2">
                <h4 className="font-bold text-indigo-950 flex items-center gap-1.5 text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel Spreadsheet Copy-Paste Importer
                </h4>
                <p>
                  1. Open your Excel, Google Sheet, or CSV document.
                </p>
                <p>
                  2. Ensure your columns are aligned. The importer is smart and supports a header row (e.g., <strong>Name, Age, Phone No, Group/Team Name</strong>) or positional matching if no headers are provided.
                </p>
                <p>
                  3. Select your cells, copy them (<kbd className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">Ctrl+C</kbd> / <kbd className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">Cmd+C</kbd>), and paste the rows in the workspace box below!
                </p>
              </div>

              {/* Paste Textbox / Drag & Dropzone */}
              <div 
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                className="relative group border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-5 bg-slate-50/40 transition-all text-center space-y-4"
              >
                <div className="flex flex-col items-center justify-center space-y-1.5 pointer-events-none">
                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <p className="font-bold text-slate-700 text-xs">Paste Excel spreadsheet columns, or drop a CSV / TXT file here</p>
                  <p className="text-slate-400 text-[10px]">Tab-separated spreadsheet rows or comma-separated values</p>
                </div>

                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  className="w-full h-44 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl p-3 text-xs font-mono outline-none shadow-inner resize-none focus:ring-2 focus:ring-indigo-500/10 transition"
                  placeholder="Paste spreadsheet contents here..."
                />

                <div className="flex justify-between items-center pt-2">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isDoublesImport}
                        onChange={e => setIsDoublesImport(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="text-xs font-bold text-slate-700">Import as Doubles</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="text-slate-500 font-bold">Assign L2 Chapter to All:</label>
                      <select
                        value={selectedChapterId}
                        onChange={e => setSelectedChapterId(e.target.value)}
                        className="border border-slate-200 bg-white p-1.5 rounded-lg text-xs font-medium cursor-pointer max-w-[150px]"
                      >
                        <option value="">-- No L2 Chapter --</option>
                        {sortedChapters.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.rootName} &gt; {c.level1Name} &gt; {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="text-slate-500 font-bold">Assign Group to All (Optional):</label>
                      <select
                        value={selectedGroupId}
                        onChange={e => setSelectedGroupId(e.target.value)}
                        className="border border-slate-200 bg-white p-1.5 rounded-lg text-xs font-medium cursor-pointer"
                      >
                        <option value="">-- No Group Assignment --</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Native File Selector fallback */}
                    <label className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-slate-200">
                      <FileText className="w-3.5 h-3.5" /> Upload File
                      <input 
                        type="file" 
                        accept=".csv,.txt" 
                        onChange={handleFileSelect} 
                        className="hidden" 
                      />
                    </label>

                    <button
                      onClick={parseBulkData}
                      disabled={!bulkText.trim()}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl transition shadow-sm hover:shadow"
                    >
                      Analyze & Parse Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Preview spreadsheet parser workbench */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm tracking-tight">Review Parsed Spreadsheet Records</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Double-check parsed rows below, fix any validation errors, and hit import!
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setParsedPlayers([])}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition"
                  >
                    Reset & Paste Again
                  </button>
                </div>
              </div>

              {/* Validation stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Total Rows</span>
                  <span className="text-lg font-black text-slate-800">{parsedPlayers.length}</span>
                </div>
                <div className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl text-center">
                  <span className="block text-[10px] font-bold text-emerald-600/75 uppercase">Valid Profiles</span>
                  <span className="text-lg font-black text-emerald-700">{parsedPlayers.filter(p => p.isValid).length}</span>
                </div>
                <div className="p-3 bg-rose-50/40 border border-rose-100 rounded-xl text-center">
                  <span className="block text-[10px] font-bold text-rose-600/75 uppercase">Errors Detected</span>
                  <span className="text-lg font-black text-rose-700">{parsedPlayers.filter(p => !p.isValid).length}</span>
                </div>
                <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl text-center">
                  <span className="block text-[10px] font-bold text-indigo-600/75 uppercase">Target Group</span>
                  <span className="text-xs font-extrabold text-indigo-950 truncate max-w-full block mt-1">
                    {groups.find(g => g.id === selectedGroupId)?.name || 'None'}
                  </span>
                </div>
              </div>

              {/* Progress Overlay during save */}
              {isImporting && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center text-xs font-black text-indigo-950">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Batch Creating Real Profiles in Cloud Run DB...
                    </span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                  </div>
                </div>
              )}

               {/* Interactive preview table */}
              <div className="flex items-center gap-2 mb-2 p-2">
                <input
                  type="checkbox"
                  checked={showUnlinkedOnly}
                  onChange={(e) => setShowUnlinkedOnly(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="text-xs font-bold text-slate-700">Show Unlinked Only</span>
                
                <button
                  onClick={() => {
                    const calculateAge = (birthDateString: string) => {
                      const today = new Date();
                      const birthDate = new Date(birthDateString);
                      let age = today.getFullYear() - birthDate.getFullYear();
                      const m = today.getMonth() - birthDate.getMonth();
                      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                          age--;
                      }
                      return age;
                    };

                    let updatedCount = 0;
                    const updated = parsedPlayers.map(p => {
                      const cleanMobile = p.mobile.replace(/[^0-9+]/g, '').trim();
                      if (cleanMobile) {
                        const matchedMaster = masterRegistry.find(mr => mr.mobile === cleanMobile || mr.id === cleanMobile);
                        if (matchedMaster) {
                          let newAge = null;
                          if (matchedMaster.age !== undefined && matchedMaster.age !== null) {
                            newAge = matchedMaster.age;
                          } else if (matchedMaster.birthdate) {
                            newAge = calculateAge(matchedMaster.birthdate);
                          } else if (matchedMaster.dob) {
                            newAge = calculateAge(matchedMaster.dob);
                          }

                          if (newAge !== null) {
                            updatedCount++;
                            return { ...p, age: String(newAge), isAutoFilledFromGlobal: true };
                          }
                        }
                      }
                      return p;
                    });
                    
                    if (updatedCount > 0) {
                      setParsedPlayers(updated);
                      alert(`Updated ages for ${updatedCount} players.`);
                    } else {
                      alert('No players found needing age updates based on mobile number.');
                    }
                  }}
                  className="ml-4 px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-lg hover:bg-indigo-700 transition"
                >
                  Auto-Fill All Ages
                </button>
              </div>
              <div className="overflow-x-auto border border-slate-150 rounded-2xl bg-white shadow-xs max-h-[380px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                      <th className="p-3 pl-4">Status</th>
                      <th className="p-3">Player Name</th>
                      <th className="p-3 w-20">Age</th>
                      <th className="p-3">Phone (Unique ID)</th>
                      <th className="p-3">Chapter (L2) Assignment</th>
                      <th className="p-3">Group (Team) Assignment</th>
                      <th className="p-3 text-center pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {parsedPlayers
                      .filter(p => !showUnlinkedOnly || !p.isAutoFilledFromGlobal)
                      .map((p, idx) => {
                      // Inline Row validator re-trigger
                      const updateFieldAndValidate = (field: string, val: string) => {
                        const originalIndex = parsedPlayers.findIndex(item => item.tempId === p.tempId);
                        if (originalIndex === -1) return;

                        const updated = [...parsedPlayers];
                        updated[originalIndex][field] = val;
                        
                        // Recalculate row status
                        const cleanMobile = updated[originalIndex].mobile.replace(/[^0-9+]/g, '').trim();
                        updated[originalIndex].mobile = cleanMobile;

                        let isValid = true;
                        let errorMsg = "";
                        let matchedChapterId = updated[originalIndex].chapterId || "";
                        let matchedChapterName = updated[originalIndex].matchedChapterName || "";

                        if (!updated[originalIndex].name.trim()) {
                          isValid = false;
                          errorMsg = "Name is required.";
                        } else if (!cleanMobile) {
                          isValid = false;
                          errorMsg = "Mobile number is required.";
                        } else {
                          const isPastedDup = updated.some((item, i) => i !== originalIndex && item.mobile === cleanMobile);
                          if (isPastedDup) {
                            isValid = false;
                            errorMsg = "Duplicate phone number in pasted list.";
                          } else {
                            const isDbDup = players.some(dp => dp.mobile && dp.mobile.trim().replace(/[^0-9+]/g, '') === cleanMobile);
                            if (isDbDup) {
                              isValid = false;
                              errorMsg = "Phone number already exists in database.";
                            }
                          }
                        }

                        // Re-evaluate matched L2 chapter from masterRegistry if phone changed
                        if (cleanMobile) {
                          const matchedMaster = masterRegistry.find(mr => mr.mobile === cleanMobile || mr.id === cleanMobile);
                          if (matchedMaster) {
                            if (!updated[originalIndex].name.trim() && matchedMaster.name) {
                              updated[originalIndex].name = matchedMaster.name;
                              updated[originalIndex].isAutoFilledFromGlobal = true;
                            }
                            if ((!updated[originalIndex].age || updated[originalIndex].age.trim() === '') && matchedMaster.age !== undefined && matchedMaster.age !== null) {
                              updated[originalIndex].age = String(matchedMaster.age);
                              updated[originalIndex].isAutoFilledFromGlobal = true;
                            }
                            if (matchedMaster.l2) {
                              const chapter = allRootsLevel2.find(c => c.name.toLowerCase() === matchedMaster.l2.toLowerCase());
                              if (chapter) {
                                matchedChapterId = chapter.id;
                                matchedChapterName = chapter.name;
                              }
                            }
                          }
                        }

                        updated[originalIndex].chapterId = matchedChapterId;
                        updated[originalIndex].matchedChapterName = matchedChapterName;
                        updated[originalIndex].isValid = isValid;
                        updated[originalIndex].errorMsg = errorMsg;
                        setParsedPlayers(updated);
                      };

                      return (
                        <tr 
                          key={p.tempId} 
                          className={`group ${p.isValid ? "hover:bg-slate-50/40" : "bg-rose-50/30 hover:bg-rose-50/50"}`}
                        >
                          {/* Row Status Indicator */}
                          <td className="p-3 pl-4">
                            {p.isValid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100">
                                <Check className="w-3 h-3 text-emerald-600" /> Ready
                              </span>
                            ) : (
                              <span 
                                className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-100 cursor-help"
                                title={p.errorMsg}
                              >
                                <AlertTriangle className="w-3 h-3 text-rose-500" /> Error
                              </span>
                            )}
                          </td>

                          {/* Name Input */}
                          <td className="p-2">
                            <input
                              value={p.name}
                              onChange={e => updateFieldAndValidate('name', e.target.value)}
                              className="border border-slate-200 bg-white p-1.5 rounded-lg text-xs font-semibold focus:border-indigo-500 outline-none w-full max-w-[150px]"
                              placeholder="Name"
                            />
                            {p.isAutoFilledFromGlobal && (
                              <div className="text-[9px] text-emerald-600 font-extrabold mt-0.5 flex items-center gap-0.5 animate-pulse">
                                👤 From Global Profile
                              </div>
                            )}
                            {p.matchedChapterName && (
                              <div className="text-[9px] text-indigo-600 font-black mt-0.5 flex items-center gap-0.5">
                                🏫 Auto L2: "{p.matchedChapterName}"
                              </div>
                            )}
                          </td>

                          {/* Age Input */}
                          <td className="p-2">
                            <input
                              value={p.age}
                              onChange={e => updateFieldAndValidate('age', e.target.value)}
                              className="border border-slate-200 bg-white p-1.5 rounded-lg text-xs font-semibold focus:border-indigo-500 outline-none w-14 text-center"
                              placeholder="Age"
                              type="number"
                            />
                          </td>

                          {/* Mobile Input */}
                          <td className="p-2">
                            <input
                              value={p.mobile}
                              onChange={e => updateFieldAndValidate('mobile', e.target.value)}
                              className="border border-slate-200 bg-white p-1.5 rounded-lg text-xs font-mono font-semibold focus:border-indigo-500 outline-none w-full max-w-[130px]"
                              placeholder="e.g. 9876543210"
                              type="tel"
                            />
                            {!p.isValid && p.errorMsg.includes("phone") && (
                              <div className="text-[10px] text-rose-600 font-extrabold mt-0.5">{p.errorMsg}</div>
                            )}
                          </td>

                          {/* Chapter (L2) assignment dropdown */}
                          <td className="p-2">
                            <select
                              value={p.chapterId || ""}
                              onChange={e => {
                                const updated = [...parsedPlayers];
                                updated[idx].chapterId = e.target.value;
                                const ch = sortedChapters.find(c => c.id === e.target.value);
                                updated[idx].matchedChapterName = ch ? ch.name : "";
                                setParsedPlayers(updated);
                              }}
                              className="border border-slate-200 bg-white p-1.5 rounded-lg text-xs font-semibold focus:border-indigo-500 outline-none w-full max-w-[180px] cursor-pointer"
                            >
                              <option value="">-- Choose Chapter --</option>
                              {sortedChapters.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.rootName} &gt; {c.level1Name} &gt; {c.name}
                                </option>
                              ))}
                            </select>
                            {p.matchedChapterName && (
                              <div className="text-[9px] text-indigo-600 font-extrabold mt-0.5 truncate max-w-[180px]">
                                🏫 Chapter: "{p.matchedChapterName}"
                              </div>
                            )}
                          </td>

                          {/* Group assignment dropdown */}
                          <td className="p-2">
                            <select
                              value={p.groupId}
                              onChange={e => {
                                const updated = [...parsedPlayers];
                                updated[idx].groupId = e.target.value;
                                setParsedPlayers(updated);
                              }}
                              className="border border-slate-200 bg-white p-1.5 rounded-lg text-xs font-semibold focus:border-indigo-500 outline-none w-full max-w-[180px]"
                            >
                              <option value="">-- No Group Assignment --</option>
                              {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                            {p.originalGroup && !p.groupId && (
                              <div className="text-[9px] text-emerald-600 font-bold mt-0.5 truncate max-w-[180px]">
                                Will auto-create: "{p.originalGroup}"
                              </div>
                            )}
                            {p.groupId && (
                              <div className="text-[9px] text-indigo-500 font-bold mt-0.5 truncate max-w-[180px]">
                                Auto-Matched Group!
                              </div>
                            )}
                          </td>

                          {/* Remove row option */}
                          <td className="p-3 text-center pr-4">
                            <button
                              onClick={() => {
                                const updated = parsedPlayers.filter((_, i) => i !== idx);
                                setParsedPlayers(updated);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Delete row from list"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Rows */}
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-slate-500 font-semibold">
                  Total valid profiles to import: <strong className="text-indigo-600 font-bold">{parsedPlayers.filter(p => p.isValid).length}</strong> / {parsedPlayers.length}
                </span>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setParsedPlayers([]); setBulkText(''); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-250 text-slate-700 font-extrabold text-xs rounded-xl transition"
                  >
                    Clear Preview
                  </button>
                  <button
                    onClick={handleImportSubmit}
                    disabled={isImporting || parsedPlayers.filter(p => p.isValid).length === 0}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl transition shadow-sm hover:shadow flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" /> Save & Import Real Profiles
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={downloadPlayersPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition shadow-sm cursor-pointer"
              title="Download PDF List of Players"
            >
              <FileText className="w-4 h-4" /> PDF
            </button>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
              Total Tournament Pool: {players.length} Players
            </span>
          </div>
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
              const partner = p.pairId ? players.find(other => other.pairId === p.pairId && other.id !== p.id) : null;

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

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Name</label>
                          <input 
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full border border-slate-200 p-2 rounded-lg text-xs font-medium outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Mobile</label>
                          <input 
                            value={editForm.mobile}
                            onChange={e => setEditForm({ ...editForm, mobile: e.target.value })}
                            className="w-full border border-slate-200 p-2 rounded-lg text-xs font-medium outline-none focus:border-indigo-500"
                            placeholder="Mobile number"
                            type="tel"
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
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Gender</label>
                          <select 
                            value={editForm.gender}
                            onChange={e => setEditForm({ ...editForm, gender: e.target.value })}
                            className="w-full border border-slate-200 p-2 rounded-lg text-xs font-medium outline-none focus:border-indigo-500 bg-white"
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
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
                            <h4 
                              onClick={() => setSelectedPlayerForMatches({ id: p.id, name: p.name })}
                              className="font-bold text-slate-800 text-base tracking-tight cursor-pointer hover:text-indigo-600 hover:underline decoration-indigo-200 transition-colors"
                              title="Click to view all matches for this player"
                            >
                              {p.name}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 text-slate-500 text-xs font-medium">
                              {p.mobile && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold border border-indigo-100/60">
                                  <Phone className="w-2.5 h-2.5 text-indigo-500" /> {p.mobile}
                                </span>
                              )}
                              {p.gender && (
                                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  p.gender === 'Female' 
                                    ? 'bg-rose-50 text-rose-700 border-rose-100/60' 
                                    : 'bg-blue-50 text-blue-700 border-blue-100/60'
                                }`}>
                                  {p.gender === 'Female' ? '♀' : '♂'} {p.gender}
                                </span>
                              )}
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
                              {partner && (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-black border border-emerald-100/60" title="Doubles partner for this tournament">
                                  👥 Partner: {partner.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Top corner actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            onClick={() => setSelectedPlayerForMatches({ id: p.id, name: p.name })}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-colors flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 border border-indigo-100 shadow-2xs"
                            title="View player match history"
                          >
                            <Trophy className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Matches</span>
                          </button>
                          {isAdmin && (
                            <>
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
                            </>
                          )}
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

      {/* Player Match History Modal */}
      <AnimatePresence>
        {selectedPlayerForMatches && (
          <PlayerMatchesModal
            playerId={selectedPlayerForMatches.id}
            playerName={selectedPlayerForMatches.name}
            tournamentId={tournamentId}
            onClose={() => setSelectedPlayerForMatches(null)}
            playerL1Map={Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level1Name]))}
            playerL2Map={Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level2Name]))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
