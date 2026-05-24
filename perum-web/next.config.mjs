import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    typescript: {
        ignoreBuildErrors: false,
    },
    // Proxy API requests to FastAPI backend
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://localhost:3000/api/:path*',
            },
            {
                source: '/ws/:path*',
                destination: 'http://localhost:3000/ws/:path*',
            },
            {
                source: '/static/img/:path*',
                destination: 'http://localhost:3000/static/img/:path*',
            },
        ];
    },
};

const finalConfig = process.env.NODE_ENV === 'development' 
    ? nextConfig 
    : withSentryConfig(nextConfig, {
        silent: true,
        disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
        disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
    });

export default finalConfig;