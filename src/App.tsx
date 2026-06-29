import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { BlogDataProvider } from './context/BlogDataContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LazyAccountingPage, LazyAdminPage, LazyFilesPage, LazyImagesPage, LazyMediaPreviewPage } from './pages/lazy';

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <BlogDataProvider>
          <Suspense
            fallback={
              <div className="page-loading" aria-label="页面加载中" role="status">
                <span />
                <span />
                <span />
              </div>
            }
          >
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/accounting" element={<LazyAccountingPage />} />
                <Route path="/files" element={<LazyFilesPage />} />
                <Route path="/files/preview" element={<LazyMediaPreviewPage />} />
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
