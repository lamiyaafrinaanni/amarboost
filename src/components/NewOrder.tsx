import React, { useState } from 'react';
import { ShoppingCart, CheckCircle2, Loader2, Link as LinkIcon, Hash, Send, ChevronRight, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';

interface Service {
  service_id: number;
  name: string;
  category: string;
  rate: string;
  min_quantity: number;
  max_quantity: number;
}

interface NewOrderProps {
  services: Service[];
  balance: number;
  onOrderPlaced: () => void;
  token: string;
  initialServiceId?: string | number | null;
  onClearInitial: () => void;
}

const NewOrder: React.FC<NewOrderProps> = ({ services, balance, onOrderPlaced, token, initialServiceId, onClearInitial }) => {
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<string>(initialServiceId ? String(initialServiceId) : '');
  const [link, setLink] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [trackedOrder, setTrackedOrder] = useState<any>(null);

  React.useEffect(() => {
    if (initialServiceId) {
      onClearInitial();
    }
  }, []);

  const trackOrder = async (orderId: string | number) => {
    try {
      const response = await fetch('/api/orders/track-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId })
      });
      const data = await response.json();
      if (data.success) {
        setTrackedOrder(data.order);
      }
    } catch (err) {
      console.error("Tracking failed:", err);
    }
  };

  const handlePlaceOrder = async () => {
    const qty = parseInt(quantity);
    const service = services.find(s => String(s.service_id) === serviceId);

    if (!serviceId || !link || !quantity || !service) {
      toast.error("Please fill in all details.");
      return;
    }

    if (qty < service.min_quantity || qty > service.max_quantity) {
      toast.error(`Quantity must be between ${service.min_quantity} and ${service.max_quantity}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ serviceId, link, quantity: qty })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success("Order placed successfully!");
        onOrderPlaced();
        if (data.orderId) {
          trackOrder(data.orderId);
        }
        setStep(3); // Go to confirmation
      } else {
        toast.error(data.error || "Failed to place order.");
      }
    } catch (err) {
      toast.error("An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedService = services.find(s => String(s.service_id) === serviceId);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <ShoppingCart className="text-indigo-600" />
        New Order (Step {step} of 3)
      </h2>

      {/* Stepper Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex-1 h-2 rounded-full ${s <= step ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <label className="block text-sm font-semibold mb-1">Select Service</label>
          <select 
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select a service</option>
            {services.map(s => (
              <option key={s.service_id} value={s.service_id}>{s.name} - ৳{s.rate}</option>
            ))}
          </select>
          <button 
            disabled={!serviceId}
            onClick={() => setStep(2)}
            className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            Next <ChevronRight size={18} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Link</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://example.com/..."
                className="w-full p-3 pl-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Quantity</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="number" 
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 100"
                className="w-full p-3 pl-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg font-bold hover:bg-slate-200">Back</button>
            <button 
              disabled={isSubmitting || !link || !quantity}
              onClick={handlePlaceOrder}
              className="flex-1 p-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'Confirm Order'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center space-y-4">
          <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
          <h3 className="text-lg font-bold">Order Confirmed!</h3>
          {trackedOrder && (
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-left text-sm space-y-2">
              <p>Status: <span className="font-bold">{trackedOrder.status}</span></p>
              <p>Remains: <span className="font-bold">{trackedOrder.remains}</span></p>
              <p>Charge: <span className="font-bold">৳{trackedOrder.charge}</span></p>
            </div>
          )}
          <button 
            onClick={() => { setStep(1); setServiceId(''); setLink(''); setQuantity(''); setTrackedOrder(null); }}
            className="w-full p-3 bg-indigo-600 text-white rounded-lg font-bold"
          >
            Place Another Order
          </button>
        </div>
      )}
    </div>
  );
};

export default NewOrder;
