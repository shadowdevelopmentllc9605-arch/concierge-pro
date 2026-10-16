/** Convert a database purchase line to the legacy retailer-facing item shape. */
export function normalizePurchaseItem(row = {}) {
  return {
    ...row,
    name: row.product_name || 'Item',
    price: Number(row.unit_price ?? 0),
    quantity: Number(row.quantity ?? 0),
  };
}
