import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  description:
    "A rights-aware creative operations workspace with server-authoritative publishing.",
  title: "RightsOps — Campaign Authority",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
