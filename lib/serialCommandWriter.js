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
		this.getPort = options.getPort;
		this.getLastTelemetryAt = options.getLastTelemetryAt || (() => 0);
		this.minIntervalMs = options.minIntervalMs || 200;
		this.telemetryQuietTimeMs = options.telemetryQuietTimeMs || 100;
		this.queueEnabled = options.queueEnabled !== false;
		this.lastWriteAt = 0;
		// Commands for all configured devices are sent over one shared serial port.
		// Keep a single queue chain to guarantee global ordering and pacing.
		this.globalQueue = Promise.resolve();
	}

	async enqueue(deviceId, commandName, value) {
		if (!COMMAND_DEFINITIONS[commandName]) {
			throw new Error(`Unsupported command ${commandName}`);
		}

		if (!this.queueEnabled) {
			return this.writeCommand(commandName, value);
		}

		const nextQueue = this.globalQueue
			.catch(() => {
				// Avoid permanently breaking queue chain.
			})
			.then(() => this.writeCommand(commandName, value));
		this.globalQueue = nextQueue;
		return nextQueue;
	}

	async writeCommand(commandName, rawValue) {
		const definition = COMMAND_DEFINITIONS[commandName];
		const validatedValue = definition.validate(rawValue);
		await this.waitForRateLimit();
		await this.waitForTelemetryQuietWindow();
		const frame = this.buildFrame(definition.code, validatedValue);

		const serialPort = this.getPort ? this.getPort() : undefined;
		if (!serialPort || !serialPort.writable) {
			throw new Error('Serial port is not writable');
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
