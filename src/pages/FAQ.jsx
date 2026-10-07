import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
const FAQS=[
 ['How do customer check-ins work?','Linked Concierge customers check in from the shopper app. Concierge Pro creates a store visit and customer record for your business and location.'],
 ['Who can see customer information?','Access is scoped to the employee’s trusted business membership. Managers can see store-wide customers; associates work with unassigned or assigned customers.'],
 ['How do size recommendations work?','Enter product size-chart ranges in centimeters in Inventory and sync the catalog. The customer app compares those ranges with the shopper’s measurements.'],
 ['How do fitting-room mirrors work?','Queue products from Customer Detail, then open the fitting room’s Mirror Display in a browser-capable screen. It refreshes automatically.'],
 ['Why are card payments disabled?','A production payment provider must be configured server-side before card or mobile payments are enabled. Cash transactions can be recorded now.'],
 ['How do customer campaigns work?','Campaigns deliver to linked Concierge customers as in-app notifications and attempt email delivery. Failed delivery remains visible for follow-up.']
];
export default function FAQ(){return <div className="min-h-screen bg-slate-50/85 p-6"><div className="max-w-4xl mx-auto"><h1 className="text-3xl font-bold mb-6">FAQ</h1><div className="space-y-3">{FAQS.map(([q,a])=><Card key={q}><CardContent className="p-5"><h2 className="font-semibold">{q}</h2><p className="text-slate-600 mt-2">{a}</p></CardContent></Card>)}</div></div></div>}