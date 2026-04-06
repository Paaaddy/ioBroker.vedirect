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
const warnMessages = {}; // Array to avoid unneeded spam too sentry

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
		// this.on('stateChange', this.onStateChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
		this.createdStatesDetails = {}; //  Array to store state objects to avoid unneeded object changes
		this.devices = {};
		this.isUnloading = false;
	}

	/**
     * Is called when databases are connected and adapter received configuration.
     */
	async onReady() {
		// Initialize your adapter here
		this.log.info('Starting VE.Direct with Protocol Version 3.33 and configurable expiring state capability');
		this.setState('info.connection', false, true);

		try {
			const configuredDevices = this.normalizeDevices();
			if (configuredDevices.length === 0) {
				this.log.warn('No USB devices configured. Configure native.devices or legacy USBDevice.');
			}
			for (const deviceConfig of configuredDevices) {
				await this.connectDevice(deviceConfig);
			}

		} catch (error) {
			this.log.error('Connection to VE.Direct device failed !');
			this.setState('info.connection', false, true);
			this.errorHandler(error);
		}
	}

	normalizeDevices() {
		const legacyExpireTime = Number(this.config.expireTime) || 0;
		const legacyMessageBuffer = Number(this.config.messageBuffer) || 0;
		const normalizedDevices = [];
		const sourceDevices = Array.isArray(this.config.devices) ? this.config.devices : [];

		for (const device of sourceDevices) {
			if (!device || typeof device !== 'object') {
				continue;
			}
			const path = typeof device.path === 'string' ? device.path.trim() : '';
			if (!path) {
				continue;
			}
			const id = this.sanitizeDeviceId(device.id || path);
			normalizedDevices.push({
				id,
				path,
				enabled: device.enabled !== false,
				baudRate: Number(device.baudRate) || 19200,
				messageBuffer: Number(device.messageBuffer ?? legacyMessageBuffer) || 0,
				expireTime: Number(device.expireTime ?? legacyExpireTime) || 0
			});
		}

		if (normalizedDevices.length === 0 && this.config.USBDevice) {
			const path = String(this.config.USBDevice).trim();
			if (path) {
				this.log.info('Using legacy USBDevice configuration for backward compatibility.');
				normalizedDevices.push({
					id: this.sanitizeDeviceId('device1'),
					path,
					enabled: true,
					baudRate: 19200,
					messageBuffer: legacyMessageBuffer,
					expireTime: legacyExpireTime
				});
			}
		}

		const idCounter = {};
		return normalizedDevices.map((device) => {
			idCounter[device.id] = (idCounter[device.id] || 0) + 1;
			if (idCounter[device.id] > 1) {
				device.id = `${device.id}_${idCounter[device.id]}`;
			}
			return device;
		});
	}

	sanitizeDeviceId(rawId) {
		const normalizedId = String(rawId || '')
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '');
		return normalizedId || 'device';
	}

	async connectDevice(deviceConfig) {
		if (!deviceConfig.enabled) {
			this.log.info(`Device ${deviceConfig.id} disabled, skipping connection.`);
			return;
		}

		await this.extendObject(`devices.${deviceConfig.id}`, {
			type: 'channel',
			common: {
				name: `VE.Direct ${deviceConfig.id}`
			},
			native: {
				path: deviceConfig.path
			}
		});
		await this.extendObject(`devices.${deviceConfig.id}.info`, {
			type: 'channel',
			common: {
				name: 'Information'
			},
			native: {}
		});
		await this.extendObject(`devices.${deviceConfig.id}.info.connection`, {
			type: 'state',
			common: {
				role: 'indicator.connected',
				name: 'Device connected',
				type: 'boolean',
				read: true,
				write: false,
				def: false
			},
			native: {}
		});

		const deviceState = {
			config: deviceConfig,
			port: null,
			parser: null,
			pollingTimeout: null,
			messageBufferTimeout: null,
			bufferActive: false,
			reconnecting: false,
			reconnectTimeout: null
		};
		this.devices[deviceConfig.id] = deviceState;

		try {
			const port = new SerialPort({
				path: deviceConfig.path,
				baudRate: deviceConfig.baudRate
			});
			deviceState.port = port;
			deviceState.parser = port.pipe(new ReadlineParser({delimiter: '\r\n'}));

			port.on('close', () => this.handleDeviceDisconnect(deviceConfig.id, 'Port closed'));
			port.on('error', (error) => this.handleDeviceError(deviceConfig.id, error));
			deviceState.parser.on('error', (error) => this.handleDeviceError(deviceConfig.id, error));
			deviceState.parser.on('data', (data) => this.handleDeviceData(deviceConfig.id, data));
		} catch (error) {
			this.handleDeviceError(deviceConfig.id, error);
		}
	}

	handleDeviceData(deviceId, data) {
		const device = this.devices[deviceId];
		if (!device) {
			return;
		}
		this.log.debug(`[Serial data received][${deviceId}] ${data}`);
		if (!device.bufferActive) {
			this.log.debug(`[${deviceId}] Message buffer inactive, processing data`);
			this.parse_serial(deviceId, data);
			if (device.config.messageBuffer > 0) {
				device.bufferActive = true;
				if (device.messageBufferTimeout) {
					clearTimeout(device.messageBufferTimeout);
				}
				device.messageBufferTimeout = setTimeout(() => {
					device.bufferActive = false;
					this.log.debug(`[${deviceId}] Message buffer timeout reached, will process data`);
				}, device.config.messageBuffer * 1000);
			}
		} else {
			this.log.debug(`[${deviceId}] Message buffer active, message ignored`);
		}

		this.setDeviceConnectionState(deviceId, true);
		if (device.pollingTimeout) {
			clearTimeout(device.pollingTimeout);
		}
		device.pollingTimeout = setTimeout(() => {
			this.setDeviceConnectionState(deviceId, false);
			this.log.error(`[${deviceId}] No data received for 10 seconds, connection lost ?`);
		}, 10000);
	}

	handleDeviceError(deviceId, error) {
		this.log.error(`[${deviceId}] Issue handling serial port connection : ${JSON.stringify(error)}`);
		this.setDeviceConnectionState(deviceId, false);
		this.scheduleReconnect(deviceId);
	}

	handleDeviceDisconnect(deviceId, reason) {
		this.log.warn(`[${deviceId}] ${reason}`);
		this.setDeviceConnectionState(deviceId, false);
		this.scheduleReconnect(deviceId);
	}

	scheduleReconnect(deviceId) {
		if (this.isUnloading) {
			return;
		}
		const device = this.devices[deviceId];
		if (!device || device.reconnecting) {
			return;
		}
		device.reconnecting = true;
		device.reconnectTimeout = setTimeout(async () => {
			device.reconnecting = false;
			await this.disconnectDevice(deviceId);
			await this.connectDevice(device.config);
		}, 5000);
	}

	setDeviceConnectionState(deviceId, connected) {
		this.setState(`devices.${deviceId}.info.connection`, connected, true);
		const anyConnected = Object.keys(this.devices).some(id => this.getCurrentConnectionState(id));
		this.setState('info.connection', anyConnected, true);
	}

	getCurrentConnectionState(deviceId) {
		const device = this.devices[deviceId];
		return !!(device && device.port && device.port.isOpen);
	}

	async disconnectDevice(deviceId) {
		const device = this.devices[deviceId];
		if (!device) {
			return;
		}
		if (device.pollingTimeout) {
			clearTimeout(device.pollingTimeout);
			device.pollingTimeout = null;
		}
		if (device.messageBufferTimeout) {
			clearTimeout(device.messageBufferTimeout);
			device.messageBufferTimeout = null;
		}
		if (device.reconnectTimeout) {
			clearTimeout(device.reconnectTimeout);
			device.reconnectTimeout = null;
		}
		device.bufferActive = false;

		if (device.port && device.port.isOpen) {
			await new Promise((resolve) => {
				device.port.close(() => resolve());
			});
		}
		device.port = null;
		device.parser = null;
	}

	async parse_serial(deviceId, line) {
		try {
			this.log.debug('Line : ' + line);
			const res = line.split('\t');
			if (stateAttr[res[0]] !== undefined) {
				switch (res[0]) {   // Used for special modifications to write a state with correct values and types
					case 'CE':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V2':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V3':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'VS':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'VM':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'DM':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 10);
						break;

					case 'VPV':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I2':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I3':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'IL':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'SOC':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 10);
						break;

					case 'AR':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_alarm_reason(res[1]));
						break;

					case 'WARN':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_alarm_reason(res[1]));
						break;

					case 'OR':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_off_reason(res[1]));
						break;

					case 'H6':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H7':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H8':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H15':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H16':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H17':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 100);
						break;

					case 'H18':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 100);
						break;

					case 'H19':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 100);
						break;

					case 'H20':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 100);
						break;

					case 'H22':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 100);
						break;

					case 'ERR':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_err_state(res[1]));
						break;

					case 'CS':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_cs_state(res[1]));
						break;

					case 'PID':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_product_longname(res[1]));
						break;

					case 'MODE':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_device_mode(res[1]));
						break;

					case 'AC_OUT_V':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 100);
						break;

					case 'AC_OUT_I':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 10);
						break;

					case 'MPPT':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_mppt_mode(res[1]));
						break;

					case 'MON':
						this.stateSetCreate(deviceId, res[0], res[0], await this.get_monitor_type(res[1]));
						break;

					case 'DC_IN_V':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 100);
						break;

					case 'DC_IN_I':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]) / 10);
						break;

					case 'DC_IN_P':
						this.stateSetCreate(deviceId, res[0], res[0], Math.floor(res[1]));
						break;

					default:    // Used for all other measure points with no required special handling
						this.stateSetCreate(deviceId, res[0], res[0], res[1]);
						break;
				}
			}


		} catch (error) {
			this.log.error('Connection to VE.Direct device failed !');
			this.setDeviceConnectionState(deviceId, false);
			this.errorHandler(error);
		}
	}


	/**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
	async onUnload(callback) {
		this.isUnloading = true;
		this.setState('info.connection', false, true);
		try {
			const deviceIds = Object.keys(this.devices);
			for (const deviceId of deviceIds) {
				await this.disconnectDevice(deviceId);
				this.setState(`devices.${deviceId}.info.connection`, false, true);
			}
			this.log.info('VE.Direct terminated, all USB connections closed');
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
			name = 'unknown BLE reason = '+ ble;
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
     * @param stateName {string} ID of the state
     * @param name {string} Name of state (also used for stattAttrlib!)
     * @param value {boolean | number | string | null} Value of the state
     */
	stateSetCreate(deviceId, stateName, name, value) {
		this.log.debug('[stateSetCreate]' + stateName + ' with value : ' + value);
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
			const createStateName = `devices.${deviceId}.${stateName}`;
			this.log.debug('[stateSetCreate] state attribute from lib ' + JSON.stringify(stateAttr[name]));
			common.name = stateAttr[name] !== undefined ? stateAttr[name].name || name : name;
			common.type = stateAttr[name] !== undefined ? stateAttr[name].type || typeof (value) : typeof (value);
			common.role = stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state';
			common.read = true;
			common.unit = stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '';
			common.write = stateAttr[name] !== undefined ? stateAttr[name].write || false : false;

			if ((!this.createdStatesDetails[createStateName]) || (this.createdStatesDetails[createStateName] && (
				common.name !== this.createdStatesDetails[createStateName].name ||
                    common.name !== this.createdStatesDetails[createStateName].name ||
                    common.type !== this.createdStatesDetails[createStateName].type ||
                    common.role !== this.createdStatesDetails[createStateName].role ||
                    common.read !== this.createdStatesDetails[createStateName].read ||
                    common.unit !== this.createdStatesDetails[createStateName].unit ||
                    common.write !== this.createdStatesDetails[createStateName].write)
			)) {
				this.log.debug(`[stateSetCreate] An attribute has changed for : ${stateName}`);

				this.extendObject(createStateName, {
					type: 'state',
					common
				});

			} else {
				this.log.debug(`[stateSetCreate] No attribute changes for : ${stateName}, processing normally`);
			}

			// Store current object definition to memory
			this.createdStatesDetails[createStateName] = common;

			// Set value to state including expiration time
			if (value != null) {
				let expireTime = 0;
				// Check if state should expire and expiration of states is active in config, if yes use preferred time
				if (this.devices[deviceId] && this.devices[deviceId].config.expireTime != null){
					if (stateAttr[name] && stateAttr[name].expire != null){
						if (stateAttr[name].expire === true) {
							expireTime = Number(this.devices[deviceId].config.expireTime);
						}
						if (stateAttr[name].expire === false){
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
