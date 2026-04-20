# Reconnection, Per-Device States & Path Validation — Design Spec

**Date:** 2026-04-07
**Status:** Approved

---

## Goal

Three runtime improvements to the VE.Direct adapter's device connection lifecycle:

1. **Exponential backoff reconnection** — when a device disconnects, automatically retry with increasing delays (1s → 2s → 4s → … → 60s cap, indefinite retries)
2. **Per-device connection states** — expose `devices.deviceX.info.connection` boolean in the ioBroker state tree alongside the existing `info.connection` aggregate
3. **Permissive serial port path validation** — warn on unusual paths, throw on empty paths, before attempting to open the port

---

## Architecture

Three self-contained additions. No restructuring of existing code.

### `lib/reconnect.js` (new file)

Pure factory function — no I/O, no adapter dependency.

```
createReconnectScheduler(onAttempt, options)
  options: { initialDelayMs = 1000, maxDelayMs = 60000 }
  returns: { scheduleRetry(), cancel(), currentDelayMs }
```

**Behaviour:**
- `scheduleRetry()` — schedules `onAttempt()` after `currentDelayMs`, then doubles `currentDelayMs` (capped at `maxDelayMs`). Cancels any already-pending timer before scheduling.
- `cancel()` — clears pending timer and resets `currentDelayMs` to `initialDelayMs`. Called when connection is re-established.
- Backoff sequence: 1000ms, 2000ms, 4000ms, 8000ms, 16000ms, 30000ms, 60000ms, 60000ms, …

**Why a pure factory:** The backoff math is the only non-trivial logic. Isolating it makes it unit-testable without requiring a mock serial port.

### `main.js` changes

**1. New Map in constructor:**
```js
this.deviceReconnectSchedulers = new Map();  // deviceId -> reconnect scheduler
```

**2. `openDevicePort(deviceId, path)` — path validation (entry guard):**
- Empty or whitespace-only path → `throw new Error('Device path is empty for ${deviceId}')`
- Path doesn't match `/^(\/dev\/|COM\d)/i` → `this.log.warn('[openDevicePort] Unusual device path ...')` then continue

**3. `openDevicePort` — reconnection wiring:**
- On entry: create (or reuse) a scheduler stored in `deviceReconnectSchedulers`:
  ```js
  if (!this.deviceReconnectSchedulers.has(deviceId)) {
      this.deviceReconnectSchedulers.set(deviceId,
          createReconnectScheduler(() => this.openDevicePort(deviceId, path)));
  }
  const scheduler = this.deviceReconnectSchedulers.get(deviceId);
  ```
- `serialPort.on('error', ...)` handler: after logging, call `scheduler.scheduleRetry()`
- `serialPort.on('close', ...)` handler: call `scheduler.scheduleRetry()`
- `parser.on('data', ...)` handler: call `scheduler.cancel()` (connection is alive)

**4. `updateConnectionState()` — per-device states:**
```js
for (const [deviceId, isConnected] of this.deviceConnectionStates.entries()) {
    this.setStateChanged(`devices.${deviceId}.info.connection`, isConnected, true);
}
```

**5. `ensureCommandStates(deviceId)` — create the per-device info channel and state:**
```js
await this.extendObject(`devices.${deviceId}.info`, {
    type: 'channel',
    common: { name: `Connection info for ${deviceId}` },
    native: {}
});
await this.extendObject(`devices.${deviceId}.info.connection`, {
    type: 'state',
    common: {
        name: `Device ${deviceId} connected`,
        type: 'boolean',
        role: 'indicator.connected',
        read: true,
        write: false,
    },
    native: {}
});
```

**6. `onUnload` — cancel all reconnect timers:**
```js
for (const scheduler of this.deviceReconnectSchedulers.values()) {
    scheduler.cancel();
}
this.deviceReconnectSchedulers.clear();
```

### `test/unit/reconnect.test.js` (new file)

Unit tests for `createReconnectScheduler` using fake timers (sinon or Node's built-in `timers/promises`). Tests:
- First retry fires after `initialDelayMs`
- Second retry fires after `2 * initialDelayMs`
- Delay is capped at `maxDelayMs` and does not grow beyond it
- `cancel()` prevents the scheduled callback from firing
- `cancel()` resets delay back to `initialDelayMs` (verified by calling `scheduleRetry` again after cancel)
- Multiple `scheduleRetry()` calls in a row don't stack timers

---

## Error Handling

- Path validation throws on empty path → caught by the per-device try/catch in `onReady` (from PR #8), logged per device, adapter continues with remaining devices
- Reconnection `onAttempt` callback (`openDevicePort`) may throw (e.g. path no longer valid) → caught by the per-device try/catch in `onReady`. The scheduler itself does not catch — callers handle errors.
- `onUnload` cancels all schedulers before closing ports, preventing reconnect attempts during shutdown

---

## Files

| File | Action |
|------|--------|
| `lib/reconnect.js` | Create |
| `test/unit/reconnect.test.js` | Create |
| `main.js` | Modify (constructor, openDevicePort, updateConnectionState, ensureCommandStates, onUnload) |

---

## Out of Scope

- Integration tests with mock serial port (separate plan)
- Configurable reconnect parameters (YAGNI — hardcoded defaults are fine)
- Per-device reconnect attempt counter exposed as ioBroker state (YAGNI)
