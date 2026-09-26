import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { migrateBookingD1 } from './helpers/booking-payments/migrations.mjs';
import { onRequest as checkout } from '../functions/api/book/create-checkout.js';
import { onRequest as availability } from '../functions/api/book/availability.js';
import { createCheckoutRecoveryStore, drainCheckoutRecovery } from '../functions/api/_lib/booking-checkout-recovery.js';
import { getBookingStore } from '../functions/api/_lib/storage.js';
import { createBookingPaymentStore } from '../functions/api/_lib/booking-payment-store.js';
import { buildBookingStartEvent } from '../functions/api/_lib/booking-payment-reconciliation.js';
import { sendCheckoutSessionCommand } from '../functions/api/_lib/stripe.js';
import { getBookingConfig } from '../functions/api/_lib/config.js';

const origin = 'https://website.example.test';
async function fixture(t) {
  const mf = new Miniflare({ modules:true, script:'export default {fetch(){return new Response("local synthetic database");}}', compatibilityDate:'2026-05-18', host:'127.0.0.1', port:0, cf:false, d1Persist:false, log:new Log(LogLevel.ERROR), d1Databases:{DB:'synthetic-checkout-recovery'}, outboundService(){throw new Error('No outbound runtime requests');} });
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');await migrateBookingD1(db);
  const faults={attach:0,reads:0,providerReply:0,checkpointReply:0,prepare:0,commandRead:0};
  const wrap=(inner,sql)=>({inner,sql,bind(...args){return wrap(inner.bind(...args),sql);},
    async first(){if(faults.commandRead && /SELECT \* FROM booking_checkout_commands/.test(sql)){faults.commandRead--;throw new Error('Synthetic command read unavailable');}if(faults.reads && /agent_idempotency_records/.test(sql)){faults.reads--;throw new Error('Synthetic read unavailable');}return inner.first();},
    all:()=>inner.all(),async run(){if(faults.prepare && /INSERT INTO booking_checkout_commands/.test(sql)){faults.prepare--;throw new Error('Synthetic preparation failure');}const r=await inner.run();if(faults.checkpointReply && /SET session_json=/.test(sql)){faults.checkpointReply--;throw new Error('Synthetic checkpoint reply lost');}return r;}});
  const wrapped={prepare(sql){return wrap(db.prepare(sql),sql);},async batch(statements){if(faults.attach && statements.some(s=>/INSERT INTO booking_payment_state/.test(s.sql))){faults.attach--;faults.reads=1;throw new Error('Synthetic attachment failed before commit');}return db.batch(statements.map(s=>s.inner));}};
  const env={BOOKING_DB:wrapped, STRIPE_SECRET_KEY:'sk_test_local_fixture', STRIPE_EXPECTED_LIVEMODE:'false',PUBLIC_SITE_ORIGIN:origin,
    BOOKING_CHECKOUT_ENABLED:'true',ACTIVE_BOOKING_RELEASE:'aissisted_booking_v2_2026_08_15',BOOKING_V2_STRIPE_PRODUCT_ID:'prod_fixture',BOOKING_V2_STRIPE_PRICE_ID:'price_fixture',BOOKING_V2_PAYMENT_METHOD_CONFIGURATION_ID:'pmc_fixture',
    AIC_CRM_BOOKING_EVENTS_ENABLED:'true',AIC_CRM_BOOKING_EVENTS_SOURCE_ENVIRONMENT:'staging',AIC_CRM_BOOKING_EVENTS_PROVIDER_ACCOUNT_ID:'acct_fixture',AIC_CRM_BOOKING_EVENTS_URL:'https://crm.example.test/intake/website/booking-events',AIC_CRM_BOOKING_EVENTS_TOKEN:'synthetic-local-machine-token',BOOKING_CREATE_GOOGLE_CALENDAR_EVENT:'false',BOOKING_REQUIRE_GOOGLE_CALENDAR:'false'};
  const originalFetch=globalThis.fetch;const calls=[];const commands=new Map();let sessions=0;
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url);if(['127.0.0.1','localhost','[::1]'].includes(url.hostname))return originalFetch(input,options);
    assert.equal(url.origin,'https://api.stripe.com');const body=String(options.body||'');calls.push({path:url.pathname,body,key:options.headers?.['idempotency-key'],version:options.headers?.['stripe-version']});
    if(url.pathname==='/v1/account')return Response.json({id:'acct_fixture',object:'account'});
    if(url.pathname==='/v1/customers')return Response.json({id:'cus_fixture'});
    assert.equal(url.pathname,'/v1/checkout/sessions','Never expire or replace an uncertain Session');
    const key=options.headers['idempotency-key'];assert.ok(key);let saved=commands.get(key);
    if(saved){assert.equal(saved.body,body);assert.equal(saved.version,options.headers['stripe-version']);}
    else {const form=new URLSearchParams(body);const id=`cs_test_recovery_${++sessions}`;saved={body,version:options.headers['stripe-version'],session:{id,url:`https://checkout.stripe.com/c/pay/${id}`,livemode:false,status:'open',created:Math.floor(Date.now()/1000),expires_at:Number(form.get('expires_at')),customer:form.get('customer')||'cus_fixture',payment_intent:null,payment_method_types:['card']}};commands.set(key,saved);}
    if(faults.providerReply){faults.providerReply--;return new Response('{',{status:200});}return Response.json(saved.session);
  };
  t.after(()=>{globalThis.fetch=originalFetch;});
  const offer=await (await availability({request:new Request(origin+'/api/book/availability'),env})).json();assert.ok(offer.slots?.length,JSON.stringify(offer));const slot=offer.slots.find(s=>s.status==='available');
  const body={slotId:slot.slotId,websiteLeaveBlank:'',policyAccepted:true,checkoutConsent:true,confirmedAmountCents:offer.reservationAmountCents,confirmedCurrency:offer.currency,confirmedTermsVersion:offer.policyVersion,confirmedReleaseId:offer.releaseId,confirmedOfferId:offer.offerId,confirmedOfferVersion:offer.offerVersion,confirmedTermsSha256:offer.policySha256,contact:{name:'Synthetic Person',email:'synthetic@example.test',phone:'',company:'Synthetic'},intake:{routeId:'workflow_improvement',companyWebsite:'https://example.test',industry:'Synthetic',primaryGoal:'Synthetic recovery',notes:'No actual payment'},sourcePage:'/book/?utm_source=synthetic'};
  const key='synthetic-checkout-recovery-original-001';const send=async(payload=body)=>{const response=await checkout({request:new Request(origin+'/api/book/create-checkout',{method:'POST',headers:{origin,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(payload)}),env});return {status:response.status,body:await response.json()};};
  const row=()=>db.prepare('SELECT * FROM booking_checkout_commands').first();
  return {db,env,faults,calls,commands,send,row,body,sessionCount:()=>sessions,postCount:()=>calls.filter(c=>c.path==='/v1/checkout/sessions').length};
}

test('uncommitted attachment with unavailable readback resumes original booking and Session',async(t)=>{const h=await fixture(t);h.faults.attach=1;const first=await h.send();assert.equal(first.status,503);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM booking_payment_state').first()).n,0);const command=await h.row();assert.ok(command.session_json);const retry=await h.send();assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.body.bookingId,command.booking_id);assert.equal(retry.body.sessionId,JSON.parse(command.session_json).id);assert.equal(h.postCount(),1);assert.equal(h.sessionCount(),1);assert.equal((await h.row()).state,'attached');});

test('lost Session response replays exact persisted provider body/key/version once',async(t)=>{const h=await fixture(t);h.faults.providerReply=1;assert.equal((await h.send()).status,503);const command=await h.row();assert.equal(command.session_json,null);h.env.STRIPE_API_VERSION='changed-config-version';const retry=await h.send();assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(h.postCount(),2);assert.equal(h.sessionCount(),1);assert.equal((await h.row()).stripe_request_body,command.stripe_request_body);});

test('lost checkpoint reply uses saved original Session without another provider POST',async(t)=>{const h=await fixture(t);h.faults.checkpointReply=1;assert.equal((await h.send()).status,503);assert.ok((await h.row()).session_json);assert.equal((await h.send()).status,200);assert.equal(h.postCount(),1);});

test('changed original request cannot resume a prepared command',async(t)=>{const h=await fixture(t);h.faults.attach=1;await h.send();const before=await h.row();const changed=await h.send({...h.body,contact:{...h.body.contact,name:'Changed person'}});assert.equal(changed.status,409);assert.equal(changed.body.code,'idempotency_conflict');assert.deepEqual(await h.row(),before);assert.equal(h.postCount(),1);});

test('active recovery lease blocks competing retry and expired lease can be reclaimed',async(t)=>{const h=await fixture(t);h.faults.attach=1;await h.send();const command=await h.row();const recovery=createCheckoutRecoveryStore(h.db);const lease=await recovery.claim(command.idempotency_record_id);assert.ok(lease);assert.equal((await h.send()).status,503);await h.db.prepare("UPDATE booking_checkout_commands SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE idempotency_record_id=?").bind(command.idempotency_record_id).run();assert.equal((await h.send()).status,200);assert.equal(await recovery.checkpoint(lease,JSON.parse(command.session_json)),false);assert.equal(h.postCount(),1);});

test('monitor resumes only the durable original command after client disappears',async(t)=>{const h=await fixture(t);h.faults.attach=1;await h.send();const command=await h.row();const result=await drainCheckoutRecovery({env:h.env,config:getBookingConfig(h.env,origin),store:getBookingStore(h.env)});assert.equal(result.recovered,1,JSON.stringify(result));assert.equal((await h.row()).booking_id,command.booking_id);assert.equal((await h.row()).state,'attached');assert.equal(h.postCount(),1);});

test('no persisted command means explicit attention and no Session creation',async(t)=>{const h=await fixture(t);h.faults.prepare=1;assert.equal((await h.send()).status,503);assert.equal(await h.row(),null);const retry=await h.send();assert.equal(retry.status,409);assert.equal(retry.body.code,'checkout_recovery_unprepared');assert.equal(h.postCount(),0);});

test('retention cutoff requires attention without another POST',async(t)=>{const h=await fixture(t);h.faults.attach=1;await h.send();const command=await h.row();const recovery=createCheckoutRecoveryStore(h.db);assert.equal(await recovery.claim(command.idempotency_record_id,command.retry_before),null);assert.equal((await h.row()).state,'needs_attention');const retry=await h.send();assert.equal(retry.status,409);assert.equal(retry.body.code,'checkout_recovery_expired');assert.equal(h.postCount(),1);});


test('last-attempt recovery crash is terminal after lease expiry',async(t)=>{const h=await fixture(t);h.faults.attach=1;await h.send();const command=await h.row();const recovery=createCheckoutRecoveryStore(h.db);await recovery.claim(command.idempotency_record_id);await h.db.prepare("UPDATE booking_checkout_commands SET attempts=8,lease_expires_at='2000-01-01T00:00:00.000Z'").run();const retry=await h.send();assert.equal(retry.status,409);assert.equal(retry.body.code,'checkout_recovery_exhausted');assert.equal(h.postCount(),1);});

test('original accepted offer resumes and replays after the current offer changes',async(t)=>{const h=await fixture(t);h.faults.attach=1;assert.equal((await h.send()).status,503);const original=await h.row();h.env.ACTIVE_BOOKING_RELEASE='legacy_v1_2026_04_06';h.env.STRIPE_BOOKING_PRICE_ID='price_new_release';assert.equal((await h.send()).status,200);const replay=await h.send();assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.bookingId,original.booking_id);assert.equal(h.postCount(),1);});

test('operator pause prevents prepared Session creation without consuming attempts',async(t)=>{const h=await fixture(t);h.faults.commandRead=1;assert.equal((await h.send()).status,503);const original=await h.row();assert.equal(h.postCount(),0);h.env.BOOKING_CHECKOUT_ENABLED='false';const result=await drainCheckoutRecovery({env:h.env,config:getBookingConfig(h.env,origin),store:getBookingStore(h.env)});assert.equal(result.pending,1);assert.equal((await h.row()).attempts,original.attempts);assert.equal(h.postCount(),0);h.env.BOOKING_CHECKOUT_ENABLED='true';assert.equal((await h.send()).status,200);assert.equal(h.sessionCount(),1);});

for(const status of ['canceled','payment_failed','manual_review'])test(`changed original booking ${status} blocks Session POST before claiming`,async(t)=>{const h=await fixture(t);h.faults.commandRead=1;assert.equal((await h.send()).status,503);const original=await h.row();await h.db.prepare('UPDATE bookings SET booking_status=? WHERE id=?').bind(status,original.booking_id).run();const result=await drainCheckoutRecovery({env:h.env,config:getBookingConfig(h.env,origin),store:getBookingStore(h.env)});assert.equal(result.needsAttention,1);assert.equal(h.postCount(),0);assert.equal((await h.row()).last_safe_error_code,'checkout_recovery_booking_changed');});


test('stale checkout command lease cannot atomically attach payment state or original response',async(t)=>{const h=await fixture(t);h.faults.attach=1;await h.send();const command=await h.row();const recovery=createCheckoutRecoveryStore(h.db);const stale=await recovery.claim(command.idempotency_record_id);await h.db.prepare("UPDATE booking_checkout_commands SET lease_expires_at='2000-01-01T00:00:00.000Z'").run();const current=await recovery.claim(command.idempotency_record_id);const context=JSON.parse(command.context_json),session=JSON.parse(command.session_json);const event=await buildBookingStartEvent({scope:JSON.parse(command.scope_json),booking:context.booking,contract:context.contract,session,intake:{...context.intake,message:context.intake.message+'\nStripe checkout session: '+session.id},at:command.created_at});await assert.rejects(()=>createBookingPaymentStore(h.db).attachStart({event,responseBody:{...context.response,checkoutUrl:session.url,sessionId:session.id},idempotencyRecordId:command.idempotency_record_id,recoveryLease:stale}),/checkout_attach_conflict/);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM booking_payment_state').first()).n,0);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM booking_crm_delivery').first()).n,0);assert.equal((await h.row()).lease_token,current.lease_token);assert.equal((await h.db.prepare('SELECT status FROM agent_idempotency_records').first()).status,'started');});

test('persisted Session request deadline includes a stalled response body',async(t)=>{const original=globalThis.fetch;let signal;globalThis.fetch=async(_url,options)=>{signal=options.signal;return new Response(new ReadableStream({start(){}}));};t.after(()=>{globalThis.fetch=original;});t.mock.timers.enable({apis:['setTimeout']});const result=sendCheckoutSessionCommand({stripeSecretKey:'sk_test_synthetic'},{body:'mode=payment',idempotencyKey:'synthetic-original-command',apiVersion:'2026-06-24.dahlia'});const rejected=assert.rejects(result,/checkout_provider_deadline/);await Promise.resolve();t.mock.timers.tick(10_000);await rejected;assert.equal(signal.aborted,true);});
