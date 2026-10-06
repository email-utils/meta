import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  basePath: '/meta',
  reactStrictMode: true,
  // Twoslash runs the TypeScript compiler; bundling it breaks it.
  serverExternalPackages: ['typescript'],
  // docs/ has its own lockfile inside meta's, so name the root rather than
  // let Next.js guess it.
  turbopack: { root: import.meta.dirname },
};

export default withMDX(config);
