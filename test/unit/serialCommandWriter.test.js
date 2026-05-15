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

// ── enqueue — queueEnabled:false (line 44-45) ────────────────────────────────

describe('SerialCommandWriter enqueue — queueEnabled:false', () => {
	it('writes directly bypassing queue when queueEnabled is false', async () => {
		const port = makeWritablePort();
		const w = new SerialCommandWriter(makeAdapter(), {
			...noDelayOptions(() => port),
			queueEnabled: false,
		});
		await w.enqueue('dev1', 'setMode', 1);
		expect(port.written[0]).to.equal('MODE\t1\r\n');
	});
});

// ── enqueue — stale discard (lines 56-58) ────────────────────────────────────

describe('SerialCommandWriter enqueue — stale discard', () => {
	it('discards command queued more than 30s ago without writing to port', async () => {
		const clock = sinon.useFakeTimers();
		const port = makeWritablePort();
		const adapter = makeAdapter();
		const w = new SerialCommandWriter(adapter, noDelayOptions(() => port));
		let resolveBlocker;
		const blocker = new Promise(r => { resolveBlocker = r; });
		w.deviceQueues.set('dev1', blocker);
		const p = w.enqueue('dev1', 'setMode', 1);
		await clock.tickAsync(30001);
		resolveBlocker();
		let threw = false;
		try { await p; } catch (_) { threw = true; }
		clock.restore();
		expect(threw).to.equal(true);
		expect(port.written).to.have.length(0);
		expect(adapter.log.warn.called).to.equal(true);
	});
});

// ── clearQueueForDevice (line 67) ────────────────────────────────────────────

describe('SerialCommandWriter.clearQueueForDevice', () => {
	it('removes the device queue entry from the Map', () => {
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => undefined));
		w.deviceQueues.set('dev1', Promise.resolve());
		w.clearQueueForDevice('dev1');
		expect(w.deviceQueues.has('dev1')).to.equal(false);
	});
});

// ── writeCommand — write timeout (lines 84-85) ───────────────────────────────

describe('SerialCommandWriter.writeCommand — write timeout', () => {
	it('rejects with timeout error when port write never completes', async () => {
		// Only fake setTimeout/clearTimeout — leaving setImmediate real so writeCommand's
		// async chain (two awaits before the Promise executor) can advance normally.
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const port = makeWritablePort();
		let writeStarted = false;
		port.write = sinon.stub().callsFake(() => { writeStarted = true; });
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		const p = w.writeCommand('dev1', 'setMode', 1);
		// Wait for writeCommand to reach port.write (confirms timeout timer is registered).
		while (!writeStarted) await Promise.resolve();
		clock.tick(5001);
		clock.restore();
		let err;
		try { await p; } catch (e) { err = e; }
		expect(err).to.be.instanceOf(Error);
		expect(err.message).to.include('timeout');
	});
});

// ── writeCommand — port close during write (lines 89-90) ─────────────────────

describe('SerialCommandWriter.writeCommand — port close during write', () => {
	it('rejects when port emits close event during write', async () => {
		const port = makeWritablePort();
		const listeners = {};
		port.once = sinon.stub().callsFake((event, cb) => { listeners[event] = cb; });
		port.write = sinon.stub().callsFake((_frame, _cb) => {
			// Simulate port closing before write completes
			if (listeners.close) listeners.close();
		});
		const w = new SerialCommandWriter(makeAdapter(), noDelayOptions(() => port));
		let err;
		try { await w.writeCommand('dev1', 'setMode', 1); } catch (e) { err = e; }
		expect(err).to.be.instanceOf(Error);
		expect(err.message).to.include('closed during write');
	});
});
