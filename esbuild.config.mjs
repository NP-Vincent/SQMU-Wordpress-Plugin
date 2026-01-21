import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'dist/metamask-dapp.js',
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  globalName: 'MetaMaskWP',
  external: ['react', 'react-dom'],
  sourcemap: true,
  minify: false
});
