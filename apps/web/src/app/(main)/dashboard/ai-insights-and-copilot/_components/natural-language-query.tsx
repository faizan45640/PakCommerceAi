// natural-language-query.tsx
"use client";

import { useState } from "react";
import { Bot, Loader2, Search, Sparkles, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const suggestedQueries = [
  "Why are sales low in Multan?",
  "Which products are underperforming?",
  "Show me top 5 bestsellers this week",
  "What's the return rate in Karachi?",
  "Compare sales with last month",
];

export function NaturalLanguageQuery() {
  const [query, setQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsProcessing(true);
    // Simulate AI response
    setTimeout(() => {
      setResponse("Based on your sales data for Multan, I can see that sales have decreased by 23% over the last 30 days. The main contributing factors are:\n\n1. Stock availability issues for top-selling products in the region\n2. Higher competition from 3 new sellers in the area\n3. Delivery times increased by 2.5 days on average\n\nI recommend checking stock levels and considering a promotional campaign in Multan to regain market share.");
      setIsProcessing(false);
    }, 2000);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          Ask Your AI Assistant
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          <span className="flex items-center gap-1">
            <Sparkles className="size-3" />
            Powered by AI
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Ask anything about your business..."
              className="pl-9 pr-4"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <Button type="submit" disabled={isProcessing || !query.trim()}>
            {isProcessing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {suggestedQueries.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={isProcessing}
            >
              {suggestion}
            </Button>
          ))}
        </div>

        {response && (
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="size-3.5" />
              <span>AI Response</span>
              <Badge variant="outline" className="text-[10px]">
                Confidence: 94%
              </Badge>
            </div>
            <div className="text-sm whitespace-pre-wrap">{response}</div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Copy Response
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                View Details
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Take Action
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}