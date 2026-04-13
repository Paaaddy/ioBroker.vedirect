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
	let cancelled = false;

	function scheduleRetry() {
		if (cancelled) return;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			currentDelayMs = Math.min(currentDelayMs * 2, maxDelayMs);
			onAttempt();
		}, currentDelayMs);
	}

	/**
	 * Permanently stops retries. Use only on adapter shutdown.
	 * For clearing a pending retry after a successful connection, use reset() instead.
	 */
	function cancel() {
		cancelled = true;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		currentDelayMs = initialDelayMs;
	}

	/**
	 * Clears any pending retry timer and resets backoff delay without permanently
	 * disabling future retries. Call this when a connection is established successfully.
	 */
	function reset() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		currentDelayMs = initialDelayMs;
	}

	return {
		scheduleRetry,
		cancel,
		reset,
		get currentDelayMs() { return currentDelayMs; },
	};
}

module.exports = { createReconnectScheduler };
