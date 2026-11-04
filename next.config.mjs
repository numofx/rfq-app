/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        // The old hostname, kept for bookmarks and links in emails already sent.
        source: "/:path*",
        has: [{ type: "host", value: "portal.numofx.com" }],
        destination: "https://command.numofx.com/:path*",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    // The login form lives at /; numofx.com links here.
    return [{ source: "/login", destination: "/" }];
  },
  webpack: (config, { isServer }) => {
    // Fix for WalletConnect and other web3 libraries
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Suppress optional dependency warnings
    config.ignoreWarnings = [
      { module: /node_modules\/@metamask\/sdk/ },
      { module: /node_modules\/pino/ },
    ];

    return config;
  },
}

export default nextConfig