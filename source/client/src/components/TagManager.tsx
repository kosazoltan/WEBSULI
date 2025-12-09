import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Tag as TagIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
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

type Tag = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
};

export default function TagManager() {
  const { toast } = useToast();
  const [newTagName, setNewTagName] = useState("");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [deleteTagId, setDeleteTagId] = useState<string | null>(null);

  // Fetch all tags
  const { data: tags, isLoading } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: async () => {
      if (!newTagName.trim()) {
        throw new Error("Tag neve kötelező");
      }
      return await apiRequest("POST", "/api/admin/tags", {
        name: newTagName.trim(),
        description: newTagDescription.trim() || null,
        color: newTagColor,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({
        title: "Tag létrehozva",
        description: `"${newTagName}" tag sikeresen létrehozva`,
      });
      setNewTagName("");
      setNewTagDescription("");
      setNewTagColor("#3b82f6");
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült létrehozni a tag-et",
        variant: "destructive",
      });
    },
  });

  // Delete tag mutation
  const deleteTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      await apiRequest("DELETE", `/api/admin/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({
        title: "Tag törölve",
        description: "A tag sikeresen törölve lett",
      });
      setDeleteTagId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült törölni a tag-et",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6" data-testid="component-tag-manager">
      {/* Create New Tag Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5" />
            Új Tag létrehozása
          </CardTitle>
          <CardDescription>Tag-ek segítenek a tananyagok kategorizálásában</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Tag neve *</Label>
              <Input
                id="tag-name"
                placeholder="pl. Matematika, Történelem..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                data-testid="input-tag-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-description">Leírás (opcionális)</Label>
              <Input
                id="tag-description"
                placeholder="Tag részletes leírása"
                value={newTagDescription}
                onChange={(e) => setNewTagDescription(e.target.value)}
                data-testid="input-tag-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-color">Szín</Label>
              <div className="flex gap-2">
                <Input
                  id="tag-color"
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-20"
                  data-testid="input-tag-color"
                />
                <Button 
                  onClick={() => createTagMutation.mutate()}
                  disabled={createTagMutation.isPending || !newTagName.trim()}
                  className="flex-1"
                  data-testid="button-create-tag"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {createTagMutation.isPending ? "Létrehozás..." : "Létrehozás"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Tags List */}
      <Card>
        <CardHeader>
          <CardTitle>Meglévő Tag-ek</CardTitle>
          <CardDescription>
            Összesen {tags?.length || 0} tag
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground">Betöltés...</p>
          ) : tags && tags.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover-elevate"
                  data-testid={`tag-item-${tag.id}`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Badge
                      style={{ backgroundColor: tag.color || '#3b82f6', color: 'white' }}
                      data-testid={`badge-tag-${tag.id}`}
                    >
                      {tag.name}
                    </Badge>
                    {tag.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {tag.description}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTagId(tag.id)}
                    data-testid={`button-delete-tag-${tag.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Még nincs tag létrehozva
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTagId} onOpenChange={() => setDeleteTagId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tag törlése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törölni szeretnéd ezt a tag-et? Ez a művelet nem vonható vissza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-tag">Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTagId && deleteTagMutation.mutate(deleteTagId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-tag"
            >
              {deleteTagMutation.isPending ? "Törlés..." : "Törlés"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
