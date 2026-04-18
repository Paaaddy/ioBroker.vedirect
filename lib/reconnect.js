'use strict';

/**
 * Creates a reconnection scheduler with exponential backoff.
 *
 * @param {() => void} onAttempt - Called on each reconnect attempt
 * @param {{ initialDelayMs?: number, maxDelayMs?: number }} [options]
 * @returns {{ scheduleRetry: () => void, cancel: () => void, currentDelayMs: number }}
 */
function createReconnectScheduler(onAttempt, options = {}) {
	const initialDelayMs = options.initialDelayMs !== undefined ? options.initialDelayMs : 1000;
	const maxDelayMs = options.maxDelayMs !== undefined ? options.maxDelayMs : 60000;

	let timer = null;
	let currentDelayMs = initialDelayMs;

	function scheduleRetry() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			currentDelayMs = Math.min(currentDelayMs * 2, maxDelayMs);
			onAttempt();
		}, currentDelayMs);
	}

	function cancel() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		currentDelayMs = initialDelayMs;
	}

	return {
		scheduleRetry,
		cancel,
		get currentDelayMs() { return currentDelayMs; },
	};
}

module.exports = { createReconnectScheduler };
