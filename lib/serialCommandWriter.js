'use strict';

const COMMAND_DEFINITIONS = {
	setMode: {
		code: 'MODE',
		validate(value) {
			if (typeof value !== 'number' || !Number.isInteger(value) || ![1, 4].includes(value)) {
				throw new Error('setMode supports only integer values 1 (on) or 4 (off)');
			}
			return value;
		}
	},
	setLoad: {
		code: 'LOAD',
		validate(value) {
			if (typeof value !== 'boolean') {
				throw new Error('setLoad requires a boolean value');
			}
			return value ? 'ON' : 'OFF';
		}
	}
};

class SerialCommandWriter {
	constructor(adapter, options = {}) {
		this.adapter = adapter;
		this.getPortByDeviceId = options.getPortByDeviceId;
		this.getPortPathByDeviceId = options.getPortPathByDeviceId || (() => undefined);
		this.getLastTelemetryAt = options.getLastTelemetryAt || (() => 0);
		this.minIntervalMs = options.minIntervalMs || 200;
		this.telemetryQuietTimeMs = options.telemetryQuietTimeMs || 100;
		this.queueEnabled = options.queueEnabled !== false;
		this.lastWriteAt = 0;
		this.deviceQueues = new Map();
	}

	async enqueue(deviceId, commandName, value) {
		if (!COMMAND_DEFINITIONS[commandName]) {
			throw new Error(`Unsupported command ${commandName}`);
		}

		if (!this.queueEnabled) {
			return this.writeCommand(deviceId, commandName, value);
		}

		const currentQueue = this.deviceQueues.get(deviceId) || Promise.resolve();
		const nextQueue = currentQueue
			.catch(() => {
				// Avoid permanently breaking queue chain.
			})
			.then(() => this.writeCommand(deviceId, commandName, value));
		this.deviceQueues.set(deviceId, nextQueue);
		return nextQueue;
	}

	async writeCommand(deviceId, commandName, rawValue) {
		const definition = COMMAND_DEFINITIONS[commandName];
		const validatedValue = definition.validate(rawValue);
		await this.waitForRateLimit();
		await this.waitForTelemetryQuietWindow();
		const frame = this.buildFrame(definition.code, validatedValue);

		const serialPort = this.getPortByDeviceId ? this.getPortByDeviceId(deviceId) : undefined;
		if (!serialPort || !serialPort.writable) {
			const serialPath = this.getPortPathByDeviceId(deviceId);
			throw new Error(`No writable serial port for device ${deviceId}${serialPath ? ` (${serialPath})` : ''}`);
		}

		await new Promise((resolve, reject) => {
			serialPort.write(frame, (error) => {
				if (error) {
					reject(error);
					return;
				}
				serialPort.drain((drainError) => {
					if (drainError) {
						reject(drainError);
						return;
					}
					resolve();
				});
			});
		});
		this.lastWriteAt = Date.now();
		this.adapter.log.info(`VE.Direct command sent: ${commandName}=${validatedValue}`);
	}

	buildFrame(command, value) {
		return `${command}\t${value}\r\n`;
	}

	async waitForRateLimit() {
		const elapsed = Date.now() - this.lastWriteAt;
		if (elapsed < this.minIntervalMs) {
			await this.sleep(this.minIntervalMs - elapsed);
		}
	}

	async waitForTelemetryQuietWindow() {
		const elapsedSinceTelemetry = Date.now() - this.getLastTelemetryAt();
		if (elapsedSinceTelemetry < this.telemetryQuietTimeMs) {
			await this.sleep(this.telemetryQuietTimeMs - elapsedSinceTelemetry);
		}
	}

	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

module.exports = {
	SerialCommandWriter,
	COMMAND_DEFINITIONS,
};
