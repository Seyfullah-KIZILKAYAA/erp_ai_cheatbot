import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '192.168.56.1:3000']
    }
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' http://localhost:8069 http://127.0.0.1:8069",
          },
          {
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM http://localhost:8069',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
