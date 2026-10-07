import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Search, Plus, Minus, User, CreditCard, Banknote, Smartphone, Receipt, Loader2, Package, X, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { getVendorContext } from '@/lib/vendorContext';

export default function Checkout() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [discount, setDiscount] = useState(0);
  const [business, setBusiness] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [paymentError, setPaymentError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSaleTotal, setLastSaleTotal] = useState(0);
  const [locationTaxRate, setLocationTaxRate] = useState(null);
  const [saleRequestId, setSaleRequestId] = useState(() => crypto.randomUUID());

  const resetSaleRequest = () => setSaleRequestId(crypto.randomUUID());

  const urlParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = urlParams.get('customer');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const context = await getVendorContext();
      setBusiness(context.business);
      setEmployee(context.employee);

      if (!context.businessId) {
        setInventory([]);
        setCustomers([]);
        return;
      }

      const [inventoryData, customersData] = await Promise.all([
        base44.entities.InventoryItem.filter({ business_id: context.businessId }),
        base44.entities.StoreCustomer.filter({ business_id: context.businessId })
      ]);
      setInventory(inventoryData);
      setCustomers(customersData);

      const defaultLocationId =
        context.employee?.location_id ||
        context.business?.default_location_id ||
        '';
      if (defaultLocationId) {
        const locations = await base44.entities.BusinessLocation.filter({
          id: defaultLocationId,
          business_id: context.businessId
        });
        setLocationTaxRate(Number(locations[0]?.tax_rate ?? 0));
      } else {
        setLocationTaxRate(null);
      }

      if (preselectedCustomerId) {
        const customer = customersData.find(record => record.id === preselectedCustomerId);
        if (customer) setSelectedCustomer(customer);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item) => {
    if ((item.stock_quantity || 0) <= 0) return;

    const existing = cart.find(cartItem => cartItem.id === item.id);
    if (existing) {
      if (existing.quantity >= (item.stock_quantity || 0)) return;
      resetSaleRequest();
      setCart(cart.map(cartItem =>
        cartItem.id === item.id
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      ));
    } else {
      resetSaleRequest();
      setCart([...cart, {
        ...item,
        quantity: 1,
        selectedSize: item.sizes?.length === 1 ? item.sizes[0] : '',
        selectedWidth: item.width_options?.length === 1 ? item.width_options[0] : '',
        selectedColor: item.colors?.length === 1 ? item.colors[0] : ''
      }]);
    }
  };

  const updateQuantity = (itemId, delta) => {
    resetSaleRequest();
    setCart(cart
      .map(cartItem => {
        if (cartItem.id !== itemId) return cartItem;

        const newQty = cartItem.quantity + delta;
        if (newQty <= 0) return { ...cartItem, quantity: 0 };
        if (newQty > (cartItem.stock_quantity || 0)) return cartItem;

        return { ...cartItem, quantity: newQty };
      })
      .filter(cartItem => cartItem.quantity > 0));
  };

  const removeFromCart = (itemId) => {
    resetSaleRequest();
    setCart(cart.filter(c => c.id !== itemId));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = subtotal * (discount / 100);
  const taxRate = Math.max(0, Number(locationTaxRate ?? business?.tax_rate) || 0);
  const tax = (subtotal - discountAmount) * (taxRate / 100);
  const total = subtotal - discountAmount + tax;

  const processPayment = async () => {
    if (!selectedCustomer || cart.length === 0 || !business?.id) return;

    if (paymentMethod !== 'cash') {
      setPaymentError('Card and mobile payments require a connected payment processor. No charge was attempted.');
      return;
    }

    const missingOptions = cart.find(item =>
      (item.sizes?.length > 0 && !item.selectedSize) ||
      (item.width_options?.length > 0 && !item.selectedWidth) ||
      (item.colors?.length > 0 && !item.selectedColor)
    );
    if (missingOptions) {
      setPaymentError(`Choose the size, width, and color for ${missingOptions.name} before checkout.`);
      return;
    }

    setPaymentError('');
    setProcessing(true);
    try {
      const locationId =
        selectedCustomer.location_id ||
        employee?.location_id ||
        business.default_location_id ||
        '';

      const response = await base44.functions.invoke('recordSale', {
        customerId: selectedCustomer.id,
        locationId,
        paymentMethod,
        discountPercent: discount,
        idempotencyKey: saleRequestId,
        items: cart.map(item => ({
          inventoryItemId: item.id,
          quantity: item.quantity,
          size: item.selectedSize || '',
          width_code: item.selectedWidth || '',
          color: item.selectedColor || ''
        }))
      });
      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'The sale could not be recorded.');
      }

      setLastSaleTotal(Number(result.total || 0));
      setShowSuccess(true);
      setCart([]);
      setSaleRequestId(crypto.randomUUID());
      await loadData();
    } catch (err) {
      console.error(err);
      setPaymentError(err?.response?.data?.error || err?.message || 'The sale could not be recorded.');
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
    <div className="min-h-screen bg-slate-900/85">
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
                className={`bg-slate-800 border-slate-700 transition overflow-hidden ${(item.stock_quantity || 0) > 0 ? "cursor-pointer hover:bg-slate-700" : "cursor-not-allowed opacity-80"}`}
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
              onValueChange={(v) => {
                resetSaleRequest();
                setSelectedCustomer(customers.find(c => c.id === v));
              }}
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
                    {(item.sizes?.length > 0 || item.width_options?.length > 0 || item.colors?.length > 0) && (
                      <div className="grid grid-cols-3 gap-1 mt-2">
                        {item.sizes?.length > 0 && (
                          <Select
                            value={item.selectedSize || ''}
                            onValueChange={(value) => setCart(prev => prev.map(row =>
                              row.id === item.id ? { ...row, selectedSize: value } : row
                            ))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
                            <SelectContent>
                              {item.sizes.map(size => <SelectItem key={size} value={size}>{size}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        {item.width_options?.length > 0 && (
                          <Select
                            value={item.selectedWidth || ''}
                            onValueChange={(value) => setCart(prev => prev.map(row =>
                              row.id === item.id ? { ...row, selectedWidth: value } : row
                            ))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Width" /></SelectTrigger>
                            <SelectContent>
                              {item.width_options.map(width => <SelectItem key={width} value={width}>{width}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        {item.colors?.length > 0 && (
                          <Select
                            value={item.selectedColor || ''}
                            onValueChange={(value) => setCart(prev => prev.map(row =>
                              row.id === item.id ? { ...row, selectedColor: value } : row
                            ))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Color" /></SelectTrigger>
                            <SelectContent>
                              {item.colors.map(color => <SelectItem key={color} value={color}>{color}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
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
                <span>Tax ({taxRate.toFixed(2)}%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                Cash sales can be recorded now. Card and mobile payment buttons remain disabled until a real processor is connected.
              </p>
            </div>

            {paymentError && (
              <p className="text-sm text-red-600 mb-3">{paymentError}</p>
            )}

            <div className="flex gap-2 mb-4">
              <Button
                variant="outline"
                className="flex-1"
                disabled
                title="Connect a payment processor to enable card payments"
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
                variant="outline"
                className="flex-1"
                disabled
                title="Connect a payment processor to enable mobile payments"
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
              Complete Cash Sale
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
            <DialogTitle className="text-2xl mb-2">Cash Sale Recorded</DialogTitle>
            <p className="text-slate-500 mb-6">Cash transaction recorded for ${lastSaleTotal.toFixed(2)}</p>
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