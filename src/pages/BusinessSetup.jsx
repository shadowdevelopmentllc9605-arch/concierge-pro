import { authClient } from '@/api/authClient';
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Building2, Upload, MapPin, Check, ArrowRight, Loader2, Trash2, CreditCard, RefreshCw, Landmark, BadgeDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function BusinessSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [stripeBusy, setStripeBusy] = useState('');
  const [stripeError, setStripeError] = useState('');
  const [form, setForm] = useState({
    name: '',
    logo_url: '',
    floor_plan_url: '',
    address: '',
    phone: '',
    email: '',
    tax_rate: '0',
    open_procedures: '',
    close_procedures: '',
    linked_customer_app_id: ''
  });

  useEffect(() => {
    loadBusiness();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe') === 'return' || params.get('billing') === 'success') {
      refreshStripeStatus(true);
    }
  }, []);

  const loadBusiness = async () => {
    try {
      const userData = await authClient.me();
      let businesses = await base44.entities.Business.filter({ owner_user_id: userData.id });

      if (businesses.length === 0 && userData.email) {
        businesses = await base44.entities.Business.filter({ owner_email: userData.email });
      }

      if (businesses.length === 0) {
        const legacyBusinesses = await base44.entities.Business.list();
        if (
          legacyBusinesses.length === 1 &&
          !legacyBusinesses[0].owner_user_id &&
          !legacyBusinesses[0].owner_email
        ) {
          businesses = legacyBusinesses;
        }
      }

      if (businesses.length > 0) {
        const existing = businesses[0];
        setBusiness(existing);
        setForm(prev => ({
          ...prev,
          ...existing,
          tax_rate: existing.tax_rate?.toString() || '0',
        }));
        if (existing.setup_complete) setStep(4);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, [field]: file_url }));
    } catch (err) {
      console.error(err);
    }
  };

  const saveProgress = async () => {
    setSaving(true);
    try {
      const userData = await authClient.me();
      const data = /** @type {any} */ ({
        ...form,
        tax_rate: Math.max(0, parseFloat(form.tax_rate) || 0),
        setup_complete: step >= 3,
      });
      // Ownership is set only at creation and never client-updated: a manager
      // saving the settings form must not overwrite who owns the business.
      if (!business) {
        data.owner_user_id = userData.id;
        data.owner_email = userData.email;
      }

      let savedBusiness = business;
      if (business) {
        await base44.entities.Business.update(business.id, data);
        savedBusiness = { ...business, ...data };
        setBusiness(savedBusiness);
      } else {
        savedBusiness = await base44.entities.Business.create(data);
        setBusiness(savedBusiness);
      }

      // The backend claim function creates/updates the manager Employee record
      // and protected User membership fields. Browser code cannot grant itself roles.
      await base44.functions.invoke('claimVendorMembership', {});
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const refreshStripeStatus = async (syncCustomerApp = false) => {
    setStripeBusy('refresh');
    setStripeError('');
    try {
      const response = await base44.functions.invoke('refreshStripeBusinessStatus', {});
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Stripe status could not be refreshed.');

      if (syncCustomerApp) {
        try {
          await base44.functions.invoke('syncVendorCatalog', {});
        } catch (syncError) {
          console.warn('Stripe status refreshed, but customer-app sync is pending.', syncError);
        }
      }
      await loadBusiness();
      return result;
    } catch (err) {
      console.error(err);
      setStripeError(err?.response?.data?.error || err?.message || 'Stripe status could not be refreshed.');
      return null;
    } finally {
      setStripeBusy('');
    }
  };

  const startStripeOnboarding = async () => {
    setStripeBusy('connect');
    setStripeError('');
    try {
      const response = await base44.functions.invoke('createConnectOnboarding', {});
      const result = response?.data || response;
      if (!result?.success || !result?.url) throw new Error(result?.error || 'Stripe onboarding could not be started.');
      window.location.assign(result.url);
    } catch (err) {
      console.error(err);
      setStripeError(err?.response?.data?.error || err?.message || 'Stripe onboarding could not be started.');
      setStripeBusy('');
    }
  };

  const startBilling = async (plan) => {
    setStripeBusy(plan);
    setStripeError('');
    try {
      const response = await base44.functions.invoke('createVendorBillingCheckout', { plan });
      const result = response?.data || response;
      if (!result?.success || !result?.url) throw new Error(result?.error || 'Subscription checkout could not be started.');
      window.location.assign(result.url);
    } catch (err) {
      console.error(err);
      setStripeError(err?.response?.data?.error || err?.message || 'Subscription checkout could not be started.');
      setStripeBusy('');
    }
  };

  const deleteAccount = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    try {
      const response = await base44.functions.invoke('deleteVendorBusiness', {});
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Business data could not be deleted.');
      authClient.logout();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || err?.message || 'Business data could not be deleted.');
    }
  };

  const nextStep = async () => {
    await saveProgress();
    if (step < 4) setStep(step + 1);
    else navigate(createPageUrl('Home'));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const steps = [
    { num: 1, label: 'Business Info' },
    { num: 2, label: 'Floor Plan' },
    { num: 3, label: 'Procedures' },
    { num: 4, label: 'Complete' }
  ];

  return (
    <div className="min-h-screen bg-slate-50/85 py-12">
      <div className="max-w-2xl mx-auto px-6">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {steps.map((s, i) => (
            <React.Fragment key={s.num}>
              <div className={`flex items-center gap-2 ${step >= s.num ? 'text-violet-600' : 'text-slate-400'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step >= s.num ? 'bg-violet-600 text-white' : 'bg-slate-200'
                }`}>
                  {step > s.num ? <Check className="w-5 h-5" /> : s.num}
                </div>
                <span className="hidden md:block text-sm font-medium">{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`w-12 h-0.5 ${step > s.num ? 'bg-violet-600' : 'bg-slate-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader>
            <CardTitle className="text-2xl">
              {step === 1 && 'Business Information'}
              {step === 2 && 'Upload Floor Plan'}
              {step === 3 && 'Store Procedures'}
              {step === 4 && 'Setup Complete!'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>Business Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your Store Name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Logo / Store Image</Label>
                  <div className="flex items-center gap-4">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
                    ) : (
                      <div className="w-20 h-20 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-slate-400" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                        <Upload className="w-4 h-4" />
                        <span className="text-sm font-medium">Upload</span>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'logo_url')} />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="store@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="123 Main Street, City, State"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sales Tax Rate (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                    placeholder="7.25"
                  />
                  <p className="text-xs text-slate-500">
                    Default/fallback tax rate. Configure each store's tax rate on the Locations page.
                  </p>
                </div>

                <div className="rounded-lg border border-violet-100 bg-violet-50 p-3">
                  <p className="text-sm font-medium text-violet-900">The Concierge customer app</p>
                  <p className="text-xs text-violet-700 mt-1">
                    Customer-app synchronization is handled by the secure integration bridge. Use Sync Customer App from Inventory or Locations after your store data is ready.
                  </p>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-slate-600">Upload your store floor plan to help track customer locations and manage item placements.</p>
                
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                  {form.floor_plan_url ? (
                    <div className="space-y-4">
                      <img src={form.floor_plan_url} alt="Floor Plan" className="max-w-full h-auto rounded-lg mx-auto" />
                      <label className="cursor-pointer inline-block">
                        <div className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition text-sm font-medium">
                          Replace Image
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'floor_plan_url')} />
                      </label>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className="flex flex-col items-center gap-3 text-slate-500">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                          <MapPin className="w-8 h-8" />
                        </div>
                        <p className="font-medium">Click to upload floor plan</p>
                        <p className="text-sm text-slate-400">PNG, JPG up to 10MB</p>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'floor_plan_url')} />
                    </label>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label>Opening Procedures</Label>
                  <Textarea
                    value={form.open_procedures}
                    onChange={(e) => setForm({ ...form, open_procedures: e.target.value })}
                    placeholder="1. Turn on lights&#10;2. Check inventory&#10;3. Prepare registers..."
                    rows={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Closing Procedures</Label>
                  <Textarea
                    value={form.close_procedures}
                    onChange={(e) => setForm({ ...form, close_procedures: e.target.value })}
                    placeholder="1. Close registers&#10;2. Count drawers&#10;3. Lock doors..."
                    rows={6}
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Your business is set up!</h3>
                <p className="text-slate-600 mb-6">Finish Stripe setup, then add employees and inventory.</p>

                <div className="text-left rounded-2xl border border-violet-200 bg-violet-50 p-5 mb-5">
                  <div className="flex items-start gap-3">
                    <BadgeDollarSign className="w-6 h-6 text-violet-700 mt-0.5" />
                    <div>
                      <p className="font-semibold text-violet-950">Concierge Pro launch pricing</p>
                      <p className="text-sm text-violet-800 mt-1">$149/month per location + 4% only on Concierge-attributed merchandise sales.</p>
                      <p className="text-xs text-violet-700 mt-1">Founding Retailers: $99/month per location for the first 12 months (first 20 qualifying retailers).</p>
                    </div>
                  </div>
                </div>

                <div className="text-left rounded-2xl border p-5 mb-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Landmark className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="font-medium">Retailer payouts</p>
                        <p className="text-xs text-slate-500">
                          {business?.stripe_onboarding_complete && (business?.stripe_transfers_enabled || business?.stripe_payouts_enabled)
                            ? 'Stripe Connect is ready to receive marketplace proceeds.'
                            : 'Connect Stripe so The Concierge can route shopper proceeds to your store.'}
                        </p>
                      </div>
                    </div>
                    {business?.stripe_onboarding_complete && (business?.stripe_transfers_enabled || business?.stripe_payouts_enabled) ? (
                      <span className="text-xs font-semibold text-emerald-700">Ready</span>
                    ) : (
                      <Button size="sm" onClick={startStripeOnboarding} disabled={Boolean(stripeBusy)}>
                        {stripeBusy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Connect Stripe
                      </Button>
                    )}
                  </div>

                  <div className="border-t pt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="font-medium">Concierge Pro subscription</p>
                        <p className="text-xs text-slate-500">
                          {['active', 'trialing'].includes(business?.stripe_subscription_status)
                            ? `${business?.billing_plan === 'founding' ? 'Founding Retailer' : 'Standard'} plan active${business?.billing_location_quantity ? ` · ${business.billing_location_quantity} location${business.billing_location_quantity === 1 ? '' : 's'}` : ''}.`
                            : 'Choose the launch plan for this business.'}
                        </p>
                      </div>
                    </div>
                    {['active', 'trialing'].includes(business?.stripe_subscription_status) ? (
                      <span className="text-xs font-semibold text-emerald-700">Active</span>
                    ) : null}
                  </div>

                  {!['active', 'trialing'].includes(business?.stripe_subscription_status) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => startBilling('founding')} disabled={Boolean(stripeBusy)}>
                        {stripeBusy === 'founding' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Founding · $99/mo
                      </Button>
                      <Button onClick={() => startBilling('standard')} disabled={Boolean(stripeBusy)}>
                        {stripeBusy === 'standard' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Standard · $149/mo
                      </Button>
                    </div>
                  )}

                  <Button variant="ghost" size="sm" className="w-full" onClick={() => refreshStripeStatus(true)} disabled={Boolean(stripeBusy)}>
                    {stripeBusy === 'refresh' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Refresh Stripe status
                  </Button>

                  {stripeError && <p className="text-sm text-red-600">{stripeError}</p>}
                </div>

                <div className="flex flex-col gap-3">
                  <Button onClick={() => navigate(createPageUrl('Employees'))} variant="outline" className="w-full">
                    Add Employees
                  </Button>
                  <Button onClick={() => navigate(createPageUrl('Inventory'))} variant="outline" className="w-full">
                    Add Inventory
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              {step > 1 && step < 4 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              <Button
                onClick={nextStep}
                disabled={step === 1 && !form.name}
                className="ml-auto bg-violet-600 hover:bg-violet-700"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {step === 4 ? 'Go to Dashboard' : 'Continue'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            {business && step === 4 && (
              <div className="pt-6 border-t mt-2">
                <p className="text-xs text-slate-400 mb-2 text-center">Danger Zone</p>
                {deleteConfirm ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={deleteAccount}
                    >
                      Yes, Delete Everything
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50"
                    onClick={deleteAccount}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                )}
                {deleteConfirm && (
                  <p className="text-xs text-red-500 text-center mt-2">
                    This permanently deletes this business, its Concierge Pro records, your Base44 owner sign-in account, and linked catalog data in The Concierge. Employee logins are retained but their access to this business is revoked. Base44 does not currently expose an SDK method to purge previously uploaded files from storage.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}