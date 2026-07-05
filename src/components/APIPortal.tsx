import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  Code, 
  Copy, 
  Check, 
  Play, 
  ArrowLeft, 
  ExternalLink, 
  Database, 
  Cpu, 
  Activity, 
  Terminal,
  RefreshCw,
  Search,
  BookOpen,
  Users,
  Layers,
  Calendar,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Trophy,
  Filter
} from 'lucide-react';

interface APIPortalProps {
  currentTournamentId?: string | null;
  onBack: () => void;
}

interface APIEndpoint {
  method: 'GET';
  path: string;
  description: string;
  requiresTournamentId: boolean;
  sampleResponse?: any;
}

export default function APIPortal({ currentTournamentId, onBack }: APIPortalProps) {
  const [tournaments, setTournaments] = useState<{ id: string; tournamentName?: string; tournamentType?: string }[]>([]);
  const [selectedTid, setSelectedTid] = useState<string>(currentTournamentId || '');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [loadingTest, setLoadingTest] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ path: string; data: any } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Tabs for the API Portal
  const [activePortalTab, setActivePortalTab] = useState<'directory' | 'explorer'>('explorer');

  // Interactive Explorer States
  const [explorerTid, setExplorerTid] = useState<string>(currentTournamentId || '');
  const [explorerLoading, setExplorerLoading] = useState<boolean>(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerData, setExplorerData] = useState<any | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState<string>('');
  const [fixtureSearch, setFixtureSearch] = useState<string>('');
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string>('');

  // Fetch available tournaments
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tournaments'), (snap) => {
      const list = snap.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id,
          tournamentName: data.tournamentName || data.name || doc.id,
          tournamentType: data.tournamentType || 'Custom'
        };
      });
      setTournaments(list);
      
      // Select first tournament by default if none specified
      if (!selectedTid && list.length > 0) {
        setSelectedTid(list[0].id);
      }
      if (!explorerTid && list.length > 0) {
        setExplorerTid(list[0].id);
      }
    });
    return unsub;
  }, []);

  // Fetch explorer data whenever explorerTid changes or activePortalTab changes to 'explorer'
  useEffect(() => {
    if (activePortalTab === 'explorer' && explorerTid) {
      loadExplorerData(explorerTid);
    }
  }, [explorerTid, activePortalTab]);

  const loadExplorerData = async (tid: string) => {
    if (!tid) return;
    setExplorerLoading(true);
    setExplorerError(null);
    setExplorerData(null);
    try {
      const res = await fetch(`/api/tournaments/${tid}/consolidated`);
      if (!res.ok) {
        throw new Error(`Failed to load consolidated data (Status ${res.status})`);
      }
      const data = await res.json();
      setExplorerData(data);
    } catch (err: any) {
      setExplorerError(err.message || 'Error loading consolidated data');
    } finally {
      setExplorerLoading(false);
    }
  };

  const endpoints: APIEndpoint[] = [
    {
      method: 'GET',
      path: '/api/health',
      description: 'Check backend service connection and Firebase configuration status.',
      requiresTournamentId: false
    },
    {
      method: 'GET',
      path: '/api/tournaments',
      description: 'List all badminton tournaments registered in the system.',
      requiresTournamentId: false
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId',
      description: 'Retrieve detailed configuration and meta-information of a specific tournament.',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId/consolidated',
      description: 'Fetch the COMPLETE tournament state (Meta + Players + Groups + Fixtures + Matches + Roots + Live Standings) in ONE unified, server-calculated API call.',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId/standings',
      description: 'Get live, aggregated points standings and win/loss records computed dynamically by the server (perfect for OBS / stream overlays).',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId/players',
      description: 'Fetch the complete player roster registered in a specific tournament.',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId/groups',
      description: 'Fetch all round-robin groups (Group A, Group B, etc.) configured in a specific tournament.',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId/fixtures',
      description: 'Fetch all scheduled fixtures, courts, points targets, and group associations.',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId/matches',
      description: 'Fetch all logged match scores and set-by-set points history for completed games.',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/tournaments/:tournamentId/roots',
      description: 'Fetch organizational hierarchy roots for the tournament Master Hierarchy structure.',
      requiresTournamentId: true
    },
    {
      method: 'GET',
      path: '/api/global-players',
      description: 'Fetch the master global player registry database (cross-tournament).',
      requiresTournamentId: false
    }
  ];

  const getPopulatedPath = (path: string, tidContext?: string) => {
    const tid = tidContext || selectedTid || 'YOUR_TOURNAMENT_ID';
    if (path.includes(':tournamentId')) {
      return path.replace(':tournamentId', tid);
    }
    return path;
  };

  const handleCopy = (path: string, tidContext?: string) => {
    const fullUrl = window.location.origin + getPopulatedPath(path, tidContext);
    navigator.clipboard.writeText(fullUrl);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleTestAPI = async (path: string) => {
    const targetPath = getPopulatedPath(path);
    setLoadingTest(path);
    setTestResult(null);
    try {
      const res = await fetch(targetPath);
      const data = await res.json();
      setTestResult({
        path: targetPath,
        data
      });
    } catch (err: any) {
      setTestResult({
        path: targetPath,
        data: { error: err.message || 'Failed to fetch API data' }
      });
    } finally {
      setLoadingTest(null);
    }
  };

  const filteredEndpoints = endpoints.filter(ep => 
    ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ep.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-2 uppercase tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </button>
          <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <Code className="w-6 h-6 text-indigo-500" />
            Developer API Links & Live Portal
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time server-side JSON endpoints. Build OBS stream overlays, tickers, widgets, and third-party tools instantly.
          </p>
        </div>

        {/* TAB CONTROLS */}
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 self-stretch lg:self-auto">
          <button
            onClick={() => setActivePortalTab('explorer')}
            className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activePortalTab === 'explorer' 
                ? 'bg-white text-indigo-600 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-500" />
            Interactive Live Explorer
          </button>
          <button
            onClick={() => setActivePortalTab('directory')}
            className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activePortalTab === 'directory' 
                ? 'bg-white text-indigo-600 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4 text-slate-500" />
            Endpoint Directory & Playground
          </button>
        </div>
      </div>

      {/* ==================== TAB 1: INTERACTIVE LIVE EXPLORER ==================== */}
      {activePortalTab === 'explorer' && (
        <div className="space-y-6">
          
          {/* TOURNAMENT CONTEXT SELECTION & CONSOLIDATED INFO */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200/60 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider bg-indigo-50 px-2.5 py-1 rounded-md">
                  Single Unified API Integration
                </span>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5 mt-1">
                  Explore tournament data parsed in 1 Consolidated call:
                </h3>
                <p className="text-xs text-slate-500 max-w-2xl">
                  This explorer is loaded dynamically from the unified endpoint 
                  <code className="bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] mx-1">
                    /api/tournaments/:id/consolidated
                  </code>. Tap on any registered tournament below to pull its full real-time database.
                </p>
              </div>

              {/* Tournament picker */}
              <div className="flex items-center gap-3 shrink-0 self-stretch md:self-auto bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-2xs">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Active ID:</label>
                <select 
                  value={explorerTid}
                  onChange={(e) => setExplorerTid(e.target.value)}
                  className="bg-transparent border-0 rounded-lg text-xs font-extrabold text-slate-800 pr-8 focus:ring-0 outline-none cursor-pointer"
                >
                  {tournaments.length === 0 ? (
                    <option value="">No Tournaments Found</option>
                  ) : (
                    tournaments.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.tournamentName || t.id} ({t.id})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Live Copyable URL */}
            {explorerTid && (
              <div className="mt-4 pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/50 p-3 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="bg-indigo-600 text-white font-black text-[9px] px-2 py-0.5 rounded-sm uppercase shrink-0">GET</span>
                  <code className="text-xs font-mono font-bold text-slate-700 truncate break-all">
                    {window.location.origin}/api/tournaments/{explorerTid}/consolidated
                  </code>
                </div>
                <button
                  onClick={() => handleCopy('/api/tournaments/:tournamentId/consolidated', explorerTid)}
                  className={`px-3.5 py-1.5 rounded-lg border text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                    copiedPath === '/api/tournaments/:tournamentId/consolidated'
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {copiedPath === '/api/tournaments/:tournamentId/consolidated' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Unified API Endpoint</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* LOADING AND ERROR HANDLERS */}
          {explorerLoading && (
            <div className="bg-white border border-slate-100 p-20 rounded-3xl text-center space-y-3 shadow-xs">
              <RefreshCw className="w-10 h-10 mx-auto text-indigo-500 animate-spin" />
              <p className="text-sm font-black text-slate-700">Fetching Consolidated payload...</p>
              <p className="text-xs text-slate-400">Loading meta config, rosters, fixtures, and standings in one network call.</p>
            </div>
          )}

          {explorerError && (
            <div className="bg-rose-50 border border-rose-200 p-8 rounded-3xl text-center space-y-2">
              <p className="text-sm font-bold text-rose-700">Error loading data</p>
              <p className="text-xs text-rose-500">{explorerError}</p>
              <button 
                onClick={() => loadExplorerData(explorerTid)}
                className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition"
              >
                Retry
              </button>
            </div>
          )}

          {/* INTERACTIVE DATA COLUMNS */}
          {!explorerLoading && !explorerError && explorerData && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              
              {/* PANEL 1: PLAYER DETAILS */}
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
                      <Users className="w-4.5 h-4.5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">👤 Player Details</h4>
                      <p className="text-[11px] text-slate-400">Roster registered in tournament</p>
                    </div>
                  </div>
                  <span className="bg-sky-50 text-sky-700 font-extrabold text-xs px-2.5 py-0.5 rounded-full">
                    {explorerData.players?.length || 0} players
                  </span>
                </div>

                {/* Local search */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Search player name..."
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition"
                  />
                </div>

                {/* Player list */}
                <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                  {(explorerData.players || [])
                    .filter((p: any) => p.name?.toLowerCase().includes(playerSearch.toLowerCase()))
                    .map((p: any) => (
                      <div 
                        key={p.id}
                        className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-100 rounded-xl transition flex flex-col gap-1 text-xs"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">{p.name}</span>
                          <span className="font-mono text-[9px] bg-slate-200/60 px-1.5 py-0.5 rounded text-slate-500">ID: {p.id.slice(0,6)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1 text-[10px] text-slate-500">
                          {p.category && (
                            <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-medium">
                              {p.category}
                            </span>
                          )}
                          {p.hand && (
                            <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-medium">
                              {p.hand} Play
                            </span>
                          )}
                          {p.isDoublesPair && (
                            <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">
                              Doubles Team
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  }
                  {(!explorerData.players || explorerData.players.length === 0) && (
                    <p className="text-xs text-slate-400 text-center py-6">No players registered.</p>
                  )}
                </div>
              </div>

              {/* PANEL 2: GROUPS DATA (WITH EXPANDABLE ACCORDION) */}
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                      <Layers className="w-4.5 h-4.5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">👥 Groups Data</h4>
                      <p className="text-[11px] text-slate-400">Click any group card below to open</p>
                    </div>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 font-extrabold text-xs px-2.5 py-0.5 rounded-full">
                    {explorerData.groups?.length || 0} groups
                  </span>
                </div>

                {/* Groups Accordion List */}
                <div className="space-y-3">
                  {(explorerData.groups || []).map((group: any) => {
                    const isExpanded = expandedGroup === group.name;
                    const groupStandings = explorerData.standings?.[group.name] || [];
                    
                    return (
                      <div 
                        key={group.id}
                        className={`border rounded-2xl transition-all overflow-hidden ${
                          isExpanded 
                            ? 'border-indigo-200 bg-indigo-50/10 shadow-xs' 
                            : 'border-slate-100 hover:border-slate-200 bg-slate-50'
                        }`}
                      >
                        {/* Group Header trigger */}
                        <button
                          onClick={() => setExpandedGroup(isExpanded ? null : group.name)}
                          className="w-full text-left p-4 flex items-center justify-between transition-colors hover:bg-slate-100/50"
                        >
                          <div className="space-y-0.5">
                            <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                              🏆 {group.name}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {group.playerIds?.length || 0} registered players
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-white border px-2 py-0.5 rounded-md">
                              {isExpanded ? 'Collapse' : 'Open'}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                        </button>

                        {/* Group Body: Dynamic standings and parameters */}
                        {isExpanded && (
                          <div className="p-4 bg-white border-t border-slate-100 space-y-3 animate-fadeIn">
                            
                            {/* Live Standings block */}
                            <div className="space-y-1.5">
                              <span className="text-[9px] font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1 bg-indigo-50/50 px-2 py-1 rounded-sm w-fit">
                                <Trophy className="w-3 h-3" /> Live Standings (Dynamic computation)
                              </span>
                              
                              {groupStandings.length > 0 ? (
                                <div className="border border-slate-100 rounded-xl overflow-hidden text-[11px]">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 text-slate-500 font-extrabold text-[9px] border-b border-slate-100">
                                        <th className="py-2 px-2.5 text-center w-8">Rank</th>
                                        <th className="py-2 px-2">Player/Team</th>
                                        <th className="py-2 px-1.5 text-center">W-L</th>
                                        <th className="py-2 px-1.5 text-center">Pts</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {groupStandings.map((st: any, idx: number) => (
                                        <tr key={st.playerId} className="hover:bg-slate-50/50">
                                          <td className="py-2 px-2.5 text-center font-black text-slate-400">{idx + 1}</td>
                                          <td className="py-2 px-2 font-bold text-slate-700 truncate max-w-[110px]" title={st.playerName}>
                                            {st.playerName}
                                          </td>
                                          <td className="py-2 px-1.5 text-center text-slate-500 font-medium">
                                            {st.wins} - {st.losses}
                                          </td>
                                          <td className="py-2 px-1.5 text-center font-black text-indigo-600">
                                            {st.matchPoints}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-[10px] text-slate-400 italic py-1">No matches logged yet to compute standings.</p>
                              )}
                            </div>

                            {/* Registered Player IDs */}
                            <div className="space-y-1">
                              <span className="block text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">
                                Participant Keys
                              </span>
                              <div className="grid grid-cols-1 gap-1">
                                {(group.playerIds || []).map((id: string) => {
                                  // Find player name locally from explorerData
                                  const plObj = explorerData.players?.find((p: any) => p.id === id);
                                  return (
                                    <div key={id} className="flex justify-between items-center text-[10px] bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                      <span className="font-semibold text-slate-600 truncate">{plObj ? plObj.name : 'Unknown Player'}</span>
                                      <span className="font-mono text-[8px] text-slate-400">{id.slice(0, 8)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(!explorerData.groups || explorerData.groups.length === 0) && (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No groups configured in this tournament.
                    </div>
                  )}
                </div>
              </div>

              {/* PANEL 3: FIXTURES & COURT ALLOCATIONS */}
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                      <Calendar className="w-4.5 h-4.5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">🏆 Fixture Matches & Courts</h4>
                      <p className="text-[11px] text-slate-400">Courts, rounds, and live results</p>
                    </div>
                  </div>
                  <span className="bg-indigo-50 text-indigo-700 font-extrabold text-xs px-2.5 py-0.5 rounded-full">
                    {explorerData.fixtures?.length || 0} fixtures
                  </span>
                </div>

                {/* Fixture filters */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400">
                      <Search className="w-3 h-3" />
                    </span>
                    <input 
                      type="text" 
                      placeholder="Filter match..."
                      value={fixtureSearch}
                      onChange={(e) => setFixtureSearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>

                  <div className="relative">
                    <select
                      value={selectedCourtFilter}
                      onChange={(e) => setSelectedCourtFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-600 p-1.5 rounded-xl text-[11px] font-semibold focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="">All Courts</option>
                      <option value="Court 1">Court 1</option>
                      <option value="Court 2">Court 2</option>
                      <option value="Court 3">Court 3</option>
                      <option value="Unassigned">No Court</option>
                    </select>
                  </div>
                </div>

                {/* Fixture list */}
                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                  {(explorerData.fixtures || [])
                    .filter((f: any) => {
                      const matchesSearch = 
                        f.player1Name?.toLowerCase().includes(fixtureSearch.toLowerCase()) || 
                        f.player2Name?.toLowerCase().includes(fixtureSearch.toLowerCase()) ||
                        f.groupName?.toLowerCase().includes(fixtureSearch.toLowerCase());
                      
                      const matchesCourt = 
                        !selectedCourtFilter || 
                        (selectedCourtFilter === 'Unassigned' && !f.court) ||
                        (f.court === selectedCourtFilter);

                      return matchesSearch && matchesCourt;
                    })
                    .map((f: any) => {
                      const isLive = f.status === 'live';
                      const isCompleted = f.status === 'completed';
                      
                      return (
                        <div 
                          key={f.id}
                          className={`p-3 border rounded-xl transition ${
                            isLive 
                              ? 'border-emerald-200 bg-emerald-50/20' 
                              : isCompleted 
                                ? 'border-slate-100 bg-slate-50/50' 
                                : 'border-slate-150 bg-white'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-extrabold text-slate-400">MATCH ID #{f.matchId || f.id.slice(0,5).toUpperCase()}</span>
                            
                            {/* Status and Court Badges */}
                            <div className="flex items-center gap-1.5">
                              {f.court ? (
                                <span className="bg-slate-100 border text-slate-600 font-extrabold text-[9px] px-1.5 py-0.5 rounded">
                                  📍 {f.court}
                                </span>
                              ) : (
                                <span className="bg-slate-100 border text-slate-400 font-medium text-[9px] px-1.5 py-0.5 rounded italic">
                                  No Court
                                </span>
                              )}

                              {isLive && (
                                <span className="bg-emerald-100 text-emerald-700 font-black text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                                  <span className="w-1 h-1 rounded-full bg-emerald-600 animate-ping" />
                                  LIVE
                                </span>
                              )}
                              {isCompleted && (
                                <span className="bg-slate-200 text-slate-700 font-bold text-[9px] px-1.5 py-0.5 rounded">
                                  FINISHED
                                </span>
                              )}
                              {!isLive && !isCompleted && (
                                <span className="bg-amber-50 text-amber-600 font-bold text-[9px] border border-amber-100 px-1.5 py-0.5 rounded">
                                  PENDING
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Match participants */}
                          <div className="mt-2 space-y-1 text-xs">
                            <div className="flex justify-between items-center font-bold text-slate-800">
                              <span className={f.scores?.p1g1 > f.scores?.p2g1 && isCompleted ? "text-indigo-600" : ""}>
                                {f.player1Name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-normal">vs</span>
                              <span className={f.scores?.p2g1 > f.scores?.p1g1 && isCompleted ? "text-indigo-600" : ""}>
                                {f.player2Name}
                              </span>
                            </div>

                            {/* Scores block */}
                            {(isLive || isCompleted) && f.scores && (
                              <div className="mt-2 bg-white/70 border border-slate-100 rounded-lg p-2 flex justify-center gap-4 text-center font-mono font-bold text-[10px]">
                                <div>
                                  <div className="text-slate-400 text-[8px] font-sans font-semibold mb-0.5">SET 1</div>
                                  <div className="text-slate-700">{f.scores.p1g1 || 0} - {f.scores.p2g1 || 0}</div>
                                </div>
                                {((f.scores.p1g2 || 0) > 0 || (f.scores.p2g2 || 0) > 0 || isCompleted) && (
                                  <div>
                                    <div className="text-slate-400 text-[8px] font-sans font-semibold mb-0.5">SET 2</div>
                                    <div className="text-slate-700">{f.scores.p1g2 || 0} - {f.scores.p2g2 || 0}</div>
                                  </div>
                                )}
                                {((f.scores.p1g3 || 0) > 0 || (f.scores.p2g3 || 0) > 0 || isCompleted) && (
                                  <div>
                                    <div className="text-slate-400 text-[8px] font-sans font-semibold mb-0.5">SET 3</div>
                                    <div className="text-slate-700">{f.scores.p1g3 || 0} - {f.scores.p2g3 || 0}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-100 text-[9px] text-slate-400 flex justify-between items-center">
                            <span>Stage: <strong className="text-slate-600 capitalize font-semibold">{f.matchType || 'League'}</strong></span>
                            {f.groupName && <span>Group: <strong className="text-slate-600 font-semibold">{f.groupName}</strong></span>}
                          </div>
                        </div>
                      );
                    })
                  }
                  {(!explorerData.fixtures || explorerData.fixtures.length === 0) && (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No fixtures matched filters.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: ENDPOINT DIRECTORY & PLAYGROUND ==================== */}
      {activePortalTab === 'directory' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            
            {/* Search Endpoint Directory */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                placeholder="Search available endpoints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-slate-400 text-slate-700"
              />
            </div>

            {/* Context manual selection for directory list */}
            <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex items-center justify-between text-xs gap-3">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-700">Roster Context Binding</span>
                <span className="block text-[10px] text-slate-400">Replace :tournamentId segments dynamically across copy links</span>
              </div>
              <select 
                value={selectedTid}
                onChange={(e) => setSelectedTid(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg text-xs font-extrabold text-slate-700 px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {tournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.id}</option>
                ))}
              </select>
            </div>

            {/* API List */}
            <div className="space-y-4">
              {filteredEndpoints.map((ep) => {
                const populated = getPopulatedPath(ep.path);
                const isCopied = copiedPath === ep.path;
                const isTesting = loadingTest === ep.path;

                return (
                  <div 
                    key={ep.path} 
                    className="bg-white border border-slate-100 rounded-2xl shadow-xs hover:shadow-sm transition-all p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-indigo-50 text-indigo-700 font-extrabold text-[10px] px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                          {ep.method}
                        </span>
                        <code className="text-xs font-mono font-bold text-slate-800 break-all bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                          {populated}
                        </code>
                      </div>
                      <p className="text-slate-500 text-xs leading-relaxed max-w-xl">
                        {ep.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                      <button
                        onClick={() => handleCopy(ep.path)}
                        className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 ${
                          isCopied 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                        title="Copy full URL"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCopied ? 'Copied' : 'Copy Link'}</span>
                      </button>

                      <button
                        onClick={() => handleTestAPI(ep.path)}
                        disabled={isTesting}
                        className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm shadow-indigo-600/10"
                      >
                        {isTesting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>Test API</span>
                      </button>
                      
                      <a 
                        href={populated} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center border border-slate-200"
                        title="Open endpoint in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}

              {filteredEndpoints.length === 0 && (
                <div className="bg-slate-50 border border-slate-150 p-12 rounded-3xl text-center text-slate-400">
                  <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold">No endpoints matched your search.</p>
                </div>
              )}
            </div>
          </div>

          {/* SIDEBAR: RESPONSE PLAYGROUND & INTEGRATION GUIDE */}
          <div className="space-y-6">
            
            {/* RESPONSE PLAYGROUND */}
            <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-xl overflow-hidden border border-slate-800 flex flex-col min-h-[350px]">
              <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-300">Response Playground</span>
                </div>
                {testResult && (
                  <button 
                    onClick={() => setTestResult(null)}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors font-bold uppercase tracking-wider"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between font-mono text-[11px] leading-relaxed overflow-auto">
                {testResult ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-[9px] font-bold">200 OK</span>
                      <span className="text-slate-500 truncate max-w-[200px]">{testResult.path}</span>
                    </div>
                    <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-emerald-300 overflow-x-auto max-h-[300px] select-all">
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-slate-500 text-center py-20 flex flex-col items-center justify-center space-y-2">
                    <Cpu className="w-8 h-8 text-slate-700 animate-pulse" />
                    <p className="text-xs font-bold text-slate-600">No active request</p>
                    <p className="text-[10px] text-slate-600 max-w-[180px]">Click "Test API" on any endpoint to view real-time JSON responses.</p>
                  </div>
                )}
              </div>
            </div>

            {/* INTEGRATION GUIDE */}
            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm border-b border-slate-100 pb-3">
                <BookOpen className="w-4.5 h-4.5 text-indigo-500" />
                <span>Integration Guide</span>
              </div>
              
              <div className="space-y-3 text-xs leading-relaxed text-slate-500">
                <div className="space-y-1">
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    Consolidated JSON Loading
                  </p>
                  <p>
                    Rather than querying separate players, groups, fixtures, and standings resources, developers can pull the unified <code>/api/tournaments/:id/consolidated</code> endpoint in a single call. This is optimized for fast cold-starts.
                  </p>
                </div>

                <div className="space-y-1 pt-1">
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    OBS Studio Web Overlay
                  </p>
                  <p>
                    Create standard HTML files as Custom Browser sources inside OBS. Read matches and standings on set intervals to automatically populate scoreboards on stream overlays dynamically.
                  </p>
                </div>

                <div className="space-y-1 pt-1">
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    CORS Headers Allowed
                  </p>
                  <p>
                    All API routes are served with <code>Access-Control-Allow-Origin: *</code>, meaning you can safely trigger client-side AJAX calls directly from external websites and overlays.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
