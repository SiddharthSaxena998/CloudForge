const { limits, limitsFor, isExempt } = require('../config/limits');

afterEach(() => {
  delete process.env.MAX_PROJECTS_PER_USER;
});

describe('limits', () => {
  it('has sane defaults', () => {
    const l = limits();
    expect(l.maxProjects).toBe(5);
    expect(l.maxRunningContainers).toBe(3);
    expect(l.containerBindHost).toBe('127.0.0.1');
  });

  it('reads overrides from the environment', () => {
    process.env.MAX_PROJECTS_PER_USER = '9';
    expect(limits().maxProjects).toBe(9);
  });
});

describe('limitsFor', () => {
  it('applies a user\'s overrides and ignores null / invalid ones', () => {
    expect(limitsFor({ limitOverrides: { maxProjects: 12 } }).maxProjects).toBe(12);
    expect(limitsFor({ limitOverrides: { maxRunningContainers: null } }).maxRunningContainers).toBe(3);
    expect(limitsFor({ limitOverrides: { maxProjects: -4 } }).maxProjects).toBe(5);
    expect(limitsFor(null).maxProjects).toBe(5);
  });

  it('allows 0 to freeze an action', () => {
    expect(limitsFor({ limitOverrides: { maxDeploysPerHour: 0 } }).maxDeploysPerHour).toBe(0);
  });
});

describe('isExempt', () => {
  it('exempts admins only', () => {
    expect(isExempt({ role: 'admin' })).toBe(true);
    expect(isExempt({ role: 'user' })).toBe(false);
    expect(isExempt(null)).toBe(false);
  });
});
