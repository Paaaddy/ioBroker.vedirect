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
let bufferMessage = false;
const timeouts = {};
let polling, port;
const NUM_DIV_1000_KEYS = new Set(['CE', 'V', 'V2', 'V3', 'VS', 'VM', 'VPV', 'I', 'I2', 'I3', 'IL', 'H6', 'H7', 'H8', 'H15', 'H16']);
const NUM_DIV_100_KEYS = new Set(['H17', 'H18', 'H19', 'H20', 'H22', 'AC_OUT_V', 'DC_IN_V']);
const NUM_DIV_10_KEYS = new Set(['DM', 'SOC', 'AC_OUT_I', 'DC_IN_I']);
const RAW_INT_KEYS = new Set(['DC_IN_P']);

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
		this.createdStates = new Set();
		this.subscribedStates = new Set();
		this.pendingStateUpdates = new Map();
		this.flushTimer = null;
		this.stateTransformers = {
			AR: value => this.get_alarm_reason(value),
			WARN: value => this.get_alarm_reason(value),
			OR: value => this.get_off_reason(value),
			ERR: value => this.get_err_state(value),
			CS: value => this.get_cs_state(value),
			PID: value => this.get_product_longname(value),
			MODE: value => this.get_device_mode(value),
			MPPT: value => this.get_mppt_mode(value),
			MON: value => this.get_monitor_type(value),
		};
	}

	/**
     * Is called when databases are connected and adapter received configuration.
     */
	async onReady() {
		// Initialize your adapter here
		this.log.info('Starting VE.Direct with Protocol Version 3.33 and configurable expiring state capability');
		this.setState('info.connection', false, true);

		try {
			// Open Serial port connection
			const USB_Device = this.config.USBDevice;
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
				this.log.debug(`[Serial data received] ${data}`)
				if (!bufferMessage) {
					this.log.debug(`Message buffer inactive, processing data`);
					this.parse_serial(data);
					if (this.config.messageBuffer > 0) {
						this.log.debug(`Activate Message buffer with delay of ${this.config.messageBuffer * 1000}`);
						bufferMessage = true;
						if (timeouts['mesageBuffer']) {clearTimeout(timeouts['mesageBuffer']); timeouts['mesageBuffer'] = null;}
						timeouts['mesageBuffer'] = setTimeout(()=> {
							bufferMessage = false;
							this.log.debug(`Message buffer timeout reached, will process data`);
						}, this.config.messageBuffer * 1000);
					}
				} else {
					this.log.debug(`Message buffer active, message ignored`);
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

	async parse_serial(line) {
		try {
			this.log.debug('Line : ' + line);
			const res = line.split('\t');
			if (stateAttr[res[0]] === undefined) return;
			const transformedValue = await this.transformStateValue(res[0], res[1]);
			await this.stateSetCreate(res[0], res[0], transformedValue);


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
			if (timeouts['mesageBuffer']) {clearTimeout(timeouts['mesageBuffer']); timeouts['mesageBuffer'] = null;}
			if (this.flushTimer) {
				clearTimeout(this.flushTimer);
				this.flushTimer = null;
			}

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
	async stateSetCreate(stateName, name, value) {
		this.log.debug('[stateSetCreate]' + stateName + ' with value : ' + value);
		// const expireTime = 0;
		try {
			const createStateName = stateName;
			const common = this.getStateCommon(name, value);
			await this.ensureStateCreated(createStateName, common);

			// Set value to state including expiration time
			if (value != null) {
				let expireTime = 0;
				// Check if state should expire and expiration of states is active in config, if yes use preferred time
				if (this.config.expireTime != null){
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
				const stateUpdate = {
					val: value,
					ack: true,
					expire: expireTime
				};
				this.queueStateUpdate(createStateName, stateUpdate);
			}

			this.log.debug('[stateSetCreate] All createdStatesDetails' + JSON.stringify(this.createdStatesDetails));
		} catch (error) {
			this.sendSentry(`[stateSetCreate] ${error}`);
		}
	}

	getStateCommon(name, value) {
		const common = {};
		if (!stateAttr[name]) {
			const warnMessage = `State attribute definition missing for + ${name}`;
			if (warnMessages[name] !== warnMessage) {
				warnMessages[name] = warnMessage;
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
		return common;
	}

	async ensureStateCreated(stateName, common) {
		if (this.createdStates.has(stateName)) return;

		this.log.debug(`[stateSetCreate] Create state metadata for : ${stateName}`);
		await this.extendObjectAsync(stateName, {
			type: 'state',
			common
		});
		this.createdStates.add(stateName);
		this.createdStatesDetails[stateName] = common;

		if (common.write && !this.subscribedStates.has(stateName)) {
			this.subscribeStates(stateName);
			this.subscribedStates.add(stateName);
		}
	}

	queueStateUpdate(stateName, stateUpdate) {
		const coalesceInterval = Number(this.config.coalesceInterval || 0);
		if (coalesceInterval > 0) {
			this.pendingStateUpdates.set(stateName, stateUpdate);
			if (!this.flushTimer) {
				this.flushTimer = setTimeout(() => this.flushPendingStateUpdates(), coalesceInterval);
			}
			return;
		}
		this.setStateChanged(stateName, stateUpdate);
	}

	flushPendingStateUpdates() {
		this.flushTimer = null;
		for (const [stateName, stateUpdate] of this.pendingStateUpdates.entries()) {
			this.setStateChanged(stateName, stateUpdate);
		}
		this.pendingStateUpdates.clear();
	}

	async transformStateValue(key, rawValue) {
		if (NUM_DIV_1000_KEYS.has(key)) return Math.floor(rawValue) / 1000;
		if (NUM_DIV_100_KEYS.has(key)) return Math.floor(rawValue) / 100;
		if (NUM_DIV_10_KEYS.has(key)) return Math.floor(rawValue) / 10;
		if (RAW_INT_KEYS.has(key)) return Math.floor(rawValue);
		if (this.stateTransformers[key]) return this.stateTransformers[key](rawValue);
		return rawValue;
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
