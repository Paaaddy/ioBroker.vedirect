![Logo](admin/vedirect.png)
# ioBroker.vedirect

[![CI](https://github.com/Paaaddy/ioBroker.vedirect/actions/workflows/ci.yml/badge.svg)](https://github.com/Paaaddy/ioBroker.vedirect/actions/workflows/ci.yml)
[![Release](https://github.com/Paaaddy/ioBroker.vedirect/actions/workflows/release.yml/badge.svg)](https://github.com/Paaaddy/ioBroker.vedirect/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/Paaaddy/ioBroker.vedirect)](https://github.com/Paaaddy/ioBroker.vedirect/releases)

Reads live telemetry from **Victron Energy devices** (MPPT solar charge controllers, BMV battery monitors, Phoenix inverters) over the **VE.Direct serial protocol** via a USB-to-serial cable.

The adapter creates ioBroker states for each field the device reports — battery voltage, current, state of charge, solar power, error codes, and more — namespaced per device under `vedirect.<instance>.devices.<deviceId>.*`. Up to **three devices** can be connected per adapter instance.

## Quick start

1. Connect your Victron device via a VE.Direct USB cable.
2. Open the adapter instance settings and enter the serial port path (e.g. `/dev/ttyUSB0`) for each device.
3. Restart the adapter instance.
4. Check the created states under `vedirect.<instance>.devices.*`.

## Documentation

- [Configuration](./docs/CONFIGURATION.md) — serial port setup, multi-device, troubleshooting
- [Object model & startup behavior](./docs/OBJECT_MODEL.md) — state tree layout, telemetry migration
- [Write commands (VE.Direct TX)](./docs/COMMANDS.md) — controlling device mode and load output
- [Changelog](./CHANGELOG.md)

## CI & Release

| Workflow | Triggers | Purpose |
|---|---|---|
| **CI** | Push / PR to `main` (code changes only) | Runs lint and tests on Node 18, 20, and 22. Skipped for markdown and docs-only changes. |
| **Release** | Push of a `v*` tag (e.g. `v0.4.2`) | Creates a GitHub Release with the matching changelog section from `CHANGELOG.md`. |
| **Auto-merge** | Dependabot pull requests | Automatically merges qualifying Dependabot updates after CI passes: patch updates for all deps, minor updates for dev deps, and security minor updates for prod deps. |
| **Dependabot** | Weekly schedule | Opens PRs to update npm packages and GitHub Actions to their latest versions. |

To cut a new release:

```sh
# 1. Update CHANGELOG.md and bump version in package.json
# 2. Commit your changes, then:
git tag v0.4.2
git push origin v0.4.2
# The Release workflow will create the GitHub Release automatically.
```

## Fork notice

This repository is maintained as a **fork by leotronik** and is based on:

- [DrozmotiX/ioBroker.vedirect](https://github.com/DrozmotiX/ioBroker.vedirect)

npm package badges, Nodei graphics, and Travis links from the original project have been removed to avoid pointing to unrelated or outdated endpoints.

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
