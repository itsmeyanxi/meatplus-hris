/** @type {import('next').NextConfig} */

// Backend origin — override via BACKEND_URL env var on each deployment.
// These rewrites are server-side, so the browser only ever sees this app's own
// origin, which keeps the Sanctum session cookie same-origin and means no CORS
// or SameSite=None configuration is needed.
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig = {
	// Wildcards cover any private-LAN address, so the dev server keeps working
	// when DHCP hands this machine a new IP or a different subnet.
	allowedDevOrigins: ['192.168.*.*', '10.*.*.*', 'allcompanyhris.meatplus.ph'],
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
