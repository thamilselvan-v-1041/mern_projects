# React Router Implementation Guide

This document explains the router setup and usage in the Todo List application.

## Overview

The application uses **React Router DOM v6** for client-side routing. The router is configured with centralized route constants, a 404 page, and proper navigation handling.

## Router Structure

### Route Configuration (`src/config/routes.ts`)

All routes are centralized in a configuration file for easy maintenance:

```typescript
export const ROUTES = {
  HOME: '/',
  ABOUT: '/about',
  TODO_DETAIL: '/todo/:id',
  NOT_FOUND: '*',
} as const;
```

**Helper Functions:**
- `getTodoDetailRoute(id: string)` - Generates todo detail route with ID

### Routes

| Route | Path | Component | Description |
|-------|------|-----------|-------------|
| Home | `/` | `Home` | Main todo list page |
| About | `/about` | `About` | About page |
| Todo Detail | `/todo/:id` | `TodoDetail` | Individual todo detail page |
| 404 | `*` | `NotFound` | Not found page |

## Components

### App.tsx
Main router configuration using `BrowserRouter`:

```typescript
<BrowserRouter>
  <Navbar />
  <Routes>
    <Route path={ROUTES.HOME} element={<Home />} />
    <Route path={ROUTES.ABOUT} element={<About />} />
    <Route path={ROUTES.TODO_DETAIL} element={<TodoDetail />} />
    <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
  </Routes>
</BrowserRouter>
```

### Navbar Component
Navigation bar with active route highlighting:

```typescript
import { ROUTES } from '../config/routes';

<Link to={ROUTES.HOME}>Home</Link>
<Link to={ROUTES.ABOUT}>About</Link>
```

### Navigation Hooks

#### useNavigate
Programmatic navigation:

```typescript
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();
navigate(ROUTES.HOME); // Navigate to home
navigate(-1); // Go back
```

#### useParams
Access route parameters:

```typescript
import { useParams } from 'react-router-dom';

const { id } = useParams<{ id: string }>();
```

#### useLocation
Access current location:

```typescript
import { useLocation } from 'react-router-dom';

const location = useLocation();
console.log(location.pathname); // Current path
```

## Usage Examples

### Creating Links

```typescript
import { Link } from 'react-router-dom';
import { ROUTES, getTodoDetailRoute } from '../config/routes';

// Static route
<Link to={ROUTES.HOME}>Home</Link>

// Dynamic route
<Link to={getTodoDetailRoute(todoId)}>View Todo</Link>
```

### Programmatic Navigation

```typescript
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../config/routes';

const navigate = useNavigate();

// Navigate after action
const handleDelete = async () => {
  await deleteTodo(id);
  navigate(ROUTES.HOME);
};
```

### Accessing Route Parameters

```typescript
import { useParams } from 'react-router-dom';

const TodoDetail = () => {
  const { id } = useParams<{ id: string }>();
  // Use id to fetch todo data
};
```

## Best Practices

1. **Always use route constants** - Never hardcode paths
   ```typescript
   // ✅ Good
   <Link to={ROUTES.HOME}>Home</Link>
   
   // ❌ Bad
   <Link to="/">Home</Link>
   ```

2. **Use helper functions for dynamic routes**
   ```typescript
   // ✅ Good
   <Link to={getTodoDetailRoute(todo._id)}>View</Link>
   
   // ❌ Bad
   <Link to={`/todo/${todo._id}`}>View</Link>
   ```

3. **Handle 404 cases** - Always include a catch-all route
   ```typescript
   <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
   ```

4. **Use TypeScript** - Type your route parameters
   ```typescript
   const { id } = useParams<{ id: string }>();
   ```

## Adding New Routes

1. **Add route constant** in `src/config/routes.ts`:
   ```typescript
   export const ROUTES = {
     // ... existing routes
     NEW_PAGE: '/new-page',
   } as const;
   ```

2. **Create page component** in `src/pages/`:
   ```typescript
   export const NewPage = () => {
     return <div>New Page</div>;
   };
   ```

3. **Add route** in `src/App.tsx`:
   ```typescript
   import { NewPage } from './pages/NewPage';
   
   <Route path={ROUTES.NEW_PAGE} element={<NewPage />} />
   ```

4. **Add navigation link** (if needed):
   ```typescript
   <Link to={ROUTES.NEW_PAGE}>New Page</Link>
   ```

## Features

- ✅ Centralized route configuration
- ✅ Type-safe route constants
- ✅ 404 Not Found page
- ✅ Active route highlighting in navbar
- ✅ Programmatic navigation support
- ✅ Route parameter handling
- ✅ Helper functions for dynamic routes

## File Structure

```
frontend/src/
├── config/
│   └── routes.ts          # Route constants and config
├── pages/
│   ├── Home.tsx          # Home page
│   ├── About.tsx         # About page
│   ├── TodoDetail.tsx    # Todo detail page
│   └── NotFound.tsx      # 404 page
├── components/
│   └── layout/
│       └── Navbar.tsx    # Navigation bar
└── App.tsx               # Router setup
```
