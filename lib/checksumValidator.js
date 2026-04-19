'use strict';

/**
 * Validates VE.Direct text protocol block checksums.
 *
 * Each block ends with a "Checksum\t<byte>" line. The sum of all bytes in
 * the block (including \r\n delimiters and the checksum byte itself) must
 * equal 0 mod 256. ReadlineParser strips \r\n so we re-add it per line.
 *
 * The first incomplete block after startup is skipped (adapter may join mid-block).
 */
class VeDirectChecksumValidator {
	constructor() {
		this.byteSums = new Map();
		this.seenFirstChecksum = new Set();
		this.pendingBlocks = new Map();
	}

	/**
	 * Process one parsed line. Returns flushed entries only when a valid block completes.
	 *
	 * @param {string} deviceId
	 * @param {string} line - line content with \r\n stripped by ReadlineParser
	 * @returns {{ blockComplete: boolean, valid: boolean, entries: Array<{key: string, rawValue: string}> }}
	 */
	processLine(deviceId, line) {
		const lineBytes = line + '\r\n';
		let sum = this.byteSums.get(deviceId) || 0;
		for (let i = 0; i < lineBytes.length; i++) {
			sum = (sum + lineBytes.charCodeAt(i)) & 0xFF;
		}

		const tabIdx = line.indexOf('\t');
		const key = tabIdx !== -1 ? line.substring(0, tabIdx) : '';
		const rawValue = tabIdx !== -1 ? line.substring(tabIdx + 1) : '';

		if (key === 'Checksum') {
			const valid = sum === 0;
			this.byteSums.set(deviceId, 0);

			const initialized = this.seenFirstChecksum.has(deviceId);
			this.seenFirstChecksum.add(deviceId);

			const entries = this.pendingBlocks.get(deviceId) || [];
			this.pendingBlocks.set(deviceId, []);

			// Skip first partial block — adapter may have joined mid-stream
			if (!initialized) {
				return { blockComplete: true, valid: true, entries: [] };
			}
			return { blockComplete: true, valid, entries: valid ? entries : [] };
		}

		this.byteSums.set(deviceId, sum);

		if (key && rawValue !== '') {
			const pending = this.pendingBlocks.get(deviceId) || [];
			pending.push({ key, rawValue });
			this.pendingBlocks.set(deviceId, pending);
		}

		return { blockComplete: false, valid: true, entries: [] };
	}

	reset(deviceId) {
		this.byteSums.delete(deviceId);
		this.seenFirstChecksum.delete(deviceId);
		this.pendingBlocks.delete(deviceId);
	}
}

module.exports = { VeDirectChecksumValidator };
