import React, { useState, useEffect } from 'react';
import { 
  Key, Copy, Check, Trash2, Plus, RefreshCw, ExternalLink, 
  ShieldAlert, Terminal, ArrowRight, BookOpen, Lock, Compass, Eye, EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ApiKey {
  id: number;
  name: string;
  masked_key: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
}

interface DeveloperApiKeysProps {
  token: string;
}

export default function DeveloperApiKeys({ token }: DeveloperApiKeysProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeLang, setActiveLang] = useState<'curl' | 'node' | 'python'>('curl');

  // Security generated key modal
  const [newKeyData, setNewKeyData] = useState<{ key: string; name: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, [token]);

  const fetchKeys = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/keys', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      } else {
        toast.error('Failed to retrieve API keys');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error fetching API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      toast.error('Please enter a key label');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch('/api/user/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: keyName })
      });
      if (res.ok) {
        const data = await res.json();
        setNewKeyData({ key: data.key, name: data.name });
        setKeyName('');
        toast.success('Successfully generated new API key!');
        fetchKeys();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to generate API key');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error contacting backend to create key');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeKey = async (id: number) => {
    if (!window.confirm('Are you absolutely sure you want to revoke this API key? Any applications currently using this key will immediately fail to authenticate.')) {
      return;
    }
    try {
      const res = await fetch(`/api/user/keys/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('API Key revoked successfully');
        fetchKeys();
      } else {
        toast.error('Failed to revoke API key');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error communicating with revoke API');
    }
  };

  const handleCopyNewKey = () => {
    if (!newKeyData) return;
    navigator.clipboard.writeText(newKeyData.key);
    setCopiedKey(true);
    toast.success('API key copied to clipboard!');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const codeSnippets = {
    curl: `# 1. Fetch Account Balance
curl -X POST "https://amarboost.com/api/v2" \\
  -H "Content-Type: application/json" \\
  -d '{
    "key": "${newKeyData?.key || 'YOUR_API_KEY'}",
    "action": "balance"
  }'

# 2. Add New Reseller Order
curl -X POST "https://amarboost.com/api/v2" \\
  -H "Content-Type: application/json" \\
  -d '{
    "key": "${newKeyData?.key || 'YOUR_API_KEY'}",
    "action": "add",
    "service": "1",
    "link": "https://facebook.com/post123",
    "quantity": 1000
  }'`,
    node: `const axios = require('axios');

async function getBalance() {
  try {
    const response = await axios.post('/api/v2', {
      key: '${newKeyData?.key || 'YOUR_API_KEY'}',
      action: 'balance'
    });
    console.log('Balance:', response.data.balance, response.data.currency);
  } catch (error) {
    console.error('Error fetching balance:', error);
  }
}

async function addOrder() {
  try {
    const response = await axios.post('/api/v2', {
      key: '${newKeyData?.key || 'YOUR_API_KEY'}',
      action: 'add',
      service: '1',
      link: 'https://youtube.com/watch?v=123',
      quantity: 500
    });
    if (response.data.error) {
      console.error('Order failed:', response.data.error);
    } else {
      console.log('Order added successfully, ID:', response.data.order);
    }
  } catch (error) {
    console.error(error);
  }
}

getBalance();`,
    python: `import requests

API_URL = "https://amarboost.com/api/v2"
API_KEY = "${newKeyData?.key || 'YOUR_API_KEY'}"

# 1. Check user reseller balance
def get_balance():
    payload = {
        "key": API_KEY,
        "action": "balance"
    }
    response = requests.post(API_URL, json=payload).json()
    print(f"Current Balance: {response.get('balance')} {response.get('currency')}")

# 2. Add SMM Reseller order
def add_order(service_id, link, qty):
    payload = {
        "key": API_KEY,
        "action": "add",
        "service": service_id,
        "link": link,
        "quantity": qty
    }
    response = requests.post(API_URL, json=payload).json()
    if "error" in response:
        print("Failure:", response["error"])
    else:
        print("Success! Order placed ID:", response["order"])

get_balance()`
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto" id="developer-api-panel">
      {/* Header section with brand credentials */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <Key className="text-indigo-600 dark:text-indigo-400" size={32} />
            Developer API Keys
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Automate SMM operations by integrating our premium panel endpoints with your own applications and portals.
          </p>
        </div>
        
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/15 rounded-xl border border-indigo-100 dark:border-indigo-800 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
          <Lock size={14} />
          SSL secure HTTPS endpoints verified
        </div>
      </div>

      {/* Primary grid containing key management list and generation interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* API Key Generation Widget */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-850 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-4 flex items-center gap-2">
              <Plus size={18} className="text-indigo-600" />
              Generate API Key
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Create a unique key to authorize reseller scripts. Every credential hashes on save and exposes itself ONLY ONCE to ensure security.
            </p>

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                  Key Label / Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Master Reseller Token"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  disabled={isGenerating}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-medium text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full py-3 bg-[rgb(42,0,255)] hover:bg-opacity-90 disabled:bg-indigo-400 text-white rounded-xl font-bold uppercase tracking-wide text-xs shadow-sm flex items-center justify-center gap-2 border border-white hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                style={{ color: '#ffffff', borderColor: '#ffffff', backgroundColor: '#2a00ff' }}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    Generating secure credential...
                  </>
                ) : (
                  <>
                    <Key size={14} />
                    Generate Key
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Security Best Practices card */}
          <div className="bg-amber-500/10 rounded-2xl border border-amber-500/25 p-5">
            <div className="flex gap-3">
              <ShieldAlert className="text-amber-600 shrink-0" size={20} />
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Security Precautions
                </h4>
                <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-3">
                  <li>Never push live cleartext API tokens to public Git platforms or client-side Javascript.</li>
                  <li>Incorporate environment variables to encrypt and handle credentials securely on backends.</li>
                  <li>Immediately revoke the key if you suspect it was leaked or exposed.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Existing Keys Management Workspace */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-850 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-850 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2.5">
                <Compass className="text-indigo-600" size={18} />
                Active Credentials & Keys
              </h2>
              <button 
                onClick={fetchKeys}
                disabled={loading}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-630 transition-all"
                title="Refresh Keys"
              >
                <RefreshCw size={14} className={loading ? "animate-spin text-indigo-600" : ""} />
              </button>
            </div>

            {loading && keys.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <RefreshCw className="animate-spin text-indigo-500 mb-3" size={24} />
                <span className="text-xs font-medium">Refreshing developer accounts...</span>
              </div>
            ) : keys.length === 0 ? (
              <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-3">
                  <Key size={20} className="text-indigo-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">No API keys generated yet</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
                  Create your first customized token to connect other panels or client setups securely.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-900/10 border-b border-slate-150 dark:border-slate-850">
                      <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Label</th>
                      <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Masked Credential</th>
                      <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Created At</th>
                      <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last Used</th>
                      <th className="px-6 py-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr 
                        key={key.id} 
                        className="border-b border-slate-150 dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all font-medium text-slate-700 dark:text-slate-350"
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 dark:text-white">{key.name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <code className="bg-slate-100 dark:bg-slate-950 px-2 py-1 rounded text-indigo-500 font-mono text-[11px] tracking-wide">
                            {key.masked_key}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{formatDate(key.created_at)}</td>
                        <td className="px-6 py-4 text-slate-500">
                          {key.last_used_at ? (
                            <span className="text-emerald-500 font-semibold">{formatDate(key.last_used_at)}</span>
                          ) : (
                            <span className="text-slate-400 italic">Never</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleRevokeKey(key.id)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-all"
                            title="Revoke and destroy API Key"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Newly Generated API Token Display Overlay Context */}
      {newKeyData && (
        <div className="bg-indigo-900/20 rounded-2xl border-2 border-indigo-500/50 p-6 shadow-lg animate-pulse-once relative overflow-hidden">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
          
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-400">
              <Lock size={20} />
            </div>

            <div className="space-y-4 w-full">
              <div>
                <h3 className="text-sm font-black uppercase text-indigo-400 tracking-wider">
                  Copy Your API Key Credentials Now
                </h3>
                <p className="text-xs text-indigo-200/80 mt-1 max-w-2xl leading-relaxed">
                  For strict system security, this cleartext API credential hashes on closure. <strong>You will not be able to view this key again.</strong> Store it securely in your local environment variables.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch max-w-3xl">
                <div className="flex-1 px-4 py-3 rounded-xl bg-slate-950 font-mono text-sm text-indigo-300 font-bold tracking-wide break-all border border-indigo-500/25 flex items-center justify-between">
                  <span>{newKeyData.key}</span>
                </div>
                <button
                  onClick={handleCopyNewKey}
                  className="px-5 py-3 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
                >
                  {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                  {copiedKey ? 'Copied Key!' : 'Copy Key'}
                </button>
              </div>

              <div>
                <button
                  onClick={() => setNewKeyData(null)}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 uppercase tracking-wider mt-1 transition-all"
                >
                  I've copies and recorded this key, close safety window
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Endpoint Integration Manual / Developers Guide */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 text-white space-y-6 shadow-sm">
        <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2.5 border-b border-slate-800 pb-4">
          <BookOpen className="text-indigo-400" size={22} />
          Reseller Integrators API Documentation (v2)
        </h2>

        {/* Informative Table and Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-medium text-slate-300">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">API Gateway URI</span>
            <p className="font-mono text-indigo-400 text-sm font-black break-all">https://{window.location.host}/api/v2</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Request Authentication</span>
            <p className="text-slate-200">Inject custom body parameters <code className="bg-slate-950 text-indigo-300 px-1 py-0.5 rounded font-mono">"key": "YOUR_KEY"</code></p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Default Formatting</span>
            <p className="text-slate-200">Unified REST payload returning JSON structures</p>
          </div>
        </div>

        {/* Detailed action list documentation */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider">Supported Endpoint Routines</h3>
          
          <div className="space-y-3">
            {/* Balance endpoint block */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold text-[10px] uppercase">POST / GET</span>
                  <span className="font-bold text-slate-200 font-mono text-[13px]">action: "balance"</span>
                </div>
                <p className="text-xs text-slate-400">Check current reseller account balance and native currency coordinates.</p>
              </div>
              <div className="text-right font-mono text-[11px] text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-900">
                Returns: <span className="text-indigo-400">{"{\"balance\": \"2400.1234\", \"currency\": \"BDT\"}"}</span>
              </div>
            </div>

            {/* Services endpoint block */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold text-[10px] uppercase">POST / GET</span>
                  <span className="font-bold text-slate-200 font-mono text-[13px]">action: "services"</span>
                </div>
                <p className="text-xs text-slate-400">View list of active SMM services, pricing rates, and order thresholds.</p>
              </div>
              <div className="text-right font-mono text-[11px] text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-900">
                Returns: <span className="text-indigo-400">{"[{\"service\": \"1\", \"name\": \"...\", \"rate\": \"...\"}]"}</span>
              </div>
            </div>

            {/* Add order endpoint block */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded font-bold text-[10px] uppercase">POST</span>
                  <span className="font-bold text-slate-200 font-mono text-[13px]">action: "add"</span>
                </div>
                <p className="text-xs text-slate-400">Create a new service order automatically. (Requires: `service`, `link`, `quantity` Parameters)</p>
              </div>
              <div className="text-right font-mono text-[11px] text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-900">
                Returns: <span className="text-indigo-400">{"{\"order\": 18320}"}</span>
              </div>
            </div>

            {/* Track status endpoint block */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold text-[10px] uppercase">POST / GET</span>
                  <span className="font-bold text-slate-200 font-mono text-[13px]">action: "status"</span>
                </div>
                <p className="text-xs text-slate-400">Check active order updates. Supply param `order` for single search, or `orders` (comma-separated list for batch query).</p>
              </div>
              <div className="text-right font-mono text-[11px] text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-900">
                Returns: <span className="text-indigo-400">{"{\"status\": \"Completed\", \"remains\": \"0\"}"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Code Playgrounds and Code Snippets */}
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-slate-950 px-4 py-2 rounded-xl border border-slate-850">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <Terminal size={14} className="text-indigo-400" />
              Integration Playground Snippets
            </h3>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveLang('curl')}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${activeLang === 'curl' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
              >
                cURL
              </button>
              <button
                onClick={() => setActiveLang('node')}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${activeLang === 'node' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
              >
                Node.js
              </button>
              <button
                onClick={() => setActiveLang('python')}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${activeLang === 'python' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
              >
                Python
              </button>
            </div>
          </div>

          <pre className="p-4 bg-slate-950 text-indigo-300 font-mono text-xs rounded-xl overflow-x-auto border border-slate-850 select-all leading-relaxed whitespace-pre-wrap max-h-80">
            {codeSnippets[activeLang]}
          </pre>
        </div>
      </div>
    </div>
  );
}
