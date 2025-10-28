/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-702243dedd784ac6b0c85c8bf53f461e.r2.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'pub-782243dedd784cb60c5cbf53f4cfe.r2.dev',
        pathname: '/**',
      },
    ],
    unoptimized: false,
  },
  env: {
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook',
  },
}

module.exports = nextConfig