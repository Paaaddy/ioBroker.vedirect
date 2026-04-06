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

Set the proper device (example /dev/ttyUSB0) in adapter config.


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
* (leotronik) Added VE.Direct TX write command states (`setMode`, `setLoad`) including validation, allowlist, ack filter, queueing and write rate limiting.
* (leotronik) Added per-device reconnect manager with dedicated health states for more robust USB recovery handling.
* (leotronik) Improved state-change handling and merged current open maintenance updates from active branches/PRs.

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
