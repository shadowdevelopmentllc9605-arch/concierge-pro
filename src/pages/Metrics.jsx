import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, TableIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getVendorContext } from '@/lib/vendorContext';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, getHours, eachDayOfInterval, eachMonthOfInterval } from 'date-fns';

// 2-hour time blocks
const TIME_BLOCKS = [
  { label: '8am–10am', start: 8, end: 10 },
  { label: '10am–12pm', start: 10, end: 12 },
  { label: '12pm–2pm', start: 12, end: 14 },
  { label: '2pm–4pm', start: 14, end: 16 },
  { label: '4pm–6pm', start: 16, end: 18 },
  { label: '6pm–8pm', start: 18, end: 20 },
  { label: '8pm–Close', start: 20, end: 24 },
];

function computeBlockMetrics(purchases, customers, blockStart, blockEnd) {
  const blockPurchases = purchases.filter(p => {
    const h = getHours(new Date(p.created_date));
    return h >= blockStart && h < blockEnd;
  });
  const blockVisitors = customers.filter(c => {
    if (!c.entered_at) return false;
    const h = getHours(new Date(c.entered_at));
    return h >= blockStart && h < blockEnd;
  });

  const transactions = blockPurchases.length;
  const visitors = blockVisitors.length;
  const revenue = blockPurchases.reduce((s, p) => s + (p.total || 0), 0);
  const units = blockPurchases.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0);
  const conversion = visitors > 0 ? (transactions / visitors) * 100 : 0;
  const upt = transactions > 0 ? units / transactions : 0;
  const ads = transactions > 0 ? revenue / transactions : 0;

  return { visitors, transactions, revenue, units, conversion, upt, ads };
}

function getDayRange(dateStr) {
  const d = new Date(dateStr);
  return { start: startOfDay(d), end: endOfDay(d) };
}

function getMonthRange(dateStr) {
  const d = new Date(dateStr);
  return { start: startOfMonth(d), end: endOfMonth(d) };
}

function getYearRange(dateStr) {
  const d = new Date(dateStr);
  return { start: startOfYear(d), end: endOfYear(d) };
}

function filterByRange(purchases, customers, start, end) {
  return {
    purchases: purchases.filter(p => {
      const d = new Date(p.created_date);
      return d >= start && d <= end;
    }),
    customers: customers.filter(c => {
      if (!c.entered_at) return false;
      const d = new Date(c.entered_at);
      return d >= start && d <= end;
    })
  };
}

export default function Metrics() {
  const [purchases, setPurchases] = useState([]);
  const [customers, setCustomers] = useState([]); // StoreVisit events; name retained to minimize rendering churn
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [viewMode, setViewMode] = useState('day'); // day | month | year
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState(format(new Date(), 'yyyy'));

  const loadData = useCallback(async () => {
    try {
      const context = await getVendorContext();

      if (!context.businessId) {
        setPurchases([]);
        setCustomers([]);
        setLastRefresh(new Date());
        return;
      }

      const [purchaseData, customerData] = await Promise.all([
        base44.entities.Purchase.filter({ status: 'completed', business_id: context.businessId }),
        base44.entities.StoreVisit.filter({ business_id: context.businessId })
      ]);
      setPurchases(purchaseData);
      setCustomers(customerData);
      setLastRefresh(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Real-time refresh every 60s
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Navigate date/month/year
  const navigate = (dir) => {
    if (viewMode === 'day') {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + dir);
      setSelectedDate(format(d, 'yyyy-MM-dd'));
    } else if (viewMode === 'month') {
      const d = new Date(selectedMonth + '-01');
      d.setMonth(d.getMonth() + dir);
      setSelectedMonth(format(d, 'yyyy-MM'));
    } else {
      setSelectedYear(y => String(parseInt(y) + dir));
    }
  };

  const isToday = viewMode === 'day' && selectedDate === format(new Date(), 'yyyy-MM-dd');
  const isCurrentMonth = viewMode === 'month' && selectedMonth === format(new Date(), 'yyyy-MM');
  const isCurrentYear = viewMode === 'year' && selectedYear === format(new Date(), 'yyyy');
  const isCurrent = isToday || isCurrentMonth || isCurrentYear;

  // ---- DAY VIEW: 2-hour block data ----
  const { start: dayStart, end: dayEnd } = getDayRange(selectedDate);
  const { purchases: dayPurchases, customers: dayCustomers } = filterByRange(purchases, customers, dayStart, dayEnd);
  const blockRows = TIME_BLOCKS.map(block => ({
    ...block,
    ...computeBlockMetrics(dayPurchases, dayCustomers, block.start, block.end)
  }));
  const dayTotals = {
    visitors: dayCustomers.length,
    transactions: dayPurchases.length,
    revenue: dayPurchases.reduce((s, p) => s + (p.total || 0), 0),
    units: dayPurchases.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0),
    conversion: dayCustomers.length > 0 ? (dayPurchases.length / dayCustomers.length) * 100 : 0,
    upt: dayPurchases.length > 0
      ? dayPurchases.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0) / dayPurchases.length : 0,
    ads: dayPurchases.length > 0
      ? dayPurchases.reduce((s, p) => s + (p.total || 0), 0) / dayPurchases.length : 0,
  };

  // ---- MONTH VIEW: daily rows ----
  const { start: monthStart, end: monthEnd } = getMonthRange(selectedMonth + '-01');
  const { purchases: monthPurchases, customers: monthCustomers } = filterByRange(purchases, customers, monthStart, monthEnd);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthRows = daysInMonth.map(day => {
    const { start, end } = getDayRange(format(day, 'yyyy-MM-dd'));
    const { purchases: dp, customers: dc } = filterByRange(monthPurchases, monthCustomers, start, end);
    const transactions = dp.length;
    const visitors = dc.length;
    const revenue = dp.reduce((s, p) => s + (p.total || 0), 0);
    const units = dp.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0);
    return {
      label: format(day, 'EEE, MMM d'),
      visitors, transactions, revenue, units,
      conversion: visitors > 0 ? (transactions / visitors) * 100 : 0,
      upt: transactions > 0 ? units / transactions : 0,
      ads: transactions > 0 ? revenue / transactions : 0,
    };
  }).filter(r => r.transactions > 0 || r.visitors > 0);
  const monthTotals = {
    visitors: monthCustomers.length,
    transactions: monthPurchases.length,
    revenue: monthPurchases.reduce((s, p) => s + (p.total || 0), 0),
    units: monthPurchases.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0),
    conversion: monthCustomers.length > 0 ? (monthPurchases.length / monthCustomers.length) * 100 : 0,
    upt: monthPurchases.length > 0
      ? monthPurchases.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0) / monthPurchases.length : 0,
    ads: monthPurchases.length > 0
      ? monthPurchases.reduce((s, p) => s + (p.total || 0), 0) / monthPurchases.length : 0,
  };

  // ---- YEAR VIEW: monthly rows ----
  const { start: yearStart, end: yearEnd } = getYearRange(`${selectedYear}-01-01`);
  const { purchases: yearPurchases, customers: yearCustomers } = filterByRange(purchases, customers, yearStart, yearEnd);
  const monthsInYear = eachMonthOfInterval({ start: yearStart, end: yearEnd });
  const yearRows = monthsInYear.map(month => {
    const { start, end } = getMonthRange(format(month, 'yyyy-MM-dd'));
    const { purchases: mp, customers: mc } = filterByRange(yearPurchases, yearCustomers, start, end);
    const transactions = mp.length;
    const visitors = mc.length;
    const revenue = mp.reduce((s, p) => s + (p.total || 0), 0);
    const units = mp.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0);
    return {
      label: format(month, 'MMMM'),
      visitors, transactions, revenue, units,
      conversion: visitors > 0 ? (transactions / visitors) * 100 : 0,
      upt: transactions > 0 ? units / transactions : 0,
      ads: transactions > 0 ? revenue / transactions : 0,
    };
  });
  const yearTotals = {
    visitors: yearCustomers.length,
    transactions: yearPurchases.length,
    revenue: yearPurchases.reduce((s, p) => s + (p.total || 0), 0),
    units: yearPurchases.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0),
    conversion: yearCustomers.length > 0 ? (yearPurchases.length / yearCustomers.length) * 100 : 0,
    upt: yearPurchases.length > 0
      ? yearPurchases.reduce((s, p) => s + (p.items?.reduce((a, i) => a + (i.quantity || 0), 0) || 0), 0) / yearPurchases.length : 0,
    ads: yearPurchases.length > 0
      ? yearPurchases.reduce((s, p) => s + (p.total || 0), 0) / yearPurchases.length : 0,
  };

  const activeRows = viewMode === 'day' ? blockRows : viewMode === 'month' ? monthRows : yearRows;
  const activeTotals = viewMode === 'day' ? dayTotals : viewMode === 'month' ? monthTotals : yearTotals;

  const conversionColor = (v) => {
    if (v >= 40) return 'text-emerald-600 font-semibold';
    if (v >= 20) return 'text-amber-600 font-semibold';
    return v > 0 ? 'text-red-600 font-semibold' : 'text-slate-400';
  };

  const chartData = viewMode === 'day'
    ? blockRows.map(r => ({ label: r.label.replace('am', 'a').replace('pm', 'p'), revenue: r.revenue, conversion: r.conversion, upt: r.upt, ads: r.ads }))
    : activeRows.map(r => ({ label: r.label, revenue: r.revenue, conversion: r.conversion, upt: r.upt, ads: r.ads }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Metrics</h1>
            <div className="flex items-center gap-2 mt-1">
              {isCurrent && (
                <Badge className="bg-emerald-100 text-emerald-700 animate-pulse">● Live</Badge>
              )}
              <span className="text-sm text-slate-400">Updated {format(lastRefresh, 'h:mm:ss a')}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* View mode tabs + nav */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList className="bg-white shadow-sm">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-4 py-2 bg-white rounded-lg shadow-sm font-medium text-slate-800 min-w-[160px] text-center">
              {viewMode === 'day' && format(new Date(selectedDate), 'EEEE, MMM d yyyy')}
              {viewMode === 'month' && format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
              {viewMode === 'year' && selectedYear}
            </div>
            <Button variant="outline" size="icon" onClick={() => navigate(1)} disabled={isCurrent}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            {!isCurrent && (
              <Button variant="ghost" size="sm" onClick={() => {
                if (viewMode === 'day') setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
                else if (viewMode === 'month') setSelectedMonth(format(new Date(), 'yyyy-MM'));
                else setSelectedYear(format(new Date(), 'yyyy'));
              }}>Today</Button>
            )}
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: 'Visitors', value: activeTotals.visitors, format: v => v, color: 'blue' },
            { label: 'Transactions', value: activeTotals.transactions, format: v => v, color: 'violet' },
            { label: 'Revenue', value: activeTotals.revenue, format: v => `$${v.toFixed(2)}`, color: 'emerald' },
            { label: 'Units Sold', value: activeTotals.units, format: v => v, color: 'amber' },
            { label: 'Conversion', value: activeTotals.conversion, format: v => `${v.toFixed(1)}%`, color: 'rose' },
            { label: 'UPT', value: activeTotals.upt, format: v => v.toFixed(2), color: 'indigo' },
            { label: 'ADS', value: activeTotals.ads, format: v => `$${v.toFixed(2)}`, color: 'teal' },
          ].map(card => (
            <Card key={card.label} className="border-0 shadow-md">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                <p className="text-xl font-bold text-slate-900">{card.format(card.value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Spreadsheet Table */}
        <Card className="border-0 shadow-xl mb-6 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TableIcon className="w-5 h-5" />
              {viewMode === 'day' ? '2-Hour Breakdown' : viewMode === 'month' ? 'Daily Breakdown' : 'Monthly Breakdown'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="text-left px-4 py-3 font-medium">
                      {viewMode === 'day' ? 'Time Block' : viewMode === 'month' ? 'Date' : 'Month'}
                    </th>
                    <th className="text-right px-4 py-3 font-medium">Visitors</th>
                    <th className="text-right px-4 py-3 font-medium">Transactions</th>
                    <th className="text-right px-4 py-3 font-medium">Conversion %</th>
                    <th className="text-right px-4 py-3 font-medium">Units Sold</th>
                    <th className="text-right px-4 py-3 font-medium">UPT</th>
                    <th className="text-right px-4 py-3 font-medium">Revenue</th>
                    <th className="text-right px-4 py-3 font-medium">ADS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row, i) => (
                    <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-violet-50 transition-colors`}>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {viewMode === 'day' ? row.label : row.label}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.visitors}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.transactions}</td>
                      <td className={`px-4 py-3 text-right ${conversionColor(row.conversion)}`}>
                        {row.conversion > 0 ? `${row.conversion.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.units}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {row.upt > 0 ? row.upt.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {row.revenue > 0 ? `$${row.revenue.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {row.ads > 0 ? `$${row.ads.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-slate-800 text-white font-semibold">
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3 text-right">{activeTotals.visitors}</td>
                    <td className="px-4 py-3 text-right">{activeTotals.transactions}</td>
                    <td className="px-4 py-3 text-right">
                      {activeTotals.conversion > 0 ? `${activeTotals.conversion.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{activeTotals.units}</td>
                    <td className="px-4 py-3 text-right">
                      {activeTotals.upt > 0 ? activeTotals.upt.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">${activeTotals.revenue.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {activeTotals.ads > 0 ? `$${activeTotals.ads.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">Revenue & ADS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tick={{ fontSize: 10 }} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={v => `$${v}`} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(v, name) => [`$${Number(v).toFixed(2)}`, name === 'revenue' ? 'Revenue' : 'ADS']}
                    />
                    <Bar dataKey="revenue" fill="#8b5cf6" radius={[4,4,0,0]} name="revenue" />
                    <Bar dataKey="ads" fill="#10b981" radius={[4,4,0,0]} name="ads" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">Conversion % & UPT</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickFormatter={v => `${v}%`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(v, name) => [
                        name === 'conversion' ? `${Number(v).toFixed(1)}%` : Number(v).toFixed(2),
                        name === 'conversion' ? 'Conversion' : 'UPT'
                      ]}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="conversion" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="conversion" />
                    <Line yAxisId="right" type="monotone" dataKey="upt" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="upt" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Legend */}
        <div className="mt-6 p-4 bg-white rounded-xl shadow-sm flex flex-wrap gap-6 text-sm text-slate-600">
          <div><span className="font-semibold">Conversion</span> = Buyers ÷ Visitors × 100</div>
          <div><span className="font-semibold">UPT</span> = Units Per Transaction</div>
          <div><span className="font-semibold">ADS</span> = Average Dollar Sale</div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> ≥40% conversion
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block ml-2" /> 20–39%
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block ml-2" /> &lt;20%
          </div>
        </div>
      </div>
    </div>
  );
}