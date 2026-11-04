import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "People",
  description: "Your network: who to message today and how everyone connects.",
  robots: { index: false, follow: false },
};

// Set the theme before first paint so the page does not flash.
const themeScript = `try{var t=localStorage.getItem("pd-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
