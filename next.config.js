/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native Node module — exclude it from webpack bundling
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
