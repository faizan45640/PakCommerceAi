// sidebar-items.ts
import {
  Bot,
  Boxes,
  LayoutDashboard,
  Settings,
  ShoppingBag,
  Truck,
  Zap,
  Gauge,
  BarChart3,
  Package,
  Users,
  Store,
  MessageSquare,
  TrendingUp,
  Shield,
  Globe,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

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
    label: "Dashboards",
    items: [
      {
        id: "sales_and_orders",
        title: "Sales & Orders",
        url: "/dashboard/Sales_and_Orders",
        icon: ShoppingBag,
      },
      {
        id: "inventory_management",
        title: "Inventory Management",
        url: "/dashboard/Inventory_Management",
        icon: Boxes,
      },
      {
        id: "logistics_courier",
        title: "Logistics & Courier",
        url: "/dashboard/Logistics_and_Courier",
        icon: Truck,
      },
      {
        id: "ai_sales_agent",
        title: "AI Sales Agent",
        url: "/dashboard/AI_sales_agent",
        icon: Bot,
      },
      {
        id: "ai_insights_copilot",
        title: "AI Insights & Copilot",
        url: "/dashboard/AI_insights_and_copilot",
        icon: Zap,
      },
      {
        id: "account_settings",
        title: "Account Settings",
        url: "/dashboard/Account_settings",
        icon: Settings,
      },
    ],
  },
];
