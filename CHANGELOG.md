# Changelog

All notable changes to this project are documented in this file.

## [0.5.3](https://github.com/Paaaddy/ioBroker.vedirect/compare/v0.5.2...v0.5.3) (2026-04-19)


### Bug Fixes

* harden error handling, plug unhandled promises, optimize hot path ([#32](https://github.com/Paaaddy/ioBroker.vedirect/issues/32)) ([aa221e9](https://github.com/Paaaddy/ioBroker.vedirect/commit/aa221e9507318f4b4c9f9fba0f48e9bece7db9e3))

## [0.5.2](https://github.com/Paaaddy/ioBroker.vedirect/compare/v0.5.1...v0.5.2) (2026-04-10)


### Bug Fixes

* normalize unit test harness spacing ([c3da231](https://github.com/Paaaddy/ioBroker.vedirect/commit/c3da231b29efafdca212dee5d04a08d67267f0e6))
* trim integration test harness comment ([03e07fe](https://github.com/Paaaddy/ioBroker.vedirect/commit/03e07fed60609ad984a1c3f24dafb541fd17fcbc))

## [0.5.1](https://github.com/Paaaddy/ioBroker.vedirect/compare/v0.5.0...v0.5.1) (2026-04-10)


### Bug Fixes

* clarify ioBroker test harness comments ([93923dc](https://github.com/Paaaddy/ioBroker.vedirect/commit/93923dcd53c5435c113c42eac9728ef33d9bafb9))

## [0.5.0](https://github.com/Paaaddy/ioBroker.vedirect/compare/v0.4.1...v0.5.0) (2026-04-10)


### Features

* add exponential backoff reconnect scheduler ([202d101](https://github.com/Paaaddy/ioBroker.vedirect/commit/202d101a307d1bd67fc52e6782a4ab33570f99db))
* add path validation to openDevicePort ([ac3e149](https://github.com/Paaaddy/ioBroker.vedirect/commit/ac3e149cc12cfc9cf646fc47807d9d996adf8b1c))
* add per-device connection states in state tree ([63d3ef4](https://github.com/Paaaddy/ioBroker.vedirect/commit/63d3ef492283886cb8b3831be29f8c9812c4dc4c))
* add per-device telemetry streams and namespaced states ([edb7fbb](https://github.com/Paaaddy/ioBroker.vedirect/commit/edb7fbb303a26086b59e68178cbcaaca5ac2a139))
* bump to 0.4.0 and simplify multi-device settings ([cd9714b](https://github.com/Paaaddy/ioBroker.vedirect/commit/cd9714b4f3899fdc7e1f241bf9d6624714048ac5))
* reconnect, per-device states, path validation ([48519e7](https://github.com/Paaaddy/ioBroker.vedirect/commit/48519e7b9b311be7bbe9f8e72ca4f92aa00680e0))
* release 0.4.0 — structured 3-device instance settings ([5b8c1b6](https://github.com/Paaaddy/ioBroker.vedirect/commit/5b8c1b67d9f39dc142665f980e37eea44decb4c4))
* release 0.4.0 — structured 3-device instance settings ([3c1b372](https://github.com/Paaaddy/ioBroker.vedirect/commit/3c1b372fa7ae6144c6b7553d9c3355df282f57ac))
* support multi-device VE.Direct telemetry namespaced per device ([8de4d19](https://github.com/Paaaddy/ioBroker.vedirect/commit/8de4d1987e4eda079e784ebb023640b583faae2b))
* trigger reconnect scheduler from connection watchdog ([1dd7a9a](https://github.com/Paaaddy/ioBroker.vedirect/commit/1dd7a9a593a69d7c80e671203129bcfcf22bc347))
* wire reconnect scheduler into openDevicePort and onUnload ([c640a0a](https://github.com/Paaaddy/ioBroker.vedirect/commit/c640a0ae5bd7446505a78d3f5eedc2a9977b6d48))


### Bug Fixes

* continue opening remaining devices if one device fails to open ([16bab50](https://github.com/Paaaddy/ioBroker.vedirect/commit/16bab5074bb499685175bf410ce15a2fe53a2b9b))
* ensure test/unit/*.test.js files are picked up by npm test ([2a86a3d](https://github.com/Paaaddy/ioBroker.vedirect/commit/2a86a3d0c1a3bcd253b044e20bc3258f6c5b3728))
* preserve device slot numbers in getConfiguredDevices after filter ([2265d8d](https://github.com/Paaaddy/ioBroker.vedirect/commit/2265d8dc6e8406c946a76f6268b04f3d8f0fc99d))
* preserve float precision in convertValue (floor-then-divide, not divide-then-floor) ([052a995](https://github.com/Paaaddy/ioBroker.vedirect/commit/052a995c13431e9136514ad553b9c6db15b0ca85))
* re-enable Sentry error reporting (was hardcoded disabled) ([670a751](https://github.com/Paaaddy/ioBroker.vedirect/commit/670a751b9360bd5e7b39f5cdcaf7f2077113efa7))
* remove duplicate name comparison in stateSetCreate metadata check ([93d2a22](https://github.com/Paaaddy/ioBroker.vedirect/commit/93d2a2299976b9a696077bb3c3bd645313689ab4))
* replace nullish coalescing operator and convert to tab indentation ([9456996](https://github.com/Paaaddy/ioBroker.vedirect/commit/945699698e3facade554d1950b63701d77097372))
* restore errorHandler to log actual error message not 'undefined' ([d9b4ab0](https://github.com/Paaaddy/ioBroker.vedirect/commit/d9b4ab072612e97b62fb65a3d8e09d9739f2147f))
* skip non-key-value lines in parse_serial to prevent NaN propagation ([af8b604](https://github.com/Paaaddy/ioBroker.vedirect/commit/af8b604ac2ce7ccfb1a05a21928fa3293e93808c))

## 0.4.1 (2026-04-06)
- Resolved outstanding merge-conflict overlap from open PR branches by consolidating recent command/state handling updates in the current base branch.
- Added a standalone `CHANGELOG.md` to reduce future PR conflicts in `README.md`.
- Updated release metadata and documentation for version `0.4.1`.

## 0.4.0 (2026-04-06)
- Structured instance settings for up to three devices without JSON editing.
- Updated metadata to version 0.4.0.

## 0.3.3 (2024-09-10)
- Repository checker compliance updates.
- Dependencies updated for Node.js 18+ compatibility.

## 0.3.1 (2023-10-29)
- Message buffer implemented to avoid system overload.

## 0.3.0 (2023-08-07)
- Bug fixes.
- Protocol Version 3.33 support.

## 0.2.0 (2023-08-06)
- Code optimization.
- New VE.Direct product names.
- Added admin option for state expiration.
- Updated dependencies and tested on Node.js 18/20.

## 0.1.2 (2020-10-06)
- Fixed sentry issue (error opening USB port).

## 0.1.1
- Set state to `NULL` if no data received within 2 seconds.

## 0.1.0
- Corrected error in device mode handling.

## 0.0.9
- Improved state attributes.

## 0.0.8
- Set connection state to false when no data received for 10 seconds.
- Reconnect to USB when connection is lost.
- Updated state attributes.

## 0.0.7
- Alpha release.
