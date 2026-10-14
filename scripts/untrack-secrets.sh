#!/bin/sh
# Stops git from tracking secrets and uploaded project sources.
# Files stay on your disk; they just stop being committed/pushed.
# Run from the repo root:  sh scripts/untrack-secrets.sh
set -e
git rm -r --cached --ignore-unmatch \
  Backend/.env \
  Backend/uploads \
  Backend/taxpal9522 \
  Backend/nodemon.json.save
echo
echo "Done. Now run:"
echo "  git add -A && git commit -m 'Untrack .env and uploads, add security hardening' && git push"
echo
echo "IMPORTANT: the old .env is still in git HISTORY (public repo)."
echo "Rotate the MongoDB Atlas password and generate a new JWT_SECRET."
