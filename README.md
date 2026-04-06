![Logo](admin/vedirect.png)

# ioBroker.vedirect

A production-focused **ioBroker adapter for Victron VE.Direct devices**.
It reads live telemetry over USB serial and supports targeted write commands for supported devices.

[![NPM version](https://img.shields.io/npm/v/iobroker.vedirect.svg)](https://www.npmjs.com/package/iobroker.vedirect)
[![Downloads](https://img.shields.io/npm/dm/iobroker.vedirect.svg)](https://www.npmjs.com/package/iobroker.vedirect)
[![CI](https://img.shields.io/travis/DrozmotiX/ioBroker.vedirect/master.svg)](https://travis-ci.org/DrozmotiX/ioBroker.vedirect)

[![NPM](https://nodei.co/npm/iobroker.vedirect.png?downloads=true)](https://nodei.co/npm/iobroker.vedirect/)

---

## Why this fork exists

This repository is actively maintained by **leotronik** as a continuation fork of the original adapter:
- Upstream source: [DrozmotiX/ioBroker.vedirect](https://github.com/DrozmotiX/ioBroker.vedirect)
- Goal of this fork: pragmatic maintenance, multi-device usability improvements, and cleaner operator experience.

This project keeps full attribution and license continuity while adding fork-specific improvements.

---

## Features

- Read VE.Direct telemetry from one or more Victron devices via USB serial.
- Configure up to **3 device paths directly in Admin UI** (`device1Path`, `device2Path`, `device3Path`).
- Backward compatibility for legacy config (`devices[]`, `USBDevice`).
- Automatic per-device object tree creation.
- Per-device command channels for supported VE.Direct TX writes:
  - `setMode`
  - `setLoad`
- Safer writes with validation, allowlists, ack filtering, rate limiting, and per-device queues.

---

## Requirements

- ioBroker host with this adapter installed.
- Victron device with VE.Direct output.
- USB-to-serial connection visible on the host (for example `/dev/ttyUSB0`).
- Permissions for the ioBroker runtime user to access serial devices.

---

## Installation

### From npm / ioBroker ecosystem

Install as you would any ioBroker adapter and then create an instance in Admin.

### Recommended Linux serial setup

Use stable `/dev/serial/by-id/...` paths where possible to avoid port renumbering after reboot.

---

## Quick start

1. Connect your Victron VE.Direct device to the ioBroker host.
2. In adapter instance settings:
   - Set **Device 1 path** (required).
   - Optionally set **Device 2 path** and **Device 3 path**.
3. Save config and restart the instance.
4. Verify objects under:
   - `vedirect.<instance>.devices.<normalizedDeviceId>.*`

---

## Data model and object tree

### Telemetry states

Telemetry is created per configured device:

- `vedirect.<instance>.devices.<normalizedDeviceId>.<key>`

Typical VE.Direct keys include:
`V`, `I`, `SOC`, `VPV`, `PPV`, `CS`, `ERR`, and more (depends on device model/firmware).

### Command states

For each configured device, writable states are created under:

- `...commands.setMode`
- `...commands.setLoad`

---

## Device ID normalization

`<normalizedDeviceId>` is generated from the configured path using:

1. Replace non `[a-zA-Z0-9_-]` chars with `_`.
2. Collapse repeated underscores.
3. Trim leading/trailing underscores.
4. Fallback to `default` if empty.

Examples:
- `/dev/ttyUSB0` → `dev_ttyUSB0`
- `/dev/serial/by-id/usb-VictronEnergy_BMV_700-if00` → `dev_serial_by-id_usb-VictronEnergy_BMV_700-if00`

---

## Startup behavior and config precedence

Device selection precedence:
1. `device1Path`, `device2Path`, `device3Path`
2. legacy `devices[]`
3. legacy `USBDevice`

For each selected device, the adapter opens one telemetry stream and initializes per-device channels/states.

---

## Write commands (VE.Direct TX)

### Supported commands

1. `setMode` (`number`)
   - Allowed values: `1` (on), `4` (off)
   - Frame: `MODE\t<value>\r\n`

2. `setLoad` (`boolean`)
   - `true` → `ON`, `false` → `OFF`
   - Frame: `LOAD\tON|OFF\r\n`

### Safety behavior

- Processes only user writes (`ack=false`).
- Accepts only allowlisted command states.
- Validates type and value before serial write.
- Rate-limits writes (minimum 250 ms spacing).
- Uses per-device write queue to reduce collision with incoming telemetry.

> Note: Write support depends on Victron model + firmware. Some devices are telemetry-only.

---

## Migration notes (legacy root states)

- New telemetry is written to:
  - `vedirect.<instance>.devices.<normalizedDeviceId>.<key>`
- Legacy root states (`vedirect.<instance>.<key>`) are **not auto-deleted**.

This is intentional to keep upgrades non-destructive. Remove old root states manually after validating your scripts/visualizations.

---

## Troubleshooting

### Missing `device2` / `device3` objects

- Confirm fields are non-empty and instance config was saved.
- Restart adapter after config change.
- Check normalized ID collisions (different paths can normalize to identical IDs).
- If structured fields are set, they override legacy JSON-style entries.

### No data arrives

- Verify serial path exists on host.
- Verify runtime user permissions for serial device.
- Prefer stable `/dev/serial/by-id/...` paths.
- Inspect adapter logs for serial open or parsing errors.

### Writes do not apply

- Confirm target device/firmware supports VE.Direct TX.
- Ensure writing to `...commands.*` states with `ack=false`.
- Validate payload types/values match command definitions.

---

## Changelog

Release history is maintained in [`CHANGELOG.md`](./CHANGELOG.md).

---

## Contributing

Issues and pull requests are welcome.
When contributing, please keep backward compatibility in mind and describe any object model changes clearly.

---

## Attribution and license

This project is based on work from the ioBroker community and specifically the upstream repository:
[DrozmotiX/ioBroker.vedirect](https://github.com/DrozmotiX/ioBroker.vedirect).

Licensed under the MIT License.

Copyright (c)
- 2023 DutchmanNL <oss@drozmotix.eu> (upstream origin and contributions)
- 2026 leotronik (fork maintenance and enhancements)

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
