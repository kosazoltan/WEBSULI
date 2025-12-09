import { 
  FileCode, 
  Table, 
  List, 
  Image, 
  Layout, 
  FileText,
  Calculator,
  Video,
  Music,
  ShoppingCart,
  Users,
  Calendar,
  Mail,
  MessageSquare,
  Settings,
  BarChart,
  type LucideIcon
} from "lucide-react";

const iconKeywords: Record<string, LucideIcon> = {
  'táblázat': Table,
  'table': Table,
  'lista': List,
  'list': List,
  'kép': Image,
  'image': Image,
  'img': Image,
  'galéria': Image,
  'gallery': Image,
  'layout': Layout,
  'elrendezés': Layout,
  'űrlap': FileText,
  'form': FileText,
  'számológép': Calculator,
  'calculator': Calculator,
  'kalkulátor': Calculator,
  'videó': Video,
  'video': Video,
  'zene': Music,
  'music': Music,
  'audio': Music,
  'bolt': ShoppingCart,
  'shop': ShoppingCart,
  'webshop': ShoppingCart,
  'kosár': ShoppingCart,
  'cart': ShoppingCart,
  'felhasználó': Users,
  'user': Users,
  'users': Users,
  'naptár': Calendar,
  'calendar': Calendar,
  'dátum': Calendar,
  'date': Calendar,
  'email': Mail,
  'mail': Mail,
  'levél': Mail,
  'üzenet': MessageSquare,
  'message': MessageSquare,
  'chat': MessageSquare,
  'beállítás': Settings,
  'settings': Settings,
  'config': Settings,
  'diagram': BarChart,
  'chart': BarChart,
  'grafikon': BarChart,
  'statisztika': BarChart,
};

export function getFileIcon(title: string, description?: string | null): LucideIcon {
  const searchText = `${title} ${description || ''}`.toLowerCase();
  
  for (const [keyword, icon] of Object.entries(iconKeywords)) {
    if (searchText.includes(keyword)) {
      return icon;
    }
  }
  
  return FileCode;
}
