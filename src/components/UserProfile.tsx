import React, { useState, useMemo } from 'react';
import { 
  User as UserIcon, Mail, Phone, Shield, Wallet, ShoppingCart, Key, Check, X, Eye, EyeOff, Loader2, Calendar, FileText, Info, Sun, Moon
} from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  balance: number;
  whatsapp_number?: string;
  theme?: 'light' | 'dark';
}

interface Order {
  id: number;
  service_id: number;
  link: string;
  quantity: number;
  charge: number;
  status: string;
  created_at: string;
}

interface UserProfileProps {
  user: User;
  token: string;
  balance: number;
  orders: Order[];
  onUpdate: () => void;
  onUserUpdate: (updatedUser: User) => void;
  isDarkMode?: boolean;
  setIsDarkMode?: (dark: boolean) => void;
}

const formatPriceLocal = (price: number | string) => {
  const p = typeof price === 'string' ? parseFloat(price) : price;
  return `৳${p.toFixed(2)}`;
};

export default function UserProfile({ 
  user, 
  token, 
  balance, 
  orders, 
  onUpdate, 
  onUserUpdate,
  isDarkMode = false,
  setIsDarkMode
}: UserProfileProps) {
  // WhatsApp State
  const [whatsapp, setWhatsapp] = useState(user.whatsapp_number || '');
  const [isEditingWhatsapp, setIsEditingWhatsapp] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Search orders local
  const [searchQuery, setSearchQuery] = useState('');

  // Stats Derived
  const stats = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter(o => o.status === 'completed' || o.status === 'success').length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const active = orders.filter(o => o.status === 'processing' || o.status === 'inprogress' || o.status === 'pending').length;
    const canceled = orders.filter(o => o.status === 'canceled' || o.status === 'cancelled').length;
    
    const totalSpent = orders
      .filter(o => o.status === 'completed' || o.status === 'success')
      .reduce((sum, o) => sum + parseFloat(String(o.charge)), 0);

    return { total, completed, pending, active, canceled, totalSpent };
  }, [orders]);

  // Filter local orders
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders.slice(0, 5);
    return orders.filter(o => 
      o.link.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(o.id).includes(searchQuery) ||
      o.status.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5);
  }, [orders, searchQuery]);

  // Save WhatsApp function
  const handleSaveWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWhatsapp(true);
    try {
      const res = await fetch('/api/user/whatsapp', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ whatsapp_number: whatsapp })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('WhatsApp number updated!');
        const updatedUser = { ...user, whatsapp_number: whatsapp };
        onUserUpdate(updatedUser);
        setIsEditingWhatsapp(false);
      } else {
        toast.error(data.error || 'Failed to update WhatsApp number');
      }
    } catch {
      toast.error('Network error updating WhatsApp');
    } finally {
      setSavingWhatsapp(false);
    }
  };

  // Change password function
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setSubmittingPassword(true);
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || 'Failed to change password');
      }
    } catch {
      toast.error('Network error changing password');
    } finally {
      setSubmittingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 id="profile-heading" className="text-xl font-black uppercase tracking-tight dark:text-white flex items-center gap-2">
            <UserIcon className="text-indigo-600" size={22} />
            My Reseller Desk
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Personal panel settings, account telemetry & balance profile
          </p>
        </div>
        <div className="px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest rounded-lg border border-indigo-100/30">
          Role: {user.role === 'admin' ? 'SYSTEM ADMINISTRATOR' : 'PREMIUM RESELLER'}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Stats & Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          {/* Main User Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 dark:bg-indigo-600/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-14 h-14 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-md shadow-indigo-500/20">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-black dark:text-white">{user.username}</h3>
                <p className="text-xs text-slate-400 font-mono font-bold mt-0.5">UID: #{user.id}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-3.5">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Mail size={16} className="text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Email Address</p>
                  <p className="text-xs font-bold truncate dark:text-white leading-tight">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Phone size={16} className="text-slate-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">WhatsApp Contact</p>
                  {isEditingWhatsapp ? (
                    <form onSubmit={handleSaveWhatsapp} className="flex gap-1.5 mt-1.5">
                      <input
                        type="text"
                        required
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="e.g. +8801700000000"
                        className="flex-1 px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold focus:ring-1 focus:ring-indigo-600 outline-none dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={savingWhatsapp}
                        className="px-2.5 bg-green-600 text-white hover:bg-green-700 font-bold rounded-lg text-xs flex items-center justify-center cursor-pointer transition-all disabled:opacity-55 active:scale-95"
                      >
                        {savingWhatsapp ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingWhatsapp(false);
                          setWhatsapp(user.whatsapp_number || '');
                        }}
                        className="px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs flex items-center justify-center cursor-pointer transition-all active:scale-95"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs font-bold dark:text-white leading-tight">
                        {user.whatsapp_number || 'No contact numbers added'}
                      </p>
                      <button
                        onClick={() => setIsEditingWhatsapp(true)}
                        className="text-[10px] text-indigo-600 hover:underline font-extrabold uppercase tracking-wide cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Display Preferences Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/5 dark:bg-indigo-600/10 rounded-full blur-2xl -mr-12 -mt-12"></div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-[11px] uppercase tracking-wider relative z-10">
              {isDarkMode ? <Moon size={15} /> : <Sun size={15} />}
              <span>Display Settings</span>
            </div>
            
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs font-extrabold dark:text-white">Dark Mode Theme</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Optimize for night-time browsing</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (setIsDarkMode) {
                    setIsDarkMode(!isDarkMode);
                    toast.success(!isDarkMode ? "Enabled Night-time Dark Mode!" : "Switched to Light Mode!");
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}
                title="Toggle visual style theme between light and dark"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>

          {/* Core Balance Card */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden text-white shadow-md">
            <div className="absolute right-[-15px] bottom-[-20px] text-slate-800 opacity-20 font-black text-8xl pointer-events-none select-none">৳</div>
            <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-black uppercase tracking-wider mb-2">
              <Wallet size={12} />
              Current Premium Wallet
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Available Balance</p>
            <h4 className="text-3xl font-black text-indigo-400 font-sans tracking-tight">{formatPriceLocal(balance)}</h4>
            <div className="border-t border-slate-800/80 pt-4 mt-4 flex justify-between text-[11px] font-bold text-slate-400">
              <span>Verified Status</span>
              <span className="text-emerald-400 flex items-center gap-1 font-extrabold uppercase tracking-wider">
                <Check size={12} className="stroke-[3]" /> Email Verified
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Order Stats, Quick Orders Filter list and Security */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Metrics Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Total Orders</p>
              <p className="text-lg font-black dark:text-white font-mono">{stats.total}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-[9px] font-black text-green-500 uppercase tracking-wider mb-1">Completed</p>
              <p className="text-lg font-black text-green-600 dark:text-green-450 font-mono">{stats.completed}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-[9px] font-black text-amber-500 uppercase tracking-wider mb-1">Active Runs</p>
              <p className="text-lg font-black text-amber-600 dark:text-amber-450 font-mono">{stats.active}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-wider mb-1">Total Invested</p>
              <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 font-mono">{formatPriceLocal(stats.totalSpent)}</p>
            </div>
          </div>

          {/* Recent Profile Orders Activity */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200/25 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <ShoppingCart size={16} className="text-indigo-600" />
                <h4 className="text-xs font-black dark:text-white uppercase tracking-wider">Reseller Order Stream (Top 5)</h4>
              </div>
              <div className="w-full sm:w-48">
                <input
                  type="text"
                  placeholder="Quick search link..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1 text-[11px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 dark:text-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <FileText className="mx-auto mb-2 opacity-30" size={30} />
                  <p className="text-xs font-bold uppercase tracking-wider">No recent orders matching criteria</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/20 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                      <th className="px-6 py-3">Order ID</th>
                      <th className="px-6 py-3">Link Target</th>
                      <th className="px-6 py-3">Qty</th>
                      <th className="px-6 py-3">Cost</th>
                      <th className="px-6 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 font-medium">
                        <td className="px-6 py-3.5 font-mono text-[10px] dark:text-white font-bold">#{o.id}</td>
                        <td className="px-6 py-3.5 max-w-[140px] truncate dark:text-slate-300 font-mono text-[10.5px]">{o.link}</td>
                        <td className="px-6 py-3.5 font-mono text-[10.5px] dark:text-white">{o.quantity}</td>
                        <td className="px-6 py-3.5 font-black text-indigo-600 dark:text-indigo-400 font-mono">{formatPriceLocal(o.charge)}</td>
                        <td className="px-6 py-3.5 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-black text-[8px] uppercase tracking-wider ${
                            o.status === 'completed' || o.status === 'success' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' :
                            o.status === 'pending' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400' :
                            o.status === 'processing' || o.status === 'inprogress' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400' :
                            'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Password Change settings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200/25 dark:border-slate-800 flex items-center gap-1.5">
              <Key size={16} className="text-indigo-600" />
              <h4 className="text-xs font-black dark:text-white uppercase tracking-wider">Credential Access Update</h4>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-3 pr-9 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showCurrentPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-3 pr-9 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-3 pr-9 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <Shield size={12} className="text-slate-500 shrink-0" />
                  Passwords are encrypted server-side using SHA-256 hashes
                </p>
                <button
                  type="submit"
                  disabled={submittingPassword}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-lg text-[10px] uppercase tracking-widest cursor-pointer shadow-sm transition-all disabled:opacity-55 active:scale-95"
                >
                  {submittingPassword ? 'Saving Changes...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
