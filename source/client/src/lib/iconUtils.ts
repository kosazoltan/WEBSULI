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
  // Földrajz ikonok
  Mountain,
  Droplets,
  Globe,
  MapPin,
  // Angol nyelv ikonok
  Flag,
  Languages,
  // Történelem ikonok
  Landmark,
  Castle,
  Crown,
  // Matematika ikonok
  TrendingUp,
  Activity,
  Divide,
  Equal,
  // Fizika ikonok
  Atom,
  Zap,
  Beaker,
  // Nyelvtan ikonok
  Pen,
  Pencil,
  // További tárgyak
  FlaskConical,
  Microscope,
  Book,
  GraduationCap,
  type LucideIcon
} from "lucide-react";

const iconKeywords: Record<string, LucideIcon> = {
  // FÖLDRÁSZ - prioritás: magas
  'földrajz': Mountain,
  'geography': Mountain,
  'geo': Mountain,
  'hegy': Mountain,
  'mountain': Mountain,
  'hegység': Mountain,
  'folyó': Droplets,
  'river': Droplets,
  'víz': Droplets,
  'water': Droplets,
  'tenger': Droplets,
  'sea': Droplets,
  'óceán': Droplets,
  'ocean': Droplets,
  'földrajzi': Mountain,
  'térkép': MapPin,
  'map': MapPin,
  'világ': Globe,
  'world': Globe,
  
  // ANGOL NYELV - prioritás: magas
  'angol': Flag,
  'english': Flag,
  'brit': Flag,
  'british': Flag,
  'uk': Flag,
  'usa': Flag,
  'amerika': Flag,
  'amerikai': Flag,
  'america': Flag,
  'nyelvtan': Languages,
  'nyelv': Languages,
  'language': Languages,
  'szótár': Book,
  'dictionary': Book,
  
  // TÖRTÉNELEM - prioritás: magas
  'történelem': Landmark,
  'history': Landmark,
  'történelmi': Landmark,
  'kor': Landmark,
  'vár': Castle,
  'castle': Castle,
  'palota': Castle,
  'palace': Castle,
  'király': Crown,
  'king': Crown,
  'királyság': Crown,
  'kingdom': Crown,
  'oklevél': FileText,
  'scroll': FileText,
  'dokumentum': FileText,
  'document': FileText,
  
  // MATEMATIKA - prioritás: magas
  'matek': Calculator,
  'matematika': Calculator,
  'math': Calculator,
  'mathematics': Calculator,
  'szám': Calculator,
  'számolás': Calculator,
  'algebra': Activity,
  'geometria': TrendingUp,
  'geometry': TrendingUp,
  'formula': Divide,
  'képlet': Divide,
  'szigma': TrendingUp,
  'sigma': TrendingUp,
  'összeg': TrendingUp,
  'sum': TrendingUp,
  'egyenlet': Equal,
  'equation': Equal,
  
  // FIZIKA - prioritás: magas
  'fizika': Atom,
  'physics': Atom,
  'atom': Atom,
  'energia': Zap,
  'energy': Zap,
  'villam': Zap,
  'lightning': Zap,
  'áram': Zap,
  'current': Zap,
  'kémia': Beaker,
  'chemistry': Beaker,
  'kémiai': Beaker,
  'vegyület': FlaskConical,
  'compound': FlaskConical,
  'labor': FlaskConical,
  'lab': FlaskConical,
  'mikroszkóp': Microscope,
  'microscope': Microscope,
  'biológia': Microscope,
  'biology': Microscope,
  
  // NYELVTAN - prioritás: magas
  'írás': Pen,
  'writing': Pen,
  'írásgyakorlat': Pen,
  'toll': Pen,
  'pen': Pen,
  'ceruza': Pencil,
  'pencil': Pencil,
  'papír': FileText,
  'paper': FileText,
  'esszé': FileText,
  'essay': FileText,
  
  // ÁLTALÁNOS INFORMATIKA/TECH
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
  
  // ÁLTALÁNOS TÁRGYAK
  'könyv': Book,
  'book': Book,
  'tananyag': Book,
  'material': Book,
  'oktatás': GraduationCap,
  'education': GraduationCap,
  'tanulás': Book,
  'learning': Book,
};

export function getFileIcon(title: string, description?: string | null): LucideIcon {
  const searchText = `${title} ${description || ''}`.toLowerCase();
  
  // Prioritásos keresés - először a specifikus tárgyak, utána az általánosak
  const priorityKeywords = [
    // Földrajz
    ['földrajz', 'geography', 'geo', 'hegy', 'mountain', 'folyó', 'river', 'víz', 'water', 'térkép', 'map', 'világ', 'world'],
    // Angol
    ['angol', 'english', 'brit', 'british', 'uk', 'usa', 'amerika'],
    // Történelem
    ['történelem', 'history', 'történelmi', 'vár', 'castle', 'király', 'king', 'oklevél', 'scroll'],
    // Matematika
    ['matek', 'matematika', 'math', 'mathematics', 'algebra', 'geometria', 'geometry', 'formula', 'képlet', 'szigma', 'sigma'],
    // Fizika/Kémia
    ['fizika', 'physics', 'atom', 'energia', 'energy', 'kémia', 'chemistry', 'biológia', 'biology'],
    // Nyelvtan
    ['írás', 'writing', 'toll', 'pen', 'ceruza', 'pencil', 'papír', 'paper', 'esszé', 'essay'],
  ];
  
  // Keresés prioritásos sorrendben
  for (const priorityGroup of priorityKeywords) {
    for (const keyword of priorityGroup) {
      if (searchText.includes(keyword)) {
        const icon = iconKeywords[keyword];
        if (icon) return icon;
      }
    }
  }
  
  // Általános keresés az összes kulcsszóra
  for (const [keyword, icon] of Object.entries(iconKeywords)) {
    if (searchText.includes(keyword)) {
      return icon;
    }
  }
  
  // Alapértelmezett ikon
  return Book;
}
