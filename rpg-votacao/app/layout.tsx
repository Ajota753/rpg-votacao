import React from "react";
import "./globals.css";
import OnlineStatus from "@/components/OnlineStatus";

export const metadata = {
  title: "Votação RPG",
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="pt-br">
      <body className="bg-gray-900">
        <OnlineStatus />
        {children}
      </body>
    </html>
  );
}


