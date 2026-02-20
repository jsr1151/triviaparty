/** @type {import('next').NextConfig} */
const nextConfig = {
  // When GITHUB_PAGES=true, produce a fully-static export suitable for
  // GitHub Pages (https://jsr1151.github.io/triviaparty/).
  // Local development is unaffected.
  ...(process.env.GITHUB_PAGES === 'true' && {
    output: 'export',
    basePath: '/triviaparty',
    trailingSlash: true,
  }),
  images: {
    // Required for next/image in static exports (no image optimisation server).
    unoptimized: true,
  },
};

export default nextConfig;
