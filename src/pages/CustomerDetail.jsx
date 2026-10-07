import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, User, ShoppingBag, Heart, Send, MapPin, Calendar, Phone, Mail, Loader2, Package, DoorOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { getVendorContext } from '@/lib/vendorContext';

export default function CustomerDetail() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [fittingRooms, setFittingRooms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [isManager, setIsManager] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const customerId = urlParams.get('id');

  useEffect(() => {
    if (customerId) loadData();
  }, [customerId]);

  const loadData = async () => {
    try {
      const context = await getVendorContext();

      if (!context.businessId) {
        setCustomer(null);
        return;
      }

      setCurrentEmployee(context.employee);
      setIsManager(context.isManager);

      const [customerMatches, purchasesData, itemsData, roomsData, employeesData] = await Promise.all([
        base44.entities.StoreCustomer.filter({ id: customerId, business_id: context.businessId }),
        base44.entities.Purchase.filter({ customer_id: customerId, business_id: context.businessId }),
        base44.entities.InventoryItem.filter({ business_id: context.businessId }),
        base44.entities.FittingRoom.filter({ business_id: context.businessId }),
        base44.entities.Employee.filter({ business_id: context.businessId })
      ]);

      const customerData = customerMatches[0] || null;
      const canWorkWithCustomer =
        context.isManager ||
        !customerData?.assigned_employee_id ||
        customerData.assigned_employee_id === context.employee?.id;

      if (!canWorkWithCustomer) {
        setCustomer(null);
        setPurchases([]);
        setWishlistItems([]);
        setFittingRooms([]);
        setEmployees([]);
        return;
      }

      setCustomer(customerData);
      setPurchases(purchasesData);
      setFittingRooms(roomsData);
      setEmployees(employeesData);

      if (customerData?.wishlist_items) {
        const wishlist = itemsData.filter(item => customerData.wishlist_items.includes(item.id));
        setWishlistItems(wishlist);
      } else {
        setWishlistItems([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const assignEmployee = async (employeeId) => {
    if (!isManager && employeeId !== currentEmployee?.id) return;
    try {
      const response = await base44.functions.invoke('assignCustomer', {
        customerId,
        employeeId
      });
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Customer assignment failed.');
      setCustomer(prev => ({ ...prev, assigned_employee_id: employeeId }));
    } catch (err) {
      console.error(err);
    }
  };

  const assignFittingRoom = async (roomNumber) => {
    try {
      const room = fittingRooms.find(r => r.room_number === roomNumber);
      if (room) {
        await base44.entities.FittingRoom.update(room.id, {
          status: 'occupied',
          customer_id: customerId,
          items: customer.wishlist_items
        });
        await base44.entities.StoreCustomer.update(customerId, { fitting_room: roomNumber });
        setCustomer(prev => ({ ...prev, fitting_room: roomNumber }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const queueMirrorSuggestion = async (itemId) => {
    if (!customer.fitting_room) return;
    try {
      const room = fittingRooms.find(r => r.room_number === customer.fitting_room);
      if (room) {
        const suggested = [...(room.suggested_items || []), itemId];
        await base44.entities.FittingRoom.update(room.id, { suggested_items: suggested });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Customer not found</p>
      </div>
    );
  }

  const assignedEmployee = employees.find(e => e.id === customer.assigned_employee_id);

  return (
    <div className="min-h-screen bg-slate-50/85 p-6">
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(createPageUrl('Customers'))} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Customers
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="border-0 shadow-xl">
            <CardContent className="p-6 text-center">
              {customer.photo_url ? (
                <img src={customer.photo_url} alt="" className="w-24 h-24 rounded-full object-cover mx-auto mb-4" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
                  <User className="w-12 h-12 text-violet-600" />
                </div>
              )}
              
              <h2 className="text-2xl font-bold text-slate-900">{customer.name}</h2>
              
              <div className="flex justify-center gap-2 mt-2">
                {customer.in_store && (
                  <Badge className="bg-emerald-100 text-emerald-700">
                    <MapPin className="w-3 h-3 mr-1" /> In Store
                  </Badge>
                )}
                {customer.total_spent >= 1000 && (
                  <Badge className="bg-amber-100 text-amber-700">VIP</Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6 py-4 border-y">
                <div>
                  <p className="text-2xl font-bold">{customer.visit_count || 0}</p>
                  <p className="text-xs text-slate-500">Visits</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">${customer.total_spent?.toFixed(0) || 0}</p>
                  <p className="text-xs text-slate-500">Spent</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{wishlistItems.length}</p>
                  <p className="text-xs text-slate-500">Wishlist</p>
                </div>
              </div>

              <div className="space-y-2 mt-4 text-left">
                {customer.email && (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail className="w-4 h-4" /> {customer.email}
                  </p>
                )}
                {customer.phone && (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="w-4 h-4" /> {customer.phone}
                  </p>
                )}
                {customer.birthday && (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4" /> {format(new Date(customer.birthday), 'MMM d')}
                  </p>
                )}
              </div>

              {/* Assign Employee */}
              <div className="mt-6">
                <p className="text-sm text-slate-500 mb-2">Assigned To</p>
                {isManager ? (
                  <Select value={customer.assigned_employee_id || ''} onValueChange={assignEmployee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : customer.assigned_employee_id === currentEmployee?.id ? (
                  <Badge className="bg-emerald-100 text-emerald-700">Assigned to you</Badge>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => currentEmployee?.id && assignEmployee(currentEmployee.id)}
                    disabled={!currentEmployee?.id}
                  >
                    Assign to me
                  </Button>
                )}
              </div>

              {/* Fitting Room */}
              {customer.in_store && (
                <div className="mt-4">
                  <p className="text-sm text-slate-500 mb-2">Fitting Room</p>
                  {customer.fitting_room ? (
                    <Badge className="bg-violet-100 text-violet-700 text-lg px-4 py-2">
                      <DoorOpen className="w-4 h-4 mr-2" /> Room {customer.fitting_room}
                    </Badge>
                  ) : (
                    <Select onValueChange={assignFittingRoom}>
                      <SelectTrigger>
                        <SelectValue placeholder="Assign fitting room" />
                      </SelectTrigger>
                      <SelectContent>
                        {fittingRooms.filter(room => room.status === 'available').map(room => (
                          <SelectItem key={room.id} value={room.room_number}>Room {room.room_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Wishlist */}
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-rose-500" /> Store Wishlist Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                {wishlistItems.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">No wishlist items</p>
                ) : (
                  <div className="space-y-3">
                    {wishlistItems.map(item => (
                      <div key={item.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                        {item.images?.[0] ? (
                          <img src={item.images[0]} alt="" className="w-16 h-16 rounded-lg object-cover" />
                        ) : (
                          <div className="w-16 h-16 bg-slate-200 rounded-lg flex items-center justify-center">
                            <Package className="w-6 h-6 text-slate-400" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{item.name}</p>
                            {customer.try_on_request_items?.includes(item.id) && (
                              <Badge className="bg-violet-100 text-violet-700">Requested now</Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">${item.price?.toFixed(2)}</p>
                          {item.sizes && (
                            <p className="text-xs text-slate-400">{item.sizes.join(', ')}</p>
                          )}
                        </div>
                        {customer.fitting_room && (
                          <Button size="sm" variant="outline" onClick={() => queueMirrorSuggestion(item.id)}>
                            <Send className="w-3 h-3 mr-1" /> Add to Mirror Queue
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Purchase History */}
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-violet-500" /> Purchase History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {purchases.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">No purchases yet</p>
                ) : (
                  <div className="space-y-3">
                    {purchases.map(purchase => (
                      <div key={purchase.id} className="p-4 bg-slate-50 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm text-slate-500">
                            {format(new Date(purchase.created_date), 'MMM d, yyyy')}
                          </p>
                          <p className="font-semibold">${purchase.total?.toFixed(2)}</p>
                        </div>
                        <div className="space-y-1">
                          {purchase.items?.map((item, i) => (
                            <p key={i} className="text-sm">
                              {item.quantity}x {item.name} - ${item.price?.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="flex gap-3">
              <Button 
                className="flex-1 bg-violet-600 hover:bg-violet-700"
                onClick={() => navigate(createPageUrl(`Checkout?customer=${customerId}`))}
              >
                <ShoppingBag className="w-4 h-4 mr-2" /> Start Checkout
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}