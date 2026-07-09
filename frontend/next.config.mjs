/** @type {import('next').NextConfig} */

// Backend origin — override via BACKEND_URL env var on each deployment
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig = {
	allowedDevOrigins: ['192.168.110.28', 'allcompanyhris.meatplus.ph'],
	async rewrites() {
		return [
			{
				source: "/api/:path*",
				destination: `${BACKEND}/api/:path*`,
			},
			{
				source: "/sanctum/:path*",
				destination: `${BACKEND}/sanctum/:path*`,
			},
			{
				source: "/up",
				destination: `${BACKEND}/up`,
			},
		];
	},
};

export default nextConfig;
