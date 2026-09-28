'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, LogOut, ShieldAlert } from 'lucide-react';
import { getMe, logout } from '@/lib/services/authService';
import { getTasks, ResponseTask, TaskStatus, updateTaskStatus } from '@/lib/services/taskService';
import { useEmergencyEvents } from '@/app/hooks/useEmergencyEvents';
import { registerWebPush, unregisterWebPush } from '@/lib/browserPush';
import { isDefinitiveAuthFailure, markSessionEnded } from '@/lib/apiClient';
import { Button } from '@/app/component/ui/button';

export default function ResponderTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ResponseTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await getTasks());
      setError('');
    } catch {
      setError('Unable to load assigned tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getMe().then((user) => {
      if (user.role !== 'RESPONDER') return router.replace('/');
      localStorage.setItem('user', JSON.stringify(user));
      void registerWebPush().catch(() => undefined);
      return loadTasks();
    }).catch((error) => {
      if (isDefinitiveAuthFailure(error)) router.replace('/');
      else {
        try {
          const cached = JSON.parse(localStorage.getItem('user') || 'null');
          if (cached?.role === 'RESPONDER') void loadTasks();
        } catch {}
      }
    });
  }, [loadTasks, router]);
  useEffect(() => {
    const handleSessionChange = (event: StorageEvent) => {
      if (event.key === 'emergency-logout-epoch' && event.newValue) {
        setTasks([]);
        router.replace('/');
      }
    };
    window.addEventListener('storage', handleSessionChange);
    return () => window.removeEventListener('storage', handleSessionChange);
  }, [router]);
  useEmergencyEvents(loadTasks, !loading);

  const advance = async (task: ResponseTask) => {
    const next: TaskStatus | null = task.status === 'PENDING' ? 'IN_PROGRESS' : task.status === 'IN_PROGRESS' ? 'DONE' : null;
    if (!next || updatingTaskId) return;
    setUpdatingTaskId(task.taskId);
    try {
      const updated = await updateTaskStatus(task.taskId, next);
      setTasks((current) => current.map((item) => item.taskId === task.taskId ? updated : item));
      setError('');
    } catch {
      setError('The task status could not be updated. Refresh and try again.');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const signOut = async () => {
    try {
      await unregisterWebPush().catch(() => undefined);
      await logout();
    } finally {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      markSessionEnded();
      router.replace('/');
    }
  };

  return (
    <main className="figma-shell min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between rounded-3xl border border-white/80 bg-white/85 p-5 shadow-xl shadow-indigo-950/5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20"><ShieldAlert size={25} /></div>
            <div>
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">Field response</div>
            <h1 className="mt-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-2xl font-extrabold text-transparent">My assigned tasks</h1>
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-700 hover:shadow-md"><LogOut size={14} /> Sign out</button>
        </header>

        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <p className="text-sm text-slate-500">Loading assignments…</p> : tasks.length === 0 ? (
          <section className="rounded-3xl border border-white/80 bg-white/90 p-12 text-center text-slate-500 shadow-xl shadow-indigo-950/5 backdrop-blur-xl">No tasks are currently assigned to you.</section>
        ) : (
          <div className="grid gap-4">
            {tasks.map((task) => (
              <article key={task.taskId} className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-indigo-950/5 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-rose-600">{task.priority} · {task.incident.severityLevel}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-950">{task.taskName}</h2>
                    <p className="text-sm font-medium text-slate-600">{task.incident.title}</p>
                    {task.description && <p className="mt-2 text-sm text-slate-600">{task.description}</p>}
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{task.status.replace('_', ' ')}</span>
                </div>
                {task.status !== 'DONE' && (
                  <Button
                    type="button"
                    onClick={() => advance(task)}
                    loading={updatingTaskId === task.taskId}
                    loadingText={task.status === 'PENDING' ? 'Starting task…' : 'Completing task…'}
                    disabled={updatingTaskId !== null}
                    className="mt-4 w-full rounded-xl sm:w-auto"
                  >
                    {task.status === 'PENDING' ? <Clock3 size={16} /> : <CheckCircle2 size={16} />}
                    {task.status === 'PENDING' ? 'Start task' : 'Mark done'}
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
