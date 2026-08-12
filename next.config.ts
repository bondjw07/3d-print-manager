import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow hot reload when accessing this local dev server from the LAN device
  // currently used to manage the app. This only affects `next dev`.
  allowedDevOrigins: ["192.168.1.65"],
};

export default nextConfig;
