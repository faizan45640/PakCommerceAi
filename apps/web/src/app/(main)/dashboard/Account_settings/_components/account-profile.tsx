// account-profile.tsx
"use client";

import { Mail, MapPin, Phone, UserCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function AccountProfile() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <UserCircle className="size-4 text-muted-foreground" />
          Account Profile
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs">
            Edit Profile
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-semibold text-primary">
            A
          </div>
          <div>
            <div className="font-medium text-lg">Ahmed Raza</div>
            <div className="text-sm text-muted-foreground">Seller • Enterprise Plan</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px]">
                Verified
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                Premium
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="size-4 text-muted-foreground" />
            <span>ahmed.raza@pakcommerce.ai</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="size-4 text-muted-foreground" />
            <span>+92 300 1234567</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            <span>Karachi, Pakistan</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 text-xs">
            Change Password
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs">
            Security Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}