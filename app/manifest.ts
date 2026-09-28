import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Emergency Response App',
    short_name: 'Emergency Response',
    description: 'Community-based emergency reporting and response coordination for Cordova, Cebu.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#db0000',
    categories: ['medical', 'public-safety', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Report an Emergency',
        short_name: 'Report',
        description: 'Open the citizen emergency-reporting dashboard.',
        url: '/dashboard',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
