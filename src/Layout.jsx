import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { 
  LayoutDashboard, Users, Package, MapPin, ShoppingCart, 
  Bell, BarChart3, DoorOpen, FileText, Settings, Menu,
  LogOut, Building2, UserCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { canAccessVendorPage, getVendorContext } from '@/lib/vendorContext';

const pageVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};
const pageTransition = { duration: 0.22, ease: 'easeInOut' };

// Bottom tab items (mobile only)
const BOTTOM_TABS = [
  { icon: LayoutDashboard, label: 'Home', page: 'Home' },
  { icon: Users, label: 'Customers', page: 'Customers' },
  { icon: ShoppingCart, label: 'POS', page: 'Checkout' },
  { icon: Bell, label: 'Alerts', page: 'Notifications' },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const context = await getVendorContext();
      setUser(context.user);
      setEmployee(context.employee);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-sm text-slate-500">Loading vendor access…</div>
      </div>
    );
  }

  if (!canAccessVendorPage(currentPageName, employee)) {
    return (
      <ThemeProvider>
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
            <Building2 className="w-10 h-10 text-violet-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Access restricted</h1>
            <p className="text-slate-600">
              Your employee profile does not have permission to open this part of Concierge Pro.
            </p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  const isManager = employee?.role === 'manager';
  const permissions = employee?.permissions || {};

  const bottomTabs = BOTTOM_TABS.filter(tab => {
    if (tab.page === 'Checkout') return isManager || permissions.process_checkout !== false;
    if (tab.page === 'Notifications') return isManager || Boolean(permissions.send_notifications);
    return true;
  });

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', page: 'Home', show: true },
    { icon: MapPin, label: 'Floor View', page: 'FloorView', show: true },
    { icon: Users, label: 'Customers', page: 'Customers', show: true },
    { icon: Package, label: 'Inventory', page: 'Inventory', show: isManager || permissions.manage_inventory },
    { icon: ShoppingCart, label: 'POS', page: 'Checkout', show: permissions.process_checkout !== false },
    { icon: DoorOpen, label: 'Fitting Rooms', page: 'FittingRooms', show: true },
    { icon: Bell, label: 'Notifications', page: 'Notifications', show: isManager || permissions.send_notifications },
    { icon: BarChart3, label: 'Metrics', page: 'Metrics', show: isManager || permissions.view_metrics },
    { icon: FileText, label: 'Procedures', page: 'Procedures', show: isManager || permissions.view_procedures },
    { icon: UserCircle, label: 'Employees', page: 'Employees', show: isManager },
    { icon: Settings, label: 'Settings', page: 'BusinessSetup', show: isManager }
  ].filter(item => item.show);

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3 select-none">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Concierge Pro</h2>
            <p className="text-xs text-slate-500">Business Edition</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-auto">
        {navItems.map((item) => {
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              onClick={() => setMobileOpen(false)}
              className={`select-none flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-violet-100 text-violet-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3 px-4 py-3">
          {employee?.photo_url ? (
            <img src={employee.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-slate-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900 truncate">{user?.full_name || 'User'}</p>
            <p className="text-xs text-slate-500 truncate">{employee?.role || 'Staff'}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="select-none">
            <LogOut className="w-4 h-4 text-slate-400" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <ThemeProvider>
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900" style={{ overscrollBehavior: 'none' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 bg-white shadow-lg flex-col">
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <div
        className="mobile-header lg:hidden fixed top-0 left-0 right-0 bg-white shadow-sm z-40 flex items-center px-4"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}
      >
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="select-none">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <NavContent />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 ml-4 select-none">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">Concierge Pro</span>
        </div>
      </div>

      {/* Main Content with page transition + scroll position restore */}
      <main
        id="main-scroll"
        className="flex-1 overflow-auto lg:pt-0"
        style={{
          paddingTop: 'calc(3.5rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
          overscrollBehavior: 'none',
        }}
        onScroll={(e) => {
          sessionStorage.setItem(`scroll_${currentPageName}`, e.currentTarget.scrollTop);
        }}
        ref={(el) => {
          if (el) {
            const saved = sessionStorage.getItem(`scroll_${currentPageName}`);
            if (saved) el.scrollTop = parseInt(saved, 10);
          }
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentPageName}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav
        className="bottom-tab-bar lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {bottomTabs.map((tab) => {
          const isActive = currentPageName === tab.page;
          return (
            <Link
              key={tab.page}
              to={createPageUrl(tab.page)}
              className={`select-none flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors relative ${
                isActive ? 'text-violet-600' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <tab.icon className={`w-6 h-6 ${isActive ? 'text-violet-600' : 'text-slate-400 dark:text-slate-500'}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute top-0 w-8 h-0.5 bg-violet-600 rounded-full"
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
    </ThemeProvider>
  );
}