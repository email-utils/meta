import { isBuiltin } from 'node:module';
import { defineConfig } from 'vite';

// A library build keeps every export, so nothing is tree-shaken away before
// it's checked. Vite would otherwise stub a Node built-in with a warning and
// build anyway, so the plugin turns any import of one into an error.
export default defineConfig({
  logLevel: 'warn',
  build: {
    lib: { entry: 'consumer.js', formats: ['es'] },
    minify: false,
  },
  plugins: [
    {
      name: 'no-node-builtins',
      enforce: 'pre',
      resolveId(source, importer) {
        if (isBuiltin(source)) {
          this.error(
            `${importer ?? 'The entry'} imports ${source}, a Node built-in.`,
          );
        }
        return null;
      },
    },
  ],
});
