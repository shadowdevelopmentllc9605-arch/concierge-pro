import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Monitor, Loader2, Package } from 'lucide-react';
import { getVendorContext } from '@/lib/vendorContext';

export default function MirrorDisplay() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  const [room, setRoom] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const context = await getVendorContext();
      if (!context.businessId || !roomId) return;
      const [rooms, items] = await Promise.all([
        base44.entities.FittingRoom.filter({ id: roomId, business_id: context.businessId }),
        base44.entities.InventoryItem.filter({ business_id: context.businessId })
      ]);
      setRoom(rooms[0] || null);
      setInventory(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [roomId]);

  const suggested = useMemo(() => {
    const ids = new Set(room?.suggested_items || []);
    return inventory.filter(item => ids.has(item.id));
  }, [room, inventory]);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-white" /></div>;

  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-10">
          <Monitor className="w-8 h-8 text-violet-400" />
          <div>
            <h1 className="text-3xl font-light">Fitting Room {room?.room_number || ''}</h1>
            <p className="text-white/50">Suggestions from your store associate</p>
          </div>
        </div>

        {suggested.length === 0 ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-white/50">
            <Package className="w-16 h-16 mb-4 opacity-40" />
            <p className="text-xl">No suggestions are queued yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
            {suggested.map(item => (
              <div key={item.id} className="rounded-3xl overflow-hidden bg-white/10 border border-white/10">
                <div className="aspect-[3/4] bg-white/5">
                  {item.images?.[0]
                    ? <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-white/30" /></div>
                  }
                </div>
                <div className="p-5">
                  <p className="text-xl font-medium">{item.name}</p>
                  {item.brand && <p className="text-white/60 mt-1">{item.brand}</p>}
                  <p className="text-violet-300 font-semibold mt-2">${Number(item.price || 0).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
