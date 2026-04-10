'use strict';

/*
 * Created with @iobroker/create-adapter v1.16.0
   VE.Direct Protocol Version 3.33 from 6. June 2023
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
// Load your modules here, e.g.:
const {SerialPort, ReadlineParser} = require('serialport');
const stateAttr = require(__dirname + '/lib/stateAttr.js');
const { lookups } = require(__dirname + '/lib/lookups.js');
const { convertValue } = require(__dirname + '/lib/converters.js');
const {SerialCommandWriter, COMMAND_DEFINITIONS} = require(__dirname + '/lib/serialCommandWriter.js');
const { getConfiguredDevices } = require(__dirname + '/lib/deviceConfig.js');
const { validateDevicePath } = require(__dirname + '/lib/pathValidation.js');
const { createReconnectScheduler } = require(__dirname + '/lib/reconnect.js');
const warnMessages = {}; // Array to avoid unneeded spam too sentry

const disableSentry = false; // Sentry error reporting enabled

// Module-level constant for VE.Direct lookup-based fields
const LOOKUP_KEYS = {
	'AR':   (res, lk) => lk.alarm_reason(res[1]),
	'WARN': (res, lk) => lk.alarm_reason(res[1]),
	'OR':   (res, lk) => lk.off_reason(res[1]),
	'ERR':  (res, lk) => lk.err_state(res[1]),
	'CS':   (res, lk) => lk.cs_state(res[1]),
	'PID':  (res, lk) => lk.product_longname(res[1]),
	'MODE': (res, lk) => lk.device_mode(res[1]),
	'MPPT': (res, lk) => lk.mppt_mode(res[1]),
	'MON':  (res, lk) => lk.monitor_type(res[1]),
};

class Vedirect extends utils.Adapter {
	/**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
	constructor(options) {
		// @ts-ignore
		super({
			...options,
			name: 'vedirect',
		});
		this.on('ready', this.onReady.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
		this.createdStatesDetails = {}; //  Array to store state objects to avoid unneeded object changes
		this.commandChannelPrefix = '';
		this.commandChannelPrefixes = new Set();
		this.commandStateDefinitions = [];
		this.commandStateById = new Map();
		this.devicePorts = new Map();
		this.deviceMessageBufferFlags = new Map();
		this.deviceMessageBufferTimers = new Map();
		this.deviceLastTelemetryAt = new Map();
		this.deviceConnectionStates = new Map();
		this.deviceReconnectSchedulers = new Map();
		this.deviceConnectionWatchdogInterval = null;
		this.commandWriter = new SerialCommandWriter(this, {
			getPort: (deviceId) => this.devicePorts.get(deviceId),
			getLastTelemetryAt: (deviceId) => this.deviceLastTelemetryAt.get(deviceId) || 0,
			minIntervalMs: 250,
			telemetryQuietTimeMs: 100,
			queueEnabled: true,
		});
	}

	/**
     * Is called when databases are connected and adapter received configuration.
     */
	async onReady() {
		// Initialize your adapter here
		this.log.info('Starting VE.Direct with Protocol Version 3.33 and configurable expiring state capability');
		this.setState('info.connection', false, true);

		try {
			const configuredDevices = this.getConfiguredDevices();
			if (configuredDevices.length === 0) {
				throw new Error('No USB device configured. Please provide at least one device path in the instance settings.');
			}
			const primaryDevice = configuredDevices[0];
			const deviceId = this.getDeviceId(primaryDevice.path);
			this.commandChannelPrefix = `devices.${deviceId}.commands`;
			const processedDeviceIds = new Set();
			const uniqueConfiguredDevices = [];
			for (const configuredDevice of configuredDevices) {
				const configuredDeviceId = this.getDeviceId(configuredDevice.path);
				if (processedDeviceIds.has(configuredDeviceId)) {
					continue;
				}
				processedDeviceIds.add(configuredDeviceId);
				uniqueConfiguredDevices.push({
					...configuredDevice,
					deviceId: configuredDeviceId
				});
				await this.ensureCommandStates(configuredDeviceId);
			}
			let anyOpened = false;
			for (const configuredDevice of uniqueConfiguredDevices) {
				try {
					await this.openDevicePort(configuredDevice.deviceId, configuredDevice.path);
					anyOpened = true;
				} catch (error) {
					this.log.error(`Failed to open device ${configuredDevice.deviceId} at ${configuredDevice.path}: ${error.message}`);
				}
			}
			if (!anyOpened) {
				throw new Error('No VE.Direct devices could be opened. Check device paths and permissions.');
			}
			this.startConnectionWatchdog();

		} catch (error) {
			this.log.error('Connection to VE.Direct device failed !');
			this.setState('info.connection', false, true);
			this.errorHandler(error);
		}
	}

	async openDevicePort(deviceId, path) {
		validateDevicePath(deviceId, path, (msg) => this.log.warn(msg));

		if (!this.deviceReconnectSchedulers.has(deviceId)) {
			this.deviceReconnectSchedulers.set(deviceId,
				createReconnectScheduler(() => this.openDevicePort(deviceId, path)));
		}
		const scheduler = this.deviceReconnectSchedulers.get(deviceId);

		const serialPort = new SerialPort({
			path,
			baudRate: 19200
		});
		this.devicePorts.set(deviceId, serialPort);
		this.deviceConnectionStates.set(deviceId, false);
		this.deviceLastTelemetryAt.set(deviceId, 0);

		serialPort.on('error', (error) => {
			this.log.error(`Issue handling serial port connection for ${deviceId}: ${JSON.stringify(error)}`);
			this.deviceConnectionStates.set(deviceId, false);
			this.updateConnectionState();
			scheduler.scheduleRetry();
		});
		serialPort.on('close', () => {
			this.deviceConnectionStates.set(deviceId, false);
			this.updateConnectionState();
			scheduler.scheduleRetry();
		});

		const parser = serialPort.pipe(new ReadlineParser({delimiter: '\r\n'}));
		parser.on('data', (data) => {
			scheduler.cancel();
			this.deviceLastTelemetryAt.set(deviceId, Date.now());
			this.log.debug(`[Serial data received ${deviceId}] ${data}`);
			if (!this.deviceMessageBufferFlags.get(deviceId)) {
				this.log.debug(`Message buffer inactive for ${deviceId}, processing data`);
				this.parse_serial(deviceId, data);
				if (this.config.messageBuffer > 0) {
					this.log.debug(`Activate Message buffer for ${deviceId} with delay of ${this.config.messageBuffer * 1000}`);
					this.deviceMessageBufferFlags.set(deviceId, true);
					if (this.deviceMessageBufferTimers.get(deviceId)) {
						clearTimeout(this.deviceMessageBufferTimers.get(deviceId));
					}
					const messageBufferTimer = setTimeout(() => {
						this.deviceMessageBufferFlags.set(deviceId, false);
						this.log.debug(`Message buffer timeout reached for ${deviceId}, will process data`);
					}, this.config.messageBuffer * 1000);
					this.deviceMessageBufferTimers.set(deviceId, messageBufferTimer);
				}
			} else {
				this.log.debug(`Message buffer active for ${deviceId}, message ignored`);
			}
			this.deviceConnectionStates.set(deviceId, true);
			this.updateConnectionState();
		});

		parser.on('error', (error) => {
			this.log.error(`Issue handling serial parser for ${deviceId}: ${JSON.stringify(error)}`);
			this.deviceConnectionStates.set(deviceId, false);
			this.updateConnectionState();
			scheduler.scheduleRetry();
		});
	}

	updateConnectionState() {
		const isAnyDeviceConnected = Array.from(this.deviceConnectionStates.values()).some(Boolean);
		this.setState('info.connection', isAnyDeviceConnected, true);
		for (const [deviceId, isConnected] of this.deviceConnectionStates.entries()) {
			this.setStateChanged(`devices.${deviceId}.info.connection`, isConnected, true);
		}
	}

	startConnectionWatchdog() {
		if (this.deviceConnectionWatchdogInterval) {
			clearInterval(this.deviceConnectionWatchdogInterval);
		}
		this.deviceConnectionWatchdogInterval = setInterval(() => {
			const now = Date.now();
			for (const [deviceId, lastTelemetryAt] of this.deviceLastTelemetryAt.entries()) {
				const isConnected = this.deviceConnectionStates.get(deviceId);
				if (isConnected && now - lastTelemetryAt > 10000) {
					this.deviceConnectionStates.set(deviceId, false);
					this.updateConnectionState();
					this.log.error(`No data received for 10 seconds on ${deviceId}, connection lost ?`);
					const scheduler = this.deviceReconnectSchedulers.get(deviceId);
					if (scheduler) {
						scheduler.scheduleRetry();
					}
				}
			}
		}, 1000);
	}

	getConfiguredDevices() {
		return getConfiguredDevices(this.config);
	}

	getDeviceId(pathOverride) {
		const usbPath = pathOverride || this.config.USBDevice || 'default';
		return String(usbPath)
			.replace(/[^a-zA-Z0-9_-]/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '') || 'default';
	}

	async ensureCommandStates(deviceId) {
		const deviceChannelId = `devices.${deviceId}`;
		const commandsChannelId = `${deviceChannelId}.commands`;
		this.commandChannelPrefixes.add(commandsChannelId);
		await this.extendObject('devices', {
			type: 'channel',
			common: {
				name: 'VE.Direct devices'
			},
			native: {}
		});
		await this.extendObject(deviceChannelId, {
			type: 'channel',
			common: {
				name: `Device ${deviceId}`
			},
			native: {}
		});
		await this.extendObject(commandsChannelId, {
			type: 'channel',
			common: {
				name: `Commands for ${deviceId}`
			},
			native: {}
		});
		await this.extendObject(`${deviceChannelId}.info`, {
			type: 'channel',
			common: {
				name: `Connection info for ${deviceId}`
			},
			native: {}
		});
		await this.extendObject(`${deviceChannelId}.info.connection`, {
			type: 'state',
			common: {
				name: `Device ${deviceId} connected`,
				type: 'boolean',
				role: 'indicator.connected',
				read: true,
				write: false
			},
			native: {}
		});

		const commandStateDefinitionsForDevice = [
			{
				id: `${commandsChannelId}.setMode`,
				common: {
					name: 'Set charger mode (1=ON, 4=OFF)',
					role: 'level.mode',
					type: 'number',
					read: true,
					write: true,
					min: 1,
					max: 4,
					states: {
						1: 'On',
						4: 'Off'
					}
				},
				native: {
					command: 'setMode'
				}
			},
			{
				id: `${commandsChannelId}.setLoad`,
				common: {
					name: 'Set load output',
					role: 'switch.enable',
					type: 'boolean',
					read: true,
					write: true,
					def: false
				},
				native: {
					command: 'setLoad'
				}
			}
		];

		for (const definition of commandStateDefinitionsForDevice) {
			const existingDefinitionIndex = this.commandStateDefinitions.findIndex(
				(existingDefinition) => existingDefinition.id === definition.id
			);
			if (existingDefinitionIndex >= 0) {
				this.commandStateDefinitions[existingDefinitionIndex] = definition;
			} else {
				this.commandStateDefinitions.push(definition);
			}
			this.commandStateById.set(definition.id, {
				command: definition.native.command,
				deviceId
			});
			await this.extendObject(definition.id, {
				type: 'state',
				common: definition.common,
				native: definition.native
			});
			await this.subscribeStates(definition.id);
		}
	}

	async onStateChange(id, state) {
		if (!state || state.ack) {
			return;
		}

		const shortId = id.startsWith(`${this.namespace}.`) ? id.slice(this.namespace.length + 1) : id;
		const isKnownCommandPath = Array.from(this.commandChannelPrefixes).some((prefix) =>
			shortId.startsWith(`${prefix}.`)
		);
		if (!isKnownCommandPath) {
			return;
		}

		const commandMetadata = this.commandStateById.get(shortId);
		if (!commandMetadata) {
			this.log.error(`Rejecting write to unknown command state ${shortId}`);
			return;
		}

		const {command: commandName, deviceId} = commandMetadata;
		if (!COMMAND_DEFINITIONS[commandName]) {
			this.log.error(`Rejecting write for unsupported command ${commandName}`);
			return;
		}

		try {
			await this.commandWriter.enqueue(deviceId, commandName, state.val);
			await this.setStateAsync(shortId, {
				val: state.val,
				ack: true
			});
		} catch (error) {
			this.log.error(`Command ${commandName} for ${deviceId} rejected: ${error.message || error}`);
		}
	}

	async parse_serial(deviceId, line) {
		try {
			this.log.debug('Line : ' + line);
			// VE.Direct text protocol lines are tab separated:
			// <KEY>\t<VALUE>
			const res = line.split('\t');
			// Guard: VE.Direct lines without a tab separator (e.g. blank lines, checksum) are not key-value pairs
			if (res.length < 2 || res[1] === undefined) {
				this.log.debug(`[parse_serial] skipping non-KV line for ${deviceId}: ${line}`);
				return;
			}
			if (stateAttr[res[0]] !== undefined) {
				// Most values need unit conversion (e.g. mV -> V, mA -> A) or lookup
				// to human-readable text before writing to ioBroker state tree.
				const value = Object.prototype.hasOwnProperty.call(LOOKUP_KEYS, res[0])
					? LOOKUP_KEYS[res[0]](res, lookups)
					: convertValue(res[0], res[1]);

				this.stateSetCreate(deviceId, res[0], res[0], value);
			}
		} catch (error) {
			this.log.error(`[parse_serial] Error processing VE.Direct data for ${deviceId}: ${error.message}`);
			this.setState('info.connection', false, true);
			this.errorHandler(error);
		}
	}

	/**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
	onUnload(callback) {
		this.setState('info.connection', false, true);
		try {
			for (const scheduler of this.deviceReconnectSchedulers.values()) {
				scheduler.cancel();
			}
			this.deviceReconnectSchedulers.clear();
			if (this.deviceConnectionWatchdogInterval) {
				clearInterval(this.deviceConnectionWatchdogInterval);
				this.deviceConnectionWatchdogInterval = null;
			}
			for (const timer of this.deviceMessageBufferTimers.values()) {
				clearTimeout(timer);
			}
			this.deviceMessageBufferTimers.clear();
			this.deviceMessageBufferFlags.clear();
			for (const serialPort of this.devicePorts.values()) {
				if (serialPort && serialPort.isOpen) {
					serialPort.close();
				}
			}
			this.devicePorts.clear();
			this.log.info('VE.Direct terminated, all USB connections closed');
			callback();
		} catch (e) {
			callback();
			this.sendSentry(`[onUnload] ${e}`);
		}
	}

	/**
     * @param stateName {string} ID of the state
     * @param name {string} Name of state (also used for stattAttrlib!)
     * @param value {boolean | number | string | null} Value of the state
     */
	stateSetCreate(deviceId, stateName, name, value) {
		const createStateName = `devices.${deviceId}.${stateName}`;
		this.log.debug('[stateSetCreate]' + createStateName + ' with value : ' + value);
		// const expireTime = 0;
		try {
			// Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
			const common = {};
			if (!stateAttr[name]) {
				const warnMessage = `State attribute definition missing for + ${name}`;
				if (warnMessages[name] !== warnMessage) {
					warnMessages[name] = warnMessage;
					// Send information to Sentry
					this.sendSentry(warnMessage);
				}
			}
			this.log.debug('[stateSetCreate] state attribute from lib ' + JSON.stringify(stateAttr[name]));
			common.name = stateAttr[name] !== undefined ? stateAttr[name].name || name : name;
			common.type = stateAttr[name] !== undefined ? stateAttr[name].type || typeof (value) : typeof (value);
			common.role = stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state';
			common.read = true;
			common.unit = stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '';
			common.write = stateAttr[name] !== undefined ? stateAttr[name].write || false : false;

			const metadataChanged = (!this.createdStatesDetails[createStateName]) || (this.createdStatesDetails[createStateName] && (
				common.name !== this.createdStatesDetails[createStateName].name ||
                    common.type !== this.createdStatesDetails[createStateName].type ||
                    common.role !== this.createdStatesDetails[createStateName].role ||
                    common.read !== this.createdStatesDetails[createStateName].read ||
                    common.unit !== this.createdStatesDetails[createStateName].unit ||
                    common.write !== this.createdStatesDetails[createStateName].write)
			);

			if (metadataChanged) {
				this.log.debug(`[stateSetCreate] An attribute has changed for : ${stateName}`);
				// We only extend the object if metadata actually changed.
				// This avoids frequent object-db writes on every telemetry line.

				this.extendObject(createStateName, {
					type: 'state',
					common
				});

			} else {
				this.log.debug(`[stateSetCreate] No attribute changes for : ${stateName}, processing normally`);
			}

			// Store current object definition to memory
			this.createdStatesDetails[createStateName] = common;
			if (this.config.deepStateDiagnostics === true && metadataChanged) {
				this.log.debug(`[stateSetCreate] metadata updated for key: ${createStateName}`);
			}

			// Set value to state including expiration time
			if (value != null) {
				let expireTime = 0;
				// Check if state should expire and expiration of states is active in config, if yes use preferred time
				if (this.config.expireTime != null) {
					if (stateAttr[name].expire != null) {
						if (stateAttr[name].expire === true) {
							expireTime = Number(this.config.expireTime);
						}
						if (stateAttr[name].expire === false) {
							expireTime = 0;
						}
					}
				}

				if (common.type === 'number') {
					value = parseFloat(value);
				}
				this.setStateChanged(createStateName, {
					val: value,
					ack: true,
					expire: expireTime
				});
			}

			// Subscribe on state changes if writable
			common.write && this.subscribeStates(createStateName);
		} catch (error) {
			this.sendSentry(`[stateSetCreate] ${error}`);
		}
	}

	errorHandler(error) {
		const message = error instanceof Error ? (error.stack || error.message) : String(error);
		this.log.error(`[errorHandler] ${message}`);
		this.sendSentry(message);
	}

	/**
     * Send error's to sentry, only if sentry not disabled
     * @param {string} msg ID of the state
     */
	sendSentry(msg) {

		if (!disableSentry) {
			this.log.info(`[Error catched and send to Sentry, thank you collaborating!] error: ${msg}`);
			if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
				const sentryInstance = this.getPluginInstance('sentry');
				if (sentryInstance) {
					sentryInstance.getSentryObject().captureException(msg);
				}
			}
		} else {
			this.log.error(`Sentry disabled, error catched : ${msg}`);
		}
	}

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
	module.exports = (options) => new Vedirect(options);
} else {
	// otherwise start the instance directly
	new Vedirect();
}
