import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
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
  where 
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
  Award
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
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [manualPlayer1, setManualPlayer1] = useState('');
  const [manualPlayer2, setManualPlayer2] = useState('');
  const [manualGroup, setManualGroup] = useState('');
  const [pointsTarget, setPointsTarget] = useState('15');
  const [matchType, setMatchType] = useState<'league' | 'pre_quarter' | 'quarter' | 'semi' | 'final'>('league');
  const [groups, setGroups] = useState<any[]>([]);
  const [editingFixture, setEditingFixture] = useState<any | null>(null);
  const [manualCourt, setManualCourt] = useState('');
  const [courts, setCourts] = useState<string[]>(['Court 1', 'Court 2', 'Court 3', 'Court 4', 'Court 5', 'Court 6']);
  const [isGenerating, setIsGenerating] = useState(false);

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

    return () => {
      unsubscribeFixtures();
      unsubscribePlayers();
      unsubscribeGroups();
      unsubscribeTournament();
    };
  }, [tournamentId]);

  const playerMap = Object.fromEntries(players.map(p => [p.id, p.name]));

  const generateShortId = () => Math.random().toString(36).substring(2, 6);

  const addManualFixture = async () => {
    if (isGenerating) return;
    if (!manualPlayer1 || !manualPlayer2 || manualPlayer1 === manualPlayer2 || !manualGroup) return;
    try {
      setIsGenerating(true);
      const docRef = await addDoc(collection(db, `tournaments/${tournamentId}/fixtures`), {
        player1Id: manualPlayer1,
        player1Name: playerMap[manualPlayer1],
        player2Id: manualPlayer2,
        player2Name: playerMap[manualPlayer2],
        groupName: manualGroup,
        matchType: matchType,
        pointsTarget: pointsTarget,
        status: 'pending',
        court: manualCourt
      });
      await updateDoc(docRef, { matchId: generateShortId() });
      setManualPlayer1('');
      setManualPlayer2('');
      setManualGroup('');
      setMatchType('league');
      setManualCourt('');
    } catch (e) {
      console.error("Error creating manual match:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this match? This will also remove any score recorded for it.")) return;
    await deleteDoc(doc(db, `tournaments/${tournamentId}/fixtures`, id));
    
    // Delete associated match result if it exists
    const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`), where('fixtureId', '==', id));
    const querySnapshot = await getDocs(matchesQuery);
    
    const batch = writeBatch(db);
    querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();
  };

  const handleEdit = (fixture: any) => {
    setEditingFixture(fixture);
    setManualPlayer1(fixture.player1Id);
    setManualPlayer2(fixture.player2Id);
    setManualGroup(fixture.groupName);
    setMatchType(fixture.matchType || 'league');
    setManualCourt(fixture.court || '');
  };

  const handleCancelEdit = () => {
    setEditingFixture(null);
    setManualPlayer1('');
    setManualPlayer2('');
    setManualGroup('');
    setMatchType('league');
    setManualCourt('');
  };

  const handleUpdate = async () => {
    if (isGenerating) return;
    if (!editingFixture || !manualPlayer1 || !manualPlayer2 || !manualGroup) return;
    try {
      setIsGenerating(true);
      await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, editingFixture.id), {
        player1Id: manualPlayer1,
        player1Name: playerMap[manualPlayer1],
        player2Id: manualPlayer2,
        player2Name: playerMap[manualPlayer2],
        groupName: manualGroup,
        matchType: matchType,
        court: manualCourt
      });
      setEditingFixture(null);
      setManualPlayer1('');
      setManualPlayer2('');
      setManualGroup('');
      setMatchType('league');
      setManualCourt('');
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

      for (let i = 0; i < filteredPlayers.length; i++) {
          for (let j = i + 1; j < filteredPlayers.length; j++) {
              const newDocRef = doc(fixturesCol);
              batch.set(newDocRef, {
                  player1Id: filteredPlayers[i].id,
                  player1Name: filteredPlayers[i].name,
                  player2Id: filteredPlayers[j].id,
                  player2Name: filteredPlayers[j].name,
                  groupName: manualGroup,
                  matchType: 'league',
                  pointsTarget: pointsTarget,
                  status: 'pending',
                  matchId: generateShortId(),
                  court: ''
              });
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

  // Filter and search computation
  const filteredFixtures = fixtures.filter(f => {
    const matchesSearch = !searchQuery.trim() || 
      (f.player1Name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.player2Name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.matchId || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGroup = groupFilter === 'all' || f.groupName === groupFilter;
    const matchesType = typeFilter === 'all' || f.matchType === typeFilter;
    const matchesStatus = statusFilter === 'all' || f.status === statusFilter;

    return matchesSearch && matchesGroup && matchesType && matchesStatus;
  });

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
          <div className="flex gap-4 pt-2">
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
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500">Player 1</label>
              <select 
                value={manualPlayer1} 
                onChange={e => setManualPlayer1(e.target.value)} 
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="">Select Player 1</option>
                {filteredPlayers.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === manualPlayer2}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500">Player 2</label>
              <select 
                value={manualPlayer2} 
                onChange={e => setManualPlayer2(e.target.value)} 
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="">Select Player 2</option>
                {filteredPlayers.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === manualPlayer1}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
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
              <label className="text-[10px] font-bold text-slate-500">Court / Location</label>
              <select 
                value={manualCourt} 
                onChange={e => setManualCourt(e.target.value)} 
                className="w-full bg-white border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              >
                <option value="">No Court Assigned</option>
                {courts.map(court => <option key={court} value={court}>{court}</option>)}
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
                  <>Add Single Match</>
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
          ) as [string, any[]][]).sort((a, b) => a[0].localeCompare(b[0])).map(([groupName, groupMatches]) => {
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
                  {groupMatches.map((f, idx) => {
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

                    return (
                      <div 
                        key={f.id} 
                        className={`bg-white border border-slate-150/80 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300 transition-all p-3.5 flex flex-col justify-between h-[175px] border-l-4 ${statusAccent}`}
                      >
                        {/* Match Card Top */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[9px] font-black text-slate-400 tracking-wider bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                            #{f.matchId?.toUpperCase() || 'PND'}
                          </span>

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
                        <div className="flex flex-col justify-center space-y-1.5 my-2 flex-grow">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-slate-800 truncate max-w-[130px]" title={f.player1Name}>
                              {f.player1Name}
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold">P1</span>
                          </div>

                          <div className="relative flex items-center justify-center py-0.5">
                            <div className="absolute inset-0 flex items-center">
                              <div className="w-full border-t border-slate-100/90"></div>
                            </div>
                            <span className="relative px-2 bg-white text-[9px] font-black text-indigo-500 bg-indigo-50 rounded-full border border-indigo-100/75 tracking-wider">
                              VS
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-slate-800 truncate max-w-[130px]" title={f.player2Name}>
                              {f.player2Name}
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold">P2</span>
                          </div>
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

                          {/* Quick Action Buttons */}
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
                                onClick={() => handleDelete(f.id)} 
                                title="Delete Match"
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
    </div>
  );
}
