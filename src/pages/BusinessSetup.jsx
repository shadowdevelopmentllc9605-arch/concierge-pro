import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Building2, Upload, MapPin, Check, ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MANAGER_PERMISSIONS } from '@/lib/vendorContext';

export default function BusinessSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
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

  const loadBusiness = async () => {
    try {
      const userData = await base44.auth.me();
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
      const userData = await base44.auth.me();
      const data = {
        ...form,
        tax_rate: Math.max(0, parseFloat(form.tax_rate) || 0),
        owner_user_id: userData.id,
        owner_email: userData.email,
        setup_complete: step >= 3,
      };

      let savedBusiness = business;
      if (business) {
        await base44.entities.Business.update(business.id, data);
        savedBusiness = { ...business, ...data };
        setBusiness(savedBusiness);
      } else {
        savedBusiness = await base44.entities.Business.create(data);
        setBusiness(savedBusiness);
      }

      const employees = await base44.entities.Employee.filter({ email: userData.email });
      const existingManager = employees[0];

      const managerData = {
        user_id: userData.id,
        name: userData.full_name || userData.name || userData.email,
        email: userData.email,
        role: 'manager',
        permissions: MANAGER_PERMISSIONS,
        status: 'active',
        business_id: savedBusiness.id,
      };

      if (existingManager) {
        await base44.entities.Employee.update(existingManager.id, managerData);
      } else {
        await base44.entities.Employee.create(managerData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    if (!business?.id) return;

    try {
      const [
        employees,
        inventory,
        customers,
        purchases,
        notifications,
        fittingRooms
      ] = await Promise.all([
        base44.entities.Employee.filter({ business_id: business.id }),
        base44.entities.InventoryItem.filter({ business_id: business.id }),
        base44.entities.StoreCustomer.filter({ business_id: business.id }),
        base44.entities.Purchase.filter({ business_id: business.id }),
        base44.entities.CustomerNotification.filter({ business_id: business.id }),
        base44.entities.FittingRoom.filter({ business_id: business.id })
      ]);

      await Promise.all([
        ...notifications.map(record => base44.entities.CustomerNotification.delete(record.id)),
        ...purchases.map(record => base44.entities.Purchase.delete(record.id)),
        ...fittingRooms.map(record => base44.entities.FittingRoom.delete(record.id)),
        ...customers.map(record => base44.entities.StoreCustomer.delete(record.id)),
        ...inventory.map(record => base44.entities.InventoryItem.delete(record.id)),
        ...employees.map(record => base44.entities.Employee.delete(record.id))
      ]);

      await base44.entities.Business.delete(business.id);
      base44.auth.logout();
    } catch (err) {
      console.error(err);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12">
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
                    Used for the current single-location POS. Multi-location tax rules require per-location configuration.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Link to Customer App (Optional)</Label>
                  <Input
                    value={form.linked_customer_app_id}
                    onChange={(e) => setForm({ ...form, linked_customer_app_id: e.target.value })}
                    placeholder="Customer Concierge App ID"
                  />
                  <p className="text-xs text-slate-500">
                    Stores the customer-app identifier only. Cross-app synchronization still requires the shared backend/API integration.
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
                <p className="text-slate-600 mb-6">Next, add your employees and inventory to get started.</p>
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
                    This deletes the vendor records Concierge Pro can address and logs you out. Your Base44 sign-in account and previously uploaded files may require separate platform-level deletion.
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