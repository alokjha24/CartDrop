import { Toaster } from "sonner";
import "./globals.css";

export const metadata = {
  title: "CartDrop | Smart Price Tracking",
  description: "Track product prices and discover the right time to buy.",
  icons: {
    icon: "/logoCD.png",
    shortcut: "/logoCD.png",
    apple: "/logoCD.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Toaster richColors/>
      </body>
    </html>
  );
}