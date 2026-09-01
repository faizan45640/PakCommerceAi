// natural-language-query.tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Loader2, Search, Sparkles, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const suggestedQueries = [
  "Why are sales low in Multan?",
  "Which products are underperforming?",
  "Show me top 5 bestsellers this week",
  "What's the return rate in Karachi?",
  "Compare sales with last month",
];

export function NaturalLanguageQuery() {
  const [input, setInput] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`
    : "http://localhost:4000/api/v1/copilot/chat";

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: apiUrl,
      // The API requires a Supabase access token on every copilot call — the
      // chat streams through tools that read seller data. Resolve the session
      // per request so a fresh token is sent even after a refresh.
      headers: async () => {
        const { data } = await createClient().auth.getSession();
        return {
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        };
      },
    }),
  });

  const isProcessing = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isProcessing) return;
    sendMessage({ text: suggestion });
  };

  // Find the latest assistant message
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];

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
            Vercel AI SDK Active
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <Button type="submit" disabled={isProcessing || !input.trim()}>
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

        {/* Display chat stream */}
        {latestAssistantMessage && (
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="size-3.5" />
              <span>AI Copilot Response</span>
              <Badge variant="outline" className="text-[10px]">
                {status === "streaming" ? "Streaming..." : "Ready"}
              </Badge>
            </div>

            <div className="text-sm whitespace-pre-wrap">
              {latestAssistantMessage.parts.map((part, index) => {
                if (part.type === "text") {
                  return <span key={index}>{part.text}</span>;
                }
                return null;
              })}
            </div>

            {status !== "streaming" && (
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    const text = latestAssistantMessage.parts
                      .filter((p) => p.type === "text")
                      .map((p) => (p.type === "text" ? p.text : ""))
                      .join("");
                    if (text) navigator.clipboard.writeText(text);
                  }}
                >
                  Copy Response
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}