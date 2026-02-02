# Agent Guidelines

## Purpose
This repository defines a clean baseline for a MetaMask WordPress dApp plugin. Follow the architecture and deployment model described in `README.md`.

## General Rules
- Keep JavaScript framework-agnostic and DOM-light.
- Avoid WordPress-specific logic in JavaScript; keep it in PHP.
- Do not commit build output in `dist/`.
- Use deterministic builds and a single public JS initializer.
- Prefer small, focused files with clear responsibilities.
- Theme reference files live in `references/wordpress/theme/masu-wpcom` for Masu-specific UI alignment.

## Pull Request Notes
- Summarize changes and tests in the PR body.
- Reference any new scripts, workflows, or dependencies.
