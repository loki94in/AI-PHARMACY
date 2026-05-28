import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node18',
  external: ['@aws-sdk/client-s3'],
});
