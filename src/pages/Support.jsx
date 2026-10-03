import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { HelpCircle, Building2, RefreshCw } from 'lucide-react';

export default function Support(){
  const navigate=useNavigate();
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState('');

  const retrySync=async()=>{
    setSyncing(true);
    setSyncMessage('');
    try{
      const response=await base44.functions.invoke('retryIntegrationSyncs',{});
      const result=response?.data||response;
      const failures=result?.failures?.length||0;
      setSyncMessage(
        failures
          ? `Retried ${result.attempted||0} event(s): ${result.completed||0} completed, ${failures} still pending.`
          : `Sync is healthy. ${result.completed||0} pending event(s) were completed.`
      );
    }catch(error){
      setSyncMessage(error?.response?.data?.error||error?.message||'Sync retry could not run.');
    }finally{
      setSyncing(false);
    }
  };

  return <div className="min-h-screen bg-slate-50 p-6"><div className="max-w-2xl mx-auto">
    <h1 className="text-3xl font-bold mb-2">Support</h1>
    <p className="text-slate-500 mb-6">Help for store setup, employees, inventory, checkout, and customer workflows.</p>
    <div className="space-y-3">
      <Button variant="outline" className="w-full h-14 justify-start" onClick={()=>navigate(createPageUrl('FAQ'))}><HelpCircle className="w-5 h-5 mr-3"/>Open FAQs</Button>
      <Button variant="outline" className="w-full h-14 justify-start" onClick={retrySync} disabled={syncing}><RefreshCw className={`w-5 h-5 mr-3 ${syncing?'animate-spin':''}`}/>Retry Customer-App Sync</Button>
      <Button variant="outline" className="w-full h-14 justify-start" onClick={()=>navigate(createPageUrl('BusinessSetup'))}><Building2 className="w-5 h-5 mr-3"/>Business Settings</Button>
    </div>
    {syncMessage&&<p className="mt-4 text-sm text-slate-600">{syncMessage}</p>}
  </div></div>;
}
