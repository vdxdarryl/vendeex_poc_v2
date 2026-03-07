/**
 * VendeeX — Provider Index
 * QwenProvider is preferred for chat windows (qualify + refine).
 * ClaudeProvider and ChatGPTProvider remain available for product search.
 *
 * VERIFICATION REQUIRED before merge.
 */

'use strict';

const ClaudeProvider = require('./ClaudeProvider');
const ChatGPTProvider = require('./ChatGPTProvider');
const PerplexityProvider = require('./PerplexityProvider');
const QwenProvider = require('./QwenProvider');

module.exports = {
  ClaudeProvider,
  ChatGPTProvider,
  PerplexityProvider,
  QwenProvider
};
