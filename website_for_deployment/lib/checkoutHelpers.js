/**
 * Jurisdiction-aware tax and shipping helpers for ACP checkout.
 */

function getTaxInfoForLocation(location) {
    const taxRates = {
        'US-CA': { rate: 0.0725, name: 'California Sales Tax', display: 'CA Sales Tax' },
        'US-NY': { rate: 0.08,   name: 'New York Sales Tax',  display: 'NY Sales Tax' },
        'US-TX': { rate: 0.0625, name: 'Texas Sales Tax',     display: 'TX Sales Tax' },
        'US-FL': { rate: 0.06,   name: 'Florida Sales Tax',   display: 'FL Sales Tax' },
        'US-WA': { rate: 0.065,  name: 'Washington Sales Tax', display: 'WA Sales Tax' },
        'US-DEFAULT': { rate: 0.07, name: 'Estimated Sales Tax', display: 'Est. Sales Tax' },
        'UK':    { rate: 0.20,  name: 'Value Added Tax',      display: 'VAT' },
        'JE':    { rate: 0.05,  name: 'Jersey GST',           display: 'GST' },
        'GG':    { rate: 0.0,   name: 'No GST',               display: 'No GST' },
        'AU':    { rate: 0.10,  name: 'Goods and Services Tax', display: 'GST' },
        'NZ':    { rate: 0.15,  name: 'Goods and Services Tax', display: 'GST' },
        'DE':    { rate: 0.19,  name: 'Mehrwertsteuer',       display: 'MwSt' },
        'FR':    { rate: 0.20,  name: 'TVA',                  display: 'TVA' },
        'IE':    { rate: 0.23,  name: 'Value Added Tax',      display: 'VAT' },
        'SG':    { rate: 0.09,  name: 'Goods and Services Tax', display: 'GST' },
        'JP':    { rate: 0.10,  name: 'Consumption Tax',      display: 'Consumption Tax' },
        'DEFAULT': { rate: 0.10, name: 'Estimated Tax', display: 'Est. Tax' }
    };
    return taxRates[location] || taxRates['DEFAULT'];
}

function calculateCheckoutShipping(lineItems, buyerLocation) {
    const itemCount = lineItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const isIntl = buyerLocation && !['UK'].includes(buyerLocation.split('-')[0]);
    const baseCost = isIntl ? 12.99 : 5.99;
    const subtotal = lineItems.reduce((sum, item) => sum + (item.pricing ? item.pricing.subtotal : 0), 0);
    if (!isIntl && subtotal >= 50) return 0;
    return Math.round((baseCost + (itemCount - 1) * 2.00) * 100) / 100;
}

module.exports = { getTaxInfoForLocation, calculateCheckoutShipping };
