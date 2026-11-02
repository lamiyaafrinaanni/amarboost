import React from 'react';
import { ShoppingCart, Key, Activity } from 'lucide-react';
import NewOrder from './NewOrder';
import DeveloperApiKeys from './DeveloperApiKeys';
import OrderTracker from './OrderTracker';

export default function ResellerDashboard({ user, services, balance, orders, token, onUpdate }: { user: any, services: any[], balance: number, orders: any[], token: string, onUpdate: () => void }) {
  const [activeTab, setActiveTab] = React.useState<'order' | 'tracker' | 'api'>('order');
  const [providerBalance, setProviderBalance] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetch('/api/provider/balance', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setProviderBalance(data.balance))
      .catch(console.error);
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 text-white p-5 rounded-2xl border border-slate-700/60 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">User Balance</h3>
          <p className="text-2xl font-black text-white mt-0.5">${balance.toFixed(2)}</p>
        </div>
        <div className="sm:text-right">
          <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Provider Balance</h3>
          <p className="text-2xl font-black text-emerald-400 mt-0.5">${providerBalance !== null && !isNaN(providerBalance) ? providerBalance.toFixed(2) : '---'}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button 
          onClick={() => setActiveTab('order')} 
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'order' 
              ? 'bg-indigo-600 text-white shadow-xs' 
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <ShoppingCart size={15} /> Place Order
        </button>
        <button 
          onClick={() => setActiveTab('tracker')} 
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'tracker' 
              ? 'bg-indigo-600 text-white shadow-xs' 
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Activity size={15} /> Order Tracker
        </button>
        <button 
          onClick={() => setActiveTab('api')} 
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'api' 
              ? 'bg-indigo-600 text-white shadow-xs' 
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Key size={15} /> API Keys
        </button>
      </div>

      {activeTab === 'order' && <NewOrder services={services} balance={balance} onOrderPlaced={onUpdate} token={token} onClearInitial={() => {}} />}
      {activeTab === 'tracker' && <OrderTracker orders={orders} services={services} token={token} onUpdate={onUpdate} />}
      {activeTab === 'api' && <DeveloperApiKeys token={token} />}
    </div>
  );
}
