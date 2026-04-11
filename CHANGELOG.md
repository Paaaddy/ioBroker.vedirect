# Changelog

All notable changes to this project are documented in this file.

## 0.4.2 (2026-04-10)
- Fix CI: regenerate package-lock.json to include c8 coverage tool.
- Sync admin UI translations for device path and state interval fields.
- Simplify CI workflow to core Node 18/20/22 test matrix.

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
