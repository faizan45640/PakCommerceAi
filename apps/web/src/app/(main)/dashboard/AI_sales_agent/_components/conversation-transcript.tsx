// conversation-transcript.tsx
"use client";

import { ArrowRight, Bot, User, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const conversation = {
  id: "CONV-2024-0042",
  customer: "Priya Patel",
  orderId: "DRAFT-2024-0042",
  status: "Awaiting Approval",
  duration: "5 mins",
  messages: [
    {
      sender: "customer",
      text: "Hi, I'm looking for a premium t-shirt in size L. Do you have any in stock?",
      time: "5:32 PM",
    },
    {
      sender: "agent",
      text: "Hello! Yes, we have several premium t-shirts available in size L. Our best-selling is the Egyptian Cotton Premium T-Shirt in Navy Blue. Would you like to see it?",
      time: "5:33 PM",
    },
    {
      sender: "customer",
      text: "Yes, please show me. Also, do you have it in black?",
      time: "5:34 PM",
    },
    {
      sender: "agent",
      text: "We have it in Navy Blue, Black, and Charcoal Gray. The price is $62.25 each, and we have a buy 2 get 10% off promotion running.",
      time: "5:35 PM",
    },
    {
      sender: "customer",
      text: "Great! I'll take 2 in black please. Can you deliver to Karachi?",
      time: "5:36 PM",
    },
    {
      sender: "agent",
      text: "Yes, we deliver to Karachi. Delivery typically takes 2-3 business days. Your total would be $112.05 with the discount. Should I create an order for you?",
      time: "5:37 PM",
    },
    {
      sender: "customer",
      text: "Yes, please create the order.",
      time: "5:38 PM",
    },
    {
      sender: "agent",
      text: "Perfect! I've created a draft order #DRAFT-2024-0042 for 2x Premium T-Shirts in Black (Size L) for $112.05. Our team will review and confirm it shortly. Is there anything else I can help with?",
      time: "5:39 PM",
    },
    {
      sender: "customer",
      text: "That's all, thank you!",
      time: "5:40 PM",
    },
  ],
};

function MessageBubble({ message, index }: { message: typeof conversation.messages[0], index: number }) {
  const isAgent = message.sender === "agent";
  
  return (
    <div className={`flex gap-2 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent && (
        <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="size-3.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[80%] ${isAgent ? "order-1" : "order-2"}`}>
        <div className={`rounded-lg px-3 py-2 text-sm ${isAgent ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
          {message.text}
        </div>
        <div className={`text-[10px] text-muted-foreground mt-0.5 ${isAgent ? "text-left" : "text-right"}`}>
          {message.time}
        </div>
      </div>
      {!isAgent && (
        <div className="size-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <User className="size-3.5 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}

export function ConversationTranscript() {
  const [expanded, setExpanded] = useState(true);
  const displayMessages = expanded ? conversation.messages : conversation.messages.slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          Conversation Transcript
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto gap-1 px-2 py-1 text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="font-medium">{conversation.customer}</span>
            <span className="text-muted-foreground ml-2">• {conversation.duration}</span>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Order: {conversation.orderId}
          </Badge>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {displayMessages.map((message, index) => (
            <MessageBubble key={index} message={message} index={index} />
          ))}
        </div>

        {!expanded && conversation.messages.length > 3 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setExpanded(true)}
          >
            View all {conversation.messages.length} messages
          </Button>
        )}
      </CardContent>
    </Card>
  );
}