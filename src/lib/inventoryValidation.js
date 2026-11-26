// Local inventory validation only. Never turns a local record into an online offer.
export const skuKey = value => String(value ?? '').trim().toLowerCase();
export function inventoryNumber(value, label, {integer=false, fallback, positive=false}={}) {
 const raw=String(value ?? '').trim();
 if (!raw && fallback !== undefined) return fallback;
 if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || (integer && !/^\d+$/.test(raw))) throw new Error(label+' must be '+(integer?'a whole number':'a valid amount')+'.');
 const n=Number(raw);
 if (!Number.isFinite(n) || n>2147483647 || (positive && n<=0)) throw new Error(label+' is outside the allowed range.');
 return n;
}
export function validateLocalInventory(form, {items=[], locations=[], editingId=null}={}) {
 const name=String(form.name ?? '').trim(), sku=String(form.sku ?? '').trim();
 if (!name || name.length>250) throw new Error('Enter a product name (1–250 characters).');
 if (sku.length>120) throw new Error('SKU must be 120 characters or fewer.');
 const location_id=form.location_id || null;
 if (location_id && !locations.some(l=>l.id===location_id)) throw new Error('Select an active location belonging to this business.');
 if (sku && items.some(i=>i.id!==editingId && (i.location_id||null)===location_id && skuKey(i.sku)===skuKey(sku))) throw new Error('This SKU already exists at the selected location.');
 const price=inventoryNumber(form.price,'Price',{fallback:0});
 const cost=inventoryNumber(form.cost,'Cost',{fallback:null});
 const stock_quantity=inventoryNumber(form.stock_quantity,'Stock',{integer:true,fallback:0});
 const low_stock_threshold=inventoryNumber(form.low_stock_threshold,'Low stock alert',{integer:true,fallback:5});
 const dimensions={width:inventoryNumber(form.dimension_width,'Width',{fallback:0}),height:inventoryNumber(form.dimension_height,'Height',{fallback:0}),depth:inventoryNumber(form.dimension_depth,'Depth',{fallback:0}),unit:form.dimension_unit||'inches'};
 return {name,sku,location_id,price,cost,stock_quantity,low_stock_threshold,dimensions};
}
// Deliberately bounded CSV dialect: UTF-8, comma separator, quoted fields,
// doubled quotes, CRLF/LF, no multiline cells. Only preview; no writes.
export function previewInventoryCsv(text, items=[], locationId=null) {
 if (typeof text!=='string' || text.length>200000) throw new Error('CSV must be under 200,000 characters.');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
 if (lines.length<2 || lines.length>201) throw new Error('Provide a header and 1–200 data rows.');
 function parse(line) {
  const fields=[];let field='',quoted=false,closed=false;
  for(let i=0;i<line.length;i++){
   const c=line[i];
   if(quoted){if(c==='"'){if(line[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
   else if(c===','){fields.push(field);field='';closed=false;}
   else if(c==='"'&&!field&&!closed){quoted=true;}
   else if(c==='"'||closed)throw new Error('Invalid CSV quoting.');
   else field+=c;
  }
  if(quoted)throw new Error('Unclosed quote or multiline cell.');
  fields.push(field);return fields;
 }
 const headers=parse(lines[0]).map(s=>s.trim().toLowerCase());
 const allowed=['name','sku','brand','category','price','cost','stock_quantity','low_stock_threshold'];
 if(new Set(headers).size!==headers.length || headers.some(h=>!allowed.includes(h)) || !['name','sku','price','stock_quantity'].every(h=>headers.includes(h))) throw new Error('Use unique supported headers: name, sku, price, stock_quantity; optional brand, category, cost, low_stock_threshold.');
 const rows=lines.slice(1).map((line,i)=>{
  try{
   const cells=parse(line);if(cells.length!==headers.length)throw new Error('Column count does not match header.');
   const data=Object.fromEntries(headers.map((h,j)=>[h,cells[j].trim()]));
   if(!data.sku)throw new Error('SKU is required for bulk preview.');
   if(!data.price||!data.stock_quantity)throw new Error('Price and stock are required.');
   const normalized=validateLocalInventory(data,{items});
   if(items.some(x=>(x.location_id||null)===locationId && skuKey(x.sku)===skuKey(data.sku)))throw new Error('SKU already exists at this location.');
   return {row:i+2,data:{...data,...normalized,location_id:locationId},error:''};
  }catch(e){return {row:i+2,data:null,error:e.message};}
 });
 const counts=new Map();for(const row of rows)if(row.data){const key=skuKey(row.data.sku);counts.set(key,(counts.get(key)||0)+1);}
 return rows.map(row=>row.data&&counts.get(skuKey(row.data.sku))>1?{...row,error:'Duplicate SKU in this file.'}:row);
}
