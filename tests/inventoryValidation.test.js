import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLocalInventory,previewInventoryCsv,inventoryNumber} from '../src/lib/inventoryValidation.js';
test('default location is nullable and zero stock threshold is preserved',()=>{
 const x=validateLocalInventory({name:' Shirt ',sku:' 001 ',stock_quantity:'0',low_stock_threshold:'0',price:'25.50',location_id:''});
 assert.equal(x.name,'Shirt');assert.equal(x.sku,'001');assert.equal(x.location_id,null);assert.equal(x.low_stock_threshold,0);assert.equal(x.price,25.5);assert.equal(x.cost,null);
});
test('reject malformed numeric inputs and unknown locations',()=>{
 for(const v of ['-1','1.5','2x','NaN','Infinity','1e3','2147483648']) assert.throws(()=>inventoryNumber(v,'Stock',{integer:true}));
 assert.throws(()=>inventoryNumber('3.141','Price'));assert.throws(()=>validateLocalInventory({name:'   '}));assert.throws(()=>validateLocalInventory({name:'X',location_id:'other'}));
});
test('duplicate SKU is case-insensitive and location scoped; editing same record works',()=>{
 const items=[{id:'a',sku:' ABC ',location_id:null}];
 assert.throws(()=>validateLocalInventory({name:'X',sku:'abc'},{items}));
 assert.doesNotThrow(()=>validateLocalInventory({name:'X',sku:'abc'},{items,editingId:'a'}));
 assert.doesNotThrow(()=>validateLocalInventory({name:'X',sku:'abc',location_id:'b'},{items,locations:[{id:'b'}]}));
});
test('CSV accepts quoted commas and escaped quotes, preserves leading zeros',()=>{
 const rows=previewInventoryCsv('name,sku,price,stock_quantity\r\n"Shirt, blue",001,25.00,2\r\n"A ""quoted"" name",002,1,0');
 assert.equal(rows[0].data.name,'Shirt, blue');assert.equal(rows[0].data.sku,'001');assert.equal(rows[1].data.name,'A "quoted" name');assert.equal(rows[1].data.stock_quantity,0);
});
test('CSV rejects duplicates, malformed and incomplete rows, and unsupported headers',()=>{
 const rows=previewInventoryCsv('name,sku,price,stock_quantity\nA,x,2,1\nB,X,3,2\nC,y,-1,0\nD,z,,1\nE,,2,1\nF,f,2');
 assert.equal(rows.filter(r=>r.error).length,6);
 assert.throws(()=>previewInventoryCsv('name,sku,price,stock_quantity,business_id\nA,x,2,1,foreign'));
 assert.throws(()=>previewInventoryCsv('name,sku,price,stock_quantity\n'+Array(201).fill('A,x,2,1').join('\n')));
});
test('CSV location duplicate checking only matches selected location',()=>{
 const csv='name,sku,price,stock_quantity\nA,x,2,1';const items=[{sku:'X',location_id:null}];
 assert.ok(previewInventoryCsv(csv,items)[0].error);
 assert.equal(previewInventoryCsv(csv,items,'other')[0].error,'');
});
test('inventory page waits for confirmed save and maps supported schema fields',()=>{
 const page=readFileSync(new URL('../src/pages/Inventory.jsx',import.meta.url),'utf8');
 const adapter=readFileSync(new URL('../src/api/base44Client.js',import.meta.url),'utf8');
 const save=page.slice(page.indexOf('const saveItem'),page.indexOf('const deleteItem'));
 assert.match(adapter,/InventoryItem: \{ images: 'image_urls', tryOn_image: 'try_on_image_url' \}/);
 assert.match(save,/location_id: validated.location_id/);
 assert.doesNotMatch(save,/\n\s*variants,/);
 assert.ok(save.indexOf('await base44.entities.InventoryItem.create(data)')<save.indexOf('setDialogOpen(false)'));
 assert.match(page,/Preview only\. No items or online offers will be created/);
 assert.doesNotMatch(page,/Synced \$\{/);
});
