import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // Las Server Actions reciben formularios pequeños; el default (1mb) sobra.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default nextConfig;
