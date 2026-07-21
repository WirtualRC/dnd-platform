import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import LibraryPage from './pages/LibraryPage';
import CharacterSheetPage from './pages/CharacterSheetPage';
import ProfilePage from './pages/ProfilePage';
import RoomListPage from './pages/RoomListPage';
import RoomView from './pages/RoomView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><LibraryPage /></RequireAuth>} />
        <Route path="/characters/:id" element={<RequireAuth><CharacterSheetPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/room" element={<RequireAuth><RoomListPage /></RequireAuth>} />
        <Route path="/room/:id" element={<RequireAuth><RoomView /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  );
}
