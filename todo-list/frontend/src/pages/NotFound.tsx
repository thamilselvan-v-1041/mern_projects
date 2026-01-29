import { Link } from 'react-router-dom';
import { ROUTES } from '../config/routes';

export const NotFound = () => {
  return (
    <div className="app">
      <div className="container">
        <div className="not-found">
          <div className="not-found-content">
            <h1 className="not-found-title">404</h1>
            <h2 className="not-found-subtitle">Page Not Found</h2>
            <p className="not-found-message">
              Oops! The page you're looking for doesn't exist.
            </p>
            <div className="not-found-actions">
              <Link to={ROUTES.HOME} className="btn btn-primary">
                Go to Home
              </Link>
              <Link to={ROUTES.ABOUT} className="btn btn-secondary">
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
