// Read-only projection of canonical online offers for Concierge Pro.
// This never copies stock into legacy inventory or changes payment records.
const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function normalizeRetailerOffers(offers = [], products = [], variants = [], businessId) {
  if (!businessId) return [];
  const productMap = new Map(products.map(p => [p.id, p]));
  const variantMap = new Map(variants.map(v => [v.id, v]));
  return offers.filter(offer =>
    offer.active === true && offer.business_id === String(businessId)
  ).map(offer => {
    const product = productMap.get(offer.product_master_id) || {};
    const variant = variantMap.get(offer.product_variant_id) || {};
    const sale = offer.sale_active ? numberOrNull(offer.sale_price) : null;
    const price = sale ?? numberOrNull(offer.current_price) ?? numberOrNull(offer.regular_price);
    const stock = numberOrNull(offer.stock_quantity);
    return {
      id: offer.id,
      name: product.product_name || 'Unnamed catalog product',
      brand: product.brand_name || '',
      image: product.primary_image_url || '',
      sku: offer.retailer_sku || variant.sku || '',
      variant: [variant.size_label, variant.color_name, variant.width_code && 'Width ' + variant.width_code].filter(Boolean).join(' / '),
      price,
      stock,
      availability: offer.availability || 'unknown',
      channel: offer.channel || '',
      source: 'retailer_offer',
    };
  });
}
