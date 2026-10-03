import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { DoorOpen, User, Package, Plus, Trash2, Monitor, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getVendorContext } from '@/lib/vendorContext';

export default function FittingRooms() {
  const [rooms, setRooms] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [canManageRooms, setCanManageRooms] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const context = await getVendorContext();
      setBusinessId(context.businessId);
      setCanManageRooms(context.isManager);

      if (!context.businessId) {
        setRooms([]);
        setCustomers([]);
        setInventory([]);
        return;
      }

      const [roomsData, customersData, inventoryData] = await Promise.all([
        base44.entities.FittingRoom.filter({ business_id: context.businessId }),
        base44.entities.StoreCustomer.filter({ business_id: context.businessId }),
        base44.entities.InventoryItem.filter({ business_id: context.businessId })
      ]);
      setRooms(roomsData);
      setCustomers(customersData);
      setInventory(inventoryData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addRoom = async () => {
    if (!newRoomNumber.trim() || !businessId) return;
    try {
      await base44.entities.FittingRoom.create({
        room_number: newRoomNumber,
        status: 'available',
        business_id: businessId
      });
      setNewRoomNumber('');
      setDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const updateRoomStatus = async (roomId, status) => {
    try {
      const updates = { status };
      if (status === 'available') {
        updates.customer_id = null;
        updates.items = [];
        updates.suggested_items = [];
      }
      await base44.entities.FittingRoom.update(roomId, updates);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteRoom = async (roomId) => {
    if (!confirm('Delete this room?')) return;
    try {
      await base44.entities.FittingRoom.delete(roomId);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const getCustomer = (customerId) => customers.find(c => c.id === customerId);
  const getItem = (itemId) => inventory.find(i => i.id === itemId);

  const statusColors = {
    available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    occupied: 'bg-violet-100 text-violet-700 border-violet-200',
    cleaning: 'bg-amber-100 text-amber-700 border-amber-200'
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Fitting Rooms</h1>
            <p className="text-slate-500">{rooms.filter(r => r.status === 'available').length} available</p>
          </div>
          {canManageRooms && (
            <Button onClick={() => setDialogOpen(true)} className="bg-violet-600 hover:bg-violet-700">
              <Plus className="w-4 h-4 mr-2" /> Add Room
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => {
            const customer = getCustomer(room.customer_id);
            return (
              <Card 
                key={room.id} 
                className={`border-0 shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition ${
                  room.status === 'occupied' ? 'ring-2 ring-violet-400' : ''
                }`}
                onClick={() => setSelectedRoom(room)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <DoorOpen className="w-5 h-5" />
                      Room {room.room_number}
                    </CardTitle>
                    <Badge className={`${statusColors[room.status]} border`}>
                      {room.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {room.status === 'occupied' && customer ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        {customer.photo_url ? (
                          <img src={customer.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                            <User className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-xs text-slate-500">{room.items?.length || 0} items</p>
                        </div>
                      </div>
                      
                      {room.suggested_items?.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-violet-600">
                          <Monitor className="w-3 h-3" />
                          {room.suggested_items.length} items on mirror
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-16 flex items-center justify-center text-slate-400">
                      {room.status === 'cleaning' ? 'Being cleaned...' : 'Ready for customer'}
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(createPageUrl(`MirrorDisplay?room=${room.id}`), '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Monitor className="w-4 h-4 mr-1" /> Open Mirror Display
                    </Button>
                    {room.status === 'occupied' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
                        onClick={(e) => { e.stopPropagation(); updateRoomStatus(room.id, 'cleaning'); }}
                      >
                        Mark Cleaning
                      </Button>
                    )}
                    {room.status === 'cleaning' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
                        onClick={(e) => { e.stopPropagation(); updateRoomStatus(room.id, 'available'); }}
                      >
                        Mark Available
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-red-500"
                      onClick={(e) => { e.stopPropagation(); deleteRoom(room.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {rooms.length === 0 && (
            <Card className="col-span-full border-0 shadow-lg">
              <CardContent className="p-12 text-center">
                <DoorOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No fitting rooms configured</p>
                <Button onClick={() => setDialogOpen(true)} className="mt-4" variant="outline">
                  <Plus className="w-4 h-4 mr-2" /> Add First Room
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add Room Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Fitting Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Room number (e.g., 1, 2, A, B)"
              value={newRoomNumber}
              onChange={(e) => setNewRoomNumber(e.target.value)}
            />
            <Button onClick={addRoom} className="w-full bg-violet-600 hover:bg-violet-700" disabled={!newRoomNumber.trim()}>
              Add Room
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Detail Dialog */}
      <Dialog open={!!selectedRoom} onOpenChange={() => setSelectedRoom(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Room {selectedRoom?.room_number} Details</DialogTitle>
          </DialogHeader>
          {selectedRoom && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Status</span>
                <Badge className={`${statusColors[selectedRoom.status]} border`}>
                  {selectedRoom.status}
                </Badge>
              </div>

              {selectedRoom.customer_id && (
                <>
                  <div>
                    <p className="text-sm text-slate-500 mb-2">Customer</p>
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      {getCustomer(selectedRoom.customer_id)?.photo_url ? (
                        <img src={getCustomer(selectedRoom.customer_id).photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                          <User className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <span className="font-medium">{getCustomer(selectedRoom.customer_id)?.name}</span>
                    </div>
                  </div>

                  {selectedRoom.items?.length > 0 && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Items in Room</p>
                      <div className="space-y-2">
                        {selectedRoom.items.map((itemId, i) => {
                          const item = getItem(itemId);
                          return item ? (
                            <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                              {item.images?.[0] ? (
                                <img src={item.images[0]} alt="" className="w-10 h-10 rounded object-cover" />
                              ) : (
                                <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center">
                                  <Package className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium">{item.name}</p>
                                <p className="text-xs text-slate-500">${item.price?.toFixed(2)}</p>
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {selectedRoom.suggested_items?.length > 0 && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2 flex items-center gap-2">
                        <Monitor className="w-4 h-4" /> Displayed on Mirror
                      </p>
                      <div className="space-y-2">
                        {selectedRoom.suggested_items.map((itemId, i) => {
                          const item = getItem(itemId);
                          return item ? (
                            <div key={i} className="flex items-center gap-3 p-2 bg-violet-50 rounded-lg border border-violet-200">
                              {item.images?.[0] ? (
                                <img src={item.images[0]} alt="" className="w-10 h-10 rounded object-cover" />
                              ) : (
                                <div className="w-10 h-10 bg-violet-100 rounded flex items-center justify-center">
                                  <Package className="w-4 h-4 text-violet-400" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium">{item.name}</p>
                                <p className="text-xs text-slate-500">${item.price?.toFixed(2)}</p>
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2 pt-4">
                {selectedRoom.status === 'occupied' && (
                  <Button 
                    className="flex-1"
                    onClick={() => { updateRoomStatus(selectedRoom.id, 'cleaning'); setSelectedRoom(null); }}
                  >
                    Mark as Cleaning
                  </Button>
                )}
                {selectedRoom.status === 'cleaning' && (
                  <Button 
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { updateRoomStatus(selectedRoom.id, 'available'); setSelectedRoom(null); }}
                  >
                    Mark as Available
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}