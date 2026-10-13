import type { ReactNode } from "react";
import { privatePageMetadata } from "@/lib/seo";
import AdminAccessBoundary from "../../../components/auth/AdminAccessBoundary";

export const metadata = privatePageMetadata('Administration', 'Restricted emergency-response administration. Authorized staff sign-in is required.');

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAccessBoundary>{children}</AdminAccessBoundary>;
}
