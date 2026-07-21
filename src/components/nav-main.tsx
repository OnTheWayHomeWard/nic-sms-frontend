"use client";

import { NavLink } from "react-router-dom";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface NavMainProps {
  items: { title: string; url: string; icon: React.ReactNode }[];
  label: string;
}

export function NavMain({ items, label }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-primary font-semibold">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <NavLink to={item.url} end>
                {({ isActive }) => (
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={{
                      children: item.title,
                      className: "bg-sidebar-accent text-sidebar-accent-foreground",
                      arrowClassName: "bg-sidebar-accent fill-sidebar-accent",
                    }}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                )}
              </NavLink>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
