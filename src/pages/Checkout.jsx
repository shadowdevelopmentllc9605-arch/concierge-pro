import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Search, Plus, Minus, Trash2, User, CreditCard, Banknote, Smartphone, Receipt, Loader2, Package, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

export default function Checkout() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [showSuccess, setShowSuccess] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = urlParams.get('customer');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [inventoryData, customersData] = await Promise.all([
        base44.entities.InventoryItem.list(),
        base44.entities.StoreCustomer.list()
      ]);
      setInventory(inventoryData);
      setCustomers(customersData);
      
      if (preselectedCustomerId) {
        const customer = customersData.find(c => c.id === preselectedCustomerId);
        if (customer) setSelectedCustomer(customer);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const updateQuantity = (itemId, delta) => {
    setCart(cart.map(c => {
      if (c.id === itemId) {
        const newQty = c.quantity + delta;
        return newQty > 0 ? { ...c, quantity: newQty } : c;
      }
      return c;
    }).filter(c => c.quantity > 0));
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(c => c.id !== itemId));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = subtotal * (discount / 100);
  const tax = (subtotal - discountAmount) * 0.08;
  const total = subtotal - discountAmount + tax;

  const processPayment = async () => {
    if (!selectedCustomer || cart.length === 0) return;
    
    setProcessing(true);
    try {
      const purchase = await base44.entities.Purchase.create({
        customer_id: selectedCustomer.id,
        items: cart.map(item => ({
          inventory_item_id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        subtotal,
        tax,
        discount: discountAmount,
        total,
        payment_method: paymentMethod,
        status: 'completed'
      });

      // Update inventory stock
      await Promise.all(cart.map(item =>
        base44.entities.InventoryItem.update(item.id, {
          stock_quantity: (item.stock_quantity || 0) - item.quantity
        })
      ));

      // Update customer stats
      await base44.entities.StoreCustomer.update(selectedCustomer.id, {
        total_spent: (selectedCustomer.total_spent || 0) + total,
        last_visit: new Date().toISOString()
      });

      setShowSuccess(true);
      setCart([]);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const filteredInventory = inventory.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.sku?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="grid grid-cols-1 lg:grid-cols-3 h-screen">
        {/* Products */}
        <div className="lg:col-span-2 p-6 overflow-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-4">Point of Sale</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredInventory.map((item) => (
              <Card
                key={item.id}
                className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700 transition overflow-hidden"
                onClick={() => addToCart(item)}
              >
                <div className="aspect-square relative">
                  {item.images?.[0] ? (
                    <img src={item.images[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                      <Package className="w-10 h-10 text-slate-500" />
                    </div>
                  )}
                  {item.stock_quantity <= 0 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white font-medium">Out of Stock</span>
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <p className="font-medium text-white truncate">{item.name}</p>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-lg font-bold text-emerald-400">${item.price?.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">{item.stock_quantity} left</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="bg-white flex flex-col h-screen">
          <div className="p-6 border-b">
            <h2 className="font-semibold text-lg mb-4">Current Order</h2>
            
            <Select 
              value={selectedCustomer?.id || ''} 
              onValueChange={(v) => setSelectedCustomer(customers.find(c => c.id === v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-auto p-6 space-y-3">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Cart is empty</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  {item.images?.[0] ? (
                    <img src={item.images[0]} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center">
                      <Package className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-sm text-slate-500">${item.price?.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="w-7 h-7" onClick={() => updateQuantity(item.id, -1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center font-medium">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="w-7 h-7" onClick={() => updateQuantity(item.id, 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeFromCart(item.id)} className="text-red-500">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="p-6 border-t bg-slate-50">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount ({discount}%)</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Tax (8%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <Button
                variant={paymentMethod === 'credit_card' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentMethod('credit_card')}
              >
                <CreditCard className="w-4 h-4 mr-1" /> Card
              </Button>
              <Button
                variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentMethod('cash')}
              >
                <Banknote className="w-4 h-4 mr-1" /> Cash
              </Button>
              <Button
                variant={paymentMethod === 'mobile_pay' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentMethod('mobile_pay')}
              >
                <Smartphone className="w-4 h-4 mr-1" /> Mobile
              </Button>
            </div>

            <Button
              className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
              disabled={!selectedCustomer || cart.length === 0 || processing}
              onClick={processPayment}
            >
              {processing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Complete Payment
            </Button>
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="text-center">
          <div className="py-6">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10 text-emerald-600" />
            </div>
            <DialogTitle className="text-2xl mb-2">Payment Successful!</DialogTitle>
            <p className="text-slate-500 mb-6">Transaction completed for ${total.toFixed(2)}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowSuccess(false)}>
                New Order
              </Button>
              <Button className="flex-1" onClick={() => navigate(createPageUrl('Home'))}>
                Dashboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}