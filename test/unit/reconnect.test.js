'use strict';
const { expect } = require('chai');
const sinon = require('sinon');
const { createReconnectScheduler } = require('../../lib/reconnect');

describe('createReconnectScheduler', () => {
	let clock;

	beforeEach(() => { clock = sinon.useFakeTimers(); });
	afterEach(() => { clock.restore(); });

	it('fires onAttempt after initialDelayMs', () => {
		const onAttempt = sinon.spy();
		const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
		scheduler.scheduleRetry();
		clock.tick(999);
		expect(onAttempt.callCount).to.equal(0);
		clock.tick(1);
		expect(onAttempt.callCount).to.equal(1);
	});

	it('doubles the delay on each scheduleRetry call', () => {
		const onAttempt = sinon.spy();
		const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });

		scheduler.scheduleRetry();
		clock.tick(1000);                   // fires after 1000ms
		expect(scheduler.currentDelayMs).to.equal(2000);

		scheduler.scheduleRetry();
		clock.tick(2000);                   // fires after 2000ms
		expect(scheduler.currentDelayMs).to.equal(4000);
	});

	it('caps delay at maxDelayMs', () => {
		const onAttempt = sinon.spy();
		const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 4000 });

		scheduler.scheduleRetry(); clock.tick(1000);  // 1000 → 2000
		scheduler.scheduleRetry(); clock.tick(2000);  // 2000 → 4000
		scheduler.scheduleRetry(); clock.tick(4000);  // 4000 → capped at 4000
		expect(scheduler.currentDelayMs).to.equal(4000);

		scheduler.scheduleRetry(); clock.tick(4000);  // still 4000
		expect(scheduler.currentDelayMs).to.equal(4000);
		expect(onAttempt.callCount).to.equal(4);
	});

	it('cancel() prevents the scheduled callback from firing', () => {
		const onAttempt = sinon.spy();
		const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
		scheduler.scheduleRetry();
		scheduler.cancel();
		clock.tick(2000);
		expect(onAttempt.callCount).to.equal(0);
	});

	it('cancel() resets delay to initialDelayMs', () => {
		const onAttempt = sinon.spy();
		const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
		scheduler.scheduleRetry(); clock.tick(1000);  // delay is now 2000
		scheduler.cancel();
		expect(scheduler.currentDelayMs).to.equal(1000);
	});

	it('calling scheduleRetry() twice does not stack timers', () => {
		const onAttempt = sinon.spy();
		const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
		scheduler.scheduleRetry();
		scheduler.scheduleRetry();  // should cancel first and reschedule
		clock.tick(1000);
		expect(onAttempt.callCount).to.equal(1);  // not 2
	});
});
