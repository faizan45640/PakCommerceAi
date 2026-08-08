// query-history.tsx
"use client";

import { ArrowRight, Clock, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const queries = [
  {
    id: 1,
    question: "Why are sales low in Multan?",
    response: "Sales down 23% due to stock issues and competition...",
    time: "2 hours ago",
    confidence: 94,
  },
  {
    id: 2,
    question: "Which products are underperforming?",
    response: "3 products below expected performance: Jackets (-18%), Sneakers (-12%)...",
    time: "5 hours ago",
    confidence: 87,
  },
  {
    id: 3,
    question: "Show me top 5 bestsellers this week",
    response: "1. Premium T-Shirt (342 units), 2. Running Sneakers (267 units)...",
    time: "1 day ago",
    confidence: 96,
  },
  {
    id: 4,
    question: "What's the return rate in Karachi?",
    response: "Karachi return rate is 8.4%, up from 7.5% last week...",
    time: "2 days ago",
    confidence: 91,
  },
  {
    id: 5,
    question: "Compare sales with last month",
    response: "Sales increased by 12.4% compared to last month...",
    time: "3 days ago",
    confidence: 88,
  },
];

export function QueryHistory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          Query History
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            View All <ArrowRight className="size-3 ml-1" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {queries.map((query) => (
            <div key={query.id} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Search className="size-3 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{query.question}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{query.response}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px]">
                    {query.confidence}%
                  </Badge>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{query.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}