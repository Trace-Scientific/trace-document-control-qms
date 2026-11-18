import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  images: { unoptimized: true },
};

export default nextConfig;
