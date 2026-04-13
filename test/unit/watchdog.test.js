'use strict';
const { expect } = require('chai');
const sinon = require('sinon');

// Minimal adapter mock with startConnectionWatchdog copied from main.js
function makeAdapter({ deviceLastTelemetryAt = {}, deviceConnectionStates = {} } = {}) {
	const adapter = {
		deviceLastTelemetryAt: new Map(Object.entries(deviceLastTelemetryAt)),
		deviceConnectionStates: new Map(Object.entries(deviceConnectionStates)),
		deviceReconnectSchedulers: new Map(),
		deviceConnectionWatchdogInterval: null,
		log: { error: sinon.stub(), debug: sinon.stub() },
		updateConnectionState: sinon.stub(),
	};

	adapter.startConnectionWatchdog = function startConnectionWatchdog() {
		if (this.deviceConnectionWatchdogInterval) {
			clearInterval(this.deviceConnectionWatchdogInterval);
		}
		this.deviceConnectionWatchdogInterval = setInterval(() => {
			const now = Date.now();
			for (const [deviceId, lastTelemetryAt] of this.deviceLastTelemetryAt.entries()) {
				const isConnected = this.deviceConnectionStates.get(deviceId);
				if (isConnected && now - lastTelemetryAt > 10000) {
					this.deviceConnectionStates.set(deviceId, false);
					this.updateConnectionState(deviceId, false);
					this.log.error(`No data received for 10 seconds on ${deviceId}, connection lost ?`);
					const scheduler = this.deviceReconnectSchedulers.get(deviceId);
					if (scheduler) {
						scheduler.scheduleRetry();
					}
				}
			}
		}, 1000);
	}.bind(adapter);

	return adapter;
}

describe('startConnectionWatchdog', () => {
	let clock;
	beforeEach(() => { clock = sinon.useFakeTimers(); });
	afterEach(() => { clock.restore(); sinon.restore(); });

	it('marks device disconnected after 10s of no telemetry', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now },
			deviceConnectionStates: { dev1: true },
		});
		adapter.startConnectionWatchdog();
		await clock.tickAsync(11000);
		expect(adapter.deviceConnectionStates.get('dev1')).to.equal(false);
	});

	it('calls updateConnectionState(deviceId, false) on timeout', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now },
			deviceConnectionStates: { dev1: true },
		});
		adapter.startConnectionWatchdog();
		await clock.tickAsync(11000);
		expect(adapter.updateConnectionState.calledWith('dev1', false)).to.equal(true);
	});

	it('calls scheduleRetry on the device scheduler', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now },
			deviceConnectionStates: { dev1: true },
		});
		const scheduler = { scheduleRetry: sinon.stub() };
		adapter.deviceReconnectSchedulers.set('dev1', scheduler);
		adapter.startConnectionWatchdog();
		await clock.tickAsync(11000);
		expect(scheduler.scheduleRetry.calledOnce).to.equal(true);
	});

	it('logs an error on timeout', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now },
			deviceConnectionStates: { dev1: true },
		});
		adapter.startConnectionWatchdog();
		await clock.tickAsync(11000);
		expect(adapter.log.error.calledOnce).to.equal(true);
	});

	it('does not fire before 10s', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now },
			deviceConnectionStates: { dev1: true },
		});
		adapter.startConnectionWatchdog();
		await clock.tickAsync(9999);
		expect(adapter.deviceConnectionStates.get('dev1')).to.equal(true);
		expect(adapter.updateConnectionState.called).to.equal(false);
	});

	it('does not fire when device is already disconnected', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now - 20000 },
			deviceConnectionStates: { dev1: false },
		});
		adapter.startConnectionWatchdog();
		await clock.tickAsync(11000);
		expect(adapter.updateConnectionState.called).to.equal(false);
	});

	it('resets and replaces existing interval when called twice', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now },
			deviceConnectionStates: { dev1: true },
		});
		adapter.startConnectionWatchdog();
		adapter.startConnectionWatchdog(); // second call replaces first
		await clock.tickAsync(11000);
		// Should still fire exactly once per watchdog tick, not twice
		expect(adapter.updateConnectionState.callCount).to.equal(1);
	});

	it('independently tracks multiple devices', async () => {
		const now = Date.now();
		const adapter = makeAdapter({
			deviceLastTelemetryAt: { dev1: now, dev2: now },
			deviceConnectionStates: { dev1: true, dev2: true },
		});
		adapter.startConnectionWatchdog();
		await clock.tickAsync(11000);
		expect(adapter.deviceConnectionStates.get('dev1')).to.equal(false);
		expect(adapter.deviceConnectionStates.get('dev2')).to.equal(false);
		expect(adapter.updateConnectionState.callCount).to.equal(2);
	});
});
