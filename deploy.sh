#!/usr/bin/env bash
# Deploy RPXLABS web: sync sumber -> repo -> push (Vercel auto-deploy)
set -e
EXPORT="/c/Program Files/GitHub CLI"
export PATH="$PATH:$EXPORT"
SITE=/c/Users/User/rpxlabs-site
cd "$SITE"
git add -A
git -c user.name="RPXLABS" -c user.email="rpxlabs@users.noreply.github.com" commit -m "${1:-Update site}" || echo "(no changes)"
git push origin main
echo "pushed. Vercel will deploy shortly."
echo "Live: https://rpxlabsphotography.vercel.app"
