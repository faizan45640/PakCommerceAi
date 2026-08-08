// insight-categories.tsx
"use client";

import { BarChart3, Package, Store, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const categories = [
  {
    id: "sales",
    name: "Sales Insights",
    icon: TrendingUp,
    count: 8,
    color: "bg-green-500/10 border-green-600/30 text-green-700 dark:text-green-300",
    insights: [
      "Sales up 24% in Lahore this week",
      "AOV increased to $68.50 (was $62.30)",
      "Best-seller: Premium T-Shirt (342 units)",
      "Q4 sales projection revised upward",
    ],
  },
  {
    id: "inventory",
    name: "Inventory Insights",
    icon: Package,
    count: 6,
    color: "bg-blue-500/10 border-blue-600/30 text-blue-700 dark:text-blue-300",
    insights: [
      "3 products at critical stock levels",
      "Stock turnover improved by 12%",
      "Seasonal inventory ready for Q4",
    ],
  },
  {
    id: "returns",
    name: "Returns Analysis",
    icon: BarChart3,
    count: 5,
    color: "bg-yellow-500/10 border-yellow-600/30 text-yellow-700 dark:text-yellow-300",
    insights: [
      "Return rate increased to 8.4%",
      "Karachi accounts for 32% of returns",
      "Sneakers have 18% return rate",
      "Size mismatches top return reason",
    ],
  },
  {
    id: "channels",
    name: "Channel Performance",
    icon: Store,
    count: 4,
    color: "bg-purple-500/10 border-purple-600/30 text-purple-700 dark:text-purple-300",
    insights: [
      "WhatsApp conversion rate up 34%",
      "Shopify sales plateaued this month",
      "Instagram driving 15% of new customers",
    ],
  },
];

export function InsightCategories() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((category) => {
        const Icon = category.icon;
        
        return (
          <Card key={category.id} className="cursor-pointer hover:bg-muted/30 transition-colors overflow-hidden min-w-0">
            <CardHeader className="pb-1.5 px-3 pt-3">
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={`size-6 rounded-lg flex items-center justify-center shrink-0 ${category.color}`}>
                    <Icon className="size-3" />
                  </div>
                  <span className="font-medium text-xs truncate min-w-0">{category.name}</span>
                </div>
                <Badge variant="outline" className="text-[9px] shrink-0 px-1.5 py-0">
                  {category.count}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ul className="space-y-0.5">
                {category.insights.slice(0, 2).map((insight, index) => (
                  <li key={index} className="text-[10px] text-muted-foreground flex items-start gap-1 min-w-0">
                    <span className="text-foreground mt-0.5 shrink-0">•</span>
                    <span className="truncate min-w-0">{insight}</span>
                  </li>
                ))}
                {category.insights.length > 2 && (
                  <li className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className="text-foreground mt-0.5 shrink-0">•</span>
                    <span className="text-primary truncate">+{category.insights.length - 2} more</span>
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}