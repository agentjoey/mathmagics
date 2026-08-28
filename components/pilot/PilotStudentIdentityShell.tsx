'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mathmagics.pilot.studentId';

type StudentIdentity = { displayName: string; levelId: 'P2' | 'P3' };

type IdentityStyle = CSSProperties & { '--pilot-student-label'?: string };

function initialStudentId(): string {
  return typeof window === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY) ?? '';
}

function cssContent(value: string): string {
  return `"${value.replaceAll('\\', '').replaceAll('"', '')}"`;
}

export function PilotStudentIdentityShell({ children }: { children: ReactNode }) {
  const [studentId] = useState(initialStudentId);
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);

  useEffect(() => {
    if (!studentId) return;
    const controller = new AbortController();
    void fetch(`/api/pilot/student?studentId=${encodeURIComponent(studentId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() as Promise<StudentIdentity> : null)
      .then((value) => {
        if (value) setIdentity(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [studentId]);

  const style: IdentityStyle = identity
    ? { '--pilot-student-label': cssContent(`${identity.displayName} · ${identity.levelId}`) }
    : {};

  return <div className={identity ? 'pilot-student-profile-shell has-profile' : 'pilot-student-profile-shell'} style={style}>{children}</div>;
}
