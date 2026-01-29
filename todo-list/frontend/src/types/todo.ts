export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Todo {
  _id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: Priority;
  dueDate?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoDto {
  title: string;
  description?: string;
  completed?: boolean;
  priority?: Priority;
  dueDate?: string;
  tags?: string[];
}

export interface UpdateTodoDto {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: Priority;
  dueDate?: string;
  tags?: string[];
}
