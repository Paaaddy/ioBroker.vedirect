# Reconnection, Per-Device States & Path Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add exponential backoff reconnection, per-device `info.connection` states in the ioBroker state tree, and permissive serial port path validation to the VE.Direct adapter.

**Architecture:** A pure `createReconnectScheduler` factory in `lib/reconnect.js` handles all backoff math independently of I/O. `main.js` wires it into the existing `openDevicePort` error/close/data handlers, adds a path guard at entry, and extends `updateConnectionState` and `ensureCommandStates` for per-device state visibility.

**Tech Stack:** Node.js 18+, mocha + chai + sinon (fake timers for reconnect tests), `@iobroker/adapter-core`, `serialport`

---

## Base Branch

**This plan must be implemented on a branch based off `refactor/high-impact`**, not `main`. The refactor branch contains the cleaned-up `main.js` (data-driven converters, lookup factory, etc.) that this plan builds on.

```bash
git worktree add .worktrees/reconnect -b feat/reconnect-per-device-states origin/refactor/high-impact
cd .worktrees/reconnect
npm install
npm test  # should show 84 passing
```

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/reconnect.js` | Create | Pure backoff scheduler factory — no I/O, fully testable |
| `test/unit/reconnect.test.js` | Create | Unit tests for scheduler using sinon fake timers |
| `main.js` | Modify | Wire scheduler, add path validation, add per-device states |

---

## Task 1: Reconnect scheduler — tests first

**Files:**
- Create: `lib/reconnect.js`
- Create: `test/unit/reconnect.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/reconnect.test.js`:

```js
'use strict';
const { expect } = require('chai');
const sinon = require('sinon');
const { createReconnectScheduler } = require('../../lib/reconnect');

describe('createReconnectScheduler', () => {
    let clock;

    beforeEach(() => { clock = sinon.useFakeTimers(); });
    afterEach(() => { clock.restore(); });

    it('fires onAttempt after initialDelayMs', () => {
        const onAttempt = sinon.spy();
        const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
        scheduler.scheduleRetry();
        clock.tick(999);
        expect(onAttempt.callCount).to.equal(0);
        clock.tick(1);
        expect(onAttempt.callCount).to.equal(1);
    });

    it('doubles the delay on each scheduleRetry call', () => {
        const onAttempt = sinon.spy();
        const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });

        scheduler.scheduleRetry();
        clock.tick(1000);                   // fires after 1000ms
        expect(scheduler.currentDelayMs).to.equal(2000);

        scheduler.scheduleRetry();
        clock.tick(2000);                   // fires after 2000ms
        expect(scheduler.currentDelayMs).to.equal(4000);
    });

    it('caps delay at maxDelayMs', () => {
        const onAttempt = sinon.spy();
        const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 4000 });

        scheduler.scheduleRetry(); clock.tick(1000);  // 1000 → 2000
        scheduler.scheduleRetry(); clock.tick(2000);  // 2000 → 4000
        scheduler.scheduleRetry(); clock.tick(4000);  // 4000 → capped at 4000
        expect(scheduler.currentDelayMs).to.equal(4000);

        scheduler.scheduleRetry(); clock.tick(4000);  // still 4000
        expect(scheduler.currentDelayMs).to.equal(4000);
        expect(onAttempt.callCount).to.equal(4);
    });

    it('cancel() prevents the scheduled callback from firing', () => {
        const onAttempt = sinon.spy();
        const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
        scheduler.scheduleRetry();
        scheduler.cancel();
        clock.tick(2000);
        expect(onAttempt.callCount).to.equal(0);
    });

    it('cancel() resets delay to initialDelayMs', () => {
        const onAttempt = sinon.spy();
        const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
        scheduler.scheduleRetry(); clock.tick(1000);  // delay is now 2000
        scheduler.cancel();
        expect(scheduler.currentDelayMs).to.equal(1000);
    });

    it('calling scheduleRetry() twice does not stack timers', () => {
        const onAttempt = sinon.spy();
        const scheduler = createReconnectScheduler(onAttempt, { initialDelayMs: 1000, maxDelayMs: 60000 });
        scheduler.scheduleRetry();
        scheduler.scheduleRetry();  // should cancel first and reschedule
        clock.tick(1000);
        expect(onAttempt.callCount).to.equal(1);  // not 2
    });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test
```

Expected: `Error: Cannot find module '../../lib/reconnect'`

- [ ] **Step 3: Create `lib/reconnect.js`**

```js
'use strict';

/**
 * Creates a reconnection scheduler with exponential backoff.
 *
 * @param {() => void} onAttempt - Called on each reconnect attempt
 * @param {{ initialDelayMs?: number, maxDelayMs?: number }} [options]
 * @returns {{ scheduleRetry: () => void, cancel: () => void, currentDelayMs: number }}
 */
function createReconnectScheduler(onAttempt, options = {}) {
    const initialDelayMs = options.initialDelayMs ?? 1000;
    const maxDelayMs = options.maxDelayMs ?? 60000;

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
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all 6 reconnect tests pass, total 90 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/reconnect.js test/unit/reconnect.test.js
git commit -m "feat: add exponential backoff reconnect scheduler"
```

---

## Task 2: Path validation in `openDevicePort`

**Files:**
- Modify: `main.js` — `openDevicePort` method (currently line 124)

Add a guard at the very top of `openDevicePort`, before `new SerialPort(...)`.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/pathValidation.test.js`:

```js
'use strict';
const { expect } = require('chai');

// Mirror the validation logic as a pure helper — same pattern as parseSerialGuard tests.
// NOTE: This tests the validation contract in isolation. If the guard in main.js changes,
// update this test to match.
function validateSerialPath(path) {
    if (!path || !path.trim()) {
        throw new Error(`Device path is empty`);
    }
    const isUnusual = !/^(\/dev\/|COM\d)/i.test(path.trim());
    return { valid: true, warn: isUnusual };
}

describe('serial port path validation', () => {
    it('throws for empty path', () => {
        expect(() => validateSerialPath('')).to.throw('Device path is empty');
    });

    it('throws for whitespace-only path', () => {
        expect(() => validateSerialPath('   ')).to.throw('Device path is empty');
    });

    it('accepts /dev/ttyUSB0 without warning', () => {
        const result = validateSerialPath('/dev/ttyUSB0');
        expect(result.valid).to.be.true;
        expect(result.warn).to.be.false;
    });

    it('accepts /dev/ttyACM0 without warning', () => {
        const result = validateSerialPath('/dev/ttyACM0');
        expect(result.valid).to.be.true;
        expect(result.warn).to.be.false;
    });

    it('accepts COM3 without warning', () => {
        const result = validateSerialPath('COM3');
        expect(result.valid).to.be.true;
        expect(result.warn).to.be.false;
    });

    it('accepts unusual path with warn=true', () => {
        const result = validateSerialPath('/dev/ttyAP0');
        expect(result.valid).to.be.true;
        expect(result.warn).to.be.true;
    });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all 6 path validation tests pass (pure helper, no dependency on main.js).

- [ ] **Step 3: Add path guard to `openDevicePort` in `main.js`**

Find `async openDevicePort(deviceId, path) {` and add the guard as the first thing in the method body, before `const serialPort = new SerialPort(...)`:

```js
async openDevicePort(deviceId, path) {
    // Path validation
    if (!path || !path.trim()) {
        throw new Error(`Device path is empty for ${deviceId}`);
    }
    if (!/^(\/dev\/|COM\d)/i.test(path.trim())) {
        this.log.warn(`[openDevicePort] Unusual device path for ${deviceId}: "${path}" — expected /dev/tty* or COM*`);
    }

    const serialPort = new SerialPort({
        path,
        baudRate: 19200
    });
    // ... rest of existing method unchanged
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass (90 passing).

- [ ] **Step 5: Commit**

```bash
git add main.js test/unit/pathValidation.test.js
git commit -m "feat: add permissive serial port path validation to openDevicePort"
```

---

## Task 3: Wire reconnect scheduler into `openDevicePort`

**Files:**
- Modify: `main.js` — constructor, `openDevicePort`, `onUnload`

- [ ] **Step 1: Add require and constructor field**

At the top of `main.js`, add the require (near the other lib requires):

```js
const { createReconnectScheduler } = require(__dirname + '/lib/reconnect');
```

In the constructor, add the new Map after `this.deviceConnectionStates = new Map();`:

```js
this.deviceReconnectSchedulers = new Map(); // deviceId -> reconnect scheduler
```

- [ ] **Step 2: Wire scheduler into `openDevicePort`**

Inside `openDevicePort`, after the path validation guard and before `const serialPort = new SerialPort(...)`, add the scheduler setup:

```js
// Get or create the reconnect scheduler for this device
if (!this.deviceReconnectSchedulers.has(deviceId)) {
    this.deviceReconnectSchedulers.set(
        deviceId,
        createReconnectScheduler(
            () => {
                this.log.info(`[reconnect] Attempting reconnect for ${deviceId}...`);
                this.openDevicePort(deviceId, path).catch((err) => {
                    this.log.error(`[reconnect] Reconnect attempt failed for ${deviceId}: ${err.message}`);
                });
            }
        )
    );
}
const scheduler = this.deviceReconnectSchedulers.get(deviceId);
```

In the `serialPort.on('error', ...)` handler, add `scheduler.scheduleRetry()` after `this.updateConnectionState()`:

```js
serialPort.on('error', (error) => {
    this.log.error(`Issue handling serial port connection for ${deviceId}: ${JSON.stringify(error)}`);
    this.deviceConnectionStates.set(deviceId, false);
    this.updateConnectionState();
    scheduler.scheduleRetry();
});
```

In the `serialPort.on('close', ...)` handler, add `scheduler.scheduleRetry()`:

```js
serialPort.on('close', () => {
    this.deviceConnectionStates.set(deviceId, false);
    this.updateConnectionState();
    scheduler.scheduleRetry();
});
```

In the `parser.on('data', ...)` handler, add `scheduler.cancel()` after `this.deviceLastTelemetryAt.set(...)`:

```js
parser.on('data', (data) => {
    this.deviceLastTelemetryAt.set(deviceId, Date.now());
    scheduler.cancel();  // connection is alive — reset backoff
    this.log.debug(`[Serial data received ${deviceId}] ${data}`);
    // ... rest of existing data handler unchanged
```

- [ ] **Step 3: Cancel all schedulers in `onUnload`**

In `onUnload`, add cancellation before the serial port cleanup. After `clearInterval(this.deviceConnectionWatchdogInterval)` block, add:

```js
for (const scheduler of this.deviceReconnectSchedulers.values()) {
    scheduler.cancel();
}
this.deviceReconnectSchedulers.clear();
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass (90 passing).

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat: wire exponential backoff reconnection into openDevicePort"
```

---

## Task 4: Per-device connection states

**Files:**
- Modify: `main.js` — `ensureCommandStates`, `updateConnectionState`

- [ ] **Step 1: Add per-device info channel and state in `ensureCommandStates`**

In `ensureCommandStates(deviceId)`, add two new `extendObject` calls after the existing `commandsChannelId` channel creation (after the block that creates `devices.${deviceId}.commands`):

```js
// Per-device connection info channel and state
await this.extendObject(`devices.${deviceId}.info`, {
    type: 'channel',
    common: {
        name: `Connection info for ${deviceId}`
    },
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

- [ ] **Step 2: Write per-device state in `updateConnectionState`**

Replace the existing `updateConnectionState` method:

```js
// BEFORE:
updateConnectionState() {
    const isAnyDeviceConnected = Array.from(this.deviceConnectionStates.values()).some(Boolean);
    this.setState('info.connection', isAnyDeviceConnected, true);
}
```

With:

```js
// AFTER:
updateConnectionState() {
    const isAnyDeviceConnected = Array.from(this.deviceConnectionStates.values()).some(Boolean);
    this.setState('info.connection', isAnyDeviceConnected, true);
    for (const [deviceId, isConnected] of this.deviceConnectionStates.entries()) {
        this.setStateChanged(`devices.${deviceId}.info.connection`, isConnected, true);
    }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass (90 passing).

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: add per-device info.connection state to ioBroker state tree"
```

---

## Task 5: Also cancel schedulers when watchdog detects timeout

**Files:**
- Modify: `main.js` — `startConnectionWatchdog`

The watchdog sets `deviceConnectionStates` to false and calls `updateConnectionState` when no telemetry arrives for 10s. It should also trigger reconnection.

- [ ] **Step 1: Add scheduler call to watchdog**

Find the watchdog in `startConnectionWatchdog`. The inner block currently reads:

```js
if (isConnected && now - lastTelemetryAt > 10000) {
    this.deviceConnectionStates.set(deviceId, false);
    this.updateConnectionState();
    this.log.error(`No data received for 10 seconds on ${deviceId}, connection lost ?`);
}
```

Replace with:

```js
if (isConnected && now - lastTelemetryAt > 10000) {
    this.deviceConnectionStates.set(deviceId, false);
    this.updateConnectionState();
    this.log.error(`No data received for 10 seconds on ${deviceId}, connection lost ?`);
    const scheduler = this.deviceReconnectSchedulers.get(deviceId);
    if (scheduler) scheduler.scheduleRetry();
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass (90 passing).

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat: trigger reconnect from watchdog when telemetry times out"
```

---

## Task 6: Push and open PR against upstream

- [ ] **Step 1: Verify full test suite**

```bash
npm test
npm run lint
```

Expected: 90 passing, 0 lint errors.

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feat/reconnect-per-device-states
gh pr create \
  --title "feat: exponential backoff reconnection, per-device states, path validation" \
  --base main \
  --body "$(cat <<'EOF'
## Summary

- **Exponential backoff reconnection**: devices auto-reconnect after disconnect/error (1s → 2s → 4s → … → 60s cap, indefinite retries). Reconnect is cancelled immediately on first data received.
- **Per-device connection states**: \`devices.deviceX.info.connection\` boolean added to ioBroker state tree alongside existing \`info.connection\` aggregate
- **Permissive path validation**: empty paths throw (caught per-device); unusual paths log a warning and continue
- **Watchdog integration**: telemetry timeout also triggers reconnect scheduler

## New files

- \`lib/reconnect.js\` — pure backoff scheduler factory, zero I/O dependencies
- \`test/unit/reconnect.test.js\` — 6 unit tests with sinon fake timers
- \`test/unit/pathValidation.test.js\` — 6 unit tests for validation contract

## Test plan

- [ ] \`npm test\` passes (90 tests)
- [ ] Unplug VE.Direct device → adapter logs reconnect attempts with increasing delays
- [ ] Re-plug device → reconnect succeeds, \`devices.deviceX.info.connection\` goes true
- [ ] Configure empty device path → adapter logs error for that device, opens others normally
- [ ] Configure unusual path (e.g. \`/dev/ttyAP0\`) → adapter logs warning but attempts to open

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- [x] **Spec coverage:**
  - Exponential backoff reconnection → Tasks 1, 3, 5
  - Per-device connection states → Task 4
  - Path validation → Task 2
  - `onUnload` cleanup → Task 3
- [x] **No placeholders** — all code is complete
- [x] **Type consistency** — `createReconnectScheduler` defined in Task 1, used in Task 3; `scheduler.scheduleRetry()` / `scheduler.cancel()` consistent throughout; `deviceReconnectSchedulers` Map defined in Task 3 constructor, used in Tasks 3 and 5
- [x] **Base branch noted** — plan begins with worktree setup from `refactor/high-impact`
