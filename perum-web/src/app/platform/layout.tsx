"use client";

import { ToastProvider } from "@/context/ToastContext";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
