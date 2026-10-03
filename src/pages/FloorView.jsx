import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { MapPin, User, Package, Loader2, ZoomIn, ZoomOut, Users, Edit2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { getVendorContext } from '@/lib/vendorContext';

export default function FloorView() {
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);
  const [businessId, setBusinessId] = useState(null);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [canEditFloor, setCanEditFloor] = useState(false);

  useEffect(() => {
    let interval;

    const start = async () => {
      const id = await loadData();
      if (id) {
        interval = setInterval(() => loadCustomers(id), 5000);
      }
    };

    start();
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const loadData = async () => {
    try {
      const context = await getVendorContext();
      setBusinessId(context.businessId);
      setCurrentEmployee(context.employee);
      setCanEditFloor(context.isManager || Boolean(context.permissions.edit_floor_plan));

      if (!context.businessId) {
        setBusiness(null);
        setCustomers([]);
        setItems([]);
        return null;
      }

      const [customersData, itemsData] = await Promise.all([
        base44.entities.StoreCustomer.filter({ in_store: true, business_id: context.businessId }),
        base44.entities.InventoryItem.filter({ business_id: context.businessId })
      ]);

      setBusiness(context.business);
      setCustomers(customersData);
      setItems(itemsData);
      return context.businessId;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async (targetBusinessId = businessId) => {
    if (!targetBusinessId) return;
    try {
      const data = await base44.entities.StoreCustomer.filter({
        in_store: true,
        business_id: targetBusinessId
      });
      setCustomers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemDrag = (itemId, x, y) => {
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, floor_position: { x, y } }
        : item
    ));
  };

  const saveItemPositions = async () => {
    if (!canEditFloor) return;
    try {
      await Promise.all(
        items.filter(i => i.floor_position).map(item =>
          base44.entities.InventoryItem.update(item.id, { floor_position: item.floor_position })
        )
      );
      setEditMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  const assignToMe = async () => {
    if (!selectedCustomer || !currentEmployee?.id) return;
    if (
      selectedCustomer.assigned_employee_id &&
      selectedCustomer.assigned_employee_id !== currentEmployee.id
    ) return;
    try {
      await base44.entities.StoreCustomer.update(selectedCustomer.id, {
        assigned_employee_id: currentEmployee.id
      });
      setSelectedCustomer(prev => prev ? { ...prev, assigned_employee_id: currentEmployee.id } : prev);
      setCustomers(prev => prev.map(customer =>
        customer.id === selectedCustomer.id
          ? { ...customer, assigned_employee_id: currentEmployee.id }
          : customer
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const positionedCustomers = customers.filter(customer =>
    Number.isFinite(customer.store_position?.x) &&
    Number.isFinite(customer.store_position?.y)
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Floor View</h1>
            <p className="text-slate-500 flex items-center gap-2">
              <Users className="w-4 h-4" />
              {customers.length} customers in store
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            {canEditFloor && (
              editMode ? (
                <Button onClick={saveItemPositions} className="bg-emerald-600 hover:bg-emerald-700">
                  <Save className="w-4 h-4 mr-2" /> Save Layout
                </Button>
              ) : (
                <Button onClick={() => setEditMode(true)} variant="outline">
                  <Edit2 className="w-4 h-4 mr-2" /> Edit Layout
                </Button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Floor Plan */}
          <Card className="lg:col-span-3 border-0 shadow-xl overflow-hidden">
            <CardContent className="p-0 relative" ref={containerRef}>
              {business?.floor_plan_url ? (
                <div 
                  className="relative overflow-auto"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                >
                  <img 
                    src={business.floor_plan_url} 
                    alt="Floor Plan" 
                    className="w-full h-auto"
                    style={{ minHeight: '500px' }}
                  />
                  
                  {/* Customer pins */}
                  <AnimatePresence>
                    {positionedCustomers.map((customer) => (
                      <motion.div
                        key={customer.id}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute cursor-pointer"
                        style={{
                          left: `${customer.store_position.x}%`,
                          top: `${customer.store_position.y}%`,
                          transform: 'translate(-50%, -100%)'
                        }}
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <div className="relative">
                          <motion.div
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="absolute inset-0 bg-violet-400 rounded-full opacity-30"
                          />
                          <div className="w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center shadow-lg relative z-10">
                            {customer.photo_url ? (
                              <img src={customer.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <User className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                            <Badge className="bg-white shadow-md text-slate-700 text-xs">
                              {customer.name?.split(' ')[0]}
                            </Badge>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Item positions (in edit mode) */}
                  {editMode && items.filter(i => i.floor_position).map((item) => (
                    <div
                      key={item.id}
                      className="absolute cursor-move bg-amber-100 border-2 border-amber-400 rounded-lg p-2 shadow-lg"
                      style={{
                        left: `${item.floor_position.x}%`,
                        top: `${item.floor_position.y}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                      draggable
                      onDragEnd={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) {
                          const x = ((e.clientX - rect.left) / rect.width) * 100;
                          const y = ((e.clientY - rect.top) / rect.height) * 100;
                          handleItemDrag(item.id, Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
                        }
                      }}
                    >
                      <Package className="w-4 h-4 text-amber-700" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-96 flex flex-col items-center justify-center bg-slate-100">
                  <MapPin className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-slate-500">No floor plan uploaded</p>
                  <p className="text-sm text-slate-400">Go to Settings to add one</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer List */}
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg">In Store Now</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customers.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">No customers in store</p>
              ) : (
                customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    {customer.photo_url ? (
                      <img src={customer.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-violet-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{customer.name}</p>
                      <p className="text-xs text-slate-500">
                        {customer.assigned_employee_id ? 'Assigned' : 'Unassigned'}
                        {!Number.isFinite(customer.store_position?.x) || !Number.isFinite(customer.store_position?.y)
                          ? ' • location unavailable'
                          : ''}
                      </p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {selectedCustomer.photo_url ? (
                  <img src={selectedCustomer.photo_url} alt="" className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                    <User className="w-10 h-10 text-violet-600" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-semibold">{selectedCustomer.name}</h3>
                  <p className="text-slate-500">{selectedCustomer.email}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge>{selectedCustomer.visit_count || 0} visits</Badge>
                    <Badge variant="outline">${selectedCustomer.total_spent?.toFixed(2) || '0.00'} spent</Badge>
                  </div>
                </div>
              </div>

              {selectedCustomer.wishlist_items?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Wishlist Items</h4>
                  <div className="space-y-2">
                    {selectedCustomer.wishlist_items.map((itemId, i) => {
                      const item = items.find(record => record.id === itemId);
                      return (
                        <div key={i} className="p-2 bg-slate-50 rounded-lg text-sm">
                          {item?.name || 'Wishlist item'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-violet-600 hover:bg-violet-700"
                  onClick={assignToMe}
                  disabled={
                    !currentEmployee?.id ||
                    Boolean(
                      selectedCustomer.assigned_employee_id &&
                      selectedCustomer.assigned_employee_id !== currentEmployee.id
                    )
                  }
                >
                  {selectedCustomer.assigned_employee_id === currentEmployee?.id
                    ? 'Assigned to You'
                    : selectedCustomer.assigned_employee_id
                      ? 'Already Assigned'
                      : 'Assign to Me'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(createPageUrl(`CustomerDetail?id=${selectedCustomer.id}`))}
                >
                  View History
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}