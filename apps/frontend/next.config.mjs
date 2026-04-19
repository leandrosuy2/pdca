/** @type {import('next').NextConfig} */
const internalBase =
  (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
