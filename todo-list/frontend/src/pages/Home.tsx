import { useState, useEffect, useMemo } from 'react';
import type { Todo, Priority } from '../types/todo';
import { todoService } from '../services/api';
import { TodoForm } from '../components/TodoForm';
import { TodoItem } from '../components/TodoItem';

type FilterType = 'all' | 'active' | 'completed';
type SortType = 'date' | 'priority' | 'dueDate' | 'title';

export const Home = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('date');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const fetchTodos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await todoService.getAllTodos();
      setTodos(data);
    } catch (err) {
      setError('Failed to load todos. Make sure the backend server is running.');
      console.error('Error fetching todos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodos();
  }, []);

  const handleTodoCreated = () => {
    fetchTodos();
  };

  const handleTodoUpdated = (updatedTodo: Todo, shouldRefetch: boolean = false) => {
    // Optimistically update the local state to prevent scroll jumping
    setTodos((prevTodos) =>
      prevTodos.map((todo) => (todo._id === updatedTodo._id ? updatedTodo : todo))
    );
    // Only refetch if explicitly requested (for edit operations)
    if (shouldRefetch) {
      fetchTodos();
    }
  };

  const handleTodoDeleted = () => {
    fetchTodos();
  };

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    todos.forEach(todo => {
      if (todo.tags) {
        todo.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [todos]);

  // Filter and sort todos
  const filteredAndSortedTodos = useMemo(() => {
    let filtered = [...todos];

    // Filter by status
    if (filter === 'active') {
      filtered = filtered.filter(todo => !todo.completed);
    } else if (filter === 'completed') {
      filtered = filtered.filter(todo => todo.completed);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(todo =>
        todo.title.toLowerCase().includes(query) ||
        (todo.description && todo.description.toLowerCase().includes(query)) ||
        (todo.tags && todo.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    // Filter by tag
    if (selectedTag) {
      filtered = filtered.filter(todo => todo.tags && todo.tags.includes(selectedTag));
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
          return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return filtered;
  }, [todos, filter, searchQuery, selectedTag, sortBy]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    const active = total - completed;
    const highPriority = todos.filter(t => !t.completed && t.priority === 'high').length;
    const overdue = todos.filter(t => 
      !t.completed && t.dueDate && new Date(t.dueDate) < new Date()
    ).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, active, highPriority, overdue, percentage };
  }, [todos]);

  if (loading) {
    return (
      <div className="app">
        <div className="container">
          <div className="loading">Loading todos...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <header>
          <h1>📝 Todo List</h1>
          <p>Manage your tasks efficiently</p>
        </header>

        {/* Statistics Dashboard */}
        {todos.length > 0 && (
          <div className="stats-dashboard">
            <div className="stat-card">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Tasks</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.active}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.completed}</div>
              <div className="stat-label">Completed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.highPriority}</div>
              <div className="stat-label">High Priority</div>
            </div>
            {stats.overdue > 0 && (
              <div className="stat-card stat-warning">
                <div className="stat-value">{stats.overdue}</div>
                <div className="stat-label">⚠️ Overdue</div>
              </div>
            )}
            <div className="stat-card stat-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${stats.percentage}%` }}></div>
              </div>
              <div className="stat-label">{stats.percentage}% Complete</div>
            </div>
          </div>
        )}

        <TodoForm onTodoCreated={handleTodoCreated} />

        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={fetchTodos} className="btn btn-secondary">
              Retry
            </button>
          </div>
        )}

        <div className="todos-section">
          <div className="todos-header">
            <h2>
              Your Todos ({filteredAndSortedTodos.length})
              {filteredAndSortedTodos.filter((t) => !t.completed).length > 0 && (
                <span className="pending-count">
                  {' '}
                  - {filteredAndSortedTodos.filter((t) => !t.completed).length} pending
                </span>
              )}
            </h2>
          </div>

          {/* Search and Filters */}
          <div className="controls-section">
            <div className="search-box">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Search todos..."
                className="search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="clear-search"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="filters">
              <div className="filter-group">
                <label>Status:</label>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </button>
                  <button
                    className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
                    onClick={() => setFilter('active')}
                  >
                    Active
                  </button>
                  <button
                    className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
                    onClick={() => setFilter('completed')}
                  >
                    Completed
                  </button>
                </div>
              </div>

              <div className="filter-group">
                <label>Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortType)}
                  className="sort-select"
                >
                  <option value="date">Date Created</option>
                  <option value="priority">Priority</option>
                  <option value="dueDate">Due Date</option>
                  <option value="title">Title</option>
                </select>
              </div>
            </div>

            {allTags.length > 0 && (
              <div className="tag-filter">
                <label>Filter by tag:</label>
                <div className="tag-filter-buttons">
                  <button
                    className={`tag-filter-btn ${selectedTag === null ? 'active' : ''}`}
                    onClick={() => setSelectedTag(null)}
                  >
                    All
                  </button>
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      className={`tag-filter-btn ${selectedTag === tag ? 'active' : ''}`}
                      onClick={() => setSelectedTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {todos.length === 0 ? (
            <div className="empty-state">
              <p>No todos yet. Create your first todo above!</p>
            </div>
          ) : filteredAndSortedTodos.length === 0 ? (
            <div className="empty-state">
              <p>No todos match your filters. Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="todos-list">
              {filteredAndSortedTodos.map((todo) => (
                <TodoItem
                  key={todo._id}
                  todo={todo}
                  onUpdate={handleTodoUpdated}
                  onDelete={handleTodoDeleted}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
