import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, X, Check, Wallet, 
  Shield, CreditCard, ArrowUpRight, HelpCircle, UserPlus, 
  RefreshCw, AlertTriangle, Info, BookOpen
} from 'lucide-react';
import toast from 'react-hot-toast';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  balance: number;
  whatsapp_number?: string;
}

interface AdminUsersManagerProps {
  token: string;
  onUpdate: () => void;
}

export default function AdminUsersManager({ token, onUpdate }: AdminUsersManagerProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [subTab, setSubTab] = useState<'directory' | 'gateways'>('directory');

  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    role: 'user' as 'admin' | 'user',
    balance: '0',
    whatsapp_number: ''
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Add User State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addForm, setAddForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    balance: '0'
  });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        toast.error("Failed to load user accounts");
      }
    } catch (e) {
      toast.error("Network error occurred loading users");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({
      username: user.username,
      email: user.email,
      role: user.role,
      balance: String(user.balance),
      whatsapp_number: user.whatsapp_number || ''
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSubmittingEdit(true);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: editForm.username,
          email: editForm.email,
          role: editForm.role,
          balance: parseFloat(editForm.balance) || 0,
          whatsapp_number: editForm.whatsapp_number || null
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "User profile details updated successfully!");
        setEditingUser(null);
        fetchUsers();
        onUpdate(); // Update upper parent balances/data
      } else {
        toast.error(data.error || "Failed to update user profile");
      }
    } catch (err) {
      toast.error("Connection error while updating user content");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Are you absolutely sure you want to delete user account "${username}"? All associated account history will be unlinked.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "User account removed completely!");
        fetchUsers();
        onUpdate();
      } else {
        toast.error(data.error || "Could not delete user account");
      }
    } catch (err) {
      toast.error("Network error deleting user");
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAdd(true);

    try {
      // Create user using our main register endpoint (returns default user role: 'user')
      const resReg = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: addForm.username,
          email: addForm.email,
          password: addForm.password
        })
      });

      const regData = await resReg.json();

      if (!resReg.ok || !regData.success) {
        throw new Error(regData.error || "Failed to seed register endpoint");
      }

      const newUserId = regData.user.id;

      // Adjust user role and balance in database using our admin PUT handler
      const resAdminAdjust = await fetch(`/api/admin/users/${newUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: addForm.username,
          email: addForm.email,
          role: addForm.role,
          balance: parseFloat(addForm.balance) || 0,
          whatsapp_number: null
        })
      });

      if (resAdminAdjust.ok) {
        toast.success(`User Account registered successfully with balance of $${parseFloat(addForm.balance || '0').toFixed(2)}`);
        setIsAddingUser(false);
        setAddForm({
          username: '',
          email: '',
          password: '',
          role: 'user',
          balance: '0'
        });
        fetchUsers();
        onUpdate();
      } else {
        const adjustData = await resAdminAdjust.json();
        toast.error(adjustData.error || "Created account, but failed to adjust admin configurations");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create custom user profile");
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.username.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      String(user.id) === search;
    const matchesRole = roleFilter === 'all' ? true : user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Tab Navigation header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black tracking-tight dark:text-white">User & Funding Administration</h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
            Manage registered profiles, inject manual balances, and setup payment providers
          </p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/60">
          <button
            onClick={() => setSubTab('directory')}
            className={`flex items-center gap-2 px-4 py-2 font-black text-[10px] uppercase tracking-wider rounded-lg transition-all ${
              subTab === 'directory' 
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Users size={12} />
            User Directory
          </button>
          <button
            onClick={() => setSubTab('gateways')}
            className={`flex items-center gap-2 px-4 py-2 font-black text-[10px] uppercase tracking-wider rounded-lg transition-all ${
              subTab === 'gateways' 
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <BookOpen size={12} />
            Integration Desk
          </button>
        </div>
      </div>

      {subTab === 'directory' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-3.5 text-slate-400" size={16} style={{ color: '#ffffff' }} />
              <input
                type="text"
                placeholder="Search by ID, Username or Email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs focus:ring-1 focus:ring-indigo-500/50 outline-none dark:text-white"
              />
            </div>

            <div>
              <select
                value={roleFilter}
                onChange={(e: any) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-indigo-500/50 outline-none"
              >
                <option value="all">🕵️ All Roles</option>
                <option value="admin">⭐ Administrators</option>
                <option value="user">👤 Custom Users</option>
              </select>
            </div>

            <div>
              <button
                onClick={() => setIsAddingUser(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm shrink-0"
              >
                <UserPlus size={14} />
                Create User
              </button>
            </div>
          </div>

          {/* Users Table / Directory */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600 gap-3">
                <RefreshCw size={24} className="animate-spin" />
                <span className="text-xs font-mono">Syncing system directory...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500">
                <Users size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">No users matching search filters found.</p>
                <p className="text-xs mt-1">Try resetting the selection settings or search keyword.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">ID</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">User Profile</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Role Privilege</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">WhatsApp Number</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Account Balance</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="px-6 py-4">
                          <code className="text-xs text-slate-400 dark:text-slate-500 font-mono font-bold">#{u.id}</code>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-extrabold text-xs text-slate-900 dark:text-white">{u.username}</div>
                            <div className="text-xs text-slate-400 font-medium mt-0.5">{u.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            u.role === 'admin' 
                              ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/30' 
                              : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/10'
                          }`}>
                            <Shield size={10} />
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400">
                            {u.whatsapp_number || <span className="text-slate-300 dark:text-slate-600 italic">None Provided</span>}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                            <Wallet size={12} className="text-indigo-500 shrink-0" style={{ color: '#20ff00' }} />
                            <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400" style={{ color: '#ffffff' }}>
                              ${parseFloat(u.balance || 0).toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-2 hover:bg-indigo-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors"
                              title="Fund User / Edit Role"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="p-2 hover:bg-red-50 dark:hover:bg-slate-800 text-red-500 rounded-lg transition-colors"
                              title="Delete User"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'gateways' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Guide Quick Summary */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden border border-indigo-800/30">
                <div className="relative z-10 space-y-4">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                    <CreditCard size={20} className="text-indigo-300" />
                  </div>
                  <div>
                    <h4 className="text-base font-black uppercase tracking-tight">Funding System Structure</h4>
                    <p className="text-indigo-200/80 text-[10px] uppercase font-bold tracking-widest mt-0.5">Real-time balances for reseller panels</p>
                  </div>
                  <p className="text-xs text-indigo-100/70 leading-relaxed">
                    Automated client deposits are handled securely by initializing transactional checkpoints in the backend using cryptographic signatures. This validates key pricing values before processing balance state mutations.
                  </p>
                  
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-[10px] space-y-1 text-indigo-200">
                    <div className="font-extrabold text-white text-[11px] mb-1">🔥 Required environment setup:</div>
                    <div><code>STRIPE_SECRET_KEY=sk_live_...</code></div>
                    <div><code>PAYPAL_CLIENT_ID=AeX2_...</code></div>
                    <div><code>PAYPAL_SECRET=EEv3_...</code></div>
                  </div>
                </div>
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <HelpCircle size={100} />
                </div>
              </div>

              {/* Steps overview list */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  ⏱️ 4-Step Gateway Integration
                </h4>
                
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">1</div>
                    <div>
                      <h5 className="text-xs font-black dark:text-white">Collect API credentials</h5>
                      <p className="text-[10px] text-slate-400 leading-tight">Secure production keys from Stripe Dashboard or PayPal Developer.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">2</div>
                    <div>
                      <h5 className="text-xs font-black dark:text-white">Create Server-side Router</h5>
                      <p className="text-[10px] text-slate-400 leading-tight">Integrate gateway library SDKs inside server.ts for payment session tokens.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">3</div>
                    <div>
                      <h5 className="text-xs font-black dark:text-white">Mount Secure Webhook Callback</h5>
                      <p className="text-[10px] text-slate-400 leading-tight">Implement real-time verification endpoint for payment fulfillment events</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">4</div>
                    <div>
                      <h5 className="text-xs font-black dark:text-white">Render Checkout View</h5>
                      <p className="text-[10px] text-slate-400 leading-tight">Redirect users client-side or render Elements inside Checkout Dialog.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Code implementation files bento */}
            <div className="lg:col-span-2 space-y-6">
              {/* Stripe Implementation Panel */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 flex items-center justify-between border-b border-slate-200/25 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-purple-500 rounded-full"></div>
                    <span className="text-xs font-black uppercase tracking-wider dark:text-white">Stripe Checkout Node.js Code Template</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 rounded">server.ts</span>
                </div>
                
                <div className="p-4 bg-slate-950 text-slate-300 font-mono text-[9.5px] overflow-x-auto leading-relaxed max-h-[350px]">
                  <pre>{`// 1. Initialize Stripe Client Security
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// 2. Create Instant checkout session
app.post("/api/deposits/stripe/session", authenticateToken, async (req: AuthRequest, res) => {
  const { amount } = req.body; // Amount in USD
  const userId = req.user?.id;
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { 
            name: 'Reseller Panel Fund Deposit',
            description: \`USD Funding balance for user account #\${userId}\`
          },
          unit_amount: Math.round(amount * 100), // convert to cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: \`https://\${req.headers.host}/api/deposits/stripe/callback?session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`https://\${req.headers.host}/?tab=transactions\`,
      metadata: { userId: String(userId), amount: String(amount) }
    });
    
    res.json({ success: true, payment_url: session.url });
  } catch (err) {
    res.status(500).json({ error: "Checkout creation failed" });
  }
});`}</pre>
                </div>
              </div>

              {/* PayPal Integration Panel */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 flex items-center justify-between border-b border-slate-200/25 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                    <span className="text-xs font-black uppercase tracking-wider dark:text-white">PayPal Capture Webhook Template</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded">api.ts</span>
                </div>
                
                <div className="p-4 bg-slate-950 text-slate-300 font-mono text-[9.5px] overflow-x-auto leading-relaxed max-h-[350px]">
                  <pre>{`// Handle Stripe/PayPal webhook captures and credits user's account safely
app.post("/api/deposits/webhook", express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Validate we're receiving genuine encrypted payload directly from Stripe servers
    event = stripe.webhooks.constructEvent(req.body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).send(\`Webhook Error: \${err.message}\`);
  }

  // Handle successful charge capture event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = parseInt(session.metadata.userId);
    const amount = parseFloat(session.metadata.amount);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Post transaction log entry
      await connection.query(
        "INSERT INTO deposits (user_id, amount, method, status) VALUES (?, ?, ?, ?)",
        [userId, amount, 'Stripe Checkout', 'approved']
      );
      
      // Feed live balance increase
      await connection.query(
        "UPDATE users SET balance = balance + ? WHERE id = ?",
        [amount, userId]
      );
      
      await connection.commit();
    } catch (e) {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }

  res.json({ received: true });
});`}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full overflow-hidden animate-fade-in">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black dark:text-white uppercase tracking-tight">Admin Accounts Desk</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Edit credentials or override balance</p>
              </div>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Username Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white focus:ring-1 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">User Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e: any) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white focus:ring-1 focus:ring-indigo-500/50 outline-none"
                  >
                    <option value="user">USER</option>
                    <option value="admin">ADMIN</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Verified Email Address</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white focus:ring-1 focus:ring-indigo-500/50 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">WhatsApp Contact</label>
                <input
                  type="text"
                  placeholder="e.g. +8801700..."
                  value={editForm.whatsapp_number}
                  onChange={(e) => setEditForm({...editForm, whatsapp_number: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white"
                />
              </div>

              <div className="bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-800/40 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
                  <Wallet size={14} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Account Credit Vault</span>
                </div>
                
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-indigo-950 dark:text-indigo-300 uppercase tracking-wider">Inject / Override User Balance ($)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3.5 text-indigo-500 font-extrabold text-xs">$</span>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      value={editForm.balance}
                      onChange={(e) => setEditForm({...editForm, balance: e.target.value})}
                      className="w-full pl-7 pr-3 py-3 rounded-xl bg-white dark:bg-slate-900 border-none text-xs font-black text-indigo-600 dark:text-indigo-400 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <span className="block text-[9px] text-slate-400 font-medium leading-none mt-1">Changes are directly debited/credited to database balance state.</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="w-1/2 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="w-1/2 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Update account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black dark:text-white uppercase tracking-tight">Register Custom Account</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Preseed a user or manager account</p>
              </div>
              <button 
                onClick={() => setIsAddingUser(false)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">User Username</label>
                <input
                  type="text"
                  required
                  placeholder="johndoe"
                  value={addForm.username}
                  onChange={(e) => setAddForm({...addForm, username: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white focus:ring-1"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="john@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm({...addForm, email: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Secure Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={addForm.password}
                  onChange={(e) => setAddForm({...addForm, password: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Starting Balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={addForm.balance}
                    onChange={(e) => setAddForm({...addForm, balance: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assign Role</label>
                  <select
                    value={addForm.role}
                    onChange={(e: any) => setAddForm({...addForm, role: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none text-xs dark:text-white"
                  >
                    <option value="user">User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="w-1/2 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="w-1/2 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmittingAdd ? 'Registering...' : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
