# Object model and startup behavior

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

## Startup behavior

- **Serial telemetry source(s):** the adapter opens one active serial connection for **each configured device path** in priority order:
  1. `device1Path`, `device2Path`, `device3Path` (structured admin fields),
  2. fallback to legacy `devices[]`,
  3. fallback to legacy `USBDevice`.
- **Object generation:** during startup, the adapter creates/extends `devices.<normalizedDeviceId>` channels and command states for all configured devices before telemetry values are written.
- **Per-device runtime handling:** message-buffer timers, telemetry timeout timers, and connection health are tracked per device and cleaned up on unload.

## Telemetry migration policy

- New telemetry writes use `vedirect.<instance>.devices.<normalizedDeviceId>.<key>`.
- Existing legacy root telemetry objects (`vedirect.<instance>.<key>`) are **not** deleted automatically by the adapter.
- This keeps upgrades safe and non-destructive; you can remove legacy root objects manually after verifying your scripts/visualizations now read from the per-device tree.
