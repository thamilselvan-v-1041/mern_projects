import { connectDatabase } from './config/database';
import Todo from './models/Todo';

const migrate = async () => {
  try {
    console.log('Starting migration...');
    await connectDatabase();

    // Update all todos that don't have the new fields
    const result = await Todo.updateMany(
      {
        $or: [
          { priority: { $exists: false } },
          { dueDate: { $exists: false } },
          { tags: { $exists: false } }
        ]
      },
      {
        $set: {
          priority: 'medium',
          tags: []
        }
      }
    );

    console.log(`Migration completed. Updated ${result.modifiedCount} todos.`);
    console.log('Total todos found:', await Todo.countDocuments());
    
    // Display updated todos
    const todos = await Todo.find();
    console.log('\nAll todos after migration:');
    todos.forEach(todo => {
      console.log(`- ${todo.title}: priority=${todo.priority}, tags=${JSON.stringify(todo.tags)}, dueDate=${todo.dueDate || 'none'}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
