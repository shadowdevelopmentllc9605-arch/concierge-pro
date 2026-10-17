// Only fields present in public.businesses are permitted from retailer setup.
// Never reuse an entire Supabase row, or allow the UI to edit owner / Stripe data.
export function buildBusinessSetupPayload(form, { userId, email, step, creating } = {}) {
  const name = String(form?.name || '').trim();
  if (!name) throw new Error('Enter a business name before continuing.');
  if (creating && !userId) throw new Error('Sign in before creating your business.');

  const enteredTax = Number(form?.tax_rate ?? 0);
  if (!Number.isFinite(enteredTax) || enteredTax < 0) {
    throw new Error('Enter a valid nonnegative sales tax rate.');
  }

  const data = {
    name,
    logo_url: form?.logo_url || null,
    floor_plan_url: form?.floor_plan_url || null,
    address: form?.address || null,
    phone: form?.phone || null,
    email: form?.email || email || null,
    tax_rate: enteredTax,
    open_procedures: form?.open_procedures || null,
    close_procedures: form?.close_procedures || null,
    linked_customer_app_legacy_id: form?.linked_customer_app_id || null,
    setup_complete: Number(step) >= 3,
  };

  if (creating) data.owner_user_id = userId;
  return data;
}
