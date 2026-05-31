import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@uiw/react-md-editor', '@uiw/react-markdown-preview', '@happitime/venue-qr'],
};

export default nextConfig;
