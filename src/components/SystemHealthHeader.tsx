import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { 
  Wifi, 
  WifiOff, 
  Database, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  UserX, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  Activity,
  Lock,
  Unlock,
  Key
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export default function SystemHealthHeader() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<'testing' | 'ok' | 'error'>('testing');
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Browser Permissions state
  const [geoPermission, setGeoPermission] = useState<string>('checking...');
  const [cameraPermission, setCameraPermission] = useState<string>('checking...');
  const [micPermission, setMicPermission] = useState<string>('checking...');

  const addLog = (type: LogEntry['type'], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp: time, type, message }, ...prev].slice(0, 50));
  };

  // Run a real connection check to Firestore database
  const runDbCheck = async () => {
    setDbStatus('testing');
    const start = performance.now();
    try {
      addLog('info', 'Starting database read health test...');
      const q = query(collection(db, 'tournaments'), limit(1));
      await getDocs(q);
      const duration = Math.round(performance.now() - start);
      setDbLatency(duration);
      setDbStatus('ok');
      setLastChecked(new Date().toLocaleTimeString());
      addLog('success', `Database connection healthy. Latency: ${duration}ms`);
    } catch (err: any) {
      console.error('DB Health Check Failed:', err);
      setDbStatus('error');
      setDbLatency(null);
      setLastChecked(new Date().toLocaleTimeString());
      addLog('error', `Database read failed: ${err.message || 'Unknown network error'}`);
    }
  };

  useEffect(() => {
    // 1. Monitor online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      addLog('success', 'Browser is back online');
      runDbCheck();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setDbStatus('error');
      addLog('warning', 'Browser went offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. Monitor Auth state
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        addLog('success', `User signed in as: ${user.email}`);
      } else {
        addLog('info', 'User signed out / Guest mode');
      }
    });

    // 3. Monitor browser permissions
    const checkPermissions = async () => {
      if (navigator.permissions) {
        try {
          const geo = await navigator.permissions.query({ name: 'geolocation' as any });
          setGeoPermission(geo.state);
          geo.onchange = () => setGeoPermission(geo.state);

          const cam = await navigator.permissions.query({ name: 'camera' as any });
          setCameraPermission(cam.state);
          cam.onchange = () => setCameraPermission(cam.state);

          const mic = await navigator.permissions.query({ name: 'microphone' as any });
          setMicPermission(mic.state);
          mic.onchange = () => setMicPermission(mic.state);
        } catch (e) {
          // Some browsers or environments don't support querying camera/microphone via permissions API
          setGeoPermission('granted/prompt');
          setCameraPermission('supported');
          setMicPermission('supported');
        }
      } else {
        setGeoPermission('unsupported');
        setCameraPermission('unsupported');
        setMicPermission('unsupported');
      }
    };

    // Initial checks
    runDbCheck();
    checkPermissions();

    // Periodic DB check every 30 seconds
    const interval = setInterval(runDbCheck, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeAuth();
      clearInterval(interval);
    };
  }, []);

  // Determine permissions based on auth rules
  const canRead = true; // /roots is public read
  const canWrite = !!currentUser; // isSignedIn() in rules

  return (
    <div className="w-full bg-slate-900 text-slate-100 text-xs border-b border-slate-800 shadow-lg sticky top-0 z-50 transition-all">
      {/* Horizontal Status Bar */}
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200 tracking-wider">
            <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>SYSTEM MONITOR</span>
          </div>
          
          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Network Status */}
          <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700/50">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Internet OK</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                <span className="text-rose-400 font-medium">Internet OFF</span>
              </>
            )}
          </div>

          {/* DB connection health */}
          <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700/50">
            <Database className={`w-3.5 h-3.5 ${dbStatus === 'ok' ? 'text-emerald-400' : dbStatus === 'testing' ? 'text-indigo-400 animate-spin' : 'text-rose-400'}`} />
            <span className="font-medium text-slate-300">
              Database: {dbStatus === 'ok' ? (
                <span className="text-emerald-400 font-semibold">OK {dbLatency !== null ? `(${dbLatency}ms)` : ''}</span>
              ) : dbStatus === 'testing' ? (
                <span className="text-indigo-400">Testing...</span>
              ) : (
                <span className="text-rose-400 font-semibold">OFF</span>
              )}
            </span>
          </div>

          {/* Auth Health Badge */}
          <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700/50">
            {currentUser ? (
              <>
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium hidden sm:inline">{currentUser.email}</span>
                <span className="text-emerald-400 font-medium sm:hidden">Auth OK</span>
              </>
            ) : (
              <>
                <UserX className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400 font-medium">Guest Mode</span>
              </>
            )}
          </div>

          {/* Permission health */}
          <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700/50">
            {canWrite ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Write Allowed</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400 font-medium">Read-Only</span>
              </>
            )}
          </div>
        </div>

        {/* Drawer Trigger & Diagnostic Probes */}
        <div className="flex items-center gap-2">
          <button 
            onClick={runDbCheck} 
            title="Force run database connection & latency probe"
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${dbStatus === 'testing' ? 'animate-spin text-indigo-400' : ''}`} />
            <span className="hidden md:inline text-[11px]">Probe</span>
          </button>
          
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 font-semibold transition"
          >
            <span>Diagnostics</span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Diagnostics Drawer (Expanded Slate Panel) */}
      {isOpen && (
        <div className="border-t border-slate-800 bg-slate-950 p-4 transition-all">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Column 1: Config & Connection Specs */}
            <div className="space-y-3 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
              <h4 className="font-bold text-slate-200 flex items-center gap-1 text-sm border-b border-slate-800 pb-1.5">
                <Database className="w-4 h-4 text-indigo-400" />
                Database Configuration
              </h4>
              <div className="space-y-1.5 font-mono text-[11px] text-slate-400">
                <div className="flex justify-between"><span className="text-slate-500">Database ID:</span> <span className="text-slate-300 select-all">{firebaseConfig.firestoreDatabaseId || '(default)'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Project ID:</span> <span className="text-slate-300 select-all">{firebaseConfig.projectId}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Service:</span> <span className="text-emerald-400 font-semibold">Google Cloud Firestore</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Ping Probe:</span> <span className={dbStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>{dbLatency !== null ? `${dbLatency}ms` : 'Failed'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Last Checked:</span> <span className="text-slate-300">{lastChecked || 'Never'}</span></div>
              </div>
            </div>

            {/* Column 2: Authentication & Security Rules */}
            <div className="space-y-3 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
              <h4 className="font-bold text-slate-200 flex items-center gap-1 text-sm border-b border-slate-800 pb-1.5">
                <Shield className="w-4 h-4 text-indigo-400" />
                Permissions & Security Rules
              </h4>
              <div className="space-y-1.5 text-slate-400 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-slate-400">
                    <Lock className="w-3 h-3 text-slate-500" /> Read Permission:
                  </span>
                  <span className="text-emerald-400 font-semibold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/30">Granted (Public)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-slate-400">
                    <Key className="w-3 h-3 text-slate-500" /> Write Permission:
                  </span>
                  {canWrite ? (
                    <span className="text-emerald-400 font-semibold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/30">Granted (Auth)</span>
                  ) : (
                    <span className="text-amber-400 font-semibold bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/30">Read-Only (Sign in required)</span>
                  )}
                </div>
                
                <div className="h-px bg-slate-800 my-2" />
                
                <h5 className="font-semibold text-slate-300 mb-1">Browser Features Status:</h5>
                <div className="grid grid-cols-3 gap-1 text-center font-mono text-[10px]">
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-500">Geo</div>
                    <div className={`font-semibold ${geoPermission === 'granted' ? 'text-emerald-400' : geoPermission === 'denied' ? 'text-rose-400' : 'text-amber-400'}`}>{geoPermission}</div>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-500">Camera</div>
                    <div className={`font-semibold ${cameraPermission === 'granted' ? 'text-emerald-400' : cameraPermission === 'denied' ? 'text-rose-400' : 'text-amber-400'}`}>{cameraPermission}</div>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                    <div className="text-slate-500">Mic</div>
                    <div className={`font-semibold ${micPermission === 'granted' ? 'text-emerald-400' : micPermission === 'denied' ? 'text-rose-400' : 'text-amber-400'}`}>{micPermission}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Diagnostic Logs Timeline */}
            <div className="space-y-3 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
              <h4 className="font-bold text-slate-200 flex items-center gap-1 text-sm border-b border-slate-800 pb-1.5">
                <FileText className="w-4 h-4 text-indigo-400" />
                Live Connection Log
              </h4>
              <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[10px] scrollbar-thin scrollbar-thumb-slate-800 pr-1">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic">No diagnostic events logged yet.</div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="flex gap-2 leading-relaxed">
                      <span className="text-slate-500 flex-shrink-0">{log.timestamp}</span>
                      <span className={`flex-1 ${
                        log.type === 'success' ? 'text-emerald-400' :
                        log.type === 'warning' ? 'text-amber-400 font-semibold' :
                        log.type === 'error' ? 'text-rose-400 font-semibold' :
                        'text-slate-300'
                      }`}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
