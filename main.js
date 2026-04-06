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
const RECONNECT_MIN_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 60000;
const NO_DATA_TIMEOUT_MS = 10000;

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
		this.deviceContexts = new Map();
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
			const configuredDevices = this.getConfiguredDevices();
			if (!configuredDevices.length) {
				this.log.error('No VE.Direct serial device configured. Please set "USBDevice" in adapter settings.');
				return;
			}

			for (const devicePath of configuredDevices) {
				const ctx = this.createDeviceContext(devicePath);
				this.deviceContexts.set(ctx.id, ctx);
				await this.ensureDeviceInfoObjects(ctx);
				await this.updateDeviceHealthStates(ctx, {
					connected: false,
					lastSeen: '',
					reconnectAttempts: 0,
					lastError: ''
				});
				this.connectDevice(ctx);
			}

		} catch (error) {
			this.log.error('Connection to VE.Direct device failed !');
			this.setState('info.connection', false, true);
			this.errorHandler(error);
		}
	}

	getConfiguredDevices() {
		const usbDeviceConfig = (this.config.USBDevice || '').toString();
		return [...new Set(
			usbDeviceConfig
				.split(/[\n,;]+/)
				.map(device => device.trim())
				.filter(Boolean)
		)];
	}

	createDeviceContext(devicePath) {
		const normalizedPath = devicePath.replace(/\\/g, '/');
		const pathParts = normalizedPath.split('/');
		const fallback = normalizedPath.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'device';
		const id = (pathParts[pathParts.length - 1] || fallback).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
		return {
			id,
			path: devicePath,
			statePrefix: `devices.${id}`,
			port: null,
			parser: null,
			bufferMessage: false,
			messageBufferTimer: null,
			pollingTimer: null,
			reconnectTimer: null,
			reconnectAttempts: 0,
			connected: false,
			lastSeen: '',
			lastError: ''
		};
	}

	async ensureDeviceInfoObjects(ctx) {
		await this.extendObject(`devices.${ctx.id}`, { type: 'channel', common: { name: `VE.Direct device ${ctx.path}` }, native: {} });
		await this.extendObject(`${ctx.statePrefix}.info`, { type: 'channel', common: { name: 'Health information' }, native: {} });
	}

	async connectDevice(ctx) {
		if (this.isUnloading) {
			return;
		}

		await this.cleanupDeviceConnection(ctx, false);

		try {
			ctx.port = new SerialPort({
				path: ctx.path,
				baudRate: 19200,
				autoOpen: false
			});
			ctx.port.on('error', (error) => this.handleDeviceError(ctx, error, 'port'));
			ctx.port.on('close', () => this.handleDeviceClose(ctx));
			ctx.parser = ctx.port.pipe(new ReadlineParser({delimiter: '\r\n'}));
			ctx.parser.on('data', (data) => this.handleDeviceData(ctx, data));
			ctx.parser.on('error', (error) => this.handleDeviceError(ctx, error, 'parser'));

			await new Promise((resolve, reject) => {
				ctx.port.open((err) => err ? reject(err) : resolve());
			});

			ctx.reconnectAttempts = 0;
			await this.updateDeviceHealthStates(ctx, {
				connected: true,
				reconnectAttempts: ctx.reconnectAttempts,
				lastError: ''
			});
			this.log.info(`[${ctx.id}] Serial connection established on ${ctx.path}`);
		} catch (error) {
			await this.handleDeviceError(ctx, error, 'connect');
		}
	}

	handleDeviceData(ctx, data) {
		this.log.debug(`[${ctx.id}] [Serial data received] ${data}`);
		if (!ctx.bufferMessage) {
			this.log.debug(`[${ctx.id}] Message buffer inactive, processing data`);
			this.parse_serial(data, ctx);
			if (this.config.messageBuffer > 0) {
				this.log.debug(`[${ctx.id}] Activate Message buffer with delay of ${this.config.messageBuffer * 1000}`);
				ctx.bufferMessage = true;
				if (ctx.messageBufferTimer) {
					clearTimeout(ctx.messageBufferTimer);
					ctx.messageBufferTimer = null;
				}
				ctx.messageBufferTimer = setTimeout(() => {
					ctx.bufferMessage = false;
					this.log.debug(`[${ctx.id}] Message buffer timeout reached, will process data`);
				}, this.config.messageBuffer * 1000);
			}
		} else {
			this.log.debug(`[${ctx.id}] Message buffer active, message ignored`);
		}

		ctx.lastSeen = new Date().toISOString();
		if (!ctx.connected) {
			ctx.reconnectAttempts = 0;
		}
		this.updateDeviceHealthStates(ctx, {
			connected: true,
			lastSeen: ctx.lastSeen,
			reconnectAttempts: ctx.reconnectAttempts,
			lastError: ''
		});

		if (ctx.pollingTimer) {
			clearTimeout(ctx.pollingTimer);
			ctx.pollingTimer = null;
		}
		ctx.pollingTimer = setTimeout(() => {
			this.log.warn(`[${ctx.id}] No data received for ${NO_DATA_TIMEOUT_MS / 1000} seconds. Reconnecting ...`);
			this.scheduleReconnect(ctx, new Error('No data received timeout'));
		}, NO_DATA_TIMEOUT_MS);
	}

	async handleDeviceClose(ctx) {
		if (this.isUnloading) {
			return;
		}
		await this.updateDeviceHealthStates(ctx, { connected: false });
		this.scheduleReconnect(ctx, new Error('Serial port closed'));
	}

	async handleDeviceError(ctx, error, source) {
		const classification = this.classifyConnectionError(error);
		const safeErrorMessage = `${classification.label}: ${error && error.message ? error.message : error}`;
		this.log.warn(`[${ctx.id}] ${classification.message}`);
		this.log.debug(`[${ctx.id}] ${source} error details: ${safeErrorMessage}`);
		await this.updateDeviceHealthStates(ctx, {
			connected: false,
			lastError: safeErrorMessage
		});
		this.scheduleReconnect(ctx, error);
	}

	classifyConnectionError(error) {
		const code = error && error.code ? error.code : '';
		if (code === 'EBUSY') {
			return {
				label: 'Port busy',
				message: 'Port is busy. Ensure no other service (e.g. ModemManager, another adapter) uses the serial device.'
			};
		}
		if (code === 'EACCES' || code === 'EPERM') {
			return {
				label: 'Permission denied',
				message: 'Permission denied while opening serial port. Add ioBroker user to dialout group or adjust udev rules.'
			};
		}
		if (code === 'ENOENT') {
			return {
				label: 'Device removed',
				message: 'Serial device is not present. Check cable/USB connection and if the /dev path still exists.'
			};
		}
		return {
			label: 'Connection error',
			message: `Serial communication failed (${code || 'unknown'}). Adapter will retry automatically.`
		};
	}

	scheduleReconnect(ctx, error) {
		if (this.isUnloading || ctx.reconnectTimer) {
			return;
		}

		this.cleanupDeviceConnection(ctx, true);
		ctx.reconnectAttempts += 1;
		const baseDelay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_MIN_DELAY_MS * Math.pow(2, Math.max(ctx.reconnectAttempts - 1, 0)));
		const jitterFactor = 0.7 + (Math.random() * 0.6);
		const reconnectDelay = Math.min(RECONNECT_MAX_DELAY_MS, Math.max(RECONNECT_MIN_DELAY_MS, Math.round(baseDelay * jitterFactor)));
		const errMessage = error && error.message ? error.message : String(error || '');
		this.updateDeviceHealthStates(ctx, {
			connected: false,
			reconnectAttempts: ctx.reconnectAttempts,
			lastError: errMessage
		});
		this.log.info(`[${ctx.id}] Reconnect attempt ${ctx.reconnectAttempts} scheduled in ${reconnectDelay} ms`);

		ctx.reconnectTimer = setTimeout(() => {
			ctx.reconnectTimer = null;
			this.connectDevice(ctx);
		}, reconnectDelay);
	}

	async cleanupDeviceConnection(ctx, keepReconnectTimer) {
		if (ctx.pollingTimer) {
			clearTimeout(ctx.pollingTimer);
			ctx.pollingTimer = null;
		}
		if (ctx.messageBufferTimer) {
			clearTimeout(ctx.messageBufferTimer);
			ctx.messageBufferTimer = null;
		}
		ctx.bufferMessage = false;
		if (!keepReconnectTimer && ctx.reconnectTimer) {
			clearTimeout(ctx.reconnectTimer);
			ctx.reconnectTimer = null;
		}

		if (ctx.parser) {
			ctx.parser.removeAllListeners();
			if (typeof ctx.parser.destroy === 'function') {
				ctx.parser.destroy();
			}
			ctx.parser = null;
		}
		if (ctx.port) {
			ctx.port.removeAllListeners();
			if (ctx.port.isOpen) {
				await new Promise(resolve => ctx.port.close(() => resolve()));
			}
			ctx.port = null;
		}
	}

	async updateDeviceHealthStates(ctx, updates) {
		const newState = {
			connected: updates.connected != null ? updates.connected : ctx.connected,
			lastSeen: updates.lastSeen != null ? updates.lastSeen : ctx.lastSeen,
			reconnectAttempts: updates.reconnectAttempts != null ? updates.reconnectAttempts : ctx.reconnectAttempts,
			lastError: updates.lastError != null ? updates.lastError : ctx.lastError
		};
		ctx.connected = newState.connected;
		ctx.lastSeen = newState.lastSeen;
		ctx.reconnectAttempts = newState.reconnectAttempts;
		ctx.lastError = newState.lastError;

		this.stateSetCreate(`${ctx.statePrefix}.info.connected`, 'device_connected', newState.connected);
		this.stateSetCreate(`${ctx.statePrefix}.info.lastSeen`, 'device_lastSeen', newState.lastSeen);
		this.stateSetCreate(`${ctx.statePrefix}.info.reconnectAttempts`, 'device_reconnectAttempts', newState.reconnectAttempts);
		this.stateSetCreate(`${ctx.statePrefix}.info.lastError`, 'device_lastError', newState.lastError);
		this.updateGlobalConnectionState();
	}

	updateGlobalConnectionState() {
		const anyConnected = [...this.deviceContexts.values()].some(ctx => ctx.connected);
		this.setState('info.connection', anyConnected, true);
	}

	async parse_serial(line, ctx) {
		try {
			this.log.debug('Line : ' + line);
			const res = line.split('\t');
			if (stateAttr[res[0]] !== undefined) {
				const stateBase = `${ctx.statePrefix}.${res[0]}`;
				switch (res[0]) {   // Used for special modifications to write a state with correct values and types
					case 'CE':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V2':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'V3':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'VS':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'VM':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'DM':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 10);
						break;

					case 'VPV':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I2':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'I3':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'IL':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'SOC':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 10);
						break;

					case 'AR':
						this.stateSetCreate(stateBase, res[0], await this.get_alarm_reason(res[1]));
						break;

					case 'WARN':
						this.stateSetCreate(stateBase, res[0], await this.get_alarm_reason(res[1]));
						break;

					case 'OR':
						this.stateSetCreate(stateBase, res[0], await this.get_off_reason(res[1]));
						break;

					case 'H6':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H7':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H8':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H15':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H16':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 1000);
						break;

					case 'H17':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H18':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H19':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H20':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 100);
						break;

					case 'H22':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 100);
						break;

					case 'ERR':
						this.stateSetCreate(stateBase, res[0], await this.get_err_state(res[1]));
						break;

					case 'CS':
						this.stateSetCreate(stateBase, res[0], await this.get_cs_state(res[1]));
						break;

					case 'PID':
						this.stateSetCreate(stateBase, res[0], await this.get_product_longname(res[1]));
						break;

					case 'MODE':
						this.stateSetCreate(stateBase, res[0], await this.get_device_mode(res[1]));
						break;

					case 'AC_OUT_V':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 100);
						break;

					case 'AC_OUT_I':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 10);
						break;

					case 'MPPT':
						this.stateSetCreate(stateBase, res[0], await this.get_mppt_mode(res[1]));
						break;

					case 'MON':
						this.stateSetCreate(stateBase, res[0], await this.get_monitor_type(res[1]));
						break;

					case 'DC_IN_V':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 100);
						break;

					case 'DC_IN_I':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]) / 10);
						break;

					case 'DC_IN_P':
						this.stateSetCreate(stateBase, res[0], Math.floor(res[1]));
						break;

					default:    // Used for all other measure points with no required special handling
						this.stateSetCreate(stateBase, res[0], res[1]);
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
		this.isUnloading = true;
		this.setState('info.connection', false, true);
		try {
			const cleanupTasks = [];
			for (const ctx of this.deviceContexts.values()) {
				cleanupTasks.push(this.cleanupDeviceConnection(ctx, false));
			}
			Promise.all(cleanupTasks)
				.then(() => {
					this.log.info('VE.Direct terminated, all USB connections closed');
					callback();
				})
				.catch((e) => {
					this.sendSentry(`[onUnload] ${e}`);
					callback();
				});
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
	stateSetCreate(stateName, name, value) {
		this.log.debug('[stateSetCreate]' + stateName + ' with value : ' + value);
		// const expireTime = 0;
		try {
			// Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
			const common = {};
			if (!stateAttr[name]) {
				if (name === 'device_connected') {
					common.name = 'Connected';
					common.type = 'boolean';
					common.role = 'indicator.connected';
					common.read = true;
					common.unit = '';
					common.write = false;
				} else if (name === 'device_lastSeen') {
					common.name = 'Last seen';
					common.type = 'string';
					common.role = 'text';
					common.read = true;
					common.unit = '';
					common.write = false;
				} else if (name === 'device_reconnectAttempts') {
					common.name = 'Reconnect attempts';
					common.type = 'number';
					common.role = 'value';
					common.read = true;
					common.unit = '';
					common.write = false;
				} else if (name === 'device_lastError') {
					common.name = 'Last error';
					common.type = 'string';
					common.role = 'text';
					common.read = true;
					common.unit = '';
					common.write = false;
				} else {
					const warnMessage = `State attribute definition missing for + ${name}`;
					if (warnMessages[name] !== warnMessage) {
						warnMessages[name] = warnMessage;
						// Send information to Sentry
						this.sendSentry(warnMessage);
					}
				}
			}
			const createStateName = stateName;
			this.log.debug('[stateSetCreate] state attribute from lib ' + JSON.stringify(stateAttr[name]));
			common.name = common.name || (stateAttr[name] !== undefined ? stateAttr[name].name || name : name);
			common.type = common.type || (stateAttr[name] !== undefined ? stateAttr[name].type || typeof (value) : typeof (value));
			common.role = common.role || (stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state');
			common.read = common.read != null ? common.read : true;
			common.unit = common.unit != null ? common.unit : (stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '');
			common.write = common.write != null ? common.write : (stateAttr[name] !== undefined ? stateAttr[name].write || false : false);

			if ((!this.createdStatesDetails[stateName]) || (this.createdStatesDetails[stateName] && (
				common.name !== this.createdStatesDetails[stateName].name ||
                    common.name !== this.createdStatesDetails[stateName].name ||
                    common.type !== this.createdStatesDetails[stateName].type ||
                    common.role !== this.createdStatesDetails[stateName].role ||
                    common.read !== this.createdStatesDetails[stateName].read ||
                    common.unit !== this.createdStatesDetails[stateName].unit ||
                    common.write !== this.createdStatesDetails[stateName].write)
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
			this.createdStatesDetails[stateName] = common;

			// Set value to state including expiration time
			if (value != null) {
				let expireTime = 0;
				// Check if state should expire and expiration of states is active in config, if yes use preferred time
				if (this.config.expireTime != null && stateAttr[name] != null){
					if (stateAttr[name].expire != null){
						if (stateAttr[name].expire === true) {
							expireTime = Number(this.config.expireTime);
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
