'use strict';
const { expect } = require('chai');

// Test the guard logic as a pure helper — mirrors what parse_serial does
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
