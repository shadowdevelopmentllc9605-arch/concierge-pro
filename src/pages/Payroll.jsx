import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getVendorContext } from '@/lib/vendorContext';

export default function Payroll() {
  const [context,setContext]=useState(null),[records,setRecords]=useState([]),[employees,setEmployees]=useState([]),[open,setOpen]=useState(false);
  const [form,setForm]=useState({employee_id:'',pay_period_start:'',pay_period_end:'',regular_hours:'',overtime_hours:'',gross_pay:'',notes:''});
  const load=async()=>{const ctx=await getVendorContext();setContext(ctx);if(!ctx.businessId)return;const [r,e]=await Promise.all([base44.entities.PayrollRecord.filter({business_id:ctx.businessId}),base44.entities.Employee.filter({business_id:ctx.businessId})]);setRecords(r);setEmployees(e);};
  useEffect(()=>{load().catch(console.error)},[]);
  const save=async()=>{if(!context?.isManager||!form.employee_id)return;await base44.entities.PayrollRecord.create({business_id:context.businessId,employee_id:form.employee_id,pay_period_start:form.pay_period_start,pay_period_end:form.pay_period_end,regular_hours:Number(form.regular_hours||0),overtime_hours:Number(form.overtime_hours||0),gross_pay:Number(form.gross_pay||0),notes:form.notes});setOpen(false);await load();};
  const remove=async id=>{if(!context?.isManager)return;if(confirm('Delete this payroll record?')){await base44.entities.PayrollRecord.delete(id);await load();}};
  const name=id=>employees.find(e=>e.id===id)?.name||'Employee';
  return <div className="min-h-screen bg-slate-50/85 p-6"><div className="max-w-5xl mx-auto">
    <div className="flex justify-between items-center mb-6"><div><h1 className="text-3xl font-bold">Payroll</h1><p className="text-slate-500">Protected pay-period summaries for authorized staff.</p></div>{context?.isManager&&<Button onClick={()=>setOpen(true)}><Plus className="w-4 h-4 mr-2"/>Add Record</Button>}</div>
    <div className="space-y-3">{records.map(r=><Card key={r.id}><CardContent className="p-4 flex justify-between gap-4"><div><p className="font-semibold">{name(r.employee_id)}</p><p className="text-sm text-slate-500">{r.pay_period_start} – {r.pay_period_end}</p><p className="text-sm mt-1">{Number(r.regular_hours||0)} regular hrs • {Number(r.overtime_hours||0)} OT</p></div><div className="text-right"><p className="font-bold">${Number(r.gross_pay||0).toFixed(2)}</p>{context?.isManager&&<Button size="icon" variant="ghost" className="text-red-500" onClick={()=>remove(r.id)}><Trash2 className="w-4 h-4"/></Button>}</div></CardContent></Card>)}</div>
    {records.length===0&&<p className="text-center text-slate-500 py-12">No payroll records yet.</p>}
  </div>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Add Payroll Record</DialogTitle></DialogHeader><div className="space-y-3">
    <div><Label>Employee</Label><select className="w-full h-10 border rounded px-3" value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}><option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
    <div className="grid grid-cols-2 gap-3"><div><Label>Start</Label><Input type="date" value={form.pay_period_start} onChange={e=>setForm({...form,pay_period_start:e.target.value})}/></div><div><Label>End</Label><Input type="date" value={form.pay_period_end} onChange={e=>setForm({...form,pay_period_end:e.target.value})}/></div></div>
    <div className="grid grid-cols-3 gap-3"><div><Label>Regular hrs</Label><Input type="number" value={form.regular_hours} onChange={e=>setForm({...form,regular_hours:e.target.value})}/></div><div><Label>OT hrs</Label><Input type="number" value={form.overtime_hours} onChange={e=>setForm({...form,overtime_hours:e.target.value})}/></div><div><Label>Gross pay</Label><Input type="number" value={form.gross_pay} onChange={e=>setForm({...form,gross_pay:e.target.value})}/></div></div>
    <Button className="w-full" onClick={save}>Save</Button>
  </div></DialogContent></Dialog></div>;
}