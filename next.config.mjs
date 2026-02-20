/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  // When GITHUB_PAGES=true, produce a fully-static export suitable for
  // GitHub Pages (https://jsr1151.github.io/triviaparty/).
  // Local development is unaffected.
  ...(isGitHubPages && {
    output: 'export',
    basePath: '/triviaparty',
    trailingSlash: true,
  }),
  images: {
    // Required for next/image in static exports (no image optimisation server).
    unoptimized: true,
  },
  // Expose the basePath to client-side code so static JSON files can be
  // fetched with the correct path prefix on GitHub Pages.
  env: {
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? '/triviaparty' : '',
  },
};

export default nextConfig;
