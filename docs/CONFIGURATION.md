# Configuration

In the instance settings you can configure up to **three** device paths directly (without JSON editing):

- Device 1 path (required for operation)
- Device 2 path (optional)
- Device 3 path (optional)

For backward compatibility, existing `USBDevice` and `devices` configurations are still read.
The adapter opens one serial telemetry stream per configured device path.

## Device ID normalization (`getDeviceId()`)

`getDeviceId()` derives `<normalizedDeviceId>` from the configured device path using this rule:

1. Replace every character that is **not** `[a-zA-Z0-9_-]` with `_`.
2. Collapse repeated underscores (`__`) to a single `_`.
3. Trim leading/trailing underscores.
4. If the result is empty, use `default`.

### Examples

- `/dev/ttyUSB0` → `dev_ttyUSB0`
- `/dev/serial/by-id/usb-VictronEnergy_BMV_700-if00` → `dev_serial_by-id_usb-VictronEnergy_BMV_700-if00`

## Troubleshooting: `device2` / `device3` objects missing

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
