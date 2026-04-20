# Hardware Safety Review — ioBroker.vedirect

**Date:** 2026-04-19  
**Scope:** Full codebase review with focus on hardware safety  
**Context:** This adapter controls real physical power hardware (Victron Energy solar chargers, battery monitors, inverters) via VE.Direct serial protocol. A malfunction can turn off charging, switch loads unexpectedly, or cause automations to act on corrupt data.

---

## CRITICAL

### C1 — No VE.Direct block checksum validation
**File:** `main.js:392-421`  
VE.Direct text protocol sends a `Checksum` byte at the end of each data block. The adapter silently discarded checksum lines without verifying them. A bit-flipped voltage or current value passes through undetected and writes to the ioBroker state tree. Downstream automations read the corrupt value and make charge/load decisions on bad data.  
**Fix:** `lib/checksumValidator.js` — buffers block lines per device, validates sum mod 256 == 0 before flushing to states. Corrupted blocks are discarded with a warning.

### C2 — `setStateChanged` + expireTime = states expire during stable readings
**File:** `main.js:537`  
When `expireTime` is configured and a telemetry value remains constant (e.g., battery voltage holds at 48.5 V for multiple readings), `setStateChanged` skips the write because the value hasn't changed. The expire timer is never reset. The state expires even though the device is actively reporting data. Automations see no value and may fail-safe (halt charging, trigger alarms).  
**Fix:** When `expireTime > 0`, use `setState` (unconditional write) to refresh the timer. Use `setStateChanged` only when no expiration is configured.

### C3 — Stale commands replay after reconnect; queue unbounded
**File:** `lib/serialCommandWriter.js:45-52`  
Commands queued during a disconnect execute after reconnect with no age check. A command queued 60 seconds before reconnect fires on a device that may now be in a different state. The queue also has no size cap — during a long outage it grows without bound.  
**Fix:** Timestamp commands at enqueue time; discard any command older than 30 s before execution. Add `clearQueueForDevice` and call it from the watchdog on disconnect.

### C4 — Command queue not cleared on watchdog-detected disconnect
**File:** `main.js:229-236`  
When the watchdog marks a device as disconnected, the command queue for that device is not flushed. Stale commands from before the drop execute after reconnect. Amplifies C3.  
**Fix:** Call `this.commandWriter.clearQueueForDevice(deviceId)` inside the watchdog disconnect branch.

---

## HIGH

### H1 — Parse error incorrectly marks device disconnected
**File:** `main.js:418`  
Any exception in `parse_serial` (bad lookup value, unexpected format) sets `info.connection = false` and triggers reconnection. A single corrupted or unknown telemetry line causes a full reconnect cycle, masking the real issue and delaying alarm detection.  
**Fix:** Remove `this.setState('info.connection', false, true)` from the parse error handler. Only serial/port-level errors should affect connection state.

### H2 — `subscribeStates` called on every telemetry message for writable states
**File:** `main.js:545`  
`common.write && this.subscribeStates(createStateName)` runs inside `stateSetCreate`, which is called for every telemetry line. For writable states this fires thousands of times per hour. ioBroker command states are already subscribed in `ensureCommandStates`. Duplicate subscriptions risk double-processing commands sent to the device.  
**Fix:** Remove the line from `stateSetCreate`. Subscription is already handled at startup.

### H3 — Serial write has no timeout
**File:** `lib/serialCommandWriter.js:67-85`  
If `drain()` callback never fires (hung port), the write promise hangs forever and blocks the entire command queue permanently. No other commands can be sent until the adapter restarts.  
**Fix:** Add a 5 s timeout inside the write promise that rejects with a clear error, cleaning up all listeners.

### H4 — Global rate limit across all devices
**File:** `lib/serialCommandWriter.js:94-99`  
Single `this.lastWriteAt` shared across all devices. A command to device 1 throttles commands to device 2. In a 3-device setup each command waits for the previous device's rate window.  
**Fix:** Change to per-device `lastWriteAtByDevice` Map.

---

## MEDIUM

### M1 — Weak device path validation
**File:** `lib/pathValidation.js:7`  
Regex `/^(\/dev\/|COM\d)/i` warns on unusual paths but only checks the prefix. Accepts `/dev/anything`.  
**Fix:** Restrict to `/dev/(ttyUSB|ttyACM|ttyS)\d+` and `COM\d+`.

### M2 — Device ID collision possible with similar paths
**File:** `main.js:246-251`  
`getDeviceId` sanitizes by replacing non-alphanumeric chars with `_`. `/dev/ttyUSB_0` and `/dev/ttyUSB.0` both produce `dev_ttyUSB_0`. Two devices on similar paths overwrite each other's state tree.  
**Fix:** Detect and warn on collision at startup. Algorithm not changed to avoid breaking existing installations.

---

## LOW

### L1 — `Math.floor` before division in converters is a no-op
**File:** `lib/converters.js:50`  
VE.Direct protocol guarantees integer values. `Math.floor(integerValue)` is a no-op. Misleading.  
**Fix:** Use `Number(rawValue) / divisor`.

### L2 — `messageBuffer` config units not enforced
**File:** `main.js:183`  
Config treated as seconds (multiplied × 1000 in code). No validation or clear unit label. User entering ms gets 1000× longer buffer.  
**Status:** Documented. Fix requires admin UI change.

### L3 — Command execution not verified against device response (known limitation)
**File:** `main.js:382-386`  
`ack: true` is set immediately after enqueuing a command without waiting for device confirmation via telemetry readback (e.g., next `MODE` line). Requires command/response correlation mechanism not yet implemented.  
**Status:** Documented as known limitation. Future PR should add readback verification for safety-critical commands.

---

## Summary

| ID | Issue | Severity | Fixed |
|----|-------|----------|-------|
| C1 | No checksum validation | CRITICAL | ✅ |
| C2 | setStateChanged breaks expire timer | CRITICAL | ✅ |
| C3 | Stale command replay / unbounded queue | CRITICAL | ✅ |
| C4 | Queue not cleared on watchdog disconnect | CRITICAL | ✅ |
| H1 | Parse error marks device disconnected | HIGH | ✅ |
| H2 | subscribeStates in hot path | HIGH | ✅ |
| H3 | No serial write timeout | HIGH | ✅ |
| H4 | Global rate limit across devices | HIGH | ✅ |
| M1 | Weak path validation | MEDIUM | ✅ |
| M2 | Device ID collision warning | MEDIUM | ✅ |
| L1 | Math.floor no-op | LOW | ✅ |
| L2 | messageBuffer units unclear | LOW | documented |
| L3 | No command readback verification | LOW | documented |
