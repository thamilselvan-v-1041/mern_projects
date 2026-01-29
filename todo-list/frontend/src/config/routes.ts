/**
 * Route Constants
 * Centralized route paths for the application
 */
export const ROUTES = {
  HOME: '/',
  ABOUT: '/about',
  TODO_DETAIL: '/todo/:id',
  NOT_FOUND: '*',
} as const;

/**
 * Helper function to generate todo detail route
 */
export const getTodoDetailRoute = (id: string): string => `/todo/${id}`;

/**
 * Route configuration with metadata
 */
export interface RouteConfig {
  path: string;
  name: string;
  description?: string;
  requiresAuth?: boolean;
}

export const routeConfigs: RouteConfig[] = [
  {
    path: ROUTES.HOME,
    name: 'Home',
    description: 'Todo list homepage',
  },
  {
    path: ROUTES.ABOUT,
    name: 'About',
    description: 'About the application',
  },
  {
    path: ROUTES.TODO_DETAIL,
    name: 'Todo Detail',
    description: 'View todo details',
  },
];
