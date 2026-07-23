/** @type {import('next').NextConfig} */

// Backend origin — override via BACKEND_URL env var on each deployment.
// These rewrites are server-side, so the browser only ever sees this app's own
// origin, which keeps the Sanctum session cookie same-origin and means no CORS
// or SameSite=None configuration is needed.
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

// Biometric (ZKTeco ADMS) pushes are proxied to a DIFFERENT worker than user
// traffic. `php artisan serve` handles one request at a time, so isolating the
// devices means a burst of punches can't block the UI, and vice versa.
// This app serves port 80 directly (Caddy is blocked by Windows Smart App
// Control), so /iclock must be proxied here or the devices have nowhere to post.
const DEVICE_BACKEND = process.env.DEVICE_BACKEND_URL ?? "http://localhost:8001";

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
			{
				source: "/iclock/:path*",
				destination: `${DEVICE_BACKEND}/iclock/:path*`,
			},
		];
	},
};

export default nextConfig;
