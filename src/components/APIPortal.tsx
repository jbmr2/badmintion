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
  BookOpen
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
  const [tournaments, setTournaments] = useState<{ id: string }[]>([]);
  const [selectedTid, setSelectedTid] = useState<string>(currentTournamentId || '');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [loadingTest, setLoadingTest] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ path: string; data: any } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch available tournament IDs for live URL substitution
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tournaments'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id }));
      setTournaments(list);
      if (!selectedTid && list.length > 0) {
        setSelectedTid(list[0].id);
      }
    });
    return unsub;
  }, []);

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

  const getPopulatedPath = (path: string) => {
    if (path.includes(':tournamentId')) {
      return path.replace(':tournamentId', selectedTid || 'YOUR_TOURNAMENT_ID');
    }
    return path;
  };

  const handleCopy = (path: string) => {
    const fullUrl = window.location.origin + getPopulatedPath(path);
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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
            Real-time server-side JSON endpoints to power OBS stream overlays, tickers, widgets, and third-party tools.
          </p>
        </div>

        {/* TOURNAMENT CONTEXT SELECTOR */}
        <div className="bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl flex items-center gap-3">
          <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">URL Context ID:</label>
          <select 
            value={selectedTid}
            onChange={(e) => setSelectedTid(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg text-xs font-extrabold text-slate-700 px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            {tournaments.length === 0 ? (
              <option value="">No Tournaments Found</option>
            ) : (
              tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.id}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* SEARCH AND QUICK INSTRUCTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
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

          {/* API LIST */}
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

        {/* SIDEBAR: RESPONSE PLAYGROUND & GUIDE */}
        <div className="space-y-6">
          {/* PLAYGROUND RESPONSE VIEWER */}
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
                  OBS Studio Web Overlay
                </p>
                <p>
                  Use a custom browser source in OBS pointing to widgets, or fetch the dynamic <code>/api/tournaments/:id/standings</code> endpoint using standard JS inside your custom HTML widgets to auto-refresh standings instantly.
                </p>
              </div>

              <div className="space-y-1 pt-1">
                <p className="font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  JSON Live Pulling
                </p>
                <p>
                  Endpoints return clean, raw arrays/objects structured for rapid layout binding. They can be fetched with standard AJAX or server-side cron actions in other applications.
                </p>
              </div>

              <div className="space-y-1 pt-1">
                <p className="font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  No Auth Needed
                </p>
                <p>
                  All <code>/api/*</code> GET endpoints are public, allowing frictionless cross-origin requests from client devices, web widgets, and stream setups.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
