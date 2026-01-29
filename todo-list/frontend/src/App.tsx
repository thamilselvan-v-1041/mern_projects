import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { TodoDetail } from './pages/TodoDetail';
import { NotFound } from './pages/NotFound';
import { ROUTES } from './config/routes';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path={ROUTES.HOME} element={<Home />} />
        <Route path={ROUTES.ABOUT} element={<About />} />
        <Route path={ROUTES.TODO_DETAIL} element={<TodoDetail />} />
        <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
