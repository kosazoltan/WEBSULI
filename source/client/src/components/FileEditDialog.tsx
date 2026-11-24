import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { CLASSROOMS, isValidClassroom, DEFAULT_CLASSROOM } from "@shared/classrooms";
import { TRACKS } from "@shared/tracks";
import { Checkbox } from "@/components/ui/checkbox";

interface FileEditDialogProps {
  file: {
    id: string;
    title: string;
    description?: string | null;
    classroom: number;
    /** #1986: külön tananyagcsoport-tagság. */
    tracks?: string[];
  };
  onSave: (id: string, updates: { title?: string; description?: string; classroom?: number; tracks?: string[] }) => void;
  onCancel: () => void;
}

export default function FileEditDialog({ file, onSave, onCancel }: FileEditDialogProps) {
  const [title, setTitle] = useState(file.title);
  const [description, setDescription] = useState(file.description || "");
  // Biztosítjuk hogy classroom mindig valid érték (0-12), default 1
  const [classroom, setClassroom] = useState<number>(() => {
    return isValidClassroom(file.classroom) ? file.classroom : DEFAULT_CLASSROOM;
  });

  const initialTracks = [...(file.tracks ?? [])].sort();
  const [tracks, setTracks] = useState<string[]>(initialTracks);
  const tracksChanged = JSON.stringify([...tracks].sort()) !== JSON.stringify(initialTracks);

  useEffect(() => {
    setTracks([...(file.tracks ?? [])].sort());
    setTitle(file.title);
    setDescription(file.description || "");
    // Biztosítjuk hogy classroom mindig valid érték (0-12), default 1
    setClassroom(isValidClassroom(file.classroom) ? file.classroom : DEFAULT_CLASSROOM);
  }, [file]);

  const handleSubmit = () => {
    if (title.trim()) {
      const updates: { title?: string; description?: string; classroom?: number; tracks?: string[] } = {};
      
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
      if (tracksChanged) updates.tracks = [...tracks].sort();
      
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
    classroom !== file.classroom ||
    tracksChanged;

  return (
    // docs/specs/2026-10-19-admin-reszponzivitas.md (5): nem portál — az alsó admin menü (z-50, később a DOM-ban) rárajzolt az
    // ablak aljára; a `vh` a mobil nagy nézete. Az ablak a menü fölött áll, a kis (dinamikus) nézethez méretezve.
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-2 sm:p-4">
      <Card className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col p-4 sm:p-6">
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
              onValueChange={(value) => {
                const next = parseInt(value, 10);
                setClassroom(next);
                // Review #582: a csoport anyaga a csoport évfolyamán van — más évfolyamra váltva a csoporttagság kikerül.
                setTracks((cur) => cur.filter((id) => TRACKS.find((t) => t.id === id)?.contentGrade === next));
              }}
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

          {/* #1986 (docs/specs/2026-11-24-gimi-felveteli-csoport.md): külön tananyagcsoport — a tartalmi évfolyam mellett. */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Külön tananyagcsoport</legend>
            {TRACKS.map((t) => (
              <label key={t.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={tracks.includes(t.id)}
                  onCheckedChange={(v) => {
                    setTracks((cur) => (v === true ? [...new Set([...cur, t.id])] : cur.filter((x) => x !== t.id)));
                    // Review #582: a csoportba tett anyag a csoport tartalmi évfolyamára kerül (gimi6 → 6.).
                    if (v === true) setClassroom(t.contentGrade);
                  }}
                  data-testid={`checkbox-edit-track-${t.id}`}
                />
                <span>
                  {t.label}
                  <span className="block text-xs text-muted-foreground">Tartalmi évfolyam: {t.contentGrade}. osztály · tantárgyak: {t.subjects.join(", ")}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <Label htmlFor="edit-description">Leírás (opcionális)</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rövid leírás az anyagról…"
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
