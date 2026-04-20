'use strict';

function validateDevicePath(deviceId, path, logWarn) {
	if (!path || !path.trim()) {
		throw new Error(`Device path is empty for ${deviceId}`);
	}
	if (!/^(\/dev\/(ttyUSB|ttyACM|ttyS)\d+|COM\d+)$/i.test(path)) {
		logWarn(`[openDevicePort] Unusual device path for ${deviceId}: ${path} (expected /dev/ttyUSB*, /dev/ttyACM*, /dev/ttyS*, or COM*)`);
	}
}

module.exports = { validateDevicePath };
