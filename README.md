![Logo](admin/vedirect.png)
# ioBroker.vedirect

Read VE.Direct data from Victron devices over a USB-to-serial connection.

## Fork notice

This repository is maintained as a **fork by leotronik** and is based on:

- [DrozmotiX/ioBroker.vedirect](https://github.com/DrozmotiX/ioBroker.vedirect)

Because this is a fork-focused maintenance repository, npm package badges, Nodei graphics, and Travis links from the original project have been removed to avoid pointing to unrelated or outdated distribution/CI endpoints.

## Documentation

To keep this README focused, detailed operational documentation has been moved to dedicated files:

- [Configuration](./docs/CONFIGURATION.md)
- [Object model & startup behavior](./docs/OBJECT_MODEL.md)
- [Write commands (VE.Direct TX)](./docs/COMMANDS.md)
- [Changelog](./CHANGELOG.md)

## Quick start

1. Configure at least one serial device path in the adapter instance settings.
2. Optionally configure up to two additional device paths.
3. Restart the adapter instance.
4. Check created states under `vedirect.<instance>.devices.*`.

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
