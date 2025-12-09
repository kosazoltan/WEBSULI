import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Mail, Calendar, Edit } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
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
import { Skeleton } from "@/components/ui/skeleton";

interface ExtraEmail {
  id: string;
  email: string;
  classrooms: number[];
  addedBy: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function ExtraEmailsManager() {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [newClassrooms, setNewClassrooms] = useState<number[]>([]);
  const [deleteEmailId, setDeleteEmailId] = useState<string | null>(null);
  const [editingClassroomId, setEditingClassroomId] = useState<string | null>(null);
  const [editClassroomsValue, setEditClassroomsValue] = useState<number[]>([]);

  // Lekérjük az extra email címeket
  const { data: extraEmails, isLoading, refetch } = useQuery<ExtraEmail[]>({
    queryKey: ["/api/admin/extra-emails"],
  });

  // Email hozzáadása
  const addEmailMutation = useMutation({
    mutationFn: async (data: { email: string; classrooms: number[] }) => {
      return await apiRequest("POST", "/api/admin/extra-emails", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/extra-emails"] });
      setNewEmail("");
      setNewClassrooms([]);
      toast({
        title: "Email cím hozzáadva",
        description: "Az email cím sikeresen hozzáadásra került.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült hozzáadni az email címet",
        variant: "destructive",
      });
    },
  });

  // Classrooms módosítása
  const updateClassroomMutation = useMutation({
    mutationFn: async ({ id, classrooms }: { id: string; classrooms: number[] }) => {
      return await apiRequest("PATCH", `/api/extra-emails/${id}/classrooms`, { classrooms });
    },
    onSuccess: async () => {
      await refetch();
      setEditingClassroomId(null);
      toast({
        title: "Osztályok módosítva",
        description: "Az email osztályai sikeresen módosítva lettek.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült módosítani az osztályokat",
        variant: "destructive",
      });
    },
  });

  // Email törlése
  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/extra-emails/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/extra-emails"] });
      toast({
        title: "Email cím törölve",
        description: "Az email cím sikeresen törölve lett.",
      });
      setDeleteEmailId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült törölni az email címet",
        variant: "destructive",
      });
    },
  });

  const formatDate = (date: string) => {
    return format(new Date(date), "yyyy. MM. dd. HH:mm", { locale: hu });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = newEmail.trim();
    
    // Email validáció
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast({
        title: "Érvénytelen email",
        description: "Kérlek adj meg egy érvényes email címet.",
        variant: "destructive",
      });
      return;
    }

    if (newClassrooms.length === 0) {
      toast({
        title: "Hiányzó osztály",
        description: "Legalább egy osztály kiválasztása kötelező.",
        variant: "destructive",
      });
      return;
    }

    addEmailMutation.mutate({ 
      email: trimmedEmail, 
      classrooms: newClassrooms 
    });
  };

  const handleUpdateClassroom = (id: string) => {
    if (editClassroomsValue.length === 0) {
      toast({
        title: "Hiányzó osztály",
        description: "Legalább egy osztály kiválasztása kötelező.",
        variant: "destructive",
      });
      return;
    }
    updateClassroomMutation.mutate({ 
      id, 
      classrooms: editClassroomsValue 
    });
  };

  const toggleClassroom = (classroom: number, isNew: boolean) => {
    if (isNew) {
      setNewClassrooms(prev => 
        prev.includes(classroom) 
          ? prev.filter(c => c !== classroom)
          : [...prev, classroom].sort()
      );
    } else {
      setEditClassroomsValue(prev => 
        prev.includes(classroom) 
          ? prev.filter(c => c !== classroom)
          : [...prev, classroom].sort()
      );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Extra Email Címek</CardTitle>
          <CardDescription>Töltés...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Extra Email Címek</CardTitle>
          <CardDescription>
            Adj hozzá olyan email címeket, akiknek értesítést szeretnél küldeni új tananyagokról.
            Ezek a címek akkor is kapnak értesítést, ha a tulajdonosuk még nem jelentkezett be az alkalmazásba.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email hozzáadása form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="email" className="sr-only">Email cím</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="pelda@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  data-testid="input-extra-email"
                />
              </div>
              <Button 
                type="submit" 
                disabled={!newEmail.trim() || newClassrooms.length === 0 || addEmailMutation.isPending}
                data-testid="button-add-extra-email"
              >
                <Plus className="h-4 w-4 mr-2" />
                Hozzáadás
              </Button>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Osztályok kiválasztása (több is lehetséges)</Label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                  <div key={num} className="flex items-center space-x-2">
                    <Checkbox
                      id={`new-classroom-${num}`}
                      checked={newClassrooms.includes(num)}
                      onCheckedChange={() => toggleClassroom(num, true)}
                      data-testid={`checkbox-new-classroom-${num}`}
                    />
                    <Label 
                      htmlFor={`new-classroom-${num}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {num}. osztály
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </form>

          {/* Email címek listája */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Hozzáadott email címek ({extraEmails?.length || 0})
            </h3>
            
            {extraEmails && extraEmails.length > 0 ? (
              <div className="space-y-2">
                {extraEmails.map((email) => (
                  <div 
                    key={email.id} 
                    className="flex items-center justify-between p-3 border rounded-md"
                    data-testid={`extra-email-${email.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{email.email}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {formatDate(email.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingClassroomId === email.id ? (
                        <div className="flex flex-col gap-2 w-full">
                          <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                              <div key={num} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`edit-classroom-${email.id}-${num}`}
                                  checked={editClassroomsValue.includes(num)}
                                  onCheckedChange={() => toggleClassroom(num, false)}
                                  data-testid={`checkbox-edit-classroom-${email.id}-${num}`}
                                />
                                <Label 
                                  htmlFor={`edit-classroom-${email.id}-${num}`}
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {num}.
                                </Label>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleUpdateClassroom(email.id)}
                              disabled={updateClassroomMutation.isPending || editClassroomsValue.length === 0}
                            >
                              Mentés
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => setEditingClassroomId(null)}
                            >
                              Mégse
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-1 flex-wrap">
                            {email.classrooms.sort().map((classroom) => (
                              <Badge key={classroom} variant="secondary">
                                {classroom}. osztály
                              </Badge>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingClassroomId(email.id);
                              setEditClassroomsValue(email.classrooms);
                            }}
                            data-testid={`button-edit-classroom-${email.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {email.isActive && (
                            <Badge variant="outline" className="text-green-600 border-green-300">
                              Aktív
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteEmailId(email.id)}
                            data-testid={`button-delete-extra-email-${email.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Még nincs hozzáadott extra email cím.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteEmailId} onOpenChange={() => setDeleteEmailId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Biztos törölni szeretnéd?</AlertDialogTitle>
            <AlertDialogDescription>
              Az email cím véglegesen törölve lesz. Ez a cím többé nem fog értesítéseket kapni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégsem</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEmailId && deleteEmailMutation.mutate(deleteEmailId)}
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