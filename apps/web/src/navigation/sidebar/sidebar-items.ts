import {
  Boxes,
  ClipboardCheck,
  LayoutDashboard,
  MessageSquare,
  PackageSearch,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Commerce",
    items: [
      {
        id: "products",
        title: "Products",
        url: "/dashboard/products",
        icon: PackageSearch,
      },
      {
        id: "inventory",
        title: "Inventory",
        url: "/dashboard/inventory",
        icon: Boxes,
      },
      {
        id: "orders",
        title: "Orders",
        url: "/dashboard/orders",
        icon: ShoppingCart,
      },
      {
        id: "customers",
        title: "Customers",
        url: "/dashboard/customers",
        icon: Users,
      },
    ],
  },
  {
    id: 2,
    label: "Operations",
    items: [
      {
        id: "conversations",
        title: "Conversations",
        url: "/dashboard/conversations",
        icon: MessageSquare,
      },
      {
        id: "approvals",
        title: "Approvals",
        url: "/dashboard/approvals",
        icon: ClipboardCheck,
      },
      {
        id: "logistics",
        title: "Logistics",
        url: "/dashboard/logistics-and-courier",
        icon: Truck,
      },
    ],
  },
  {
    id: 3,
    label: "Insights",
    items: [
      {
        id: "analytics",
        title: "Analytics",
        url: "/dashboard/analytics",
        icon: LayoutDashboard,
      },
      {
        id: "copilot",
        title: "Copilot",
        url: "/dashboard/copilot",
        icon: Zap,
      },
    ],
  },
  {
    id: 4,
    label: "Workspace",
    items: [
      {
        id: "settings",
        title: "Settings",
        url: "/dashboard/settings",
        icon: Settings,
      },
    ],
  },
];
