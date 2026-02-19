
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Wrench,
  ShoppingCart,
  BarChart2,
  Settings,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter
} from '@/components/ui/sidebar';
import { AppLogo } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Separator } from './ui/separator';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Panel de control' },
  { href: '/dashboard/inventory', icon: Package, label: 'Inventario' },
  { href: '/dashboard/repairs', icon: Wrench, label: 'Reparaciones' },
  { href: '/dashboard/pos', icon: ShoppingCart, label: 'Punto de Venta' },
  { href: '/dashboard/reports', icon: BarChart2, label: 'Reportes' },
  { href: '/dashboard/analysis', icon: TrendingUp, label: 'Análisis' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { firestore, user } = useFirebase();

  // Verificar si es administrador mediante la coleccion roles_admin
  const adminRoleRef = useMemoFirebase(() => 
    (firestore && user) ? doc(firestore, 'roles_admin', user.uid) : null,
    [firestore, user?.uid]
  );
  const { data: adminRole } = useDoc(adminRoleRef);
  const isAdmin = !!adminRole;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
            <AppLogo className="w-8 h-8 text-sidebar-primary" />
            <span className={cn(
                "text-lg font-semibold text-sidebar-foreground",
                "group-data-[collapsible=icon]:hidden"
            )}>
                Poos Mariche
            </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                tooltip={{ children: item.label }}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}

          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/dashboard/admin')}
                tooltip={{ children: 'Administración' }}
                className="text-amber-500 hover:text-amber-600"
              >
                <Link href="/dashboard/admin">
                  <ShieldCheck />
                  <span>Administración</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className='mt-auto'>
        <Separator className="my-2 bg-sidebar-border/50"/>
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={{children: 'Configuración'}} isActive={pathname === '/dashboard/settings'}>
                    <Link href="/dashboard/settings">
                        <Settings />
                        <span>Configuración</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
