import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { Trophy, Shield, HelpCircle, Copy, Check, Eye, EyeOff, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function OBSTicker({ 
  tournamentId, 
  fixtureId,
  court
}: { 
  tournamentId: string; 
  fixtureId?: string; 
  court?: string;
}) {
  const [fixture, setFixture] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Styling presets for streamers
  // presets: 'modern-bar' (ESPN horizontal), 'compact-box' (Floating card), 'arcade-neon' (Glow effects), 'score-only' (Minimalist top-left transparent)
  const [preset, setPreset] = useState<'modern-bar' | 'compact-box' | 'arcade-neon' | 'score-only'>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paramPreset = urlParams.get('preset');
    if (paramPreset === 'modern-bar' || paramPreset === 'compact-box' || paramPreset === 'arcade-neon' || paramPreset === 'score-only') {
      return paramPreset;
    }
    return 'score-only'; // Default to score-only as requested
  });
  
  const [chromaKeyBg, setChromaKeyBg] = useState<boolean>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('chroma') === 'true';
  });
  
  const [showControls, setShowControls] = useState<boolean>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('controls') === 'true';
  });
  
  const [copied, setCopied] = useState<boolean>(false);

  // Subscription to the active fixture document
  useEffect(() => {
    if (!tournamentId) {
      setError("Missing Tournament ID.");
      setLoading(false);
      return;
    }

    if (!fixtureId && !court) {
      setError("Missing Match ID or Court Name parameters.");
      setLoading(false);
      return;
    }

    // Normalized court matching helper
    const matchesCourt = (fixtureCourt: string, targetCourt: string) => {
      if (!fixtureCourt || !targetCourt) return false;
      const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
      return norm(fixtureCourt) === norm(targetCourt);
    };

    if (court) {
      // Court Mode: Subscribe to all fixtures in this tournament and filter by court
      const colRef = collection(db, `tournaments/${tournamentId}/fixtures`);
      const unsubscribe = onSnapshot(colRef, 
        (snapshot) => {
          const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          // Filter by this court
          const courtFixtures = docs.filter((f: any) => matchesCourt(f.court, court));
          
          if (courtFixtures.length === 0) {
            setFixture(null); // No matches assigned to this court yet
            setError(null); // Not a fatal error, just idle
            setLoading(false);
            return;
          }

          // Prioritize: 
          // 1. status === 'live'
          // 2. status === 'pending'
          // 3. status === 'completed'
          const active = courtFixtures.find((f: any) => f.status === 'live') ||
                         courtFixtures.find((f: any) => f.status === 'pending') ||
                         courtFixtures.find((f: any) => f.status === 'completed');

          if (active) {
            setFixture(active);
            setError(null);
          } else {
            setFixture(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error("Firestore subscription error:", err);
          setError("Unable to stream scores in real-time. Please check your network.");
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      // Explicit Fixture Mode
      const docRef = doc(db, `tournaments/${tournamentId}/fixtures`, fixtureId);
      const unsubscribe = onSnapshot(docRef, 
        (docSnap) => {
          if (docSnap.exists()) {
            setFixture({ id: docSnap.id, ...docSnap.data() });
            setError(null);
          } else {
            setError("Match not found. Please verify the URL parameters.");
          }
          setLoading(false);
        },
        (err) => {
          console.error("Firestore subscription error:", err);
          setError("Unable to stream scores in real-time. Please check your network.");
          setLoading(false);
        }
      );

      return () => unsubscribe();
    }
  }, [tournamentId, fixtureId, court]);

  // Copy Clean OBS URL
  const copyObsUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'obs');
    url.searchParams.set('tournamentId', tournamentId);
    if (court) {
      url.searchParams.set('court', court);
      url.searchParams.delete('fixtureId');
    } else {
      url.searchParams.set('fixtureId', fixtureId || "");
      url.searchParams.delete('court');
    }
    // Maintain chosen preset and chroma state
    url.searchParams.set('preset', preset);
    if (chromaKeyBg) {
      url.searchParams.set('chroma', 'true');
    } else {
      url.searchParams.delete('chroma');
    }
    // Force controls off in the copied link for clean copy-paste
    url.searchParams.set('controls', 'false'); 
    
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Helper to check if set is completed
  const isSetFinished = (p1: number, p2: number, pointsTarget: number) => {
    const target = pointsTarget || 21;
    if (p1 >= target || p2 >= target) {
      if (Math.abs(p1 - p2) >= 2) return true;
      if (p1 === 30 || p2 === 30) return true;
    }
    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-12 h-12 rounded-full border-4 border-t-indigo-500 border-slate-800 animate-spin mb-4" />
        <p className="text-sm font-black uppercase tracking-widest text-slate-400">Loading Live OBS Overlay...</p>
      </div>
    );
  }

  // If court mode and no active fixture is assigned/found, show a professional, clean standby view
  if (court && !fixture) {
    return (
      <div 
        className={`min-h-screen font-sans flex flex-col justify-between p-6 text-white ${
          chromaKeyBg ? 'bg-[#00FF00]' : 'bg-transparent'
        }`}
      >
        {showControls && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4 z-40 relative shadow-xl">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping" />
              <span className="px-2 py-0.5 bg-indigo-950/85 text-indigo-400 border border-indigo-900/50 text-[10px] font-extrabold uppercase rounded-md tracking-wider">
                Court {court} Channel
              </span>
              <span className="text-slate-400 text-xs">Waiting for a live match to be assigned...</span>
            </div>
            
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={() => setChromaKeyBg(!chromaKeyBg)}
                className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                  chromaKeyBg 
                    ? 'bg-emerald-600 text-white border-emerald-500' 
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                Chroma Green: {chromaKeyBg ? "ON" : "OFF"}
              </button>
              
              <button
                onClick={copyObsUrl}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg transition flex items-center gap-1.5 shadow"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Court Stream URL
              </button>
            </div>
          </div>
        )}
        
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 bg-indigo-950/40 text-indigo-400 rounded-full flex items-center justify-center border border-indigo-900/50 relative">
              <Trophy className="w-10 h-10 animate-pulse" />
            </div>
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
            </span>
          </div>
          
          <div className="space-y-2 bg-slate-950/90 border border-slate-800 p-6 rounded-3xl max-w-md shadow-2xl">
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-100">{court.toUpperCase()}</h3>
            <div className="h-0.5 w-12 bg-indigo-500 mx-auto" />
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mt-2 animate-pulse">COURT STANDBY</p>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              No live or scheduled match on this court. As soon as a match is assigned to <strong className="text-indigo-400">{court}</strong> by the scorekeeper, the score overlay will auto-start!
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !fixture) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-red-950/40 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-900/50">
          <Shield className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-200">OBS Stream Error</h3>
        <p className="text-slate-400 text-sm mt-2">{error || "Could not retrieve match details."}</p>
        <p className="text-xs text-slate-500 mt-4 leading-relaxed bg-slate-900 p-3 rounded-xl border border-slate-800">
          Tip: Ensure the scorekeeper has started the match or created fixtures. 
        </p>
      </div>
    );
  }

  // Calculate scores
  const s = fixture.scores || { p1g1: 0, p2g1: 0, p1g2: 0, p2g2: 0, p1g3: 0, p2g3: 0 };
  const target = Number(fixture.pointsTarget) || (fixture.matchType === 'league' ? 15 : 21);

  // Auto detect active set index
  const g1Done = isSetFinished(s.p1g1, s.p2g1, target);
  const g2Done = isSetFinished(s.p1g2, s.p2g2, target);
  let activeSetIndex = 1;
  if (g1Done && !g2Done) activeSetIndex = 2;
  else if (g1Done && g2Done) activeSetIndex = 3;

  const currentP1Score = s[`p1g${activeSetIndex}`] || 0;
  const currentP2Score = s[`p2g${activeSetIndex}`] || 0;

  // Determine Game/Match points status
  const getOverlayBadge = () => {
    // If completed
    if (isSetFinished(currentP1Score, currentP2Score, target)) {
      return { text: `SET ${activeSetIndex} OVER`, bg: 'bg-emerald-600' };
    }

    // P1 Game point detection
    const isP1GamePoint = currentP1Score >= target - 1 && currentP1Score > currentP2Score;
    const isP2GamePoint = currentP2Score >= target - 1 && currentP2Score > currentP1Score;

    if (isP1GamePoint || isP2GamePoint) {
      // Determine if they won another set already
      let p1SetsWon = 0;
      let p2SetsWon = 0;
      for (let i = 1; i <= 3; i++) {
        if (i === activeSetIndex) continue;
        const p1S = s[`p1g${i}`] || 0;
        const p2S = s[`p2g${i}`] || 0;
        if (isSetFinished(p1S, p2S, target)) {
          if (p1S > p2S) p1SetsWon++;
          else p2SetsWon++;
        }
      }

      const playerKey = isP1GamePoint ? 'player1' : 'player2';
      const setsWonAlready = playerKey === 'player1' ? p1SetsWon : p2SetsWon;

      if (setsWonAlready === 1 || activeSetIndex === 3) {
        return { text: "MATCH POINT", bg: 'bg-rose-600 animate-pulse text-white' };
      }
      return { text: "GAME POINT", bg: 'bg-indigo-600 text-white' };
    }

    // Deuce detection
    const isDeuce = currentP1Score >= target - 1 && currentP2Score >= target - 1 && Math.abs(currentP1Score - currentP2Score) < 2;
    if (isDeuce) {
      return { text: "DEUCE PLAY", bg: 'bg-amber-600 animate-pulse text-white' };
    }

    return null;
  };

  const badgeStatus = getOverlayBadge();

  // Serving status & court indicators
  // badminton rules: even score = serve from right, odd score = serve from left
  const servingPlayerKey = fixture.scores?.servingPlayer || null;
  let p1ServeFrom = "";
  let p2ServeFrom = "";
  if (currentP1Score % 2 === 0) p1ServeFrom = "Right";
  else p1ServeFrom = "Left";

  if (currentP2Score % 2 === 0) p2ServeFrom = "Right";
  else p2ServeFrom = "Left";

  // Build sets-won counts
  let p1SetsWon = 0;
  let p2SetsWon = 0;
  const setResults: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const p1Val = s[`p1g${i}`] || 0;
    const p2Val = s[`p2g${i}`] || 0;
    const done = isSetFinished(p1Val, p2Val, target);
    if (done) {
      if (p1Val > p2Val) {
        p1SetsWon++;
      } else {
        p2SetsWon++;
      }
      setResults.push(`${p1Val}-${p2Val}`);
    }
  }

  // Active status text
  const isMatchFinished = p1SetsWon >= 2 || p2SetsWon >= 2 || fixture.status === 'completed';

  return (
    <div 
      className={`min-h-screen font-sans flex flex-col justify-start relative transition-colors duration-500 overflow-hidden ${
        chromaKeyBg 
          ? 'bg-[#00FF00]' 
          : 'bg-transparent'
      }`}
      style={{
        backgroundImage: (chromaKeyBg || !showControls) ? 'none' : 'radial-gradient(circle at top right, rgba(15, 23, 42, 0.4), transparent)'
      }}
    >
      {/* Background checkerboard or grid helper visually inside editor, but transparent in real OBS */}
      {!chromaKeyBg && showControls && (
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />
      )}

      {/* Control Panel: Float configuration bar for streamer */}
      {showControls && (
        <div className="p-4 bg-slate-900 border-b border-slate-800 text-white flex flex-wrap items-center justify-between gap-4 z-40 relative shadow-xl">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
            <span className="px-2 py-0.5 bg-red-950/80 text-red-400 border border-red-900/50 text-[10px] font-extrabold uppercase rounded-md tracking-wider">
              Broadcaster Overlay Live
            </span>
            <span className="text-slate-400 text-xs hidden sm:inline">| Setup helper tool for OBS Studio / vMix</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Style Selector */}
            <div className="flex flex-wrap items-center bg-slate-800 rounded-lg p-1 border border-slate-700 gap-1">
              <button 
                onClick={() => setPreset('score-only')}
                className={`px-2.5 py-1 rounded font-black transition-all ${preset === 'score-only' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
              >
                Top-Left Mini
              </button>
              <button 
                onClick={() => setPreset('modern-bar')}
                className={`px-2.5 py-1 rounded font-black transition-all ${preset === 'modern-bar' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
              >
                Modern Bar
              </button>
              <button 
                onClick={() => setPreset('compact-box')}
                className={`px-2.5 py-1 rounded font-black transition-all ${preset === 'compact-box' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
              >
                Score Box
              </button>
              <button 
                onClick={() => setPreset('arcade-neon')}
                className={`px-2.5 py-1 rounded font-black transition-all ${preset === 'arcade-neon' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
              >
                Arcade Glow
              </button>
            </div>

            {/* Green Screen Chroma Keyer */}
            <button
              onClick={() => setChromaKeyBg(!chromaKeyBg)}
              className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                chromaKeyBg 
                  ? 'bg-emerald-600 text-white border-emerald-500' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Chroma Green: {chromaKeyBg ? "ON" : "OFF"}
            </button>

            {/* Copy Clean Link */}
            <button
              onClick={copyObsUrl}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg transition flex items-center gap-1.5 shadow"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy URL"}
            </button>

            {/* Hide Controls Button */}
            <button
              onClick={() => setShowControls(false)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg font-bold flex items-center gap-1"
              title="Hide controls. Refresh page to bring back configuration UI."
            >
              <EyeOff className="w-3.5 h-3.5" /> Hide Setup UI
            </button>
          </div>
        </div>
      )}

      {/* Setup advisory prompt */}
      {showControls && (
        <div className="max-w-2xl mx-auto mt-4 px-4">
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl text-xs text-slate-300 flex items-start gap-2.5 shadow-lg backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-slate-200">How to use in OBS Studio:</p>
              <ol className="list-decimal pl-4 mt-1 space-y-1 text-slate-400 font-semibold font-mono">
                <li>Click <strong className="text-white">"Copy URL"</strong> to copy the clean transparent link.</li>
                <li>Add a new <strong className="text-white">Browser Source</strong> to your scene in OBS.</li>
                <li>Paste this URL, set width to <strong className="text-white">1920</strong> and height to <strong className="text-white">1080</strong> (or fit to widget).</li>
                <li>Interact with referee controls on your other phone/tab. Scores animate live!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Active Streamer Overlay Canvas area */}
      <div className={`flex-1 flex flex-col ${preset === 'score-only' ? 'justify-start items-start p-4 sm:p-6' : 'justify-center items-center p-4 sm:p-10'}`}>

        {/* 0. COMPACT MINIMALIST TOP-LEFT SCORE ONLY PRESET */}
        {preset === 'score-only' && (
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-1.5 select-none text-left items-start justify-start"
          >
            {/* Top row: Court status or Deuce/Match Point Alert if any */}
            {(fixture.court || badgeStatus) && (
              <div className="flex items-center gap-1.5 pl-1">
                {fixture.court && (
                  <span className="text-[10px] font-black uppercase text-amber-400 bg-slate-950/80 border border-slate-800/80 px-2 py-0.5 rounded-md tracking-wider">
                    📍 {fixture.court}
                  </span>
                )}
                {badgeStatus ? (
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider text-white animate-pulse ${badgeStatus.bg}`}>
                    {badgeStatus.text}
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-950/80 border border-slate-800/80 px-2 py-0.5 rounded-md tracking-wider">
                    Set {activeSetIndex}
                  </span>
                )}
              </div>
            )}

            {/* Scorecard Box */}
            <div className="bg-slate-950/90 backdrop-blur-md border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl flex items-center h-11 divide-x divide-slate-850">
              {/* Event / Group Name side tab */}
              <div className="px-3.5 h-full flex items-center justify-center bg-indigo-950/40 text-[10px] font-black tracking-widest text-indigo-400 uppercase max-w-[120px] truncate">
                {fixture.groupName || "LIVE"}
              </div>

              {/* Player 1 Container */}
              <div className="flex items-center justify-between px-4 gap-4 min-w-[150px] max-w-[200px]">
                <div className="flex items-center gap-2 min-w-0">
                  {servingPlayerKey === 'player1' && (
                    <span className="w-2 h-2 bg-yellow-400 rounded-full ring-2 ring-yellow-400/30 animate-pulse shrink-0" />
                  )}
                  <span className="font-extrabold text-sm text-slate-100 truncate">
                    {fixture.player1Name}
                  </span>
                </div>
                {/* Sets won & Score */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex gap-1">
                    {[1, 2].map((num) => (
                      <span 
                        key={num} 
                        className={`w-1.5 h-1.5 rounded-full ${
                          p1SetsWon >= num ? 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'bg-slate-800'
                        }`} 
                      />
                    ))}
                  </div>
                  <span className="font-mono font-black text-base text-emerald-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg min-w-[28px] text-center">
                    {currentP1Score}
                  </span>
                </div>
              </div>

              {/* VS Divider or Set Results indicator */}
              <div className="px-2.5 h-full flex items-center justify-center text-[10px] font-black text-slate-500 bg-slate-900/30">
                VS
              </div>

              {/* Player 2 Container */}
              <div className="flex items-center justify-between px-4 gap-4 min-w-[150px] max-w-[200px]">
                {/* Sets won & Score */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-black text-base text-emerald-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg min-w-[28px] text-center">
                    {currentP2Score}
                  </span>
                  <div className="flex gap-1">
                    {[1, 2].map((num) => (
                      <span 
                        key={num} 
                        className={`w-1.5 h-1.5 rounded-full ${
                          p2SetsWon >= num ? 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'bg-slate-800'
                        }`} 
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 min-w-0 text-right justify-end">
                  <span className="font-extrabold text-sm text-slate-100 truncate">
                    {fixture.player2Name}
                  </span>
                  {servingPlayerKey === 'player2' && (
                    <span className="w-2 h-2 bg-yellow-400 rounded-full ring-2 ring-yellow-400/30 animate-pulse shrink-0" />
                  )}
                </div>
              </div>
            </div>

            {/* Micro set-results tooltip below */}
            {setResults.length > 0 && (
              <div className="text-[9px] font-black text-slate-500 pl-1 flex items-center gap-1.5 font-mono">
                <span>PREV SETS:</span>
                <span className="text-indigo-400 bg-indigo-950/20 px-1.5 py-0.5 rounded border border-indigo-950/40">{setResults.join(' , ')}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* 1. MODERN FLAT HORIZONTAL BAR PRESET */}
        {preset === 'modern-bar' && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-4xl bg-slate-950/95 border border-slate-800 text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row items-stretch justify-between relative"
          >
            {/* Left side: Tournament tag and event category info */}
            <div className="px-5 py-4 bg-slate-900 border-r border-slate-800/80 flex flex-col justify-center min-w-[160px] max-w-[200px] shrink-0 text-left">
              <span className="text-[10px] font-black text-indigo-400 tracking-wider uppercase block truncate">
                {fixture.groupName || "Main Tournament"}
              </span>
              <span className="text-[10px] font-bold text-slate-500 tracking-wider block mt-0.5 truncate uppercase">
                {fixture.matchType || "Badminton League"}
              </span>
              {fixture.court && (
                <span className="text-[9px] font-black text-amber-400 tracking-widest block mt-1 uppercase truncate">
                  📍 {fixture.court}
                </span>
              )}
            </div>

            {/* Middle part: Player 1 side */}
            <div className="flex-1 flex items-center justify-between px-6 py-4 border-r border-slate-800/60 relative">
              <div className="flex items-center gap-3 truncate">
                {servingPlayerKey === 'player1' && (
                  <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full ring-4 ring-yellow-400/20 animate-pulse shrink-0" title="Serving" />
                )}
                <div className="text-left truncate">
                  <h3 className="font-extrabold text-base tracking-tight truncate max-w-[220px]" title={fixture.player1Name}>
                    {fixture.player1Name}
                  </h3>
                  {servingPlayerKey === 'player1' && (
                    <span className="text-[9px] font-black font-mono text-amber-500 uppercase">
                      Serve {p1ServeFrom}
                    </span>
                  )}
                </div>
              </div>

              {/* Set outcomes indicator and current points */}
              <div className="flex items-center gap-4 ml-2">
                {/* Sets won indicators */}
                <div className="flex gap-1.5">
                  {[1, 2].map((num) => (
                    <span 
                      key={num} 
                      className={`w-2.5 h-2.5 rounded-full ${
                        p1SetsWon >= num ? 'bg-indigo-500' : 'bg-slate-800'
                      }`} 
                    />
                  ))}
                </div>

                {/* Main live set score display */}
                <span className="font-mono font-black text-3xl text-emerald-400 bg-slate-900/90 py-1.5 px-3 rounded-lg border border-slate-800 min-w-[50px] text-center">
                  {currentP1Score}
                </span>
              </div>
            </div>

            {/* Divider text (VS or Set banner status) */}
            <div className="flex items-center justify-center px-4 bg-slate-900 border-r border-slate-800 text-center shrink-0 min-w-[110px] relative">
              <AnimatePresence mode="wait">
                {badgeStatus ? (
                  <motion.span 
                    key={badgeStatus.text}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className={`px-2 py-1 text-[9px] font-black uppercase rounded-md tracking-wider ${badgeStatus.bg}`}
                  >
                    {badgeStatus.text}
                  </motion.span>
                ) : (
                  <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                    Set {activeSetIndex}
                  </span>
                )}
              </AnimatePresence>
            </div>

            {/* Right part: Player 2 side */}
            <div className="flex-1 flex items-center justify-between px-6 py-4 relative">
              {/* Main live set score display */}
              <div className="flex items-center gap-4 mr-2">
                <span className="font-mono font-black text-3xl text-emerald-400 bg-slate-900/90 py-1.5 px-3 rounded-lg border border-slate-800 min-w-[50px] text-center">
                  {currentP2Score}
                </span>

                {/* Sets won indicators */}
                <div className="flex gap-1.5">
                  {[1, 2].map((num) => (
                    <span 
                      key={num} 
                      className={`w-2.5 h-2.5 rounded-full ${
                        p2SetsWon >= num ? 'bg-indigo-500' : 'bg-slate-800'
                      }`} 
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 truncate text-right">
                <div className="text-right truncate">
                  <h3 className="font-extrabold text-base tracking-tight truncate max-w-[220px]" title={fixture.player2Name}>
                    {fixture.player2Name}
                  </h3>
                  {servingPlayerKey === 'player2' && (
                    <span className="text-[9px] font-black font-mono text-amber-500 uppercase">
                      Serve {p2ServeFrom}
                    </span>
                  )}
                </div>
                {servingPlayerKey === 'player2' && (
                  <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full ring-4 ring-yellow-400/20 animate-pulse shrink-0" title="Serving" />
                )}
              </div>
            </div>

            {/* Set by set live score overview box */}
            {setResults.length > 0 && (
              <div className="absolute right-3 -bottom-8 bg-slate-950/90 border border-slate-800 rounded-b-xl px-3 py-1 text-[10px] text-slate-400 font-extrabold tracking-wide flex items-center gap-1.5">
                <span>Set Results:</span>
                <span className="font-mono text-indigo-400">{setResults.join(' , ')}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* 2. COMPACT FLOATING SCOREBOARD BOX PRESET */}
        {preset === 'compact-box' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-slate-950/95 border border-slate-800 text-white rounded-3xl p-5 shadow-2xl relative"
          >
            {/* Header Event and category title */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">
                  {fixture.groupName || "Main Event"} {fixture.court ? `• ${fixture.court}` : ''}
                </p>
                <p className="text-[9px] text-slate-500 font-extrabold uppercase">Set {activeSetIndex} Live Score</p>
              </div>

              {badgeStatus && (
                <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${badgeStatus.bg}`}>
                  {badgeStatus.text}
                </span>
              )}
            </div>

            {/* Score Grid rows */}
            <div className="space-y-3.5">
              {/* Player 1 Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 max-w-[180px] truncate">
                  {servingPlayerKey === 'player1' ? (
                    <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full ring-4 ring-yellow-400/20 animate-pulse shrink-0" />
                  ) : (
                    <span className="w-2.5 h-2.5 bg-transparent shrink-0" />
                  )}
                  <div className="text-left truncate">
                    <p className="font-extrabold text-sm truncate">{fixture.player1Name}</p>
                    {servingPlayerKey === 'player1' && (
                      <p className="text-[8px] font-black font-mono text-amber-500">Serve: {p1ServeFrom}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 mr-2">
                    {[1, 2].map(num => (
                      <span key={num} className={`w-1.5 h-1.5 rounded-full ${p1SetsWon >= num ? 'bg-indigo-500' : 'bg-slate-800'}`} />
                    ))}
                  </div>
                  <span className="font-mono text-2xl font-black text-emerald-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl w-14 text-center">
                    {currentP1Score}
                  </span>
                </div>
              </div>

              {/* Player 2 Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 max-w-[180px] truncate">
                  {servingPlayerKey === 'player2' ? (
                    <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full ring-4 ring-yellow-400/20 animate-pulse shrink-0" />
                  ) : (
                    <span className="w-2.5 h-2.5 bg-transparent shrink-0" />
                  )}
                  <div className="text-left truncate">
                    <p className="font-extrabold text-sm truncate">{fixture.player2Name}</p>
                    {servingPlayerKey === 'player2' && (
                      <p className="text-[8px] font-black font-mono text-amber-500">Serve: {p2ServeFrom}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 mr-2">
                    {[1, 2].map(num => (
                      <span key={num} className={`w-1.5 h-1.5 rounded-full ${p2SetsWon >= num ? 'bg-indigo-500' : 'bg-slate-800'}`} />
                    ))}
                  </div>
                  <span className="font-mono text-2xl font-black text-emerald-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl w-14 text-center">
                    {currentP2Score}
                  </span>
                </div>
              </div>
            </div>

            {setResults.length > 0 && (
              <div className="mt-4 pt-2.5 border-t border-slate-800/60 flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <span>Completed Sets:</span>
                <span className="font-mono text-slate-400">{setResults.join(' | ')}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* 3. ARCADE NEON BRUTALIST PRESET */}
        {preset === 'arcade-neon' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-3xl bg-slate-950/95 border-2 border-indigo-500 text-white rounded-3xl p-6 shadow-2xl shadow-indigo-500/20 relative"
          >
            {/* Hologram overlay styling */}
            <div className="absolute inset-x-0 top-0 h-1 bg-indigo-500 animate-pulse" />

            {/* Glowing scoreboard title bar */}
            <div className="flex justify-between items-center text-xs mb-6 bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-900/50">
              <span className="font-black tracking-widest text-indigo-400 flex items-center gap-1.5 uppercase">
                ⚡ LIVE {fixture.court ? `${fixture.court.toUpperCase()} ` : ''}SCORECARD
              </span>
              <span className="font-mono text-slate-400 uppercase tracking-wider">
                Court Feed • Target {target} pts
              </span>
            </div>

            {/* Players side-by-side with points giant font */}
            <div className="grid grid-cols-2 gap-6 items-stretch relative">
              {/* Player 1 Col */}
              <div className="flex flex-col justify-between items-center bg-slate-900/60 p-4 rounded-2xl border border-slate-800 text-center relative overflow-hidden">
                {servingPlayerKey === 'player1' && (
                  <span className="absolute top-3 left-3 px-1.5 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 text-[9px] font-black rounded-md tracking-widest animate-pulse">
                    SERVING
                  </span>
                )}

                <div className="space-y-1 py-4">
                  <h3 className="font-black text-lg tracking-tight text-slate-100 max-w-[200px] truncate">
                    {fixture.player1Name}
                  </h3>
                  {servingPlayerKey === 'player1' && (
                    <p className="text-[9px] font-black text-slate-400 uppercase font-mono tracking-wider">
                      Right court ({p1ServeFrom})
                    </p>
                  )}
                </div>

                <div className="font-mono text-7xl font-black text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] my-3 tracking-normal select-none">
                  {currentP1Score}
                </div>

                <div className="flex gap-1 pb-1">
                  {[1, 2].map(num => (
                    <span key={num} className={`w-3.5 h-1.5 rounded ${p1SetsWon >= num ? 'bg-indigo-400' : 'bg-slate-800'}`} />
                  ))}
                </div>
              </div>

              {/* Player 2 Col */}
              <div className="flex flex-col justify-between items-center bg-slate-900/60 p-4 rounded-2xl border border-slate-800 text-center relative overflow-hidden">
                {servingPlayerKey === 'player2' && (
                  <span className="absolute top-3 right-3 px-1.5 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 text-[9px] font-black rounded-md tracking-widest animate-pulse">
                    SERVING
                  </span>
                )}

                <div className="space-y-1 py-4">
                  <h3 className="font-black text-lg tracking-tight text-slate-100 max-w-[200px] truncate">
                    {fixture.player2Name}
                  </h3>
                  {servingPlayerKey === 'player2' && (
                    <p className="text-[9px] font-black text-slate-400 uppercase font-mono tracking-wider">
                      Left court ({p2ServeFrom})
                    </p>
                  )}
                </div>

                <div className="font-mono text-7xl font-black text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] my-3 tracking-normal select-none">
                  {currentP2Score}
                </div>

                <div className="flex gap-1 pb-1">
                  {[1, 2].map(num => (
                    <span key={num} className={`w-3.5 h-1.5 rounded ${p2SetsWon >= num ? 'bg-indigo-400' : 'bg-slate-800'}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* Neon banner deuce/gamepoint alerts */}
            {badgeStatus && (
              <div className="mt-4 bg-indigo-950 border border-indigo-500 rounded-xl p-3 text-center">
                <span className="text-xs font-black text-indigo-400 tracking-widest uppercase animate-pulse">
                  🌟 {badgeStatus.text} IN PROGRESS 🌟
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* Bring back setup UI floating button if user completely hid controls */}
        {!showControls && (
          <button
            onClick={() => setShowControls(true)}
            className="fixed bottom-4 right-4 bg-slate-900/90 text-white px-4 py-2 rounded-full text-xs font-black border border-slate-800 hover:bg-slate-800 transition flex items-center gap-1.5 shadow-2xl backdrop-blur-md opacity-50 hover:opacity-100 z-50"
          >
            <Eye className="w-4 h-4" /> Show Setup Overlay Controls
          </button>
        )}
      </div>
    </div>
  );
}
