#!/usr/bin/env bash
# Installs JDK 17 and Maestro into the home directory (no sudo). Idempotent.
set -euo pipefail
JDK_DIR="$HOME/Android/jdk17"
MAESTRO_DIR="$HOME/.maestro/maestro"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [[ ! -x "$JDK_DIR/bin/java" ]]; then
  mkdir -p "$HOME/Android"
  curl -fsSL -o "$work/jdk.tgz" "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir "$work/jdk"
  tar xzf "$work/jdk.tgz" -C "$work/jdk"
  mv "$work"/jdk/jdk-* "$JDK_DIR"
fi

if [[ ! -x "$MAESTRO_DIR/bin/maestro" ]]; then
  mkdir -p "$HOME/.maestro"
  curl -fsSL -o "$work/maestro.zip" "https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.11.0/maestro.zip"
  unzip -q "$work/maestro.zip" -d "$work/maestro"
  mv "$work/maestro/maestro" "$MAESTRO_DIR"
fi

JAVA_HOME="$JDK_DIR" PATH="$JDK_DIR/bin:$MAESTRO_DIR/bin:$PATH" MAESTRO_CLI_NO_ANALYTICS=1 maestro --version | tail -1
