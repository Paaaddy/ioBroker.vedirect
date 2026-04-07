'use strict';
const { expect } = require('chai');
const { makeLookup } = require('../../lib/lookups');

describe('makeLookup', () => {
    const table = {
        '0': { reason: 'Normal Operation' },
        '1': { reason: 'Low Voltage' },
        '128': { reason: 'High Temperature' },
    };

    it('returns the mapped value for a known key', () => {
        const lookup = makeLookup(table, 'reason', 'alarm reason');
        expect(lookup('0')).to.equal('Normal Operation');
        expect(lookup('128')).to.equal('High Temperature');
    });

    it('returns an "unknown" fallback string for an unknown key', () => {
        const lookup = makeLookup(table, 'reason', 'alarm reason');
        expect(lookup('999')).to.equal('unknown alarm reason = 999');
    });

    it('returns fallback for undefined key', () => {
        const lookup = makeLookup(table, 'reason', 'alarm reason');
        expect(lookup(undefined)).to.equal('unknown alarm reason = undefined');
    });

    it('works with different property key names', () => {
        const stateTable = { '0': { state: 'Off' }, '3': { state: 'Bulk' } };
        const lookup = makeLookup(stateTable, 'state', 'operation state');
        expect(lookup('3')).to.equal('Bulk');
    });
});
