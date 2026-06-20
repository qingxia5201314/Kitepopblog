import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { AccountingPage } from './pages/AccountingPage';
import { FilesPage } from './pages/FilesPage';
import { ImagesPage } from './pages/ImagesPage';
import { AdminPage } from './pages/AdminPage';

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/accounting" element={<AccountingPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/images" element={<ImagesPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
