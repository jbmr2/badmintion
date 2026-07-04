import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  doc, 
  setDoc, 
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Search, 
  Plus, 
  FolderTree, 
  Trash2, 
  Activity, 
  UserCheck, 
  CheckCircle,
  Trophy,
  ChevronRight,
  BookOpen,
  FolderOpen,
  HelpCircle,
  Copy,
  Upload
} from 'lucide-react';

export default function HierarchyManager({ 
  tournamentId,
  userRole = 'user'
}: { 
  tournamentId?: string;
  userRole?: 'admin' | 'scorer' | 'user';
}) {
  const isAdmin = userRole === 'admin';
  const [viewMode, setViewMode] = useState<'editor' | 'chain' | 'points' | 'upload'>('chain');
  const [pointsSubTab, setPointsSubTab] = useState<'roots' | 'parents' | 'chapters'>('chapters');
  
  // CSV Import States
  const [csvInput, setCsvInput] = useState('');
  const [parsedCsvRows, setParsedCsvRows] = useState<any[]>([]);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [importCsvProgress, setImportCsvProgress] = useState('');
  const [importCsvResult, setImportCsvResult] = useState<{
    rootsAdded: number;
    l1Added: number;
    l2Added: number;
  } | null>(null);
  const [copySourceTournamentId, setCopySourceTournamentId] = useState<string>('');
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyStatusMessage, setCopyStatusMessage] = useState<string | null>(null);
  const [roots, setRoots] = useState<any[]>([]);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [level1, setLevel1] = useState<any[]>([]);
  const [selectedLevel1Id, setSelectedLevel1Id] = useState<string | null>(null);
  const [level2, setLevel2] = useState<any[]>([]);
  const [selectedLevel2Id, setSelectedLevel2Id] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<'none' | 'root' | 'level1' | 'level2'>('none');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [hierarchyToDelete, setHierarchyToDelete] = useState<{
    type: 'root' | 'level1' | 'level2';
    id: string;
    name: string;
  } | null>(null);

  const [newRootName, setNewRootName] = useState('');
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [newLevel1Name, setNewLevel1Name] = useState('');
  const [isAddingLevel1, setIsAddingLevel1] = useState(false);
  const [newLevel2Name, setNewLevel2Name] = useState('');
  const [isAddingLevel2, setIsAddingLevel2] = useState(false);

  // Tournament & Player assignment state
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | undefined>(tournamentId);
  const [tournamentPlayers, setTournamentPlayers] = useState<any[]>([]);
  const [assignedPlayers, setAssignedPlayers] = useState<any[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');

  // States for complete roots points aggregation
  const [allRootsLevel1, setAllRootsLevel1] = useState<any[]>([]);
  const [allRootsLevel2, setAllRootsLevel2] = useState<any[]>([]);
  const [allRootsPlayers, setAllRootsPlayers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);

  // States for 'All Tournaments' points calculation & aggregate standings
  const [allTournamentsRoots, setAllTournamentsRoots] = useState<any[]>([]);
  const [allTournamentsLevel1, setAllTournamentsLevel1] = useState<any[]>([]);
  const [allTournamentsLevel2, setAllTournamentsLevel2] = useState<any[]>([]);
  const [allTournamentsAssignedPlayers, setAllTournamentsAssignedPlayers] = useState<any[]>([]);
  const [allTournamentsTournamentPlayers, setAllTournamentsTournamentPlayers] = useState<any[]>([]);
  const [allTournamentsMatches, setAllTournamentsMatches] = useState<any[]>([]);
  const [allTournamentsFixtures, setAllTournamentsFixtures] = useState<any[]>([]);

  // Custom states for complete visual bracket/tree representation
  const [allLevel2, setAllLevel2] = useState<{[l1Id: string]: any[]}>({});
  const [allChapterPlayers, setAllChapterPlayers] = useState<{[l2Id: string]: any[]}>({});

  // 1. Fetch Roots
  useEffect(() => {
    if (selectedTournamentId) {
      const qRoots = query(collection(db, `tournaments/${selectedTournamentId}/roots`));
      return onSnapshot(qRoots, (snapshot) => {
        setRoots(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
      }, (e) => handleFirestoreError(e, OperationType.LIST, `tournaments/${selectedTournamentId}/roots`));
    } else {
      setRoots([]);
      setSelectedRootId(null);
    }
  }, [selectedTournamentId]);

  // 2. Fetch Level 1
  useEffect(() => {
    if (selectedRootId && selectedTournamentId) {
      const qLevel1 = query(collection(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1`));
      return onSnapshot(qLevel1, (snapshot) => {
        setLevel1(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
      }, (e) => handleFirestoreError(e, OperationType.LIST, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1`));
    } else {
      setLevel1([]);
      setSelectedLevel1Id(null);
      setSelectedLevel2Id(null);
    }
  }, [selectedRootId, selectedTournamentId]);

  // 3. Fetch Level 2
  useEffect(() => {
    if (selectedLevel1Id && selectedRootId && selectedTournamentId) {
      const qLevel2 = query(collection(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2`));
      return onSnapshot(qLevel2, (snapshot) => {
        setLevel2(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
      }, (e) => handleFirestoreError(e, OperationType.LIST, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2`));
    } else {
      setLevel2([]);
      setSelectedLevel2Id(null);
    }
  }, [selectedLevel1Id, selectedRootId, selectedTournamentId]);

  // 4. Fetch Tournaments
  useEffect(() => {
    const qTournaments = query(collection(db, 'tournaments'));
    return onSnapshot(qTournaments, (snapshot) => {
      setTournaments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'tournaments'));
  }, []);

  // Auto select the first tournament if none is currently selected
  useEffect(() => {
    if (!selectedTournamentId && tournaments.length > 0) {
      setSelectedTournamentId(tournaments[0].id);
    }
  }, [tournaments, selectedTournamentId]);

  // Auto switch to points standings if 'all' tournaments context is selected
  useEffect(() => {
    if (selectedTournamentId === 'all') {
      setViewMode('points');
    }
  }, [selectedTournamentId]);

  // 5. Update Selected Tournament from Prop
  useEffect(() => {
    if (tournamentId) {
      setSelectedTournamentId(tournamentId);
    }
  }, [tournamentId]);

  // 6. Fetch Tournament Players
  useEffect(() => {
    if (selectedTournamentId) {
      const qPlayers = query(collection(db, `tournaments/${selectedTournamentId}/players`));
      return onSnapshot(qPlayers, (snapshot) => {
        setTournamentPlayers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (e) => handleFirestoreError(e, OperationType.LIST, `tournaments/${selectedTournamentId}/players`));
    } else {
      setTournamentPlayers([]);
    }
  }, [selectedTournamentId]);

  // 7. Fetch Assigned Players to Level 2 Chapter
  useEffect(() => {
    if (selectedRootId && selectedLevel1Id && selectedLevel2Id && selectedTournamentId) {
      const qAssigned = query(collection(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2/${selectedLevel2Id}/players`));
      return onSnapshot(qAssigned, (snapshot) => {
        setAssignedPlayers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (e) => handleFirestoreError(e, OperationType.LIST, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2/${selectedLevel2Id}/players`));
    } else {
      setAssignedPlayers([]);
    }
  }, [selectedRootId, selectedLevel1Id, selectedLevel2Id, selectedTournamentId]);

  // 7.1 Fetch ALL Level 1s across all Roots in the background
  useEffect(() => {
    if (roots.length === 0 || !selectedTournamentId) {
      setAllRootsLevel1([]);
      return;
    }
    const unsubscribes = roots.map(root => {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/roots/${root.id}/level1`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsLevel1(prev => {
          const filtered = prev.filter(item => item.rootId !== root.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, rootId: root.id, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error(err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [roots, selectedTournamentId]);

  // 7.2 Fetch ALL Level 2s across all Level 1s
  useEffect(() => {
    if (allRootsLevel1.length === 0 || !selectedTournamentId) {
      setAllRootsLevel2([]);
      return;
    }
    const unsubscribes = allRootsLevel1.map(l1 => {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/roots/${l1.rootId}/level1/${l1.id}/level2`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsLevel2(prev => {
          const filtered = prev.filter(item => item.level1Id !== l1.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, level1Id: l1.id, rootId: l1.rootId, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error(err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel1, selectedTournamentId]);

  // 7.3 Fetch ALL assigned players across all Level 2s
  useEffect(() => {
    if (allRootsLevel2.length === 0 || !selectedTournamentId) {
      setAllRootsPlayers([]);
      return;
    }
    const unsubscribes = allRootsLevel2.map(l2 => {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/roots/${l2.rootId}/level1/${l2.level1Id}/level2/${l2.id}/players`));
      return onSnapshot(q, (snapshot) => {
        setAllRootsPlayers(prev => {
          const filtered = prev.filter(item => item.level2Id !== l2.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, level2Id: l2.id, level1Id: l2.level1Id, rootId: l2.rootId, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error(err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allRootsLevel2, selectedTournamentId]);

  // 7.4 Fetch Matches for Points Table
  useEffect(() => {
    if (selectedTournamentId) {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/matches`));
      return onSnapshot(q, (snapshot) => {
        setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => console.error(err));
    } else {
      setMatches([]);
    }
  }, [selectedTournamentId]);

  // 7.5 Fetch Fixtures for Points Table
  useEffect(() => {
    if (selectedTournamentId && selectedTournamentId !== 'all') {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/fixtures`));
      return onSnapshot(q, (snapshot) => {
        setFixtures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => console.error(err));
    } else {
      setFixtures([]);
    }
  }, [selectedTournamentId]);

  // 7.6 Listen to ALL Roots across ALL tournaments in 'all' mode
  useEffect(() => {
    if (selectedTournamentId !== 'all' || tournaments.length === 0) {
      setAllTournamentsRoots([]);
      return;
    }
    const unsubscribes = tournaments.map(t => {
      const q = query(collection(db, `tournaments/${t.id}/roots`));
      return onSnapshot(q, (snapshot) => {
        setAllTournamentsRoots(prev => {
          const filtered = prev.filter(item => item.tournamentId !== t.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, tournamentId: t.id, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching roots for tournament " + t.id, err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [tournaments, selectedTournamentId]);

  // 7.7 Listen to ALL Level 1s across ALL roots across ALL tournaments in 'all' mode
  useEffect(() => {
    if (selectedTournamentId !== 'all' || allTournamentsRoots.length === 0) {
      setAllTournamentsLevel1([]);
      return;
    }
    const unsubscribes = allTournamentsRoots.map(root => {
      const q = query(collection(db, `tournaments/${root.tournamentId}/roots/${root.id}/level1`));
      return onSnapshot(q, (snapshot) => {
        setAllTournamentsLevel1(prev => {
          const filtered = prev.filter(item => !(item.rootId === root.id && item.tournamentId === root.tournamentId));
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, rootId: root.id, tournamentId: root.tournamentId, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching level1 for root " + root.id, err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allTournamentsRoots, selectedTournamentId]);

  // 7.8 Listen to ALL Level 2s across ALL Level 1s in 'all' mode
  useEffect(() => {
    if (selectedTournamentId !== 'all' || allTournamentsLevel1.length === 0) {
      setAllTournamentsLevel2([]);
      return;
    }
    const unsubscribes = allTournamentsLevel1.map(l1 => {
      const q = query(collection(db, `tournaments/${l1.tournamentId}/roots/${l1.rootId}/level1/${l1.id}/level2`));
      return onSnapshot(q, (snapshot) => {
        setAllTournamentsLevel2(prev => {
          const filtered = prev.filter(item => !(item.level1Id === l1.id && item.tournamentId === l1.tournamentId));
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, level1Id: l1.id, rootId: l1.rootId, tournamentId: l1.tournamentId, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching level2 for level1 " + l1.id, err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allTournamentsLevel1, selectedTournamentId]);

  // 7.9 Listen to ALL Assigned Players across ALL Level 2s in 'all' mode
  useEffect(() => {
    if (selectedTournamentId !== 'all' || allTournamentsLevel2.length === 0) {
      setAllTournamentsAssignedPlayers([]);
      return;
    }
    const unsubscribes = allTournamentsLevel2.map(l2 => {
      const q = query(collection(db, `tournaments/${l2.tournamentId}/roots/${l2.rootId}/level1/${l2.level1Id}/level2/${l2.id}/players`));
      return onSnapshot(q, (snapshot) => {
        setAllTournamentsAssignedPlayers(prev => {
          const filtered = prev.filter(item => !(item.level2Id === l2.id && item.tournamentId === l2.tournamentId));
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, level2Id: l2.id, level1Id: l2.level1Id, rootId: l2.rootId, tournamentId: l2.tournamentId, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching players for level2 " + l2.id, err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [allTournamentsLevel2, selectedTournamentId]);

  // 7.10 Listen to ALL Matches across ALL tournaments in 'all' mode
  useEffect(() => {
    if (selectedTournamentId !== 'all' || tournaments.length === 0) {
      setAllTournamentsMatches([]);
      return;
    }
    const unsubscribes = tournaments.map(t => {
      const q = query(collection(db, `tournaments/${t.id}/matches`));
      return onSnapshot(q, (snapshot) => {
        setAllTournamentsMatches(prev => {
          const filtered = prev.filter(item => item.tournamentId !== t.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, tournamentId: t.id, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching matches for tournament " + t.id, err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [tournaments, selectedTournamentId]);

  // 7.11 Listen to ALL Fixtures across ALL tournaments in 'all' mode
  useEffect(() => {
    if (selectedTournamentId !== 'all' || tournaments.length === 0) {
      setAllTournamentsFixtures([]);
      return;
    }
    const unsubscribes = tournaments.map(t => {
      const q = query(collection(db, `tournaments/${t.id}/fixtures`));
      return onSnapshot(q, (snapshot) => {
        setAllTournamentsFixtures(prev => {
          const filtered = prev.filter(item => item.tournamentId !== t.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, tournamentId: t.id, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching fixtures for tournament " + t.id, err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [tournaments, selectedTournamentId]);

  // 7.12 Listen to ALL Tournament Players across ALL tournaments in 'all' mode
  useEffect(() => {
    if (selectedTournamentId !== 'all' || tournaments.length === 0) {
      setAllTournamentsTournamentPlayers([]);
      return;
    }
    const unsubscribes = tournaments.map(t => {
      const q = query(collection(db, `tournaments/${t.id}/players`));
      return onSnapshot(q, (snapshot) => {
        setAllTournamentsTournamentPlayers(prev => {
          const filtered = prev.filter(item => item.tournamentId !== t.id);
          const newItems = snapshot.docs.map(doc => ({ id: doc.id, tournamentId: t.id, ...doc.data() }));
          return [...filtered, ...newItems];
        });
      }, (err) => console.error("Error fetching tournament players for tournament " + t.id, err));
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [tournaments, selectedTournamentId]);

  // 8. Dynamic full-hierarchy subscription for bracket/tree
  useEffect(() => {
    if (!selectedRootId || level1.length === 0 || !selectedTournamentId) {
      setAllLevel2({});
      return;
    }

    const unsubscribes = level1.map(l1 => {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${l1.id}/level2`));
      return onSnapshot(q, (snapshot) => {
        setAllLevel2(prev => ({
          ...prev,
          [l1.id]: snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        }));
      }, (e) => console.error("Error fetching level2 for " + l1.id, e));
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [selectedRootId, level1, selectedTournamentId]);

  useEffect(() => {
    if (!selectedRootId || level1.length === 0 || !selectedTournamentId) {
      setAllChapterPlayers({});
      return;
    }

    // Gather all level2 IDs currently loaded across all level1s
    const l2s: { l1Id: string; l2Id: string }[] = [];
    level1.forEach(l1 => {
      const chapters = allLevel2[l1.id] || [];
      chapters.forEach(ch => {
        l2s.push({ l1Id: l1.id, l2Id: ch.id });
      });
    });

    if (l2s.length === 0) {
      setAllChapterPlayers({});
      return;
    }

    const unsubscribes = l2s.map(({ l1Id, l2Id }) => {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${l1Id}/level2/${l2Id}/players`));
      return onSnapshot(q, (snapshot) => {
        setAllChapterPlayers(prev => ({
          ...prev,
          [l2Id]: snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        }));
      }, (e) => console.error("Error fetching players for chapter " + l2Id, e));
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [selectedRootId, level1, allLevel2, selectedTournamentId]);

  // Copy Hierarchy Function
  const handleCopyHierarchy = async () => {
    if (!copySourceTournamentId) {
      setErrorText("Please select a source tournament to copy from.");
      return;
    }
    if (!selectedTournamentId) {
      setErrorText("No target tournament selected.");
      return;
    }
    if (copySourceTournamentId === selectedTournamentId) {
      setErrorText("Cannot copy a tournament to itself.");
      return;
    }

    setIsCopying(true);
    setCopyStatusMessage("Starting copy process...");
    setErrorText(null);
    setShowCopyConfirm(false);

    try {
      // 1. Fetch all roots from the source tournament
      const sourceRootsSnap = await getDocs(collection(db, `tournaments/${copySourceTournamentId}/roots`));
      const sourceRoots = sourceRootsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      if (sourceRoots.length === 0) {
        setCopyStatusMessage(null);
        setErrorText("The selected tournament does not have any roots/hierarchy to copy.");
        setIsCopying(false);
        return;
      }

      let copiedRootsCount = 0;
      let copiedL1Count = 0;
      let copiedL2Count = 0;

      for (const root of sourceRoots) {
        setCopyStatusMessage(`Copying Root: ${root.name || root.id}...`);
        
        // Save Root with same ID to the target tournament
        const targetRootRef = doc(db, `tournaments/${selectedTournamentId}/roots`, root.id);
        await setDoc(targetRootRef, {
          name: root.name || ''
        });
        copiedRootsCount++;

        // 2. Fetch all Level 1 (Parent Teams) for this root
        const sourceL1Snap = await getDocs(collection(db, `tournaments/${copySourceTournamentId}/roots/${root.id}/level1`));
        const sourceL1List = sourceL1Snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        for (const l1 of sourceL1List) {
          // Save Level 1 with same ID under the copied Root
          const targetL1Ref = doc(db, `tournaments/${selectedTournamentId}/roots/${root.id}/level1`, l1.id);
          await setDoc(targetL1Ref, {
            name: l1.name || '',
            rootId: root.id
          });
          copiedL1Count++;

          // 3. Fetch all Level 2 (Chapters) for this Level 1
          const sourceL2Snap = await getDocs(collection(db, `tournaments/${copySourceTournamentId}/roots/${root.id}/level1/${l1.id}/level2`));
          const sourceL2List = sourceL2Snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

          for (const l2 of sourceL2List) {
            // Save Level 2 with same ID under the copied Level 1
            const targetL2Ref = doc(db, `tournaments/${selectedTournamentId}/roots/${root.id}/level1/${l1.id}/level2`, l2.id);
            await setDoc(targetL2Ref, {
              name: l2.name || '',
              level1Id: l1.id
            });
            copiedL2Count++;
          }
        }
      }

      setCopyStatusMessage(`Successfully copied setup: ${copiedRootsCount} Roots, ${copiedL1Count} Parent Teams, and ${copiedL2Count} Chapters!`);
      setCopySourceTournamentId('');
      // Clear status message after 4 seconds
      setTimeout(() => {
        setCopyStatusMessage(null);
      }, 4000);
    } catch (e: any) {
      console.error("Error during copy hierarchy operation:", e);
      setErrorText(`Copy failed: ${e?.message || String(e)}`);
      setCopyStatusMessage(null);
    } finally {
      setIsCopying(false);
    }
  };

  const handleParseCsv = (text: string) => {
    setCsvInput(text);
    if (!text.trim()) {
      setParsedCsvRows([]);
      return;
    }

    const lines = text.split(/\r?\n/);
    const resultRows: any[] = [];
    
    // We want to see if the first line is a header
    let isHeader = false;
    let rootIdx = 0;
    let l1Idx = 1;
    let l2Idx = 2;

    if (lines.length > 0) {
      const firstLineCols = lines[0].toLowerCase().split(/\t|,|;/).map(c => c.trim().replace(/"/g, ''));
      const hasRoot = firstLineCols.some(c => c.includes('root') || c.includes('base') || c.includes('level 0') || c.includes('l0'));
      const hasL2 = firstLineCols.some(c => c.includes('l2') || c.includes('level 2') || c.includes('chapter') || c.includes('category') || c.includes('class'));
      
      if (hasRoot || hasL2) {
        isHeader = true;
        
        // Find indexes
        const foundRootIdx = firstLineCols.findIndex(c => c.includes('root') || c.includes('base') || c.includes('level 0') || c.includes('l0'));
        if (foundRootIdx !== -1) rootIdx = foundRootIdx;
        
        const foundL2Idx = firstLineCols.findIndex(c => c.includes('l2') || c.includes('level 2') || c.includes('chapter') || c.includes('category') || c.includes('class'));
        if (foundL2Idx !== -1) l2Idx = foundL2Idx;
        
        // Level 1 might be in between or named differently
        const foundL1Idx = firstLineCols.findIndex(c => c.includes('l1') || c.includes('level 1') || c.includes('team') || c.includes('parent'));
        if (foundL1Idx !== -1) {
          l1Idx = foundL1Idx;
        } else {
          // If 3 columns and we found root and l2, level1 is the other one
          const otherIdx = [0, 1, 2].find(i => i !== rootIdx && i !== l2Idx);
          if (otherIdx !== undefined) l1Idx = otherIdx;
        }
      }
    }

    let lastRoot = '';
    let lastL1 = '';

    const startRow = isHeader ? 1 : 0;
    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // split by tab, comma, or semicolon
      // tab is very common when copying from Google Sheets / Excel
      let cols: string[] = [];
      if (line.includes('\t')) {
        cols = line.split('\t');
      } else if (line.includes(';')) {
        cols = line.split(';');
      } else {
        cols = line.split(',');
      }

      cols = cols.map(c => c.trim().replace(/"/g, ''));

      let rName = cols[rootIdx] || '';
      if (!rName) {
        rName = lastRoot;
      } else {
        if (rName !== lastRoot) {
          lastL1 = '';
        }
        lastRoot = rName;
      }

      let l1Name = cols[l1Idx] || '';
      if (!l1Name) {
        l1Name = lastL1 || 'General';
      } else {
        lastL1 = l1Name;
      }

      const l2Name = cols[l2Idx] || '';
      const isValid = !!rName && !!l2Name;

      resultRows.push({
        rowNum: i + 1,
        rootName: rName,
        level1Name: l1Name || 'General',
        level2Name: l2Name,
        isValid,
        error: !rName ? 'Missing Root name' : !l2Name ? 'Missing Level 2 Chapter/Category' : ''
      });
    }

    setParsedCsvRows(resultRows);
  };

  const handleImportCsv = async () => {
    if (!selectedTournamentId) {
      setErrorText("Please select a tournament first.");
      return;
    }
    const validRows = parsedCsvRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setErrorText("No valid rows to import.");
      return;
    }

    setIsImportingCsv(true);
    setImportCsvProgress("Fetching existing hierarchy structures...");
    setErrorText(null);

    try {
      // 1. Fetch all existing Roots under this tournament
      const rootsCollectionRef = collection(db, `tournaments/${selectedTournamentId}/roots`);
      const rootsSnap = await getDocs(rootsCollectionRef);
      const existingRootsMap: { [name: string]: string } = {};
      rootsSnap.docs.forEach(doc => {
        existingRootsMap[doc.data().name.trim().toLowerCase()] = doc.id;
      });

      // 2. We'll cache existing Level 1 and Level 2 structures to avoid duplicates
      const existingL1Map: { [rootId: string]: { [name: string]: string } } = {};
      const existingL2Map: { [l1Id: string]: { [name: string]: string } } = {};

      let rootsAdded = 0;
      let l1Added = 0;
      let l2Added = 0;

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const { rootName, level1Name, level2Name } = row;

        const normalizedRootName = rootName.trim();
        const rootKey = normalizedRootName.toLowerCase();
        let rootId = existingRootsMap[rootKey];

        // Ensure Root exists
        if (!rootId) {
          setImportCsvProgress(`Creating Root: "${normalizedRootName}"...`);
          const rootRef = await addDoc(rootsCollectionRef, { name: normalizedRootName });
          rootId = rootRef.id;
          existingRootsMap[rootKey] = rootId;
          rootsAdded++;
        }

        // Ensure Level 1 cache for this Root is loaded
        if (!existingL1Map[rootId]) {
          existingL1Map[rootId] = {};
          const l1Snap = await getDocs(collection(db, `tournaments/${selectedTournamentId}/roots/${rootId}/level1`));
          l1Snap.docs.forEach(doc => {
            existingL1Map[rootId][doc.data().name.trim().toLowerCase()] = doc.id;
          });
        }

        const normalizedL1Name = level1Name.trim();
        const l1Key = normalizedL1Name.toLowerCase();
        let l1Id = existingL1Map[rootId][l1Key];

        // Ensure Level 1 exists
        if (!l1Id) {
          setImportCsvProgress(`Adding Team L1: "${normalizedL1Name}" under "${normalizedRootName}"...`);
          const l1Ref = await addDoc(collection(db, `tournaments/${selectedTournamentId}/roots/${rootId}/level1`), {
            name: normalizedL1Name,
            rootId: rootId
          });
          l1Id = l1Ref.id;
          existingL1Map[rootId][l1Key] = l1Id;
          l1Added++;
        }

        // Ensure Level 2 cache for this Level 1 is loaded
        if (!existingL2Map[l1Id]) {
          existingL2Map[l1Id] = {};
          const l2Snap = await getDocs(collection(db, `tournaments/${selectedTournamentId}/roots/${rootId}/level1/${l1Id}/level2`));
          l2Snap.docs.forEach(doc => {
            existingL2Map[l1Id][doc.data().name.trim().toLowerCase()] = doc.id;
          });
        }

        const normalizedL2Name = level2Name.trim();
        const l2Key = normalizedL2Name.toLowerCase();
        let l2Id = existingL2Map[l1Id][l2Key];

        // Ensure Level 2 exists
        if (!l2Id) {
          setImportCsvProgress(`Adding Chapter L2: "${normalizedL2Name}" under "${normalizedL1Name}"...`);
          const l2Ref = await addDoc(collection(db, `tournaments/${selectedTournamentId}/roots/${rootId}/level1/${l1Id}/level2`), {
            name: normalizedL2Name,
            level1Id: l1Id
          });
          l2Id = l2Ref.id;
          existingL2Map[l1Id][l2Key] = l2Id;
          l2Added++;
        }
      }

      setImportCsvResult({
        rootsAdded,
        l1Added,
        l2Added
      });
      setImportCsvProgress('');
      setCsvInput('');
      setParsedCsvRows([]);
      
      // Auto switch back to Editor mode after a few seconds
      setTimeout(() => {
        setImportCsvResult(null);
        setViewMode('editor');
      }, 5000);

    } catch (err: any) {
      console.error("Error importing CSV hierarchy:", err);
      setErrorText(`Import failed: ${err.message || String(err)}`);
      setImportCsvProgress('');
    } finally {
      setIsImportingCsv(false);
    }
  };

  // Submit functions
  const submitRoot = async () => { 
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    if(newRootName.trim()) {
      setLoadingState('root');
      try {
        await addDoc(collection(db, `tournaments/${selectedTournamentId}/roots`), { name: newRootName.trim() });
        setNewRootName('');
        setIsAddingRoot(false);
      } catch(e) {
        handleFirestoreError(e, OperationType.CREATE, `tournaments/${selectedTournamentId}/roots`);
      } finally {
        setLoadingState('none');
      }
    }
  };

  const submitLevel1 = async () => { 
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    if(newLevel1Name.trim() && selectedRootId) {
      setLoadingState('level1');
      try {
        await addDoc(collection(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1`), { name: newLevel1Name.trim(), rootId: selectedRootId });
        setNewLevel1Name('');
        setIsAddingLevel1(false);
      } catch(e) {
        handleFirestoreError(e, OperationType.CREATE, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1`);
      } finally {
        setLoadingState('none');
      }
    }
  };

  const submitLevel2 = async () => { 
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    if(newLevel2Name.trim() && selectedRootId && selectedLevel1Id) {
      setLoadingState('level2');
      try {
        await addDoc(collection(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2`), { name: newLevel2Name.trim(), level1Id: selectedLevel1Id });
        setNewLevel2Name('');
        setIsAddingLevel2(false);
      } catch(e) {
        handleFirestoreError(e, OperationType.CREATE, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2`);
      } finally {
        setLoadingState('none');
      }
    }
  };

  // Delete Hierarchy Items
  const deleteRoot = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    try {
      await deleteDoc(doc(db, `tournaments/${selectedTournamentId}/roots`, id));
      if (selectedRootId === id) {
        setSelectedRootId(null);
        setSelectedLevel1Id(null);
        setSelectedLevel2Id(null);
      }
      setHierarchyToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tournaments/${selectedTournamentId}/roots`);
    }
  };

  const deleteLevel1 = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    try {
      await deleteDoc(doc(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1`, id));
      if (selectedLevel1Id === id) {
        setSelectedLevel1Id(null);
        setSelectedLevel2Id(null);
      }
      setHierarchyToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1`);
    }
  };

  const deleteLevel2 = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    try {
      await deleteDoc(doc(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2`, id));
      if (selectedLevel2Id === id) {
        setSelectedLevel2Id(null);
      }
      setHierarchyToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2`);
    }
  };

  // Assign & Unassign Players
  const assignPlayer = async (player: any) => {
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    if (!selectedRootId || !selectedLevel1Id || !selectedLevel2Id) {
      setErrorText("Missing selection: Please select a Root, Level 1 Team, and Level 2 Chapter.");
      return;
    }
    setErrorText(null);
    try {
      const docRef = doc(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2/${selectedLevel2Id}/players`, player.id);
      await setDoc(docRef, {
        name: player.name,
        age: player.age || '',
        assignedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setErrorText(`Failed to assign player: ${err?.message || String(err)}`);
    }
  };

  const unassignPlayer = async (playerId: string) => {
    if (!selectedTournamentId) {
      setErrorText("No tournament is selected. Please select a tournament first.");
      return;
    }
    if (!selectedRootId || !selectedLevel1Id || !selectedLevel2Id) {
      setErrorText("Missing selection: Please select a Root, Level 1 Team, and Level 2 Chapter.");
      return;
    }
    setErrorText(null);
    try {
      const docRef = doc(db, `tournaments/${selectedTournamentId}/roots/${selectedRootId}/level1/${selectedLevel1Id}/level2/${selectedLevel2Id}/players`, playerId);
      await deleteDoc(docRef);
    } catch (err: any) {
      console.error(err);
      setErrorText(`Failed to unassign player: ${err?.message || String(err)}`);
    }
  };

  const isPlayerAssigned = (playerId: string) => {
    return assignedPlayers.some(p => p.id === playerId);
  };

  // Calculate player stats based on matches and tournament players
  const calculatePlayerStatsMap = (
    tPlayers: any[],
    assigned: any[],
    rts: any[],
    l1s: any[],
    l2s: any[],
    mts: any[],
    fxts: any[]
  ) => {
    const playerStats: Record<string, {
      wins: number;
      losses: number;
      gamesWon: number;
      gamesLost: number;
      pointsScored: number;
      pointsAgainst: number;
      points: number;
      nonFamilyPoints: number;
    }> = {};

    // Initialize
    tPlayers.forEach(p => {
      playerStats[p.id] = { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, points: 0, nonFamilyPoints: 0 };
    });

    const getWinPoints = (type?: string, playerId?: string, groupName?: string) => {
      if (playerId) {
        const assignment = assigned.find(ap => ap.id === playerId);
        if (assignment) {
          const root = rts.find(r => r.id === assignment.rootId);
          const level1 = l1s.find(l1 => l1.id === assignment.level1Id);
          const level2 = l2s.find(l2 => l2.id === assignment.level2Id);

          if (
            root?.name?.toLowerCase().includes('family') ||
            level1?.name?.toLowerCase().includes('family') ||
            level2?.name?.toLowerCase().includes('family')
          ) {
            return 0;
          }
        }
      }

      const t = type?.toLowerCase() || 'league';
      if (t.includes('pre_quarter') || t.includes('pre-quarter') || t.includes('pre quarter')) return 5;
      if (t.includes('quarter') || t.includes('quater')) return 10;
      if (t.includes('semi')) return 15;
      if (t.includes('final')) return 25;
      return 5;
    };

    mts.forEach(match => {
      const fixture = fxts.find(f => f.id === match.fixtureId);
      if (!fixture) return;

      const team1PlayerIds: string[] = [];
      const team2PlayerIds: string[] = [];

      const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
      if (isDoublesMatch) {
        if (fixture.player1aId) team1PlayerIds.push(fixture.player1aId);
        if (fixture.player1bId) team1PlayerIds.push(fixture.player1bId);
        if (fixture.player2aId) team2PlayerIds.push(fixture.player2aId);
        if (fixture.player2bId) team2PlayerIds.push(fixture.player2bId);

        // Fallback
        if (team1PlayerIds.length === 0 && fixture.player1Id) team1PlayerIds.push(fixture.player1Id);
        if (team2PlayerIds.length === 0 && fixture.player2Id) team2PlayerIds.push(fixture.player2Id);
      } else {
        if (fixture.player1Id) team1PlayerIds.push(fixture.player1Id);
        if (fixture.player2Id) team2PlayerIds.push(fixture.player2Id);
      }

      const s = match.scores || {};

      team1PlayerIds.forEach(pId => {
        if (!playerStats[pId]) {
          playerStats[pId] = { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, points: 0, nonFamilyPoints: 0 };
        }
      });
      team2PlayerIds.forEach(pId => {
        if (!playerStats[pId]) {
          playerStats[pId] = { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, points: 0, nonFamilyPoints: 0 };
        }
      });

      const isFamilyCategory = fixture.groupName?.toLowerCase().includes('family');

      // Update P1
      team1PlayerIds.forEach(pId => {
        const winPointsP1 = getWinPoints(fixture.matchType, pId, fixture.groupName);
        if (match.winner === 'player1') {
          playerStats[pId].wins++;
          playerStats[pId].points += winPointsP1;
          if (!isFamilyCategory) {
            playerStats[pId].nonFamilyPoints += winPointsP1;
          }
        } else if (match.winner === 'player2') {
          playerStats[pId].losses++;
        }

        playerStats[pId].gamesWon += Number(match.p1Games || 0);
        playerStats[pId].gamesLost += Number(match.p2Games || 0);
        playerStats[pId].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        playerStats[pId].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
      });

      // Update P2
      team2PlayerIds.forEach(pId => {
        const winPointsP2 = getWinPoints(fixture.matchType, pId, fixture.groupName);
        if (match.winner === 'player2') {
          playerStats[pId].wins++;
          playerStats[pId].points += winPointsP2;
          if (!isFamilyCategory) {
            playerStats[pId].nonFamilyPoints += winPointsP2;
          }
        } else if (match.winner === 'player1') {
          playerStats[pId].losses++;
        }

        playerStats[pId].gamesWon += Number(match.p2Games || 0);
        playerStats[pId].gamesLost += Number(match.p1Games || 0);
        playerStats[pId].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        playerStats[pId].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
      });
    });

    return playerStats;
  };

  const getHierarchyPointsData = () => {
    const isAllMode = selectedTournamentId === 'all';
    const activeRoots = isAllMode ? allTournamentsRoots : roots;
    const activeL1 = isAllMode ? allTournamentsLevel1 : allRootsLevel1;
    const activeL2 = isAllMode ? allTournamentsLevel2 : allRootsLevel2;
    const activeAssigned = isAllMode ? allTournamentsAssignedPlayers : allRootsPlayers;
    const activeTPlayers = isAllMode ? allTournamentsTournamentPlayers : tournamentPlayers;
    const activeMatches = isAllMode ? allTournamentsMatches : matches;
    const activeFixtures = isAllMode ? allTournamentsFixtures : fixtures;

    const playerStatsMap = calculatePlayerStatsMap(
      activeTPlayers,
      activeAssigned,
      activeRoots,
      activeL1,
      activeL2,
      activeMatches,
      activeFixtures
    );

    // Helper to fetch player's Chapter, Parent and Root keys
    const getPlayerLocation = (pId: string) => {
      const p = activeAssigned.find(item => item.id === pId);
      if (!p) return null;
      if (!isAllMode) {
        return {
          chapterKey: p.level2Id || null,
          parentKey: p.level1Id || null,
          rootKey: p.rootId || null
        };
      } else {
        const l2 = activeL2.find(item => item.id === p.level2Id && item.tournamentId === p.tournamentId);
        if (!l2) return null;
        const parent = activeL1.find(l1 => l1.id === l2.level1Id && l1.tournamentId === l2.tournamentId);
        const root = activeRoots.find(r => r.id === l2.rootId && r.tournamentId === l2.tournamentId);

        const rName = (root ? root.name : 'Unknown').trim();
        const pName = (parent ? parent.name : 'Unknown').trim();
        const cName = l2.name.trim();

        return {
          chapterKey: `${rName}::${pName}::${cName}`.toLowerCase(),
          parentKey: `${rName}::${pName}`.toLowerCase(),
          rootKey: rName.toLowerCase()
        };
      }
    };

    // 1. Chapters (Level 2) Stats
    const chapterStatsMap: Record<string, {
      id: string;
      name: string;
      parentName: string;
      rootName: string;
      wins: number;
      losses: number;
      gamesWon: number;
      gamesLost: number;
      pointsScored: number;
      pointsAgainst: number;
      playerCount: number;
      points: number;
    }> = {};

    if (!isAllMode) {
      // Initialize all known Level 2 chapters across all roots
      activeL2.forEach(l2 => {
        const parent = activeL1.find(l1 => l1.id === l2.level1Id);
        const root = activeRoots.find(r => r.id === l2.rootId);
        chapterStatsMap[l2.id] = {
          id: l2.id,
          name: l2.name,
          parentName: parent ? parent.name : 'Unknown',
          rootName: root ? root.name : 'Unknown',
          wins: 0,
          losses: 0,
          gamesWon: 0,
          gamesLost: 0,
          pointsScored: 0,
          pointsAgainst: 0,
          playerCount: 0,
          points: 0
        };
      });

      // Calculate playerCount by assigned players
      activeAssigned.forEach(p => {
        const chId = p.level2Id;
        if (chapterStatsMap[chId]) {
          chapterStatsMap[chId].playerCount++;
        }
      });
    } else {
      // All Tournaments Combined Logic
      activeL2.forEach(l2 => {
        const parent = activeL1.find(l1 => l1.id === l2.level1Id && l1.tournamentId === l2.tournamentId);
        const root = activeRoots.find(r => r.id === l2.rootId && r.tournamentId === l2.tournamentId);
        
        const rName = (root ? root.name : 'Unknown').trim();
        const pName = (parent ? parent.name : 'Unknown').trim();
        const cName = l2.name.trim();
        
        const key = `${rName}::${pName}::${cName}`.toLowerCase();
        
        if (!chapterStatsMap[key]) {
          chapterStatsMap[key] = {
            id: key,
            name: cName,
            parentName: pName,
            rootName: rName,
            wins: 0,
            losses: 0,
            gamesWon: 0,
            gamesLost: 0,
            pointsScored: 0,
            pointsAgainst: 0,
            playerCount: 0,
            points: 0
          };
        }
      });

      // Calculate playerCount for activeAssigned in allMode
      activeAssigned.forEach(p => {
        const l2 = activeL2.find(item => item.id === p.level2Id && item.tournamentId === p.tournamentId);
        if (!l2) return;
        const parent = activeL1.find(l1 => l1.id === l2.level1Id && l1.tournamentId === l2.tournamentId);
        const root = activeRoots.find(r => r.id === l2.rootId && r.tournamentId === l2.tournamentId);

        const rName = (root ? root.name : 'Unknown').trim();
        const pName = (parent ? parent.name : 'Unknown').trim();
        const cName = l2.name.trim();
        
        const key = `${rName}::${pName}::${cName}`.toLowerCase();
        
        if (chapterStatsMap[key]) {
          chapterStatsMap[key].playerCount++;
        }
      });
    }

    // 2. Parent Teams (Level 1) Stats
    const parentStatsMap: Record<string, {
      id: string;
      name: string;
      rootName: string;
      wins: number;
      losses: number;
      gamesWon: number;
      gamesLost: number;
      pointsScored: number;
      pointsAgainst: number;
      chapterCount: number;
      points: number;
    }> = {};

    if (!isAllMode) {
      // Initialize all known Level 1 Parent Teams
      activeL1.forEach(l1 => {
        const root = activeRoots.find(r => r.id === l1.rootId);
        parentStatsMap[l1.id] = {
          id: l1.id,
          name: l1.name,
          rootName: root ? root.name : 'Unknown',
          wins: 0,
          losses: 0,
          gamesWon: 0,
          gamesLost: 0,
          pointsScored: 0,
          pointsAgainst: 0,
          chapterCount: 0,
          points: 0
        };
      });

      // Count chapterCount
      activeL2.forEach(l2 => {
        if (parentStatsMap[l2.level1Id]) {
          parentStatsMap[l2.level1Id].chapterCount++;
        }
      });
    } else {
      // All Tournaments Combined Logic
      activeL1.forEach(l1 => {
        const root = activeRoots.find(r => r.id === l1.rootId && r.tournamentId === l1.tournamentId);
        const rName = (root ? root.name : 'Unknown').trim();
        const pName = l1.name.trim();
        const key = `${rName}::${pName}`.toLowerCase();

        if (!parentStatsMap[key]) {
          parentStatsMap[key] = {
            id: key,
            name: pName,
            rootName: rName,
            wins: 0,
            losses: 0,
            gamesWon: 0,
            gamesLost: 0,
            pointsScored: 0,
            pointsAgainst: 0,
            chapterCount: 0,
            points: 0
          };
        }
      });

      // Count chapterCount in isAllMode
      activeL2.forEach(l2 => {
        const parent = activeL1.find(l1 => l1.id === l2.level1Id && l1.tournamentId === l2.tournamentId);
        const root = activeRoots.find(r => r.id === l2.rootId && r.tournamentId === l2.tournamentId);
        if (!parent) return;
        const rName = (root ? root.name : 'Unknown').trim();
        const pName = parent.name.trim();
        const key = `${rName}::${pName}`.toLowerCase();
        if (parentStatsMap[key]) {
          parentStatsMap[key].chapterCount++;
        }
      });
    }

    // 3. Roots Stats
    const rootStatsMap: Record<string, {
      id: string;
      name: string;
      wins: number;
      losses: number;
      gamesWon: number;
      gamesLost: number;
      pointsScored: number;
      pointsAgainst: number;
      parentCount: number;
      points: number;
    }> = {};

    if (!isAllMode) {
      // Initialize all known Roots
      activeRoots.forEach(r => {
        rootStatsMap[r.id] = {
          id: r.id,
          name: r.name,
          wins: 0,
          losses: 0,
          gamesWon: 0,
          gamesLost: 0,
          pointsScored: 0,
          pointsAgainst: 0,
          parentCount: 0,
          points: 0
        };
      });

      // Count parentCount
      activeL1.forEach(l1 => {
        if (rootStatsMap[l1.rootId]) {
          rootStatsMap[l1.rootId].parentCount++;
        }
      });
    } else {
      // All Tournaments Combined Logic
      activeRoots.forEach(r => {
        const rName = r.name.trim();
        const key = rName.toLowerCase();

        if (!rootStatsMap[key]) {
          rootStatsMap[key] = {
            id: key,
            name: rName,
            wins: 0,
            losses: 0,
            gamesWon: 0,
            gamesLost: 0,
            pointsScored: 0,
            pointsAgainst: 0,
            parentCount: 0,
            points: 0
          };
        }
      });

      // Count parentCount in isAllMode
      activeL1.forEach(l1 => {
        const root = activeRoots.find(r => r.id === l1.rootId && r.tournamentId === l1.tournamentId);
        if (!root) return;
        const rName = root.name.trim();
        const key = rName.toLowerCase();
        if (rootStatsMap[key]) {
          rootStatsMap[key].parentCount++;
        }
      });
    }

    // Accumulate match statistics directly into chapters, parent teams, and roots to ensure no double-counting
    activeMatches.forEach(match => {
      const fixture = activeFixtures.find(f => f.id === match.fixtureId);
      if (!fixture) return;

      const team1PlayerIds: string[] = [];
      const team2PlayerIds: string[] = [];

      const isDoublesMatch = !!(fixture.isDoubles || fixture.player1aId || fixture.player1bId || fixture.player2aId || fixture.player2bId);
      if (isDoublesMatch) {
        if (fixture.player1aId) team1PlayerIds.push(fixture.player1aId);
        if (fixture.player1bId) team1PlayerIds.push(fixture.player1bId);
        if (fixture.player2aId) team2PlayerIds.push(fixture.player2aId);
        if (fixture.player2bId) team2PlayerIds.push(fixture.player2bId);

        // Fallback
        if (team1PlayerIds.length === 0 && fixture.player1Id) team1PlayerIds.push(fixture.player1Id);
        if (team2PlayerIds.length === 0 && fixture.player2Id) team2PlayerIds.push(fixture.player2Id);
      } else {
        if (fixture.player1Id) team1PlayerIds.push(fixture.player1Id);
        if (fixture.player2Id) team2PlayerIds.push(fixture.player2Id);
      }

      const s = match.scores || {};
      const isFamilyCategory = fixture.groupName?.toLowerCase().includes('family');

      // Get match win points based on stage
      const t = fixture.matchType?.toLowerCase() || 'league';
      let matchWinPoints = 5;
      if (t.includes('pre_quarter') || t.includes('pre-quarter') || t.includes('pre quarter')) matchWinPoints = 5;
      else if (t.includes('quarter') || t.includes('quater')) matchWinPoints = 10;
      else if (t.includes('semi')) matchWinPoints = 15;
      else if (t.includes('final')) matchWinPoints = 25;

      const team1Chapters = new Set<string>();
      const team1Parents = new Set<string>();
      const team1Roots = new Set<string>();

      team1PlayerIds.forEach(pId => {
        const loc = getPlayerLocation(pId);
        if (loc) {
          if (loc.chapterKey) team1Chapters.add(loc.chapterKey);
          if (loc.parentKey) team1Parents.add(loc.parentKey);
          if (loc.rootKey) team1Roots.add(loc.rootKey);
        }
      });

      const team2Chapters = new Set<string>();
      const team2Parents = new Set<string>();
      const team2Roots = new Set<string>();

      team2PlayerIds.forEach(pId => {
        const loc = getPlayerLocation(pId);
        if (loc) {
          if (loc.chapterKey) team2Chapters.add(loc.chapterKey);
          if (loc.parentKey) team2Parents.add(loc.parentKey);
          if (loc.rootKey) team2Roots.add(loc.rootKey);
        }
      });

      // Update Team 1 Chapter, Parent and Root Stats
      team1Chapters.forEach(chKey => {
        if (chapterStatsMap[chKey]) {
          if (match.winner === 'player1') {
            chapterStatsMap[chKey].wins++;
            chapterStatsMap[chKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player2') {
            chapterStatsMap[chKey].losses++;
          }
          chapterStatsMap[chKey].gamesWon += Number(match.p1Games || 0);
          chapterStatsMap[chKey].gamesLost += Number(match.p2Games || 0);
          chapterStatsMap[chKey].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
          chapterStatsMap[chKey].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        }
      });

      team1Parents.forEach(pKey => {
        if (parentStatsMap[pKey]) {
          if (match.winner === 'player1') {
            parentStatsMap[pKey].wins++;
            parentStatsMap[pKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player2') {
            parentStatsMap[pKey].losses++;
          }
          parentStatsMap[pKey].gamesWon += Number(match.p1Games || 0);
          parentStatsMap[pKey].gamesLost += Number(match.p2Games || 0);
          parentStatsMap[pKey].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
          parentStatsMap[pKey].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        }
      });

      team1Roots.forEach(rKey => {
        if (rootStatsMap[rKey]) {
          if (match.winner === 'player1') {
            rootStatsMap[rKey].wins++;
            rootStatsMap[rKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player2') {
            rootStatsMap[rKey].losses++;
          }
          rootStatsMap[rKey].gamesWon += Number(match.p1Games || 0);
          rootStatsMap[rKey].gamesLost += Number(match.p2Games || 0);
          rootStatsMap[rKey].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
          rootStatsMap[rKey].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        }
      });

      // Update Team 2 Chapter, Parent and Root Stats
      team2Chapters.forEach(chKey => {
        if (chapterStatsMap[chKey]) {
          if (match.winner === 'player2') {
            chapterStatsMap[chKey].wins++;
            chapterStatsMap[chKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player1') {
            chapterStatsMap[chKey].losses++;
          }
          chapterStatsMap[chKey].gamesWon += Number(match.p2Games || 0);
          chapterStatsMap[chKey].gamesLost += Number(match.p1Games || 0);
          chapterStatsMap[chKey].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
          chapterStatsMap[chKey].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        }
      });

      team2Parents.forEach(pKey => {
        if (parentStatsMap[pKey]) {
          if (match.winner === 'player2') {
            parentStatsMap[pKey].wins++;
            parentStatsMap[pKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player1') {
            parentStatsMap[pKey].losses++;
          }
          parentStatsMap[pKey].gamesWon += Number(match.p2Games || 0);
          parentStatsMap[pKey].gamesLost += Number(match.p1Games || 0);
          parentStatsMap[pKey].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
          parentStatsMap[pKey].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        }
      });

      team2Roots.forEach(rKey => {
        if (rootStatsMap[rKey]) {
          if (match.winner === 'player2') {
            rootStatsMap[rKey].wins++;
            rootStatsMap[rKey].points += isFamilyCategory ? 0 : matchWinPoints;
          } else if (match.winner === 'player1') {
            rootStatsMap[rKey].losses++;
          }
          rootStatsMap[rKey].gamesWon += Number(match.p2Games || 0);
          rootStatsMap[rKey].gamesLost += Number(match.p1Games || 0);
          rootStatsMap[rKey].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
          rootStatsMap[rKey].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        }
      });
    });

    // Show all roots in the standings
    const targetRootsList = Object.values(rootStatsMap);

    // Sort helper: sort descending by calculated Points, then Wins, then GD, then PD, then name
    const sortStatsList = (list: any[]) => {
      return [...list].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;

        const aGD = a.gamesWon - a.gamesLost;
        const bGD = b.gamesWon - b.gamesLost;
        if (bGD !== aGD) return bGD - aGD;

        const aPD = a.pointsScored - a.pointsAgainst;
        const bPD = b.pointsScored - b.pointsAgainst;
        if (bPD !== aPD) return bPD - aPD;

        return a.name.localeCompare(b.name);
      });
    };

    return {
      chapters: sortStatsList(Object.values(chapterStatsMap)),
      parents: sortStatsList(Object.values(parentStatsMap)),
      roots: sortStatsList(targetRootsList)
    };
  };

  // Filter pool of tournament players based on search query and assignment status
  const filteredPlayers = tournamentPlayers.filter(p => {
    // Hide player if they are already assigned in ANY roster (allRootsPlayers contains all assignments)
    const isAssignedAnywhere = allRootsPlayers.some(ap => ap.id === p.id);
    if (isAssignedAnywhere) return false;

    return p.name.toLowerCase().includes(playerSearch.toLowerCase());
  });

  const activeRootName = roots.find(r => r.id === selectedRootId)?.name;
  const activeLevel1Name = level1.find(l => l.id === selectedLevel1Id)?.name;
  const activeLevel2Name = level2.find(l => l.id === selectedLevel2Id)?.name;

  return (
    <div className="space-y-8 font-sans">
      
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-indigo-500" />
            Master Hierarchy
            {!isAdmin && (
              <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                👁️ Read-Only
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Build and view your master roots, parent teams, chapters, and player rosters.
          </p>

          {/* Tournament context switcher / dropdown */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tournament Context:</span>
            <select
              value={selectedTournamentId || ''}
              onChange={(e) => {
                setSelectedTournamentId(e.target.value || undefined);
                setSelectedRootId(null);
                setSelectedLevel1Id(null);
                setSelectedLevel2Id(null);
              }}
              className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-xs"
            >
              <option value="">-- Select Tournament --</option>
              <option value="all">🌟 All Tournaments (Calculate All Data)</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          
          {/* Selected Hierarchy Breadcrumbs */}
          {(selectedRootId || selectedLevel1Id || selectedLevel2Id) && (
            <div className="flex flex-wrap items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-100 mt-3 w-fit">
              {activeRootName && (
                <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{activeRootName}</span>
              )}
              {activeLevel1Name && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{activeLevel1Name}</span>
                </>
              )}
              {activeLevel2Name && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{activeLevel2Name}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* View Switcher Toggle Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 overflow-x-auto max-w-full pb-2 md:pb-1.5 scrollbar-thin">
          <button
            onClick={() => setViewMode('chain')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
              viewMode === 'chain'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Activity className="w-4 h-4" />
            Chain Explorer
          </button>
          {isAdmin && (
            <button
              onClick={() => setViewMode('editor')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
                viewMode === 'editor'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              Data Editor
            </button>
          )}
          <button
            onClick={() => setViewMode('points')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
              viewMode === 'points'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Points Standings
          </button>
          {isAdmin && (
            <button
              onClick={() => setViewMode('upload')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
                viewMode === 'upload'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload CSV/Spreadsheet
            </button>
          )}
        </div>
      </div>

      {!selectedTournamentId ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4">
          <div className="mx-auto w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center border border-indigo-100 shadow-xs">
            <FolderTree className="w-8 h-8 animate-pulse" />
          </div>
          <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Select Tournament Context</h3>
          <p className="text-slate-500 text-xs leading-relaxed">
            Please choose a tournament from the dropdown at the top of the card to explore and manage its master hierarchy, point standings, and chapter rosters.
          </p>
          <div className="pt-2">
            <select
              value={selectedTournamentId || ''}
              onChange={(e) => {
                setSelectedTournamentId(e.target.value || undefined);
                setSelectedRootId(null);
                setSelectedLevel1Id(null);
                setSelectedLevel2Id(null);
              }}
              className="w-full bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-center"
            >
              <option value="">-- Choose Tournament --</option>
              <option value="all">🌟 All Tournaments (Calculate All Data)</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <>
          {viewMode === 'chain' ? (
            selectedTournamentId === 'all' ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4 my-6 flex flex-col items-center justify-center">
                <div className="mx-auto w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center border border-amber-100 shadow-xs">
                  <FolderTree className="w-8 h-8" />
                </div>
                <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Tournament-Specific Feature</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Visualizing the hierarchical chain roster is a tournament-specific feature. 
                  Please choose a single, specific tournament from the <strong>Tournament Context</strong> dropdown at the top to explore and assign rosters.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setViewMode('points')}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/10"
                  >
                    Go to Points Standings
                  </button>
                </div>
              </div>
            ) : (
        <div className="space-y-6">
          
          {/* ROOT SELECTOR CHIPS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Root Base to visualize</p>
            <div className="flex flex-wrap gap-2">
              {roots.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No roots added yet. Go to "Data Editor" to add roots first.</p>
              ) : (
                roots.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRootId(r.id);
                      setSelectedLevel1Id(null);
                      setSelectedLevel2Id(null);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                      selectedRootId === r.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/15'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {r.name}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* BRACKET WORKSPACE */}
          {selectedRootId ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
              {/* Header inside visualization box */}
              <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    Connected Master Bracket
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Click any node to select/activate and inspect its details</p>
                </div>
                
                <div className="flex items-center gap-6 text-[11px] font-bold text-slate-400 bg-slate-800 px-3.5 py-1.5 rounded-xl">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-indigo-500" /> Root Base</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-indigo-600" /> Parent (L1)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-600" /> Chapter (L2)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-slate-400" /> Player</span>
                </div>
              </div>

              {/* The Bracket Tree Workspace */}
              <div className="p-8 bg-slate-50 overflow-auto select-none scrollbar-thin max-h-[800px]">
                <div className="flex flex-col items-center min-w-max py-6 px-4">
                  
                  {/* ROOT CARD (ROW 1) */}
                  <div className="flex flex-col items-center relative pb-8">
                    <div className="w-64 p-5 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-2xl shadow-lg border border-indigo-400 relative z-10 text-center">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] uppercase font-black tracking-widest text-indigo-200">Base Root</span>
                        <FolderOpen className="w-4 h-4 text-indigo-300" />
                      </div>
                      <p className="font-extrabold text-base truncate" title={activeRootName}>{activeRootName}</p>
                      <div className="flex justify-center mt-2">
                        <p className="text-xs text-indigo-200 font-semibold bg-indigo-900/40 px-2.5 py-1 rounded-lg w-fit">
                          {level1.length} Parent Teams
                        </p>
                      </div>
                    </div>
                    {/* Line going straight down from Root */}
                    {level1.length > 0 && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[2px] h-8 bg-indigo-300" />
                    )}
                  </div>

                  {/* LEVEL 1, 2 AND PLAYERS TREE CONTAINER (ROW 2+) */}
                  {level1.length === 0 ? (
                    <div className="flex flex-col justify-center items-center py-12 px-8 text-center text-slate-400 w-96 border border-dashed border-slate-200 rounded-2xl bg-white">
                      <HelpCircle className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs font-bold text-slate-600">No Level 1 Teams Added</p>
                      <p className="text-[11px] mt-1 max-w-xs text-slate-400">Go to "Data Editor" to add Level 1 Parent Teams under this root base.</p>
                    </div>
                  ) : (
                    <div className="relative pt-8">
                      <div className="flex items-start gap-12 relative">
                        {level1.map((l1, l1Idx) => {
                          const isL1Selected = selectedLevel1Id === l1.id;
                          const chapters = allLevel2[l1.id] || [];
                          
                          return (
                            <div key={l1.id} className="flex flex-col items-center relative w-80 shrink-0">
                              {/* Horizontal connector lines left & right halves to build the perfect connector bar */}
                              {l1Idx > 0 && (
                                <div className="absolute -top-8 left-0 right-1/2 h-[2px] bg-indigo-300" />
                              )}
                              {l1Idx < level1.length - 1 && (
                                <div className="absolute -top-8 left-1/2 right-0 h-[2px] bg-indigo-300" />
                              )}
                              {/* Vertical drop line directly to Level 1 card */}
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-[2px] h-8 bg-indigo-300" />
                              
                              {/* Level 1 Team Card */}
                              <div
                                onClick={() => {
                                  setSelectedLevel1Id(l1.id);
                                  setSelectedLevel2Id(null);
                                }}
                                className={`w-56 p-4 rounded-xl border cursor-pointer transition-all duration-300 text-center transform hover:scale-[1.02] hover:-translate-y-0.5 relative z-10 ${
                                  isL1Selected
                                    ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-indigo-400 shadow-md ring-4 ring-indigo-500/10'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className={`text-[9px] uppercase font-bold tracking-wider ${isL1Selected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                    Level 1 Parent
                                  </span>
                                  <Users className={`w-4 h-4 ${isL1Selected ? 'text-indigo-200' : 'text-indigo-500'}`} />
                                </div>
                                <p className="font-extrabold text-xs truncate" title={l1.name}>{l1.name}</p>
                                <p className={`text-[10px] mt-1.5 font-semibold ${isL1Selected ? 'text-indigo-100' : 'text-slate-500'}`}>
                                  {chapters.length} Chapters
                                </p>
                              </div>

                              {/* Vertical line connecting Level 1 to its Level 2 list */}
                              {chapters.length > 0 && (
                                <div className="w-[2px] h-8 bg-emerald-300" />
                              )}

                              {/* Level 2 Chapters Vertical Container */}
                              {chapters.length > 0 && (
                                <div className="flex flex-col gap-10 relative items-center w-full">
                                  {chapters.map((l2, l2Idx) => {
                                    const isL2Selected = selectedLevel2Id === l2.id;
                                    const players = allChapterPlayers[l2.id] || [];
                                    
                                    return (
                                      <div key={l2.id} className="flex flex-col items-center relative w-full">
                                        {/* Segmented vertical lines between Level 2 nodes */}
                                        {l2Idx > 0 && (
                                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[2px] h-10 bg-emerald-200" />
                                        )}
                                        
                                        {/* Level 2 Chapter Card */}
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedLevel1Id(l1.id);
                                            setSelectedLevel2Id(l2.id);
                                          }}
                                          className={`w-48 p-3.5 rounded-xl border cursor-pointer transition-all duration-300 text-center transform hover:scale-[1.02] hover:-translate-y-0.5 relative z-10 ${
                                            isL2Selected
                                              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-md ring-4 ring-emerald-500/10'
                                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <span className={`text-[8px] uppercase font-bold tracking-wider ${isL2Selected ? 'text-emerald-200' : 'text-slate-400'}`}>
                                              Level 2 Chapter
                                            </span>
                                            <BookOpen className={`w-3.5 h-3.5 ${isL2Selected ? 'text-emerald-200' : 'text-emerald-500'}`} />
                                          </div>
                                          <p className="font-extrabold text-[11px] truncate" title={l2.name}>{l2.name}</p>
                                          <p className={`text-[9px] mt-1 font-semibold ${isL2Selected ? 'text-emerald-100' : 'text-slate-500'}`}>
                                            {players.length} Players Assigned
                                          </p>
                                        </div>

                                        {/* Vertical connector line straight down to Players */}
                                        {players.length > 0 && (
                                          <div className="w-[2px] h-6 bg-slate-300" />
                                        )}

                                        {/* Players nested vertically beneath Chapter */}
                                        {players.length > 0 && (
                                          <div className="flex flex-col gap-2 relative py-1 items-center w-full z-10">
                                            {/* Dotted backbone behind player nodes */}
                                            <div className="absolute top-0 bottom-4 left-1/2 -translate-x-1/2 w-[1px] border-l border-dashed border-slate-300" />
                                            
                                            {players.filter((p, index, self) =>
                                              index === self.findIndex((t) => (
                                                t.name === p.name
                                              ))
                                            ).map((p) => (
                                              <div key={p.id} className="relative flex items-center justify-center w-40 z-10">
                                                {/* Player Node Card */}
                                                <div className="w-full px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between shadow-xs transition duration-150">
                                                  <div className="truncate text-left pr-1">
                                                    <p className="font-bold text-[10px] text-slate-700 truncate" title={p.name}>{p.name}</p>
                                                  </div>
                                                  <div className="w-4.5 h-4.5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                                                    <UserCheck className="w-3.5 h-3.5" />
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-inner">
                <FolderTree className="w-8 h-8" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className="text-lg font-extrabold text-slate-800">Select a Master Root</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Click on one of the base roots above to load its complete visual hierarchy bracket, from parent teams to chapter rosters.
                </p>
              </div>
            </div>
          )}
        </div>
            )
      ) : viewMode === 'editor' ? (
        selectedTournamentId === 'all' ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4 my-6 flex flex-col items-center justify-center">
            <div className="mx-auto w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center border border-amber-100 shadow-xs">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Tournament-Specific Feature</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Modifying roots, parent teams, or chapters is a tournament-specific feature. 
              Please choose a single, specific tournament from the <strong>Tournament Context</strong> dropdown at the top to configure the organization hierarchy.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setViewMode('points')}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/10"
              >
                Go to Points Standings
              </button>
            </div>
          </div>
        ) : (
        <div className="space-y-6">
          {/* Copy Setup Panel */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                <Copy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Copy Hierarchy Setup</h3>
                <p className="text-xs text-slate-500">Replicate the complete Roots, Parent Teams (L1), and Chapters (L2) setup with identical IDs from another tournament.</p>
              </div>
            </div>
            
            {!showCopyConfirm ? (
              <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                <div className="flex-1 w-full space-y-1">
                  <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Source Tournament</label>
                  <select
                    value={copySourceTournamentId}
                    onChange={(e) => {
                      setCopySourceTournamentId(e.target.value);
                      setErrorText(null);
                    }}
                    className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    disabled={isCopying}
                  >
                    <option value="">-- Select Tournament to Copy --</option>
                    {tournaments
                      .filter(t => t.id !== selectedTournamentId)
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name || t.id}
                        </option>
                      ))
                    }
                  </select>
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    if (!copySourceTournamentId) {
                      setErrorText("Please select a source tournament to copy from.");
                      return;
                    }
                    setErrorText(null);
                    setShowCopyConfirm(true);
                  }}
                  disabled={isCopying || !copySourceTournamentId}
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm shrink-0 font-sans"
                >
                  <Copy className="w-4 h-4" />
                  Copy & Save Setup
                </button>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl space-y-3">
                <p className="text-xs text-amber-800 font-medium leading-relaxed">
                  Are you sure you want to copy the master hierarchy? This will save all Roots, Parent Teams (L1), and Chapters (L2) from the selected tournament into the current tournament with the same IDs.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopyHierarchy}
                    disabled={isCopying}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5"
                  >
                    {isCopying ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Copying...
                      </>
                    ) : (
                      "Yes, Copy Setup"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCopyConfirm(false)}
                    disabled={isCopying}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {copyStatusMessage && (
              <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3.5 py-2.5 rounded-xl border border-emerald-100 flex items-center gap-2 animate-pulse">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{copyStatusMessage}</span>
              </div>
            )}
          </div>

          {/* 3-Column Hierarchy Builder */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* COLUMN 1: Roots */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[380px]">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm uppercase tracking-wider">
                  <FolderOpen className="w-4 h-4 text-indigo-500" />
                  Roots (Base)
                </h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                  {roots.length}
                </span>
              </div>

              <div className="p-4 flex-1 flex flex-col space-y-3">
                {isAddingRoot ? (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <input
                      type="text"
                      value={newRootName}
                      onChange={(e) => setNewRootName(e.target.value)}
                      placeholder="Root Name (e.g. Club / Area)"
                      className="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={submitRoot} 
                        disabled={loadingState === 'root' || !newRootName.trim()} 
                        className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
                      >
                        {loadingState === 'root' ? 'Saving...' : 'Save'}
                      </button>
                      <button 
                        onClick={() => { setIsAddingRoot(false); setNewRootName(''); }} 
                        className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsAddingRoot(true)} 
                    className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl border border-dashed border-indigo-200 flex items-center justify-center gap-1 transition"
                  >
                    <Plus className="w-4 h-4" /> Add Root
                  </button>
                )}

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px] scrollbar-thin">
                  {roots.length === 0 ? (
                    <p className="text-slate-400 text-xs text-center py-8">No Roots added yet.</p>
                  ) : (
                    roots.map(r => (
                      <div 
                        key={r.id} 
                        onClick={() => {
                          setSelectedRootId(r.id);
                          setSelectedLevel1Id(null);
                          setSelectedLevel2Id(null);
                        }} 
                        className={`group cursor-pointer p-3 rounded-xl flex items-center justify-between border transition ${
                          selectedRootId === r.id 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold' 
                            : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'
                        }`}
                      >
                        <span className="truncate">{r.name}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setHierarchyToDelete({ type: 'root', id: r.id, name: r.name }); }}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete Root"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* COLUMN 2: Parent Teams (Level 1) */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[380px]">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm uppercase tracking-wider">
                  <Users className="w-4 h-4 text-indigo-500" />
                  Parent Teams (L1)
                </h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                  {level1.length}
                </span>
              </div>

              <div className="p-4 flex-1 flex flex-col space-y-3">
                {!selectedRootId ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-1.5">
                    <HelpCircle className="w-8 h-8 text-slate-300" />
                    <p className="text-xs">Select a Root first to view or add Level 1 Parent Teams.</p>
                  </div>
                ) : (
                  <>
                    {isAddingLevel1 ? (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                        <input
                          type="text"
                          value={newLevel1Name}
                          onChange={(e) => setNewLevel1Name(e.target.value)}
                          placeholder="Team Name (e.g. Region North)"
                          className="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={submitLevel1} 
                            disabled={loadingState === 'level1' || !newLevel1Name.trim()} 
                            className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
                          >
                            {loadingState === 'level1' ? 'Saving...' : 'Save'}
                          </button>
                          <button 
                            onClick={() => { setIsAddingLevel1(false); setNewLevel1Name(''); }} 
                            className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setIsAddingLevel1(true)} 
                        className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl border border-dashed border-indigo-200 flex items-center justify-center gap-1 transition"
                      >
                        <Plus className="w-4 h-4" /> Add Level 1
                      </button>
                    )}

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px] scrollbar-thin">
                      {level1.length === 0 ? (
                        <p className="text-slate-400 text-xs text-center py-8">No Level 1 Teams added yet.</p>
                      ) : (
                        level1.map(l => (
                          <div 
                            key={l.id} 
                            onClick={() => {
                              setSelectedLevel1Id(l.id);
                              setSelectedLevel2Id(null);
                            }} 
                            className={`group cursor-pointer p-3 rounded-xl flex items-center justify-between border transition ${
                              selectedLevel1Id === l.id 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold' 
                                : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'
                            }`}
                          >
                            <span className="truncate">{l.name}</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setHierarchyToDelete({ type: 'level1', id: l.id, name: l.name }); }}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete Team"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* COLUMN 3: Chapters (Level 2) */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[380px]">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm uppercase tracking-wider">
                  <BookOpen className="w-4 h-4 text-emerald-500" />
                  Chapters (L2)
                </h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                  {level2.length}
                </span>
              </div>

              <div className="p-4 flex-1 flex flex-col space-y-3">
                {!selectedLevel1Id ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-1.5">
                    <HelpCircle className="w-8 h-8 text-slate-300" />
                    <p className="text-xs">Select a Parent Team (Level 1) first to view or add Chapters.</p>
                  </div>
                ) : (
                  <>
                    {isAddingLevel2 ? (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                        <input
                          type="text"
                          value={newLevel2Name}
                          onChange={(e) => setNewLevel2Name(e.target.value)}
                          placeholder="Chapter Name (e.g. Chapter Alpha)"
                          className="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={submitLevel2} 
                            disabled={loadingState === 'level2' || !newLevel2Name.trim()} 
                            className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
                          >
                            {loadingState === 'level2' ? 'Saving...' : 'Save'}
                          </button>
                          <button 
                            onClick={() => { setIsAddingLevel2(false); setNewLevel2Name(''); }} 
                            className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setIsAddingLevel2(true)} 
                        className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl border border-dashed border-emerald-200 flex items-center justify-center gap-1 transition"
                      >
                        <Plus className="w-4 h-4 text-emerald-600" /> Add Level 2 Chapter
                      </button>
                    )}

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px] scrollbar-thin">
                      {level2.length === 0 ? (
                        <p className="text-slate-400 text-xs text-center py-8">No Level 2 Chapters added yet.</p>
                      ) : (
                        level2.map(l => (
                          <div 
                            key={l.id} 
                            onClick={() => setSelectedLevel2Id(l.id)} 
                            className={`group cursor-pointer p-3 rounded-xl flex items-center justify-between border transition ${
                              selectedLevel2Id === l.id 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold' 
                                : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'
                            }`}
                          >
                            <span className="truncate">{l.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full opacity-100 group-hover:opacity-0 transition-opacity">
                                Assign Players
                              </span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setHierarchyToDelete({ type: 'level2', id: l.id, name: l.name }); }}
                                className="p-1 text-slate-400 hover:text-rose-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete Chapter"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
            )
      ) : null}

      {/* CSV/Spreadsheet Hierarchy Upload View */}
      {viewMode === 'upload' && (
        selectedTournamentId === 'all' ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4 my-6 flex flex-col items-center justify-center">
            <div className="mx-auto w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center border border-amber-100 shadow-xs">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Tournament-Specific Feature</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Uploading a hierarchy dataset via CSV or spreadsheet is a tournament-specific feature. 
              Please choose a single, specific tournament from the <strong>Tournament Context</strong> dropdown at the top to import its structure.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setViewMode('points')}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/10"
              >
                Go to Points Standings
              </button>
            </div>
          </div>
        ) : (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">CSV/Spreadsheet Hierarchy Importer</h3>
              <p className="text-xs text-slate-500">Bulk import Root Bases, Level 1 Parent Teams, and Level 2 Chapters into this tournament.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-xs text-slate-600 leading-relaxed space-y-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                How to use the Importer:
              </div>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Copy rows from your Excel, Google Sheets, or a text CSV file.</li>
                <li>Ensure the columns contain <strong>Root Base</strong>, optional <strong>Level 1 Parent Team</strong>, and <strong>Level 2 Chapter (L2)</strong>.</li>
                <li>The system will match headers or assign positionally (Column 1: Root, Column 2: Level 1, Column 3: Level 2).</li>
                <li>Blank Root/Level 1 values are automatically inherited from preceding rows (perfect for grouped layouts!).</li>
                <li>Duplicate structures will be matched automatically to prevent duplicates.</li>
              </ol>

              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const sample = `root\tL2\nBiju Joseph\tteam 1\tVelocity\nBiju Joseph\t\tZeal\nBiju Joseph\t\tKinetic`;
                    handleParseCsv(sample);
                  }}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition text-[10px]"
                >
                  📋 Load Sample Template
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Paste Spreadsheet Data (Tab/Comma separated)
              </label>
              <textarea
                value={csvInput}
                onChange={(e) => handleParseCsv(e.target.value)}
                placeholder={`root\tL2\nBiju Joseph\tteam 1\tVelocity\nBiju Joseph\t\tZeal\nBiju Joseph\t\tKinetic`}
                rows={7}
                className="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>

            {parsedCsvRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                    Parsed Rows Preview ({parsedCsvRows.length} rows)
                  </h4>
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <span className="text-emerald-600">Valid: {parsedCsvRows.filter(r => r.isValid).length}</span>
                    {parsedCsvRows.some(r => !r.isValid) && (
                      <span className="text-rose-600">Invalid: {parsedCsvRows.filter(r => !r.isValid).length}</span>
                    )}
                  </div>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm max-h-[300px] overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs text-slate-600">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-extrabold">
                        <th className="p-3 pl-4 w-12 text-center">Row</th>
                        <th className="p-3">Root Base</th>
                        <th className="p-3">Level 1 (Parent Team)</th>
                        <th className="p-3">Level 2 (Chapter/Category)</th>
                        <th className="p-3 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {parsedCsvRows.map((row, idx) => (
                        <tr key={idx} className={row.isValid ? "hover:bg-slate-50/50" : "bg-rose-50/30 hover:bg-rose-50/50"}>
                          <td className="p-3 pl-4 text-center font-bold text-slate-400">{row.rowNum}</td>
                          <td className="p-3 font-semibold text-slate-700">{row.rootName}</td>
                          <td className="p-3 font-medium text-slate-600">{row.level1Name}</td>
                          <td className="p-3 font-black text-slate-800">{row.level2Name}</td>
                          <td className="p-3 pr-4">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                <CheckCircle className="w-3 h-3" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full font-bold text-[10px]" title={row.error}>
                                ⚠️ Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {errorText && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700 font-medium">
                    {errorText}
                  </div>
                )}

                {importCsvProgress && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-3 text-xs text-indigo-700 font-bold">
                    <span className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                    <span>{importCsvProgress}</span>
                  </div>
                )}

                {importCsvResult && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1.5 text-xs text-emerald-800">
                    <p className="font-extrabold flex items-center gap-1.5">
                      <CheckCircle className="w-4.5 h-4.5 text-emerald-600" />
                      Import Completed Successfully!
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5 font-semibold">
                      <li>Roots Created/Mapped: {importCsvResult.rootsAdded}</li>
                      <li>Parent Teams (Level 1) Created/Mapped: {importCsvResult.l1Added}</li>
                      <li>Chapters (Level 2) Created/Mapped: {importCsvResult.l2Added}</li>
                    </ul>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleImportCsv}
                    disabled={isImportingCsv || parsedCsvRows.filter(r => r.isValid).length === 0}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isImportingCsv ? (
                      <>Importing Hierarchy...</>
                    ) : (
                      <>🚀 Import {parsedCsvRows.filter(r => r.isValid).length} Valid Hierarchy Structures</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvInput('');
                      setParsedCsvRows([]);
                    }}
                    disabled={isImportingCsv}
                    className="px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
            )
      )}

      {/* POINTS STANDINGS DASHBOARD */}
      {viewMode === 'points' && (() => {
        const stats = getHierarchyPointsData();
        return (
          <div className="space-y-6">
            {/* Top Info Banner / Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Target Roots</p>
                  <p className="text-sm font-black text-slate-800">BJU, JCF, DS Mehta</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Points System</p>
                  <p className="text-sm font-black text-slate-800">League: 5 | QF: 10 | SF: 15 | Final: 25</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Core Principle</p>
                  <p className="text-[11px] font-semibold text-slate-600 leading-tight">Players sum to Chapters, Chapters sum to Parents, Parents sum to Roots.</p>
                </div>
              </div>
            </div>

            {/* Nested Sub-tabs */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 flex-wrap">
                    Cumulative Multi-Level Standings
                    {selectedTournamentId === 'all' && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        All Tournaments Combined
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedTournamentId === 'all' 
                      ? 'Aggregating points, wins, and losses dynamically across all tournaments' 
                      : 'Real-time point aggregation synchronized down to individual player matches'}
                  </p>
                </div>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setPointsSubTab('roots')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      pointsSubTab === 'roots'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    Roots Standings
                  </button>
                  <button
                    onClick={() => setPointsSubTab('parents')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      pointsSubTab === 'parents'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    Parent Teams
                  </button>
                  <button
                    onClick={() => setPointsSubTab('chapters')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      pointsSubTab === 'chapters'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    Chapters (L2)
                  </button>
                </div>
              </div>

              {/* Table rendering based on active subtab */}
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                {pointsSubTab === 'roots' && (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                        <th className="p-3.5 text-left font-bold text-xs uppercase tracking-wider">Root Name</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Parents Count</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Wins</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Losses</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Total Games</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Games Diff</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider font-mono text-slate-600 bg-indigo-50/20 text-indigo-700">Accumulated Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.roots.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-semibold text-xs">
                            No roots found. Add master roots in the Hierarchy tab.
                          </td>
                        </tr>
                      ) : (
                        stats.roots.map((r, idx) => {
                          const played = r.wins + r.losses;
                          const gameDiff = r.gamesWon - r.gamesLost;
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-3.5 text-left font-extrabold text-slate-800 flex items-center gap-2">
                                <span className="w-5.5 h-5.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black flex items-center justify-center">
                                  #{idx + 1}
                                </span>
                                {r.name}
                              </td>
                              <td className="p-3.5 text-center font-semibold text-slate-600">{r.parentCount} Parents</td>
                              <td className="p-3.5 text-center font-bold text-emerald-600">{r.wins}</td>
                              <td className="p-3.5 text-center font-bold text-rose-500">{r.losses}</td>
                              <td className="p-3.5 text-center text-slate-500 font-mono">{played}</td>
                              <td className={`p-3.5 text-center font-bold font-mono ${gameDiff > 0 ? 'text-emerald-600' : gameDiff < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                {gameDiff > 0 ? `+${gameDiff}` : gameDiff}
                              </td>
                              <td className="p-3.5 text-center font-black text-indigo-600 bg-indigo-50/30 text-base">{r.points} Pts</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {pointsSubTab === 'parents' && (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                        <th className="p-3.5 text-left font-bold text-xs uppercase tracking-wider">Parent Team Name</th>
                        <th className="p-3.5 text-left font-bold text-xs uppercase tracking-wider">Root Group</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Chapters</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Wins</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Losses</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Games Diff</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider bg-indigo-50/40 text-indigo-700">Accumulated Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.parents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-semibold text-xs">
                            No Parent Teams found in any roots.
                          </td>
                        </tr>
                      ) : (
                        stats.parents.map((p, idx) => {
                          const gameDiff = p.gamesWon - p.gamesLost;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-3.5 text-left font-extrabold text-slate-800 flex items-center gap-2">
                                <span className="w-5.5 h-5.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black flex items-center justify-center">
                                  #{idx + 1}
                                </span>
                                {p.name}
                              </td>
                              <td className="p-3.5 text-left text-slate-500 font-bold text-xs">
                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{p.rootName}</span>
                              </td>
                              <td className="p-3.5 text-center font-semibold text-slate-600">{p.chapterCount} Chapters</td>
                              <td className="p-3.5 text-center font-bold text-emerald-600">{p.wins}</td>
                              <td className="p-3.5 text-center font-bold text-rose-500">{p.losses}</td>
                              <td className={`p-3.5 text-center font-bold font-mono ${gameDiff > 0 ? 'text-emerald-600' : gameDiff < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                {gameDiff > 0 ? `+${gameDiff}` : gameDiff}
                              </td>
                              <td className="p-3.5 text-center font-black text-indigo-600 bg-indigo-50/30 text-sm">{p.points} Pts</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {pointsSubTab === 'chapters' && (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                        <th className="p-3.5 text-left font-bold text-xs uppercase tracking-wider">Chapter Name</th>
                        <th className="p-3.5 text-left font-bold text-xs uppercase tracking-wider">Parent Team</th>
                        <th className="p-3.5 text-left font-bold text-xs uppercase tracking-wider">Root Base</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Players</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Wins</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider">Losses</th>
                        <th className="p-3.5 text-center font-bold text-xs uppercase tracking-wider bg-indigo-50/40 text-indigo-700">Accumulated Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.chapters.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-semibold text-xs">
                            No Chapters found in any parent teams.
                          </td>
                        </tr>
                      ) : (
                        stats.chapters.map((ch, idx) => (
                          <tr key={ch.id} className="hover:bg-slate-50/50 transition">
                            <td className="p-3.5 text-left font-extrabold text-slate-800 flex items-center gap-2">
                              <span className="w-5.5 h-5.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black flex items-center justify-center">
                                #{idx + 1}
                              </span>
                              {ch.name}
                            </td>
                            <td className="p-3.5 text-left text-slate-500 font-bold text-xs">{ch.parentName}</td>
                            <td className="p-3.5 text-left text-slate-400 font-bold text-xs">{ch.rootName}</td>
                            <td className="p-3.5 text-center font-semibold text-slate-600">{ch.playerCount} Players</td>
                            <td className="p-3.5 text-center font-bold text-emerald-600">{ch.wins}</td>
                            <td className="p-3.5 text-center font-bold text-rose-500">{ch.losses}</td>
                            <td className="p-3.5 text-center font-black text-indigo-600 bg-indigo-50/30 text-sm">{ch.points} Pts</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* PLAYER ASSIGNMENT DASHBOARD */}
      {viewMode !== 'points' && viewMode !== 'upload' && (
        <>
          {selectedLevel2Id ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300 mt-8">
              <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-xs uppercase font-bold text-indigo-300 tracking-wider">Level 2 Roster Assignment</span>
                  <h3 className="text-xl font-bold mt-0.5 flex items-center gap-2 text-white">
                    <Users className="w-5.5 h-5.5 text-emerald-400" />
                    Assign Players to Chapter: <span className="text-yellow-300 font-extrabold">{activeLevel2Name}</span>
                  </h3>
                </div>

                {/* Tournament pool context selector */}
                <div className="flex items-center gap-2 bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/10">
                  <span className="text-xs text-slate-300">Source Pool:</span>
                  <select
                    value={selectedTournamentId || ''}
                    onChange={(e) => setSelectedTournamentId(e.target.value)}
                    className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer border-none p-0 pr-6"
                  >
                    <option value="" className="text-slate-900">-- Choose Tournament --</option>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id} className="text-slate-900">{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {errorText && (
                <div className="bg-rose-50 border-b border-rose-100 px-5 py-3 text-xs text-rose-700 font-medium flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span>{errorText}</span>
                  </div>
                  <button 
                    onClick={() => setErrorText(null)}
                    className="text-rose-400 hover:text-rose-600 font-extrabold text-sm transition px-1"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 min-h-[400px]">
                
                {/* LEFT SIDE: Assigned Roster */}
                <div className="p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Assigned Chapter Roster
                    </h4>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                      {assignedPlayers.length} Active Players
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2 pr-1 scrollbar-thin">
                    {assignedPlayers.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                        <UserPlus className="w-10 h-10 text-slate-300 mb-2" />
                        <p className="text-sm font-semibold text-slate-500">No players assigned yet</p>
                        <p className="text-xs text-slate-400 max-w-xs mt-1">
                          Choose players from the right-hand pool to build the roster for this Chapter.
                        </p>
                      </div>
                    ) : (
                      assignedPlayers.map(p => (
                        <div 
                          key={p.id} 
                          className="p-3.5 bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100/50 rounded-xl flex items-center justify-between transition"
                        >
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{p.name}</p>
                          </div>
                          <button
                            onClick={() => unassignPlayer(p.id)}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 text-xs font-bold rounded-lg flex items-center gap-1 transition-all border border-rose-100"
                            title="Unassign player"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Unassign
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* RIGHT SIDE: Search & Pool */}
                <div className="p-6 flex flex-col">
                  <div className="flex flex-col space-y-3 mb-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-indigo-500" />
                        Available Tournament Players
                      </h4>
                      <span className="text-xs font-semibold text-slate-400">
                        Unassigned: {tournamentPlayers.filter(p => !allRootsPlayers.some(ap => ap.id === p.id)).length} / {tournamentPlayers.length}
                      </span>
                    </div>

                    {/* Player Search Bar */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                      <input
                        type="text"
                        value={playerSearch}
                        onChange={(e) => setPlayerSearch(e.target.value)}
                        placeholder="Search player name..."
                        className="w-full bg-slate-50 border border-slate-200 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[290px] space-y-2 pr-1 scrollbar-thin">
                    {!selectedTournamentId ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <p className="text-sm font-semibold text-slate-500">Please choose a Tournament Source</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Use the dropdown menu above to select which tournament's player roster you'd like to use.
                        </p>
                      </div>
                    ) : filteredPlayers.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                        <p className="text-xs">No players found matching your search query.</p>
                      </div>
                    ) : (
                      filteredPlayers.map(p => {
                        const assigned = isPlayerAssigned(p.id);
                        return (
                          <div 
                            key={p.id} 
                            className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                              assigned 
                                ? 'bg-slate-50 border-slate-100 opacity-65' 
                                : 'bg-white hover:bg-slate-50/60 border-slate-100'
                            }`}
                          >
                            <div>
                              <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                                {p.name}
                                {assigned && (
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                    <CheckCircle className="w-3 h-3" /> Assigned
                                  </span>
                                )}
                              </p>
                            </div>

                            {assigned ? (
                              <button
                                onClick={() => unassignPlayer(p.id)}
                                className="px-3 py-1.5 bg-slate-200 hover:bg-rose-100 hover:text-rose-600 text-slate-600 text-xs font-bold rounded-lg transition-all"
                                title="Unassign player"
                              >
                                Remove
                              </button>
                            ) : (
                              <button
                                onClick={() => assignPlayer(p)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-all"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                Assign
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200/50 p-8 rounded-2xl text-center text-slate-500 mt-8">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h4 className="font-bold text-slate-700 text-sm">No Chapter Selected</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Select a Root, then a Level 1 Parent Team, and click on any Level 2 Chapter to access player assignment.
              </p>
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* Custom Confirmation Modal for Hierarchy Deletion */}
      <AnimatePresence>
        {hierarchyToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHierarchyToDelete(null)}
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
                <h3 className="text-lg font-black text-slate-900">
                  {hierarchyToDelete.type === 'root' && "Delete Root?"}
                  {hierarchyToDelete.type === 'level1' && "Delete Team?"}
                  {hierarchyToDelete.type === 'level2' && "Delete Chapter?"}
                </h3>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {hierarchyToDelete.type === 'root' && (
                  <>
                    Are you sure you want to delete root <strong className="text-slate-800 font-bold">{hierarchyToDelete.name}</strong>? 
                    All sublevels will remain in database but become disconnected.
                  </>
                )}
                {hierarchyToDelete.type === 'level1' && (
                  <>
                    Are you sure you want to delete team <strong className="text-slate-800 font-bold">{hierarchyToDelete.name}</strong>? 
                    All sublevels will remain but become disconnected.
                  </>
                )}
                {hierarchyToDelete.type === 'level2' && (
                  <>
                    Are you sure you want to delete chapter <strong className="text-slate-800 font-bold">{hierarchyToDelete.name}</strong>?
                  </>
                )}
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setHierarchyToDelete(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (hierarchyToDelete.type === 'root') deleteRoot(hierarchyToDelete.id);
                    else if (hierarchyToDelete.type === 'level1') deleteLevel1(hierarchyToDelete.id);
                    else if (hierarchyToDelete.type === 'level2') deleteLevel2(hierarchyToDelete.id);
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
