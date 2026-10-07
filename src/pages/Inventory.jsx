import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/ui/PullToRefresh';
import { Plus, Pencil, Trash2, Package, Search, AlertTriangle, Loader2, X, Image, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getVendorContext } from '@/lib/vendorContext';

const normalizeBrandKey = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const inferCategoryGroup = (category = '') => {
  const value = String(category).toLowerCase();
  if (/underwear|brief|boxer|bra|panty|lingerie|bralette|sleepwear/.test(value)) return 'underwear';
  if (/suit|tuxedo|formal jacket/.test(value)) return 'suits';
  if (/pant|jean|short|khaki|trouser|bottom/.test(value)) return 'bottoms';
  if (/dress|skirt|jumper/.test(value)) return 'dresses';
  if (/hat|cap|beanie|headwear/.test(value)) return 'headwear';
  if (/shoe|boot|sneaker|footwear/.test(value)) return 'footwear';
  if (/coat|parka|outerwear/.test(value)) return 'outerwear';
  if (/shirt|top|tee|t-shirt|polo|vest|blouse|sweater|hoodie/.test(value)) return 'tops';
  return '';
};

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [brandCharts, setBrandCharts] = useState([]);
  const [selectedBrandChartId, setSelectedBrandChartId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [form, setForm] = useState({
    name: '',
    sku: '',
    brand: '',
    style_type: 'casual',
    category: '',
    footwear_type: 'all',
    width_options: '',
    footwear_last_name: '',
    footwear_fit_profile: 'unknown',
    footwear_size_adjustment_steps: '0',
    footwear_sock_profile: 'not_applicable',
    footwear_fit_notes: '',
    location_id: '',
    description: '',
    price: '',
    cost: '',
    stock_quantity: '',
    low_stock_threshold: '5',
    images: [],
    sizes: '',
    colors: '',
    dimension_width: '',
    dimension_height: '',
    dimension_depth: '',
    dimension_unit: 'inches',
    tryOn_image: '',
    size_chart_measurement_basis: 'body',
    garment_fit_cut: 'unknown',
    garment_stretch_level: 'unknown',
    garment_fabric_behavior: 'unknown',
    garment_layering_allowance: 'unknown',
    garment_fit_notes: '',
    garment_fit_source: '',
    garment_fit_source_url: '',
    garment_measurements_json: '[]',
    size_chart_json: '[]',
    variants_json: '[]'
  });

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const context = await getVendorContext();
      setBusinessId(context.businessId);

      if (!context.businessId) {
        setItems([]);
        return;
      }

      const [data, locationData, sizingData] = await Promise.all([
        base44.entities.InventoryItem.filter({ business_id: context.businessId }),
        base44.entities.BusinessLocation.filter({ business_id: context.businessId, active: true }),
        base44.entities.BrandSizeChart.filter({ active: true })
      ]);
      setItems(data);
      setLocations(locationData);
      setBrandCharts(sizingData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    try {
      const urls = await Promise.all(
        files.map(async (file) => {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          return file_url;
        })
      );
      setForm(prev => ({ ...prev, images: [...(prev.images || []), ...urls] }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleTryOnUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, tryOn_image: file_url }));
    } catch (err) {
      console.error(err);
    }
  };

  const syncToCustomerApp = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const response = await base44.functions.invoke('syncVendorCatalog', {});
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Catalog sync failed.');
      setSyncMessage(`Synced ${result.syncedItems || 0} item(s) to The Concierge.`);
      await loadItems();
    } catch (err) {
      setSyncMessage(err?.response?.data?.error || err?.message || 'Catalog sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const removeImage = (index) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const openDialog = (item = null) => {
    setSelectedBrandChartId('');
    if (item) {
      setEditing(item);
      setForm({
        name: item.name || '',
        sku: item.sku || '',
        brand: item.brand || '',
        style_type: item.style_type || 'casual',
        category: item.category || '',
        footwear_type: item.footwear_type || 'all',
        width_options: item.width_options?.join(', ') || '',
        footwear_last_name: item.footwear_fit?.last_name || '',
        footwear_fit_profile: item.footwear_fit?.fit_profile || 'unknown',
        footwear_size_adjustment_steps: String(item.footwear_fit?.size_adjustment_steps || 0),
        footwear_sock_profile: item.footwear_fit?.sock_profile || 'not_applicable',
        footwear_fit_notes: item.footwear_fit?.fit_notes || '',
        location_id: item.location_id || '',
        description: item.description || '',
        price: item.price?.toString() || '',
        cost: item.cost?.toString() || '',
        stock_quantity: item.stock_quantity?.toString() || '',
        low_stock_threshold: item.low_stock_threshold?.toString() || '5',
        images: item.images || [],
        sizes: item.sizes?.join(', ') || '',
        colors: item.colors?.join(', ') || '',
        dimension_width: item.dimensions?.width?.toString() || '',
        dimension_height: item.dimensions?.height?.toString() || '',
        dimension_depth: item.dimensions?.depth?.toString() || '',
        dimension_unit: item.dimensions?.unit || 'inches',
        tryOn_image: item.tryOn_image || '',
        size_chart_measurement_basis: item.size_chart_measurement_basis || 'body',
        garment_fit_cut: item.garment_fit?.fit_cut || 'unknown',
        garment_stretch_level: item.garment_fit?.stretch_level || 'unknown',
        garment_fabric_behavior: item.garment_fit?.fabric_behavior || 'unknown',
        garment_layering_allowance: item.garment_fit?.layering_allowance || 'unknown',
        garment_fit_notes: item.garment_fit?.intended_fit_notes || '',
        garment_fit_source: item.garment_fit?.data_source || '',
        garment_fit_source_url: item.garment_fit?.source_url || '',
        garment_measurements_json: JSON.stringify(item.garment_measurements || [], null, 2),
        size_chart_json: JSON.stringify(item.size_chart || [], null, 2),
        variants_json: JSON.stringify(item.variants || [], null, 2)
      });
    } else {
      setEditing(null);
      setForm({
        name: '',
        sku: '',
        brand: '',
        style_type: 'casual',
        category: '',
        footwear_type: 'all',
        width_options: '',
        footwear_last_name: '',
        footwear_fit_profile: 'unknown',
        footwear_size_adjustment_steps: '0',
        footwear_sock_profile: 'not_applicable',
        footwear_fit_notes: '',
        location_id: '',
        description: '',
        price: '',
        cost: '',
        stock_quantity: '',
        low_stock_threshold: '5',
        images: [],
        sizes: '',
        colors: '',
        dimension_width: '',
        dimension_height: '',
        dimension_depth: '',
        dimension_unit: 'inches',
        tryOn_image: '',
        size_chart_measurement_basis: 'body',
        garment_fit_cut: 'unknown',
        garment_stretch_level: 'unknown',
        garment_fabric_behavior: 'unknown',
        garment_layering_allowance: 'unknown',
        garment_fit_notes: '',
        garment_fit_source: '',
        garment_fit_source_url: '',
        garment_measurements_json: '[]',
        size_chart_json: '[]',
        variants_json: '[]'
      });
    }
    setDialogOpen(true);
  };

  const saveItem = async () => {
    if (!businessId) return;

    let sizeChart = [];
    let garmentMeasurements = [];
    let variants = [];
    try {
      sizeChart = JSON.parse(form.size_chart_json || '[]');
      garmentMeasurements = JSON.parse(form.garment_measurements_json || '[]');
      variants = JSON.parse(form.variants_json || '[]');
      if (!Array.isArray(sizeChart) || !Array.isArray(garmentMeasurements) || !Array.isArray(variants)) throw new Error('arrays required');
    } catch {
      alert('Size chart, garment measurements, and variant stock must be valid JSON arrays.');
      return;
    }

    const totalVariantStock = variants.length
      ? variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock_quantity || 0)), 0)
      : null;

    const data = {
      business_id: businessId,
      name: form.name,
      sku: form.sku,
      brand: form.brand,
      style_type: form.style_type,
      category: form.category,
      footwear_type: form.footwear_type || 'all',
      width_options: form.width_options.split(',').map(s => s.trim()).filter(Boolean),
      footwear_fit: {
        last_name: form.footwear_last_name || '',
        fit_profile: form.footwear_fit_profile || 'unknown',
        size_adjustment_steps: Number(form.footwear_size_adjustment_steps || 0),
        sock_profile: form.footwear_sock_profile || 'not_applicable',
        fit_notes: form.footwear_fit_notes || ''
      },
      location_id: form.location_id,
      description: form.description,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      stock_quantity: totalVariantStock ?? (parseInt(form.stock_quantity) || 0),
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
      images: form.images,
      sizes: form.sizes.split(',').map(s => s.trim()).filter(Boolean),
      colors: form.colors.split(',').map(s => s.trim()).filter(Boolean),
      tryOn_image: form.tryOn_image || '',
      size_chart_measurement_basis: form.size_chart_measurement_basis || 'body',
      size_chart: sizeChart,
      garment_fit: {
        fit_cut: form.garment_fit_cut || 'unknown',
        stretch_level: form.garment_stretch_level || 'unknown',
        fabric_behavior: form.garment_fabric_behavior || 'unknown',
        layering_allowance: form.garment_layering_allowance || 'unknown',
        intended_fit_notes: form.garment_fit_notes || '',
        data_source: form.garment_fit_source || '',
        source_url: form.garment_fit_source_url || '',
        source_retrieved_at: form.garment_fit_source_url ? new Date().toISOString() : ''
      },
      garment_measurements: garmentMeasurements,
      variants,
      dimensions: {
        width: parseFloat(form.dimension_width) || 0,
        height: parseFloat(form.dimension_height) || 0,
        depth: parseFloat(form.dimension_depth) || 0,
        unit: form.dimension_unit || 'inches'
      }
    };

    // Optimistic update
    if (editing) {
      setItems(prev => prev.map(i => i.id === editing.id ? { ...i, ...data } : i));
    } else {
      const tempId = `temp-${Date.now()}`;
      setItems(prev => [{ id: tempId, ...data }, ...prev]);
    }
    setDialogOpen(false);

    try {
      if (editing) {
        await base44.entities.InventoryItem.update(editing.id, data);
      } else {
        await base44.entities.InventoryItem.create(data);
      }
      loadItems(); // reconcile with server
    } catch (err) {
      console.error(err);
      loadItems(); // revert on error
    }
  };

  const deleteItem = async (id) => {
    if (!confirm('Delete this item?')) return;
    // Optimistic remove
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await base44.entities.InventoryItem.delete(id);
    } catch (err) {
      console.error(err);
      loadItems();
    }
  };

  const filtered = items.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.sku?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = items.filter(i => i.stock_quantity <= (i.low_stock_threshold || 5)).length;

  const inferredCategoryGroup = inferCategoryGroup(form.category);
  const availableBrandCharts = brandCharts.filter(chart => {
    if (normalizeBrandKey(chart.brand_key || chart.brand_name) !== normalizeBrandKey(form.brand)) return false;
    if (!inferredCategoryGroup) return true;
    if (chart.category_group === inferredCategoryGroup) {
      if (inferredCategoryGroup !== 'footwear' || !form.footwear_type || form.footwear_type === 'all') return true;
      return !chart.footwear_type || chart.footwear_type === 'all' || chart.footwear_type === form.footwear_type;
    }
    return inferredCategoryGroup === 'outerwear' && chart.category_group === 'tops';
  });
  const selectedBrandChart = brandCharts.find(chart => chart.id === selectedBrandChartId) || null;

  const applyVerifiedChart = (chartId) => {
    setSelectedBrandChartId(chartId);
    const chart = brandCharts.find(item => item.id === chartId);
    if (!chart) return;
    const widths = Array.from(new Set((chart.entries || []).map(row => row.width_code).filter(Boolean)));
    setForm(prev => ({
      ...prev,
      footwear_type: chart.footwear_type && chart.footwear_type !== 'all' ? chart.footwear_type : prev.footwear_type,
      width_options: widths.length ? widths.join(', ') : prev.width_options,
      footwear_last_name: chart.last_name || prev.footwear_last_name,
      footwear_size_adjustment_steps: String(chart.size_adjustment_steps || 0),
      footwear_sock_profile: chart.sock_profile || prev.footwear_sock_profile,
      footwear_fit_notes: chart.fit_guidance || prev.footwear_fit_notes,
      size_chart_measurement_basis: chart.measurement_basis || 'body',
      size_chart_json: JSON.stringify(chart.entries || [], null, 2)
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadItems}>
    <div className="min-h-screen bg-slate-50/85 dark:bg-slate-900/85 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Inventory</h1>
            <p className="text-slate-500">{items.length} items • {lowStockCount} low stock</p>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-10 w-64"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={syncToCustomerApp} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync Customer App
            </Button>
            <Button onClick={() => openDialog()} className="bg-violet-600 hover:bg-violet-700">
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
          </div>
        </div>

        {syncMessage && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            {syncMessage}
          </div>
        )}

        {lowStockCount > 0 && (
          <Card className="border-amber-200 bg-amber-50 mb-6">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span className="text-amber-800 font-medium">{lowStockCount} items are running low on stock</span>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.images?.[0] ? (
                        <img src={item.images[0]} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        {item.sizes?.length > 0 && (
                          <p className="text-xs text-slate-500">{item.sizes.join(', ')}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">{item.sku || '-'}</TableCell>
                  <TableCell>
                    {item.category && (
                      <Badge variant="secondary">{item.category}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">${item.price?.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Badge className={item.stock_quantity <= (item.low_stock_threshold || 5) 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-emerald-100 text-emerald-700'
                    }>
                      {item.stock_quantity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openDialog(item)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {filtered.length === 0 && (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No items found</p>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Images</Label>
              <div className="flex flex-wrap gap-2">
                {form.images?.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      aria-label="Remove product image"
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center cursor-pointer hover:border-violet-400 transition">
                  <Image className="w-6 h-6 text-slate-400" />
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Product name"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="SKU-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Brand</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => {
                    setSelectedBrandChartId('');
                    setForm({ ...form, brand: e.target.value });
                  }}
                  placeholder="Brand"
                />
              </div>
              <div className="space-y-2">
                <Label>Style</Label>
                <select
                  value={form.style_type}
                  onChange={(e) => setForm({ ...form, style_type: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="business">Business</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                  <option value="evening">Evening</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="active">Active</option>
                  <option value="nightlife">Nightlife</option>
                  <option value="trendy">Trendy</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <select
                value={form.location_id}
                onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">All / default location</option>
                {locations.map(location => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => {
                  setSelectedBrandChartId('');
                  setForm({ ...form, category: e.target.value });
                }}
                placeholder="e.g. Shirts, Pants, Shoes, Boots"
              />
            </div>

            {inferredCategoryGroup === 'footwear' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div>
                  <Label>Footwear Type</Label>
                  <select
                    value={form.footwear_type}
                    onChange={(e) => {
                      setSelectedBrandChartId('');
                      setForm({ ...form, footwear_type: e.target.value });
                    }}
                    className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="all">General / not specified</option>
                    <option value="athletic_running">Athletic — Running</option>
                    <option value="athletic_training">Athletic — Training</option>
                    <option value="walking">Walking</option>
                    <option value="casual_sneaker">Casual Sneaker</option>
                    <option value="dress_oxford_derby">Dress — Oxford / Derby</option>
                    <option value="loafer_slipon">Loafer / Slip-on</option>
                    <option value="boot_work">Boot — Work</option>
                    <option value="boot_hiking">Boot — Hiking / Outdoor</option>
                    <option value="boot_fashion">Boot — Fashion / Dress</option>
                    <option value="sandal">Sandal</option>
                    <option value="heel_pump">Heel / Pump</option>
                    <option value="other">Other Footwear</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Available Widths</Label>
                    <Input
                      className="mt-2"
                      value={form.width_options}
                      onChange={(e) => setForm({ ...form, width_options: e.target.value })}
                      placeholder="D, E, 2E or M, W"
                    />
                  </div>
                  <div>
                    <Label>Last / Fit Family</Label>
                    <Input
                      className="mt-2"
                      value={form.footwear_last_name}
                      onChange={(e) => setForm({ ...form, footwear_last_name: e.target.value })}
                      placeholder="e.g. 65 Last"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Fit Profile</Label>
                    <select
                      value={form.footwear_fit_profile}
                      onChange={(e) => setForm({ ...form, footwear_fit_profile: e.target.value })}
                      className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="unknown">Not specified</option>
                      <option value="true_to_size">True to size</option>
                      <option value="snug">Snug</option>
                      <option value="roomy">Roomy</option>
                      <option value="runs_small">Runs small</option>
                      <option value="runs_large">Runs large</option>
                    </select>
                  </div>
                  <div>
                    <Label>Official Size Adjustment</Label>
                    <select
                      value={form.footwear_size_adjustment_steps}
                      onChange={(e) => setForm({ ...form, footwear_size_adjustment_steps: e.target.value })}
                      className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="0">No automatic adjustment</option>
                      <option value="-2">Down 1 full size</option>
                      <option value="-1">Down ½ size</option>
                      <option value="1">Up ½ size</option>
                      <option value="2">Up 1 full size</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Sock Profile</Label>
                  <select
                    value={form.footwear_sock_profile}
                    onChange={(e) => setForm({ ...form, footwear_sock_profile: e.target.value })}
                    className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="not_applicable">Not specified</option>
                    <option value="thin">Thin / dress sock</option>
                    <option value="standard">Standard sock</option>
                    <option value="thick">Thick / boot sock</option>
                    <option value="varies">Varies by use</option>
                  </select>
                </div>

                <div>
                  <Label>Official / Product Fit Notes</Label>
                  <Textarea
                    className="mt-2"
                    value={form.footwear_fit_notes}
                    onChange={(e) => setForm({ ...form, footwear_fit_notes: e.target.value })}
                    placeholder="Use only published brand/product guidance; do not guess a size adjustment."
                    rows={3}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Width-specific variants can use a width_code field in Variant Stock JSON, for example D, E, 2E, B, Wide, or Narrow.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Product description..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Cost ($)</Label>
                <Input
                  type="number"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stock Quantity</Label>
                <Input
                  type="number"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert</Label>
                <Input
                  type="number"
                  value={form.low_stock_threshold}
                  onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                  placeholder="5"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Item Dimensions</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.dimension_width}
                  onChange={(e) => setForm({ ...form, dimension_width: e.target.value })}
                  placeholder="Width"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.dimension_height}
                  onChange={(e) => setForm({ ...form, dimension_height: e.target.value })}
                  placeholder="Height"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.dimension_depth}
                  onChange={(e) => setForm({ ...form, dimension_depth: e.target.value })}
                  placeholder="Depth"
                />
                <select
                  value={form.dimension_unit}
                  onChange={(e) => setForm({ ...form, dimension_unit: e.target.value })}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="inches">inches</option>
                  <option value="cm">cm</option>
                </select>
              </div>
              <p className="text-xs text-slate-500">
                Dimensions support product placement and future fit/mirror integrations.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Virtual Try-On Asset</Label>
              <div className="flex gap-3 items-center">
                {form.tryOn_image && <img src={form.tryOn_image} alt="Try-on asset" className="w-16 h-16 object-contain bg-slate-100 rounded-lg" />}
                <label className="px-3 py-2 rounded-lg border border-slate-200 cursor-pointer text-sm">
                  Upload transparent garment image
                  <input type="file" className="hidden" accept="image/*" onChange={handleTryOnUpload} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sizes (comma separated)</Label>
                <Input
                  value={form.sizes}
                  onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                  placeholder="S, M, L, XL"
                />
              </div>
              <div className="space-y-2">
                <Label>Colors (comma separated)</Label>
                <Input
                  value={form.colors}
                  onChange={(e) => setForm({ ...form, colors: e.target.value })}
                  placeholder="Black, White, Blue"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Verified Brand Size Chart</Label>
              <select
                value={selectedBrandChartId}
                onChange={(e) => applyVerifiedChart(e.target.value)}
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                disabled={!form.brand || availableBrandCharts.length === 0}
              >
                <option value="">
                  {!form.brand
                    ? 'Enter a brand first'
                    : availableBrandCharts.length
                      ? 'Select a verified chart (optional)'
                      : 'No verified chart currently available'}
                </option>
                {availableBrandCharts.map(chart => (
                  <option key={chart.id} value={chart.id}>
                    {chart.audience} • {chart.chart_name} • {chart.region}
                  </option>
                ))}
              </select>
              {selectedBrandChart && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                  Loaded {selectedBrandChart.entries?.length || 0} verified size rows from {selectedBrandChart.brand_name}.
                  {' '}
                  <a
                    href={selectedBrandChart.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium"
                  >
                    Official source
                  </a>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Selecting a verified chart copies its centimeter measurements into this product. You can still edit the product chart below when a specific garment differs from the brand standard.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-slate-900">Fit & Construction Data</h3>
                <p className="text-xs text-slate-500 mt-1">
                  This data lets The Concierge distinguish garments that share a labeled size but fit differently.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Size Chart Basis</Label>
                  <select
                    value={form.size_chart_measurement_basis}
                    onChange={(e) => setForm({ ...form, size_chart_measurement_basis: e.target.value })}
                    className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="body">Body measurements</option>
                    <option value="garment">Finished garment measurements</option>
                    <option value="mixed">Mixed</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <div>
                  <Label>Cut / Silhouette</Label>
                  <select
                    value={form.garment_fit_cut}
                    onChange={(e) => setForm({ ...form, garment_fit_cut: e.target.value })}
                    className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="unknown">Unknown</option>
                    <option value="compression">Compression</option>
                    <option value="skinny">Skinny</option>
                    <option value="slim">Slim</option>
                    <option value="tailored">Tailored</option>
                    <option value="regular">Regular</option>
                    <option value="relaxed">Relaxed</option>
                    <option value="oversized">Oversized</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Stretch</Label>
                  <select value={form.garment_stretch_level} onChange={(e) => setForm({ ...form, garment_stretch_level: e.target.value })} className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="unknown">Unknown</option><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <div>
                  <Label>Fabric Behavior</Label>
                  <select value={form.garment_fabric_behavior} onChange={(e) => setForm({ ...form, garment_fabric_behavior: e.target.value })} className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="unknown">Unknown</option><option value="rigid">Rigid</option><option value="structured">Structured</option><option value="draped">Draped</option><option value="stretchy">Stretchy</option><option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <Label>Layering</Label>
                  <select value={form.garment_layering_allowance} onChange={(e) => setForm({ ...form, garment_layering_allowance: e.target.value })} className="mt-2 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="unknown">Unknown</option><option value="none">None</option><option value="light">Light</option><option value="standard">Standard</option><option value="heavy">Heavy</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Published Fit Notes</Label>
                <Textarea value={form.garment_fit_notes} onChange={(e) => setForm({ ...form, garment_fit_notes: e.target.value })} rows={2} className="mt-2" placeholder="e.g. tailored through chest; size up for layering" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input value={form.garment_fit_source} onChange={(e) => setForm({ ...form, garment_fit_source: e.target.value })} placeholder="Data source / manufacturer" />
                <Input value={form.garment_fit_source_url} onChange={(e) => setForm({ ...form, garment_fit_source_url: e.target.value })} placeholder="Official source URL" />
              </div>
              <div>
                <Label>Finished Garment Measurements (JSON, cm)</Label>
                <Textarea
                  value={form.garment_measurements_json}
                  onChange={(e) => setForm({ ...form, garment_measurements_json: e.target.value })}
                  rows={6}
                  className="mt-2 font-mono text-xs"
                  placeholder={'[{"size":"M","chest_cm":108,"waist_cm":102,"shoulders_cm":46,"sleeve_cm":64}]'}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Product Size Chart Override (JSON)</Label>
              <Textarea
                value={form.size_chart_json}
                onChange={(e) => {
                  setSelectedBrandChartId('');
                  setForm({ ...form, size_chart_json: e.target.value });
                }}
                rows={7}
                className="font-mono text-xs"
                placeholder={'[{"size":"M","chest_min_cm":94,"chest_max_cm":102,"waist_min_cm":80,"waist_max_cm":88}]'}
              />
              <p className="text-xs text-slate-500">Use centimeters. Product-specific values override the general brand catalog after this item syncs to The Concierge.</p>
            </div>

            <div className="space-y-2">
              <Label>Size / Color Variant Stock (JSON)</Label>
              <Textarea
                value={form.variants_json}
                onChange={(e) => setForm({ ...form, variants_json: e.target.value })}
                rows={7}
                className="font-mono text-xs"
                placeholder={'[{"size":"M","color":"Navy","sku":"SKU-M-NVY","stock_quantity":4}]'}
              />
              <p className="text-xs text-slate-500">When variants are present, total stock is calculated from the variants.</p>
            </div>

            <Button onClick={saveItem} className="w-full bg-violet-600 hover:bg-violet-700" disabled={!form.name}>
              {editing ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PullToRefresh>
  );
}