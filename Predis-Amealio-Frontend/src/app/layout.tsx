import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: "Amealio - AI Social Media Management",
  description: "AI-powered social media management platform for businesses and creators",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Amealio",
  },
  icons: {
    icon: '/icon-192x192.svg',
    apple: '/icon-192x192.svg',
  },
};

export const viewport: Viewport = {
  themeColor: "#40299B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon-192x192.svg" />
        <link rel="apple-touch-icon" href="/icon-192x192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className="font-sans antialiased"
        style={{
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        <AuthProvider>
          {children}
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
