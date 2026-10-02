import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Search, User, ShoppingBag, Heart, Calendar, Phone, Mail, Loader2, Filter, MapPin, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format } from 'date-fns';
import PullToRefresh from '@/components/ui/PullToRefresh';

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await base44.entities.StoreCustomer.list('-last_visit', 100);
      setCustomers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = customers.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase());
    
    if (filter === 'in_store') return matchesSearch && c.in_store;
    if (filter === 'vip') return matchesSearch && c.total_spent >= 1000;
    return matchesSearch;
  });

  const inStoreCount = customers.filter(c => c.in_store).length;
  const vipCount = customers.filter(c => c.total_spent >= 1000).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadCustomers}>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
            <p className="text-slate-500">{customers.length} total customers</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-10 w-72"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="mb-6">
          <TabsList className="bg-white shadow-sm">
            <TabsTrigger value="all">All ({customers.length})</TabsTrigger>
            <TabsTrigger value="in_store">
              <MapPin className="w-3 h-3 mr-1" />
              In Store ({inStoreCount})
            </TabsTrigger>
            <TabsTrigger value="vip">VIP ({vipCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid gap-4">
          {filtered.map((customer) => (
            <Card 
              key={customer.id} 
              className="border-0 shadow-lg hover:shadow-xl transition cursor-pointer"
              onClick={() => navigate(createPageUrl(`CustomerDetail?id=${customer.id}`))}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  {customer.photo_url ? (
                    <img src={customer.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                      <User className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{customer.name}</h3>
                      {customer.in_store && (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <MapPin className="w-3 h-3 mr-1" /> In Store
                        </Badge>
                      )}
                      {customer.total_spent >= 1000 && (
                        <Badge className="bg-amber-100 text-amber-700">VIP</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                      {customer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {customer.email}
                        </span>
                      )}
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {customer.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-6 text-center">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{customer.visit_count || 0}</p>
                      <p className="text-xs text-slate-500">Visits</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">${customer.total_spent?.toFixed(0) || 0}</p>
                      <p className="text-xs text-slate-500">Spent</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{customer.wishlist_items?.length || 0}</p>
                      <p className="text-xs text-slate-500">Wishlist</p>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>

                {customer.last_visit && (
                  <p className="text-xs text-slate-400 mt-4 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Last visit: {format(new Date(customer.last_visit), 'MMM d, yyyy')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {filtered.length === 0 && (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-12 text-center">
                <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No customers found</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
}