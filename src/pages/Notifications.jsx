import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, Send, Gift, Tag, Megaphone, Sparkles, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { getVendorContext } from '@/lib/vendorContext';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [businessId, setBusinessId] = useState(null);
  const [deliveryMessage, setDeliveryMessage] = useState(null);
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'general',
    coupon_code: '',
    discount_percent: '',
    valid_until: '',
    target: 'all'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const context = await getVendorContext();
      setBusinessId(context.businessId);

      if (!context.businessId) {
        setNotifications([]);
        setCustomers([]);
        return;
      }

      const [notifData, customerData] = await Promise.all([
        base44.entities.CustomerNotification.filter({ business_id: context.businessId }),
        base44.entities.StoreCustomer.filter({ business_id: context.businessId })
      ]);
      setNotifications(
        [...notifData].sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()).slice(0, 50)
      );
      setCustomers(customerData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (type = 'general') => {
    setForm({
      title: '',
      message: '',
      type,
      coupon_code: '',
      discount_percent: '',
      valid_until: '',
      target: 'all'
    });
    
    if (type === 'birthday') {
      setForm(prev => ({
        ...prev,
        title: '🎂 Happy Birthday!',
        message: 'Wishing you a wonderful birthday! Enjoy a special treat on us.'
      }));
    } else if (type === 'new_arrival') {
      setForm(prev => ({
        ...prev,
        title: '✨ New Arrivals',
        message: 'Fresh styles just landed! Be the first to check out our newest collection.'
      }));
    }
    
    setDialogOpen(true);
  };

  const sendNotification = async () => {
    if (!businessId) return;
    setSending(true);
    setDeliveryMessage(null);
    try {
      const response = await base44.functions.invoke('sendCampaign', {
        campaign: {
          title: form.title,
          message: form.message,
          type: form.type,
          coupon_code: form.coupon_code || '',
          discount_percent: form.discount_percent ? parseFloat(form.discount_percent) : undefined,
          valid_until: form.valid_until || '',
          target: form.target
        }
      });
      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'The campaign could not be delivered.');
      }

      setDeliveryMessage({
        type: 'success',
        text: `Delivered to ${result.delivered || 0} linked customer${result.delivered === 1 ? '' : 's'}.`
      });
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.error || err?.message || 'The campaign could not be delivered.';
      setDeliveryMessage({ type: 'error', text: message });
      await loadData();
    } finally {
      setSending(false);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await base44.entities.CustomerNotification.delete(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const typeIcons = {
    new_arrival: Sparkles,
    promo: Tag,
    birthday: Gift,
    coupon: Tag,
    general: Bell
  };

  const typeColors = {
    new_arrival: 'bg-violet-100 text-violet-700',
    promo: 'bg-emerald-100 text-emerald-700',
    birthday: 'bg-pink-100 text-pink-700',
    coupon: 'bg-amber-100 text-amber-700',
    general: 'bg-slate-100 text-slate-700'
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/85 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Customer Notifications</h1>
            <p className="text-slate-500">Prepare promos, announcements, birthday cards, and coupons</p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 flex gap-3">
          <Bell className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">
            Campaigns are delivered to customers linked with The Concierge. If delivery cannot complete, the campaign is retained as a draft with the error shown below.
          </p>
        </div>

        {deliveryMessage && (
          <div className={`mb-6 rounded-xl border p-4 flex gap-3 ${
            deliveryMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}>
            {deliveryMessage.type === 'success'
              ? <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            }
            <p className={`text-sm ${deliveryMessage.type === 'success' ? 'text-emerald-900' : 'text-amber-900'}`}>
              {deliveryMessage.text}
            </p>
          </div>
        )}

        {/* Campaign Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Button
            variant="outline"
            className="h-auto py-6 flex-col gap-2 bg-white shadow-md hover:shadow-lg"
            onClick={() => openDialog('new_arrival')}
          >
            <Sparkles className="w-6 h-6 text-violet-500" />
            <span>New Arrivals</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-6 flex-col gap-2 bg-white shadow-md hover:shadow-lg"
            onClick={() => openDialog('promo')}
          >
            <Tag className="w-6 h-6 text-emerald-500" />
            <span>Promo / Sale</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-6 flex-col gap-2 bg-white shadow-md hover:shadow-lg"
            onClick={() => openDialog('birthday')}
          >
            <Gift className="w-6 h-6 text-pink-500" />
            <span>Birthday Cards</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-6 flex-col gap-2 bg-white shadow-md hover:shadow-lg"
            onClick={() => openDialog('coupon')}
          >
            <Megaphone className="w-6 h-6 text-amber-500" />
            <span>Send Coupon</span>
          </Button>
        </div>

        {/* Recent Notifications */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Campaign History</CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No campaigns yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {notifications.map((notif) => {
                  const Icon = typeIcons[notif.type] || Bell;
                  return (
                    <div key={notif.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${typeColors[notif.type]}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{notif.title}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {notif.type?.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{notif.message}</p>
                        {notif.coupon_code && (
                          <p className="text-sm text-emerald-600 mt-1">
                            Code: {notif.coupon_code} ({notif.discount_percent}% off)
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-2">
                          {notif.status === 'draft' ? 'Draft / delivery pending' : notif.status}
                          {notif.created_date ? ` • ${format(new Date(notif.created_date), 'MMM d, yyyy h:mm a')}` : ''}
                          {notif.target_customers?.length > 0
                            ? ` • ${notif.target_customers.length} selected customers`
                            : ' • all customers'}
                          {notif.delivery_error ? ` • ${notif.delivery_error}` : ''}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => deleteNotification(notif.id)} className="text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Send Notification Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Customer Campaign</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Notification title"
              />
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Your message..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Send To</Label>
              <Select value={form.target} onValueChange={(v) => setForm({ ...form, target: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="in_store">Currently In Store</SelectItem>
                  <SelectItem value="vip">VIP Customers</SelectItem>
                  <SelectItem value="birthday">Today's Birthdays</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(form.type === 'coupon' || form.type === 'promo') && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Coupon Code</Label>
                    <Input
                      value={form.coupon_code}
                      onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })}
                      placeholder="SAVE20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount %</Label>
                    <Input
                      type="number"
                      value={form.discount_percent}
                      onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                      placeholder="20"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                  />
                </div>
              </>
            )}

            <Button 
              onClick={sendNotification} 
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={!form.title || !form.message || sending}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send Campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}