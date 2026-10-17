// Purchase rows are already read through the business-scoped, RLS-protected
// Supabase Purchase adapter. Never combine sales from unrelated businesses.
export function getRecentOnlineOrders(purchases = [], businessId, limit = 5) {
  if (!businessId) return [];
  return purchases
    .filter(p => p.business_id === businessId && p.purchase_type === 'online')
    .sort((a, b) => Date.parse(b.created_date || b.created_at || 0) - Date.parse(a.created_date || a.created_at || 0))
    .slice(0, Math.max(0, limit));
}

export function getTodayCompletedSales(purchases = [], now = new Date()) {
  return purchases
    .filter(p => {
      if (p.status !== 'completed') return false;
      const d = new Date(p.created_date || p.created_at || '');
      return Number.isFinite(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
    })
    .reduce((sum, p) => {
      // Merchandise only: shipping and tax are separate from retailer sales.
      const subtotal = Number(p.subtotal);
      const total = Number(p.total);
      const shipping = Number(p.shipping_amount || 0);
      const tax = Number(p.tax_amount || 0);
      const merchandise = p.subtotal != null && Number.isFinite(subtotal)
        ? subtotal
        : Math.max(0, (Number.isFinite(total) ? total : 0) - shipping - tax);
      return sum + merchandise;
    }, 0);
}

export function formatOnlineOrderItems(order) {
  return (order?.items || []).map(i => {
    const details = [i.size_label, i.color_name].filter(Boolean).join(' / ');
    return `${i.product_name || i.name || 'Item'}${details ? ' (' + details + ')' : ''} ×${Number(i.quantity) || 1}`;
  }).join(', ') || 'Order details unavailable';
}
