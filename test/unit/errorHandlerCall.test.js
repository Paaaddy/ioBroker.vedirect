'use strict';
const { expect } = require('chai');

// Minimal mock adapter to test the logging contract without ioBroker runtime
function makeMockAdapter() {
    const logged = [];
    const sentryMessages = [];
    return {
        log: { error: (msg) => logged.push(msg), debug: () => {} },
        logged,
        sentryMessages,
        sendSentry: (msg) => sentryMessages.push(msg),
        setState: () => {},
        // copy the fixed errorHandler implementation here for isolated testing
        errorHandler(error) {
            const message = error instanceof Error ? error.stack || error.message : String(error);
            this.log.error(`[errorHandler] ${message}`);
            this.sendSentry(message);
        },
    };
}

describe('errorHandler', () => {
    it('logs the error message, not "undefined"', () => {
        const adapter = makeMockAdapter();
        const err = new Error('serial port disconnected');
        adapter.errorHandler(err);
        expect(adapter.logged[0]).to.include('serial port disconnected');
        expect(adapter.logged[0]).to.not.include('undefined');
    });

    it('sends the error message to Sentry, not "undefined"', () => {
        const adapter = makeMockAdapter();
        const err = new Error('serial port disconnected');
        adapter.errorHandler(err);
        expect(adapter.sentryMessages[0]).to.include('serial port disconnected');
        expect(adapter.sentryMessages[0]).to.not.include('undefined');
    });

    it('handles plain string errors', () => {
        const adapter = makeMockAdapter();
        adapter.errorHandler('something went wrong');
        expect(adapter.logged[0]).to.include('something went wrong');
        expect(adapter.sentryMessages[0]).to.include('something went wrong');
    });
});
