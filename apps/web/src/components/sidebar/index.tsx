import Link from "next/link";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarRoot,
} from "../ui/sidebar";

export default function Sidebar() {
  return (
    <SidebarRoot>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Observer</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/measurements">
                <SidebarMenuButton>Medidas</SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </SidebarRoot>
  );
}
