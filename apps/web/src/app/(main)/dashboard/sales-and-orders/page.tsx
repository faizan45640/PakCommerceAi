// page.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { SalesKpiStrip } from "./_components/sales-kpi-strip";
import { OrderStatusBreakdown } from "./_components/order-status-breakdown";
import { PendingOrdersQueue } from "./_components/pending-orders-queue";
import { RecentOrdersList } from "./_components/recent-orders-list";
import { RevenueByChannel } from "./_components/revenue-by-channel";
import { BestSellingProducts } from "./_components/best-selling-products";
import { SalesTrendChart } from "./_components/sales-trend-chart";
import { RevenueByCity } from "./_components/revenue-by-city";
import { OrdersTable } from "./_components/orders-table/table";
import type { OrderRow } from "./_components/orders-table/schema";

// Sample data for orders table
const ordersData: OrderRow[] = [
  { id: "ORD-2024-0092", customer: "Priya Patel", email: "priya@email.com", channel: "Shopify", amount: 234.50, status: "Delivered", items: 3, date: "2024-12-02", city: "Karachi" },
  { id: "ORD-2024-0091", customer: "Alex Turner", email: "alex@email.com", channel: "WhatsApp", amount: 78.90, status: "Shipped", items: 2, date: "2024-12-02", city: "Lahore" },
  { id: "ORD-2024-0090", customer: "Maria Garcia", email: "maria@email.com", channel: "Daraz", amount: 156.75, status: "Confirmed", items: 4, date: "2024-12-01", city: "Islamabad" },
  { id: "ORD-2024-0089", customer: "Tom Harris", email: "tom@email.com", channel: "Shopify", amount: 312.00, status: "Pending", items: 5, date: "2024-12-01", city: "Rawalpindi" },
  { id: "ORD-2024-0088", customer: "Nina Singh", email: "nina@email.com", channel: "WhatsApp", amount: 45.60, status: "Delivered", items: 1, date: "2024-11-30", city: "Faisalabad" },
  { id: "ORD-2024-0087", customer: "Omar Hassan", email: "omar@email.com", channel: "Shopify", amount: 189.25, status: "Shipped", items: 3, date: "2024-11-30", city: "Karachi" },
  { id: "ORD-2024-0086", customer: "Leila Ahmed", email: "leila@email.com", channel: "Instagram", amount: 67.80, status: "Delivered", items: 2, date: "2024-11-29", city: "Lahore" },
  { id: "ORD-2024-0085", customer: "Ravi Kumar", email: "ravi@email.com", channel: "Daraz", amount: 234.00, status: "Cancelled", items: 4, date: "2024-11-29", city: "Multan" },
  { id: "ORD-2024-0084", customer: "Sana Mir", email: "sana@email.com", channel: "WhatsApp", amount: 156.50, status: "Returned", items: 2, date: "2024-11-28", city: "Islamabad" },
  { id: "ORD-2024-0083", customer: "Bilal Khan", email: "bilal@email.com", channel: "Facebook", amount: 98.75, status: "Delivered", items: 3, date: "2024-11-28", city: "Karachi" },
  { id: "ORD-2024-0082", customer: "Fatima Ali", email: "fatima@email.com", channel: "Shopify", amount: 267.90, status: "Confirmed", items: 5, date: "2024-11-27", city: "Rawalpindi" },
  { id: "ORD-2024-0081", customer: "Imran Sheikh", email: "imran@email.com", channel: "Daraz", amount: 45.30, status: "Pending", items: 1, date: "2024-11-27", city: "Lahore" },
  { id: "ORD-2024-0080", customer: "Zara Malik", email: "zara@email.com", channel: "WhatsApp", amount: 189.99, status: "Shipped", items: 4, date: "2024-11-26", city: "Faisalabad" },
  { id: "ORD-2024-0079", customer: "Harris Chaudhry", email: "harris@email.com", channel: "Shopify", amount: 312.50, status: "Delivered", items: 6, date: "2024-11-26", city: "Karachi" },
  { id: "ORD-2024-0078", customer: "Ayesha Tariq", email: "ayesha@email.com", channel: "Instagram", amount: 78.20, status: "Returned", items: 2, date: "2024-11-25", city: "Islamabad" },
];

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Sales & Orders Overview</h1>
        <p className="text-muted-foreground text-sm">
          Track orders, revenue, and sales performance across all channels.
        </p>
      </div>

      <SalesKpiStrip />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList className="gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <OrderStatusBreakdown />
            </div>
            <div className="xl:col-span-7">
              <PendingOrdersQueue />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-6">
              <RecentOrdersList />
            </div>
            <div className="xl:col-span-6">
              <RevenueByChannel />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <SalesTrendChart />
            </div>
            <div className="xl:col-span-5">
              <BestSellingProducts />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="flex flex-col gap-4">
          <OrdersTable data={ordersData} />
        </TabsContent>

        <TabsContent value="analytics" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-6">
              <RevenueByCity />
            </div>
            <div className="xl:col-span-6">
              <BestSellingProducts />
            </div>
          </div>
          <SalesTrendChart />
        </TabsContent>
      </Tabs>
    </div>
  );
}