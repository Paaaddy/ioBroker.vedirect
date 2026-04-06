# Supported write commands (VE.Direct TX)

This adapter exposes dedicated writable command states per configured device under:

- `vedirect.<instance>.devices.<id>.commands.setMode`
- `vedirect.<instance>.devices.<id>.commands.setLoad`

The `<id>` is derived from the configured USB path (for example `/dev/ttyUSB0` becomes `dev_ttyUSB0`).

## Safety model

- **Ack filter:** only user writes (`ack=false`) are processed.
- **Allowlist:** only documented commands below are accepted.
- **Validation:** each command payload is type/value checked before serial write.
- **Rate-limit:** writes are throttled (minimum 250 ms between writes).
- **Per-device queue:** commands are serialized per device and delayed briefly after incoming telemetry to reduce protocol collisions.
- **Unknown writes:** unsupported command states are rejected and logged as errors.

## Command allowlist

1. `setMode` (`number`)
   - Allowed values: `1` (on), `4` (off)
   - Serial frame: `MODE\t<value>\r\n`

2. `setLoad` (`boolean`)
   - Allowed values: `true` => `ON`, `false` => `OFF`
   - Serial frame: `LOAD\tON|OFF\r\n`

## Device/Firmware compatibility

Write support depends on the connected Victron device and its firmware implementation of VE.Direct TX commands.

- MPPT models that expose writable `MODE`/`LOAD` over VE.Direct usually support these states.
- Read-only devices or firmware without VE.Direct TX support will ignore or reject writes.

If a write is rejected by validation or the serial link is not writable, the adapter logs a clear error message.
