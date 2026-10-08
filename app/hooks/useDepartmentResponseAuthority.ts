"use client";

import { useEffect, useState } from 'react';
import { getMe } from '@/lib/services/authService';
import type { ResponseService } from '@/lib/services/incidentService';

// Presentation only: the response API independently enforces ownership.
// Do not use localStorage or the viewed dashboard as authority to resolve.
export function useDepartmentResponseAuthority(service: ResponseService, authorized: boolean) {
  const [canResolve, setCanResolve] = useState(false);
  useEffect(() => {
    let active = true;
    if (!authorized) return;
    void getMe().then(user => {
      if (active) setCanResolve(['ADMIN', 'DISPATCHER'].includes(user.role)
        && user.department === (service === 'HAZARD' ? 'DRRMO' : service)
        && user.isMainAdmin !== true);
    }).catch(() => { if (active) setCanResolve(false); });
    return () => { active = false; };
  }, [authorized, service]);
  return authorized && canResolve;
}
