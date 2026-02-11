import { Navigate, Route, Routes } from 'react-router-dom'
import Categories from './pages/Categories'
import Home from './pages/Home'
import Feeds from './pages/Feeds'
import FeedDetail from './pages/FeedDetail'
import Bookmarks from './pages/Bookmarks'
import { hasEnteredHome } from './utils/session'

function RootRoute() {
  return hasEnteredHome() ? <Navigate to="/home" replace /> : <Categories />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/interests" element={<Categories />} />
      <Route path="/home" element={<Home />} />
      <Route path="/bookmarks" element={<Bookmarks />} />
      <Route path="/feeds/:categoryId" element={<Feeds />} />
      <Route path="/feed/:feedId" element={<FeedDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
