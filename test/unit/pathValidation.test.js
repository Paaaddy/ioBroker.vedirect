'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { validateDevicePath } = require('../../lib/pathValidation');

describe('validateDevicePath', () => {
	let warnSpy;

	beforeEach(() => {
		warnSpy = sinon.spy();
	});

	it('throws when path is empty string', () => {
		expect(() => validateDevicePath('device1', '', warnSpy))
			.to.throw(Error, /Device path is empty for device1/);
	});

	it('throws when path is whitespace only', () => {
		expect(() => validateDevicePath('device1', '   ', warnSpy))
			.to.throw(Error, /Device path is empty for device1/);
	});

	it('does not throw or warn for /dev/ttyUSB0', () => {
		expect(() => validateDevicePath('device1', '/dev/ttyUSB0', warnSpy)).to.not.throw();
		expect(warnSpy.called).to.be.false;
	});

	it('does not throw or warn for COM3 (Windows port)', () => {
		expect(() => validateDevicePath('device1', 'COM3', warnSpy)).to.not.throw();
		expect(warnSpy.called).to.be.false;
	});

	it('warns but does not throw for unusual path /tmp/fake', () => {
		expect(() => validateDevicePath('device1', '/tmp/fake', warnSpy)).to.not.throw();
		expect(warnSpy.calledOnce).to.be.true;
		expect(warnSpy.firstCall.args[0]).to.include('Unusual device path');
	});

	it('warns but does not throw for pipe:0', () => {
		expect(() => validateDevicePath('device2', 'pipe:0', warnSpy)).to.not.throw();
		expect(warnSpy.calledOnce).to.be.true;
		expect(warnSpy.firstCall.args[0]).to.include('Unusual device path');
	});
});
