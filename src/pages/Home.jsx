import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Building2, Users, Package, ShoppingCart, Bell, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PullToRefresh from '@/components/ui/PullToRefresh';
import { getVendorContext } from '@/lib/vendorContext';
import { getRecentOnlineOrders, getTodayCompletedSales, formatOnlineOrderItems } from '@/lib/retailerOrders';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [stats, setStats] = useState({ customers: 0, inventory: 0, sales: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loadError, setLoadError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoadError('');
      const context = await getVendorContext();

      if (!context.business || !context.businessId || !context.business.setup_complete) {
        navigate(createPageUrl('BusinessSetup'));
        return;
      }

      setBusiness(context.business);
      // Business ownership grants manager actions even before the first
      // Employee record is provisioned. getVendorContext checks ownership.
      setEmployee(context.employee || (context.isManager
        ? { role: 'manager', permissions: context.permissions }
        : null));

      const [customers, inventory, purchases] = await Promise.all([
        base44.entities.StoreCustomer.filter({ in_store: true, business_id: context.businessId }),
        base44.entities.InventoryItem.filter({ business_id: context.businessId }),
        // Query only the authenticated store's purchases. The Supabase
        // purchases RLS policy separately enforces this business boundary.
        base44.entities.Purchase.filter({ business_id: context.businessId }, '-created_date', 40)
      ]);

      const todaySales = getTodayCompletedSales(purchases);
      setRecentOrders(getRecentOnlineOrders(purchases, context.businessId));

      setStats({
        customers: customers.length,
        inventory: inventory.length,
        sales: todaySales
      });
    } catch (err) {
      console.error(err);
      setLoadError('The retailer dashboard could not load store data. Pull to refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const isManager = employee?.role === 'manager';
  const permissions = employee?.permissions || {};

  const quickActions = [
    { icon: MapPin, label: 'Floor View', page: 'FloorView', color: 'bg-violet-500', show: true },
    { icon: Users, label: 'Customers', page: 'Customers', color: 'bg-emerald-500', show: true },
    { icon: Package, label: 'Inventory', page: 'Inventory', color: 'bg-amber-500', show: isManager || Boolean(permissions.manage_inventory) },
    { icon: ShoppingCart, label: 'POS', page: 'Checkout', color: 'bg-blue-500', show: isManager || Boolean(permissions.process_checkout) },
    { icon: Bell, label: 'Notifications', page: 'Notifications', color: 'bg-rose-500', show: isManager || Boolean(permissions.send_notifications) },
    { icon: Building2, label: 'Settings', page: 'BusinessSetup', color: 'bg-slate-600', show: isManager }
  ].filter(action => action.show);

  return (
    <PullToRefresh onRefresh={loadData}>
      <div className="min-h-screen bg-slate-50/85 dark:bg-slate-900/85">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-8">
            {business?.logo_url && (
              <img src={business.logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover shadow-lg" />
            )}
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{business?.name}</h1>
              <p className="text-slate-500 dark:text-slate-400">Business Dashboard</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wide">In-Store Now</p>
                    <p className="text-4xl font-bold text-slate-900 dark:text-white mt-1">{stats.customers}</p>
                  </div>
                  <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center">
                    <Users className="w-7 h-7 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wide">Inventory Items</p>
                    <p className="text-4xl font-bold text-slate-900 dark:text-white mt-1">{stats.inventory}</p>
                  </div>
                  <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center">
                    <Package className="w-7 h-7 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wide">Today's Merchandise Sales</p>
                    <p className="text-4xl font-bold text-slate-900 dark:text-white mt-1">${stats.sales.toFixed(2)}</p>
                  </div>
                  <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                    <ShoppingCart className="w-7 h-7 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {loadError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">{loadError}</p>}

          <section aria-labelledby="recent-online-orders" className="mb-8 rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 id="recent-online-orders" className="text-lg font-semibold text-slate-900 dark:text-white">Recent Online Orders</h2>
              <span className="text-xs text-slate-500">This store only</span>
            </div>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">No online orders recorded for this store yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentOrders.map(order => (
                  <li key={order.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex justify-between gap-3 items-start">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white">Order #{String(order.order_id || order.id).slice(-8)}</p>
                        <p className="text-xs text-slate-500">
                          {order.created_date ? new Date(order.created_date).toLocaleString() : 'Date unavailable'}
                          {' · '}{order.status || 'Processing'}
                        </p>
                      </div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        ${Number(order.total || 0).toFixed(2)}
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{formatOnlineOrderItems(order)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Concierge fee: ${Number(order.platform_fee_amount || 0).toFixed(2)} ·
                      {order.platform_fee_status === 'collected' ? ' Collected' : ' Pending'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quickActions.map((action) => (
              <Button
                key={action.page}
                variant="ghost"
                className="h-auto flex-col gap-3 p-6 bg-white dark:bg-slate-800 hover:bg-white/90 shadow-md hover:shadow-lg transition-all rounded-2xl border-0 select-none"
                onClick={() => navigate(createPageUrl(action.page))}
              >
                <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}