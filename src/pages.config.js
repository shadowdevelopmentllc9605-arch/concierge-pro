/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Home from './pages/Home';
import BusinessSetup from './pages/BusinessSetup';
import Employees from './pages/Employees';
import Inventory from './pages/Inventory';
import FloorView from './pages/FloorView';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Checkout from './pages/Checkout';
import Notifications from './pages/Notifications';
import Metrics from './pages/Metrics';
import Procedures from './pages/Procedures';
import FittingRooms from './pages/FittingRooms';
import Locations from './pages/Locations';
import MirrorDisplay from './pages/MirrorDisplay';
import EmployeeProfile from './pages/EmployeeProfile';
import FAQ from './pages/FAQ';
import Support from './pages/Support';
import Payroll from './pages/Payroll';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "BusinessSetup": BusinessSetup,
    "Employees": Employees,
    "Inventory": Inventory,
    "FloorView": FloorView,
    "Customers": Customers,
    "CustomerDetail": CustomerDetail,
    "Checkout": Checkout,
    "Notifications": Notifications,
    "Metrics": Metrics,
    "Procedures": Procedures,
    "FittingRooms": FittingRooms,
    "Locations": Locations,
    "MirrorDisplay": MirrorDisplay,
    "EmployeeProfile": EmployeeProfile,
    "FAQ": FAQ,
    "Support": Support,
    "Payroll": Payroll,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};