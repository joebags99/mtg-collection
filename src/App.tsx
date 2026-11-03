import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useAppState } from './app/AppContext';
import { paths } from './app/paths';
import { Shell } from './app/Shell';
import { BuildRoute } from './app/routes/BuildRoute';
import { CollectionRoute, CollectionStatsRoute, CollectionUploadRoute } from './app/routes/CollectionRoute';
import { CommanderRoute } from './app/routes/CommanderRoute';
import { DecksRoute } from './app/routes/DecksRoute';
import { DiscoverRoute } from './app/routes/DiscoverRoute';
import { AboutPage } from './pages/AboutPage';
import { GuidesPage } from './pages/GuidesPage';

/** On first load at the root, land on Discover when a saved collection was restored. */
function Landing() {
  const { collectionRestored } = useAppState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (collectionRestored && pathname === '/') navigate(paths.discover, { replace: true });
  }, [collectionRestored, pathname, navigate]);
  return <Navigate to={paths.collection} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Landing />} />
        <Route path="collection" element={<CollectionRoute />}>
          <Route index element={<CollectionUploadRoute />} />
          <Route path="stats" element={<CollectionStatsRoute />} />
        </Route>
        <Route path="discover" element={<DiscoverRoute />} />
        <Route path="discover/search" element={<DiscoverRoute />} />
        <Route path="discover/favorites" element={<DiscoverRoute />} />
        <Route path="commander/:name" element={<CommanderRoute />} />
        <Route path="commander/:name/build" element={<BuildRoute />} />
        <Route path="decks" element={<DecksRoute />} />
        <Route path="guides" element={<GuidesPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to={paths.collection} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
