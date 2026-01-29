import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../config/routes';

export const Navbar = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-content">
          <Link to={ROUTES.HOME} className="nav-logo">
            📝 Todo List
          </Link>
          <ul className="nav-links">
            <li>
              <Link to={ROUTES.HOME} className={isActive(ROUTES.HOME)}>
                Home
              </Link>
            </li>
            <li>
              <Link to={ROUTES.ABOUT} className={isActive(ROUTES.ABOUT)}>
                About
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};
