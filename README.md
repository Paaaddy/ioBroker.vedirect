![Logo](admin/vedirect.png)
# ioBroker.vedirect

[![NPM version](http://img.shields.io/npm/v/iobroker.vedirect.svg)](https://www.npmjs.com/package/iobroker.vedirect)
[![Downloads](https://img.shields.io/npm/dm/iobroker.vedirect.svg)](https://www.npmjs.com/package/iobroker.vedirect)

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
The adapter opens one serial telemetry stream per configured device path.

## Object tree generation

This adapter creates two object groups during startup:

1. **Per-device telemetry states** (`vedirect.<instance>.devices.<normalizedDeviceId>.<key>`)
   - VE.Direct keys are discovered from incoming serial frames and created dynamically via `stateSetCreate(deviceId, stateName, name, value)`.
   - Typical examples are `V` (battery voltage), `I` (battery current), `SOC` (state of charge), `VPV`, `PPV`, `CS`, `ERR`, etc.
   - Keys are namespaced per device, so values from multiple VE.Direct devices do not overwrite each other.

2. **Per-device command channels** (`vedirect.<instance>.devices.<normalizedDeviceId>.commands.*`)
   - For every configured device path, the adapter creates command objects:
     - `...commands.setMode`
     - `...commands.setLoad`
   - This allows targeting commands by device ID, independent of root telemetry states.

### Device ID normalization (`getDeviceId()`)

`getDeviceId()` derives `<normalizedDeviceId>` from the configured device path using this exact rule:

1. Replace every character that is **not** `[a-zA-Z0-9_-]` with `_`.
2. Collapse repeated underscores (`__`) to a single `_`.
3. Trim leading/trailing underscores.
4. If the result is empty, use `default`.

### Normalization examples

- `/dev/ttyUSB0` → `dev_ttyUSB0`
- `/dev/serial/by-id/usb-VictronEnergy_BMV_700-if00` → `dev_serial_by-id_usb-VictronEnergy_BMV_700-if00`

### Startup behavior

- **Serial telemetry source(s):** the adapter opens one active serial connection for **each configured device path** in priority order:
  1. `device1Path`, `device2Path`, `device3Path` (structured admin fields),
  2. fallback to legacy `devices[]`,
  3. fallback to legacy `USBDevice`.
- **Object generation:** during startup, the adapter creates/extends `devices.<normalizedDeviceId>` channels and command states for all configured devices before telemetry values are written.
- **Per-device runtime handling:** message-buffer timers, telemetry timeout timers, and connection health are tracked per device and cleaned up on unload.

### Telemetry migration policy

- New telemetry writes use `vedirect.<instance>.devices.<normalizedDeviceId>.<key>`.
- Existing legacy root telemetry objects (`vedirect.<instance>.<key>`) are **not** deleted automatically by the adapter.
- This keeps upgrades safe and non-destructive; you can remove legacy root objects manually after verifying your scripts/visualizations now read from the per-device tree.

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

Release history has been moved to [`CHANGELOG.md`](./CHANGELOG.md) to keep this README concise and reduce merge conflicts between parallel PRs.

### Latest release: 0.4.1 (2026-04-06)
- Resolved open PR merge-conflict overlap by consolidating recent branch changes.
- Added a standalone changelog file for cleaner release management.
- Raised adapter version metadata to `0.4.1`.

## License
MIT License

Copyright (c) 2023 DutchmanNL <oss@drozmotix.eu>
Copyright (c) 2026 leotronik

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
