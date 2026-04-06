![Logo](admin/vedirect.png)
# ioBroker.vedirect

[![NPM version](http://img.shields.io/npm/v/iobroker.vedirect.svg)](https://www.npmjs.com/package/iobroker.vedirect)
[![Downloads](https://img.shields.io/npm/dm/iobroker.vedirect.svg)](https://www.npmjs.com/package/iobroker.vedirect)
[![Dependency Status](https://img.shields.io/david/DrozmotiX/iobroker.vedirect.svg)](https://david-dm.org/DrozmotiX/iobroker.vedirect)
[![Known Vulnerabilities](https://snyk.io/test/github/DrozmotiX/ioBroker.vedirect/badge.svg)](https://snyk.io/test/github/DrozmotiX/ioBroker.vedirect)

[![NPM](https://nodei.co/npm/iobroker.vedirect.png?downloads=true)](https://nodei.co/npm/iobroker.vedirect/)

**Tests:**: [![Travis-CI](http://img.shields.io/travis/DrozmotiX/ioBroker.vedirect/master.svg)](https://travis-ci.org/DrozmotiX/ioBroker.vedirect)

## vedirect adapter for ioBroker

Read VE.direct data from a Victron device with vedirect connector over USB <-> serial connection.

## Project lineage (Forkception)

This repository is maintained as **a fork by leotronik** and is based on the original adapter from
[DrozmotiX/ioBroker.vedirect](https://github.com/DrozmotiX/ioBroker.vedirect).

In short: **leotronik fork of a fork** (Forkception) to continue development and maintenance with
project-specific additions.

### Configuration

In the instance settings you can now configure up to **three** device paths directly (without JSON editing):

- Device 1 path (required for operation)
- Device 2 path (optional)
- Device 3 path (optional)

For backward compatibility, existing `USBDevice` and `devices` configurations are still read.
The adapter currently uses the first configured device path as active serial connection.

## Object tree generation

This adapter creates two object groups during startup:

1. **Per-device telemetry states** (`vedirect.<instance>.devices.<normalizedDeviceId>.telemetry.<key>`)
   - VE.Direct keys are discovered from incoming serial frames and created dynamically via `stateSetCreate(fullId, attrName, value)`.
   - Typical examples are `V` (battery voltage), `I` (battery current), `SOC` (state of charge), `VPV`, `PPV`, `CS`, `ERR`, etc.
   - The adapter ensures `devices.<id>.telemetry` channels exist during startup before telemetry writes begin.

2. **Per-device command channels** (`vedirect.<instance>.devices.<normalizedDeviceId>.commands.*`)
   - For every configured device path, the adapter creates command objects:
     - `...commands.setMode`
     - `...commands.setLoad`
   - This allows targeting commands by device ID, independent of root telemetry states.

### Backward compatibility / migration note

- **Breaking change:** telemetry is now written only to `devices.<id>.telemetry.<key>`.
- Legacy root telemetry IDs (`vedirect.<instance>.<key>`) are no longer updated by default.
- Existing scripts/visualizations should migrate to the new per-device telemetry path.

### Device ID normalization (`getDeviceId()`)

`getDeviceId()` derives `<normalizedDeviceId>` from the configured device path using this exact rule:

1. Replace every character that is **not** `[a-zA-Z0-9_-]` with `_`.
2. Collapse repeated underscores (`__`) to a single `_`.
3. Trim leading/trailing underscores.
4. If the result is empty, use `default`.

### Normalization examples

- `/dev/ttyUSB0` → `dev_ttyUSB0`
- `/dev/serial/by-id/usb-VictronEnergy_BMV_700-if00` → `dev_serial_by-id_usb-VictronEnergy_BMV_700-if00`

### Startup behavior and limits

- **Active serial telemetry source:** the adapter opens exactly one active serial connection using the **first configured path** in priority order:
  1. `device1Path`, `device2Path`, `device3Path` (new structured admin fields),
  2. fallback to legacy `devices[]`,
  3. fallback to legacy `USBDevice`.
- **Command object generation:** after fixing issue #1, command states are generated for **all configured devices** (`device1Path`/`device2Path`/`device3Path`, or legacy device list), not only for the active telemetry device.
- **Current runtime limit:** telemetry parsing still comes from the single active serial connection.

### Troubleshooting: `device2` / `device3` objects missing

If objects for additional devices are missing, check:

1. **Admin config values**
   - Ensure `Device 2 path` and `Device 3 path` are filled with non-empty paths and save the instance config.
   - Restart the adapter instance after saving.
2. **Object ID collisions**
   - Different paths can normalize to the same ID (for example when they differ only by characters that become `_`), causing objects to overlap.
   - Verify resulting IDs under `vedirect.<instance>.devices.*` and adjust paths to produce distinct normalized IDs.
3. **Legacy/new config mixing**
   - If structured fields are filled, they take precedence over legacy JSON-style entries.
   - Remove stale legacy values if they cause unexpected device selection.

## Supported write commands (VE.Direct TX)

This adapter now exposes dedicated writable command states per configured device under:

- `vedirect.<instance>.devices.<id>.commands.setMode`
- `vedirect.<instance>.devices.<id>.commands.setLoad`

The `<id>` is derived from the configured USB path (for example `/dev/ttyUSB0` becomes `dev_ttyUSB0`).

### Safety model

- **Ack filter:** only user writes (`ack=false`) are processed.
- **Allowlist:** only documented commands below are accepted.
- **Validation:** each command payload is type/value checked before serial write.
- **Rate-limit:** writes are throttled (minimum 250 ms between writes).
- **Per-device queue:** commands are serialized per device and delayed briefly after incoming telemetry to reduce protocol collisions.
- **Unknown writes:** unsupported command states are rejected and logged as errors.

### Command allowlist

1. `setMode` (`number`)
   - Allowed values: `1` (on), `4` (off)
   - Serial frame: `MODE\t<value>\r\n`

2. `setLoad` (`boolean`)
   - Allowed values: `true` => `ON`, `false` => `OFF`
   - Serial frame: `LOAD\tON|OFF\r\n`

### Device/Firmware compatibility

Write support depends on the connected Victron device and its firmware implementation of VE.Direct TX commands.

- MPPT models that expose writable `MODE`/`LOAD` over VE.Direct usually support these states.
- Read-only devices or firmware without VE.Direct TX support will ignore or reject writes.

If a write is rejected by validation or the serial link is not writable, the adapter logs a clear error message.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### __WORK IN PROGRESS__
-->

### __WORK IN PROGRESS__
* (leotronik) Added structured admin settings for up to 3 devices (`device1Path`, `device2Path`, `device3Path`) and removed the manual JSON editor from the config UI.
* (leotronik) Added compatibility logic to keep legacy `USBDevice`/`devices` configurations working.
* (leotronik) Bumped adapter version to `0.4.0`.
* (leotronik) Refactored telemetry write path to `devices.<id>.telemetry.<key>` and documented migration from legacy root telemetry states.

### 0.4.0 (2026-04-06)
* (leotronik) Structured instance settings for up to three devices without JSON editing.
* (leotronik) Updated metadata to version 0.4.0.

#### Future topics
* Add optional command retry/backoff strategy with configurable limits.
* Extend writable command coverage for additional Victron devices and VE.Direct TX commands.
* Add diagnostics view (last write result, queue depth, reconnect counters) in admin UI.
* Expand integration tests for disconnect/reconnect edge cases and command collision scenarios.

### 0.3.3 (2024-09-10)
* (DutchmanNL) Repository checker compliance updates
* (DutchmanNL) Update dependencies for Node.js 18+ compatibility

### 0.3.1 (2023-10-29)
* (DutchmanNL) Message buffer implemented to avoid system overload

### 0.3.0 (2023-08-07) - Support Protocol Version 3.33
* (DutchmanNL) Bugfixes
* ([Andiling](https://github.com/andiling)) Update to support Protocol Version 3.33

### 0.2.0 (2023-08-06) - Implement protocol Version 3.32
* (DutchmanNL) Code optimization
* ([Andiling](https://github.com/andiling)) Add new product names of Vedirect
* ([Andiling](https://github.com/andiling)) Add option to admin for state expiration
* (DutchmanNL) Update dependencies * testing for NodeJS 18/20

### 0.1.2 (2020-10-06)
* (DutchmanNL) Fix sentry issue, error in opening USB-Port

### 0.1.1
* (DutchmanNL) Set state to NULL if no data received within 2 seconds.

### 0.1.0
* ([Andiling](https://github.com/andiling)) error in device modes corrected

### 0.0.9
* ([Andiling](https://github.com/andiling)) improve state attributes

### 0.0.8
* (DutchmanNL) set connection state to false when no data received for 10 seconds
* (DutchmanNL & Andiling) reconnect to USB when connection lost
* (DutchmanNL & Andiling) Update state attributes

### 0.0.7
* (DutchmanNL & [Andiling](https://github.com/andiling)) Alpha release

## License
MIT License

Copyright (c) 2023 DutchmanNL <oss@drozmotix.eu>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
