'use strict';
const { expect } = require('chai');

// NOTE: This test defines a local copy of the guard logic as a pure function
// because parse_serial is an instance method on the Vedirect adapter class,
// which requires the full ioBroker runtime to instantiate. The pure helper
// mirrors the production guard exactly — if the guard in main.js is changed,
// this test must be updated to match.
function splitVeDirectLine(line) {
    const parts = line.split('\t');
    if (parts.length < 2) return null;
    return { key: parts[0], raw: parts[1] };
}

describe('VE.Direct line splitting', () => {
    it('returns null for lines without a tab (e.g. checksum noise)', () => {
        expect(splitVeDirectLine('Checksum')).to.be.null;
    });

    it('parses a valid key-value line', () => {
        expect(splitVeDirectLine('V\t12650')).to.deep.equal({ key: 'V', raw: '12650' });
    });

    it('returns null for empty line', () => {
        expect(splitVeDirectLine('')).to.be.null;
    });

    it('handles value that is "0"', () => {
        expect(splitVeDirectLine('SOC\t0')).to.deep.equal({ key: 'SOC', raw: '0' });
    });
});
