'use strict';
const { expect } = require('chai');
const { convertValue } = require('../../lib/converters');

describe('convertValue', () => {
	describe('numeric scaling', () => {
		it('converts mV to V (divide by 1000)', () => {
			expect(convertValue('V', '12650')).to.equal(12.65);   // Math.floor(12650)/1000
		});

		it('converts V2 the same as V', () => {
			expect(convertValue('V2', '12650')).to.equal(12.65);
		});

		it('converts SOC (divide by 10)', () => {
			expect(convertValue('SOC', '975')).to.equal(97.5);
		});

		it('converts H17 (divide by 100)', () => {
			expect(convertValue('H17', '1234')).to.equal(12.34);
		});

		it('converts DC_IN_P (divide by 1, integer)', () => {
			expect(convertValue('DC_IN_P', '42')).to.equal(42);
		});

		it('returns NaN for non-numeric raw value', () => {
			expect(convertValue('V', 'bad')).to.be.NaN;
		});
	});

	describe('passthrough keys', () => {
		it('returns raw string for keys not in the table', () => {
			expect(convertValue('SER#', 'HQ12345')).to.equal('HQ12345');
		});

		it('returns raw string for FW', () => {
			expect(convertValue('FW', '159')).to.equal('159');
		});
	});
});
