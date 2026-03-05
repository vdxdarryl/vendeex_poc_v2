/**
 * VendeeX 2.0 - Multi-Provider Search Test Script
 *
 * Run with: node test-search.js
 *
 * Tests the multi-provider search functionality
 */

require('dotenv').config({ override: true });

const { MultiProviderSearch, PharmaPricingService } = require('./services');

async function runTests() {
  console.log('='.repeat(60));
  console.log('VendeeX 2.0 - Multi-Provider Search Tests');
  console.log('='.repeat(60));
  console.log();

  // Initialize services
  const searchService = new MultiProviderSearch({
    perplexityKey: process.env.PERPLEXITY_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY
  });

  const pharmaPricing = new PharmaPricingService();

  // Test 1: Check available providers
  console.log('Test 1: Available Providers');
  console.log('-'.repeat(40));
  const availableProviders = searchService.getAvailableProviders();
  console.log('Available:', availableProviders.length > 0 ? availableProviders.join(', ') : 'None');
  console.log('Health:', JSON.stringify(searchService.getHealth(), null, 2));
  console.log();

  // Test 2: Check pharma query detection
  console.log('Test 2: Pharmaceutical Query Detection');
  console.log('-'.repeat(40));
  const testQueries = [
    { query: 'iPhone 15 Pro Max 256GB', expectPharma: false },
    { query: 'Metformin 500mg tablets', expectPharma: true },
    { query: 'Ozempic 1mg injection', expectPharma: true },
    { query: 'wireless headphones', expectPharma: false },
    { query: 'atorvastatin generic', expectPharma: true },
    { query: 'blood glucose monitors', expectPharma: true }
  ];

  testQueries.forEach(({ query, expectPharma }) => {
    const detected = searchService.detectPharmaQuery(query);
    const status = detected === expectPharma ? 'PASS' : 'FAIL';
    console.log(`[${status}] "${query}" - Detected: ${detected}, Expected: ${expectPharma}`);
  });
  console.log();

  // Test 3: Pharmaceutical jurisdictions
  console.log('Test 3: Supported Pharmaceutical Jurisdictions');
  console.log('-'.repeat(40));
  const jurisdictions = pharmaPricing.getSupportedJurisdictions();
  jurisdictions.forEach(j => {
    console.log(`  ${j.code}: ${j.name} - Sources: ${j.sources.join(', ')}`);
  });
  console.log();

  // Test 4: Live search (if providers available)
  if (availableProviders.length > 0) {
    console.log('Test 4: Live Search Test');
    console.log('-'.repeat(40));
    console.log('Running search for "wireless noise cancelling headphones"...');

    try {
      const startTime = Date.now();
      const results = await searchService.search('wireless noise cancelling headphones', {
        providers: availableProviders,
        consolidate: true,
        timeout: 30000
      });
      const duration = Date.now() - startTime;

      console.log(`Search completed in ${duration}ms`);
      console.log(`Providers queried: ${results.options.providers.join(', ')}`);
      console.log(`Products found: ${results.consolidated?.products?.length || 0}`);
      console.log(`Confidence: ${results.consolidated?.confidence?.score || 0}% (${results.consolidated?.confidence?.level || 'unknown'})`);

      if (results.consolidated?.products?.length > 0) {
        console.log('\nTop 3 Results:');
        results.consolidated.products.slice(0, 3).forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name}`);
          console.log(`     Price: $${p.price || 'N/A'} | Rating: ${p.rating || 'N/A'} | Match: ${p.matchScore || 'N/A'}%`);
          console.log(`     Sources: ${p.sourceProviders?.join(', ') || 'unknown'}`);
        });
      }
    } catch (error) {
      console.log(`Search failed: ${error.message}`);
    }
  } else {
    console.log('Test 4: Live Search Test (SKIPPED - No providers configured)');
    console.log('-'.repeat(40));
    console.log('Set at least one API key in .env to run live search tests:');
    console.log('  - PERPLEXITY_API_KEY');
    console.log('  - ANTHROPIC_API_KEY');
    console.log('  - OPENAI_API_KEY');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Tests Complete');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
