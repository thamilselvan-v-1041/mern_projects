import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Todo, Priority } from '../types/todo';
import { todoService } from '../services/api';
import { getTodoDetailRoute } from '../config/routes';

interface TodoItemProps {
  todo: Todo;
  onUpdate: (updatedTodo: Todo, shouldRefetch?: boolean) => void;
  onDelete: () => void;
}

export const TodoItem = ({ todo, onUpdate, onDelete }: TodoItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description || '');
  const [priority, setPriority] = useState<Priority>(todo.priority || 'medium');
  const [dueDate, setDueDate] = useState(todo.dueDate ? todo.dueDate.split('T')[0] : '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(todo.tags || []);
  const [isUpdating, setIsUpdating] = useState(false);

  const isOverdue = todo.dueDate && !todo.completed && new Date(todo.dueDate) < new Date();
  const isDueToday = todo.dueDate && new Date(todo.dueDate).toDateString() === new Date().toDateString();

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleToggleComplete = async () => {
    const newCompletedState = !todo.completed;
    
    // Optimistically update UI immediately without refetching
    const optimisticTodo = { ...todo, completed: newCompletedState };
    onUpdate(optimisticTodo, false);
    
    try {
      setIsUpdating(true);
      const updatedTodo = await todoService.updateTodo(todo._id, { completed: newCompletedState });
      // Update with server response to ensure consistency (still no refetch)
      onUpdate(updatedTodo, false);
    } catch (error) {
      console.error('Failed to update todo:', error);
      // Revert on error
      onUpdate(todo, false);
      alert('Failed to update todo');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Title is required');
      return;
    }

    try {
      setIsUpdating(true);
      const updatedTodo = await todoService.updateTodo(todo._id, {
        title: title.trim(),
        description: description.trim(),
        priority,
        dueDate: dueDate || undefined,
        tags,
      });
      setIsEditing(false);
      // Refetch on edit to ensure all data is synced
      onUpdate(updatedTodo, true);
    } catch (error) {
      console.error('Failed to update todo:', error);
      alert('Failed to update todo');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setTitle(todo.title);
    setDescription(todo.description || '');
    setPriority(todo.priority || 'medium');
    setDueDate(todo.dueDate ? todo.dueDate.split('T')[0] : '');
    setTags(todo.tags || []);
    setTagInput('');
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this todo?')) {
      return;
    }

    try {
      setIsUpdating(true);
      await todoService.deleteTodo(todo._id);
      onDelete();
    } catch (error) {
      console.error('Failed to delete todo:', error);
      alert('Failed to delete todo');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isEditing) {
    return (
      <div className="todo-item editing">
        <div className="todo-edit-form">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Todo title"
            className="todo-input"
            disabled={isUpdating}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="todo-textarea"
            disabled={isUpdating}
          />
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor={`priority-${todo._id}`}>Priority</label>
              <select
                id={`priority-${todo._id}`}
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="todo-select"
                disabled={isUpdating}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor={`dueDate-${todo._id}`}>Due Date</label>
              <input
                id={`dueDate-${todo._id}`}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="todo-input"
                disabled={isUpdating}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor={`tags-${todo._id}`}>Tags</label>
            <div className="tag-input-container">
              <input
                id={`tags-${todo._id}`}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tags (press Enter)"
                className="todo-input"
                disabled={isUpdating}
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn btn-secondary btn-small"
                disabled={isUpdating || !tagInput.trim()}
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="tags-container">
                {tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="tag-remove"
                      disabled={isUpdating}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="todo-actions">
            <button
              onClick={handleSave}
              disabled={isUpdating || !title.trim()}
              className="btn btn-primary"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              disabled={isUpdating}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`todo-item ${todo.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}>
      <div className="todo-content">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={handleToggleComplete}
          disabled={isUpdating}
          className="todo-checkbox"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="todo-text">
          <div className="todo-title-row">
            <Link to={getTodoDetailRoute(todo._id)} className="todo-link">
              <h3 className={todo.completed ? 'strikethrough' : ''}>{todo.title}</h3>
            </Link>
            <span className={`priority-badge priority-${todo.priority || 'medium'}`}>
              {(todo.priority || 'medium').toUpperCase()}
            </span>
          </div>
          
          {todo.description && (
            <p className={todo.completed ? 'strikethrough' : ''}>{todo.description}</p>
          )}
          
          <div className="todo-metadata">
            {todo.dueDate && (
              <span className={`due-date ${isOverdue ? 'overdue' : ''} ${isDueToday ? 'due-today' : ''}`}>
                {isOverdue ? '⚠️ Overdue: ' : isDueToday ? '📅 Due Today: ' : '📅 Due: '}
                {new Date(todo.dueDate).toLocaleDateString()}
              </span>
            )}
            <span className="todo-date">
              Created: {new Date(todo.createdAt).toLocaleDateString()}
            </span>
          </div>

          {todo.tags && todo.tags.length > 0 && (
            <div className="tags-container">
              {todo.tags.map(tag => (
                <span key={tag} className="tag tag-readonly">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="todo-actions">
        <button
          onClick={() => setIsEditing(true)}
          disabled={isUpdating}
          className="btn btn-edit"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={isUpdating}
          className="btn btn-delete"
        >
          Delete
        </button>
      </div>
    </div>
  );
};
