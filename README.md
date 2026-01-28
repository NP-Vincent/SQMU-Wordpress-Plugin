# MetaMask WordPress dApp – Build & Codex Specification

## Purpose

This repository is the **canonical starting point** for building MetaMask SDK–compatible interfaces that:

- Are written as a modern JavaScript dApp
- Build into static, browser‑safe assets
- Are deployable as a **WordPress plugin** (WordPress.com compatible)
- Can evolve into a **full embedded dApp experience** across a WordPress site

This repo intentionally avoids retrofitting prior experiments. It defines a **clean, deterministic baseline**.

---

## Design Principles

1. **Single source of truth** – one repository
2. **No runtime Node.js in production** – Node is CI‑only
3. **Deterministic builds** – esbuild only
4. **Strict separation of concerns**
   - JavaScript: wallet + dApp logic
   - PHP: WordPress glue, configuration, rendering
5. **WordPress only receives compiled assets**

---

## Repository Structure

```
metamask-wp-dapp/
├─ src/                    # JavaScript source (ESM)
│  ├─ wallet/
│  │  └─ metamask.js       # MetaMask SDK integration
│  ├─ ui/
│  │  └─ index.js          # UI wiring (DOM‑agnostic)
│  └─ index.js             # Single public entrypoint
│
├─ plugin/
│  ├─ metamask-dapp.php    # WordPress plugin bootstrap
│  ├─ assets/              # Built assets injected by CI
│  └─ readme.txt
│
├─ dist/                   # Local build output (gitignored)
├─ reference-only/         # Reference materials only (not for direct use)
│
├─ .github/workflows/
│  └─ wpcom.yml            # Build + package + deploy workflow
│
├─ esbuild.config.mjs
├─ package.json
├─ package-lock.json
├─ .gitignore
└─ README.md
```

---

## JavaScript Architecture

### Rules

- Use **@metamask/sdk** directly
- Use **ethers.js** only for provider/signer abstraction
- No WordPress‑specific code in JavaScript
- No DOM assumptions beyond a single mount element
- No runtime environment variables

### Public API Contract

The JavaScript bundle must expose **one and only one** public initializer:

```js
export function initMetaMaskDapp(config) {
  // config injected by WordPress
}
```

All future expansion (UI, contracts, state) flows from this initializer.

---

## Build System (esbuild)

- Single bundle
- Browser target
- No dynamic imports
- Deterministic output

**Conceptual build output:**

```js
window.MetaMaskWP.initMetaMaskDapp(...)
```

The build produces:

```
dist/metamask-dapp.js
```

This is the **only JavaScript file** WordPress will ever load.

---

## WordPress Plugin Responsibilities

### PHP Scope (and limits)

The WordPress plugin **does not contain blockchain logic**.

It is responsible only for:

- Registering and enqueueing the compiled JS
- Injecting runtime configuration
- Rendering a mount point
- Providing shortcodes / blocks

### Configuration Injection

All environment‑specific values flow **PHP → JS**:

- Infura API key
- Chain ID
- Contract addresses
- Feature flags

Injected via:

```php
wp_add_inline_script(
  'metamask-dapp',
  'window.METAMASK_DAPP_CONFIG = ' . json_encode($config),
  'before'
);
```

JavaScript **must never** read from `.env` or assume WordPress globals.

---

## GitHub Actions – WordPress.com Deployment Model

### Workflow: `.github/workflows/wpcom.yml`

This workflow is the **only deployment pipeline**.

### Responsibilities

1. Install Node.js
2. `npm ci`
3. `npm run build`
4. Stage WordPress plugin directory
5. Upload artifact **named exactly `wpcom`**

### Artifact Contents

The uploaded artifact must represent **exactly** what should exist at:

```
/wp-content/plugins/metamask-dapp/
```

Example staged structure:

```
wpcom-stage/
└─ metamask-dapp/
   ├─ metamask-dapp.php
   ├─ assets/
   │  └─ metamask-dapp.js
   └─ readme.txt
```

WordPress.com copies this verbatim.

---

## Deployment Target

- Platform: WordPress.com
- Mode: Advanced GitHub Deployment
- Destination directory:

```
/wp-content/plugins/metamask-dapp
```

Plugin activation and updates are handled entirely by WordPress.

---

## Codex Rules (for contributors and AI agents)

- Do not introduce Node dependencies into PHP
- Do not reference WordPress globals in JS
- Do not commit build output (`dist/`) unless explicitly required
- Do not add alternative deployment workflows
- Do not add Pages, PM2, or server‑side assumptions

This repository is **WordPress‑first, dApp‑capable by design**.

---

## Reference-Only Materials

Files in the `reference-only/` folder exist solely to aid development of the plugin and shortcodes. They are **not** meant to be used as-is in production code or copied directly into the implementation.

---

## Evolution Path (Intentional)

This baseline supports incremental expansion without architectural change:

1. Shortcode‑based widgets
2. Gutenberg blocks
3. Shared wallet session state
4. Contract interaction layers
5. Multi‑page embedded dApp UX

All without changing:

- the build system
- the deployment model
- the MetaMask integration contract

---

## Status

This repository is the **reset point**.

Anything not aligned with this document is considered legacy or experimental and should not be merged without explicit justification.
