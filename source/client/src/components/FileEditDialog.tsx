import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { CLASSROOMS, isValidClassroom, DEFAULT_CLASSROOM } from "@shared/classrooms";

interface FileEditDialogProps {
  file: {
    id: string;
    title: string;
    description?: string | null;
    classroom: number;
  };
  onSave: (id: string, updates: { title?: string; description?: string; classroom?: number }) => void;
  onCancel: () => void;
}

export default function FileEditDialog({ file, onSave, onCancel }: FileEditDialogProps) {
  const [title, setTitle] = useState(file.title);
  const [description, setDescription] = useState(file.description || "");
  // Biztosítjuk hogy classroom mindig valid érték (0-12), default 1
  const [classroom, setClassroom] = useState<number>(() => {
    return isValidClassroom(file.classroom) ? file.classroom : DEFAULT_CLASSROOM;
  });

  useEffect(() => {
    setTitle(file.title);
    setDescription(file.description || "");
    // Biztosítjuk hogy classroom mindig valid érték (0-12), default 1
    setClassroom(isValidClassroom(file.classroom) ? file.classroom : DEFAULT_CLASSROOM);
  }, [file]);

  const handleSubmit = () => {
    if (title.trim()) {
      const updates: { title?: string; description?: string; classroom?: number } = {};
      
      // Only include changed fields
      if (title.trim() !== file.title) {
        updates.title = title.trim();
      }
      
      // Send description if it changed (including clearing it)
      if (description.trim() !== (file.description || '')) {
        updates.description = description.trim() || '';  // Send empty string to clear
      }
      
      if (classroom !== file.classroom) {
        updates.classroom = classroom;
      }
      
      // Only save if there are actual changes
      if (Object.keys(updates).length > 0) {
        onSave(file.id, updates);
      }
    }
  };

  // Check if there are any unsaved changes
  const hasChanges = 
    title.trim() !== file.title ||
    description.trim() !== (file.description || '') ||
    classroom !== file.classroom;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <Card className="w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6 flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Fájl szerkesztése</h2>
          <Button
            size="icon"
            variant="ghost"
            onClick={onCancel}
            data-testid="button-cancel-edit"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div>
            <Label htmlFor="edit-title">Cím *</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Például: 3. osztály matematika"
              data-testid="input-edit-title"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A címnek tartalmaznia kell az osztály számot (0 = Programozási alapismeretek, 1-12. osztály)
            </p>
          </div>

          <div>
            <Label htmlFor="edit-classroom">Osztály *</Label>
            <Select 
              value={classroom.toString()} 
              onValueChange={(value) => setClassroom(parseInt(value, 10))}
            >
              <SelectTrigger data-testid="select-edit-classroom">
                <SelectValue placeholder="Válassz osztályt" />
              </SelectTrigger>
              <SelectContent>
                {CLASSROOMS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Az osztály manuálisan is módosítható, ha a cím alapján nem jó
            </p>
          </div>

          <div>
            <Label htmlFor="edit-description">Leírás (opcionális)</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rövid leírás az anyagról..."
              rows={3}
              data-testid="input-edit-description"
            />
          </div>
        </div>

        <div className="flex gap-2 sm:gap-3 justify-end pt-4 border-t mt-4 flex-shrink-0">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="button-cancel-edit-footer"
          >
            Mégse
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !hasChanges}
            data-testid="button-save-edit"
          >
            Mentés
          </Button>
        </div>
      </Card>
    </div>
  );
}
