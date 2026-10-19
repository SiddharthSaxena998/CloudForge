const { normalizeGithubUrl, isValidBranch, isValidEmail } = require('../utils/validators');

describe('normalizeGithubUrl', () => {
  it('accepts plain GitHub repo URLs and cleans them', () => {
    expect(normalizeGithubUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
    expect(normalizeGithubUrl('github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(normalizeGithubUrl(' https://github.com/owner/repo/ ')).toBe('https://github.com/owner/repo');
  });

  it('rejects anything else (other hosts, options, extra paths)', () => {
    expect(normalizeGithubUrl('https://evil.com/owner/repo')).toBeNull();
    expect(normalizeGithubUrl('--upload-pack=touch /tmp/x')).toBeNull();
    expect(normalizeGithubUrl('https://github.com/owner/repo/tree/main')).toBeNull();
    expect(normalizeGithubUrl(42)).toBeNull();
  });
});

describe('isValidBranch', () => {
  it('allows normal branch names', () => {
    expect(isValidBranch('main')).toBe(true);
    expect(isValidBranch('feature/login-page')).toBe(true);
  });

  it('blocks option-like and traversal names', () => {
    expect(isValidBranch('--help')).toBe(false);
    expect(isValidBranch('a..b')).toBe(false);
    expect(isValidBranch('')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('checks the basic shape', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });
});
