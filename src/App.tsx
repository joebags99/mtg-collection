import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useAppState } from './app/AppContext';
import { DiscoverProvider } from './app/DiscoverState';
import { paths } from './app/paths';
import { Shell } from './app/Shell';
import { BuildRoute } from './app/routes/BuildRoute';
import { CollectionRoute, CollectionStatsRoute, CollectionUploadRoute } from './app/routes/CollectionRoute';
import { CommanderRoute } from './app/routes/CommanderRoute';
import { DecksRoute } from './app/routes/DecksRoute';
import { DiscoverRoute, FavoritesPanel, RecommendationsPanel, SearchPanel } from './app/routes/DiscoverRoute';
import { queryClient } from './lib/queries';
import { AboutPage } from './pages/AboutPage';
import { GuidesPage } from './pages/GuidesPage';

/** The root lands on Discover when a collection is already loaded, else on Collection. */
function Landing() {
  const { collectionLoaded, collectionCount } = useAppState();
  if (!collectionLoaded) return null;
  return <Navigate to={collectionCount > 0 ? paths.discover : paths.collection} replace />;
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
        <Route path="discover" element={<DiscoverRoute />}>
          <Route index element={<RecommendationsPanel />} />
          <Route path="search" element={<SearchPanel />} />
          <Route path="favorites" element={<FavoritesPanel />} />
        </Route>
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppProvider>
          <DiscoverProvider>
            <AppRoutes />
          </DiscoverProvider>
        </AppProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
