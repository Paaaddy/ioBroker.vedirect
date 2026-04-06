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
const ProductNames = require(__dirname + '/lib/ProductNames.js');
const ErrorNames = require(__dirname + '/lib/ErrorNames.js');
const AlarmReasons = require(__dirname + '/lib/AlarmReasons.js');
const OperationStates = require(__dirname + '/lib/OperationStates.js');
const OffReasons = require(__dirname + '/lib/OffReasons.js');
const DeviceModes = require(__dirname + '/lib/DeviceModes.js');
const MpptModes = require(__dirname + '/lib/MpptModes.js');
const BleReasons = require(__dirname + '/lib/BleReasons.js');
const MonitorTypes = require(__dirname + '/lib/MonitorTypes.js');
const {SerialCommandWriter, COMMAND_DEFINITIONS} = require(__dirname + '/lib/serialCommandWriter.js');
const warnMessages = {}; // Array to avoid unneeded spam too sentry
// Message throttling flag:
// VE.Direct devices can stream many lines per second. When enabled in config,
// we process one line and ignore the rest until the timeout ends.
let bufferMessage = false;
// Central timeout registry so we can clear timers on reconnect/unload.
const timeouts = {};
let polling, port;

const disableSentry = true; // Ensure to set to true during development !

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
		this.lastTelemetryAt = 0;
		this.commandWriter = new SerialCommandWriter(this, {
			getPort: () => port,
			getLastTelemetryAt: () => this.lastTelemetryAt,
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
			const primaryDevice = configuredDevices[0];
			const deviceId = this.getDeviceId(primaryDevice ? primaryDevice.path : undefined);
			this.commandChannelPrefix = `devices.${deviceId}.commands`;
			const processedDeviceIds = new Set();
			for (const configuredDevice of configuredDevices) {
				const configuredDeviceId = this.getDeviceId(configuredDevice.path);
				if (processedDeviceIds.has(configuredDeviceId)) {
					continue;
				}
				processedDeviceIds.add(configuredDeviceId);
				await this.ensureCommandStates(configuredDeviceId);
			}

			// Open Serial port connection
			const USB_Device = primaryDevice ? primaryDevice.path : this.config.USBDevice;
			if (!USB_Device) {
				throw new Error('No USB device configured. Please provide at least one device path in the instance settings.');
			}
			port = new SerialPort({
				path: USB_Device,
				baudRate: 19200
			});

			port.on('error', (error) => {
				this.log.error('Issue handling serial port connection : ' + JSON.stringify(error));
				this.setState('info.connection', false, true);
			});

			// Open pipe and listen to parser to get data
			const parser = port.pipe(new ReadlineParser({delimiter: '\r\n'}));

			parser.on('data', (data) => {
				this.lastTelemetryAt = Date.now();
				this.log.debug(`[Serial data received] ${data}`);
				if (!bufferMessage) {
					this.log.debug('Message buffer inactive, processing data');
					this.parse_serial(deviceId, data);
					if (this.config.messageBuffer > 0) {
						// Start the "message buffer" pause window after handling one line.
						// During this window incoming lines are skipped intentionally
						// to reduce CPU usage and state-update noise.
						this.log.debug(`Activate Message buffer with delay of ${this.config.messageBuffer * 1000}`);
						bufferMessage = true;
						if (timeouts.mesageBuffer) {clearTimeout(timeouts.mesageBuffer); timeouts.mesageBuffer = null;}
						timeouts.mesageBuffer = setTimeout(() => {
							bufferMessage = false;
							this.log.debug('Message buffer timeout reached, will process data');
						}, this.config.messageBuffer * 1000);
					}
				} else {
					this.log.debug('Message buffer active, message ignored');
				}

				// Indicate connection status
				this.setState('info.connection', true, true);
				// Clear running timer
				(function () {
					if (polling) {
						clearTimeout(polling);
						polling = null;
					}
				})();
				// timer
				polling = setTimeout(() => {
					// Set time-out on connecting state when 10 seconds no information received
					this.setState('info.connection', false, true);
					this.log.error('No data received for 10 seconds, connection lost ?');
				}, 10000);

			});

			parser.on('error', (error) => {
				this.log.error('Issue handling serial port connection : ' + JSON.stringify(error));
				this.setState('info.connection', false, true);
			});

		} catch (error) {
			this.log.error('Connection to VE.Direct device failed !');
			this.setState('info.connection', false, true);
			this.errorHandler(error);
		}
	}

	getConfiguredDevices() {
		const fromFields = [this.config.device1Path, this.config.device2Path, this.config.device3Path]
			.map(path => typeof path === 'string' ? path.trim() : '')
			.filter(path => !!path)
			.map((path, index) => ({
				id: `device${index + 1}`,
				path
			}));
		if (fromFields.length > 0) {
			return fromFields;
		}
		if (Array.isArray(this.config.devices) && this.config.devices.length > 0) {
			return this.config.devices
				.filter(device => device && typeof device.path === 'string' && device.path.trim())
				.map((device, index) => ({
					id: device.id || `device${index + 1}`,
					path: device.path.trim()
				}));
		}
		if (typeof this.config.USBDevice === 'string' && this.config.USBDevice.trim()) {
			return [{
				id: 'device1',
				path: this.config.USBDevice.trim()
			}];
		}
		return [];
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
		const telemetryChannelId = `${deviceChannelId}.telemetry`;
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
		await this.extendObject(telemetryChannelId, {
			type: 'channel',
			common: {
				name: `Telemetry for ${deviceId}`
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

		const isKnownCommandPath = Array.from(this.commandChannelPrefixes).some((prefix) =>
			id.startsWith(`${this.namespace}.${prefix}.`)
		);
		if (!isKnownCommandPath) {
			return;
		}

		const shortId = id.replace(`${this.namespace}.`, '');
		const commandState = this.commandStateDefinitions.find((definition) => definition.id === shortId);
		if (!commandState) {
			this.log.error(`Rejecting write to unknown command state ${shortId}`);
			return;
		}

		const commandName = commandState.native.command;
		if (!COMMAND_DEFINITIONS[commandName]) {
			this.log.error(`Rejecting write for unsupported command ${commandName}`);
			return;
		}

		const deviceMatch = shortId.match(/^devices\.([^.]*)\.commands\./);
		const deviceId = deviceMatch ? deviceMatch[1] : this.getDeviceId();
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
			const targetStateId = `devices.${deviceId}.telemetry.${res[0]}`;
			if (stateAttr[res[0]] !== undefined) {
				// Most values need unit conversion (e.g. mV -> V, mA -> A) or lookup
				// to human-readable text before writing to ioBroker state tree.
				switch (res[0]) {   // Used for special modifications to write a state with correct values and types
					case 'CE':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V2':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V3':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'VS':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'VM':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'DM':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 10);
						break;

					case 'VPV':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I2':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I3':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'IL':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'SOC':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 10);
						break;

					case 'AR':
						this.stateSetCreate(targetStateId, res[0], await this.get_alarm_reason(res[1]));
						break;

					case 'WARN':
						this.stateSetCreate(targetStateId, res[0], await this.get_alarm_reason(res[1]));
						break;

					case 'OR':
						this.stateSetCreate(targetStateId, res[0], await this.get_off_reason(res[1]));
						break;

					case 'H6':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H7':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H8':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H15':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H16':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H17':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H18':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H19':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H20':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H22':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 100);
						break;

					case 'ERR':
						this.stateSetCreate(targetStateId, res[0], await this.get_err_state(res[1]));
						break;

					case 'CS':
						this.stateSetCreate(targetStateId, res[0], await this.get_cs_state(res[1]));
						break;

					case 'PID':
						this.stateSetCreate(targetStateId, res[0], await this.get_product_longname(res[1]));
						break;

					case 'MODE':
						this.stateSetCreate(targetStateId, res[0], await this.get_device_mode(res[1]));
						break;

					case 'AC_OUT_V':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 100);
						break;

					case 'AC_OUT_I':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 10);
						break;

					case 'MPPT':
						this.stateSetCreate(targetStateId, res[0], await this.get_mppt_mode(res[1]));
						break;

					case 'MON':
						this.stateSetCreate(targetStateId, res[0], await this.get_monitor_type(res[1]));
						break;

					case 'DC_IN_V':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 100);
						break;

					case 'DC_IN_I':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]) / 10);
						break;

					case 'DC_IN_P':
						this.stateSetCreate(targetStateId, res[0], Math.floor(res[1]));
						break;

					default:    // Used for all other measure points with no required special handling
						this.stateSetCreate(targetStateId, res[0], res[1]);
						break;
				}
			}


		} catch (error) {
			this.log.error('Connection to VE.Direct device failed !');
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

			port.close();
			this.log.info('VE.Direct terminated, all USB connections closed');
			if (timeouts.mesageBuffer) {clearTimeout(timeouts.mesageBuffer); timeouts.mesageBuffer = null;}

			callback();
		} catch (e) {
			callback();
			this.sendSentry(`[onUnload] ${e}`);
		}
	}

	async get_product_longname(pid) {
		let name;
		try {
			name = ProductNames[pid].pid;
		} catch (error) {
			name = 'unknown PID = ' + pid;
		}
		return name;
	}

	async get_alarm_reason(ar) {
		let name;
		try {
			name = AlarmReasons[ar].reason;
		} catch (error) {
			name = 'unknown alarm reason = ' + ar;
		}
		return name;
	}

	async get_off_reason(or) {
		let name = null;
		try {
			name = OffReasons[or].reason;
		} catch (error) {
			name = 'unknown off reason = ' + or;
		}
		return name;
	}

	async get_cap_ble(ble) {
		let name;
		try {
			name = BleReasons[ble].reason;
		} catch (error) {
			name = 'unknown BLE reason = ' + ble;
		}
		return name;
	}

	async get_cs_state(cs) {
		let name;
		try {
			name = OperationStates[cs].state;
		} catch (error) {
			name = 'unknown operation state = ' + cs;
		}
		return name;
	}

	async get_err_state(err) {
		let name;
		try {
			name = ErrorNames[err].error;
		} catch (error) {
			name = 'unknown error state = ' + err;
		}
		return name;
	}

	async get_device_mode(mode) {
		let name;
		try {
			name = DeviceModes[mode].mode;
		} catch (error) {
			name = 'unknown device mode = ' + mode;
		}
		return name;
	}

	async get_mppt_mode(mppt) {
		let name;
		try {
			name = MpptModes[mppt].mode;
		} catch (error) {
			name = 'unknown mppt mode = ' + mppt;
		}
		return name;
	}

	async get_monitor_type(monitortype) {
		let name;
		try {
			name = MonitorTypes[monitortype].type;
		} catch (error) {
			name = 'unknown monitor type = ' + monitortype;
		}
		return name;
	}

	/**
     * @param fullStateId {string} Full ID of the state
     * @param attrName {string} Name of state (also used for stattAttrlib!)
     * @param value {boolean | number | string | null} Value of the state
     */
	stateSetCreate(fullStateId, attrName, value) {
		this.log.debug('[stateSetCreate]' + fullStateId + ' with value : ' + value);
		// const expireTime = 0;
		try {
			// Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
			const common = {};
			if (!stateAttr[attrName]) {
				const warnMessage = `State attribute definition missing for + ${attrName}`;
				if (warnMessages[attrName] !== warnMessage) {
					warnMessages[attrName] = warnMessage;
					// Send information to Sentry
					this.sendSentry(warnMessage);
				}
			}
			const createStateName = fullStateId;
			this.log.debug('[stateSetCreate] state attribute from lib ' + JSON.stringify(stateAttr[attrName]));
			common.name = stateAttr[attrName] !== undefined ? stateAttr[attrName].name || attrName : attrName;
			common.type = stateAttr[attrName] !== undefined ? stateAttr[attrName].type || typeof (value) : typeof (value);
			common.role = stateAttr[attrName] !== undefined ? stateAttr[attrName].role || 'state' : 'state';
			common.read = true;
			common.unit = stateAttr[attrName] !== undefined ? stateAttr[attrName].unit || '' : '';
			common.write = stateAttr[attrName] !== undefined ? stateAttr[attrName].write || false : false;

			if ((!this.createdStatesDetails[fullStateId]) || (this.createdStatesDetails[fullStateId] && (
				common.name !== this.createdStatesDetails[fullStateId].name ||
                    common.name !== this.createdStatesDetails[fullStateId].name ||
                    common.type !== this.createdStatesDetails[fullStateId].type ||
                    common.role !== this.createdStatesDetails[fullStateId].role ||
                    common.read !== this.createdStatesDetails[fullStateId].read ||
                    common.unit !== this.createdStatesDetails[fullStateId].unit ||
                    common.write !== this.createdStatesDetails[fullStateId].write)
			)) {
				this.log.debug(`[stateSetCreate] An attribute has changed for : ${fullStateId}`);
				// We only extend the object if metadata actually changed.
				// This avoids frequent object-db writes on every telemetry line.

				this.extendObject(createStateName, {
					type: 'state',
					common
				});

			} else {
				this.log.debug(`[stateSetCreate] No attribute changes for : ${fullStateId}, processing normally`);
			}

			// Store current object definition to memory
			this.createdStatesDetails[fullStateId] = common;

			// Set value to state including expiration time
			if (value != null) {
				let expireTime = 0;
				// Check if state should expire and expiration of states is active in config, if yes use preferred time
				if (this.config.expireTime != null) {
					if (stateAttr[attrName].expire != null) {
						if (stateAttr[attrName].expire === true) {
							expireTime = Number(this.config.expireTime);
						}
						if (stateAttr[attrName].expire === false) {
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
			this.log.debug('[stateSetCreate] All createdStatesDetails' + JSON.stringify(this.createdStatesDetails));
		} catch (error) {
			this.sendSentry(`[stateSetCreate] ${error}`);
		}
	}

	errorHandler(source, error, debugMode) {
		let message = error;
		if (error instanceof Error && error.stack != null) message = error.stack;
		if (!debugMode) {
			this.log.error(`${source} ${error}`);
			this.sendSentry(`${message}`);
		} else {
			this.log.error(`${source} ${error}`);
			this.log.debug(`${source} ${message}`);
		}
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
