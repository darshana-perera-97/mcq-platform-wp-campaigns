import './App.css';
import { NavLink, Route, Routes } from 'react-router-dom';
import WhatsAppPage from './pages/WhatsAppPage';
import GroupsPage from './pages/GroupsPage';
import ContactsPage from './pages/ContactsPage';
import CampaignsPage from './pages/CampaignsPage';
import HomeDashboard from './pages/HomeDashboard';

function App() {
  return (
    <div className="App">
      <div className="appShell">
        <div className="topbar">
          <div className="topbarInner">
            <div className="brand">
              <div className="brandTitle">MCQ Platform</div>
              <div className="brandSub">Campaigns • WhatsApp integration</div>
            </div>

            <nav className="nav">
              <NavLink
                to="/"
                className={({ isActive }) => `navLink ${isActive ? 'navLinkActive' : ''}`}
                end
              >
                Home
              </NavLink>
              <NavLink
                to="/whatsapp"
                className={({ isActive }) => `navLink ${isActive ? 'navLinkActive' : ''}`}
              >
                WhatsApp
              </NavLink>
              <NavLink
                to="/groups"
                className={({ isActive }) => `navLink ${isActive ? 'navLinkActive' : ''}`}
              >
                Groups
              </NavLink>
              <NavLink
                to="/contacts"
                className={({ isActive }) => `navLink ${isActive ? 'navLinkActive' : ''}`}
              >
                Contacts
              </NavLink>
              <NavLink
                to="/campaigns"
                className={({ isActive }) => `navLink ${isActive ? 'navLinkActive' : ''}`}
              >
                Campaigns
              </NavLink>
            </nav>
          </div>
        </div>

        <main className="content">
          <Routes>
            <Route
              path="/"
              element={
                <HomeDashboard />
              }
            />
            <Route path="/whatsapp" element={<WhatsAppPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
