import React, { useEffect, useState } from 'react';
import { UserCircle, Shield, Store } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVendorContext } from '@/lib/vendorContext';

export default function EmployeeProfile() {
  const [context, setContext] = useState(null);
  useEffect(() => { getVendorContext().then(setContext).catch(console.error); }, []);
  const employee = context?.employee;
  if (!context) return <div className="p-8">Loading…</div>;
  return <div className="min-h-screen bg-slate-50 p-6"><div className="max-w-2xl mx-auto">
    <h1 className="text-3xl font-bold mb-6">My Profile</h1>
    <Card><CardContent className="p-6">
      <div className="flex items-center gap-4 mb-6">
        {employee?.photo_url ? <img src={employee.photo_url} alt="" className="w-20 h-20 rounded-full object-cover" /> : <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center"><UserCircle className="w-9 h-9 text-slate-400" /></div>}
        <div><h2 className="text-xl font-semibold">{employee?.name || context.user?.full_name || context.user?.email}</h2><p className="text-slate-500">{employee?.email || context.user?.email}</p><Badge className="mt-2">{context.vendorRole?.replace('_',' ')}</Badge></div>
      </div>
      <div className="border-t pt-4 space-y-3">
        <p className="flex gap-2 items-center"><Store className="w-4 h-4 text-violet-600" />{context.business?.name}</p>
        <div><p className="font-medium flex gap-2 items-center"><Shield className="w-4 h-4 text-violet-600" />Permissions</p><div className="flex flex-wrap gap-2 mt-2">{Object.entries(context.permissions || {}).filter(([,v])=>v).map(([k])=><Badge key={k} variant="secondary">{k.replaceAll('_',' ')}</Badge>)}</div></div>
      </div>
    </CardContent></Card>
  </div></div>;
}
