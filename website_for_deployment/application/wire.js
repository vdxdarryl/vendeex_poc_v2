/**
 * Application: Wire the message bus with handlers and dependencies.
 * Call once at server startup. Returns the bus so routes can dispatch.
 */

const { MessageBus } = require('./MessageBus');
const { createRunSearchHandler } = require('./handlers/RunSearchHandler');

const RUN_SEARCH = 'RunSearch';

/**
 * @param {object} deps - { multiProviderSearch, config }
 * @param {object} config - { channel3ApiKey, channel3BaseUrl, affiliateApiKey, affiliateBaseUrl }
 * @returns {MessageBus}
 */
function wireBus(deps) {
    const bus = new MessageBus();
    const runSearchHandler = createRunSearchHandler(deps);
    bus.register(RUN_SEARCH, runSearchHandler);
    return bus;
}

module.exports = { wireBus, RUN_SEARCH };
