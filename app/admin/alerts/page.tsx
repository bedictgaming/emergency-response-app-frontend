"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminAlertsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/barangay-history");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-xs">
      Redirecting to Barangay Incident History Log...
    </div>
  );
}
