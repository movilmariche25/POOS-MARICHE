
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
import type { UserProfile, UserModule } from '@/lib/types';

type NavItem = {
    href: string;
    icon: any;
    label: string;
    module?: UserModule;
};

const navItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Panel de control' },
  { href: '/dashboard/inventory', icon: Package, label: 'Inventario', module: 'inventory' },
  { href: '/dashboard/repairs', icon: Wrench, label: 'Reparaciones', module: 'repairs' },
  { href: '/dashboard/pos', icon: ShoppingCart, label: 'Punto de Venta', module: 'pos' },
  { href: '/dashboard/reports', icon: BarChart2, label: 'Reportes', module: 'reports' },
  { href: '/dashboard/analysis', icon: TrendingUp, label: 'Análisis', module: 'analysis' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { firestore, user } = useFirebase();

  const profileRef = useMemoFirebase(() => 
    (firestore && user) ? doc(firestore, 'users', user.uid) : null,
    [firestore, user?.uid]
  );
  const { data: profile } = useDoc<UserProfile>(profileRef);

  const isAdmin = !!profile?.isAdmin;
  
  // Filtrar items basado en los módulos habilitados del perfil
  const filteredNavItems = navItems.filter(item => {
      // El dashboard siempre es visible
      if (!item.module) return true;
      
      // Si no hay perfil aún, no mostramos nada opcional por seguridad
      if (!profile) return false;

      // Los administradores ven todo siempre
      if (profile.isAdmin) return true;

      // Verificar si el módulo está en la lista de habilitados del taller
      const enabledModules = profile.enabledModules || ['inventory', 'pos', 'repairs', 'reports', 'analysis'];
      return enabledModules.includes(item.module);
  });

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
          {filteredNavItems.map((item) => (
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
