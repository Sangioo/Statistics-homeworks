# Cryptography Homeworks

A small static website in English for two Ethereum cryptography assignments.

- `index.html` links to both pages.
- `homework-1.html` explains and calculates private key → public point on the toy curve y² = x³ + 7 (mod 17). `script.js` handles point addition, the selectable private key, a step-by-step SVG point graph, the full point table, and basic statistics.
- `homework-2.html` explains the mnemonic → Ethereum address pipeline, its standards, statistical properties, and history.
- `style.css` is shared by all pages.

Open `index.html` in a browser. No build step or package installation is required. All links and assets use relative paths, so the site can be published from the repository root with GitHub Pages (Settings → Pages → Deploy from a branch → `main` → `/(root)`).

The toy curve and the public wallet example are for learning only. They do not create safe wallets or keys.
