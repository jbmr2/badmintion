import { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  collection, 
  query, 
  onSnapshot, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  limit,
  orderBy
} from 'firebase/firestore';
import { 
  Activity, 
  Database, 
  Server, 
  Cpu, 
  Clock, 
  Terminal, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Users, 
  Trophy, 
  FolderGit2, 
  Layers, 
  GitCommit, 
  ShieldCheck, 
  Signal,
  Play,
  Trash2,
  FileText,
  Search,
  Check
} from 'lucide-react';

interface SystemMonitorProps {
  tournamentId?: string;
}

interface MonitorLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'database' | 'network' | 'auth' | 'system';
  message: string;
}

export default function SystemMonitor({ tournamentId }: SystemMonitorProps) {
  // Connection and Live Status
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [latency, setLatency] = useState<number | null>(null);
  const [latencyList, setLatencyList] = useState<number[]>([]);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date>(new Date());
  const [pingCount, setPingCount] = useState(0);

  // Live Collection Sizes
  const [dbStats, setDbStats] = useState({
    tournaments: 0,
    categories: 0,
    players: 0,
    groups: 0,
    roots: 0,
    level1: 0,
    level2: 0,
    assignedPlayers: 0,
    fixtures: 0,
    matches: 0,
    livePings: 0
  });

  // Selected collection for live JSON explorer
  const [selectedCollection, setSelectedCollection] = useState<string>('tournaments');
  const [explorerDocs, setExplorerDocs] = useState<any[]>([]);
  const [isDocLoading, setIsDocLoading] = useState(false);

  // Live logs
  const [logs, setLogs] = useState<MonitorLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'success' | 'warning' | 'error'>('all');
  const [logSearch, setLogSearch] = useState('');

  // Server Status & Action States
  const [serverStatus, setServerStatus] = useState<{
    status: string;
    uptime: number;
    startTime: string;
    nodeVersion: string;
    platform: string;
    memoryUsage?: { rss: number; heapTotal: number; heapUsed: number; external: number };
  } | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isStartingEngine, setIsStartingEngine] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const fetchServerStatus = async () => {
    try {
      const res = await fetch('/api/server/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch server status:', err);
    }
  };

  const handleServerRestart = async () => {
    if (!window.confirm("Are you sure you want to restart the Node.js server? Active connections will momentarily disconnect and reconnect.")) {
      return;
    }
    setIsRestarting(true);
    setServerMessage(null);
    addLog('warning', 'system', 'Triggering remote server restart sequence...');
    try {
      const res = await fetch('/api/server/restart', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setServerMessage('Server restart initiated. Reconnecting in 5 seconds...');
        addLog('success', 'system', 'Server accepted restart command. Node container reloading.');
        setTimeout(async () => {
          setIsRestarting(false);
          await fetchServerStatus();
          addLog('success', 'system', 'Successfully reconnected to active server instance.');
        }, 5000);
      } else {
        setServerMessage(data.message || 'Failed to trigger restart');
        setIsRestarting(false);
      }
    } catch (err: any) {
      setServerMessage(`Error during restart: ${err.message}`);
      setIsRestarting(false);
      addLog('error', 'system', `Server restart action failed: ${err.message}`);
    }
  };

  const handleServerStart = async () => {
    setIsStartingEngine(true);
    setServerMessage(null);
    addLog('info', 'system', 'Initializing server verification sequence...');
    try {
      const res = await fetch('/api/server/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setServerMessage(data.message);
        addLog('success', 'system', 'Server engine start sequence verified. All systems active.');
        await fetchServerStatus();
      } else {
        setServerMessage(data.error || 'Failed to start/verify server');
      }
    } catch (err: any) {
      setServerMessage(`Error during start sequence: ${err.message}`);
      addLog('error', 'system', `Server engine check failed: ${err.message}`);
    } finally {
      setIsStartingEngine(false);
    }
  };

  // Local helper to add logs
  const addLog = (
    type: MonitorLog['type'], 
    category: MonitorLog['category'], 
    message: string
  ) => {
    const newLog: MonitorLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      type,
      category,
      message
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  };

  // --- Network Monitor ---
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addLog('success', 'network', 'Device network connection recovered.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      addLog('error', 'network', 'Device network connection lost.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Firestore Latency Check ---
  const runLatencyCheck = async (quiet = false) => {
    if (!quiet) {
      addLog('info', 'database', 'Initiating live latency heartbeat query...');
    }
    const start = performance.now();
    try {
      // Small index lookup on tournaments as a test
      const q = query(collection(db, 'tournaments'), limit(1));
      await getDocs(q);
      const diff = Math.round(performance.now() - start);
      setLatency(diff);
      setLatencyList(prev => [...prev, diff].slice(-10));
      setLastCheckTime(new Date());
      setPingCount(prev => prev + 1);
      if (!quiet) {
        addLog('success', 'database', `Database query roundtrip completed in ${diff}ms`);
      }
    } catch (err: any) {
      addLog('error', 'database', `Database read failed: ${err.message || 'Unknown Network Error'}`);
    }
  };

  // Run benchmark (multiple database reads in sequence)
  const runBenchmark = async () => {
    setIsBenchmarking(true);
    addLog('info', 'system', 'Starting Firestore database benchmark. Running 5 consecutive queries...');
    const results: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const start = performance.now();
      try {
        const q = query(collection(db, 'tournaments'), limit(1));
        await getDocs(q);
        const diff = Math.round(performance.now() - start);
        results.push(diff);
        addLog('info', 'database', `Benchmark Query ${i}/5 completed: ${diff}ms`);
      } catch (err) {
        addLog('error', 'database', `Benchmark query ${i} failed`);
      }
      // Brief sleep between reads
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    setIsBenchmarking(false);
    if (results.length > 0) {
      const min = Math.min(...results);
      const max = Math.max(...results);
      const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
      addLog('success', 'system', `Benchmark complete! Min: ${min}ms | Max: ${max}ms | Average: ${avg}ms`);
    } else {
      addLog('error', 'system', 'Benchmark failed: No queries completed successfully.');
    }
  };

  // Latency Heartbeat loop
  useEffect(() => {
    runLatencyCheck(false);
    fetchServerStatus();
    const interval = setInterval(() => {
      runLatencyCheck(true);
      fetchServerStatus();
    }, 15000); // Check every 15s

    return () => clearInterval(interval);
  }, []);

  // --- Live Snapshot Stats Monitor ---
  useEffect(() => {
    addLog('info', 'system', 'Initializing live database snapshot stream listeners...');

    // 1. Tournaments list
    const unsubTournaments = onSnapshot(collection(db, 'tournaments'), (snapshot) => {
      setDbStats(prev => ({ ...prev, tournaments: snapshot.size }));
      addLog('success', 'database', `Live update: 'tournaments' count updated to ${snapshot.size}`);
    }, (err) => {
      addLog('error', 'database', `Tournaments subscription error: ${err.message}`);
    });

    // 2. Global Live Pings / dummy event logger
    const unsubPings = onSnapshot(collection(db, 'live_pings'), (snapshot) => {
      setDbStats(prev => ({ ...prev, livePings: snapshot.size }));
    }, (err) => {
      console.error(err);
    });

    let unsubCategories: (() => void) | null = null;
    let unsubPlayers: (() => void) | null = null;
    let unsubGroups: (() => void) | null = null;
    let unsubRoots: (() => void) | null = null;
    let unsubFixtures: (() => void) | null = null;
    let unsubMatches: (() => void) | null = null;

    // Subscriptions nested inside selected tournament context
    if (tournamentId) {
      addLog('info', 'system', `Subscribing to subcollections for active tournament: ${tournamentId}`);

      unsubCategories = onSnapshot(collection(db, `tournaments/${tournamentId}/categories`), (snapshot) => {
        setDbStats(prev => ({ ...prev, categories: snapshot.size }));
        addLog('success', 'database', `Live update: 'categories' updated to ${snapshot.size}`);
      });

      unsubPlayers = onSnapshot(collection(db, `tournaments/${tournamentId}/players`), (snapshot) => {
        setDbStats(prev => ({ ...prev, players: snapshot.size }));
        addLog('success', 'database', `Live update: 'players' (roster) updated to ${snapshot.size}`);
      });

      unsubGroups = onSnapshot(collection(db, `tournaments/${tournamentId}/groups`), (snapshot) => {
        setDbStats(prev => ({ ...prev, groups: snapshot.size }));
        addLog('success', 'database', `Live update: 'groups' updated to ${snapshot.size}`);
      });

      unsubRoots = onSnapshot(collection(db, `tournaments/${tournamentId}/roots`), (snapshot) => {
        setDbStats(prev => ({ ...prev, roots: snapshot.size }));
        addLog('success', 'database', `Live update: 'organizational roots' updated to ${snapshot.size}`);
      });

      unsubFixtures = onSnapshot(collection(db, `tournaments/${tournamentId}/fixtures`), (snapshot) => {
        setDbStats(prev => ({ ...prev, fixtures: snapshot.size }));
        addLog('success', 'database', `Live update: 'fixtures' updated to ${snapshot.size}`);
      });

      unsubMatches = onSnapshot(collection(db, `tournaments/${tournamentId}/matches`), (snapshot) => {
        setDbStats(prev => ({ ...prev, matches: snapshot.size }));
        addLog('success', 'database', `Live update: 'matches' (completed scores) updated to ${snapshot.size}`);
      });
    }

    return () => {
      unsubTournaments();
      unsubPings();
      if (unsubCategories) unsubCategories();
      if (unsubPlayers) unsubPlayers();
      if (unsubGroups) unsubGroups();
      if (unsubRoots) unsubRoots();
      if (unsubFixtures) unsubFixtures();
      if (unsubMatches) unsubMatches();
    };
  }, [tournamentId]);

  // Dynamic Level1, Level2, and assigned players live counts based on root organizations
  useEffect(() => {
    if (!tournamentId) return;

    let level1Unsubs: (() => void)[] = [];
    let level2Unsubs: (() => void)[] = [];
    let playerUnsubs: (() => void)[] = [];

    const rootsQuery = collection(db, `tournaments/${tournamentId}/roots`);
    const unsubRootsTree = onSnapshot(rootsQuery, (rootsSnap) => {
      // Clear old nested subs
      level1Unsubs.forEach(u => u());
      level2Unsubs.forEach(u => u());
      playerUnsubs.forEach(u => u());
      level1Unsubs = [];
      level2Unsubs = [];
      playerUnsubs = [];

      let l1CountTotal = 0;
      let l2CountTotal = 0;
      let assignedCountTotal = 0;

      const tempL1Sizes: { [rootId: string]: number } = {};
      const tempL2Sizes: { [path: string]: number } = {};
      const tempPlayerSizes: { [path: string]: number } = {};

      const updateTotals = () => {
        const l1Sum = Object.values(tempL1Sizes).reduce((a, b) => a + b, 0);
        const l2Sum = Object.values(tempL2Sizes).reduce((a, b) => a + b, 0);
        const playerSum = Object.values(tempPlayerSizes).reduce((a, b) => a + b, 0);
        setDbStats(prev => ({
          ...prev,
          level1: l1Sum,
          level2: l2Sum,
          assignedPlayers: playerSum
        }));
      };

      rootsSnap.docs.forEach(rootDoc => {
        const rootId = rootDoc.id;
        const l1Col = collection(db, `tournaments/${tournamentId}/roots/${rootId}/level1`);
        
        const u1 = onSnapshot(l1Col, (l1Snap) => {
          tempL1Sizes[rootId] = l1Snap.size;
          updateTotals();

          l1Snap.docs.forEach(l1Doc => {
            const l1Id = l1Doc.id;
            const l2Col = collection(db, `tournaments/${tournamentId}/roots/${rootId}/level1/${l1Id}/level2`);
            const l2Path = `${rootId}/${l1Id}`;

            const u2 = onSnapshot(l2Col, (l2Snap) => {
              tempL2Sizes[l2Path] = l2Snap.size;
              updateTotals();

              l2Snap.docs.forEach(l2Doc => {
                const l2Id = l2Doc.id;
                const pCol = collection(db, `tournaments/${tournamentId}/roots/${rootId}/level1/${l1Id}/level2/${l2Id}/players`);
                const pPath = `${rootId}/${l1Id}/${l2Id}`;

                const u3 = onSnapshot(pCol, (pSnap) => {
                  tempPlayerSizes[pPath] = pSnap.size;
                  updateTotals();
                });
                playerUnsubs.push(u3);
              });
            });
            level2Unsubs.push(u2);
          });
        });
        level1Unsubs.push(u1);
      });
    });

    return () => {
      unsubRootsTree();
      level1Unsubs.forEach(u => u());
      level2Unsubs.forEach(u => u());
      playerUnsubs.forEach(u => u());
    };
  }, [tournamentId]);

  // --- Live JSON Document Explorer ---
  useEffect(() => {
    setIsDocLoading(true);
    let path = '';
    if (selectedCollection === 'tournaments') {
      path = 'tournaments';
    } else if (tournamentId) {
      path = `tournaments/${tournamentId}/${selectedCollection}`;
    } else {
      setExplorerDocs([]);
      setIsDocLoading(false);
      return;
    }

    const q = query(collection(db, path), limit(6));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExplorerDocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsDocLoading(false);
    }, (err) => {
      console.error(err);
      addLog('error', 'database', `Explorer query failed: ${err.message}`);
      setExplorerDocs([]);
      setIsDocLoading(false);
    });

    return () => unsubscribe();
  }, [selectedCollection, tournamentId]);

  // --- Live Ping Trigger Action ---
  const triggerLivePing = async () => {
    addLog('info', 'database', 'Emitting temporary live event ping doc to firestore...');
    try {
      const docRef = await addDoc(collection(db, 'live_pings'), {
        timestamp: serverTimestamp(),
        clientTime: new Date().toISOString(),
        author: auth.currentUser?.email || 'Anonymous System Tester'
      });
      addLog('success', 'database', `Live ping document emitted successfully: ${docRef.id}`);

      // Delete the ping after 5 seconds to keep firestore clean!
      setTimeout(async () => {
        try {
          await deleteDoc(doc(db, 'live_pings', docRef.id));
          addLog('info', 'database', `Temporary event document auto-pruned: ${docRef.id}`);
        } catch (err) {
          console.error('Error cleaning up ping document:', err);
        }
      }, 5000);
    } catch (err: any) {
      addLog('error', 'database', `Failed to emit live event: ${err.message}`);
    }
  };

  // --- Filter and Search Logs ---
  const filteredLogs = logs.filter(log => {
    const matchesFilter = logFilter === 'all' || log.type === logFilter;
    const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase()) || 
                          log.category.toLowerCase().includes(logSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const formatUptime = (seconds: number) => {
    if (seconds === undefined || seconds === null) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const getLatencyColor = (l: number | null) => {
    if (l === null) return 'text-slate-400';
    if (l < 80) return 'text-emerald-500';
    if (l < 200) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getLatencyBg = (l: number | null) => {
    if (l === null) return 'bg-slate-500';
    if (l < 80) return 'bg-emerald-500';
    if (l < 200) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="space-y-8 font-sans max-w-5xl mx-auto pb-12">
      
      {/* 1. Header with Visual Pulse */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              System Monitor Dashboard
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Real-time visual reporting, database telemetry, live logs & performance diagnostics.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => runLatencyCheck(false)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check Heartbeat
          </button>
          <button
            onClick={triggerLivePing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            Trigger Live Ping
          </button>
        </div>
      </div>

      {/* 2. Top Stats Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Connection Status Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">WebSocket Link</span>
            <Signal className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-2xl font-extrabold text-slate-900">
              {isOnline ? 'Connected' : 'Disconnected'}
            </p>
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              Network Mode: <span className="text-slate-600 font-bold">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </p>
          </div>
        </div>

        {/* Database Latency */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Write Latency</span>
            <Database className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <p className={`text-2xl font-extrabold ${getLatencyColor(latency)} flex items-baseline gap-1`}>
              {latency !== null ? `${latency}` : '--'} 
              <span className="text-xs font-medium text-slate-400">ms</span>
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Last checked: <span className="text-slate-600 font-bold">{lastCheckTime.toLocaleTimeString()}</span>
            </p>
          </div>
        </div>

        {/* Total Heartbeats */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Heartbeat Queries</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-2xl font-extrabold text-slate-900">{pingCount}</p>
            <p className="text-[11px] text-slate-400 font-medium">
              Running interval: <span className="text-slate-600 font-bold">Every 15s</span>
            </p>
          </div>
        </div>

        {/* Security / Auth Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Security State</span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-md font-extrabold text-slate-900 truncate">
              {auth.currentUser ? auth.currentUser.email : 'Guest / Read-Only'}
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Auth Provider: <span className="text-slate-600 font-bold">{auth.currentUser ? 'Google OAuth' : 'Unauthenticated'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 2.5 Node.js Server Admin Console */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-600 animate-pulse" />
              Node.js Application Server Console
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Control system container lifecycles, run start checks, and trigger soft server process restarts.
            </p>
          </div>
          {serverStatus ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-200 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Active Online
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-black rounded-full border border-amber-200 uppercase tracking-wider">
              Polling Status...
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Metadata */}
          <div className="md:col-span-7 bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Server Node Metadata & Specs</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Uptime</p>
                <p className="font-extrabold text-slate-800 font-mono text-sm">
                  {serverStatus ? formatUptime(serverStatus.uptime) : '--'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Boot Time</p>
                <p className="font-bold text-slate-700 truncate" title={serverStatus?.startTime}>
                  {serverStatus ? new Date(serverStatus.startTime).toLocaleString() : '--'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Node.js Engine</p>
                <p className="font-bold text-slate-700 font-mono">
                  {serverStatus?.nodeVersion || 'v18.x (Hostinger Node)'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Operating Platform</p>
                <p className="font-bold text-slate-700 capitalize">
                  {serverStatus?.platform || 'Linux'}
                </p>
              </div>
              {serverStatus?.memoryUsage && (
                <div className="space-y-0.5 col-span-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Memory Consumption (RSS / Heap)</p>
                  <p className="font-mono font-bold text-slate-600">
                    {(serverStatus.memoryUsage.rss / 1024 / 1024).toFixed(1)} MB (RSS) / {(serverStatus.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB (Used Heap)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lifecycle Commands</h4>
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                Click <strong className="text-slate-600">Start Server</strong> to verify engine status and reinitialize connections. Click <strong className="text-slate-600">Restart Server</strong> to write a passenger restart anchor or exit the thread.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleServerStart}
                disabled={isStartingEngine || isRestarting}
                className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isStartingEngine 
                    ? 'bg-indigo-50 text-indigo-400 border border-indigo-100 cursor-not-allowed' 
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 active:scale-[0.98]'
                }`}
              >
                <Play className={`w-4 h-4 ${isStartingEngine ? 'animate-pulse' : ''}`} />
                {isStartingEngine ? 'Starting...' : 'Start Server'}
              </button>

              <button
                onClick={handleServerRestart}
                disabled={isRestarting || isStartingEngine}
                className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isRestarting 
                    ? 'bg-rose-50 text-rose-400 border border-rose-100 cursor-not-allowed' 
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-[0.98]'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Restarting...' : 'Restart Server'}
              </button>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {serverMessage && (
          <div className="p-4 bg-indigo-50/80 border border-indigo-100 rounded-2xl flex items-start gap-2.5">
            <CheckCircle className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-bold text-indigo-800">Server Response</p>
              <p className="text-[11px] text-indigo-600 mt-0.5 leading-relaxed">{serverMessage}</p>
            </div>
            <button 
              onClick={() => setServerMessage(null)} 
              className="text-xs font-bold text-indigo-400 hover:text-indigo-600 p-0.5 bg-white/50 rounded-full hover:bg-white"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 3. Live Database Store Counts & Relative Visual Scale */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-black text-slate-800">Live Data Store Roster</h3>
          <p className="text-xs text-slate-400">
            Real-time synchronized counts of all collections active inside tournament: <span className="font-bold text-slate-600">{tournamentId || 'None Selected'}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Server className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Tournaments</p>
              <p className="text-lg font-black text-slate-800">{dbStats.tournaments}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Trophy className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Categories</p>
              <p className="text-lg font-black text-slate-800">{dbStats.categories}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Users className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Players (Roster)</p>
              <p className="text-lg font-black text-slate-800">{dbStats.players}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><Layers className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Roots (Orgs)</p>
              <p className="text-lg font-black text-slate-800">{dbStats.roots}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><FolderGit2 className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Chapters (Group)</p>
              <p className="text-lg font-black text-slate-800">{dbStats.groups}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Layers className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Parent Teams (L1)</p>
              <p className="text-lg font-black text-slate-800">{dbStats.level1}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-pink-50 text-pink-600 rounded-lg"><Layers className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Chapters (L2)</p>
              <p className="text-lg font-black text-slate-800">{dbStats.level2}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg"><Users className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Chapter Assigned</p>
              <p className="text-lg font-black text-slate-800">{dbStats.assignedPlayers}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><GitCommit className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Fixtures</p>
              <p className="text-lg font-black text-slate-800">{dbStats.fixtures}</p>
            </div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Completed Matches</p>
              <p className="text-lg font-black text-slate-800">{dbStats.matches}</p>
            </div>
          </div>
        </div>

        {/* Relative bar visualization to give stunning visual feedback */}
        <div className="space-y-2 pt-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-700">Relative Document Density</p>
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
            <div className="bg-indigo-500 h-full" style={{ width: `${Math.max(4, (dbStats.players / (dbStats.players + dbStats.fixtures + dbStats.matches + dbStats.assignedPlayers + 1)) * 100)}%` }} title={`Players: ${dbStats.players}`} />
            <div className="bg-emerald-500 h-full" style={{ width: `${Math.max(4, (dbStats.matches / (dbStats.players + dbStats.fixtures + dbStats.matches + dbStats.assignedPlayers + 1)) * 100)}%` }} title={`Completed Matches: ${dbStats.matches}`} />
            <div className="bg-amber-500 h-full" style={{ width: `${Math.max(4, (dbStats.fixtures / (dbStats.players + dbStats.fixtures + dbStats.matches + dbStats.assignedPlayers + 1)) * 100)}%` }} title={`Fixtures: ${dbStats.fixtures}`} />
            <div className="bg-pink-500 h-full" style={{ width: `${Math.max(4, (dbStats.assignedPlayers / (dbStats.players + dbStats.fixtures + dbStats.matches + dbStats.assignedPlayers + 1)) * 100)}%` }} title={`Assigned Chapter Players: ${dbStats.assignedPlayers}`} />
          </div>
          <div className="flex flex-wrap gap-4 text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-500 rounded-full" /> Players ({dbStats.players})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full" /> Scores ({dbStats.matches})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" /> Fixtures ({dbStats.fixtures})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-pink-500 rounded-full" /> Hierarchy Chapters ({dbStats.assignedPlayers})</span>
          </div>
        </div>
      </div>

      {/* 4. Interactive Live Explorer & Performance Benchmarking */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Live Explorer */}
        <div className="md:col-span-7 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-indigo-500" />
                Live JSON Explorer
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">Select a subcollection to inspect documents in real-time</p>
            </div>
            
            <select
              value={selectedCollection}
              onChange={e => setSelectedCollection(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-slate-600"
            >
              <option value="tournaments">Tournaments</option>
              <option value="categories">Categories</option>
              <option value="players">Players (Roster)</option>
              <option value="groups">Groups</option>
              <option value="roots">Roots</option>
              <option value="fixtures">Fixtures</option>
              <option value="matches">Completed Matches</option>
            </select>
          </div>

          <div className="flex-1 bg-slate-900 rounded-2xl p-4 overflow-y-auto font-mono text-xs text-indigo-200 select-all scrollbar-thin">
            {isDocLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Querying collection...
              </div>
            ) : explorerDocs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                Empty collection or no tournament selected.
              </div>
            ) : (
              <pre className="whitespace-pre-wrap">{JSON.stringify(explorerDocs, null, 2)}</pre>
            )}
          </div>
        </div>

        {/* Benchmark / Diagnostics Controls */}
        <div className="md:col-span-5 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-[400px]">
          <div>
            <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-500" />
              Diagnostics & Benchmarks
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">Run benchmarks to measure real-time link latency variance</p>
          </div>

          <div className="space-y-4 my-auto">
            {/* Realtime latency line chart helper using plain elements */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Query Latency Profile (Last 10 Checks)</p>
              <div className="h-20 flex items-end gap-1 px-2 pt-2 border-b border-slate-200/60">
                {latencyList.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 font-medium">No readings collected yet</div>
                ) : (
                  latencyList.map((val, idx) => {
                    const pct = Math.min(100, (val / 300) * 100);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                        <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-[9px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity font-mono">{val}ms</div>
                        <div className={`w-full rounded-t-sm transition-all duration-300 ${getLatencyBg(val)}`} style={{ height: `${pct}%` }} />
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1">
                <span>Older</span>
                <span>Newest</span>
              </div>
            </div>

            <button
              onClick={runBenchmark}
              disabled={isBenchmarking}
              className={`w-full py-3 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all ${
                isBenchmarking 
                  ? 'bg-slate-100 text-slate-400 border border-slate-200' 
                  : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm shadow-slate-300'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isBenchmarking ? 'animate-spin' : ''}`} />
              {isBenchmarking ? 'Running Benchmarks...' : 'Run Query Speed Benchmark'}
            </button>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-500 font-medium">
              <span>Firebase Version</span>
              <span className="font-bold text-slate-700">10.x SDK</span>
            </div>
            <div className="flex justify-between text-slate-500 font-medium">
              <span>Project ID</span>
              <span className="font-bold text-slate-700 truncate max-w-[180px]">{firebaseConfig.projectId}</span>
            </div>
            <div className="flex justify-between text-slate-500 font-medium">
              <span>Storage Location</span>
              <span className="font-bold text-slate-700">Multi-Region (US)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Live Telemetry Activity Logs Console */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-emerald-500" />
              Live Telemetry Log
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">Real-time trace output from Firestore listeners, authorization changes, and hardware health checks</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search telemetry..."
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-44"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              {(['all', 'info', 'success', 'warning', 'error'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setLogFilter(type)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize transition-all ${
                    logFilter === type 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <button
              onClick={() => setLogs([])}
              className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition border border-slate-200"
              title="Clear Console Logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Real-time Telemetry Console Output */}
        <div className="h-[250px] bg-slate-950 rounded-2xl p-4 overflow-y-auto font-mono text-xs space-y-2 select-text scrollbar-thin">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500">
              No telemetry events recorded matching current filters.
            </div>
          ) : (
            filteredLogs.map(log => {
              let color = 'text-slate-300';
              if (log.type === 'success') color = 'text-emerald-400';
              if (log.type === 'warning') color = 'text-amber-400';
              if (log.type === 'error') color = 'text-rose-400';

              return (
                <div key={log.id} className="flex items-start gap-2.5 hover:bg-slate-900 py-0.5 px-1 rounded transition-colors">
                  <span className="text-slate-500 select-none">[{log.timestamp.toLocaleTimeString()}]</span>
                  <span className={`uppercase font-bold text-[9px] px-1.5 py-0.2 rounded shrink-0 select-none ${
                    log.type === 'success' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30' :
                    log.type === 'warning' ? 'bg-amber-950/50 text-amber-400 border border-amber-900/30' :
                    log.type === 'error' ? 'bg-rose-950/50 text-rose-400 border border-rose-900/30' :
                    'bg-slate-900 text-indigo-400 border border-slate-800'
                  }`}>{log.category}</span>
                  <span className={`flex-1 break-all ${color}`}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
