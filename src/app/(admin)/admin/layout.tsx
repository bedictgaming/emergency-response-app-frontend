import type { ReactNode } from "react";
import AdminAccessBoundary from "../../../components/auth/AdminAccessBoundary";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAccessBoundary>{children}</AdminAccessBoundary>;
}
