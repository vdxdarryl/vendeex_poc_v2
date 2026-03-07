/**
 * VendeeX — PreferenceScoringService (server-side)
 * Scores products against a member's avatar preferences (5 active categories).
 * Categories 3 (Data & Privacy) and 4 (Communication) are operational, not scored.
 *
 * VERIFICATION REQUIRED before merge.
 * Layer: Agentic Layer (pure business logic, no I/O, no persistence calls).
 */

'use strict';

const { findMerchantByBrand } = require('./MerchantData');

const SUSTAINABILITY_SCORES = { 'A+':100,'A':95,'A-':90,'B+':80,'B':70,'B-':60,'C+':50,'C':40,'C-':30,'D':20,'F':0 };
const ECO_KW = ['organic','sustainable','eco-friendly','eco friendly','recycled','biodegradable','compostable','renewable','carbon neutral','carbon-neutral','zero waste','zero-waste','green','natural'];
const FAIR_TRADE_KW = ['fair trade','fairtrade','fair-trade','ethically sourced','ethical sourcing','ethical','responsibly sourced'];
const VEGAN_KW = ['vegan','plant-based','plant based','no animal'];
const CRUELTY_FREE_KW = ['cruelty-free','cruelty free','not tested on animals','leaping bunny'];
const BCORP_KW = ['b corp','b-corp','bcorp','certified b'];

const DEFAULTS = {
  valuesEthics: { carbonSensitivity:'medium',circularEconomy:false,packagingPreference:'any',fairTrade:false,labourStandards:'medium',localEconomy:'medium',bCorpPreference:false,supplierDiversity:false,animalWelfare:'none' },
  trustRisk: { minSellerRating:'any',minWarrantyMonths:0,disputeResolution:'either',minReturnWindowDays:14 },
  paymentDefaults: { preferredMethods:['card'],currency:'USD',instalmentsAcceptable:false },
  deliveryLogistics: { deliveryMethod:'delivery',speedPreference:'balanced',packagingPreference:'standard' },
  qualityDefaults: { conditionTolerance:'new',brandExclusions:[],countryPreferences:[] }
};

function has(text, kws) { if (!text) return false; const l=text.toLowerCase(); return kws.some(k=>l.includes(k)); }
function parseReturnDays(rw) { if (!rw) return 0; const s=String(rw).toLowerCase(),m=s.match(/(\d+)/); if (!m) return 0; const n=parseInt(m[1],10); if (s.includes('year')) return n*365; if (s.includes('month')) return n*30; return n; }
function parseWarrantyMonths(w) { if (!w) return 0; const s=String(w).toLowerCase(); if (s==='none'||s==='n/a') return 0; if (s.includes('lifetime')) return 120; const m=s.match(/(\d+)/); if (!m) return s.includes('guarantee')?3:0; const n=parseInt(m[1],10); if (s.includes('year')) return n*12; if (s.includes('month')) return n; if (s.includes('day')) return Math.max(1,Math.round(n/30)); return n; }
function parseSellerRating(v) { return {any:0,'3':3,'4':4,'4.5':4.5}[v]||0; }
function normPM(m) { const s=m.toLowerCase().trim(); if (s.includes('visa')||s.includes('mastercard')||s.includes('amex')||s==='card') return 'card'; if (s.includes('paypal')) return 'paypal'; if (s.includes('apple')) return 'apple-pay'; if (s.includes('google')) return 'google-pay'; if (s.includes('affirm')||s.includes('klarna')||s.includes('afterpay')) return 'instalments'; return s; }
function isDefault(key, prefs) { const d=DEFAULTS[key],a=prefs[key]; if (!d||!a) return true; return JSON.stringify(d)===JSON.stringify(a); }

function hardFilter(product, prefs) {
  const qd=prefs.qualityDefaults; if (!qd) return {passed:true};
  if (qd.brandExclusions&&qd.brandExclusions.length>0&&product.brand) { const lb=product.brand.toLowerCase(); if (qd.brandExclusions.some(ex=>lb.includes(ex.toLowerCase()))) return {passed:false,reason:'Brand on exclusion list'}; }
  if (qd.conditionTolerance==='new'&&product.condition) { const c=product.condition.toLowerCase(); if (c!=='new'&&c!==''&&c!=='brand new') return {passed:false,reason:'Condition not new'}; }

  // Sourcing exclusion: dontBuyFrom.country matched against product.country or product.origin
  // Uses keyword matching since Channel3 does not return a structured country field.
  const sp = prefs.sourcingPreference;
  if (sp && sp.dontBuyFrom && sp.dontBuyFrom.country) {
    const excl = sp.dontBuyFrom.country.toLowerCase();
    const haystack = [product.country||'', product.origin||'', product.brand||'', product.description||''].join(' ').toLowerCase();
    // Only hard-fail if the exclusion country appears explicitly in origin/country fields
    if ((product.country && product.country.toLowerCase().includes(excl)) ||
        (product.origin  && product.origin.toLowerCase().includes(excl))) {
      return {passed:false, reason:'Excluded sourcing country: ' + sp.dontBuyFrom.country};
    }
  }

  return {passed:true};
}

function scoreValuesEthics(product, merchant, prefs) {
  const ve=prefs.valuesEthics; if (!ve) return {score:50,details:[]};
  let pts=0,max=0; const details=[];
  const desc=[product.description||'',product.name||'',(product.tags||[]).join(' '),product.material||''].join(' ');
  const creds=((merchant&&merchant.sustainability&&merchant.sustainability.credentials)||[]).join(' ').toLowerCase();
  if (ve.carbonSensitivity!=='low') { max+=30; const ss=(merchant&&merchant.sustainability)?SUSTAINABILITY_SCORES[merchant.sustainability.score]||0:0; const eco=has(desc,ECO_KW); const thr=ve.carbonSensitivity==='high'?70:40; if (ss>=thr||(eco&&ss>=thr-20)){pts+=30;details.push({label:'Carbon',passed:'pass',note:merchant?merchant.sustainability.score:'eco'});}else if(ss>0||eco){pts+=15;details.push({label:'Carbon',passed:'partial'});}else{details.push({label:'Carbon',passed:'fail'});} }
  if (ve.fairTrade) { max+=20; const ft=has(desc,FAIR_TRADE_KW)||has(creds,FAIR_TRADE_KW); if(ft){pts+=20;details.push({label:'FairTrade',passed:'pass'});}else{details.push({label:'FairTrade',passed:'fail'});} }
  if (ve.bCorpPreference) { max+=15; const bc=has(creds,BCORP_KW)||(merchant&&merchant.sustainability&&merchant.sustainability.certified); if(bc){pts+=15;details.push({label:'BCorp',passed:'pass'});}else{details.push({label:'BCorp',passed:'fail'});} }
  if (ve.animalWelfare!=='none') { max+=20; if(ve.animalWelfare==='vegan'){const v=has(desc,VEGAN_KW)||has(creds,VEGAN_KW);if(v){pts+=20;details.push({label:'Vegan',passed:'pass'});}else{const cf=has(desc,CRUELTY_FREE_KW)||has(creds,CRUELTY_FREE_KW);if(cf){pts+=10;details.push({label:'CrueltyFree',passed:'partial'});}else{details.push({label:'Animal',passed:'fail'});}}}else{const cf=has(desc,CRUELTY_FREE_KW)||has(desc,VEGAN_KW)||has(creds,CRUELTY_FREE_KW);if(cf){pts+=20;details.push({label:'CrueltyFree',passed:'pass'});}else{details.push({label:'Animal',passed:'fail'});}} }
  // Sourcing preference bonus: reward products matching buyFrom country/region
  const sp2 = prefs.sourcingPreference;
  if (sp2 && sp2.buyFrom && sp2.buyFrom.country) {
    max += 20;
    const pref = sp2.buyFrom.country.toLowerCase();
    const regions = (sp2.buyFrom.regions || []).map(r => r.toLowerCase());
    const hay = [product.country||'', product.origin||'', product.brand||'', product.description||''].join(' ').toLowerCase();
    const countryMatch = hay.includes(pref);
    const regionMatch = regions.some(r => r && hay.includes(r));
    if (countryMatch || regionMatch) { pts += 20; details.push({label:'BuyLocal',passed:'pass',note:sp2.buyFrom.country+(regionMatch?' ('+sp2.buyFrom.regions.find(r=>hay.includes(r.toLowerCase()))+')':'')}); }
    else { details.push({label:'BuyLocal',passed:'fail'}); }
  }

  return {score:max>0?Math.round((pts/max)*100):50,details};
}

function scoreTrustRisk(product, merchant, prefs) {
  const tr=prefs.trustRisk; if (!tr) return {score:50,details:[]};
  let pts=0,max=0; const details=[];
  const mr=parseSellerRating(tr.minSellerRating);
  if (mr>0) { max+=30; const r=merchant?merchant.rating:null; if(r!==null&&r>=mr){pts+=30;details.push({label:'Rating',passed:'pass',note:r+'★'});}else if(r!==null){pts+=Math.round(30*Math.min(r/mr,0.9));details.push({label:'Rating',passed:'partial'});}else{details.push({label:'Rating',passed:'fail'});} }
  if (tr.minWarrantyMonths>0) { max+=25; const aw=merchant?parseWarrantyMonths(merchant.terms.warranty):0; if(aw>=tr.minWarrantyMonths){pts+=25;details.push({label:'Warranty',passed:'pass'});}else if(aw>0){pts+=Math.round(25*(aw/tr.minWarrantyMonths));details.push({label:'Warranty',passed:'partial'});}else{details.push({label:'Warranty',passed:'fail'});} }
  if (tr.minReturnWindowDays>0) { max+=25; const ar=merchant?parseReturnDays(merchant.terms.returnWindow):0; if(ar>=tr.minReturnWindowDays){pts+=25;details.push({label:'Returns',passed:'pass'});}else if(ar>0){pts+=Math.round(25*(ar/tr.minReturnWindowDays));details.push({label:'Returns',passed:'partial'});}else{details.push({label:'Returns',passed:'fail'});} }
  if (merchant){max+=20;if(merchant.terms.freeReturns){pts+=20;details.push({label:'FreeReturns',passed:'pass'});}else{details.push({label:'FreeReturns',passed:'fail'});}}
  return {score:max>0?Math.round((pts/max)*100):50,details};
}

function scorePayment(product, merchant, prefs) {
  const pd=prefs.paymentDefaults; if (!pd) return {score:50,details:[]};
  let pts=0,max=0; const details=[];
  if (pd.preferredMethods&&pd.preferredMethods.length>0&&merchant) { max+=60; const mm=(merchant.terms.paymentMethods||[]).map(normPM); const ov=pd.preferredMethods.filter(m=>mm.includes(m)); const r=ov.length/pd.preferredMethods.length; pts+=Math.round(60*r); if(r>=1){details.push({label:'Payment',passed:'pass'});}else if(r>0){details.push({label:'Payment',passed:'partial'});}else{details.push({label:'Payment',passed:'fail'});} }
  if (pd.instalmentsAcceptable){max+=40;const hi=merchant&&(merchant.terms.paymentMethods||[]).some(m=>{const l=m.toLowerCase();return l.includes('affirm')||l.includes('klarna')||l.includes('afterpay');});if(hi){pts+=40;details.push({label:'Instalments',passed:'pass'});}else{details.push({label:'Instalments',passed:'fail'});}}
  return {score:max>0?Math.round((pts/max)*100):50,details};
}

function scoreDelivery(product, merchant, prefs) {
  const dl=prefs.deliveryLogistics; if (!dl||!merchant) return {score:50,details:[]};
  let pts=0,max=50; const details=[]; const d=merchant.terms.maxDeliveryDays||14;
  if (dl.speedPreference==='fastest'){if(d<=3){pts+=50;details.push({label:'Speed',passed:'pass'});}else if(d<=5){pts+=30;details.push({label:'Speed',passed:'partial'});}else{details.push({label:'Speed',passed:'fail'});}}
  else if(dl.speedPreference==='cheapest'){if(merchant.terms.freeShippingThreshold===0){pts+=50;details.push({label:'FreeShip',passed:'pass'});}else{pts+=25;details.push({label:'FreeShip',passed:'partial'});}}
  else{if(d<=7){pts+=50;details.push({label:'Speed',passed:'pass'});}else{pts+=25;details.push({label:'Speed',passed:'partial'});}}
  return {score:Math.round((pts/max)*100),details};
}

function scoreQuality(product, merchant, prefs) {
  const qd=prefs.qualityDefaults; if (!qd) return {score:50,details:[]};
  let pts=0,max=0; const details=[];
  if (qd.conditionTolerance){max+=40;const c=(product.condition||'').toLowerCase();if(!c||c==='new'||c==='brand new'){pts+=40;details.push({label:'Condition',passed:'pass'});}else if(qd.conditionTolerance==='pre-owned'){pts+=40;details.push({label:'Condition',passed:'pass'});}else if(qd.conditionTolerance==='refurbished'&&(c.includes('refurb')||c.includes('renew'))){pts+=40;details.push({label:'Condition',passed:'pass'});}}
  if (product.rating){max+=30;const r=parseFloat(product.rating);if(r>=4.5){pts+=30;details.push({label:'Rating',passed:'pass'});}else if(r>=3.5){pts+=20;details.push({label:'Rating',passed:'partial'});}else{pts+=5;details.push({label:'Rating',passed:'fail'});}}
  return {score:max>0?Math.round((pts/max)*100):50,details};
}

function score(product, prefs) {
  if (!prefs||Object.keys(prefs).length===0) return {overall:-1,categories:{},hardFilterFailed:false,failReason:null,activeCategories:0};
  const hf=hardFilter(product,prefs); if (!hf.passed) return {overall:0,categories:{},hardFilterFailed:true,failReason:hf.reason,activeCategories:0};
  const merchant=findMerchantByBrand(product.brand); const cats={}; let total=0,active=0;
  if (!isDefault('valuesEthics',prefs)){cats.valuesEthics=scoreValuesEthics(product,merchant,prefs);total+=cats.valuesEthics.score;active++;}
  if (!isDefault('trustRisk',prefs)){cats.trustRisk=scoreTrustRisk(product,merchant,prefs);total+=cats.trustRisk.score;active++;}
  if (!isDefault('paymentDefaults',prefs)){cats.payment=scorePayment(product,merchant,prefs);total+=cats.payment.score;active++;}
  if (!isDefault('deliveryLogistics',prefs)){cats.delivery=scoreDelivery(product,merchant,prefs);total+=cats.delivery.score;active++;}
  if (!isDefault('qualityDefaults',prefs)){cats.quality=scoreQuality(product,merchant,prefs);total+=cats.quality.score;active++;}
  if (!cats.trustRisk) cats.trustRisk=scoreTrustRisk(product,merchant,prefs);
  if (!cats.quality) cats.quality=scoreQuality(product,merchant,prefs);
  let overall;
  if (active>0){overall=Math.round(total/active);}else{let b=0,bc=0;if(cats.trustRisk&&cats.trustRisk.details.length>0){b+=cats.trustRisk.score;bc++;}if(cats.quality&&cats.quality.details.length>0){b+=cats.quality.score;bc++;}overall=bc>0?Math.round(b/bc):-1;}
  return {overall,categories:cats,hardFilterFailed:false,failReason:null,activeCategories:active};
}

function scoreProducts(products, prefs) { return products.map(p=>{const r=score(p,prefs);return {...p,prefScore:r.overall,prefScoreCategories:r.categories,hardFilterFailed:r.hardFilterFailed,hardFilterReason:r.failReason,activeCategories:r.activeCategories};}); }
function blendedScore(matchScore, prefScore) { if (prefScore<0) return matchScore; return Math.round(((matchScore||85)*0.5)+(prefScore*0.5)); }

module.exports = { score, scoreProducts, blendedScore };
