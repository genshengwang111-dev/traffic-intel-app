import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import HomePage from '@/pages/HomePage/HomePage';
import ExplorePage from '@/pages/ExplorePage/ExplorePage';
import ClusterPage from '@/pages/ClusterPage/ClusterPage';
import ForecastPage from '@/pages/ForecastPage/ForecastPage';
import HelpPage from '@/pages/HelpPage/HelpPage';
import NotFoundPage from '@/pages/NotFoundPage/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="cluster" element={<ClusterPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
