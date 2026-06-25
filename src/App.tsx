import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { BlogDataProvider } from './context/BlogDataContext';
import { Layout } from './components/Layout';
import { LazyAccountingPage, LazyAdminPage, LazyFilesPage, LazyHomePage, LazyImagesPage } from './pages/lazy';

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <BlogDataProvider>
          <Suspense fallback={<div className="page-loading">Loading...</div>}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<LazyHomePage />} />
                <Route path="/accounting" element={<LazyAccountingPage />} />
                <Route path="/files" element={<LazyFilesPage />} />
                <Route path="/images" element={<LazyImagesPage />} />
                <Route path="/admin" element={<LazyAdminPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BlogDataProvider>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
