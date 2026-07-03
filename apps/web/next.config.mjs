/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@renaisslens/db', '@renaisslens/ev-engine'],
  experimental: {
    // load-bearing: without this, webpack tries to bundle better-sqlite3's
    // native .node binary and the build fails
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
