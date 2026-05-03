'use strict';
const { expect } = require('chai');
const { VeDirectChecksumValidator } = require('../../lib/checksumValidator');

describe('checksumValidator.processLine()', () => {
	it('returns blockComplete:false for a tab-delimited data line', () => {
		const v = new VeDirectChecksumValidator();
		const result = v.processLine('dev1', 'V\t12650');
		expect(result.blockComplete).to.equal(false);
		expect(result.entries).to.deep.equal([]);
	});

	it('emits entries when a valid checksum line completes a block', () => {
		const v = new VeDirectChecksumValidator();
		// Prime the first-block guard — first checksum is always discarded
		v.processLine('dev1', 'Checksum\t\x00');
		// Build a second block: V\t12650 + the byte that makes the running sum === 0
		// Sum of V\t12650 = 116; sum of Checksum\t = 83; total = 199; byte 57 = 256-199 → sum 0
		v.processLine('dev1', 'V\t12650');
		const result = v.processLine('dev1', 'Checksum\t' + String.fromCharCode(57));
		expect(result.blockComplete).to.equal(true);
		expect(result.valid).to.equal(true);
		expect(result.entries).to.deep.equal([{ key: 'V', rawValue: '12650' }]);
	});

	it('returns blockComplete:false and does not crash for a garbage line (no tab)', () => {
		const v = new VeDirectChecksumValidator();
		const result = v.processLine('dev1', 'notatabledline');
		expect(result.blockComplete).to.equal(false);
	});

	it('returns valid:false and empty entries for an invalid checksum', () => {
		const v = new VeDirectChecksumValidator();
		// Prime the first-block guard
		v.processLine('dev1', 'Checksum\t\x00');
		v.processLine('dev1', 'V\t12650');
		// Wrong byte (0 instead of 57) → sum ends at 199, not 0
		const result = v.processLine('dev1', 'Checksum\t\x00');
		expect(result.blockComplete).to.equal(true);
		expect(result.valid).to.equal(false);
		expect(result.entries).to.deep.equal([]);
	});

	it('does not crash or corrupt state on an oversized line (>256 chars)', () => {
		const v = new VeDirectChecksumValidator();
		const longLine = 'x'.repeat(300);
		expect(() => v.processLine('dev1', longLine)).to.not.throw();
		const after = v.processLine('dev1', longLine);
		expect(after.blockComplete).to.equal(false);
	});
});
