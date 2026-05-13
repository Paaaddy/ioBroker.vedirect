'use strict';
const { expect } = require('chai');
const sinon = require('sinon');

// Minimal adapter mock with updateConnectionState copied from main.js
function makeAdapter(initialStates = {}) {
	const adapter = {
		deviceConnectionStates: new Map(Object.entries(initialStates)),
		setStateChanged: sinon.stub(),
	};

	adapter.updateConnectionState = function updateConnectionState(changedDeviceId, newState) {
		let isAnyDeviceConnected = newState;
		if (!isAnyDeviceConnected) {
			for (const v of this.deviceConnectionStates.values()) {
				if (v) { isAnyDeviceConnected = true; break; }
			}
		}
		this.setStateChanged('info.connection', isAnyDeviceConnected, true);
		this.setStateChanged(`devices.${changedDeviceId}.info.connection`, newState, true);
	}.bind(adapter);

	return adapter;
}

afterEach(() => sinon.restore());

describe('updateConnectionState', () => {
	// ── global state ────────────────────────────────────────────────────────

	it('sets global info.connection true when device connects', () => {
		const adapter = makeAdapter({ dev1: false });
		adapter.deviceConnectionStates.set('dev1', true);
		adapter.updateConnectionState('dev1', true);
		const globalCall = adapter.setStateChanged.args.find(a => a[0] === 'info.connection');
		expect(globalCall[1]).to.equal(true);
	});

	it('sets global info.connection false when last device disconnects', () => {
		const adapter = makeAdapter({ dev1: false });
		adapter.updateConnectionState('dev1', false);
		const globalCall = adapter.setStateChanged.args.find(a => a[0] === 'info.connection');
		expect(globalCall[1]).to.equal(false);
	});

	it('keeps global info.connection true when one of two devices disconnects', () => {
		const adapter = makeAdapter({ dev1: true, dev2: true });
		adapter.deviceConnectionStates.set('dev1', false);
		adapter.updateConnectionState('dev1', false);
		const globalCall = adapter.setStateChanged.args.find(a => a[0] === 'info.connection');
		expect(globalCall[1]).to.equal(true);
	});

	it('sets global false when all devices are disconnected', () => {
		const adapter = makeAdapter({ dev1: false, dev2: false });
		adapter.updateConnectionState('dev2', false);
		const globalCall = adapter.setStateChanged.args.find(a => a[0] === 'info.connection');
		expect(globalCall[1]).to.equal(false);
	});

	// ── per-device state ────────────────────────────────────────────────────

	it('writes per-device state for the changed device', () => {
		const adapter = makeAdapter({ dev1: false });
		adapter.deviceConnectionStates.set('dev1', true);
		adapter.updateConnectionState('dev1', true);
		const deviceCall = adapter.setStateChanged.args.find(a => a[0] === 'devices.dev1.info.connection');
		expect(deviceCall).to.exist;
		expect(deviceCall[1]).to.equal(true);
	});

	it('does not write per-device state for other devices', () => {
		const adapter = makeAdapter({ dev1: true, dev2: true });
		adapter.deviceConnectionStates.set('dev1', false);
		adapter.updateConnectionState('dev1', false);
		const dev2Call = adapter.setStateChanged.args.find(a => a[0] === 'devices.dev2.info.connection');
		expect(dev2Call).to.not.exist;
	});

	// ── call count ──────────────────────────────────────────────────────────

	it('makes exactly two setStateChanged calls per invocation', () => {
		const adapter = makeAdapter({ dev1: false });
		adapter.deviceConnectionStates.set('dev1', true);
		adapter.updateConnectionState('dev1', true);
		expect(adapter.setStateChanged.callCount).to.equal(2);
	});
});
