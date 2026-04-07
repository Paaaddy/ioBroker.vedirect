'use strict';

/**
 * Returns configured devices from adapter config.
 * Preserves original device slot numbers (device1/device2/device3)
 * regardless of which slots are populated.
 *
 * @param {object} config - ioBroker adapter config object
 * @returns {{ id: string, path: string }[]}
 */
function getConfiguredDevices(config) {
	// Priority 1: explicit numbered device fields
	const slots = [
		{ key: 'device1Path', id: 'device1' },
		{ key: 'device2Path', id: 'device2' },
		{ key: 'device3Path', id: 'device3' },
	];
	const fromFields = slots
		.map(({ key, id }) => ({ id, path: typeof config[key] === 'string' ? config[key].trim() : '' }))
		.filter(({ path }) => !!path);

	if (fromFields.length > 0) return fromFields;

	// Priority 2: devices array (newer config format)
	if (Array.isArray(config.devices) && config.devices.length > 0) {
		return config.devices
			.filter((device) => device && typeof device.path === 'string' && device.path.trim())
			.map((device, index) => ({
				id: device.id || `device${index + 1}`,
				path: device.path.trim(),
			}));
	}

	// Priority 3: legacy single-device field
	if (typeof config.USBDevice === 'string' && config.USBDevice.trim()) {
		return [{ id: 'device1', path: config.USBDevice.trim() }];
	}

	return [];
}

module.exports = { getConfiguredDevices };
