/**
 * PharmaPricingService - Access to pharmaceutical pricing databases
 * Retrieves drug pricing data from publicly available government databases
 */

class PharmaPricingService {
  constructor() {
    // US Data Sources
    this.usSources = {
      nadac: {
        name: 'National Average Drug Acquisition Cost',
        endpoint: 'https://data.medicaid.gov/api/1/datastore/query/',
        datasetId: 'nadac-national-average-drug-acquisition-cost',
        updateFrequency: 'weekly'
      },
      ful: {
        name: 'Federal Upper Limit',
        endpoint: 'https://data.medicaid.gov/api/1/datastore/query/',
        datasetId: 'federal-upper-limit',
        updateFrequency: 'monthly'
      }
    };

    // International Sources
    this.intlSources = {
      AU: {
        name: 'Pharmaceutical Benefits Scheme',
        url: 'https://www.pbs.gov.au/',
        jurisdiction: 'AU',
        priceType: 'subsidised_price'
      },
      UK: {
        name: 'NHS Drug Tariff',
        url: 'https://www.nhsbsa.nhs.uk/pharmacies-gp-practices-and-appliance-contractors/drug-tariff',
        jurisdiction: 'UK',
        priceType: 'reimbursement_price'
      },
      DK: {
        name: 'Medicinpriser',
        url: 'https://www.medicinpriser.dk/',
        jurisdiction: 'DK',
        priceType: 'pharmacy_retail'
      },
      FR: {
        name: 'Base de Donnees Publique des Medicaments',
        url: 'https://base-donnees-publique.medicaments.gouv.fr/',
        jurisdiction: 'FR',
        priceType: 'public_price'
      },
      ES: {
        name: 'CIMA AEMPS',
        url: 'https://cima.aemps.es/',
        jurisdiction: 'ES',
        priceType: 'authorised_price'
      }
    };

    // Simple cache
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get pricing for a drug across multiple jurisdictions
   * @param {string} drugQuery - Drug name to search
   * @param {string[]} jurisdictions - Jurisdictions to query
   * @returns {Promise<Object>} Pricing results
   */
  async getPricing(drugQuery, jurisdictions = ['US']) {
    const results = {
      query: drugQuery,
      timestamp: new Date().toISOString(),
      pricing: {}
    };

    // Check cache first
    const cacheKey = `${drugQuery.toLowerCase()}_${jurisdictions.sort().join('_')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      console.log('[PharmaPricing] Returning cached results');
      return cached.data;
    }

    // Execute pricing queries in parallel
    const pricingPromises = jurisdictions.map(async (jurisdiction) => {
      try {
        const pricing = await this.fetchPricingByJurisdiction(drugQuery, jurisdiction);
        return { jurisdiction, pricing, status: 'success' };
      } catch (error) {
        console.error(`[PharmaPricing] Error fetching ${jurisdiction} pricing:`, error.message);
        return {
          jurisdiction,
          error: error.message,
          status: 'error'
        };
      }
    });

    const pricingResults = await Promise.allSettled(pricingPromises);

    pricingResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.pricing[result.value.jurisdiction] = result.value;
      }
    });

    // Cache the results
    this.cache.set(cacheKey, {
      data: results,
      timestamp: Date.now()
    });

    return results;
  }

  /**
   * Fetch pricing by jurisdiction
   */
  async fetchPricingByJurisdiction(drugQuery, jurisdiction) {
    switch (jurisdiction.toUpperCase()) {
      case 'US':
        return this.fetchUSPricing(drugQuery);
      case 'UK':
        return this.fetchUKPricing(drugQuery);
      case 'AU':
        return this.fetchAUPricing(drugQuery);
      case 'EU':
        return this.fetchEUPricing(drugQuery);
      case 'DK':
        return this.fetchDKPricing(drugQuery);
      case 'FR':
        return this.fetchFRPricing(drugQuery);
      case 'ES':
        return this.fetchESPricing(drugQuery);
      default:
        throw new Error(`Unsupported jurisdiction: ${jurisdiction}`);
    }
  }

  /**
   * Fetch US Medicaid NADAC pricing
   */
  async fetchUSPricing(drugQuery) {
    try {
      // Query the Medicaid NADAC API
      const endpoint = 'https://data.medicaid.gov/api/1/datastore/query/';
      const datasetId = 'a4y5-998d'; // NADAC dataset ID

      // Build the query - search by NDC description
      const searchTerms = drugQuery.split(' ').filter(t => t.length > 2);

      const response = await fetch(`${endpoint}${datasetId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conditions: [
            {
              property: 'ndc_description',
              operator: 'CONTAINS',
              value: searchTerms[0] || drugQuery
            }
          ],
          limit: 50,
          sort: {
            property: 'as_of_date',
            order: 'desc'
          }
        })
      });

      if (!response.ok) {
        // Try alternative approach with simple GET
        return this.fetchUSPricingFallback(drugQuery);
      }

      const data = await response.json();

      return {
        source: 'Medicaid NADAC',
        sourceUrl: 'https://data.medicaid.gov/dataset/a4y5-998d',
        currency: 'USD',
        priceType: 'National Average Drug Acquisition Cost',
        description: 'The NADAC reflects the national average costs pharmacies pay to acquire prescription and over-the-counter drugs.',
        results: this.formatNADACResults(data.results || [])
      };
    } catch (error) {
      console.error('[PharmaPricing] NADAC API error:', error.message);
      return this.fetchUSPricingFallback(drugQuery);
    }
  }

  /**
   * Fallback US pricing method
   */
  async fetchUSPricingFallback(drugQuery) {
    // Return reference information about where to find pricing
    return {
      source: 'Medicaid NADAC',
      sourceUrl: 'https://data.medicaid.gov/dataset/a4y5-998d',
      currency: 'USD',
      priceType: 'National Average Drug Acquisition Cost',
      description: 'The NADAC reflects the national average costs pharmacies pay to acquire prescription drugs.',
      note: 'Real-time API query failed. Access the source URL for current pricing data.',
      searchQuery: drugQuery,
      manualLookup: `https://data.medicaid.gov/dataset/a4y5-998d?q=${encodeURIComponent(drugQuery)}`,
      results: []
    };
  }

  /**
   * Format NADAC results
   */
  formatNADACResults(results) {
    if (!Array.isArray(results)) return [];

    return results.map(item => ({
      ndc: item.ndc || item.NDC,
      drugName: item.ndc_description || item.NDC_DESCRIPTION,
      nadacPerUnit: parseFloat(item.nadac_per_unit || item.NADAC_PER_UNIT || 0),
      pricingUnit: item.pricing_unit || item.PRICING_UNIT || 'EA',
      effectiveDate: item.as_of_date || item.AS_OF_DATE,
      pharmacyType: item.pharmacy_type_indicator || item.PHARMACY_TYPE_INDICATOR || 'Both',
      classification: item.classification_for_rate_setting || item.CLASSIFICATION_FOR_RATE_SETTING
    }));
  }

  /**
   * Fetch UK NHS Drug Tariff pricing
   */
  async fetchUKPricing(drugQuery) {
    // NHS Drug Tariff requires registration for API access
    // Return reference information
    return {
      source: 'NHS Drug Tariff',
      sourceUrl: 'https://www.nhsbsa.nhs.uk/pharmacies-gp-practices-and-appliance-contractors/drug-tariff',
      alternativeUrl: 'https://bnf.nice.org.uk/',
      currency: 'GBP',
      priceType: 'Reimbursement Price',
      description: 'The NHS Drug Tariff lists the prices the NHS will reimburse pharmacies for dispensing medicines.',
      note: 'Direct API access requires NHSBSA registration. Prices also available via BNF.',
      searchQuery: drugQuery,
      manualLookup: `https://bnf.nice.org.uk/search/?q=${encodeURIComponent(drugQuery)}`,
      results: [],
      priceCategories: {
        'Category A': 'Drugs with an adequate number of suppliers',
        'Category C': 'Proprietary products only available from one source',
        'Category M': 'Most generics with adequate supplies'
      }
    };
  }

  /**
   * Fetch Australian PBS pricing
   */
  async fetchAUPricing(drugQuery) {
    // PBS has limited public API, provide reference information
    return {
      source: 'Pharmaceutical Benefits Scheme',
      sourceUrl: 'https://www.pbs.gov.au/',
      searchUrl: `https://www.pbs.gov.au/medicine/search?q=${encodeURIComponent(drugQuery)}`,
      currency: 'AUD',
      priceType: 'Dispensed Price for Maximum Quantity (DPMQ)',
      description: 'The PBS lists medicines subsidised by the Australian government. Prices shown are what the government pays.',
      note: 'PBS Schedule available for download. API access limited.',
      searchQuery: drugQuery,
      manualLookup: `https://www.pbs.gov.au/pbs/search?term=${encodeURIComponent(drugQuery)}`,
      results: [],
      patientContributions: {
        general: '$42.50 per prescription',
        concession: '$6.80 per prescription',
        safetyNetGeneral: '$1664.80/year threshold',
        safetyNetConcession: '$265.00/year threshold'
      }
    };
  }

  /**
   * Fetch aggregated EU pricing (summary only)
   */
  async fetchEUPricing(drugQuery) {
    // EU pricing data is fragmented across national databases
    // EURIPID database restricted to national authorities
    return {
      source: 'EU Aggregated (Multiple National Sources)',
      description: 'EU pharmaceutical pricing is managed at national level. Key databases include:',
      note: 'EURIPID database restricted to national pricing authorities. Public access varies by country.',
      searchQuery: drugQuery,
      currency: 'EUR',
      results: [],
      nationalDatabases: [
        {
          country: 'Germany',
          database: 'ABDA-Artikelstamm',
          url: 'https://www.abda.de/',
          priceType: 'Pharmacy selling price'
        },
        {
          country: 'France',
          database: 'BDPM',
          url: 'https://base-donnees-publique.medicaments.gouv.fr/',
          priceType: 'Public price'
        },
        {
          country: 'Spain',
          database: 'CIMA',
          url: 'https://cima.aemps.es/',
          priceType: 'Authorised price'
        },
        {
          country: 'Italy',
          database: 'AIFA',
          url: 'https://www.aifa.gov.it/',
          priceType: 'Ex-factory price'
        },
        {
          country: 'Netherlands',
          database: 'Z-Index',
          url: 'https://www.z-index.nl/',
          priceType: 'Pharmacy purchase price'
        }
      ],
      europeanSources: {
        EMA: 'https://www.ema.europa.eu/en/medicines',
        EURIPID: 'https://euripid.eu/ (restricted access)'
      }
    };
  }

  /**
   * Fetch Denmark pricing (medicinpriser.dk)
   */
  async fetchDKPricing(drugQuery) {
    return {
      source: 'Medicinpriser (Danish Medicines Agency)',
      sourceUrl: 'https://www.medicinpriser.dk/',
      searchUrl: `https://www.medicinpriser.dk/default.aspx?Ession=&LMS=&NavTree=&LangID=2&Terms=${encodeURIComponent(drugQuery)}`,
      currency: 'DKK',
      priceType: 'Pharmacy Retail Price',
      description: 'Danish pharmaceutical prices including pharmacy retail prices and reimbursement status.',
      searchQuery: drugQuery,
      results: [],
      note: 'Denmark has transparent pharmaceutical pricing. Site available in English.'
    };
  }

  /**
   * Fetch France pricing (BDPM)
   */
  async fetchFRPricing(drugQuery) {
    return {
      source: 'Base de Donnees Publique des Medicaments',
      sourceUrl: 'https://base-donnees-publique.medicaments.gouv.fr/',
      searchUrl: `https://base-donnees-publique.medicaments.gouv.fr/index.php#result`,
      currency: 'EUR',
      priceType: 'Prix Public (TTC)',
      description: 'French public database of medicines including pricing and reimbursement information.',
      searchQuery: drugQuery,
      results: [],
      reimbursementLevels: {
        100: 'Vital medications (irreplaceable)',
        65: 'Major therapeutic value',
        30: 'Moderate therapeutic value',
        15: 'Low therapeutic value'
      }
    };
  }

  /**
   * Fetch Spain pricing (CIMA)
   */
  async fetchESPricing(drugQuery) {
    return {
      source: 'CIMA - Centro de Informacion de Medicamentos',
      sourceUrl: 'https://cima.aemps.es/',
      searchUrl: `https://cima.aemps.es/cima/publico/lista.html`,
      currency: 'EUR',
      priceType: 'Precio Venta Publico (PVP)',
      description: 'Spanish medicines database maintained by AEMPS (Spanish Agency of Medicines).',
      searchQuery: drugQuery,
      results: [],
      priceTypes: {
        'PVL': 'Precio Venta Laboratorio (Manufacturer price)',
        'PVP': 'Precio Venta Publico (Public sale price)',
        'PVP IVA': 'PVP with VAT included'
      }
    };
  }

  /**
   * Search for drug by NDC code (US)
   */
  async searchByNDC(ndc) {
    try {
      const cleanNDC = ndc.replace(/[^0-9]/g, '');

      const response = await fetch('https://data.medicaid.gov/api/1/datastore/query/a4y5-998d', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conditions: [
            {
              property: 'ndc',
              operator: 'EQUALS',
              value: cleanNDC
            }
          ],
          limit: 10,
          sort: {
            property: 'as_of_date',
            order: 'desc'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return this.formatNADACResults(data.results || []);
    } catch (error) {
      console.error('[PharmaPricing] NDC lookup error:', error.message);
      return [];
    }
  }

  /**
   * Get supported jurisdictions
   */
  getSupportedJurisdictions() {
    return [
      { code: 'US', name: 'United States', sources: ['NADAC', 'FUL', 'ASP'] },
      { code: 'UK', name: 'United Kingdom', sources: ['NHS Drug Tariff', 'BNF'] },
      { code: 'AU', name: 'Australia', sources: ['PBS'] },
      { code: 'EU', name: 'European Union', sources: ['National databases'] },
      { code: 'DK', name: 'Denmark', sources: ['Medicinpriser'] },
      { code: 'FR', name: 'France', sources: ['BDPM'] },
      { code: 'ES', name: 'Spain', sources: ['CIMA'] }
    ];
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[PharmaPricing] Cache cleared');
  }
}

module.exports = PharmaPricingService;
