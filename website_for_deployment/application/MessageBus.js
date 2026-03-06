/**
 * Application: In-process message bus.
 * Registers handlers by message type (command/query name); dispatch invokes the handler and returns the result.
 */

class MessageBus {
    constructor() {
        this._handlers = new Map();
    }

    /**
     * Register a handler for a message type.
     * @param {string} messageType - e.g. 'RunSearch'
     * @param {Function} handler - async (message) => result
     */
    register(messageType, handler) {
        if (typeof handler !== 'function') throw new Error('Handler must be a function');
        this._handlers.set(messageType, handler);
    }

    /**
     * Dispatch a message to its handler. Returns the handler's result (or throws).
     * @param {string} messageType
     * @param {object} message - payload
     * @returns {Promise<*>}
     */
    async dispatch(messageType, message) {
        const handler = this._handlers.get(messageType);
        if (!handler) throw new Error(`No handler registered for: ${messageType}`);
        return handler(message);
    }
}

module.exports = { MessageBus };
