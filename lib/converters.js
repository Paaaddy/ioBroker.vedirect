'use strict';

/**
 * Divisors for VE.Direct numeric fields (optimized to Map for O(1) lookup).
 * Keys not present here are passed through as raw strings.
 */
const NUMERIC_DIVISORS = new Map([
	['CE',     1000],
	['V',      1000],
	['V2',     1000],
	['V3',     1000],
	['VS',     1000],
	['VM',     1000],
	['VPV',    1000],
	['I',      1000],
	['I2',     1000],
	['I3',     1000],
	['IL',     1000],
	['H6',     1000],
	['H7',     1000],
	['H8',     1000],
	['H15',    1000],
	['H16',    1000],
	['DM',       10],
	['SOC',      10],
	['AC_OUT_V', 100],
	['DC_IN_V',  100],
	['H17',     100],
	['H18',     100],
	['H19',     100],
	['H20',     100],
	['H22',     100],
	['AC_OUT_I',  10],
	['DC_IN_I',   10],
	['DC_IN_P',    1],
]);

/**
 * Convert a raw VE.Direct string value for a given key.
 * Numeric keys are scaled by their divisor using Math.floor.
 * All other keys are returned as-is (caller handles lookup fields separately).
 *
 * @param {string} key      - VE.Direct field name (e.g. 'V', 'SOC')
 * @param {string} rawValue - Raw string from the serial line
 * @returns {number|string}
 */
function convertValue(key, rawValue) {
	const divisor = NUMERIC_DIVISORS.get(key);
	if (divisor !== undefined) {
		return Math.floor(Number(rawValue)) / divisor;
	}
	return rawValue;
}

module.exports = { convertValue, NUMERIC_DIVISORS };
