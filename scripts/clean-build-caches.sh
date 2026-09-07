#!/usr/bin/env bash
# clean-build-caches.sh
#
# Frees disk space by removing Android/iOS build caches for this project
# and shared toolchain caches on this machine.
#
# Usage:
#   scripts/clean-build-caches.sh --android [--dry-run]
#   scripts/clean-build-caches.sh --ios [--pods] [--dry-run]
#   scripts/clean-build-caches.sh --all [--pods] [--dry-run]
#
# Never touches: node_modules, .env, keystores, google-services.json,
# GoogleService-Info.plist, ~/Library/Developer/Xcode/iOS DeviceSupport.
# ios/Pods is only removed when --pods is explicitly passed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DO_ANDROID=false
DO_IOS=false
DO_PODS=false
DRY_RUN=false

usage() {
  grep '^#' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --android) DO_ANDROID=true ;;
    --ios) DO_IOS=true ;;
    --all) DO_ANDROID=true; DO_IOS=true ;;
    --pods) DO_PODS=true ;;
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown option: $arg" >&2; usage ;;
  esac
done

if ! $DO_ANDROID && ! $DO_IOS; then
  usage
fi

# Print size of a path (if it exists) and delete it unless --dry-run.
clean_path() {
  local path="$1"
  if [ ! -e "$path" ]; then
    echo "  (absent)  $path"
    return
  fi
  local size
  size="$(du -sh "$path" 2>/dev/null | cut -f1)"
  if $DRY_RUN; then
    echo "  [dry-run] $size  $path"
  else
    echo "  removing  $size  $path"
    rm -rf "$path"
  fi
}

# Expand a glob and clean each match.
clean_glob() {
  local pattern="$1"
  local matched=false
  for p in $pattern; do
    if [ -e "$p" ]; then
      matched=true
      clean_path "$p"
    fi
  done
  $matched || echo "  (absent)  $pattern"
}

if $DO_ANDROID; then
  echo "== Android build caches =="
  clean_path "$REPO_ROOT/android/build"
  clean_path "$REPO_ROOT/android/app/build"
  clean_path "$REPO_ROOT/android/.gradle"
  clean_glob "$HOME/.gradle/caches/build-cache-*"
  clean_glob "$HOME/.gradle/caches/transforms-*"
fi

if $DO_IOS; then
  echo "== iOS build caches =="
  clean_path "$REPO_ROOT/ios/build"
  clean_path "$HOME/Library/Developer/Xcode/DerivedData"
  clean_path "$HOME/Library/Caches/CocoaPods"
  # Xcode archives older than 30 days only; never DeviceSupport.
  ARCHIVES_DIR="$HOME/Library/Developer/Xcode/Archives"
  if [ -d "$ARCHIVES_DIR" ]; then
    echo "  old archives (>30 days) under $ARCHIVES_DIR:"
    while IFS= read -r archive; do
      clean_path "$archive"
    done < <(find "$ARCHIVES_DIR" -mindepth 2 -maxdepth 2 -name '*.xcarchive' -mtime +30)
  else
    echo "  (absent)  $ARCHIVES_DIR"
  fi
  if $DO_PODS; then
    clean_path "$REPO_ROOT/ios/Pods"
  fi
fi

echo "== Free space after =="
df -h /System/Volumes/Data | tail -1
