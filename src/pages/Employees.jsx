import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Shield, User, Loader2, X, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { MobileSelect, MobileSelectItem } from '@/components/ui/MobileSelect';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    photo_url: '',
    role: 'sales_associate',
    permissions: {
      view_metrics: false,
      view_payroll: false,
      edit_floor_plan: false,
      view_procedures: false,
      manage_inventory: false,
      process_checkout: true,
      send_notifications: false
    }
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const data = await base44.entities.Employee.list();
      setEmployees(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, photo_url: file_url }));
    } catch (err) {
      console.error(err);
    }
  };

  const openDialog = (employee = null) => {
    if (employee) {
      setEditing(employee);
      setForm({
        name: employee.name,
        email: employee.email,
        photo_url: employee.photo_url || '',
        role: employee.role || 'sales_associate',
        permissions: employee.permissions || {
          view_metrics: false,
          view_payroll: false,
          edit_floor_plan: false,
          view_procedures: false,
          manage_inventory: false,
          process_checkout: true,
          send_notifications: false
        }
      });
    } else {
      setEditing(null);
      setForm({
        name: '',
        email: '',
        photo_url: '',
        role: 'sales_associate',
        permissions: {
          view_metrics: false,
          view_payroll: false,
          edit_floor_plan: false,
          view_procedures: false,
          manage_inventory: false,
          process_checkout: true,
          send_notifications: false
        }
      });
    }
    setDialogOpen(true);
  };

  const saveEmployee = async () => {
    const formData = { ...form };

    // Optimistic update
    if (editing) {
      setEmployees(prev => prev.map(e => e.id === editing.id ? { ...e, ...formData } : e));
    } else {
      const tempId = `temp-${Date.now()}`;
      setEmployees(prev => [...prev, { id: tempId, ...formData }]);
    }
    setDialogOpen(false);

    try {
      if (editing) {
        await base44.entities.Employee.update(editing.id, formData);
      } else {
        await base44.entities.Employee.create(formData);
      }
      loadEmployees();
    } catch (err) {
      console.error(err);
      loadEmployees();
    }
  };

  const deleteEmployee = async (id) => {
    if (!confirm('Are you sure you want to remove this employee?')) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
    try {
      await base44.entities.Employee.delete(id);
    } catch (err) {
      console.error(err);
      loadEmployees();
    }
  };

  const togglePermission = (key) => {
    setForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  const permissionLabels = {
    view_metrics: 'View Metrics',
    view_payroll: 'View Payroll',
    edit_floor_plan: 'Edit Floor Plan',
    view_procedures: 'View Procedures',
    manage_inventory: 'Manage Inventory',
    process_checkout: 'Process Checkout',
    send_notifications: 'Send Notifications'
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Employees</h1>
            <p className="text-slate-500">Manage your team and their permissions</p>
          </div>
          <Button onClick={() => openDialog()} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4 mr-2" /> Add Employee
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {employees.map((emp) => (
            <Card key={emp.id} className="border-0 shadow-lg overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                      <User className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{emp.name}</h3>
                    <p className="text-sm text-slate-500 truncate">{emp.email}</p>
                    <Badge className={`mt-2 ${emp.role === 'manager' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>
                      {emp.role === 'manager' && <Shield className="w-3 h-3 mr-1" />}
                      {emp.role?.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Button size="sm" variant="outline" onClick={() => openDialog(emp)} className="flex-1">
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deleteEmployee(emp.id)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {employees.length === 0 && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Employees Yet</h3>
              <p className="text-slate-500 mb-4">Add your first team member to get started</p>
              <Button onClick={() => openDialog()} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="w-4 h-4 mr-2" /> Add Employee
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <label className="cursor-pointer relative">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="" className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center">
                    <Camera className="w-8 h-8 text-slate-400" />
                  </div>
                )}
                <div className="absolute bottom-0 right-0 w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              </label>
            </div>

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full Name"
              />
            </div>

            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <MobileSelect value={form.role} onValueChange={(v) => setForm({ ...form, role: v })} placeholder="Select role">
                <MobileSelectItem value="manager">Manager</MobileSelectItem>
                <MobileSelectItem value="sales_associate">Sales Associate</MobileSelectItem>
                <MobileSelectItem value="cashier">Cashier</MobileSelectItem>
              </MobileSelect>
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              {Object.entries(permissionLabels).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-700">{label}</span>
                  <Switch
                    checked={form.permissions[key]}
                    onCheckedChange={() => togglePermission(key)}
                  />
                </div>
              ))}
            </div>

            <Button onClick={saveEmployee} className="w-full bg-violet-600 hover:bg-violet-700" disabled={!form.name || !form.email}>
              {editing ? 'Save Changes' : 'Add Employee'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}