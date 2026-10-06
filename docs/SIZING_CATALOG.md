# Verified brand sizing catalog

Concierge Pro uses this catalog to help retailers attach verified brand sizing to inventory before products sync to The Concierge.

- Snapshot: 2026-10-06
- Verified chart records: 14
- Normalized size rows: 108
- Brand-family / ownership relationships: 41
- Initial market focus: US sizing

## Retailer workflow

A retailer can select a verified brand chart in Inventory. The chart is copied into the inventory item's product sizing data, where it can still be edited for a garment-specific override. The existing authenticated catalog bridge then sends that chart to the linked shopper product.

## Shopper priority

1. Retailer/product-specific chart
2. Verified brand catalog chart
3. Generic profile estimate

Measurements are normalized to centimeters and retain source attribution. Parent/brand relationships are stored separately from physical manufacturing relationships because brands often use multiple contract factories and sourcing partners.
