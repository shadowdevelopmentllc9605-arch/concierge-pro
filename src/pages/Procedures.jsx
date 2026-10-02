import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sun, Moon, CheckCircle2, Circle, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getVendorContext } from '@/lib/vendorContext';

export default function Procedures() {
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [checkedItems, setCheckedItems] = useState({ open: [], close: [] });

  useEffect(() => {
    loadBusiness();
    const saved = localStorage.getItem('procedureChecks');
    if (saved) setCheckedItems(JSON.parse(saved));
  }, []);

  const loadBusiness = async () => {
    try {
      const context = await getVendorContext();
      if (context.business) setBusiness(context.business);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveProcedures = async () => {
    setSaving(true);
    try {
      await base44.entities.Business.update(business.id, {
        open_procedures: business.open_procedures,
        close_procedures: business.close_procedures
      });
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleCheck = (type, index) => {
    setCheckedItems(prev => {
      const newChecks = { ...prev };
      if (newChecks[type].includes(index)) {
        newChecks[type] = newChecks[type].filter(i => i !== index);
      } else {
        newChecks[type] = [...newChecks[type], index];
      }
      localStorage.setItem('procedureChecks', JSON.stringify(newChecks));
      return newChecks;
    });
  };

  const resetChecks = (type) => {
    setCheckedItems(prev => {
      const newChecks = { ...prev, [type]: [] };
      localStorage.setItem('procedureChecks', JSON.stringify(newChecks));
      return newChecks;
    });
  };

  const parseSteps = (text) => {
    if (!text) return [];
    return text.split('\n').filter(line => line.trim());
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const openSteps = parseSteps(business?.open_procedures);
  const closeSteps = parseSteps(business?.close_procedures);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Store Procedures</h1>
            <p className="text-slate-500">Opening and closing checklists</p>
          </div>
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit Procedures
            </Button>
          )}
        </div>

        {editing ? (
          <Card className="border-0 shadow-xl">
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 font-medium">
                  <Sun className="w-5 h-5 text-amber-500" /> Opening Procedures
                </label>
                <Textarea
                  value={business?.open_procedures || ''}
                  onChange={(e) => setBusiness({ ...business, open_procedures: e.target.value })}
                  placeholder="Enter each step on a new line..."
                  rows={10}
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 font-medium">
                  <Moon className="w-5 h-5 text-indigo-500" /> Closing Procedures
                </label>
                <Textarea
                  value={business?.close_procedures || ''}
                  onChange={(e) => setBusiness({ ...business, close_procedures: e.target.value })}
                  placeholder="Enter each step on a new line..."
                  rows={10}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={saveProcedures} className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="open">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="open" className="flex items-center gap-2">
                <Sun className="w-4 h-4" /> Opening
              </TabsTrigger>
              <TabsTrigger value="close" className="flex items-center gap-2">
                <Moon className="w-4 h-4" /> Closing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="open">
              <Card className="border-0 shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sun className="w-5 h-5 text-amber-500" /> Opening Checklist
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => resetChecks('open')}>
                    Reset
                  </Button>
                </CardHeader>
                <CardContent>
                  {openSteps.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No opening procedures defined</p>
                  ) : (
                    <div className="space-y-3">
                      {openSteps.map((step, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition ${
                            checkedItems.open.includes(i) 
                              ? 'bg-emerald-50 border border-emerald-200' 
                              : 'bg-slate-50 hover:bg-slate-100'
                          }`}
                          onClick={() => toggleCheck('open', i)}
                        >
                          {checkedItems.open.includes(i) ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 flex-shrink-0" />
                          )}
                          <span className={checkedItems.open.includes(i) ? 'line-through text-slate-500' : ''}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm text-slate-500">
                      {checkedItems.open.length} of {openSteps.length} completed
                    </p>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-emerald-500 rounded-full h-2 transition-all"
                        style={{ width: `${(checkedItems.open.length / openSteps.length) * 100 || 0}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="close">
              <Card className="border-0 shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Moon className="w-5 h-5 text-indigo-500" /> Closing Checklist
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => resetChecks('close')}>
                    Reset
                  </Button>
                </CardHeader>
                <CardContent>
                  {closeSteps.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No closing procedures defined</p>
                  ) : (
                    <div className="space-y-3">
                      {closeSteps.map((step, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition ${
                            checkedItems.close.includes(i) 
                              ? 'bg-emerald-50 border border-emerald-200' 
                              : 'bg-slate-50 hover:bg-slate-100'
                          }`}
                          onClick={() => toggleCheck('close', i)}
                        >
                          {checkedItems.close.includes(i) ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 flex-shrink-0" />
                          )}
                          <span className={checkedItems.close.includes(i) ? 'line-through text-slate-500' : ''}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm text-slate-500">
                      {checkedItems.close.length} of {closeSteps.length} completed
                    </p>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-emerald-500 rounded-full h-2 transition-all"
                        style={{ width: `${(checkedItems.close.length / closeSteps.length) * 100 || 0}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}