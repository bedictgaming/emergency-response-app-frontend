'use client';

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/apiClient';
import { useAdminGuard } from '@/app/hooks/useAdminGuard';

type Row = Record<string, unknown>;
type Choice = { value: string; label: string };
type Field = { name: string; label: string; required?: boolean; type?: string; options?: Choice[]; createOnly?: boolean };
type Section = { key: string; title: string; id: string; label: string; fields: Field[] };
const choices = (values: string[]): Choice[] => values.map(value => ({ value, label: value.replaceAll('_', ' ') }));
const text = (row: Row, key: string) => String(row[key] ?? '');
const nested = (row: Row, key: string): Row => (row[key] || {}) as Row;
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
function message(error: unknown): string {
  const data = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } }).response?.data;
  return data?.errors?.map(item => item.message).join('; ') || data?.message || 'Unable to save. Check your connection and try again.';
}

export default function OperationsPage() {
  const authorized = useAdminGuard();
  const [role, setRole] = useState('');
  const [records, setRecords] = useState<Record<string, Row[]>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ key: string; row?: Row } | null>(null);
  const [deleting, setDeleting] = useState<{ key: string; row: Row } | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!authorized) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setRole(user.role);
    const keys = ['units', 'resources', 'responders', 'tasks', 'incidents', ...(user.role === 'ADMIN' ? ['users'] : [])];
    try {
      const rows = await Promise.all(keys.map(async key => {
        const response = await apiClient.get<{ data: Record<string, Row[]> }>(`/${key}/v1/`);
        return [key, response.data.data[key] || []] as const;
      }));
      setRecords(Object.fromEntries(rows));
      setError('');
    } catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }, [authorized]);
  useEffect(() => { void load(); }, [load]);

  const unitOptions = (records.units || []).map(row => ({ value: text(row, 'unitId'), label: text(row, 'unitName') }));
  const responderOptions = (records.responders || []).map(row => ({ value: text(row, 'responderId'), label: text(nested(row, 'user'), 'name') || text(nested(row, 'user'), 'email') }));
  const incidentOptions = (records.incidents || []).filter(row => row.verificationStatus === 'VERIFIED' && !['CLOSED', 'RESOLVED'].includes(text(row, 'status'))).map(row => ({ value: text(row, 'incidentId'), label: text(row, 'title') }));
  const userOptions = (records.users || []).filter(row => row.role === 'RESPONDER' && row.status === 'ACTIVE' && !row.responder).map(row => ({ value: text(row, 'id'), label: text(row, 'name') || text(row, 'email') }));
  const sections: Section[] = [
    { key: 'units', title: 'Units', id: 'unitId', label: 'unitName', fields: [
      { name: 'unitName', label: 'Unit name', required: true }, { name: 'unitType', label: 'Unit type', required: true },
      { name: 'status', label: 'Status', options: choices(['AVAILABLE', 'DEPLOYED', 'OUT_OF_SERVICE']), required: true },
    ] },
    { key: 'resources', title: 'Resources', id: 'resourceId', label: 'resourceName', fields: [
      { name: 'resourceName', label: 'Resource name', required: true }, { name: 'resourceType', label: 'Resource type', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'unitId', label: 'Unit', options: unitOptions, required: true },
      { name: 'status', label: 'Status', options: choices(['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'DEPLETED']), required: true },
    ] },
    { key: 'responders', title: 'Responders', id: 'responderId', label: 'rank', fields: [
      { name: 'userId', label: 'Responder account', options: userOptions, required: true, createOnly: true },
      { name: 'unitId', label: 'Unit', options: unitOptions, required: true },
      { name: 'rank', label: 'Rank' }, { name: 'certifications', label: 'Certifications' },
      { name: 'status', label: 'Status', options: choices(['AVAILABLE', 'DEPLOYED', 'OFF_DUTY']), required: true },
    ] },
    { key: 'tasks', title: 'Incident tasks', id: 'taskId', label: 'taskName', fields: [
      { name: 'incidentId', label: 'Verified incident', options: incidentOptions, required: true, createOnly: true },
      { name: 'taskName', label: 'Task name', required: true }, { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'assignedTo', label: 'Assigned responder', options: responderOptions },
      { name: 'priority', label: 'Priority', options: choices(['LOW', 'MEDIUM', 'HIGH']), required: true },
      { name: 'dueAt', label: 'Due date and time', type: 'datetime-local' },
    ] },
  ];
  const active = sections.find(section => section.key === editor?.key);
  const canEdit = (key: string) => role === 'ADMIN' || key === 'tasks' || key === 'units';
  const canDelete = (key: string) => role === 'ADMIN' || key === 'tasks';
  const rowLabel = (section: Section, row: Row) => section.key === 'responders' ? text(nested(row, 'user'), 'name') || text(nested(row, 'user'), 'email') : text(row, section.label);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !editor) return;
    const form = new FormData(event.currentTarget);
    const payload: Row = {};
    for (const field of active.fields) {
      if (editor.row && field.createOnly) continue;
      const value = String(form.get(field.name) ?? '').trim();
      if (field.type === 'number') payload[field.name] = Number(value);
      else if (field.type === 'datetime-local') {
        if (value) payload[field.name] = new Date(value).toISOString();
        else if (editor.row) payload[field.name] = null;
      } else if (field.name === 'assignedTo' && !value) {
        if (editor.row) payload[field.name] = null;
      } else if (value || !field.options) payload[field.name] = value;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      if (editor.row) await apiClient.put(`/${active.key}/v1/${text(editor.row, active.id)}`, payload);
      else {
        const path = active.key === 'tasks' ? `/incidents/v1/${payload.incidentId}/tasks` : `/${active.key}/v1/`;
        delete payload.incidentId;
        await apiClient.post(path, payload);
      }
      setEditor(null); await load(); setNotice('Saved successfully.');
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    const section = sections.find(item => item.key === deleting.key)!;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiClient.delete(`/${section.key}/v1/${text(deleting.row, section.id)}`);
      setDeleting(null); await load(); setNotice('Record deleted.');
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function advance(row: Row) {
    const next = row.status === 'PENDING' ? 'IN_PROGRESS' : 'DONE';
    setBusy(true); setError('');
    try { await apiClient.put(`/tasks/v1/${row.taskId}`, { status: next }); await load(); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }

  if (!authorized) return null;
  return <main className="figma-shell min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Emergency response</p><h1 className="text-2xl font-bold">Operations management</h1><p className="text-sm text-slate-600">Maintain teams and equipment, then assign tasks to verified incidents.</p></div>
        <Link href="/admin/main-dashboard" className="inline-flex min-h-11 items-center rounded-lg border bg-white px-4 py-2 text-sm">Back to dashboard</Link>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
      <div className="flex gap-3"><input aria-label="Search records" placeholder="Search records" value={search} onChange={event => setSearch(event.target.value)} className={`${inputClass} min-w-0 flex-1`}/><button disabled={busy} onClick={() => void load()} className="shrink-0 whitespace-nowrap rounded-lg border bg-white px-4">Refresh</button></div>
      {loading && <LoadingPlaceholder label="Loading operational records…" layout="panel" />}
      {sections.map(section => <section key={section.key} aria-label={section.title} className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{section.title}</h2>{canEdit(section.key) && <button disabled={busy} onClick={() => { setEditor({ key: section.key }); setDeleting(null); setError(''); }} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Add {section.title.toLowerCase()}</button>}</div>
        {!loading && !(records[section.key] || []).length && <p className="text-sm text-slate-500">No records yet.</p>}
        <ul className="divide-y">{(records[section.key] || []).filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())).map(row => <li key={text(row, section.id)} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1 basis-48"><h3 className="font-semibold">{rowLabel(section, row)}</h3><p className="text-sm text-slate-600">{text(row, 'status').replaceAll('_', ' ')}{row.quantity !== undefined && ` · Quantity: ${row.quantity}`}{row.unit ? ` · ${text(nested(row, 'unit'), 'unitName')}` : ''}{row.incident ? ` · ${text(nested(row, 'incident'), 'title')}` : ''}</p>{row.description ? <p className="text-sm text-slate-500">{text(row, 'description')}</p> : null}</div>
          <div className="flex flex-wrap gap-2">{section.key === 'tasks' && row.status !== 'DONE' && <button disabled={busy} onClick={() => void advance(row)} className="rounded-lg border px-3 py-2 text-sm">{row.status === 'PENDING' ? 'Start task' : 'Mark done'}</button>}{canEdit(section.key) && <button disabled={busy} aria-label={`Edit ${rowLabel(section, row)}`} onClick={() => { setEditor({ key: section.key, row }); setDeleting(null); setError(''); }} className="rounded-lg border px-3 py-2 text-sm">Edit</button>}{canDelete(section.key) && <button disabled={busy} aria-label={`Delete ${rowLabel(section, row)}`} onClick={() => { setDeleting({ key: section.key, row }); setEditor(null); }} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">Delete</button>}</div>
        </li>)}</ul>
      </section>)}
      {active && editor && <section aria-label="Record editor" className="rounded-xl border-2 border-blue-300 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">{editor.row ? 'Edit' : 'Add'} {active.title.toLowerCase()}</h2>
        <form key={active.key + (editor.row ? text(editor.row, active.id) : 'new')} onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {active.fields.filter(field => !(editor.row && field.createOnly)).map(field => {
            let value = editor.row ? text(editor.row, field.name) : '';
            if (editor.row && field.name === 'unitId') value ||= text(nested(editor.row, 'unit'), 'unitId');
            if (value && field.type === 'datetime-local') { const date = new Date(value); value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
            return <label key={field.name} className="min-w-0 space-y-1 text-sm font-medium">{field.label}
              {field.options ? <select aria-label={field.label} name={field.name} defaultValue={value} required={field.required} className={inputClass}><option value="">{field.required ? 'Choose…' : 'Unassigned'}</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea name={field.name} defaultValue={value} className={inputClass}/> : <input name={field.name} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 1 : undefined} required={field.required} defaultValue={value} className={inputClass}/>}
            </label>;
          })}
          <div className="flex gap-3 sm:col-span-2"><button disabled={busy} className="rounded-lg bg-blue-700 px-5 py-2 text-white">{busy ? 'Saving…' : 'Save'}</button><button disabled={busy} type="button" onClick={() => setEditor(null)} className="rounded-lg border px-5 py-2">Cancel</button></div>
        </form>
      </section>}
      {deleting && <section aria-label="Confirm deletion" className="rounded-xl border border-red-300 bg-white p-5"><h2 className="font-bold">Delete this record?</h2><p className="mb-4 text-sm">This cannot be undone. Active assignments may prevent deletion.</p><div className="flex gap-3"><button disabled={busy} onClick={() => void remove()} className="rounded-lg bg-red-700 px-4 py-2 text-white">Confirm delete</button><button disabled={busy} onClick={() => setDeleting(null)} className="rounded-lg border px-4 py-2">Cancel</button></div></section>}
    </div>
  </main>;
}
