import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { MapPin, Plus, Pencil, Trash2, Loader2, Upload, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { getVendorContext } from '@/lib/vendorContext';

const emptyForm = {
  name: '',
  address: '',
  lat: '',
  lng: '',
  tax_rate: '0',
  floor_plan_url: '',
  is_default: false,
  active: true,
};

export default function Locations() {
  const [business, setBusiness] = useState(null);
  const [businessId, setBusinessId] = useState('');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const context = await getVendorContext();
      setBusiness(context.business);
      setBusinessId(context.businessId || '');
      if (!context.businessId) return;
      const rows = await base44.entities.BusinessLocation.filter({ business_id: context.businessId });
      setLocations(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const open = (location = null) => {
    setEditing(location);
    setForm(location ? {
      name: location.name || '',
      address: location.address || '',
      lat: location.lat?.toString() || '',
      lng: location.lng?.toString() || '',
      tax_rate: location.tax_rate?.toString() || '0',
      floor_plan_url: location.floor_plan_url || '',
      is_default: Boolean(location.is_default),
      active: location.active !== false,
    } : { ...emptyForm });
    setDialogOpen(true);
  };

  const uploadFloorPlan = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, floor_plan_url: file_url }));
  };

  const save = async () => {
    if (!businessId || !form.name) return;
    const data = {
      business_id: businessId,
      name: form.name,
      address: form.address,
      lat: form.lat === '' ? undefined : Number(form.lat),
      lng: form.lng === '' ? undefined : Number(form.lng),
      tax_rate: Math.max(0, Number(form.tax_rate || 0)),
      floor_plan_url: form.floor_plan_url,
      is_default: Boolean(form.is_default),
      active: Boolean(form.active),
    };

    if (data.is_default) {
      const others = locations.filter(row => row.id !== editing?.id && row.is_default);
      await Promise.all(others.map(row => base44.entities.BusinessLocation.update(row.id, { is_default: false })));
    }

    let saved;
    if (editing) {
      await base44.entities.BusinessLocation.update(editing.id, data);
      saved = { ...editing, ...data };
    } else {
      saved = await base44.entities.BusinessLocation.create(data);
    }

    if (data.is_default || !business?.default_location_id) {
      await base44.entities.Business.update(businessId, {
        default_location_id: saved.id,
        address: data.address || business?.address || '',
        floor_plan_url: data.floor_plan_url || business?.floor_plan_url || '',
        tax_rate: data.tax_rate,
      });
    }

    setDialogOpen(false);
    await load();
  };

  const remove = async (location) => {
    if (!confirm(`Delete ${location.name}?`)) return;
    await base44.entities.BusinessLocation.delete(location.id);
    if (business?.default_location_id === location.id) {
      await base44.entities.Business.update(businessId, { default_location_id: '' });
    }
    await load();
  };

  const sync = async () => {
    setSyncing(true);
    setMessage('');
    try {
      const response = await base44.functions.invoke('syncVendorCatalog', {});
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Sync failed');
      setMessage(`Locations and ${result.syncedItems || 0} inventory item(s) synced to The Concierge.`);
    } catch (error) {
      setMessage(error?.response?.data?.error || error?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Store Locations</h1>
            <p className="text-slate-500">Addresses, coordinates, tax rates, and floor plans for each store.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync Customer App
            </Button>
            <Button onClick={() => open()}><Plus className="w-4 h-4 mr-2" />Add Location</Button>
          </div>
        </div>

        {message && <div className="mb-5 p-3 rounded-xl border bg-white text-sm">{message}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          {locations.map(location => (
            <Card key={location.id}>
              <CardContent className="p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-violet-600" />
                      <h2 className="font-semibold text-lg">{location.name}</h2>
                      {location.is_default && <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700">Default</span>}
                    </div>
                    <p className="text-sm text-slate-500 mt-2">{location.address || 'No address entered'}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {Number.isFinite(location.lat) && Number.isFinite(location.lng)
                        ? `${location.lat}, ${location.lng}`
                        : 'Coordinates required for automatic proximity check-in'}
                    </p>
                    <p className="text-sm mt-2">Tax: {Number(location.tax_rate || 0).toFixed(2)}%</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => open(location)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={() => remove(location)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                {location.floor_plan_url && <img src={location.floor_plan_url} alt="Floor plan" className="mt-4 w-full h-40 object-contain bg-slate-100 rounded-lg" />}
              </CardContent>
            </Card>
          ))}
        </div>

        {locations.length === 0 && (
          <div className="py-16 text-center text-slate-500">
            <MapPin className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            Add at least one real store location to enable customer proximity check-in.
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Location' : 'Add Location'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Downtown Store" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, State" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Latitude</Label><Input type="number" step="0.000001" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} /></div>
              <div><Label>Longitude</Label><Input type="number" step="0.000001" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} /></div>
            </div>
            <div><Label>Sales Tax Rate (%)</Label><Input type="number" min="0" step="0.01" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} /></div>
            <div>
              <Label>Floor Plan</Label>
              <div className="mt-2 flex gap-3 items-center">
                {form.floor_plan_url && <img src={form.floor_plan_url} alt="" className="w-20 h-20 object-contain bg-slate-100 rounded-lg" />}
                <label className="cursor-pointer px-3 py-2 rounded-lg border text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Upload
                  <input type="file" className="hidden" accept="image/*" onChange={uploadFloorPlan} />
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between"><Label>Default location</Label><Switch checked={form.is_default} onCheckedChange={value => setForm({ ...form, is_default: value })} /></div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.active} onCheckedChange={value => setForm({ ...form, active: value })} /></div>
            <Button className="w-full" onClick={save} disabled={!form.name}>Save Location</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
