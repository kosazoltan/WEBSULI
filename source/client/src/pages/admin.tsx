import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Trash2, 
  Ban, 
  CheckCircle, 
  Shield, 
  Mail, 
  Calendar, 
  Clock, 
  ArrowLeft,
  MoreVertical,
  User as UserIcon,
  Users,
  FileText,
  Code,
  Wand2,
  Database,
  Eye,
  Tag,
  HelpCircle,
  Download,
  FolderOpen,
  Upload,
  Sparkles
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { Link } from "wouter";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ExtraEmailsManager from "@/components/ExtraEmailsManager";
import BackupManager from "@/components/BackupManager";
import TagManager from "@/components/TagManager";
import FileEditDialog from "@/components/FileEditDialog";
import EmailSendDialog from "@/components/EmailSendDialog";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

// AUTH ENABLED - Only admin emails can access protected features

// Lazy load heavy admin components for better performance
const EnhancedMaterialCreator = lazy(() => import("@/components/EnhancedMaterialCreator"));
const DatabaseManager = lazy(() => import("@/components/DatabaseManager"));
const PdfUpload = lazy(() => import("@/components/PdfUpload"));
const AdminFileDashboard = lazy(() => import("@/components/AdminFileDashboard"));
const SimpleHtmlUpload = lazy(() => import("@/components/SimpleHtmlUpload"));
const MaterialImprover = lazy(() => import("@/components/MaterialImprover"));
const MaterialImprovementBackups = lazy(() => import("@/components/MaterialImprovementBackups"));

// Admin Files Tab Component - handles file management
function AdminFilesTab() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [sendingEmailFile, setSendingEmailFile] = useState<any>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const { data: files = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/html-files"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; description?: string; classroom: number }) => {
      console.log('[ADMIN UPLOAD] Starting upload, content size:', data.content?.length || 0);
      const result = await apiRequest("POST", "/api/html-files", data);
      console.log('[ADMIN UPLOAD] Upload response:', result);
      return result;
    },
    onSuccess: async (data) => {
      console.log('[ADMIN UPLOAD] Success! Force refetching...', data);
      // Force remove cache and refetch fresh data
      queryClient.removeQueries({ queryKey: ["/api/html-files"] });
      await queryClient.refetchQueries({ queryKey: ["/api/html-files"], type: 'all' });
      console.log('[ADMIN UPLOAD] Refetch complete');
      setShowUploadZone(false);
      toast({
        title: "✅ Sikeres feltöltés!",
        description: data?.title ? `"${data.title}" sikeresen feltöltve.` : "A HTML fájl sikeresen feltöltve.",
      });
    },
    onError: (error: Error) => {
      console.error('[ADMIN UPLOAD] Error:', error);
      toast({
        title: "❌ Hiba történt",
        description: error.message || "Ismeretlen hiba történt a feltöltés során",
        variant: "destructive",
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { title?: string; description?: string; classroom?: number } }) => {
      return apiRequest("PATCH", `/api/html-files/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      setEditingFile(null);
      toast({
        title: "Módosítva",
        description: "A fájl sikeresen módosítva.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Hiba történt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log('[ADMIN DELETE] Deleting file:', id);
      await apiRequest("DELETE", `/api/html-files/${id}`);
      console.log('[ADMIN DELETE] Delete successful');
      return id;
    },
    onSuccess: async (deletedId) => {
      console.log('[ADMIN DELETE] Force invalidating cache for deleted:', deletedId);
      
      // CRITICAL: Invalidate ALL cache entries related to this material
      // 1. Invalidate material list query (used on Home and Admin pages)
      queryClient.removeQueries({ queryKey: ["/api/html-files"] });
      
      // 2. Invalidate individual material query (used on Preview page)
      queryClient.removeQueries({ queryKey: [`/api/html-files/${deletedId}`] });
      
      // 3. Invalidate material likes query (used in LikeButton component)
      queryClient.removeQueries({ queryKey: ["/api/materials", deletedId] });
      
      // 4. Invalidate batch likes query if exists
      queryClient.setQueriesData(
        { queryKey: ["/api/materials/likes/batch"] },
        (oldData: any) => {
          if (oldData && typeof oldData === 'object') {
            const newData = { ...oldData };
            delete newData[deletedId];
            return newData;
          }
          return oldData;
        }
      );
      
      // 5. Clear Service Worker cache for this material's URLs
      if ('caches' in window && 'serviceWorker' in navigator) {
        try {
          const cacheNames = await caches.keys();
          const baseUrl = window.location.origin;
          const relativeUrls = [
            `/api/html-files/${deletedId}`,
            `/api/materials/${deletedId}/likes`,
            `/dev/${deletedId}`,
            `/preview/${deletedId}`,
            `/materials/pdf/${deletedId}`
          ];
          
          // Create both relative and absolute URL versions
          const urlsToDelete = [
            ...relativeUrls,
            ...relativeUrls.map(url => `${baseUrl}${url}`)
          ];
          
          for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            for (const url of urlsToDelete) {
              try {
                await cache.delete(url);
              } catch (deleteError) {
                // Ignore individual deletion errors (URL might not exist in this cache)
              }
            }
          }
          console.log('[ADMIN DELETE] Service Worker cache cleared for material:', deletedId);
        } catch (swError) {
          console.warn('[ADMIN DELETE] Service Worker cache clear warning:', swError);
        }
      }
      
      // 6. Force refetch material list to update UI immediately
      await queryClient.refetchQueries({ queryKey: ["/api/html-files"], type: 'all' });
      
      console.log('[ADMIN DELETE] Cache invalidation complete');
      setDeletingFileId(null);
      toast({
        title: "Törölve",
        description: "A fájl sikeresen törölve.",
      });
    },
    onError: (error: Error) => {
      console.error('[ADMIN DELETE] Error:', error);
      setDeletingFileId(null);
      toast({
        title: "Hiba történt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleViewFile = (file: any) => {
    if (file.contentType === 'pdf') {
      setLocation(`/materials/pdf/${file.id}`);
    } else {
      setLocation(`/preview/${file.id}`);
    }
  };

  const handleEdit = (id: string, updates: { title?: string; description?: string; classroom?: number }) => {
    editMutation.mutate({ id, updates });
  };

  const handleDelete = (id: string) => {
    setDeletingFileId(id);
  };

  const confirmDelete = () => {
    if (deletingFileId) {
      deleteMutation.mutate(deletingFileId);
    }
  };

  const handleUpload = (file: { title: string; content: string; description?: string; classroom: number }) => {
    uploadMutation.mutate(file);
  };

  if (showUploadZone) {
    return (
      <Suspense fallback={<Card><CardContent className="pt-6"><Skeleton className="h-64" /></CardContent></Card>}>
        <SimpleHtmlUpload
          onUpload={handleUpload}
          onCancel={() => setShowUploadZone(false)}
          isPending={uploadMutation.isPending}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={<Card><CardContent className="pt-6"><Skeleton className="h-64" /></CardContent></Card>}>
        <AdminFileDashboard
          files={files}
          isLoading={isLoading}
          currentUserId={undefined}
          onViewFile={handleViewFile}
          onEditFile={setEditingFile}
          onDeleteFile={handleDelete}
          onToggleView={() => setLocation("/")}
          onSendEmail={setSendingEmailFile}
          onUploadClick={() => setShowUploadZone(true)}
        />
      </Suspense>

      {editingFile && (
        <FileEditDialog
          file={editingFile}
          onSave={handleEdit}
          onCancel={() => setEditingFile(null)}
        />
      )}

      {sendingEmailFile && (
        <EmailSendDialog
          isOpen={true}
          onClose={() => setSendingEmailFile(null)}
          fileId={sendingEmailFile.id}
          fileName={sendingEmailFile.title}
          classroom={sendingEmailFile.classroom}
        />
      )}

      <AlertDialog open={deletingFileId !== null} onOpenChange={(open) => !open && setDeletingFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Törlés megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törölni szeretnéd ezt a tananyagot? Ez a művelet nem vonható vissza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Admin() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  
  // CRITICAL SECURITY: Redirect non-admin users to home page
  useEffect(() => {
    if (!isAuthLoading && !user?.isAdmin) {
      toast({
        title: "Hozzáférés megtagadva",
        description: "Csak adminisztrátorok érhetik el ezt az oldalt.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [isAuthLoading, user, setLocation, toast]);
  
  // URL query paraméter kezelés: /admin?tab=emails
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const validTabs = ["files", "users", "enhanced", "pdf-upload", "tags", "backup", "material-views", "emails", "database", "improve-materials", "improvement-backups"];
    return tabParam && validTabs.includes(tabParam) ? tabParam : "files";
  });

  // Material views interface (moved before hooks)
  interface MaterialViewWithData {
    id: string;
    userId: string;
    materialId: string;
    viewedAt: string;
    userAgent: string | null;
    user?: User;
    material?: {
      id: string;
      title: string;
      description: string | null;
      classroom: number | null;
    };
  }

  // IMPORTANT: All hooks MUST be called before any early returns
  // CRITICAL SECURITY: Gate all admin queries with user?.isAdmin check
  // This prevents anonymous users from triggering admin API calls before redirect
  
  // Get all users - only enabled when admin AND on correct tab
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user?.isAdmin && activeTab === "users"
  });

  // Get material views - only enabled when admin AND on correct tab
  const { data: materialViews, isLoading: isLoadingViews } = useQuery<MaterialViewWithData[]>({
    queryKey: ["/api/admin/material-views"],
    enabled: !!user?.isAdmin && activeTab === "material-views"
  });

  // CRITICAL SECURITY: Mutation guard - bail out if not admin
  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!user?.isAdmin) {
        throw new Error("Unauthorized: Admin access required");
      }
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Felhasználó törölve",
        description: "A felhasználó sikeresen törölve lett.",
      });
      setDeleteUserId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült törölni a felhasználót",
        variant: "destructive",
      });
    }
  });

  // Toggle ban mutation
  const toggleBanMutation = useMutation({
    mutationFn: async ({ userId, banned }: { userId: string, banned: boolean }) => {
      if (!user?.isAdmin) {
        throw new Error("Unauthorized: Admin access required");
      }
      return await apiRequest("PATCH", `/api/admin/users/${userId}/ban`, { banned });
    },
    onSuccess: (_, { banned }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: banned ? "Felhasználó letiltva" : "Tiltás feloldva",
        description: banned 
          ? "A felhasználó sikeresen le lett tiltva." 
          : "A felhasználó tiltása fel lett oldva.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült módosítani a tiltás állapotát",
        variant: "destructive",
      });
    }
  });

  // Toggle admin mutation
  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string, isAdmin: boolean }) => {
      if (!user?.isAdmin) {
        throw new Error("Unauthorized: Admin access required");
      }
      return await apiRequest("PUT", `/api/admin/users/${userId}/toggle-admin`, { isAdmin });
    },
    onSuccess: (_, { isAdmin }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Jogosultság módosítva",
        description: `A felhasználó mostantól ${isAdmin ? 'admin' : 'normál felhasználó'}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült módosítani a jogosultságot",
        variant: "destructive",
      });
    }
  });
  
  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    return format(new Date(date), "yyyy. MM. dd. HH:mm", { locale: hu });
  };

  const formatDateShort = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    return format(new Date(date), "MM.dd. HH:mm", { locale: hu });
  };

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string | null) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "?";
  };


  // CRITICAL SECURITY: Show loading while checking auth (prevents flash of admin UI)
  if (isAuthLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-full flex items-center justify-center min-h-screen relative z-10">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Autentikáció ellenőrzése...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // CRITICAL SECURITY: Don't render anything if not admin (redirect will happen via useEffect)
  if (!user?.isAdmin) {
    return null;
  }

  // Mobile card view component for a user
  const UserCard = ({ user }: { user: User }) => (
    <Card className="mb-3" data-testid={`user-row-${user.id}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 flex-shrink-0">
              {user.profileImageUrl && (
                <AvatarImage src={user.profileImageUrl} alt={user.firstName || user.email || ""} />
              )}
              <AvatarFallback>
                {getInitials(user.firstName, user.lastName, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user.firstName || user.lastName || "Névtelen"}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Mail className="h-3 w-3" />
                <span className="truncate">{user.email || "—"}</span>
              </div>
            </div>
          </div>
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8"
                  data-testid={`button-actions-${user.id}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    toggleAdminMutation.mutate({ 
                      userId: user.id, 
                      isAdmin: !user.isAdmin 
                    });
                  }}
                  data-testid={`button-toggle-admin-${user.id}`}
                >
                  {user.isAdmin ? (
                    <>
                      <UserIcon className="h-4 w-4 mr-2" />
                      Normál felhasználóvá tétel
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Admin jogosultság adása
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    toggleBanMutation.mutate({ 
                      userId: user.id, 
                      banned: !user.isBanned 
                    });
                  }}
                  data-testid={`button-ban-${user.id}`}
                >
                  {user.isBanned ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Tiltás feloldása
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4 mr-2" />
                      Letiltás
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteUserId(user.id)}
                  className="text-destructive"
                  data-testid={`button-delete-${user.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Törlés
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {user.isAdmin ? (
            <Badge variant="default" className="gap-1">
              <Shield className="h-3 w-3" />
              Admin
            </Badge>
          ) : (
            <Badge variant="secondary">
              <UserIcon className="h-3 w-3 mr-1" />
              Felhasználó
            </Badge>
          )}
          {user.isBanned ? (
            <Badge variant="destructive" className="gap-1">
              <Ban className="h-3 w-3" />
              Letiltva
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
              <CheckCircle className="h-3 w-3" />
              Aktív
            </Badge>
          )}
        </div>

        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Utoljára aktív: {formatDateShort(user.lastSeenAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>Regisztrált: {formatDateShort(user.createdAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      {/* Simple static background for admin - no animations to save resources */}
      <div className="fixed inset-0 bg-gray-50 dark:bg-gray-950 -z-10" />
      
      <div className={`container mx-auto p-4 sm:p-6 max-w-full ${isMobile ? 'pb-20' : ''} relative z-10`} data-testid="admin-panel">
        <div className="mb-4 sm:mb-6">
          <Link href="/">
            <Button 
              variant="outline" 
              className="gap-2 w-full sm:w-auto" 
              data-testid="button-back-to-home"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Vissza a főoldalra</span>
              <span className="sm:hidden">Vissza</span>
            </Button>
          </Link>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Admin Felület</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Tananyag készítés és kezelés - Admin Authentication Enabled
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2" 
              data-testid="button-download-source"
              onClick={async () => {
                try {
                  toast({
                    title: "Forráskód letöltése...",
                    description: "A ZIP fájl generálása folyamatban...",
                  });
                  
                  const response = await fetch('/api/admin/download-source', {
                    credentials: 'include',
                  });
                  
                  if (!response.ok) {
                    throw new Error(`Letöltési hiba: ${response.status}`);
                  }
                  
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `anyagok-profiknak-source-${new Date().toISOString().slice(0, 10)}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                  
                  toast({
                    title: "Forráskód letöltve",
                    description: "A teljes forráskód sikeresen letöltve.",
                  });
                } catch (error: any) {
                  toast({
                    variant: "destructive",
                    title: "Letöltési hiba",
                    description: error.message || "Nem sikerült letölteni a forráskódot",
                  });
                }
              }}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Forráskód</span>
            </Button>
            <Link href="/admin/help">
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-help">
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Súgó</span>
              </Button>
            </Link>
            <AuthStatus />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Desktop: TabsList látható, Mobil: elrejtve (bottom nav használja) */}
          <TabsList className={`grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-11 mb-6 ${isMobile ? 'hidden' : ''}`}>
            <TabsTrigger value="files" className="flex items-center gap-2" data-testid="tab-files">
              <FolderOpen className="h-4 w-4" />
              <span className="hidden lg:inline">Fájlok</span>
              <span className="lg:hidden">Fájlok</span>
            </TabsTrigger>
            <TabsTrigger value="enhanced" className="flex items-center gap-2" data-testid="tab-enhanced">
              <Wand2 className="h-4 w-4" />
              <span className="hidden lg:inline">Fejlett készítő</span>
              <span className="lg:hidden">AI Készítő</span>
            </TabsTrigger>
            <TabsTrigger value="pdf-upload" className="flex items-center gap-2" data-testid="tab-pdf-upload">
              <FileText className="h-4 w-4" />
              <span className="hidden lg:inline">PDF Feltöltés</span>
              <span className="lg:hidden">PDF</span>
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-2" data-testid="tab-tags">
              <Tag className="h-4 w-4" />
              <span className="hidden sm:inline">Tag-ek</span>
              <span className="sm:hidden">Tag</span>
            </TabsTrigger>
            <TabsTrigger value="backup" className="flex items-center gap-2" data-testid="tab-backup">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Backup</span>
              <span className="sm:hidden">Backup</span>
            </TabsTrigger>
            <TabsTrigger value="material-views" className="flex items-center gap-2" data-testid="tab-material-views">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Megtekintések</span>
              <span className="sm:hidden">Megtek.</span>
            </TabsTrigger>
            <TabsTrigger value="emails" className="flex items-center gap-2" data-testid="tab-emails">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Email címek</span>
              <span className="sm:hidden">Email</span>
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2" data-testid="tab-database">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Adatbázis</span>
              <span className="sm:hidden">DB</span>
            </TabsTrigger>
            <TabsTrigger 
              value="improve-materials" 
              className="flex items-center gap-2 text-red-600 border-red-300 data-[state=active]:bg-red-50 data-[state=active]:text-red-700 data-[state=active]:border-red-500" 
              data-testid="tab-improve-materials"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Okosítás</span>
              <span className="sm:hidden">Okosítás</span>
            </TabsTrigger>
            <TabsTrigger 
              value="improvement-backups" 
              className="flex items-center gap-2 text-red-600 border-red-300 data-[state=active]:bg-red-50 data-[state=active]:text-red-700 data-[state=active]:border-red-500" 
              data-testid="tab-improvement-backups"
            >
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Okosítás Backup</span>
              <span className="sm:hidden">Backup</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-4">
            {activeTab === "files" && <AdminFilesTab />}
          </TabsContent>

          <TabsContent value="enhanced" className="space-y-4">
        {activeTab === "enhanced" && (
          <Suspense fallback={
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-12 w-32" />
              </CardContent>
            </Card>
          }>
            <EnhancedMaterialCreator />
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="pdf-upload" className="space-y-4">
        {activeTab === "pdf-upload" && (
          <Suspense fallback={
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          }>
            <PdfUpload />
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="backup" className="space-y-4">
        {activeTab === "backup" && <BackupManager />}
      </TabsContent>

      <TabsContent value="emails" className="space-y-4">
        {activeTab === "emails" && <ExtraEmailsManager />}
      </TabsContent>

      <TabsContent value="tags" className="space-y-4">
        {activeTab === "tags" && <TagManager />}
      </TabsContent>

      <TabsContent value="database" className="space-y-4">
        {activeTab === "database" && (
          <Suspense fallback={
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          }>
            <DatabaseManager />
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="improve-materials" className="space-y-4">
        {activeTab === "improve-materials" && (
          <Suspense fallback={
            <Card className="border-red-500 border-2">
              <CardHeader>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          }>
            <MaterialImprover />
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="improvement-backups" className="space-y-4">
        {activeTab === "improvement-backups" && (
          <Suspense fallback={
            <Card className="border-red-500 border-2">
              <CardHeader>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          }>
            <MaterialImprovementBackups />
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="material-views" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Tananyag megtekintések</CardTitle>
            <CardDescription className="text-sm">
              Legutóbbi 50 megtekintés regisztrált felhasználóktól
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            {isLoadingViews ? (
              <div className="space-y-3 px-4 sm:px-0">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !materialViews || materialViews.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Még nincsenek megtekintések</p>
              </div>
            ) : (
              <ScrollArea className="w-full">
                <div className="min-w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Felhasználó</TableHead>
                        <TableHead>Tananyag</TableHead>
                        <TableHead>Osztály</TableHead>
                        <TableHead>Időpont</TableHead>
                        <TableHead className="hidden lg:table-cell">Eszköz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialViews.map((view) => (
                        <TableRow key={view.id} data-testid={`material-view-${view.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={view.user?.profileImageUrl || undefined} />
                                <AvatarFallback className="text-xs">
                                  {view.user?.firstName?.[0]}{view.user?.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {view.user?.firstName} {view.user?.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {view.user?.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate max-w-[200px]">
                                {view.material?.title || 'Törölt tananyag'}
                              </p>
                              {view.material?.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {view.material.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {view.material?.classroom ? (
                              <Badge variant="outline" className="text-xs">
                                {view.material.classroom}. osztály
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-sm">
                                {format(new Date(view.viewedAt), 'MMM dd', { locale: hu })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(view.viewedAt), 'HH:mm', { locale: hu })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {view.userAgent || '-'}
                            </p>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
    
    {/* Mobil Bottom Navigation kategóriákkal */}
    {isMobile && <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />}
  </div>

  <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent className="max-w-[95%] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Biztos törölni szeretnéd?</AlertDialogTitle>
            <AlertDialogDescription>
              Ez a művelet nem visszavonható. A felhasználó véglegesen törölve lesz az adatbázisból.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégsem</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}