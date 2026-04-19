'use strict';
const { expect } = require('chai');
const sinon = require('sinon');
const { SerialCommandWriter, COMMAND_DEFINITIONS } = require('../../lib/serialCommandWriter');

function makeAdapter() {
	return { log: { info: sinon.stub(), debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub() } };
}

function makeWritablePort() {
	const port = { writable: true, written: [] };
	port.write = sinon.stub().callsFake((frame, cb) => { port.written.push(frame); cb(null); });
	port.drain = sinon.stub().callsFake((cb) => cb(null));
	port.once = sinon.stub();
	port.removeListener = sinon.stub();
	return port;
}

function noDelayOptions(getPort) {
	return {
		getPort,
		getLastTelemetryAt: () => 0,
		minIntervalMs: 0,
		telemetryQuietTimeMs: 0,
	};
}

afterEach(() => sinon.restore());

// ── COMMAND_DEFINITIONS ──────────────────────────────────────────────────────

describe('COMMAND_DEFINITIONS validation', () => {
	it('setMode accepts 1', () => {
		expect(() => COMMAND_DEFINITIONS.setMode.validate(1)).to.not.throw();
	});
	it('setMode accepts 4', () => {
		expect(() => COMMAND_DEFINITIONS.setMode.validate(4)).to.not.throw();
	});
	it('setMode rejects 2', () => {
		expect(() => COMMAND_DEFINITIONS.setMode.validate(2)).to.throw();
	});
	it('setMode rejects non-integer', () => {
		expect(() => COMMAND_DEFINITIONS.setMode.validate(1.5)).to.throw();
	});
	it('setMode rejects string', () => {
		expect(() => COMMAND_DEFINITIONS.setMode.validate('1')).to.throw();
	});
	it('setLoad true → "ON"', () => {
		expect(COMMAND_DEFINITIONS.setLoad.validate(true)).to.equal('ON');
	});
	it('setLoad false → "OFF"', () => {
		expect(COMMAND_DEFINITIONS.setLoad.validate(false)).to.equal('OFF');
	});
	it('setLoad rejects number', () => {
		expect(() => COMMAND_DEFINITIONS.setLoad.validate(1)).to.throw();
	});
});

// ── buildFrame ───────────────────────────────────────────────────────────────

describe('SerialCommandWriter.buildFrame', () => {
	it('produces TAB-delimited frame with CRLF', () => {
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => undefined));
		expect(w.buildFrame('MODE', 1)).to.equal('MODE\t1\r\n');
	});
});

// ── enqueue — unknown command ────────────────────────────────────────────────

describe('SerialCommandWriter.enqueue', () => {
	it('rejects unknown command name', async () => {
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => undefined));
		let threw = false;
		try { await w.enqueue('dev1', 'setVoltage', 12); } catch (_e) { threw = true; }
		expect(threw).to.equal(true);
	});
});

// ── writeCommand ─────────────────────────────────────────────────────────────

describe('SerialCommandWriter.writeCommand', () => {
	it('throws when port is undefined', async () => {
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => undefined));
		let threw = false;
		try { await w.writeCommand('dev1', 'setMode', 1); } catch (_e) { threw = true; }
		expect(threw).to.equal(true);
	});

	it('throws when port.writable is false', async () => {
		const port = makeWritablePort();
		port.writable = false;
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		let threw = false;
		try { await w.writeCommand('dev1', 'setMode', 1); } catch (_e) { threw = true; }
		expect(threw).to.equal(true);
	});

	it('writes correct frame to port', async () => {
		const port = makeWritablePort();
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		await w.writeCommand('dev1', 'setMode', 1);
		expect(port.written[0]).to.equal('MODE\t1\r\n');
	});

	it('writes setLoad frame', async () => {
		const port = makeWritablePort();
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		await w.writeCommand('dev1', 'setLoad', true);
		expect(port.written[0]).to.equal('LOAD\tON\r\n');
	});

	it('propagates write error', async () => {
		const port = makeWritablePort();
		port.write.callsFake((_f, cb) => cb(new Error('serial write failed')));
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		let err;
		try { await w.writeCommand('dev1', 'setMode', 1); } catch (e) { err = e; }
		expect(err).to.be.instanceOf(Error);
		expect(err.message).to.include('serial write failed');
	});

	it('propagates drain error', async () => {
		const port = makeWritablePort();
		port.drain.callsFake((cb) => cb(new Error('drain failed')));
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		let err;
		try { await w.writeCommand('dev1', 'setMode', 1); } catch (e) { err = e; }
		expect(err.message).to.include('drain failed');
	});
});

// ── waitForRateLimit ─────────────────────────────────────────────────────────

describe('SerialCommandWriter.waitForRateLimit', () => {
	it('does not delay when minIntervalMs is 0', async () => {
		const w = new SerialCommandWriter(makeAdapter(), { getPort: () => undefined, minIntervalMs: 0, telemetryQuietTimeMs: 0 });
		// Resolves immediately — test will timeout if it hangs
		await w.waitForRateLimit();
	});

	it('delays by remaining interval when last write was recent', async () => {
		const clock = sinon.useFakeTimers();
		const w = new SerialCommandWriter(makeAdapter(), { getPort: () => undefined, minIntervalMs: 200, telemetryQuietTimeMs: 0 });
		w.lastWriteAtByDevice.set('dev1', Date.now() - 100); // 100ms ago → 100ms remaining
		let resolved = false;
		w.waitForRateLimit('dev1').then(() => { resolved = true; });
		await clock.tickAsync(99);
		expect(resolved).to.equal(false);
		await clock.tickAsync(1);
		clock.restore();
		expect(resolved).to.equal(true);
	});
});

// ── waitForTelemetryQuietWindow ──────────────────────────────────────────────

describe('SerialCommandWriter.waitForTelemetryQuietWindow', () => {
	it('delays when telemetry arrived too recently', async () => {
		const clock = sinon.useFakeTimers();
		const w = new SerialCommandWriter(makeAdapter(), {
			getPort: () => undefined,
			minIntervalMs: 0,
			telemetryQuietTimeMs: 100,
			getLastTelemetryAt: () => Date.now() - 50,
		});
		let resolved = false;
		w.waitForTelemetryQuietWindow('dev1').then(() => { resolved = true; });
		await clock.tickAsync(49);
		expect(resolved).to.equal(false);
		await clock.tickAsync(1);
		clock.restore();
		expect(resolved).to.equal(true);
	});

	it('does not delay when telemetry is old enough', async () => {
		const w = new SerialCommandWriter(makeAdapter(), {
			getPort: () => undefined,
			minIntervalMs: 0,
			telemetryQuietTimeMs: 100,
			getLastTelemetryAt: () => Date.now() - 200,
		});
		let resolved = false;
		w.waitForTelemetryQuietWindow('dev1').then(() => { resolved = true; });
		await Promise.resolve();
		expect(resolved).to.equal(true);
	});
});

// ── queue serialization ──────────────────────────────────────────────────────

describe('SerialCommandWriter queue serialization', () => {
	it('two commands execute in order', async () => {
		const port = makeWritablePort();
		const order = [];
		port.write.callsFake((frame, cb) => { order.push(frame); cb(null); });
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		await Promise.all([
			w.enqueue('dev1', 'setMode', 1),
			w.enqueue('dev1', 'setLoad', true),
		]);
		expect(order[0]).to.equal('MODE\t1\r\n');
		expect(order[1]).to.equal('LOAD\tON\r\n');
	});

	it('queue continues after a failed command', async () => {
		const port = makeWritablePort();
		let callCount = 0;
		port.write.callsFake((frame, cb) => {
			callCount++;
			callCount === 1 ? cb(new Error('first fails')) : cb(null);
		});
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		await w.enqueue('dev1', 'setMode', 1).catch(() => {});
		await w.enqueue('dev1', 'setLoad', true);
		expect(callCount).to.equal(2);
	});
});
