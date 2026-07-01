import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  setDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query 
} from 'firebase/firestore';
import { 
  Shield, 
  UserPlus, 
  Trash2, 
  User, 
  Mail, 
  Search, 
  Check, 
  X, 
  AlertTriangle,
  UserCheck
} from 'lucide-react';

interface UserRole {
  email: string;
  role: 'admin' | 'scorer' | 'user';
  displayName?: string;
}

export default function RoleManager() {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'scorer' | 'user'>('scorer');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'user_roles'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roles: UserRole[] = [];
      snapshot.forEach((doc) => {
        roles.push(doc.data() as UserRole);
      });
      setUserRoles(roles);
    }, (err) => {
      console.error("Error loading user roles:", err);
      setError("Failed to load user roles. Ensure you are logged in as admin.");
    });
    return () => unsubscribe();
  }, []);

  const handleAddOrUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newEmail.trim()) return;

    const emailKey = newEmail.trim().toLowerCase();
    
    // Simple basic validation
    if (!emailKey.includes('@')) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setSaving(true);
      await setDoc(doc(db, 'user_roles', emailKey), {
        email: emailKey,
        role: newRole,
        displayName: newDisplayName.trim() || emailKey.split('@')[0]
      });
      setNewEmail('');
      setNewDisplayName('');
      setNewRole('scorer');
    } catch (err: any) {
      console.error("Error setting user role:", err);
      setError("Failed to save user role. " + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (email: string) => {
    if (email.toLowerCase() === 'jbmrsports@gmail.com') {
      alert("The super admin cannot be deleted!");
      return;
    }
    if (!window.confirm(`Are you sure you want to remove role permissions for ${email}? They will revert to default read-only access.`)) {
      return;
    }

    try {
      setError(null);
      await deleteDoc(doc(db, 'user_roles', email.toLowerCase()));
    } catch (err: any) {
      console.error("Error deleting user role:", err);
      setError("Failed to delete user role. " + (err.message || ''));
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-rose-50 text-rose-700 border border-rose-200 font-extrabold';
      case 'scorer':
        return 'bg-amber-50 text-amber-700 border border-amber-200 font-bold';
      default:
        return 'bg-slate-50 text-slate-600 border border-slate-200';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return '🔑 Admin (Full Access)';
      case 'scorer': return '✏️ Scorer (Scores Only)';
      default: return '👁️ User (Read Only)';
    }
  };

  const filteredRoles = userRoles.filter(r => 
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div className="relative bg-gradient-to-r from-slate-900 to-slate-850 rounded-3xl p-8 overflow-hidden border border-slate-800 shadow-xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Shield className="w-64 h-64 text-indigo-400" />
        </div>
        <div className="relative space-y-3 max-w-2xl text-white">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold uppercase tracking-wider">
            <UserCheck className="w-3.5 h-3.5" />
            Access Control Panel
          </div>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            User Role & Access Manager
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Configure system authorization profiles. Grant score entry (Scorer) privileges or full master controls (Admin) to specific Google logins.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-start gap-3 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* ADD / UPDATE FORM */}
        <div className="md:col-span-1 bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4 h-fit">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-150">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Assign Role Access</h3>
          </div>

          <form onSubmit={handleAddOrUpdateRole} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Gmail / Google Account</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="e.g. user@gmail.com"
                  className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Display Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  value={newDisplayName}
                  onChange={e => setNewDisplayName(e.target.value)}
                  placeholder="e.g. John Doe (Optional)"
                  className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Access Role</label>
              <select 
                value={newRole}
                onChange={e => setNewRole(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              >
                <option value="user">👁️ Read-Only User</option>
                <option value="scorer">✏️ Scorer (Enter Scores Only)</option>
                <option value="admin">🔑 Administrator (Full Access)</option>
              </select>
            </div>

            <button 
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Grant Role Permissions'}
            </button>
          </form>
        </div>

        {/* ROLES DIRECTORY LISTING */}
        <div className="md:col-span-2 bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-150">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Access Registry ({userRoles.length})</h3>
            </div>

            <div className="relative w-full sm:w-48 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search email..."
                className="w-full bg-slate-50 border border-slate-200 pl-8 pr-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[450px] overflow-y-auto pr-1">
            {filteredRoles.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No users found with assigned access roles.
              </div>
            ) : (
              filteredRoles.map((roleRecord) => (
                <div key={roleRecord.email} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">
                      {roleRecord.displayName || roleRecord.email.split('@')[0]}
                    </p>
                    <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-300" />
                      {roleRecord.email}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider ${getRoleBadgeClass(roleRecord.role)}`}>
                      {getRoleLabel(roleRecord.role)}
                    </span>
                    
                    <button 
                      onClick={() => {
                        setNewEmail(roleRecord.email);
                        setNewDisplayName(roleRecord.displayName || '');
                        setNewRole(roleRecord.role);
                      }}
                      className="p-1.5 hover:bg-slate-50 border border-transparent hover:border-slate-150 text-slate-500 hover:text-indigo-600 rounded transition"
                      title="Edit User Role"
                    >
                      ✏️
                    </button>

                    <button 
                      onClick={() => handleDeleteRole(roleRecord.email)}
                      className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-150 text-slate-400 hover:text-rose-600 rounded transition"
                      title="Delete User Role"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
