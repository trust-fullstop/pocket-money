import { Route, Routes } from 'react-router';
import EmergencyCardPage from './EmergencyCardPage';
import MeHome from './MeHome';
import Secure from './Secure';

/** /me/* — my look, emergency card, sign-in & devices. */
export default function MeModule() {
  return (
    <Routes>
      <Route index element={<MeHome />} />
      <Route path="profile" element={<EmergencyCardPage />} />
      <Route path="secure" element={<Secure />} />
      <Route path="*" element={<MeHome />} />
    </Routes>
  );
}
