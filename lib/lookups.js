'use strict';

const ProductNames    = require('./ProductNames');
const AlarmReasons    = require('./AlarmReasons');
const OffReasons      = require('./OffReasons');
const BleReasons      = require('./BleReasons');
const OperationStates = require('./OperationStates');
const ErrorNames      = require('./ErrorNames');
const DeviceModes     = require('./DeviceModes');
const MpptModes       = require('./MpptModes');
const MonitorTypes    = require('./MonitorTypes');

/**
 * Creates a lookup function for a VE.Direct enum table.
 *
 * @param {object} table        - Map of raw key string -> object with valueKey property
 * @param {string} valueKey     - Property name to read from each table entry
 * @param {string} unknownLabel - Label used in fallback string, e.g. "alarm reason"
 * @returns {(rawKey: string) => string}
 */
function makeLookup(table, valueKey, unknownLabel) {
    return function lookup(rawKey) {
        const entry = table[rawKey];
        if (entry && entry[valueKey] !== undefined) return entry[valueKey];
        return `unknown ${unknownLabel} = ${rawKey}`;
    };
}

const lookups = {
    product_longname: makeLookup(ProductNames,    'pid',    'PID'),
    alarm_reason:     makeLookup(AlarmReasons,    'reason', 'alarm reason'),
    off_reason:       makeLookup(OffReasons,      'reason', 'off reason'),
    cap_ble:          makeLookup(BleReasons,      'reason', 'BLE reason'),
    cs_state:         makeLookup(OperationStates, 'state',  'operation state'),
    err_state:        makeLookup(ErrorNames,      'error',  'error state'),
    device_mode:      makeLookup(DeviceModes,     'mode',   'device mode'),
    mppt_mode:        makeLookup(MpptModes,       'mode',   'mppt mode'),
    monitor_type:     makeLookup(MonitorTypes,    'type',   'monitor type'),
};

module.exports = { makeLookup, lookups };
