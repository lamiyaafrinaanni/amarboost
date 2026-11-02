import React, { useState, useEffect } from 'react';
import { 
  Search, RefreshCw, CheckCircle2, Clock, AlertTriangle, XCircle, MessageCircle,
  ExternalLink, Copy, Check, ArrowRight, Activity, Zap, Shield, Sparkles, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

interface OrderItem {
  id: number;
  service_id?: number;
  provider_order_id?: number | null;
  link: string;
  quantity: number;
  charge: number;
  status: string;
  remains?: string | number | null;
  start_count?: string | number | null;
  created_at: string;
  service_name?: string;
  service_category?: string;
  note?: string | null;
}

interface TrackedOrderDetails {
  id: number;
  provider_order_id?: number | null;
  service_id: number;
  service_name: string;
  service_category: string;
  link: string;
  quantity: number;
  charge: number;
  status: string;
  remains: string;
  start_count: string;
  created_at: string;
  delivered: number;
  progress_percent: number;
  method_used?: string;
  note?: string | null;
}

interface OrderTrackerProps {
  orders?: OrderItem[];
  services?: any[];
  token?: string | null;
  onUpdate?: () => void;
  initialOrderId?: string | number | null;
}

export const OrderTracker: React.FC<OrderTrackerProps> = ({
  orders = [],
  services = [],
  token,
  onUpdate,
  initialOrderId
}) => {
  const [searchId, setSearchId] = useState<string>(initialOrderId ? String(initialOrderId) : '');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrderDetails | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isMultiSyncing, setIsMultiSyncing] = useState<boolean>(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [localOrders, setLocalOrders] = useState<OrderItem[]>(orders);
  const [note, setNote] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  useEffect(() => {
    if (trackedOrder) {
      setNote(trackedOrder.note || '');
    }
  }, [trackedOrder]);

  const handleSaveNote = async () => {
    if (!trackedOrder) return;
    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/orders/${trackedOrder.id}/note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ note })
      });
      if (res.ok) {
        toast.success('Note saved!');
        setTrackedOrder(prev => prev ? { ...prev, note } : null);
      } else {
        toast.error('Failed to save note');
      }
    } catch (err) {
      toast.error('Error saving note');
    } finally {
      setIsSavingNote(false);
    }
  };


  useEffect(() => {
    setLocalOrders(orders || []);
  }, [orders]);

  useEffect(() => {
    if (initialOrderId) {
      handleTrackById(String(initialOrderId));
    }
  }, [initialOrderId]);

  const handleTrackById = async (idToTrack?: string) => {
    const targetId = (idToTrack || searchId).trim();
    if (!targetId) {
      toast.error('Please enter an Order ID to track');
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch('/api/orders/track-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ order_id: targetId })
      });

      const data = await res.json();
      if (res.ok && data.success && data.order) {
        setTrackedOrder(data.order);
        toast.success(`Tracked Order #${data.order.id} via $api->status()`);
        // Update item in local orders list if it exists
        setLocalOrders(prev => prev.map(o => o.id === data.order.id ? {
          ...o,
          status: data.order.status,
          remains: data.order.remains,
          start_count: data.order.start_count,
          charge: data.order.charge
        } : o));
        if (onUpdate) onUpdate();
      } else {
        toast.error(data.error || `Order #${targetId} not found`);
        setTrackedOrder(null);
      }
    } catch (err: any) {
      console.error('Error tracking order:', err);
      toast.error('Network error while tracking order status');
    } finally {
      setIsSearching(false);
    }
  };

  const handleMultiStatusSync = async (specificIds?: number[]) => {
    if (!token) {
      toast.error('Please log in to batch synchronize order statuses');
      return;
    }

    setIsMultiSyncing(true);
    try {
      const bodyPayload = specificIds && specificIds.length > 0 
        ? { order_ids: specificIds } 
        : { order_ids: selectedOrderIds.length > 0 ? selectedOrderIds : undefined };

      const res = await fetch('/api/orders/multi-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Synchronized ${data.count} orders via $api->multiStatus()!`);
        if (data.orders && Array.isArray(data.orders)) {
          setLocalOrders(data.orders);
          // Update tracked order if it was in the synced list
          if (trackedOrder) {
            const updatedCurrent = data.orders.find((o: any) => o.id === trackedOrder.id);
            if (updatedCurrent) {
              const qty = updatedCurrent.quantity || 1;
              const rem = parseInt(updatedCurrent.remains ?? qty);
              const del = Math.max(0, qty - (isNaN(rem) ? 0 : rem));
              setTrackedOrder({
                ...trackedOrder,
                status: updatedCurrent.status,
                remains: String(updatedCurrent.remains ?? '0'),
                start_count: String(updatedCurrent.start_count ?? '0'),
                delivered: del,
                progress_percent: Math.min(100, Math.round((del / qty) * 100))
              });
            }
          }
        }
        setSelectedOrderIds([]);
        if (onUpdate) onUpdate();
      } else {
        toast.error(data.error || 'Failed to sync multiple orders');
      }
    } catch (err: any) {
      console.error('Error syncing multi-status:', err);
      toast.error('Network error during multi-status sync');
    } finally {
      setIsMultiSyncing(false);
    }
  };

  const toggleSelectOrder = (id: number) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const filtered = getFilteredOrders();
    if (selectedOrderIds.length === filtered.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filtered.map(o => o.id));
    }
  };

  const getFilteredOrders = () => {
    return localOrders.filter(order => {
      if (statusFilter === 'all') return true;
      const s = (order.status || '').toLowerCase().replace(' ', '_');
      if (statusFilter === 'inprogress') return ['inprogress', 'processing'].includes(s);
      if (statusFilter === 'completed') return ['completed', 'success'].includes(s);
      if (statusFilter === 'pending') return s === 'pending';
      if (statusFilter === 'canceled') return ['canceled', 'cancelled', 'fail', 'failed'].includes(s);
      return s === statusFilter;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase().replace(' ', '_');
    if (['completed', 'success'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          <CheckCircle2 size={12} className="text-emerald-500" />
          Completed
        </span>
      );
    }
    if (['inprogress', 'processing'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          {s === 'processing' ? 'Processing' : 'In Progress'}
        </span>
      );
    }
    if (['pending'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
          <Clock size={12} className="text-amber-500" />
          Pending
        </span>
      );
    }
    if (['canceled', 'cancelled', 'fail', 'failed'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
          <XCircle size={12} className="text-rose-500" />
          Canceled
        </span>
      );
    }
    if (['partial'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
          <AlertTriangle size={12} className="text-purple-500" />
          Partial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 uppercase">
        {status || 'Unknown'}
      </span>
    );
  };

  const filteredOrders = getFilteredOrders();

  return (
    <div id="order-tracker-container" className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Lookup Input */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold uppercase tracking-wider text-indigo-100">
            <Activity size={14} className="text-indigo-200" />
            Real-Time Order Tracking Engine
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Track Order Status
          </h1>
          <p className="text-indigo-100/90 text-sm leading-relaxed">
            Enter an Order ID to fetch live status, charge, remains, and start count using standard SMM provider methods (<code className="bg-black/20 px-1.5 py-0.5 rounded font-mono text-xs">$api-&gt;status()</code> &amp; <code className="bg-black/20 px-1.5 py-0.5 rounded font-mono text-xs">$api-&gt;multiStatus()</code>).
          </p>

          {/* Search Box */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleTrackById(); }}
            className="pt-2 flex flex-col sm:flex-row gap-2.5"
          >
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                id="order-tracker-search-input"
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder={localOrders.length > 0 ? `Enter Order ID (e.g. ${localOrders.slice(0, 3).map(o => o.id).join(', ')})...` : "Enter Order ID (e.g. 1, 101)..."}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white text-slate-900 placeholder-slate-400 text-sm font-semibold shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
              />
            </div>
            <button
              id="order-tracker-submit-button"
              type="submit"
              disabled={isSearching}
              className="px-7 py-3.5 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-75 shrink-0"
            >
              {isSearching ? (
                <>
                  <RefreshCw size={16} className="animate-spin text-indigo-400" />
                  <span>Tracking...</span>
                </>
              ) : (
                <>
                  <Activity size={16} className="text-indigo-400" />
                  <span>Track Status</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Order Chips */}
          {localOrders.length > 0 && (
            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-indigo-200 font-medium">Quick Track:</span>
              {localOrders.slice(0, 5).map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setSearchId(String(o.id));
                    handleTrackById(String(o.id));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white font-mono transition-all flex items-center gap-1 cursor-pointer"
                >
                  #{o.id}
                  <span className="text-[10px] opacity-75">({o.status})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Order Detail Result Card */}
      <AnimatePresence>
        {trackedOrder && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">
                    Order #{trackedOrder.id}
                  </h2>
                  {getStatusBadge(trackedOrder.status)}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[11px] font-mono font-bold">
                    $api-&gt;status()
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Service: <span className="font-semibold text-slate-800 dark:text-slate-200">{trackedOrder.service_name}</span> &bull; Placed on {new Date(trackedOrder.created_at).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTrackById(String(trackedOrder.id))}
                  disabled={isSearching}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw size={13} className={isSearching ? 'animate-spin text-indigo-500' : ''} />
                  Refresh
                </button>
                <button
                  onClick={() => setTrackedOrder(null)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>

            {/* 4 Key Metrics Display: Charge, Start Count, Remains, Quantity */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Charge */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
                  Charge
                </span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  ৳{parseFloat(String(trackedOrder.charge || 0)).toFixed(2)}
                </span>
                <span className="text-[11px] text-emerald-700/80 dark:text-emerald-500/80 block mt-1">
                  Deducted from balance
                </span>
              </div>

              {/* Start Count */}
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                <span className="text-[11px] uppercase tracking-wider font-bold text-blue-700 dark:text-blue-400 block mb-1">
                  Start Count
                </span>
                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                  {parseInt(String(trackedOrder.start_count || 0)).toLocaleString()}
                </span>
                <span className="text-[11px] text-blue-700/80 dark:text-blue-500/80 block mt-1">
                  Initial counter level
                </span>
              </div>

              {/* Remains */}
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                <span className="text-[11px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400 block mb-1">
                  Remains
                </span>
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {parseInt(String(trackedOrder.remains || 0)).toLocaleString()}
                </span>
                <span className="text-[11px] text-amber-700/80 dark:text-amber-500/80 block mt-1">
                  Still pending delivery
                </span>
              </div>

              {/* Ordered Quantity */}
              <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40">
                <span className="text-[11px] uppercase tracking-wider font-bold text-purple-700 dark:text-purple-400 block mb-1">
                  Total Quantity
                </span>
                <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                  {trackedOrder.quantity.toLocaleString()}
                </span>
                <span className="text-[11px] text-purple-700/80 dark:text-purple-500/80 block mt-1">
                  Delivered: {trackedOrder.delivered.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Delivery Progress Bar */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Zap size={14} className="text-indigo-500" />
                  Delivery Progress
                </span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {trackedOrder.progress_percent}% ({trackedOrder.delivered.toLocaleString()} / {trackedOrder.quantity.toLocaleString()})
                </span>
              </div>
              <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${trackedOrder.progress_percent}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    trackedOrder.status === 'completed'
                      ? 'bg-emerald-500'
                      : trackedOrder.status === 'canceled'
                      ? 'bg-rose-500'
                      : 'bg-indigo-600'
                  }`}
                />
              </div>
            </div>

            {/* Order Note */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <MessageCircle size={14} className="text-indigo-500" />
                Support Note
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add instructions for support..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={isSavingNote}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all"
                >
                  {isSavingNote ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* Target Link Box */}
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
              <div className="min-w-0 flex-1">
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold block">Target Destination URL</span>
                <p className="font-mono text-slate-800 dark:text-slate-200 truncate mt-0.5">
                  {trackedOrder.link}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(trackedOrder.link)}
                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                  title="Copy Link"
                >
                  {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
                <a
                  href={trackedOrder.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all"
                  title="Open Link"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Orders List with Multi-Status ($api->multiStatus()) Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Recent Orders Statuses
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                $api-&gt;multiStatus()
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live status overview displaying charge, start count, and remains for your recent orders.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {['all', 'inprogress', 'pending', 'completed', 'canceled'].map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab === 'all' ? 'All' : tab === 'inprogress' ? 'In Progress' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Batch MultiStatus Sync Button */}
            <button
              id="multi-status-sync-button"
              type="button"
              onClick={() => handleMultiStatusSync()}
              disabled={isMultiSyncing}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 transition-all shadow cursor-pointer disabled:opacity-75"
              title="Synchronize all recent orders in a single request using $api->multiStatus()"
            >
              <RefreshCw size={13} className={isMultiSyncing ? 'animate-spin' : ''} />
              <span>{selectedOrderIds.length > 0 ? `Sync Selected (${selectedOrderIds.length})` : 'Sync All ($api->multiStatus)'}</span>
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <Activity size={32} className="mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold">No orders found matching the filter</p>
              <p className="text-xs">Place an order or check another status category.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 uppercase font-black text-[10px] tracking-wider">
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.length > 0 && selectedOrderIds.length === filteredOrders.length}
                      onChange={selectAllFiltered}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="py-3 px-3">Order ID</th>
                  <th className="py-3 px-3">Service</th>
                  <th className="py-3 px-3">Quantity</th>
                  <th className="py-3 px-3">Charge</th>
                  <th className="py-3 px-3">Start Count</th>
                  <th className="py-3 px-3">Remains</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredOrders.map(order => {
                  const service = services.find(s => String(s.service || s.id) === String(order.service_id));
                  const isSelected = selectedOrderIds.includes(order.id);
                  const remainsVal = order.remains !== undefined && order.remains !== null ? String(order.remains) : String(order.quantity);
                  const startCountVal = order.start_count !== undefined && order.start_count !== null ? String(order.start_count) : '0';

                  return (
                    <tr 
                      key={order.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        #{order.id}
                      </td>
                      <td className="py-3.5 px-3 max-w-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate" title={service?.name || order.service_name || `Service #${order.service_id}`}>
                          {service?.name || order.service_name || `Service #${order.service_id}`}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 truncate block">
                          {order.link}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {order.quantity.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ৳{parseFloat(String(order.charge || 0)).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-3 font-mono text-blue-600 dark:text-blue-400 font-semibold">
                        {parseInt(startCountVal).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        {parseInt(remainsVal).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchId(String(order.id));
                            handleTrackById(String(order.id));
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-200 font-bold text-[11px] inline-flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Activity size={12} />
                          <span>Track</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderTracker;
