import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import MemberProfile from './pages/MemberProfile.jsx';
import Trainers from './pages/Trainers.jsx';
import Fees from './pages/Fees.jsx';
import Attendance from './pages/Attendance.jsx';
import Classes from './pages/Classes.jsx';
import WorkoutDiet from './pages/WorkoutDiet.jsx';
import Pos from './pages/Pos.jsx';
import Announcements from './pages/Announcements.jsx';
import Reports from './pages/Reports.jsx';
import MemberPortal from './pages/MemberPortal.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/member-portal" element={<MemberPortal />} />

      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/members/:id" element={<MemberProfile />} />
        <Route path="/trainers" element={<Trainers />} />
        <Route path="/fees" element={<Fees />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/workout-diet" element={<WorkoutDiet />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/reports" element={<Reports />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
