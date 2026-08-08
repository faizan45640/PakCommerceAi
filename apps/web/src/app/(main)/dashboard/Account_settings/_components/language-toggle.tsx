// language-toggle.tsx
"use client";

import { useState } from "react";
import { ArrowRight, Check, Languages } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const languages = [
  { id: "en", name: "English", native: "English", code: "EN" },
  { id: "ur", name: "Urdu", native: "اردو", code: "UR" },
  { id: "pa", name: "Punjabi", native: "پنجابی", code: "PA" },
  { id: "sd", name: "Sindhi", native: "سنڌي", code: "SD" },
];

export function LanguageToggle() {
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Languages className="size-4 text-muted-foreground" />
          Language Preference
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button size="sm" className="h-7 text-xs">
            Apply Language
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Current Language</div>
              <div className="text-xs text-muted-foreground">
                Dashboard, AI responses, and notifications will appear in this language
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {languages.find(l => l.id === selectedLanguage)?.native}
            </Badge>
          </div>
        </div>

        <RadioGroup value={selectedLanguage} onValueChange={setSelectedLanguage} className="space-y-2">
          {languages.map((language) => (
            <div key={language.id} className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
              <RadioGroupItem value={language.id} id={language.id} />
              <Label htmlFor={language.id} className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{language.name}</span>
                    <span className="ml-2 text-muted-foreground text-sm">{language.native}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {language.code}
                  </Badge>
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-2 text-xs">
          <Check className="size-3 text-green-500" />
          <span className="text-muted-foreground">AI responses will automatically adapt to your selected language</span>
        </div>
      </CardContent>
    </Card>
  );
}