/**
 * Services Index - Export all service modules
 */

const MultiProviderSearch = require('./MultiProviderSearch');
const PharmaPricingService = require('./PharmaPricingService');
const ResultConsolidator = require('./ResultConsolidator');
const providers = require('./providers');

module.exports = {
  MultiProviderSearch,
  PharmaPricingService,
  ResultConsolidator,
  ...providers
};
