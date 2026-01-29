import { useState } from 'react';
import type { CreateTodoDto, Priority } from '../types/todo';
import { todoService } from '../services/api';

interface TodoFormProps {
  onTodoCreated: () => void;
}

export const TodoForm = ({ onTodoCreated }: TodoFormProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Title is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const newTodo: CreateTodoDto = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };
      await todoService.createTodo(newTodo);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDueDate('');
      setTags([]);
      setTagInput('');
      onTodoCreated();
    } catch (error) {
      console.error('Failed to create todo:', error);
      alert('Failed to create todo');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="todo-form">
      <h2>Add New Todo</h2>
      
      <div className="form-group">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Todo title *"
          className="todo-input"
          disabled={isSubmitting}
          required
        />
      </div>
      
      <div className="form-group">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="todo-textarea"
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="todo-select"
            disabled={isSubmitting}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="dueDate">Due Date</label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="todo-input"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="tags">Tags</label>
        <div className="tag-input-container">
          <input
            id="tags"
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
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="btn btn-secondary btn-small"
            disabled={isSubmitting || !tagInput.trim()}
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
                  disabled={isSubmitting}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !title.trim()}
        className="btn btn-primary btn-large"
      >
        {isSubmitting ? 'Adding...' : 'Add Todo'}
      </button>
    </form>
  );
};
