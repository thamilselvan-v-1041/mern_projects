export const About = () => {
  return (
    <div className="app">
      <div className="container">
        <header>
          <h1>About Todo List App</h1>
        </header>
        <div className="about-content">
          <section>
            <h2>Welcome to Todo List</h2>
            <p>
              A modern, full-stack todo list application built with cutting-edge technologies
              to help you manage your tasks efficiently.
            </p>
          </section>

          <section>
            <h2>Features</h2>
            <ul className="features-list">
              <li>✅ Create, read, update, and delete todos</li>
              <li>✅ Mark todos as complete or incomplete</li>
              <li>✅ Add descriptions to your todos</li>
              <li>✅ Edit todos inline</li>
              <li>✅ Responsive design for all devices</li>
              <li>✅ Real-time updates</li>
            </ul>
          </section>

          <section>
            <h2>Tech Stack</h2>
            <div className="tech-stack">
              <div className="tech-item">
                <h3>Frontend</h3>
                <ul>
                  <li>React with TypeScript</li>
                  <li>Vite for build tooling</li>
                  <li>React Router for navigation</li>
                  <li>Axios for API calls</li>
                </ul>
              </div>
              <div className="tech-item">
                <h3>Backend</h3>
                <ul>
                  <li>Node.js with Express</li>
                  <li>TypeScript</li>
                  <li>MongoDB with Mongoose</li>
                  <li>CORS enabled</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
