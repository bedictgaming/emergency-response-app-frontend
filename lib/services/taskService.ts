import apiClient from '@/lib/apiClient';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export interface ResponseTask {
  taskId: string;
  taskName: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: TaskStatus;
  dueAt?: string;
  incident: { incidentId: string; title: string; severityLevel: string; status: string };
  assignee?: { user?: { id: string; name: string; email: string } };
}

export async function getTasks(): Promise<ResponseTask[]> {
  const response = await apiClient.get<{ data: { tasks: ResponseTask[] } }>('/tasks/v1/');
  return response.data.data.tasks;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<ResponseTask> {
  const response = await apiClient.put<{ data: { task: ResponseTask } }>(`/tasks/v1/${taskId}`, { status });
  return response.data.data.task;
}
