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
  Copy
} from 'lucide-react';

export default function HierarchyManager({ tournamentId }: { tournamentId?: string }) {
  const [viewMode, setViewMode] = useState<'editor' | 'chain' | 'points'>('chain');
  const [pointsSubTab, setPointsSubTab] = useState<'roots' | 'parents' | 'chapters'>('chapters');
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
    if (selectedTournamentId) {
      const q = query(collection(db, `tournaments/${selectedTournamentId}/fixtures`));
      return onSnapshot(q, (snapshot) => {
        setFixtures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => console.error(err));
    } else {
      setFixtures([]);
    }
  }, [selectedTournamentId]);

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
  const calculatePlayerStatsMap = () => {
    const playerStats: Record<string, {
      wins: number;
      losses: number;
      gamesWon: number;
      gamesLost: number;
      pointsScored: number;
      pointsAgainst: number;
      points: number;
    }> = {};

    // Initialize
    tournamentPlayers.forEach(p => {
      playerStats[p.id] = { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, points: 0 };
    });

    const getWinPoints = (type?: string, playerId?: string, groupName?: string) => {
      if (groupName?.toLowerCase().includes('family')) {
        return 0;
      }
      if (playerId) {
        const assignment = allRootsPlayers.find(ap => ap.id === playerId);
        if (assignment) {
          const root = roots.find(r => r.id === assignment.rootId);
          const level1 = allRootsLevel1.find(l1 => l1.id === assignment.level1Id);
          const level2 = allRootsLevel2.find(l2 => l2.id === assignment.level2Id);

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

    matches.forEach(match => {
      const fixture = fixtures.find(f => f.id === match.fixtureId);
      if (!fixture) return;

      const p1Id = fixture.player1Id;
      const p2Id = fixture.player2Id;
      const s = match.scores || {};
      const winPointsP1 = getWinPoints(fixture.matchType, p1Id, fixture.groupName);
      const winPointsP2 = getWinPoints(fixture.matchType, p2Id, fixture.groupName);

      if (p1Id && !playerStats[p1Id]) {
        playerStats[p1Id] = { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, points: 0 };
      }
      if (p2Id && !playerStats[p2Id]) {
        playerStats[p2Id] = { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsScored: 0, pointsAgainst: 0, points: 0 };
      }

      // Update P1
      if (p1Id) {
        if (match.winner === 'player1') {
          playerStats[p1Id].wins++;
          playerStats[p1Id].points += winPointsP1;
        } else if (match.winner === 'player2') {
          playerStats[p1Id].losses++;
        }

        playerStats[p1Id].gamesWon += Number(match.p1Games || 0);
        playerStats[p1Id].gamesLost += Number(match.p2Games || 0);
        playerStats[p1Id].pointsScored += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
        playerStats[p1Id].pointsAgainst += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
      }

      // Update P2
      if (p2Id) {
        if (match.winner === 'player2') {
          playerStats[p2Id].wins++;
          playerStats[p2Id].points += winPointsP2;
        } else if (match.winner === 'player1') {
          playerStats[p2Id].losses++;
        }

        playerStats[p2Id].gamesWon += Number(match.p2Games || 0);
        playerStats[p2Id].gamesLost += Number(match.p1Games || 0);
        playerStats[p2Id].pointsScored += Number(s.p2g1 || 0) + Number(s.p2g2 || 0) + Number(s.p2g3 || 0);
        playerStats[p2Id].pointsAgainst += Number(s.p1g1 || 0) + Number(s.p1g2 || 0) + Number(s.p1g3 || 0);
      }
    });

    return playerStats;
  };

  const getHierarchyPointsData = () => {
    const playerStatsMap = calculatePlayerStatsMap();

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
      points: number; // Sum of assigned players' points
    }> = {};

    // Initialize all known Level 2 chapters across all roots
    allRootsLevel2.forEach(l2 => {
      const parent = allRootsLevel1.find(l1 => l1.id === l2.level1Id);
      const root = roots.find(r => r.id === l2.rootId);
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

    // Accumulate player stats into Chapter stats
    allRootsPlayers.forEach(p => {
      const chId = p.level2Id;
      if (chapterStatsMap[chId]) {
        chapterStatsMap[chId].playerCount++;
        const pStats = playerStatsMap[p.id];
        if (pStats) {
          chapterStatsMap[chId].wins += pStats.wins;
          chapterStatsMap[chId].losses += pStats.losses;
          chapterStatsMap[chId].gamesWon += pStats.gamesWon;
          chapterStatsMap[chId].gamesLost += pStats.gamesLost;
          chapterStatsMap[chId].pointsScored += pStats.pointsScored;
          chapterStatsMap[chId].pointsAgainst += pStats.pointsAgainst;
          // Cumulative sum of players' points:
          chapterStatsMap[chId].points += pStats.points;
        }
      }
    });

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
      points: number; // Sum of chapters' points
    }> = {};

    // Initialize all known Level 1 Parent Teams
    allRootsLevel1.forEach(l1 => {
      const root = roots.find(r => r.id === l1.rootId);
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

    // Accumulate Chapter stats into Parent Team stats
    Object.values(chapterStatsMap).forEach(ch => {
      const l2 = allRootsLevel2.find(item => item.id === ch.id);
      const l1Id = l2 ? l2.level1Id : null;
      if (l1Id && parentStatsMap[l1Id]) {
        parentStatsMap[l1Id].chapterCount++;
        parentStatsMap[l1Id].wins += ch.wins;
        parentStatsMap[l1Id].losses += ch.losses;
        parentStatsMap[l1Id].gamesWon += ch.gamesWon;
        parentStatsMap[l1Id].gamesLost += ch.gamesLost;
        parentStatsMap[l1Id].pointsScored += ch.pointsScored;
        parentStatsMap[l1Id].pointsAgainst += ch.pointsAgainst;
        // Parent points is sum of Chapter points
        parentStatsMap[l1Id].points += ch.points;
      }
    });

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
      points: number; // Sum of parents' points
    }> = {};

    // Initialize all known Roots
    roots.forEach(r => {
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

    // Accumulate Parent stats into Root stats
    Object.values(parentStatsMap).forEach(p => {
      const l1 = allRootsLevel1.find(item => item.id === p.id);
      const rId = l1 ? l1.rootId : null;
      if (rId && rootStatsMap[rId]) {
        rootStatsMap[rId].parentCount++;
        rootStatsMap[rId].wins += p.wins;
        rootStatsMap[rId].losses += p.losses;
        rootStatsMap[rId].gamesWon += p.gamesWon;
        rootStatsMap[rId].gamesLost += p.gamesLost;
        rootStatsMap[rId].pointsScored += p.pointsScored;
        rootStatsMap[rId].pointsAgainst += p.pointsAgainst;
        // Root points is sum of Parent points
        rootStatsMap[rId].points += p.points;
      }
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
            Organizational Hierarchy
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Build and view your organizational roots, parent teams, chapters, and player rosters.
          </p>
          
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
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setViewMode('chain')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'chain'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Activity className="w-4 h-4" />
            Chain Explorer
          </button>
          <button
            onClick={() => setViewMode('editor')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'editor'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Data Editor
          </button>
          <button
            onClick={() => setViewMode('points')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'points'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Points Standings
          </button>
        </div>
      </div>

      {viewMode === 'chain' ? (
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
                    Connected Organizational Bracket
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
                                            
                                            {players.map((p) => (
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
                <h3 className="text-lg font-extrabold text-slate-800">Select an Organizational Root</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Click on one of the base roots above to load its complete visual hierarchy bracket, from parent teams to chapter rosters.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : viewMode === 'editor' ? (
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
                  Are you sure you want to copy the organizational hierarchy? This will save all Roots, Parent Teams (L1), and Chapters (L2) from the selected tournament into the current tournament with the same IDs.
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
      ) : null}

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
                  <h3 className="text-lg font-black text-slate-800">Cumulative Multi-Level Standings</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time point aggregation synchronized down to individual player matches</p>
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
                            No roots found. Add organizational roots in the Hierarchy tab.
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
      {viewMode !== 'points' && (
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
