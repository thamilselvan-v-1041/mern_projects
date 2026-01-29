import express, { Request, Response } from 'express';
import Todo, { ITodo } from '../models/Todo';

const router = express.Router();

// GET all todos
router.get('/', async (req: Request, res: Response) => {
  try {
    const todos = await Todo.find().sort({ createdAt: -1 });
    res.json(todos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// GET a single todo by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.json(todo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch todo' });
  }
});

// POST create a new todo
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, completed, priority, dueDate, tags } = req.body;
    
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const todo = new Todo({
      title: title.trim(),
      description: description?.trim() || '',
      completed: completed || false,
      priority: priority || 'medium',
      dueDate: dueDate || undefined,
      tags: tags || [],
    });

    const savedTodo = await todo.save();
    res.status(201).json(savedTodo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create todo' });
  }
});

// PUT update a todo
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, description, completed, priority, dueDate, tags } = req.body;
    
    const updateData: Partial<ITodo> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (completed !== undefined) updateData.completed = completed;
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : undefined;
    if (tags !== undefined) updateData.tags = tags;

    const todo = await Todo.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json(todo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// DELETE a todo
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id);
    
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json({ message: 'Todo deleted successfully', todo });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

export default router;
