# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run lint                 # ESLint (~0.3s)
npm run test:package         # Validates package.json + io-package.json (~18ms, 40 tests)
npm run test:unit            # Unit tests for lib/ modules
npm run test:integration     # Full adapter integration test (26–47s, NEVER cancel)
npx tsc --noEmit             # Type check (7 known non-blocking errors, exits code 2)
```

Run a single unit test file:
```bash
npx mocha test/unit/reconnect.test.js --exit
```

No build step — pure JavaScript. `npm run build` is a no-op.

### Expected test results

- `test:integration` — "The adapter starts successfully", 1 passing. Connection errors (`path not defined`) are **expected** without hardware.
- `test:package` — 40 passing.
- `tsc --noEmit` — 7 type errors, exit code 2 — non-blocking.

## Architecture

### Entry point

`main.js` — exports the `Vedirect` class (extends `utils.Adapter` from `@iobroker/adapter-core`). Lifecycle: `onReady → openDevicePort → parseSerial → stateSetCreate`.

### Data flow

```
Serial port (19200 baud)
  → ReadlineParser (splits on \r\n)
  → checksumValidator.processLine()   # buffers lines per device; flushes complete blocks
  → parseSerial()                     # maps VE.Direct keys via LOOKUP_KEYS or convertValue()
  → stateSetCreate()                  # extends ioBroker objects lazily; writes state values
```

### Key lib modules

| File | Purpose |
|------|---------|
| `lib/checksumValidator.js` | Per-device block accumulator; validates VE.Direct checksum before emitting entries |
| `lib/serialCommandWriter.js` | Write commands (`setMode`, `setLoad`) back to device; enforces rate-limit, telemetry quiet window, stale-command TTL, per-device queue |
| `lib/reconnect.js` | Exponential-backoff reconnect scheduler (1s → 60s); `reset()` on success, `cancel()` on unload |
| `lib/deviceConfig.js` | Reads `device1Path/device2Path/device3Path` → falls back to `devices[]` → falls back to `USBDevice` |
| `lib/stateAttr.js` | Attribute metadata (name, type, role, unit, expire flag) for every known VE.Direct key |
| `lib/lookups.js` | Human-readable value mappings for enum fields (CS, ERR, MPPT, MODE, etc.) |
| `lib/converters.js` | Numeric/string value normalization |
| `lib/pathValidation.js` | Warns on suspicious device paths |

### Multi-device model

Each configured device path gets a normalized ID (`/dev/ttyUSB0` → `dev_ttyUSB0`). All runtime state is keyed by `deviceId`:

- ioBroker object tree: `vedirect.<instance>.devices.<deviceId>.<key>`
- Command states: `vedirect.<instance>.devices.<deviceId>.commands.setMode|setLoad`
- `devicePorts`, `deviceConnectionStates`, `deviceLastTelemetryAt`, `deviceReconnectSchedulers` — all `Map<deviceId, …>`

Connection watchdog runs every 1 s; marks device disconnected if no telemetry for 10 s.

### Command write path

`onStateChange` (ack=false) → `commandWriter.enqueue(deviceId, commandName, value)` → `writeCommand` (validates, rate-limits, waits for telemetry quiet, writes frame `CODE\tVALUE\r\n`, drains port).

Commands: `setMode` (number: 1=on, 4=off), `setLoad` (boolean → `ON`/`OFF`).

### State creation optimization

`stateSetCreate` caches `createdStatesDetails[stateId]` in memory. `extendObject` is only called when metadata actually changes — avoids object-db writes on every telemetry frame.

### Sentry integration

Errors routed through `sendSentry()`. Opt-out via `DISABLE_SENTRY=true` env var.

## Config fields

| Field | Description |
|-------|-------------|
| `device1Path` / `device2Path` / `device3Path` | Primary device paths (priority 1) |
| `devices[]` | Array format (priority 2) |
| `USBDevice` | Legacy single-device (priority 3) |
| `messageBuffer` | Seconds to debounce repeated frames (0 = disabled) |
| `expireTime` | Seconds before states with `expire:true` in `stateAttr` are invalidated |
| `deepStateDiagnostics` | Verbose metadata-change logging |

## Docs

- `docs/COMMANDS.md` — serial write command details and safety model
- `docs/OBJECT_MODEL.md` — ioBroker object tree layout and migration policy
- `docs/CONFIGURATION.md` — admin UI configuration reference
- `docs/hardware-safety-review-2026-04-19.md` — hardware safety notes

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
