import type { LanguageCode, NavSection } from '../types/pos';

export interface Translations {
  sell: string;
  todaysMoney: string;
  reservations: string;
  kds: string;
  bills: string;
  shiftDrawer: string;
  reports: string;
  menuPrices: string;
  stock: string;
  tablesAreas: string;
  promotion: string;
  staff: string;
  salesBook: string;
  chain: string;
  saasHub: string;
  auditLog: string;
  planBilling: string;
  settings: string;
  tables: string;
  menu: string;
  searchDishes: string;
  takeAwayOrder: string;
  sendToKitchen: string;
  pay: string;
  newDishesNotSent: string;
  clearAll: string;
  total: string;
  free: string;
  occupied: string;
  readyToServe: string;
  shiftOpen: string;
  shiftClosed: string;
  all: string;
  switchBranch: string;
  offlineMode: string;
  onlineSync: string;
  callStaff: string;
  askForBill: string;
  sendOrder: string;
}

export const I18N: Record<LanguageCode, Translations> = {
  en: {
    sell: 'Sell',
    todaysMoney: "Today's money",
    reservations: 'Reservations',
    kds: 'Kitchen / Bar',
    bills: 'Bills',
    shiftDrawer: 'Shift & drawer',
    reports: 'Reports',
    menuPrices: 'Menu & prices',
    stock: 'Stock',
    tablesAreas: 'Tables & areas',
    promotion: 'Promotion',
    staff: 'Staff',
    salesBook: 'Sales book',
    chain: 'Chain & Tenants',
    saasHub: 'SQLite & SaaS',
    auditLog: 'Audit log',
    planBilling: 'Plan & billing',
    settings: 'Settings',
    tables: 'Tables',
    menu: 'Menu',
    searchDishes: 'Search dishes (F2 switches tab)',
    takeAwayOrder: '+ Take-away order',
    sendToKitchen: 'Send to Kitchen',
    pay: 'Pay',
    newDishesNotSent: 'NEW DISHES · NOT SENT',
    clearAll: 'Clear all',
    total: 'Total',
    free: 'Free',
    occupied: 'Occupied',
    readyToServe: 'Ready to serve',
    shiftOpen: 'Shift open',
    shiftClosed: 'Shift closed',
    all: 'All',
    switchBranch: 'switch branch',
    offlineMode: 'Offline mode',
    onlineSync: 'Online',
    callStaff: 'Call staff',
    askForBill: 'Bill please',
    sendOrder: 'Send order',
  },
  kh: {
    sell: 'លក់',
    todaysMoney: 'ប្រាក់ថ្ងៃនេះ',
    reservations: 'កក់តុ',
    kds: 'ផ្ទះបាយ / បារ',
    bills: 'វិក្កយបត្រ',
    shiftDrawer: 'វេន និងថតប្រាក់',
    reports: 'របាយការណ៍',
    menuPrices: 'ម៉ឺនុយ និងតម្លៃ',
    stock: 'ស្តុកទំនិញ',
    tablesAreas: 'តុ និងតំបន់',
    promotion: 'ប្រូម៉ូសិន',
    staff: 'បុគ្គលិក',
    salesBook: 'សៀវភៅលក់ VAT',
    chain: 'សាខាទាំងអស់',
    saasHub: 'មូលដ្ឋានទិន្នន័យ SQLite',
    auditLog: 'កំណត់ត្រាសកម្មភាព',
    planBilling: 'គម្រោង និងការបង់',
    settings: 'ការកំណត់',
    tables: 'តុ',
    menu: 'ម៉ឺនុយ',
    searchDishes: 'ស្វែងរកមុខម្ហូប (F2)',
    takeAwayOrder: '+ កម្ម៉ង់ខ្ចប់',
    sendToKitchen: 'បញ្ជូនទៅផ្ទះបាយ',
    pay: 'គិតប្រាក់',
    newDishesNotSent: 'មុខម្ហូបថ្មី · មិនទាន់បញ្ជូន',
    clearAll: 'សម្អាត',
    total: 'សរុប',
    free: 'ទំនេរ',
    occupied: 'មានភ្ញៀវ',
    readyToServe: 'រួចរាល់សម្រាប់បម្រើ',
    shiftOpen: 'កំពុងបើកវេន',
    shiftClosed: 'វេនបានបិទ',
    all: 'ទាំងអស់',
    switchBranch: 'ប្តូរសាខា',
    offlineMode: 'លក់ក្រៅបណ្តាញ',
    onlineSync: 'ភ្ជាប់អ៊ីនធឺណិត',
    callStaff: 'ហៅបុគ្គលិក',
    askForBill: 'សុំគិតលុយ',
    sendOrder: 'ផ្ញើការកម្ម៉ង់',
  },
  vi: {
    sell: 'Bán hàng',
    todaysMoney: 'Tiền hôm nay',
    reservations: 'Đặt bàn',
    kds: 'Bếp / Bar',
    bills: 'Hóa đơn',
    shiftDrawer: 'Ca & két tiền',
    reports: 'Báo cáo',
    menuPrices: 'Thực đơn & giá',
    stock: 'Kho & công thức',
    tablesAreas: 'Bàn & khu vực',
    promotion: 'Khuyến mãi',
    staff: 'Nhân viên',
    salesBook: 'Sổ bán hàng VAT',
    chain: 'Chuỗi chi nhánh',
    saasHub: 'SQLite & SaaS',
    auditLog: 'Nhật ký kiểm tra',
    planBilling: 'Gói & thanh toán',
    settings: 'Cài đặt',
    tables: 'Bàn',
    menu: 'Thực đơn',
    searchDishes: 'Tìm món (F2 chuyển tab)',
    takeAwayOrder: '+ Đơn mang về',
    sendToKitchen: 'Gửi bếp',
    pay: 'Thanh toán',
    newDishesNotSent: 'MÓN MỚI · CHƯA GỬI',
    clearAll: 'Xóa hết',
    total: 'Tổng cộng',
    free: 'Trống',
    occupied: 'Đang phục vụ',
    readyToServe: 'Sẵn sàng phục vụ',
    shiftOpen: 'Đang mở ca',
    shiftClosed: 'Đã đóng ca',
    all: 'Tất cả',
    switchBranch: 'đổi chi nhánh',
    offlineMode: 'Bán ngoại tuyến',
    onlineSync: 'Trực tuyến',
    callStaff: 'Gọi nhân viên',
    askForBill: 'Tính tiền',
    sendOrder: 'Gửi đơn',
  },
};

export function getNavLabel(section: NavSection, lang: LanguageCode): string {
  const t = I18N[lang];
  const map: Record<NavSection, string> = {
    sell: t.sell,
    todays_money: t.todaysMoney,
    reservations: t.reservations,
    kds: t.kds,
    bills: t.bills,
    shift_drawer: t.shiftDrawer,
    reports: t.reports,
    menu_prices: t.menuPrices,
    stock: t.stock,
    tables_areas: t.tablesAreas,
    promotion: t.promotion,
    staff: t.staff,
    sales_book: t.salesBook,
    chain: t.chain,
    saas_hub: t.saasHub,
    audit_log: t.auditLog,
    plan_billing: t.planBilling,
    settings: t.settings,
  };
  return map[section];
}
