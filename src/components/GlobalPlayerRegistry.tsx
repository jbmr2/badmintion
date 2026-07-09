import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { 
  Users, 
  UserPlus, 
  UploadCloud, 
  FileSpreadsheet, 
  Phone, 
  Trash2, 
  Edit3, 
  Search, 
  Check, 
  AlertTriangle, 
  X, 
  RefreshCw,
  User,
  Plus
} from 'lucide-react';

export default function GlobalPlayerRegistry({ userRole }: { userRole?: 'admin' | 'scorer' | 'user' }) {
  const [masterPlayers, setMasterPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tab control: 'list' | 'add' | 'upload'
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'upload'>('list');

  // Manual Profile State
  const [manualForm, setManualForm] = useState({ name: '', age: '', mobile: '', gender: 'Male', l2: '', email: '' });
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Bulk Import State
  const [bulkText, setBulkText] = useState('');
  const [parsedPlayers, setParsedPlayers] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load global player profiles in real-time
  useEffect(() => {
    const q = query(collection(db, 'players'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const list = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setMasterPlayers(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'players');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Filter master players list based on search term
  const filteredPlayers = masterPlayers.filter(p => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      (p.name || '').toLowerCase().includes(term) ||
      (p.mobile || '').toLowerCase().includes(term) ||
      (p.l2 || '').toLowerCase().includes(term) ||
      (p.age !== undefined && String(p.age).includes(term))
    );
  });

  // Handle manual player creation / update
  const handleSaveManualPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.name.trim()) {
      alert("Please provide a Player Name.");
      return;
    }
    const cleanMobile = manualForm.mobile.trim().replace(/[^0-9+]/g, '');
    if (!cleanMobile) {
      alert("Please provide a valid Mobile number.");
      return;
    }

    setIsSubmittingManual(true);
    try {
      // Keyed by mobile number globally
      const playerRef = doc(db, 'players', cleanMobile);

      // If we are renaming/modifying phone, and editingPlayerId was different, clean up old record
      if (editingPlayerId && editingPlayerId !== cleanMobile) {
        await deleteDoc(doc(db, 'players', editingPlayerId));
      }

      await setDoc(playerRef, {
        name: manualForm.name.trim(),
        age: manualForm.age.trim() ? Number(manualForm.age.trim()) : '',
        mobile: cleanMobile,
        email: manualForm.email.trim(),
        gender: manualForm.gender || 'Male',
        l2: manualForm.l2.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setManualForm({ name: '', age: '', mobile: '', gender: 'Male', l2: '', email: '' });
      setEditingPlayerId(null);
      setActiveTab('list');
    } catch (err) {
      console.error("Error saving player:", err);
      alert("Failed to save player profile.");
      handleFirestoreError(err, OperationType.WRITE, `players/${cleanMobile}`);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Set up form for editing
  const startEditing = (p: any) => {
    setEditingPlayerId(p.id);
    setManualForm({
      name: p.name || '',
      age: p.age !== undefined && p.age !== null ? String(p.age) : '',
      mobile: p.mobile || '',
      gender: p.gender || 'Male',
      l2: p.l2 || '',
      email: p.email || ''
    });
    setActiveTab('add');
  };

  // Delete a master player profile
  const handleDeletePlayer = async (mobile: string) => {
    if (!confirm("Are you sure you want to delete this player profile from the global registry? This won't automatically delete them from existing tournaments, but they won't be available for new searches.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'players', mobile));
    } catch (err) {
      console.error("Error deleting global profile:", err);
      alert("Failed to delete player profile.");
      handleFirestoreError(err, OperationType.DELETE, `players/${mobile}`);
    }
  };

  // File drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setBulkText(text);
      }
    };
    reader.readAsText(file);
  };

  // Parsing CSV / Excel text
  const parseBulkData = () => {
    if (!bulkText.trim()) {
      alert("Please paste some Excel data or upload a file first.");
      return;
    }

    const lines = bulkText.split(/\r?\n/);
    const result: any[] = [];
    let isFirstLineHeader = false;

    // Check if first line contains header keywords
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (
        firstLine.includes('name') || 
        firstLine.includes('age') || 
        firstLine.includes('phone') || 
        firstLine.includes('mobile') || 
        firstLine.includes('number') || 
        firstLine.includes('tel') ||
        firstLine.includes('email')
      ) {
        isFirstLineHeader = true;
      }
    }

    const seenMobilesInPasted = new Set<string>();
    const startIndex = isFirstLineHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let cols = line.split('\t');
      if (cols.length <= 1) {
        cols = line.split(',');
      }
      if (cols.length <= 1) {
        cols = line.split(';');
      }

      const cleanCols = cols.map(c => {
        let val = c.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1).trim();
        }
        return val;
      });

      if (cleanCols.length === 0 || cleanCols.every(c => !c)) continue;

      let name = "";
      let age = "";
      let mobile = "";
      let email = "";
      let l2 = "";

      if (isFirstLineHeader) {
        const headers = lines[0].toLowerCase().split(/\t|,|;/).map(h => h.trim().replace(/"/g, ''));
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('player'));
        const ageIdx = headers.findIndex(h => h.includes('age'));
        const mobileIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('tel'));
        const emailIdx = headers.findIndex(h => h.includes('email'));
        const l2Idx = headers.findIndex(h => h.includes('chapter') || h.includes('category') || h.includes('l2') || h.includes('class'));

        name = nameIdx !== -1 ? cleanCols[nameIdx] || "" : cleanCols[0] || "";
        age = ageIdx !== -1 ? cleanCols[ageIdx] || "" : cleanCols[1] || "";
        mobile = mobileIdx !== -1 ? cleanCols[mobileIdx] || "" : cleanCols[2] || "";
        email = emailIdx !== -1 ? cleanCols[emailIdx] || "" : (cleanCols[4] || "");
        l2 = l2Idx !== -1 ? cleanCols[l2Idx] || "" : (cleanCols[3] || "");
      } else {
        name = cleanCols[0] || "";
        age = cleanCols[1] || "";
        mobile = cleanCols[2] || "";
        l2 = cleanCols[3] || "";
        email = cleanCols[4] || "";
      }

      const mobileCleaned = mobile.replace(/[^0-9+]/g, '').trim();
      let isValid = true;
      let errorMsg = "";

      if (!name) {
        isValid = false;
        errorMsg = "Missing Name";
      } else if (!mobileCleaned) {
        isValid = false;
        errorMsg = "Missing Phone/Mobile ID";
      } else if (seenMobilesInPasted.has(mobileCleaned)) {
        isValid = false;
        errorMsg = `Duplicate phone in uploaded file: ${mobileCleaned}`;
      } else {
        seenMobilesInPasted.add(mobileCleaned);
      }

      result.push({
        tempId: `parsed-${i}-${Date.now()}`,
        name,
        age,
        mobile: mobileCleaned,
        email: email.trim(),
        l2: l2.trim(),
        isValid,
        errorMsg
      });
    }

    setParsedPlayers(result);
  };

  // Reset Bulk parsing states
  const clearBulkImport = () => {
    setBulkText('');
    setParsedPlayers([]);
    setImportProgress(0);
    setIsImporting(false);
  };

  // Submit bulk imports to global Firestore players collection
  const handleBulkImportSubmit = async () => {
    const validPlayers = parsedPlayers.filter(p => p.isValid);
    if (validPlayers.length === 0) {
      alert("No valid player rows found. Make sure names and phone numbers are correctly provided.");
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    const total = validPlayers.length;

    try {
      for (let idx = 0; idx < total; idx++) {
        const pData = validPlayers[idx];
        const cleanMobile = pData.mobile.trim();

        // Write directly to global players collection, keyed by phone
        const globalPlayerRef = doc(db, 'players', cleanMobile);
        await setDoc(globalPlayerRef, {
          name: pData.name.trim(),
          age: pData.age ? Number(pData.age) : '',
          mobile: cleanMobile,
          email: pData.email ? pData.email.trim() : '',
          l2: pData.l2 ? pData.l2.trim() : '',
          updatedAt: new Date().toISOString()
        }, { merge: true });

        successCount++;
        setImportProgress(Math.round((successCount / total) * 100));
      }

      alert(`Successfully registered ${successCount} player profiles to the global master registry!`);
      clearBulkImport();
      setActiveTab('list');
    } catch (err) {
      console.error("Bulk upload error:", err);
      alert("Failed to complete bulk player profile import.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div id="global-players-registry-container" className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden p-6 space-y-6">
      
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Global Player Profiles</h2>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
            Build and manage your master registry of players. Registered profiles can be searched and auto-assigned instantly in any tournament by simply entering their phone number!
          </p>
        </div>
        <button
          onClick={() => {
            const csvContent = "data:text/csv;charset=utf-8," + 
              ["Name,Age,Mobile,Chapter"].concat(masterPlayers.map(p => `${p.name},${p.age || ''},${p.mobile || ''},${p.l2 || ''}`)).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "master_players_registry.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-100 pb-3">
        <button
          onClick={() => { setActiveTab('list'); setEditingPlayerId(null); setManualForm({ name: '', age: '', mobile: '', gender: 'Male', l2: '', email: '' }); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'list' 
               ? 'bg-slate-900 text-white shadow-xs' 
               : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Master List ({masterPlayers.length})
        </button>
        <button
          onClick={() => setActiveTab('add')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'add' 
              ? 'bg-slate-900 text-white shadow-xs' 
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          {editingPlayerId ? 'Edit Profile' : 'Add New Profile'}
        </button>
        <button
          onClick={() => { setActiveTab('upload'); clearBulkImport(); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'upload' 
              ? 'bg-slate-900 text-white shadow-xs' 
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Upload Profiles CSV
        </button>
      </div>Special Instruction: Ensure that you do not define any unused imports or variables.

      {/* Tab Contents */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Search bar & statistics */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search global directory by name or phone number..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-slate-50/50 transition"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 font-medium flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              Loading master profiles...
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="p-10 border border-slate-100 rounded-2xl bg-slate-50/50 text-center text-slate-400">
              <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-600">No master profiles found</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {searchTerm ? 'Adjust your search term or register a new profile.' : 'Get started by creating a manual profile or importing profiles.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-100">
                      <th className="p-3 pl-4">Player Profile</th>
                      <th className="p-3">Age</th>
                      <th className="p-3">Gender</th>
                      <th className="p-3">Phone (Global Key)</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Global Chapter (L2)</th>
                      <th className="p-3 text-center pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm font-medium text-slate-700">
                    {filteredPlayers.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/75 transition">
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 font-extrabold text-xs">
                              {(p.name || 'P')[0].toUpperCase()}
                            </div>
                            <span className="font-extrabold text-slate-800">{p.name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-500 font-semibold">{p.age || '—'}</td>
                        <td className="p-3">
                          {p.gender ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                              p.gender === 'Female' 
                                ? 'bg-rose-50 border-rose-100 text-rose-700' 
                                : 'bg-blue-50 border-blue-100 text-blue-700'
                            }`}>
                              {p.gender === 'Female' ? '♀ Female' : '♂ Male'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-blue-50 border-blue-100 text-blue-700">
                              ♂ Male
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                            <Phone className="w-3 h-3 text-indigo-500" />
                            {p.mobile}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 text-xs font-mono">{p.email || '—'}</td>
                        <td className="p-3">
                          {p.l2 ? (
                            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-black border border-indigo-100">
                              🏫 {p.l2}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">None</span>
                          )}
                        </td>
                        <td className="p-3 text-center pr-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => startEditing(p)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer border border-slate-100 hover:scale-105"
                              title="Edit Master Profile"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePlayer(p.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer border border-slate-100 hover:scale-105"
                              title="Delete Profile"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'add' && (
        <form onSubmit={handleSaveManualPlayer} className="space-y-4 max-w-lg border border-slate-100 p-5 rounded-2xl bg-slate-50/30">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-500" />
            {editingPlayerId ? 'Edit Existing Player Profile' : 'Register New Player Profile'}
          </h3>
          
          <div className="grid grid-cols-1 gap-4">
            {/* Phone Input first as it is the Unique ID */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-indigo-500" /> Mobile Number (Global ID Key)
              </label>
              <input 
                value={manualForm.mobile}
                disabled={!!editingPlayerId && userRole !== 'admin'} // Allowed for admins
                onChange={(e) => setManualForm({...manualForm, mobile: e.target.value})}
                placeholder="e.g. 9876543210"
                className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition disabled:bg-slate-100 disabled:text-slate-400"
                type="tel"
              />
              {editingPlayerId && (
                userRole === 'admin' ? (
                  <p className="text-[10px] text-indigo-600 font-bold">
                    🛡️ Admin Mode: You can modify the mobile number. Saving will delete the old profile and migrate it to the new number.
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-600 font-bold">
                    ⚠️ Phone number is the profile unique ID and cannot be modified. If wrong, please recreate. (Admins can change this)
                  </p>
                )
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Player Full Name</label>
              <input 
                value={manualForm.name} 
                onChange={(e) => setManualForm({...manualForm, name: e.target.value})} 
                placeholder="e.g. Lokesh Sharma" 
                className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Email Address</label>
              <input 
                value={manualForm.email} 
                onChange={(e) => setManualForm({...manualForm, email: e.target.value})} 
                placeholder="e.g. john@example.com" 
                className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition"
                type="email"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Age</label>
              <input 
                value={manualForm.age} 
                onChange={(e) => setManualForm({...manualForm, age: e.target.value})} 
                placeholder="e.g. 24" 
                className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition"
                type="number"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Gender</label>
              <select 
                value={manualForm.gender} 
                onChange={(e) => setManualForm({...manualForm, gender: e.target.value})} 
                className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition cursor-pointer"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                🏫 Global Chapter Name (Level 2 L2)
              </label>
              <input 
                value={manualForm.l2} 
                onChange={(e) => setManualForm({...manualForm, l2: e.target.value})} 
                placeholder="e.g. Mumbai, Pune, Kolkata" 
                className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition"
              />
              <p className="text-[10px] text-slate-400 font-medium leading-normal">
                If specified, whenever this player is added or imported to any tournament, they will automatically be assigned to the Level 2 Chapter/Category matching this name!
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmittingManual}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSubmittingManual ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {editingPlayerId ? 'Save Changes' : 'Register Profile'}
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('list'); setEditingPlayerId(null); setManualForm({ name: '', age: '', mobile: '', gender: 'Male', l2: '', email: '' }); }}
              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {activeTab === 'upload' && (
        <div className="space-y-5">
          {/* Instructions banner */}
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex gap-3">
            <div className="text-indigo-600 shrink-0">
              <FileSpreadsheet className="w-5 h-5 mt-0.5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-indigo-900">Format Guide for CSV / Excel uploads</h4>
              <p className="text-[11px] text-indigo-700 mt-1 leading-relaxed">
                To upload successfully, match these columns in your spreadsheet: <span className="font-extrabold">Name</span>, <span className="font-extrabold">Age</span>, and <span className="font-extrabold">Mobile</span> (or Phone). Phone acts as the globally unique ID.
              </p>
            </div>
          </div>

          {/* Paste Input Area or File Dropzone */}
          {parsedPlayers.length === 0 ? (
            <div className="space-y-4">
              <div 
                className={`border-2 border-dashed rounded-3xl p-8 text-center transition ${
                  dragActive ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-200 bg-slate-50/30 hover:bg-slate-50'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
                <p className="text-sm font-extrabold text-slate-700">Drag & Drop your CSV/TXT file here</p>
                <p className="text-xs text-slate-400 mt-0.5">Or click below to browse files from your computer</p>
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".csv,.txt"
                  className="hidden" 
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  Select File
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Alternatively: Paste CSV / Excel rows directly below</label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={6}
                  placeholder={`Name\tAge\tMobile\nLokesh Sharma\t24\t9876543210\nJohn Doe\t29\t8765432109`}
                  className="w-full border border-slate-200 p-3 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white transition"
                />
              </div>

              <button
                onClick={parseBulkData}
                disabled={!bulkText.trim()}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Parse and Preview Upload
              </button>
            </div>
          ) : (
            /* Upload preview table & validation indicators */
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                <span className="text-xs font-bold text-slate-600">
                  📋 Found <span className="font-extrabold text-slate-950">{parsedPlayers.length}</span> rows in the uploaded data
                </span>
                <button
                  onClick={clearBulkImport}
                  className="text-xs text-rose-600 font-bold hover:underline"
                >
                  Clear & Re-upload
                </button>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-80 overflow-y-auto bg-white shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-100 z-10 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5 pl-4">Name</th>
                      <th className="p-2.5">Age</th>
                      <th className="p-2.5">Phone (Global Key)</th>
                      <th className="p-2.5">Email</th>
                      <th className="p-2.5 text-center pr-4">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-medium text-slate-700">
                    {parsedPlayers.map((p, idx) => {
                      const isDbDup = masterPlayers.some(dp => dp.id === p.mobile);
                      return (
                        <tr key={p.tempId} className={`hover:bg-slate-50/70 transition ${!p.isValid ? 'bg-rose-50/20' : ''}`}>
                          <td className="p-2.5 pl-4">
                            <input
                              value={p.name}
                              onChange={e => {
                                const updated = [...parsedPlayers];
                                updated[idx].name = e.target.value;
                                if (!e.target.value.trim()) {
                                  updated[idx].isValid = false;
                                  updated[idx].errorMsg = "Missing Name";
                                } else {
                                  updated[idx].isValid = true;
                                  updated[idx].errorMsg = "";
                                }
                                setParsedPlayers(updated);
                              }}
                              className="border border-slate-200 bg-white px-2 py-1 rounded-md w-full focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2.5 w-16">
                            <input
                              value={p.age}
                              onChange={e => {
                                const updated = [...parsedPlayers];
                                updated[idx].age = e.target.value;
                                setParsedPlayers(updated);
                              }}
                              className="border border-slate-200 bg-white px-2 py-1 rounded-md w-full focus:ring-1 focus:ring-indigo-500"
                              type="number"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              value={p.mobile}
                              onChange={e => {
                                const clean = e.target.value.replace(/[^0-9+]/g, '');
                                const updated = [...parsedPlayers];
                                updated[idx].mobile = clean;
                                if (!clean) {
                                  updated[idx].isValid = false;
                                  updated[idx].errorMsg = "Missing Phone/Mobile ID";
                                } else {
                                  updated[idx].isValid = true;
                                  updated[idx].errorMsg = "";
                                }
                                setParsedPlayers(updated);
                              }}
                              className="border border-slate-200 bg-white px-2 py-1 rounded-md w-full font-mono text-[11px] focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              value={p.email}
                              onChange={e => {
                                const updated = [...parsedPlayers];
                                updated[idx].email = e.target.value;
                                setParsedPlayers(updated);
                              }}
                              className="border border-slate-200 bg-white px-2 py-1 rounded-md w-full focus:ring-1 focus:ring-indigo-500"
                              type="email"
                            />
                          </td>
                          <td className="p-2.5 text-center pr-4">
                            <div className="flex items-center justify-center gap-1">
                              {!p.isValid ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-bold">
                                  <AlertTriangle className="w-3 h-3" />
                                  {p.errorMsg}
                                </span>
                              ) : isDbDup ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                  <AlertTriangle className="w-3 h-3" />
                                  Already in Registry (will update)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                  <Check className="w-3 h-3" />
                                  Ready
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  const updated = parsedPlayers.filter((_, i) => i !== idx);
                                  setParsedPlayers(updated);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition ml-1"
                                title="Remove row"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Progress Bar & Buttons */}
              {isImporting && (
                <div className="space-y-2 border border-indigo-50 p-4 rounded-2xl bg-indigo-50/20">
                  <div className="flex justify-between text-xs font-bold text-indigo-900">
                    <span>Saving profiles to global database...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-2">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleBulkImportSubmit}
                  disabled={isImporting || parsedPlayers.filter(p => p.isValid).length === 0}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isImporting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Save Valid Profiles to Master Registry
                </button>
                <button
                  onClick={clearBulkImport}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
