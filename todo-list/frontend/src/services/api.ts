import axios from 'axios';
import type { Todo, CreateTodoDto, UpdateTodoDto } from '../types/todo';

const API_BASE_URL = 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const todoService = {
  // Get all todos
  getAllTodos: async (): Promise<Todo[]> => {
    const response = await api.get<Todo[]>('/todos');
    return response.data;
  },

  // Get a single todo by ID
  getTodoById: async (id: string): Promise<Todo> => {
    const response = await api.get<Todo>(`/todos/${id}`);
    return response.data;
  },

  // Create a new todo
  createTodo: async (todo: CreateTodoDto): Promise<Todo> => {
    const response = await api.post<Todo>('/todos', todo);
    return response.data;
  },

  // Update a todo
  updateTodo: async (id: string, todo: UpdateTodoDto): Promise<Todo> => {
    const response = await api.put<Todo>(`/todos/${id}`, todo);
    return response.data;
  },

  // Delete a todo
  deleteTodo: async (id: string): Promise<void> => {
    await api.delete(`/todos/${id}`);
  },
};
