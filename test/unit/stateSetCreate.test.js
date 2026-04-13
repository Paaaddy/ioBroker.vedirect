'use strict';
const { expect } = require('chai');
const sinon = require('sinon');
const stateAttr = require('../../lib/stateAttr');

// Module-level warn dedup cache — mirrors main.js
const warnMessages = {};

// Minimal adapter mock with stateSetCreate copied from main.js
// so it runs in isolation without the ioBroker runtime.
function makeAdapter(config = {}) {
	const adapter = {
		config,
		createdStatesDetails: {},
		subscribedStates: new Set(),
		log: {
			debug: sinon.stub(),
			warn: sinon.stub(),
			error: sinon.stub(),
		},
		extendObject: sinon.stub(),
		setStateChanged: sinon.stub(),
		subscribeStates: sinon.stub(),
		sendSentry: sinon.stub(),
	};

	adapter.stateSetCreate = function stateSetCreate(deviceId, stateName, name, value) {
		const createStateName = `devices.${deviceId}.${stateName}`;
		this.log.debug('[stateSetCreate]' + createStateName + ' with value : ' + value);
		try {
			const common = {};
			const attr = stateAttr[name];
			if (!attr) {
				const warnMessage = `State attribute definition missing for + ${name}`;
				if (warnMessages[name] !== warnMessage) {
					warnMessages[name] = warnMessage;
					this.sendSentry(warnMessage);
				}
			}
			common.name = attr !== undefined ? attr.name || name : name;
			common.type = attr !== undefined ? attr.type || typeof (value) : typeof (value);
			common.role = attr !== undefined ? attr.role || 'state' : 'state';
			common.read = true;
			common.unit = attr !== undefined ? attr.unit || '' : '';
			common.write = attr !== undefined ? attr.write || false : false;

			const metadataChanged = (!this.createdStatesDetails[createStateName]) || (this.createdStatesDetails[createStateName] && (
				common.name !== this.createdStatesDetails[createStateName].name ||
				common.type !== this.createdStatesDetails[createStateName].type ||
				common.role !== this.createdStatesDetails[createStateName].role ||
				common.read !== this.createdStatesDetails[createStateName].read ||
				common.unit !== this.createdStatesDetails[createStateName].unit ||
				common.write !== this.createdStatesDetails[createStateName].write)
			);

			if (metadataChanged) {
				this.extendObject(createStateName, { type: 'state', common });
			}

			this.createdStatesDetails[createStateName] = common;

			if (value != null) {
				let expireTime = 0;
				if (this.config.expireTime != null) {
					if (attr && attr.expire != null) {
						if (attr.expire === true) expireTime = Number(this.config.expireTime);
						if (attr.expire === false) expireTime = 0;
					}
				}
				if (common.type === 'number') {
					value = parseFloat(value);
					if (isNaN(value)) {
						this.log.warn(`[stateSetCreate] Skipping NaN value for ${createStateName}: raw serial input was not a valid number`);
						return;
					}
				}
				this.setStateChanged(createStateName, { val: value, ack: true, expire: expireTime });
			}

			if (common.write && !this.subscribedStates.has(createStateName)) {
				this.subscribedStates.add(createStateName);
				this.subscribeStates(createStateName);
			}
		} catch (error) {
			this.sendSentry(`[stateSetCreate] ${error}`);
		}
	}.bind(adapter);

	return adapter;
}

afterEach(() => sinon.restore());

// ── metadata change detection ────────────────────────────────────────────────

describe('stateSetCreate — metadata change detection', () => {
	it('calls extendObject on first write (no prior state)', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', 12.6);
		expect(adapter.extendObject.calledOnce).to.equal(true);
		expect(adapter.extendObject.firstCall.args[0]).to.equal('devices.dev1.V');
	});

	it('skips extendObject on second write when metadata unchanged', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', 12.6);
		adapter.stateSetCreate('dev1', 'V', 'V', 12.7);
		expect(adapter.extendObject.calledOnce).to.equal(true);
	});

	it('calls extendObject again when metadata changes (simulated type change)', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', 12.6);
		// Directly mutate cached metadata to simulate a type change
		adapter.createdStatesDetails['devices.dev1.V'].type = 'string';
		adapter.stateSetCreate('dev1', 'V', 'V', 12.7);
		expect(adapter.extendObject.callCount).to.equal(2);
	});
});

// ── value writing ────────────────────────────────────────────────────────────

describe('stateSetCreate — value writing', () => {
	it('writes the converted value via setStateChanged', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', 12.6);
		expect(adapter.setStateChanged.calledOnce).to.equal(true);
		const call = adapter.setStateChanged.firstCall.args;
		expect(call[0]).to.equal('devices.dev1.V');
		expect(call[1].val).to.equal(12.6);
		expect(call[1].ack).to.equal(true);
	});

	it('skips setStateChanged when value is null', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', null);
		expect(adapter.setStateChanged.called).to.equal(false);
	});

	it('skips NaN numeric values and logs a warning', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', NaN);
		expect(adapter.setStateChanged.called).to.equal(false);
		expect(adapter.log.warn.calledOnce).to.equal(true);
	});

	it('skips NaN from non-numeric string on a number-type field', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', 'bad');
		expect(adapter.setStateChanged.called).to.equal(false);
		expect(adapter.log.warn.calledOnce).to.equal(true);
	});
});

// ── expire time ──────────────────────────────────────────────────────────────

describe('stateSetCreate — expire time', () => {
	it('sets expire=0 when expireTime config is absent', () => {
		const adapter = makeAdapter({ expireTime: null });
		adapter.stateSetCreate('dev1', 'V', 'V', 12.6);
		expect(adapter.setStateChanged.firstCall.args[1].expire).to.equal(0);
	});

	it('applies configured expireTime for fields with expire:true', () => {
		// 'V' has expire:true in stateAttr
		expect(stateAttr['V'].expire).to.equal(true);
		const adapter = makeAdapter({ expireTime: 30 });
		adapter.stateSetCreate('dev1', 'V', 'V', 12.6);
		expect(adapter.setStateChanged.firstCall.args[1].expire).to.equal(30);
	});

	it('keeps expire=0 for fields that have expire:false', () => {
		// Find a field with expire:false, or override manually
		// Use a known non-expiring field (SER# has no expire flag → treated as expire:false path)
		// We test the false branch by patching a local known field
		const adapter = makeAdapter({ expireTime: 30 });
		// H17 has expire:true, but we want expire:false — use a field without expire set
		// PID has no expire field → expireTime not applied (falls through with expireTime=0)
		adapter.stateSetCreate('dev1', 'PID', 'PID', 'HQ12345');
		expect(adapter.setStateChanged.firstCall.args[1].expire).to.equal(0);
	});
});

// ── subscribe deduplication ──────────────────────────────────────────────────

describe('stateSetCreate — subscribe deduplication', () => {
	it('does not subscribe non-writable states', () => {
		// 'V' is read-only
		expect(stateAttr['V'].write).to.not.equal(true);
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'V', 'V', 12.6);
		expect(adapter.subscribeStates.called).to.equal(false);
	});

	it('sends Sentry warning for unknown state key (once only)', () => {
		const adapter = makeAdapter();
		adapter.stateSetCreate('dev1', 'UNKNOWN_KEY_XYZ', 'UNKNOWN_KEY_XYZ', 'val');
		adapter.stateSetCreate('dev1', 'UNKNOWN_KEY_XYZ', 'UNKNOWN_KEY_XYZ', 'val2');
		// sendSentry called only once despite two invocations
		const sentryCallsForKey = adapter.sendSentry.args.filter(a =>
			a[0].includes('UNKNOWN_KEY_XYZ')
		);
		expect(sentryCallsForKey.length).to.equal(1);
	});
});
