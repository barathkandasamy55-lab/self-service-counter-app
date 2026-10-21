import type { NextConfig } from 'next';

// The browser only ever talks to this Next server; /api/* is proxied to the NestJS backend.
// Rewrites are resolved at build time, so in Docker BACKEND_URL is passed as a build arg.
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/:path*` }];
  },
};

export default nextConfig;
