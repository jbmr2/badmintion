import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  getDocs, 
  onSnapshot, 
  deleteDoc, 
  updateDoc, 
  doc, 
  writeBatch, 
  where,
  increment 
} from 'firebase/firestore';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  MapPin, 
  Search, 
  Users, 
  Target, 
  Grid, 
  Trophy, 
  Clock, 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Filter,
  RefreshCw,
  Award,
  Loader2,
  FileText,
  GripVertical,
  Info
} from 'lucide-react';

export default function FixtureManager({ 
  tournamentId, 
  onNext,
  userRole = 'user'
}: { 
  tournamentId: string; 
  onNext: () => void;
  userRole?: 'admin' | 'scorer' | 'user';
}) {
  const isAdmin = userRole === 'admin';
  const canScore = userRole === 'admin' || userRole === 'scorer';
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [manualPlayer1, setManualPlayer1] = useState('');
  const [manualPlayer2, setManualPlayer2] = useState('');
  const [manualPlayer1a, setManualPlayer1a] = useState('');
  const [manualPlayer1b, setManualPlayer1b] = useState('');
  const [manualPlayer2a, setManualPlayer2a] = useState('');
  const [manualPlayer2b, setManualPlayer2b] = useState('');
  const [isDoubles, setIsDoubles] = useState(false);
  const [manualGroup, setManualGroup] = useState('');
  const [pointsTarget, setPointsTarget] = useState('15');
  const [matchType, setMatchType] = useState<'league' | 'pre_quarter' | 'quarter' | 'semi' | 'final'>('league');
  const [groups, setGroups] = useState<any[]>([]);
  const [editingFixture, setEditingFixture] = useState<any | null>(null);
  const [matchNumber, setMatchNumber] = useState('');
  const [matches, setMatches] = useState<any[]>([]);

  // Score Entry Modal States
  const [scoringFixture, setScoringFixture] = useState<any | null>(null);
  const [scP1g1, setScP1g1] = useState('0');
  const [scP2g1, setScP2g1] = useState('0');
  const [scP1g2, setScP1g2] = useState('0');
  const [scP2g2, setScP2g2] = useState('0');
  const [scP1g3, setScP1g3] = useState('0');
  const [scP2g3, setScP2g3] = useState('0');
  const [scoringStatus, setScoringStatus] = useState<'pending' | 'live' | 'completed'>('completed');
  const [isWalkover, setIsWalkover] = useState(false);
  const [walkoverWinner, setWalkoverWinner] = useState<'player1' | 'player2'>('player1');

  useEffect(() => {
    if (manualGroup) {
      const selectedGroupObj = groups.find(g => g.name === manualGroup);
      if (selectedGroupObj) {
        const gpPlayers = players.filter(p => selectedGroupObj.playerIds.includes(p.id));
        const hasPairs = gpPlayers.some(p => p.pairId);
        if (hasPairs) {
          setIsDoubles(true);
        } else {
          setIsDoubles(false);
        }
      }
    }
  }, [manualGroup, groups, players]);
  const [fixtureToDelete, setFixtureToDelete] = useState<any | null>(null);
  const [manualCourt, setManualCourt] = useState('');
  const [courts, setCourts] = useState<string[]>(['Court 1', 'Court 2', 'Court 3', 'Court 4', 'Court 5', 'Court 6']);
  const [isGenerating, setIsGenerating] = useState(false);

  const canManage = userRole === 'admin' || userRole === 'scorer';

  // Drag & Drop States for swapping matchNumber
  const [draggedFixture, setDraggedFixture] = useState<any | null>(null);
  const [isDraggingOverId, setIsDraggingOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, fixture: any) => {
    if (!canManage) {
      e.preventDefault();
      return;
    }
    setDraggedFixture(fixture);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fixture.id);
  };

  const handleDragOver = (e: React.DragEvent, fixtureId: string) => {
    if (!canManage || !draggedFixture) return;
    e.preventDefault();
    if (fixtureId !== draggedFixture.id) {
      setIsDraggingOverId(fixtureId);
    }
  };

  const handleDragLeave = () => {
    setIsDraggingOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFixture: any) => {
    e.preventDefault();
    setIsDraggingOverId(null);
    if (!canManage || !draggedFixture || draggedFixture.id === targetFixture.id) {
      setDraggedFixture(null);
      return;
    }

    try {
      const draggedNum = draggedFixture.matchNumber || '';
      const targetNum = targetFixture.matchNumber || '';

      const draggedRef = doc(db, `tournaments/${tournamentId}/fixtures`, draggedFixture.id);
      const targetRef = doc(db, `tournaments/${tournamentId}/fixtures`, targetFixture.id);

      await updateDoc(draggedRef, { matchNumber: targetNum });
      await updateDoc(targetRef, { matchNumber: draggedNum });
    } catch (error) {
      console.error("Error swapping match numbers via drag and drop:", error);
    } finally {
      setDraggedFixture(null);
    }
  };

  // Hierarchy tracking states for L2 Data
  const [roots, setRoots] = useState<any[]>([]);
  const [allRootsLevel1, setAllRootsLevel1] = useState<any[]>([]);
  const [allRootsLevel2, setAllRootsLevel2] = useState<any[]>([]);
  const [rawRootsPlayers, setRawRootsPlayers] = useState<any[]>([]);

  const isStructureMaster = tournamentId !== '_master_' && (roots.length === 0 || roots.some(r => r.isMasterFallback));
  const structureTournamentId = isStructureMaster ? '_master_' : tournamentId;

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const selectedGroupData = groups.find(g => g.name === manualGroup);
  const filteredPlayers = selectedGroupData ? players.filter(p => selectedGroupData.playerIds.includes(p.id)) : players;

  useEffect(() => {
    const qFixtures = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribeFixtures = onSnapshot(qFixtures,
      (snapshot) => setFixtures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/fixtures`)
    );

    const qPlayers = query(collection(db, `tournaments/${tournamentId}/players`));
    const unsubscribePlayers = onSnapshot(qPlayers,
      (snapshot) => setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/players`)
    );

    const qGroups = query(collection(db, `tournaments/${tournamentId}/groups`));
    const unsubscribeGroups = onSnapshot(qGroups,
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
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/groups`)
    );

    const unsubscribeTournament = onSnapshot(doc(db, 'tournaments', tournamentId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.courts && Array.isArray(data.courts) && data.courts.length > 0) {
            setCourts(data.courts);
          }
        }
      },
      (error) => console.error("Error fetching tournament courts:", error)
    );

    const qMatches = query(collection(db, `tournaments/${tournamentId}/matches`));
    const unsubscribeMatches = onSnapshot(qMatches,
      (snapshot) => setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/matches`)
    );

    return () => {
      unsubscribeFixtures();
      unsubscribePlayers();
      unsubscribeGroups();
      unsubscribeTournament();
      unsubscribeMatches();
    };
  }, [tournamentId]);

  // Fetch complete master hierarchy from the high-performance cached API endpoint
  useEffect(() => {
    if (!tournamentId) return;
    
    let active = true;
    const loadHierarchy = async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/hierarchy`);
        if (!res.ok) throw new Error('Failed to load hierarchy');
        const data = await res.json();
        if (active) {
          setRoots(data.roots || []);
          setAllRootsLevel1(data.level1 || []);
          setAllRootsLevel2(data.level2 || []);
          setRawRootsPlayers(data.players || []);
        }
      } catch (err) {
        console.error("Error loading hierarchy in FixtureManager:", err);
      }
    };
    
    loadHierarchy();
    return () => {
      active = false;
    };
  }, [tournamentId]);

  const allRootsPlayers = useMemo(() => {
    const level1Map = new Map(allRootsLevel1.map(l1 => [l1.id, l1]));
    const level2Map = new Map(allRootsLevel2.map(l2 => [l2.id, l2]));
    const rootMap = new Map(roots.map(r => [r.id, r]));

    return rawRootsPlayers.map(ap => {
      const l2 = level2Map.get(ap.level2Id) as any;
      const l1 = level1Map.get(ap.level1Id || (l2 ? l2.level1Id : '')) as any;
      const r = rootMap.get(ap.rootId || (l1 ? l1.rootId : '')) as any;
      return {
        ...ap,
        level2Name: l2 ? l2.name : ap.level2Name,
        level1Name: l1 ? l1.name : ap.level1Name,
        rootName: r ? r.name : ap.rootName,
      };
    });
  }, [rawRootsPlayers, allRootsLevel2, allRootsLevel1, roots]);

  const playerMap = Object.fromEntries(players.map(p => [p.id, p.name]));
  const playerL1Map = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level1Name]));
  const playerL2Map = Object.fromEntries(allRootsPlayers.map(ap => [ap.id, ap.level2Name]));

  const generateShortId = () => Math.random().toString(36).substring(2, 6);

  const addManualFixture = async () => {
    if (isGenerating) return;
    
    let p1a, p1b, p2a, p2b;
    
    if (isDoubles) {
      if (!manualPlayer1a || !manualPlayer1b || !manualPlayer2a || !manualPlayer2b || 
          manualPlayer1a === manualPlayer1b || manualPlayer2a === manualPlayer2b || 
          !manualGroup) return;
      p1a = manualPlayer1a; p1b = manualPlayer1b; p2a = manualPlayer2a; p2b = manualPlayer2b;
    } else {
      if (!manualPlayer1 || !manualPlayer2 || manualPlayer1 === manualPlayer2 || !manualGroup) return;
      p1a = manualPlayer1; p1b = ''; p2a = manualPlayer2; p2b = '';
    }

    try {
      setIsGenerating(true);
      const fixtureData: any = {
        groupName: manualGroup,
        matchType: matchType,
        pointsTarget: pointsTarget,
        status: 'pending',
        court: manualCourt,
        isDoubles: isDoubles,
        matchNumber: matchNumber || String(fixtures.length + 1)
      };
      
      if (isDoubles) {
        fixtureData.player1aId = p1a;
        fixtureData.player1aName = playerMap[p1a];
        fixtureData.player1bId = p1b;
        fixtureData.player1bName = playerMap[p1b];
        fixtureData.player2aId = p2a;
        fixtureData.player2aName = playerMap[p2a];
        fixtureData.player2bId = p2b;
        fixtureData.player2bName = playerMap[p2b];
      } else {
        fixtureData.player1Id = p1a;
        fixtureData.player1Name = playerMap[p1a];
        fixtureData.player2Id = p2a;
        fixtureData.player2Name = playerMap[p2a];
      }

      const docRef = await addDoc(collection(db, `tournaments/${tournamentId}/fixtures`), fixtureData);
      await updateDoc(docRef, { matchId: generateShortId() });
      
      setManualPlayer1(''); setManualPlayer2('');
      setManualPlayer1a(''); setManualPlayer1b('');
      setManualPlayer2a(''); setManualPlayer2b('');
      setManualGroup('');
      setMatchType('league');
      setManualCourt('');
      setMatchNumber('');
    } catch (e) {
      console.error("Error creating manual match:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = (fixture: any) => {
    setFixtureToDelete(fixture);
  };

  const getPointsDelta = (fixture?: any) => {
    if (!fixture) return 5;
    const t = fixture.matchType?.toLowerCase() || 'league';
    if (t.includes('pre_quarter') || t.includes('pre-quarter') || t.includes('pre quarter')) return 5;
    if (t.includes('quarter') || t.includes('quater')) return 10;
    if (t.includes('semi')) return 15;
    if (t.includes('final')) return 25;
    return 5;
  };

  const adjustTeamPoints = async (winnerPlayerId: string, delta: number, fixture?: any) => {
    if (!winnerPlayerId) return;
    if (
      fixture?.groupName?.toLowerCase().includes('family') ||
      fixture?.groupName?.toLowerCase().includes('kids')
    ) {
      return;
    }
    try {
      const teamsSnapshot = await getDocs(collection(db, `tournaments/${tournamentId}/teams`));
      const teamDoc = teamsSnapshot.docs.find(doc => doc.data().playerIds?.includes(winnerPlayerId));
      if (teamDoc) {
        const teamData = teamDoc.data();
        if (
          teamData?.name?.toLowerCase().includes('family') ||
          teamData?.name?.toLowerCase().includes('kids')
        ) {
          return;
        }
        await updateDoc(teamDoc.ref, { points: increment(delta) });
      }
    } catch (e) {
      console.error("Error adjusting team points:", e);
    }
  };

  const handleConfirmDelete = async () => {
    if (!fixtureToDelete) return;
    const id = fixtureToDelete.id;
    setDeletingIds(prev => [...prev, id]);
    setFixtureToDelete(null); // Close the confirmation modal immediately so the user can see the loading state on the card

    try {
      // Find and delete associated match result if it exists
      const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`), where('fixtureId', '==', id));
      const querySnapshot = await getDocs(matchesQuery);

      // If completed match exists, adjust team points (revert win)
      for (const mDoc of querySnapshot.docs) {
        const mData = mDoc.data();
        if (mData && mData.winner) {
          const isDoublesMatch = !!(fixtureToDelete.isDoubles || fixtureToDelete.player1aId || fixtureToDelete.player1bId || fixtureToDelete.player2aId || fixtureToDelete.player2bId);
          const winnerPlayerId = mData.winner === 'player1'
            ? (isDoublesMatch ? fixtureToDelete.player1aId : fixtureToDelete.player1Id)
            : (isDoublesMatch ? fixtureToDelete.player2aId : fixtureToDelete.player2Id);
          
          if (winnerPlayerId) {
            const pointsDelta = getPointsDelta(fixtureToDelete);
            await adjustTeamPoints(winnerPlayerId, -pointsDelta, fixtureToDelete);
          }
        }
      }

      await deleteDoc(doc(db, `tournaments/${tournamentId}/fixtures`, id));
      
      const batch = writeBatch(db);
      querySnapshot.forEach((doc) => {
          batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (e) {
      console.error("Error deleting match:", e);
      // Remove from deleting state on error
      setDeletingIds(prev => prev.filter(x => x !== id));
    }
  };

  const handleEdit = (fixture: any) => {
    setEditingFixture(fixture);
    setManualGroup(fixture.groupName);
    setMatchType(fixture.matchType || 'league');
    setManualCourt(fixture.court || '');
    setMatchNumber(fixture.matchNumber || '');
    setIsDoubles(!!fixture.isDoubles);
    if (fixture.isDoubles) {
      setManualPlayer1a(fixture.player1aId || '');
      setManualPlayer1b(fixture.player1bId || '');
      setManualPlayer2a(fixture.player2aId || '');
      setManualPlayer2b(fixture.player2bId || '');
      setManualPlayer1('');
      setManualPlayer2('');
    } else {
      setManualPlayer1(fixture.player1Id || '');
      setManualPlayer2(fixture.player2Id || '');
      setManualPlayer1a('');
      setManualPlayer1b('');
      setManualPlayer2a('');
      setManualPlayer2b('');
    }
  };

  const handleCancelEdit = () => {
    setEditingFixture(null);
    setManualPlayer1('');
    setManualPlayer2('');
    setManualPlayer1a('');
    setManualPlayer1b('');
    setManualPlayer2a('');
    setManualPlayer2b('');
    setManualGroup('');
    setMatchType('league');
    setManualCourt('');
    setMatchNumber('');
  };

  const handleUpdate = async () => {
    if (isGenerating) return;
    if (!editingFixture || !manualGroup) return;
    try {
      setIsGenerating(true);
      const updateData: any = {
        groupName: manualGroup,
        matchType: matchType,
        court: manualCourt,
        isDoubles: isDoubles,
        matchNumber: matchNumber
      };

      if (isDoubles) {
        updateData.player1aId = manualPlayer1a;
        updateData.player1aName = playerMap[manualPlayer1a] || '';
        updateData.player1bId = manualPlayer1b;
        updateData.player1bName = playerMap[manualPlayer1b] || '';
        updateData.player2aId = manualPlayer2a;
        updateData.player2aName = playerMap[manualPlayer2a] || '';
        updateData.player2bId = manualPlayer2b;
        updateData.player2bName = playerMap[manualPlayer2b] || '';
        // Clear singles fields
        updateData.player1Id = '';
        updateData.player1Name = '';
        updateData.player2Id = '';
        updateData.player2Name = '';
      } else {
        updateData.player1Id = manualPlayer1;
        updateData.player1Name = playerMap[manualPlayer1] || '';
        updateData.player2Id = manualPlayer2;
        updateData.player2Name = playerMap[manualPlayer2] || '';
        // Clear doubles fields
        updateData.player1aId = '';
        updateData.player1aName = '';
        updateData.player1bId = '';
        updateData.player1bName = '';
        updateData.player2aId = '';
        updateData.player2aName = '';
        updateData.player2bId = '';
        updateData.player2bName = '';
      }

      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, editingFixture.id), updateData);
      setEditingFixture(null);
      setManualPlayer1('');
      setManualPlayer2('');
      setManualPlayer1a('');
      setManualPlayer1b('');
      setManualPlayer2a('');
      setManualPlayer2b('');
      setManualGroup('');
      setMatchType('league');
      setManualCourt('');
      setMatchNumber('');
    } catch (e) {
      console.error("Error updating manual match:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateLeagueFixtures = async () => {
    if (isGenerating) return;
    if (!manualGroup || filteredPlayers.length < 2) return;
    try {
      setIsGenerating(true);
      const batch = writeBatch(db);
      const fixturesCol = collection(db, `tournaments/${tournamentId}/fixtures`);
      let matchCounter = fixtures.length + 1;

      if (isDoubles) {
        // Group players into pairs/teams
        const pairsMap = new Map<string, any[]>();
        filteredPlayers.forEach(p => {
          if (p.pairId) {
            if (!pairsMap.has(p.pairId)) pairsMap.set(p.pairId, []);
            pairsMap.get(p.pairId)!.push(p);
          }
        });

        const teams: Array<{ playerA: any; playerB: any }> = [];

        // 1. Add grouped pairs
        pairsMap.forEach((members) => {
          if (members.length >= 2) {
            teams.push({
              playerA: members[0],
              playerB: members[1]
            });
          } else if (members.length === 1) {
            teams.push({
              playerA: members[0],
              playerB: null
            });
          }
        });

        // 2. Add players without pairId (consecutively pair them up to form doubles teams)
        const unpaired = filteredPlayers.filter(p => !p.pairId);
        for (let k = 0; k < unpaired.length; k += 2) {
          if (k + 1 < unpaired.length) {
            teams.push({
              playerA: unpaired[k],
              playerB: unpaired[k+1]
            });
          } else {
            teams.push({
              playerA: unpaired[k],
              playerB: null
            });
          }
        }

        if (teams.length < 2) {
          alert("Not enough doubles teams/pairs in this group to generate fixtures. Minimum 2 teams required.");
          setIsGenerating(false);
          return;
        }

        for (let i = 0; i < teams.length; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            const team1 = teams[i];
            const team2 = teams[j];

            const newDocRef = doc(fixturesCol);
            const fixtureData: any = {
              groupName: manualGroup,
              matchType: 'league',
              pointsTarget: pointsTarget,
              status: 'pending',
              matchId: generateShortId(),
              matchNumber: String(matchCounter++),
              court: '',
              isDoubles: true,
              player1aId: team1.playerA.id,
              player1aName: team1.playerA.name,
              player1bId: team1.playerB ? team1.playerB.id : '',
              player1bName: team1.playerB ? team1.playerB.name : '',
              player2aId: team2.playerA.id,
              player2aName: team2.playerA.name,
              player2bId: team2.playerB ? team2.playerB.id : '',
              player2bName: team2.playerB ? team2.playerB.name : '',
            };
            batch.set(newDocRef, fixtureData);
          }
        }
      } else {
        // Singles round-robin generation
        for (let i = 0; i < filteredPlayers.length; i++) {
          for (let j = i + 1; j < filteredPlayers.length; j++) {
            const newDocRef = doc(fixturesCol);
            const fixtureData: any = {
              groupName: manualGroup,
              matchType: 'league',
              pointsTarget: pointsTarget,
              status: 'pending',
              matchId: generateShortId(),
              matchNumber: String(matchCounter++),
              court: '',
              isDoubles: false,
              player1Id: filteredPlayers[i].id,
              player1Name: filteredPlayers[i].name,
              player2Id: filteredPlayers[j].id,
              player2Name: filteredPlayers[j].name,
            };
            batch.set(newDocRef, fixtureData);
          }
        }
      }

      await batch.commit();
      setManualGroup('');
    } catch (e) {
      console.error("Error generating league matches:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const openScoringModal = (fixture: any) => {
    setScoringFixture(fixture);
    setScP1g1(String(fixture.scores?.p1g1 || 0));
    setScP2g1(String(fixture.scores?.p2g1 || 0));
    setScP1g2(String(fixture.scores?.p1g2 || 0));
    setScP2g2(String(fixture.scores?.p2g2 || 0));
    setScP1g3(String(fixture.scores?.p1g3 || 0));
    setScP2g3(String(fixture.scores?.p2g3 || 0));
    setScoringStatus(fixture.status || 'completed');
    setIsWalkover(!!fixture.isWalkover);
    setWalkoverWinner(fixture.walkoverWinner || 'player1');
  };

  const handleSaveScores = async () => {
    if (!scoringFixture) return;
    try {
      setIsGenerating(true);
      const fixtureId = scoringFixture.id;
      const target = Number(scoringFixture.pointsTarget) || (scoringFixture.matchType === 'league' ? 15 : 21);

      let s = {
        p1g1: Number(scP1g1) || 0,
        p2g1: Number(scP2g1) || 0,
        p1g2: Number(scP1g2) || 0,
        p2g2: Number(scP2g2) || 0,
        p1g3: Number(scP1g3) || 0,
        p2g3: Number(scP2g3) || 0,
      };

      if (isWalkover) {
        s = walkoverWinner === 'player1'
          ? { p1g1: target, p2g1: 0, p1g2: target, p2g2: 0, p1g3: 0, p2g3: 0 }
          : { p1g1: 0, p2g1: target, p1g2: 0, p2g2: target, p1g3: 0, p2g3: 0 };
      }

      const p1Games = (s.p1g1 > s.p2g1 ? 1 : 0) + (s.p1g2 > s.p2g2 ? 1 : 0) + (s.p1g3 > s.p2g3 ? 1 : 0);
      const p2Games = (s.p2g1 > s.p1g1 ? 1 : 0) + (s.p2g2 > s.p1g2 ? 1 : 0) + (s.p2g3 > s.p1g3 ? 1 : 0);
      const computedWinner = p1Games > p2Games ? 'player1' : 'player2';

      const isDoublesMatch = !!(scoringFixture.isDoubles || scoringFixture.player1aId || scoringFixture.player1bId || scoringFixture.player2aId || scoringFixture.player2bId);
      const winnerPlayerId = computedWinner === 'player1'
        ? (isDoublesMatch ? scoringFixture.player1aId : scoringFixture.player1Id)
        : (isDoublesMatch ? scoringFixture.player2aId : scoringFixture.player2Id);

      const existingMatch = matches.find(m => m.fixtureId === fixtureId);
      const pointsDelta = getPointsDelta(scoringFixture);

      // Handle standings adjustment if transitioning to completed
      if (scoringStatus === 'completed') {
        if (existingMatch) {
          const oldWinner = existingMatch.winner;
          const oldWinnerPlayerId = oldWinner === 'player1'
            ? (isDoublesMatch ? scoringFixture.player1aId : scoringFixture.player1Id)
            : (isDoublesMatch ? scoringFixture.player2aId : scoringFixture.player2Id);

          await updateDoc(doc(db, `tournaments/${tournamentId}/matches`, existingMatch.id), {
            scores: s,
            winner: computedWinner,
            p1Games,
            p2Games,
            maxPoints: target,
            isWalkover,
            walkoverWinner,
            finalizedAt: Date.now()
          });

          if (oldWinnerPlayerId !== winnerPlayerId) {
            await adjustTeamPoints(oldWinnerPlayerId, -pointsDelta, scoringFixture);
            await adjustTeamPoints(winnerPlayerId, pointsDelta, scoringFixture);
          }
        } else {
          // New match doc
          await addDoc(collection(db, `tournaments/${tournamentId}/matches`), {
            fixtureId,
            scores: s,
            winner: computedWinner,
            p1Games,
            p2Games,
            maxPoints: target,
            isWalkover,
            walkoverWinner,
            finalizedAt: Date.now()
          });

          await adjustTeamPoints(winnerPlayerId, pointsDelta, scoringFixture);
        }
      } else {
        // If they changed status back to live/pending, delete match document if it existed
        if (existingMatch) {
          const oldWinner = existingMatch.winner;
          const oldWinnerPlayerId = oldWinner === 'player1'
            ? (isDoublesMatch ? scoringFixture.player1aId : scoringFixture.player1Id)
            : (isDoublesMatch ? scoringFixture.player2aId : scoringFixture.player2Id);

          await adjustTeamPoints(oldWinnerPlayerId, -pointsDelta, scoringFixture);
          await deleteDoc(doc(db, `tournaments/${tournamentId}/matches`, existingMatch.id));
        }
      }

      // Finally, update the fixture document
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, fixtureId), {
        status: scoringStatus,
        scores: s,
        isWalkover,
        walkoverWinner,
        finalizedAt: Date.now()
      });

      setScoringFixture(null);
    } catch (e) {
      console.error("Error saving scores inside FixtureManager:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper colors for stages/match types
  const getMatchTypeBadgeClass = (type: string) => {
    switch(type) {
      case 'final':
        return 'bg-rose-50 text-rose-700 border border-rose-100 font-extrabold';
      case 'semi':
        return 'bg-purple-50 text-purple-700 border border-purple-100 font-bold';
      case 'quarter':
        return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'pre_quarter':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      default:
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    }
  };

  const getMatchTypeLabel = (type: string) => {
    switch(type) {
      case 'final': return 'Final';
      case 'semi': return 'Semi Final';
      case 'quarter': return 'Quarter Final';
      case 'pre_quarter': return 'Pre-Quarter';
      default: return 'League';
    }
  };

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

  // Filter and search computation
  const filteredFixtures = fixtures.filter(f => {
    const matchesSearch = !searchQuery.trim() || 
      (f.isDoubles 
        ? ((f.player1aName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (f.player1bName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (f.player2aName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (f.player2bName || '').toLowerCase().includes(searchQuery.toLowerCase()))
        : ((f.player1Name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (f.player2Name || '').toLowerCase().includes(searchQuery.toLowerCase()))) ||
      (f.matchId || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGroup = groupFilter === 'all' || f.groupName === groupFilter;
    const matchesType = typeFilter === 'all' || f.matchType === typeFilter;
    const matchesStatus = statusFilter === 'all' || f.status === statusFilter;

    return matchesSearch && matchesGroup && matchesType && matchesStatus;
  }).sort((a, b) => {
    const nA = parseInt(a.matchNumber, 10);
    const nB = parseInt(b.matchNumber, 10);
    if (!isNaN(nA) && !isNaN(nB)) {
      return nA - nB;
    }
    if (a.matchNumber && b.matchNumber) {
      return a.matchNumber.localeCompare(b.matchNumber, undefined, { numeric: true });
    }
    return (a.matchId || '').localeCompare(b.matchId || '');
  });

  const downloadFixturesPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Badminton Tournament Match Fixtures", 14, 22);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Tournament ID: ${tournamentId}`, 14, 34);
    doc.text(`Active Filters: Group: ${groupFilter.toUpperCase()} | Stage: ${typeFilter.toUpperCase()} | Status: ${statusFilter.toUpperCase()}`, 14, 40);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 44, 196, 44);
    
    let y = 52;
    
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

    // Group fixtures by group name
    const groupedFixtures = filteredFixtures.reduce((acc, f) => {
      const gName = f.groupName || 'Other / Playoff Stages';
      if (!acc[gName]) acc[gName] = [];
      acc[gName].push(f);
      return acc;
    }, {} as Record<string, any[]>);
    
    const sortedGroupNames = Object.keys(groupedFixtures).sort((a, b) => {
      const wA = getGroupOrderWeight(a);
      const wB = getGroupOrderWeight(b);
      if (wA !== wB) return wA - wB;
      return a.localeCompare(b);
    });
    
    sortedGroupNames.forEach((groupName) => {
      const matchesInGroup = groupedFixtures[groupName];
      
      if (y > 230) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(groupName, 14, y);
      
      y += 4;
      doc.setDrawColor(230, 230, 230);
      doc.line(14, y, 196, y);
      y += 6;
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("M.No", 14, y);
      doc.text("Match ID", 26, y);
      doc.text("Player/Team 1", 44, y);
      doc.text("Player/Team 2", 105, y);
      doc.text("Stage / Type", 160, y);
      doc.text("Court", 180, y);
      
      y += 3;
      doc.line(14, y, 196, y);
      y += 6;
      
      doc.setFont("helvetica", "normal");
      matchesInGroup.forEach((f) => {
        // P1 string
        const p1Name = f.isDoubles
          ? `${getPlayerDetailsWithHierarchy(f.player1aName || 'N/A', f.player1aId)} & ${getPlayerDetailsWithHierarchy(f.player1bName || 'N/A', f.player1bId)}`
          : getPlayerDetailsWithHierarchy(f.player1Name || 'N/A', f.player1Id);
        
        // P2 string
        const p2Name = f.isDoubles
          ? `${getPlayerDetailsWithHierarchy(f.player2aName || 'N/A', f.player2aId)} & ${getPlayerDetailsWithHierarchy(f.player2bName || 'N/A', f.player2bId)}`
          : getPlayerDetailsWithHierarchy(f.player2Name || 'N/A', f.player2Id);

        // Split to size to prevent truncation and show full name
        const p1Lines: string[] = doc.splitTextToSize(p1Name, 58);
        const p2Lines: string[] = doc.splitTextToSize(p2Name, 52);
        const maxLines = Math.max(p1Lines.length, p2Lines.length, 1);
        const rowHeight = maxLines * 4.5 + 2.5;

        if (y + rowHeight > 275) {
          doc.addPage();
          y = 20;
          doc.setFont("helvetica", "bold");
          doc.text(`${groupName} (Continued)`, 14, y);
          y += 6;
          doc.setFont("helvetica", "normal");
        }
        
        doc.text(f.matchNumber ? String(f.matchNumber) : '-', 14, y);
        doc.text(f.matchId?.toUpperCase() || 'PND', 26, y);
        
        // Render Player 1 lines
        p1Lines.forEach((line, index) => {
          doc.text(line, 44, y + index * 4.5);
        });
        
        // Render Player 2 lines
        p2Lines.forEach((line, index) => {
          doc.text(line, 105, y + index * 4.5);
        });
        
        // Match Type / Stage (offset slightly if multi-line is needed, but y is fine for base line)
        doc.text(getMatchTypeLabel(f.matchType), 160, y);
        
        // Court
        doc.text(f.court || "No Court", 180, y);
        
        y += rowHeight;
      });
      y += 5; // spacing after group table
    });
    
    doc.save("tournament_match_fixtures.pdf");
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* HEADER HERO BANNER */}
      <div className="relative bg-gradient-to-r from-indigo-950 to-slate-900 rounded-3xl p-8 overflow-hidden border border-slate-800 shadow-xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Trophy className="w-64 h-64 text-indigo-400" />
        </div>
        <div className="relative space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Tournament Fixtures
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight sm:text-4xl flex flex-wrap items-center gap-3">
            Match Generator & Planner
            {!isAdmin && (
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold rounded-full">
                👁️ Read-Only Mode
              </span>
            )}
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed font-medium">
            Create or auto-generate round-robin league matchups and direct elimination stages. View, search, and manage all scheduled fixtures below.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <div className="bg-slate-800/60 border border-slate-700/50 px-4 py-2 rounded-xl text-center">
              <span className="block text-xl font-black text-indigo-400">{fixtures.length}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Scheduled</span>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/50 px-4 py-2 rounded-xl text-center">
              <span className="block text-xl font-black text-emerald-400">
                {fixtures.filter(f => f.status === 'completed').length}
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Completed</span>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/50 px-4 py-2 rounded-xl text-center">
              <span className="block text-xl font-black text-amber-400">
                {fixtures.filter(f => f.status === 'pending').length}
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pending</span>
            </div>
            <button
              onClick={downloadFixturesPDF}
              className="sm:ml-auto bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 self-center cursor-pointer shadow-md shadow-indigo-900/40 transition"
              title="Download Fixtures PDF"
            >
              <FileText className="w-4 h-4" />
              Download Fixtures PDF
            </button>
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-start gap-2 text-xs font-semibold">
          ⚠️ Read-Only Mode: You must be an administrator to auto-generate, edit, or delete match fixtures.
        </div>
      )}

      {/* MATCH CONFIGURATION CONTROL PANEL */}
      {isAdmin && (
        <div className={`p-6 rounded-2xl border transition-all duration-300 ${
          editingFixture 
            ? 'bg-indigo-50/50 border-indigo-200 shadow-md shadow-indigo-50' 
            : 'bg-white border-slate-100 shadow-sm'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100/80 mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${editingFixture ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-600'}`}>
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
                  {editingFixture ? '✏️ Edit Match Details' : '🏆 Quick Add or Auto-Generate League Matches'}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingFixture 
                    ? `Modify the properties for Match ID #${editingFixture.matchId?.toUpperCase()}.` 
                    : 'Select players to create a manual match, or choose a Group to instantly seed a full Round-Robin.'
                  }
                </p>
              </div>
            </div>
            {editingFixture && (
              <button 
                onClick={handleCancelEdit} 
                className="px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition flex items-center gap-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                Cancel Edit
              </button>
            )}
          </div>

        {/* Builder Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Column 1: Matchup Players */}
          <div className="space-y-3.5 bg-slate-50/40 border border-slate-100 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              Player Matchup
            </div>
            
            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                id="isDoublesToggle"
                checked={isDoubles}
                onChange={e => setIsDoubles(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="isDoublesToggle" className="text-xs font-bold text-slate-700">Doubles Match</label>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500">{isDoubles ? 'Team 1 (Player A)' : 'Player 1'}</label>
              <select 
                value={isDoubles ? manualPlayer1a : manualPlayer1} 
                onChange={e => isDoubles ? setManualPlayer1a(e.target.value) : setManualPlayer1(e.target.value)} 
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="">Select Player</option>
                {filteredPlayers.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === manualPlayer1b || p.id === manualPlayer2a || p.id === manualPlayer2b}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {isDoubles && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500">Team 1 (Player B)</label>
                <select 
                  value={manualPlayer1b} 
                  onChange={e => setManualPlayer1b(e.target.value)} 
                  className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                >
                  <option value="">Select Player</option>
                  {filteredPlayers.map(p => (
                    <option key={p.id} value={p.id} disabled={p.id === manualPlayer1a || p.id === manualPlayer2a || p.id === manualPlayer2b}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500">{isDoubles ? 'Team 2 (Player A)' : 'Player 2'}</label>
              <select 
                value={isDoubles ? manualPlayer2a : manualPlayer2} 
                onChange={e => isDoubles ? setManualPlayer2a(e.target.value) : setManualPlayer2(e.target.value)} 
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="">Select Player</option>
                {filteredPlayers.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === manualPlayer1a || p.id === manualPlayer1b || p.id === manualPlayer2b}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {isDoubles && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500">Team 2 (Player B)</label>
                <select 
                  value={manualPlayer2b} 
                  onChange={e => setManualPlayer2b(e.target.value)} 
                  className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                >
                  <option value="">Select Player</option>
                  {filteredPlayers.map(p => (
                    <option key={p.id} value={p.id} disabled={p.id === manualPlayer1a || p.id === manualPlayer1b || p.id === manualPlayer2a}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Column 2: Metadata & Location */}
          <div className="space-y-3.5 bg-slate-50/40 border border-slate-100 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              Location & Stage Group
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500">Group Name</label>
              <select 
                value={manualGroup} 
                onChange={e => setManualGroup(e.target.value)} 
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="">Select Group / Section</option>
                {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500">Match Number</label>
              <input 
                type="text" 
                placeholder="e.g. 1, 2, 101..." 
                value={matchNumber}
                onChange={e => setMatchNumber(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500">Court / Location</label>
              <select 
                value={manualCourt} 
                onChange={e => setManualCourt(e.target.value)} 
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="">No Court Assigned</option>
                {courts.map(court => {
                  const isOtherLive = fixtures.some(x => x.status === 'live' && x.court === court && x.id !== editingFixture?.id);
                  if (isOtherLive) return null;
                  return <option key={court} value={court}>{court}</option>;
                })}
              </select>
            </div>
          </div>

          {/* Column 3: Rules & Actions */}
          <div className="space-y-3.5 bg-slate-50/40 border border-slate-100 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                <Trophy className="w-3.5 h-3.5 text-indigo-500" />
                Format Rules
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500">Points Target</label>
                  <select 
                    value={pointsTarget} 
                    onChange={e => setPointsTarget(e.target.value)} 
                    className="w-full bg-white border border-slate-200 text-slate-700 p-2 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 transition"
                  >
                    <option value="11">11 pts</option>
                    <option value="15">15 pts</option>
                    <option value="21">21 pts</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500">Stage Type</label>
                  <select 
                    value={matchType} 
                    onChange={e => setMatchType(e.target.value as any)} 
                    className="w-full bg-white border border-slate-200 text-slate-700 p-2 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 transition"
                  >
                    <option value="league">League</option>
                    <option value="pre_quarter">Pre-Quarter</option>
                    <option value="quarter">Quarter Final</option>
                    <option value="semi">Semi Final</option>
                    <option value="final">Final</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-3">
              <button 
                type="button"
                onClick={editingFixture ? handleUpdate : addManualFixture} 
                disabled={isGenerating || !manualGroup || (!editingFixture && (!manualPlayer1 || !manualPlayer2 || manualPlayer1 === manualPlayer2))}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isGenerating ? (
                  <span className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                ) : editingFixture ? (
                  <>Save Changes</>
                ) : (
                  <>{isDoubles ? 'Add Doubles Match' : 'Add Single Match'}</>
                )}
              </button>

              {manualGroup && !editingFixture && (
                <button 
                  type="button"
                  onClick={generateLeagueFixtures} 
                  disabled={isGenerating || filteredPlayers.length < 2}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isGenerating ? (
                    <span className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                  ) : (
                    <>⚡ Generate Round-Robin ({filteredPlayers.length} Players)</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tip section */}
        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500/90 leading-relaxed max-w-3xl">
          <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <span>
            <strong>Round-Robin Auto-Seeder:</strong> Choosing a Group and clicking &ldquo;Generate Round-Robin&rdquo; will automatically compute every single unique fixture pairing for all players registered in that group. This saves you from creating them manually!
          </span>
        </div>
      </div>
      )}

      {canManage && (
        <div className="bg-indigo-50/80 border border-indigo-100/80 text-indigo-900 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <Info className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-indigo-950">Drag & Drop Match Numbers</h4>
            <p className="text-xs text-indigo-800/90 mt-0.5">
              You can drag and drop any match card onto another card to swap their match numbers and easily update your tournament match order in real time.
            </p>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH TOOLS BAR */}
      <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-1">
          <Filter className="w-4 h-4 text-slate-400" />
          <h4 className="font-extrabold text-[10px] uppercase tracking-widest text-slate-400">Search & Filter Scheduled Matches</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Text Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search player name or Match ID..."
              className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Group Filter */}
          <select 
            value={groupFilter} 
            onChange={e => setGroupFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          >
            <option value="all">All Groups / Divisions</option>
            {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>

          {/* Match Type / Stage Filter */}
          <select 
            value={typeFilter} 
            onChange={e => setTypeFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          >
            <option value="all">All Stages</option>
            <option value="league">League Stages</option>
            <option value="pre_quarter">Pre-Quarters</option>
            <option value="quarter">Quarter Finals</option>
            <option value="semi">Semi Finals</option>
            <option value="final">Finals</option>
          </select>

          {/* Status Filter */}
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          >
            <option value="all">All Match Statuses</option>
            <option value="pending">⏳ Pending</option>
            <option value="live">⚡ Live</option>
            <option value="completed">✅ Completed</option>
          </select>
        </div>

        {/* Counter & Clear filters */}
        {(searchQuery || groupFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all') && (
          <div className="flex items-center justify-between text-xs bg-indigo-50/50 border border-indigo-100/40 p-2.5 rounded-xl">
            <span className="text-indigo-800 font-semibold">
              Found <strong>{filteredFixtures.length}</strong> matches matching your current filters.
            </span>
            <button 
              onClick={() => {
                setSearchQuery('');
                setGroupFilter('all');
                setTypeFilter('all');
                setStatusFilter('all');
              }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* FIXTURES RENDERING GRID: LEFT TO RIGHT SMALL MATCHWISE BOXES */}
      {filteredFixtures.length === 0 ? (
        <div className="bg-slate-50 rounded-3xl border border-dashed border-slate-200 p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="p-4 bg-white rounded-full w-16 h-16 flex items-center justify-center shadow-sm mx-auto text-slate-400">
            <Search className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 text-base">No scheduled matches found</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              We couldn&apos;t find any matching fixtures. Try clearing your search query or filters, or use the generator above to instantly create tournament matches.
            </p>
          </div>
          {(searchQuery || groupFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all') && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setGroupFilter('all');
                setTypeFilter('all');
                setStatusFilter('all');
              }}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 font-bold rounded-xl text-xs shadow-xs transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {/* We group by GroupName/Stage to align logically, then render matches horizontally */}
          {(Object.entries(
            filteredFixtures.reduce((acc, f) => {
              const groupName = f.groupName || 'Unassigned Stage';
              if (!acc[groupName]) acc[groupName] = [];
              acc[groupName].push(f);
              return acc;
            }, {} as Record<string, any[]>)
          ) as [string, any[]][]).sort((a, b) => {
            const wA = getGroupOrderWeight(a[0]);
            const wB = getGroupOrderWeight(b[0]);
            if (wA !== wB) return wA - wB;
            return a[0].localeCompare(b[0]);
          }).map(([groupName, groupMatches]) => {
            return (
              <div key={groupName} className="space-y-4">
                {/* Section Header */}
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Grid className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base tracking-tight uppercase">
                      {groupName} Standings & Match Pool
                    </h3>
                    <p className="text-xs text-slate-400">
                      Contains {groupMatches.length} matchups scheduled under this group.
                    </p>
                  </div>
                </div>

                {/* HORIZONTAL MATCHES GRID ("same left to right small box for each match") */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <AnimatePresence mode="popLayout">
                    {[...groupMatches].sort((m1, m2) => {
                      const n1 = parseInt(m1.matchNumber, 10);
                      const n2 = parseInt(m2.matchNumber, 10);
                      if (!isNaN(n1) && !isNaN(n2)) {
                        return n1 - n2;
                      }
                      if (m1.matchNumber && m2.matchNumber) {
                        return m1.matchNumber.localeCompare(m2.matchNumber, undefined, { numeric: true });
                      }
                      return (m1.matchId || '').localeCompare(m2.matchId || '');
                    }).map((f, idx) => {
                      const isDeleting = deletingIds.includes(f.id);
                      // Accent border/ring according to status
                      let statusAccent = 'border-l-slate-300';
                      let statusBg = 'bg-slate-50 text-slate-600';
                      if (f.status === 'completed') {
                        statusAccent = 'border-l-emerald-500 ring-emerald-500/10';
                        statusBg = 'bg-emerald-50 text-emerald-700';
                      } else if (f.status === 'live') {
                        statusAccent = 'border-l-indigo-500 ring-indigo-500/10 shadow-indigo-100/60 shadow-md animate-pulse';
                        statusBg = 'bg-indigo-50 text-indigo-700';
                      } else if (f.status === 'pending') {
                        statusAccent = 'border-l-amber-400 ring-amber-400/10';
                        statusBg = 'bg-amber-50 text-amber-700';
                      }

                      const isDragged = draggedFixture?.id === f.id;
                      const isOver = isDraggingOverId === f.id;

                      return (
                        <motion.div 
                          key={f.id} 
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: isDeleting ? 0.45 : 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9, y: 12, transition: { duration: 0.2 } }}
                          draggable={canManage}
                          onDragStart={(e) => handleDragStart(e, f)}
                          onDragOver={(e) => handleDragOver(e, f.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, f)}
                          className={`relative overflow-hidden bg-white border border-slate-150/80 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300 transition-all p-3.5 flex flex-col justify-between min-h-[185px] h-auto border-l-4 ${statusAccent} ${
                            isDeleting ? 'pointer-events-none select-none' : ''
                          } ${
                            canManage ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            isDragged ? 'opacity-30 scale-[0.97]' : ''
                          } ${
                            isOver ? 'ring-2 ring-indigo-500 ring-offset-2 border-indigo-400 scale-[1.02] bg-indigo-50/5 shadow-lg' : ''
                          }`}
                        >
                          {isDeleting && (
                            <div className="absolute inset-0 bg-slate-50/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5 z-10">
                              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Deleting...</span>
                            </div>
                          )}

                          {/* Match Card Top */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {canManage && (
                                <div className="text-slate-400 hover:text-indigo-500 transition cursor-grab active:cursor-grabbing p-0.5" title="Drag to swap match numbers">
                                  <GripVertical className="w-3.5 h-3.5 shrink-0" />
                                </div>
                              )}
                              {f.matchNumber && (
                                <span className="font-sans text-[12px] font-black text-indigo-700 tracking-wide bg-indigo-100/50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                  #{f.matchNumber}
                                </span>
                              )}
                              <span className="font-mono text-[9px] font-bold text-slate-400 tracking-wider bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                                ID: {f.matchId?.toUpperCase() || 'PND'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${getMatchTypeBadgeClass(f.matchType)}`}>
                                {getMatchTypeLabel(f.matchType)}
                              </span>
                              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${statusBg}`}>
                                {f.status || 'pending'}
                              </span>
                            </div>
                          </div>

                          {/* Match Card Versus Section (Split columns) */}
                          <div className="flex flex-col justify-center space-y-2.5 my-2.5 flex-grow">
                            {f.isDoubles ? (
                              <>
                                <div className="flex items-start justify-between text-xs gap-2">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-black text-slate-800 truncate" title={`${f.player1aName} & ${f.player1bName}`}>
                                      {f.player1aName} & {f.player1bName}
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {playerL1Map[f.player1aId] && (
                                        <span className="text-[9px] text-indigo-600 font-semibold truncate bg-indigo-50/70 px-1 py-0.25 rounded border border-indigo-100/50" title={playerL1Map[f.player1aId]}>
                                          {playerL1Map[f.player1aId]}
                                        </span>
                                      )}
                                      {playerL2Map[f.player1aId] && (
                                        <span className="text-[9px] text-emerald-600 font-semibold truncate bg-emerald-50/70 px-1 py-0.25 rounded border border-emerald-100/50" title={playerL2Map[f.player1aId]}>
                                          {playerL2Map[f.player1aId]}
                                        </span>
                                      )}
                                      {playerL1Map[f.player1bId] && playerL1Map[f.player1bId] !== playerL1Map[f.player1aId] && (
                                        <span className="text-[9px] text-indigo-600 font-semibold truncate bg-indigo-50/70 px-1 py-0.25 rounded border border-indigo-100/50" title={playerL1Map[f.player1bId]}>
                                          {playerL1Map[f.player1bId]}
                                        </span>
                                      )}
                                      {playerL2Map[f.player1bId] && playerL2Map[f.player1bId] !== playerL2Map[f.player1aId] && (
                                        <span className="text-[9px] text-emerald-600 font-semibold truncate bg-emerald-50/70 px-1 py-0.25 rounded border border-emerald-100/50" title={playerL2Map[f.player1bId]}>
                                          {playerL2Map[f.player1bId]}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {f.scores && (f.status === 'completed' || f.status === 'live') ? (
                                    <div className="flex gap-0.5 shrink-0 items-center">
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p1g1 > f.scores.p2g1 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p1g1}</span>
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p1g2 > f.scores.p2g2 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p1g2}</span>
                                      {(f.scores.p1g3 > 0 || f.scores.p2g3 > 0) && (
                                        <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p1g3 > f.scores.p2g3 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p1g3}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold shrink-0 mt-0.5">T1</span>
                                  )}
                                </div>

                                <div className="relative flex items-center justify-center py-0.5">
                                  <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-100/90"></div>
                                  </div>
                                  <span className="relative px-2 bg-white text-[9px] font-black text-indigo-500 bg-indigo-50 rounded-full border border-indigo-100/75 tracking-wider">
                                    VS
                                  </span>
                                </div>

                                <div className="flex items-start justify-between text-xs gap-2">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-black text-slate-800 truncate" title={`${f.player2aName} & ${f.player2bName}`}>
                                      {f.player2aName} & {f.player2bName}
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {playerL1Map[f.player2aId] && (
                                        <span className="text-[9px] text-indigo-600 font-semibold truncate bg-indigo-50/70 px-1 py-0.25 rounded border border-indigo-100/50" title={playerL1Map[f.player2aId]}>
                                          {playerL1Map[f.player2aId]}
                                        </span>
                                      )}
                                      {playerL2Map[f.player2aId] && (
                                        <span className="text-[9px] text-emerald-600 font-semibold truncate bg-emerald-50/70 px-1 py-0.25 rounded border border-emerald-100/50" title={playerL2Map[f.player2aId]}>
                                          {playerL2Map[f.player2aId]}
                                        </span>
                                      )}
                                      {playerL1Map[f.player2bId] && playerL1Map[f.player2bId] !== playerL1Map[f.player2aId] && (
                                        <span className="text-[9px] text-indigo-600 font-semibold truncate bg-indigo-50/70 px-1 py-0.25 rounded border border-indigo-100/50" title={playerL1Map[f.player2bId]}>
                                          {playerL1Map[f.player2bId]}
                                        </span>
                                      )}
                                      {playerL2Map[f.player2bId] && playerL2Map[f.player2bId] !== playerL2Map[f.player2aId] && (
                                        <span className="text-[9px] text-emerald-600 font-semibold truncate bg-emerald-50/70 px-1 py-0.25 rounded border border-emerald-100/50" title={playerL2Map[f.player2bId]}>
                                          {playerL2Map[f.player2bId]}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {f.scores && (f.status === 'completed' || f.status === 'live') ? (
                                    <div className="flex gap-0.5 shrink-0 items-center">
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p2g1 > f.scores.p1g1 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p2g1}</span>
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p2g2 > f.scores.p1g2 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p2g2}</span>
                                      {(f.scores.p1g3 > 0 || f.scores.p2g3 > 0) && (
                                        <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p2g3 > f.scores.p1g3 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p2g3}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold shrink-0 mt-0.5">T2</span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-start justify-between text-xs gap-2">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-black text-slate-800 truncate max-w-[130px]" title={f.player1Name}>
                                      {f.player1Name}
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {playerL1Map[f.player1Id] && (
                                        <span className="text-[9px] text-indigo-600 font-semibold truncate bg-indigo-50/70 px-1 py-0.25 rounded border border-indigo-100/50" title={playerL1Map[f.player1Id]}>
                                          {playerL1Map[f.player1Id]}
                                        </span>
                                      )}
                                      {playerL2Map[f.player1Id] && (
                                        <span className="text-[9px] text-emerald-600 font-semibold truncate bg-emerald-50/70 px-1 py-0.25 rounded border border-emerald-100/50" title={playerL2Map[f.player1Id]}>
                                          {playerL2Map[f.player1Id]}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {f.scores && (f.status === 'completed' || f.status === 'live') ? (
                                    <div className="flex gap-0.5 shrink-0 items-center">
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p1g1 > f.scores.p2g1 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p1g1}</span>
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p1g2 > f.scores.p2g2 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p1g2}</span>
                                      {(f.scores.p1g3 > 0 || f.scores.p2g3 > 0) && (
                                        <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p1g3 > f.scores.p2g3 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p1g3}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold shrink-0 mt-0.5">P1</span>
                                  )}
                                </div>

                                <div className="relative flex items-center justify-center py-0.5">
                                  <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-100/90"></div>
                                  </div>
                                  <span className="relative px-2 bg-white text-[9px] font-black text-indigo-500 bg-indigo-50 rounded-full border border-indigo-100/75 tracking-wider">
                                    VS
                                  </span>
                                </div>

                                <div className="flex items-start justify-between text-xs gap-2">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-black text-slate-800 truncate max-w-[130px]" title={f.player2Name}>
                                      {f.player2Name}
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {playerL1Map[f.player2Id] && (
                                        <span className="text-[9px] text-indigo-600 font-semibold truncate bg-indigo-50/70 px-1 py-0.25 rounded border border-indigo-100/50" title={playerL1Map[f.player2Id]}>
                                          {playerL1Map[f.player2Id]}
                                        </span>
                                      )}
                                      {playerL2Map[f.player2Id] && (
                                        <span className="text-[9px] text-emerald-600 font-semibold truncate bg-emerald-50/70 px-1 py-0.25 rounded border border-emerald-100/50" title={playerL2Map[f.player2Id]}>
                                          {playerL2Map[f.player2Id]}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {f.scores && (f.status === 'completed' || f.status === 'live') ? (
                                    <div className="flex gap-0.5 shrink-0 items-center">
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p2g1 > f.scores.p1g1 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p2g1}</span>
                                      <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p2g2 > f.scores.p1g2 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p2g2}</span>
                                      {(f.scores.p1g3 > 0 || f.scores.p2g3 > 0) && (
                                        <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-black ${f.scores.p2g3 > f.scores.p1g3 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/50 font-black' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{f.scores.p2g3}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold shrink-0 mt-0.5">P2</span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Match Card Bottom */}
                          <div className="flex items-center justify-between border-t border-slate-50 pt-2 text-[10px] text-slate-500">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold flex items-center gap-0.5 text-slate-500">
                                🎯 {f.pointsTarget || '15'} pts
                              </span>
                              {f.court && (
                                <span className="font-black text-amber-700 bg-amber-50 px-1 rounded flex items-center gap-0.5 text-[9px]">
                                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                                  {f.court}
                                </span>
                              )}
                            </div>

                            {/* Quick Action & Scoring Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {canScore && (
                                <button 
                                  type="button"
                                  onClick={() => openScoringModal(f)} 
                                  title="Enter or Edit Score"
                                  className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Trophy className="w-2.5 h-2.5" />
                                  Score
                                </button>
                              )}
                              {isAdmin && (
                                <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-100 shrink-0">
                                  <button 
                                    onClick={() => handleEdit(f)} 
                                    title="Edit Match"
                                    className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(f)} 
                                    title="Delete Match"
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FOOTER NAVIGATION */}
      {fixtures.length > 0 && (
        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button 
            type="button"
            onClick={onNext} 
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.01] text-white font-extrabold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>Proceed to Match Scores</span>
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Custom Confirmation Modal for Fixture Deletion */}
      <AnimatePresence>
        {fixtureToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFixtureToDelete(null)}
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
                <h3 className="text-lg font-black text-slate-900">Delete Match Fixture?</h3>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Are you sure you want to delete this match between <strong className="text-slate-800 font-bold">{fixtureToDelete.isDoubles ? `${fixtureToDelete.player1aName} & ${fixtureToDelete.player1bName}` : fixtureToDelete.player1Name}</strong> and <strong className="text-slate-800 font-bold">{fixtureToDelete.isDoubles ? `${fixtureToDelete.player2aName} & ${fixtureToDelete.player2bName}` : fixtureToDelete.player2Name}</strong>? This will also remove any score recorded for it and cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setFixtureToDelete(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmDelete}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition"
                >
                  Delete Match
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scoring Modal */}
      <AnimatePresence>
        {scoringFixture && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setScoringFixture(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            {/* Modal Box */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl relative z-10 border border-slate-100"
            >
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 text-indigo-600">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Record Match Score</h3>
                    <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                      {scoringFixture.matchNumber ? `Match #${scoringFixture.matchNumber}` : `ID: ${scoringFixture.matchId}`}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setScoringFixture(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Match Teams Header */}
              <div className="bg-slate-50/75 rounded-2xl p-4 mb-4 border border-slate-100 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">Team 1 (T1)</span>
                  <span className="text-indigo-600 font-black px-2 py-0.5 bg-indigo-50 rounded-full border border-indigo-150 text-[10px]">VS</span>
                  <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px] text-right">Team 2 (T2)</span>
                </div>
                <div className="grid grid-cols-2 gap-4 items-center">
                  <div className="text-sm font-black text-slate-800">
                    {scoringFixture.isDoubles ? `${scoringFixture.player1aName} & ${scoringFixture.player1bName}` : scoringFixture.player1Name}
                  </div>
                  <div className="text-sm font-black text-slate-800 text-right">
                    {scoringFixture.isDoubles ? `${scoringFixture.player2aName} & ${scoringFixture.player2bName}` : scoringFixture.player2Name}
                  </div>
                </div>
              </div>

              {/* Status and Walkover Controls */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Match Status</label>
                  <select 
                    value={scoringStatus}
                    onChange={(e) => setScoringStatus(e.target.value as any)}
                    className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-hidden focus:border-indigo-500 transition"
                  >
                    <option value="completed">Completed (Finalized)</option>
                    <option value="live">Live (Draft/In-Progress)</option>
                    <option value="pending">Pending (Clear Scores)</option>
                  </select>
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={isWalkover}
                      onChange={(e) => setIsWalkover(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span>Walkover Match?</span>
                  </label>
                </div>
              </div>

              {/* Walkover Options */}
              {isWalkover && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-4">
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-amber-800 mb-1.5">Select Winner of Walkover</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => setWalkoverWinner('player1')}
                      className={`px-3 py-2 text-xs font-black rounded-xl border transition ${walkoverWinner === 'player1' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {scoringFixture.isDoubles ? `${scoringFixture.player1aName}` : scoringFixture.player1Name}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setWalkoverWinner('player2')}
                      className={`px-3 py-2 text-xs font-black rounded-xl border transition ${walkoverWinner === 'player2' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {scoringFixture.isDoubles ? `${scoringFixture.player2aName}` : scoringFixture.player2Name}
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-700 mt-2">
                    Note: A walkover automatically awards the win and full points target ({scoringFixture.pointsTarget || '15'} pts) per set to the selected winner.
                  </p>
                </div>
              )}

              {/* Score Input Form */}
              {!isWalkover && scoringStatus !== 'pending' && (
                <div className="space-y-3.5 mb-5 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
                    <span>Set 1</span>
                    <span>Set 2</span>
                    <span>Set 3 (If played)</span>
                  </div>

                  {/* Team 1 Score Row */}
                  <div className="bg-slate-50/50 border border-slate-100/80 rounded-2xl p-3">
                    <span className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-wide mb-2 truncate">
                      {scoringFixture.isDoubles ? `${scoringFixture.player1aName} & ${scoringFixture.player1bName}` : scoringFixture.player1Name}
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <input 
                          type="number"
                          min="0"
                          max="30"
                          value={scP1g1}
                          onChange={(e) => setScP1g1(e.target.value)}
                          className="w-full text-center text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-2 py-2 focus:border-indigo-500 outline-hidden transition font-mono"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <input 
                          type="number"
                          min="0"
                          max="30"
                          value={scP1g2}
                          onChange={(e) => setScP1g2(e.target.value)}
                          className="w-full text-center text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-2 py-2 focus:border-indigo-500 outline-hidden transition font-mono"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <input 
                          type="number"
                          min="0"
                          max="30"
                          value={scP1g3}
                          onChange={(e) => setScP1g3(e.target.value)}
                          className="w-full text-center text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-2 py-2 focus:border-indigo-500 outline-hidden transition font-mono"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Team 2 Score Row */}
                  <div className="bg-slate-50/50 border border-slate-100/80 rounded-2xl p-3">
                    <span className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-wide mb-2 truncate text-right">
                      {scoringFixture.isDoubles ? `${scoringFixture.player2aName} & ${scoringFixture.player2bName}` : scoringFixture.player2Name}
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <input 
                          type="number"
                          min="0"
                          max="30"
                          value={scP2g1}
                          onChange={(e) => setScP2g1(e.target.value)}
                          className="w-full text-center text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-2 py-2 focus:border-indigo-500 outline-hidden transition font-mono"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <input 
                          type="number"
                          min="0"
                          max="30"
                          value={scP2g2}
                          onChange={(e) => setScP2g2(e.target.value)}
                          className="w-full text-center text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-2 py-2 focus:border-indigo-500 outline-hidden transition font-mono"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <input 
                          type="number"
                          min="0"
                          max="30"
                          value={scP2g3}
                          onChange={(e) => setScP2g3(e.target.value)}
                          className="w-full text-center text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-2 py-2 focus:border-indigo-500 outline-hidden transition font-mono"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning or note */}
              {scoringStatus === 'pending' && (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 mb-5 text-xs text-rose-700 font-semibold">
                  Setting the status back to "Pending" will clear all scores and revert any awarded standing points for this match.
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end border-t border-slate-100 pt-4">
                <button 
                  type="button"
                  onClick={() => setScoringFixture(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleSaveScores}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Save Scores
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
