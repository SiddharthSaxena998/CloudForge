const GITHUB_URL_RE =
  /^(?:https:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_][\w.-]*)\/([A-Za-z0-9_][\w.-]*?)(?:\.git)?\/?$/;
const BRANCH_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,99}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns a clean https GitHub URL, or null if the input is not a plain repo URL. */
function normalizeGithubUrl(input) {
  if (typeof input !== 'string') return null;
  const m = GITHUB_URL_RE.exec(input.trim());
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

const isValidBranch = (b) => typeof b === 'string' && BRANCH_RE.test(b) && !b.includes('..');
const isValidEmail = (e) => typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e);

// Project names become folder names and subdomains; keep these free.
const RESERVED_NAMES = new Set([
  'repos', 'uploads', 'api', 'admin', 'www', 'app', 'dashboard', 'login', 'static', 'assets', 'mcp-nginx',
]);

module.exports = { normalizeGithubUrl, isValidBranch, isValidEmail, RESERVED_NAMES };
