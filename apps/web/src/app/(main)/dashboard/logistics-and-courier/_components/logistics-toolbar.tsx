// logistics-toolbar.tsx
import { Ellipsis, FileDown, RefreshCw, Filter, Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LogisticsToolbar() {
  return (
    <div className="flex items-center gap-2">
      <Select defaultValue="last-30-days">
        <SelectTrigger className="w-34">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="last-7-days">Last 7 days</SelectItem>
            <SelectItem value="last-30-days">Last 30 days</SelectItem>
            <SelectItem value="last-3-months">Last 3 months</SelectItem>
            <SelectItem value="year-to-date">Year to date</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select defaultValue="all-couriers">
        <SelectTrigger className="w-34">
          <SelectValue placeholder="All Couriers" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all-couriers">All Couriers</SelectItem>
            <SelectItem value="bluedart">BlueDart</SelectItem>
            <SelectItem value="dtdc">DTDC</SelectItem>
            <SelectItem value="delhivery">Delhivery</SelectItem>
            <SelectItem value="shadowfax">Shadowfax</SelectItem>
            <SelectItem value="xpressbees">XpressBees</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Button size="icon" variant="outline" aria-label="Filter">
        <Filter className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="outline" aria-label="More logistics actions">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Logistics actions</DropdownMenuLabel>
            <DropdownMenuItem>
              <FileDown />
              Export report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Calendar />
              Schedule pickup
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <RefreshCw />
              Refresh data
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
