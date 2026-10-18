#!/usr/bin/env bash
set -euo pipefail

site_root="$(cd "$(dirname "$0")/.." && pwd)"
owner="JasonJ2021"
repository="jasonj2021.github.io"
full_name="$owner/$repository"
remote_url="https://github.com/$full_name.git"
cd "$site_root"

for command in git gh; do
  command -v "$command" >/dev/null || { echo "Required command not found: $command" >&2; exit 1; }
done

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --scopes repo,workflow --web
fi
login="$(gh api user --jq .login)"
if [[ "$login" != "$owner" ]]; then
  echo "Sign in as $owner first: gh auth switch --user $owner" >&2
  exit 1
fi

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  if [[ "$(git rev-parse --show-toplevel)" != "$site_root" ]]; then
    echo "This directory belongs to a different Git repository; stopping." >&2
    exit 1
  fi
else
  git init -b main
fi
if [[ "$(git symbolic-ref --short HEAD)" != main ]]; then
  echo "Switch to the main branch before publishing." >&2
  exit 1
fi
if ! git diff --cached --quiet; then
  echo "Commit or unstage existing staged changes before publishing." >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  origin="$(git config --get remote.origin.url)"
  if [[ "$origin" != "$remote_url" && "$origin" != "git@github.com:$full_name.git" ]]; then
    echo "The origin remote points to another repository: $origin" >&2
    exit 1
  fi
fi

if gh repo view "$full_name" --json nameWithOwner >/dev/null 2>&1; then
  if [[ "$(gh repo view "$full_name" --json visibility --jq .visibility)" != PUBLIC ]]; then
    echo "The existing repository is private; its visibility has not been changed." >&2
    exit 1
  fi
else
  gh repo create "$full_name" --public --description "Jason Sun's personal website"
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$remote_url"
fi

# Adopt existing history when the local repository has no commits yet.
# A mixed reset preserves every local website file, unlike a hard reset.
git_auth=(git -c credential.https://github.com.helper= -c 'credential.https://github.com.helper=!gh auth git-credential')
"${git_auth[@]}" fetch origin
if git show-ref --verify --quiet refs/remotes/origin/main; then
  if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    git reset --mixed origin/main
    # Restore old repository files absent locally; keep current website files.
    while IFS= read -r -d '' missing_path; do
      git restore --worktree -- "$missing_path"
    done < <(git diff --name-only --diff-filter=D -z)
  elif ! git merge-base --is-ancestor origin/main HEAD; then
    echo "The remote main branch contains history missing locally; stopping without overwriting it." >&2
    exit 1
  fi
elif [[ -n "$(git for-each-ref --format='%(refname)' refs/remotes/origin/)" ]]; then
  echo "The remote uses a different branch; stopping without changing its Pages settings." >&2
  exit 1
fi

git add -- index.html .nojekyll assets data footprints scripts README.md .github
if ! git diff --cached --quiet; then
  git commit -m "Publish personal website"
fi
"${git_auth[@]}" push --set-upstream origin main

# Upload first: Pages cannot be configured for some empty repositories.
if gh api "repos/$full_name/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$full_name/pages" -f build_type=workflow >/dev/null
else
  gh api --method POST "repos/$full_name/pages" -f build_type=workflow >/dev/null
fi

# Dispatch after enabling Pages, so the first deployment cannot race its setup.
commit="$(git rev-parse HEAD)"
dispatch_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run pages.yml --repo "$full_name" --ref main
run_id=""
for attempt in {1..10}; do
  run_id="$(gh run list --repo "$full_name" --workflow pages.yml --commit "$commit" --event workflow_dispatch --created ">=$dispatch_time" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
  [[ -n "$run_id" ]] && break
  sleep 2
done
if [[ -n "$run_id" ]]; then
  gh run watch "$run_id" --repo "$full_name" --exit-status
  gh api "repos/$full_name/pages" --jq .html_url
else
  echo "Files uploaded. Check deployment status at https://github.com/$full_name/actions"
fi
