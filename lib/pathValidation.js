'use strict';

function validateDevicePath(deviceId, path, logWarn) {
	if (!path || !path.trim()) {
		throw new Error(`Device path is empty for ${deviceId}`);
	}
	if (!/^(\/dev\/|COM\d)/i.test(path)) {
		logWarn(`[openDevicePort] Unusual device path for ${deviceId}: ${path}`);
	}
}

module.exports = { validateDevicePath };
