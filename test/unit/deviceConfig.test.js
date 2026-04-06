'use strict';
const { expect } = require('chai');
const { getConfiguredDevices } = require('../../lib/deviceConfig');

describe('getConfiguredDevices', () => {
    describe('fromFields (device1Path/device2Path/device3Path)', () => {
        it('assigns correct IDs when device1 is missing', () => {
            const config = { device1Path: '', device2Path: '/dev/ttyUSB0', device3Path: '' };
            const result = getConfiguredDevices(config);
            expect(result).to.deep.equal([{ id: 'device2', path: '/dev/ttyUSB0' }]);
        });

        it('assigns device1 when only device1 is set', () => {
            const config = { device1Path: '/dev/ttyUSB0', device2Path: '', device3Path: '' };
            const result = getConfiguredDevices(config);
            expect(result).to.deep.equal([{ id: 'device1', path: '/dev/ttyUSB0' }]);
        });

        it('assigns correct IDs for all three devices', () => {
            const config = {
                device1Path: '/dev/ttyUSB0',
                device2Path: '/dev/ttyUSB1',
                device3Path: '/dev/ttyUSB2',
            };
            const result = getConfiguredDevices(config);
            expect(result).to.have.lengthOf(3);
            expect(result[0].id).to.equal('device1');
            expect(result[1].id).to.equal('device2');
            expect(result[2].id).to.equal('device3');
        });

        it('trims whitespace from paths', () => {
            const config = { device1Path: '  /dev/ttyUSB0  ', device2Path: '', device3Path: '' };
            const result = getConfiguredDevices(config);
            expect(result[0].path).to.equal('/dev/ttyUSB0');
        });
    });

    describe('fallback to config.devices array', () => {
        it('uses config.devices when fromFields is empty', () => {
            const config = {
                device1Path: '',
                device2Path: '',
                device3Path: '',
                devices: [{ id: 'myDevice', path: '/dev/ttyUSB0' }],
            };
            const result = getConfiguredDevices(config);
            expect(result).to.deep.equal([{ id: 'myDevice', path: '/dev/ttyUSB0' }]);
        });
    });

    describe('fallback to legacy USBDevice', () => {
        it('uses USBDevice when nothing else is set', () => {
            const config = { USBDevice: '/dev/ttyUSB0' };
            const result = getConfiguredDevices(config);
            expect(result).to.deep.equal([{ id: 'device1', path: '/dev/ttyUSB0' }]);
        });
    });

    it('returns empty array when nothing is configured', () => {
        expect(getConfiguredDevices({})).to.deep.equal([]);
    });
});
