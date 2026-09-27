import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ClipPage } from './pages/ClipPage';
import { HomePage } from './pages/HomePage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ReportPage } from './pages/ReportPage';
import { TermsPage } from './pages/TermsPage';
import { RoomPage } from './pages/RoomPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="c/:id" element={<ClipPage />} />
        <Route path="r" element={<RoomPage />} />
        <Route path="nasil-calisir" element={<HowItWorksPage />} />
        <Route path="gizlilik" element={<PrivacyPage />} />
        <Route path="kullanim-kosullari" element={<TermsPage />} />
        <Route path="bildir" element={<ReportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
