import { PosProvider, usePos } from './context/PosContext';
import { WelcomeAuthScreen } from './components/WelcomeAuthScreen';
import { AppShell } from './components/AppShell';
import { SellView } from './components/SellView';
import { KdsView } from './components/KdsView';
import { CustomerDisplayView } from './components/CustomerDisplayView';
import { GuestQrView } from './components/GuestQrView';
import { GroupOrderView } from './components/GroupOrderView';
import { ReservationsView, OnlineBookingView } from './components/ReservationsView';
import { TodaysMoneyView, ShiftDrawerView } from './components/ShiftAndMoneyViews';
import { InventoryView } from './components/InventoryView';
import { PromotionsCustomersView } from './components/PromotionsCustomersView';
import { ReportsView } from './components/ReportsView';
import { SalesBookView } from './components/SalesBookView';
import {
  AuditLogView,
  BillsView,
  ChainView,
  MenuManagementView,
  PlanBillingView,
  SettingsView,
  StaffView,
  TablesAreasView,
} from './components/ManagementViews';
import { ReceiptModal } from './components/ReceiptModal';
import { SaasPlatformHubView } from './components/SaasPlatformHubView';

function PosRouter() {
  const {
    isEnteredPos,
    externalMode,
    navSection,
    receiptOrder,
    setReceiptOrder,
    activeBranch,
  } = usePos();

  if (externalMode === 'kds') {
    return <KdsView standalone />;
  }
  if (externalMode === 'display') {
    return <CustomerDisplayView />;
  }
  if (externalMode === 'qr') {
    return <GuestQrView />;
  }
  if (externalMode === 'group') {
    return <GroupOrderView />;
  }
  if (externalMode === 'book') {
    return <OnlineBookingView />;
  }

  if (!isEnteredPos) {
    return <WelcomeAuthScreen />;
  }

  const renderSection = () => {
    switch (navSection) {
      case 'sell':
        return <SellView />;
      case 'todays_money':
        return <TodaysMoneyView />;
      case 'reservations':
        return <ReservationsView />;
      case 'kds':
        return <KdsView />;
      case 'bills':
        return <BillsView />;
      case 'shift_drawer':
        return <ShiftDrawerView />;
      case 'reports':
        return <ReportsView />;
      case 'menu_prices':
        return <MenuManagementView />;
      case 'stock':
        return <InventoryView />;
      case 'tables_areas':
        return <TablesAreasView />;
      case 'promotion':
        return <PromotionsCustomersView />;
      case 'staff':
        return <StaffView />;
      case 'sales_book':
        return <SalesBookView />;
      case 'chain':
        return <ChainView />;
      case 'saas_hub':
        return <SaasPlatformHubView />;
      case 'audit_log':
        return <AuditLogView />;
      case 'plan_billing':
        return <PlanBillingView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <SellView />;
    }
  };

  return (
    <>
      <AppShell>{renderSection()}</AppShell>
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          branch={activeBranch}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <PosProvider>
      <PosRouter />
    </PosProvider>
  );
}
