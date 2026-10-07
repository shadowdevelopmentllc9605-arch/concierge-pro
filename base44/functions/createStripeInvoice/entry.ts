import { createClientFromRequest } from "npm:@base44/sdk";
import Stripe from "npm:stripe@23.0.0";
import { secrets } from "base44:runtime";

export default async function(req:Request):Promise<Response>{
  try{
    const base44=createClientFromRequest(req),user=await base44.auth.me().catch(() => null); if(!user)return Response.json({error:"Unauthorized"},{status:401});
    let r=await base44.asServiceRole.entities.Business.filter({owner_user_id:user.id}); if(!r[0]&&user?.data?.business_id)r=await base44.asServiceRole.entities.Business.filter({id:user.data.business_id}); const b=r[0];
    if(!b)return Response.json({error:"Business not found"},{status:404});
    const body=await req.json().catch(()=>({})),email=String(body.email||"").trim(),description=String(body.description||"Concierge Pro services"),amount=Math.round(Number(body.amount||0)*100);
    if(!email||amount<=0)return Response.json({error:"A customer email and positive amount are required"},{status:400});
    const key=secrets.get("STRIPE_SECRET_KEY"); if(!key)return Response.json({error:"Stripe is not configured"},{status:409});
    const stripe=new Stripe(key),customer=await stripe.customers.create({email,metadata:{concierge_pro_business_id:b.id}});
    await stripe.invoiceItems.create({customer:customer.id,amount,currency:"usd",description});
    const inv=await stripe.invoices.create({customer:customer.id,collection_method:"send_invoice",days_until_due:30,automatic_tax:{enabled:true},metadata:{concierge_pro_business_id:b.id}});
    const finalInv=await stripe.invoices.finalizeInvoice(inv.id); await stripe.invoices.sendInvoice(finalInv.id);
    return Response.json({success:true,invoiceId:finalInv.id,hostedInvoiceUrl:finalInv.hosted_invoice_url});
  }catch(e){console.error("createStripeInvoice",e);return Response.json({error:e instanceof Error?e.message:"Invoice creation failed"},{status:500});}
}