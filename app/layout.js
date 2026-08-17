import { Toaster } from "sonner";
import "./globals.css";

export const metadata = {
  title: "PriceDrop",
  description: "Track product price drops",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster richColors/>
      </body>
    </html>
  );
}