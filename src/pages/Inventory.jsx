import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/ui/PullToRefresh';
import { Plus, Pencil, Trash2, Package, Search, AlertTriangle, Loader2, X, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getVendorContext } from '@/lib/vendorContext';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    description: '',
    price: '',
    cost: '',
    stock_quantity: '',
    low_stock_threshold: '5',
    images: [],
    sizes: '',
    colors: ''
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

      const data = await base44.entities.InventoryItem.filter({ business_id: context.businessId });
      setItems(data);
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

  const removeImage = (index) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const openDialog = (item = null) => {
    if (item) {
      setEditing(item);
      setForm({
        name: item.name || '',
        sku: item.sku || '',
        category: item.category || '',
        description: item.description || '',
        price: item.price?.toString() || '',
        cost: item.cost?.toString() || '',
        stock_quantity: item.stock_quantity?.toString() || '',
        low_stock_threshold: item.low_stock_threshold?.toString() || '5',
        images: item.images || [],
        sizes: item.sizes?.join(', ') || '',
        colors: item.colors?.join(', ') || ''
      });
    } else {
      setEditing(null);
      setForm({
        name: '',
        sku: '',
        category: '',
        description: '',
        price: '',
        cost: '',
        stock_quantity: '',
        low_stock_threshold: '5',
        images: [],
        sizes: '',
        colors: ''
      });
    }
    setDialogOpen(true);
  };

  const saveItem = async () => {
    if (!businessId) return;
    const data = {
      business_id: businessId,
      name: form.name,
      sku: form.sku,
      category: form.category,
      description: form.description,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      stock_quantity: parseInt(form.stock_quantity) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
      images: form.images,
      sizes: form.sizes.split(',').map(s => s.trim()).filter(Boolean),
      colors: form.colors.split(',').map(s => s.trim()).filter(Boolean)
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadItems}>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
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
            <Button onClick={() => openDialog()} className="bg-violet-600 hover:bg-violet-700">
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
          </div>
        </div>

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

            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Shirts, Pants, Accessories"
              />
            </div>

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