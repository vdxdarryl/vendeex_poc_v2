#!/bin/bash
# Run this script from your terminal to connect the dev copy to GitHub and push.
# Usage: cd "/Users/dr_darryl_carlton/Desktop/VENDEEX 2.0/VendeeX 2.0 Demo - dev" && bash setup-github-backup.sh

set -e
REPO_URL="https://github.com/vdxdarryl/vendeex_poc_v2.git"

echo "→ Initializing Git (if needed)..."
if [ ! -d .git ]; then
  git init
  git remote add origin "$REPO_URL"
  echo "  Git initialized and remote added."
else
  if ! git remote get-url origin 2>/dev/null; then
    git remote add origin "$REPO_URL"
    echo "  Remote 'origin' added."
  else
    echo "  Git already set up. Current remote: $(git remote get-url origin)"
  fi
fi

# Ensure remote URL is correct (in case it was wrong)
git remote set-url origin "$REPO_URL"

echo "→ Staging all files..."
git add -A

echo "→ Checking status..."
git status

echo ""
echo "→ Creating initial commit (if there are changes)..."
if [ -n "$(git status --porcelain)" ]; then
  git commit -m "Initial backup: VendeeX 2.0 Demo dev copy (POC v2)"
  echo "  Commit created."
else
  echo "  Nothing to commit (working tree clean)."
fi

echo ""
echo "→ Pushing to GitHub..."
# Ensure we're on main (GitHub default)
git branch -M main

# If remote has commits we don't have (e.g. README created on GitHub), pull first then push
if ! git push -u origin main 2>/dev/null; then
  echo "  Remote has existing commits. Pulling and merging..."
  git pull origin main --allow-unrelated-histories --no-edit
  git push -u origin main
fi

echo ""
echo "Done. Your dev copy is backed up to: $REPO_URL"
echo "To update GitHub later: git add -A && git commit -m 'Your message' && git push"
