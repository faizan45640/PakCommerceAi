import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  type LucideIcon,
  PackageSearch,
  Plug,
  Settings,
  ShoppingCart,
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
        id: "overview",
        title: "Overview",
        url: "/dashboard/ecommerce",
        icon: LayoutDashboard,
      },
      {
        id: "analytics",
        title: "Analytics",
        url: "/dashboard/analytics",
        icon: BarChart3,
      },
      {
        id: "products",
        title: "Products",
        url: "#",
        icon: PackageSearch,
        badge: "soon",
        disabled: true,
      },
      {
        id: "orders",
        title: "Orders",
        url: "#",
        icon: ShoppingCart,
        badge: "soon",
        disabled: true,
      },
      {
        id: "inventory",
        title: "Inventory",
        url: "#",
        icon: Boxes,
        badge: "soon",
        disabled: true,
      },
    ],
  },
  {
    id: 2,
    label: "Workspace",
    items: [
      {
        id: "integrations",
        title: "Integrations",
        url: "#",
        icon: Plug,
        badge: "soon",
        disabled: true,
      },
      {
        id: "settings",
        title: "Settings",
        url: "#",
        icon: Settings,
        badge: "soon",
        disabled: true,
      },
    ],
  },
];
