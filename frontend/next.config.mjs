/** @type {import('next').NextConfig} */
const nextConfig = {
	allowedDevOrigins: ['192.168.110.28'],
	async rewrites() {
		return [
			{
				source: "/api/:path*",
				destination: "http://localhost:8000/api/:path*",
			},
			{
				source: "/sanctum/:path*",
				destination: "http://localhost:8000/sanctum/:path*",
			},
			{
				source: "/up",
				destination: "http://localhost:8000/up",
			},
		];
	},
};

export default nextConfig;
