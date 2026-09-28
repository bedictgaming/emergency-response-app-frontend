import type { ReactNode } from "react";
import AdminAccessBoundary from "./AdminAccessBoundary";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAccessBoundary>{children}</AdminAccessBoundary>;
}
