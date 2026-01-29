import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Todo } from '../types/todo';
import { todoService } from '../services/api';
import { ROUTES } from '../config/routes';

export const TodoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [todo, setTodo] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id) {
      fetchTodo();
    }
  }, [id]);

  const fetchTodo = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await todoService.getTodoById(id);
      setTodo(data);
      setTitle(data.title);
      setDescription(data.description || '');
    } catch (err) {
      setError('Failed to load todo. It may not exist.');
      console.error('Error fetching todo:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async () => {
    if (!todo) return;

    try {
      const updatedTodo = await todoService.updateTodo(todo._id, {
        completed: !todo.completed,
      });
      setTodo(updatedTodo);
    } catch (error) {
      console.error('Failed to update todo:', error);
      alert('Failed to update todo');
    }
  };

  const handleSave = async () => {
    if (!todo || !title.trim()) {
      alert('Title is required');
      return;
    }

    try {
      setIsSaving(true);
      const updatedTodo = await todoService.updateTodo(todo._id, {
        title: title.trim(),
        description: description.trim(),
      });
      setTodo(updatedTodo);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update todo:', error);
      alert('Failed to update todo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!todo) return;

    if (!confirm('Are you sure you want to delete this todo?')) {
      return;
    }

    try {
      await todoService.deleteTodo(todo._id);
      navigate(ROUTES.HOME);
    } catch (error) {
      console.error('Failed to delete todo:', error);
      alert('Failed to delete todo');
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="container">
          <div className="loading">Loading todo...</div>
        </div>
      </div>
    );
  }

  if (error || !todo) {
    return (
      <div className="app">
        <div className="container">
          <div className="error-message">
            <p>{error || 'Todo not found'}</p>
            <Link to={ROUTES.HOME} className="btn btn-secondary">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <div className="todo-detail">
          <Link to={ROUTES.HOME} className="back-link">
            ← Back to Todo List
          </Link>

          <div className="todo-detail-content">
            {isEditing ? (
              <div className="todo-edit-form">
                <h2>Edit Todo</h2>
                <div className="form-group">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Todo title"
                    className="todo-input"
                    disabled={isSaving}
                  />
                </div>
                <div className="form-group">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="todo-textarea"
                    disabled={isSaving}
                    rows={5}
                  />
                </div>
                <div className="todo-actions">
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !title.trim()}
                    className="btn btn-primary"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setTitle(todo.title);
                      setDescription(todo.description || '');
                    }}
                    disabled={isSaving}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="todo-detail-header">
                  <div className="todo-checkbox-container">
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={handleToggleComplete}
                      className="todo-checkbox large"
                    />
                    <h1 className={todo.completed ? 'strikethrough' : ''}>
                      {todo.title}
                    </h1>
                  </div>
                  <div className="todo-actions">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="btn btn-edit"
                    >
                      Edit
                    </button>
                    <button onClick={handleDelete} className="btn btn-delete">
                      Delete
                    </button>
                  </div>
                </div>

                {todo.description && (
                  <div className="todo-description">
                    <h3>Description</h3>
                    <p className={todo.completed ? 'strikethrough' : ''}>
                      {todo.description}
                    </p>
                  </div>
                )}

                <div className="todo-meta">
                  <p>
                    <strong>Status:</strong>{' '}
                    <span className={todo.completed ? 'completed-badge' : 'pending-badge'}>
                      {todo.completed ? 'Completed' : 'Pending'}
                    </span>
                  </p>
                  <p>
                    <strong>Priority:</strong>{' '}
                    <span className={`priority-badge priority-${todo.priority || 'medium'}`}>
                      {(todo.priority || 'medium').toUpperCase()}
                    </span>
                  </p>
                  {todo.dueDate && (
                    <p>
                      <strong>Due Date:</strong>{' '}
                      <span className={`due-date ${
                        !todo.completed && new Date(todo.dueDate) < new Date() 
                          ? 'overdue' 
                          : new Date(todo.dueDate).toDateString() === new Date().toDateString()
                          ? 'due-today'
                          : ''
                      }`}>
                        {new Date(todo.dueDate).toLocaleDateString()}
                        {!todo.completed && new Date(todo.dueDate) < new Date() && ' ⚠️ Overdue'}
                        {!todo.completed && new Date(todo.dueDate).toDateString() === new Date().toDateString() && ' 📅 Due Today'}
                      </span>
                    </p>
                  )}
                  {todo.tags && todo.tags.length > 0 && (
                    <p>
                      <strong>Tags:</strong>
                      <div className="tags-container" style={{ marginTop: '0.5rem' }}>
                        {todo.tags.map(tag => (
                          <span key={tag} className="tag tag-readonly">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </p>
                  )}
                  <p>
                    <strong>Created:</strong>{' '}
                    {new Date(todo.createdAt).toLocaleString()}
                  </p>
                  <p>
                    <strong>Last Updated:</strong>{' '}
                    {new Date(todo.updatedAt).toLocaleString()}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
