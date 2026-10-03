import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { HelpCircle, Building2 } from 'lucide-react';
export default function Support(){const navigate=useNavigate(); return <div className="min-h-screen bg-slate-50 p-6"><div className="max-w-2xl mx-auto"><h1 className="text-3xl font-bold mb-2">Support</h1><p className="text-slate-500 mb-6">Help for store setup, employees, inventory, checkout, and customer workflows.</p><div className="space-y-3"><Button variant="outline" className="w-full h-14 justify-start" onClick={()=>navigate(createPageUrl('FAQ'))}><HelpCircle className="w-5 h-5 mr-3"/>Open FAQs</Button><Button variant="outline" className="w-full h-14 justify-start" onClick={()=>navigate(createPageUrl('BusinessSetup'))}><Building2 className="w-5 h-5 mr-3"/>Business Settings</Button></div></div></div>}
