import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Trash2, Mail, FolderOpen, CheckSquare, Square, Upload, Download, Save, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import FileCard from "@/components/FileCard";
import EmptyState from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CLASSROOM_VALUES, getClassroomLabel } from "@shared/classrooms";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface HtmlFileApi {
  id: string;
  userId: string | null;
  title: string;
  content: string;
  description: string | null;
  classroom: number;
  contentType?: string;
  createdAt: string;
  displayOrder?: number;
}

interface AdminFileDashboardProps {
  files: HtmlFileApi[];
  isLoading: boolean;
  currentUserId?: string;
  onViewFile: (file: HtmlFileApi) => void;
  onEditFile: (file: HtmlFileApi) => void;
  onDeleteFile: (id: string) => void;
  onToggleView: () => void;
  onSendEmail?: (file: HtmlFileApi) => void;
  onUploadClick?: () => void;
}

interface SortableItemProps {
  file: HtmlFileApi;
  currentUserId?: string;
  isSelected: boolean;
  onToggleSelection: () => void;
  onViewFile: () => void;
  onEditFile: () => void;
  onDeleteFile: () => void;
  onSendEmail?: () => void;
}

function SortableItem({
  file,
  currentUserId,
  isSelected,
  onToggleSelection,
  onViewFile,
  onEditFile,
  onDeleteFile,
  onSendEmail,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
      data-testid={`file-wrapper-${file.id}`}
    >
      <div className="absolute top-2 left-2 z-10 flex gap-1">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          className="bg-background border-2 shadow-md"
          data-testid={`checkbox-file-${file.id}`}
        />
        <div
          {...attributes}
          {...listeners}
          className="cursor-move bg-background border-2 rounded p-1 shadow-md hover-elevate"
          data-testid={`drag-handle-${file.id}`}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <FileCard
        id={file.id}
        userId={file.userId}
        title={file.title}
        description={file.description || undefined}
        createdAt={new Date(file.createdAt)}
        contentType={file.contentType || 'html'}
        currentUserId={currentUserId}
        isAdmin={true}
        onView={onViewFile}
        onEdit={onEditFile}
        onDelete={onDeleteFile}
        onSendEmail={onSendEmail}
      />
    </div>
  );
}

export default function AdminFileDashboard({ 
  files, 
  isLoading, 
  currentUserId,
  onViewFile,
  onEditFile, 
  onDeleteFile,
  onToggleView,
  onSendEmail,
  onUploadClick 
}: AdminFileDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [classroomFilter, setClassroomFilter] = useState<number | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkOperating, setIsBulkOperating] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (file.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const classroom = file.classroom ?? 1; // Fallback for legacy/missing data
    const matchesClassroom = classroomFilter === "all" || classroom === classroomFilter;
    return matchesSearch && matchesClassroom;
  });

  // Initialize local order from filteredFiles
  useEffect(() => {
    setLocalOrder(filteredFiles.map(f => f.id));
    setIsDirty(false);
  }, [files, searchQuery, classroomFilter]);

  // Get ordered files based on localOrder
  const orderedFiles = localOrder
    .map(id => filteredFiles.find(f => f.id === id))
    .filter(Boolean) as HtmlFileApi[];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
      setIsDirty(true);
    }
  };

  const handleSaveOrder = async () => {
    if (!isDirty) return;

    setIsSaving(true);
    try {
      // Create items array with sequential displayOrder
      const items = localOrder.map((id, index) => ({
        id,
        displayOrder: index + 1,
      }));

      await apiRequest("POST", "/api/html-files/reorder", { items });
      await queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });

      toast({
        title: "Sorrend mentve",
        description: "Az anyagok sorrendje sikeresen frissítve.",
      });

      setIsDirty(false);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Hiba történt",
        description: error instanceof Error ? error.message : "Nem sikerült menteni a sorrendet.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedIds.size === orderedFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orderedFiles.map(f => f.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    if (!confirm(`Biztosan törölni szeretnéd a kiválasztott ${selectedIds.size} anyagot?`)) {
      return;
    }

    setIsBulkOperating(true);
    try {
      await apiRequest("POST", "/api/admin/materials/bulk-delete", { 
        materialIds: Array.from(selectedIds) 
      });
      
      await queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      
      toast({
        title: "Sikeres törlés",
        description: `${selectedIds.size} anyag sikeresen törölve.`
      });
      
      setSelectedIds(new Set());
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Hiba történt",
        description: error instanceof Error ? error.message : "Nem sikerült törölni az anyagokat."
      });
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleBulkEmail = async () => {
    if (selectedIds.size === 0) return;
    
    const customEmails = prompt("Add meg az email címeket vesszővel elválasztva (vagy hagyd üresen az alapértelmezett címzettekhez):");
    if (customEmails === null) return;

    setIsBulkOperating(true);
    try {
      await apiRequest("POST", "/api/admin/materials/bulk-email", { 
        materialIds: Array.from(selectedIds),
        customEmails: customEmails ? customEmails.split(",").map(e => e.trim()).filter(e => e) : undefined
      });
      
      toast({
        title: "Email értesítések elküldve",
        description: `${selectedIds.size} anyagról küldtünk értesítést.`
      });
      
      setSelectedIds(new Set());
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Hiba történt",
        description: error instanceof Error ? error.message : "Nem sikerült elküldeni az emaileket."
      });
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleBulkMove = async () => {
    if (selectedIds.size === 0) return;
    
    const classroom = prompt("Add meg az új osztályt (1-8):");
    if (!classroom) return;
    
    const classroomNum = parseInt(classroom);
    if (isNaN(classroomNum) || classroomNum < 1 || classroomNum > 8) {
      toast({
        variant: "destructive",
        title: "Érvénytelen osztály",
        description: "Az osztálynak 1 és 8 között kell lennie."
      });
      return;
    }

    setIsBulkOperating(true);
    try {
      await apiRequest("POST", "/api/admin/materials/bulk-move", { 
        materialIds: Array.from(selectedIds),
        classroom: classroomNum
      });
      
      await queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      
      toast({
        title: "Sikeres áthelyezés",
        description: `${selectedIds.size} anyag átmozgatva a(z) "${getClassroomLabel(classroomNum, false)}" osztályba.`
      });
      
      setSelectedIds(new Set());
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Hiba történt",
        description: error instanceof Error ? error.message : "Nem sikerült áthelyezni az anyagokat."
      });
    } finally {
      setIsBulkOperating(false);
    }
  };

  const handleDownloadSource = async () => {
    try {
      // Add timestamp to prevent browser caching
      const timestamp = Date.now();
      const response = await fetch(`/api/admin/download-source?t=${timestamp}`, {
        credentials: 'include', // Send session cookie for authentication
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Bejelentkezés szükséges');
        }
        throw new Error(`Letöltési hiba: ${response.status}`);
      }
      
      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Generate filename with current timestamp
      const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `anyagok-profiknak-source-${now}.zip`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Forráskód letöltve",
        description: "A ZIP fájl letöltése megkezdődött",
      });
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        variant: "destructive",
        title: "❌ Letöltési hiba",
        description: error.message || "Nem sikerült letölteni a forráskódot",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 tablet:px-6 xl:px-8 py-16 text-center">
        <p className="text-muted-foreground">Betöltés...</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 tablet:px-6 xl:px-8 py-4 sm:py-6 lg:py-8 bg-gray-100 dark:bg-gray-900 rounded-lg">
        <div className="mb-4 sm:mb-5">
          <h2 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground mb-1">
            HTML Fájlok - Admin Nézet
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            0 fájl összesen
          </p>
        </div>
        
        <div className="flex flex-col xs:flex-row gap-3 mb-6">
          <div className="flex flex-col xs:flex-row gap-3">
            {onUploadClick && (
              <Button
                onClick={onUploadClick}
                className="w-full xs:w-auto bg-green-800 hover:bg-green-900 text-white"
                data-testid="button-upload-html"
              >
                <Upload className="w-4 h-4 mr-2" />
                Új HTML feltöltése
              </Button>
            )}
            <Button
              onClick={onToggleView}
              className="w-full xs:w-auto bg-green-800 hover:bg-green-900 text-white"
              data-testid="button-toggle-view"
            >
              <Eye className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Normál nézet</span>
              <span className="sm:hidden">Normál</span>
            </Button>
          </div>
          <Button
            onClick={handleDownloadSource}
            variant="outline"
            className="w-full xs:w-auto border-green-800 text-green-800 hover:bg-green-50 dark:hover:bg-green-950"
            data-testid="button-download-source-empty"
          >
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Forráskód letöltése</span>
            <span className="sm:hidden">Forráskód</span>
          </Button>
        </div>
        
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 tablet:px-6 xl:px-8 py-4 sm:py-6 lg:py-8 bg-gray-100 dark:bg-gray-900 rounded-lg">
      {/* Title and description */}
      <div className="mb-4 sm:mb-5">
        <h2 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground mb-1">
          HTML Fájlok - Admin Nézet
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {files.length} fájl összesen
        </p>
      </div>

      {/* Search and view toggle */}
      <div className="flex flex-col xs:flex-row gap-3 mb-5 sm:mb-6">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Keresés..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
            data-testid="input-search"
          />
        </div>
        <div className="flex flex-col xs:flex-row gap-3">
          {onUploadClick && (
            <Button
              onClick={onUploadClick}
              className="w-full xs:w-auto xs:flex-shrink-0 bg-green-800 hover:bg-green-900 text-white"
              data-testid="button-upload-html"
            >
              <Upload className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Új HTML feltöltése</span>
              <span className="sm:hidden">Feltöltés</span>
            </Button>
          )}
          <Button
            onClick={onToggleView}
            className="w-full xs:w-auto xs:flex-shrink-0 bg-green-800 hover:bg-green-900 text-white"
            data-testid="button-toggle-view"
          >
            <Eye className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Normál nézet</span>
            <span className="sm:hidden">Normál</span>
          </Button>
        </div>
        <Button
          onClick={handleDownloadSource}
          variant="outline"
          className="w-full xs:w-auto xs:flex-shrink-0 border-green-800 text-green-800 hover:bg-green-50 dark:hover:bg-green-950"
          data-testid="button-download-source"
        >
          <Download className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Forráskód letöltése</span>
          <span className="sm:hidden">Forráskód</span>
        </Button>
      </div>

      {/* Classroom filters */}
      <div className="mb-5 sm:mb-6">
        <p className="text-xs sm:text-sm text-muted-foreground mb-2">Szűrés osztály szerint:</p>
        <div className="flex flex-wrap gap-2 justify-center xs:justify-start">
          <Badge
            variant={classroomFilter === "all" ? "default" : "outline"}
            className={`cursor-pointer text-xs sm:text-sm ${classroomFilter === "all" ? "bg-blue-900 hover:bg-blue-950 text-white border-blue-900" : "border-blue-900 text-blue-900"}`}
            onClick={() => setClassroomFilter("all")}
            data-testid="filter-classroom-all"
          >
            Összes
          </Badge>
          {CLASSROOM_VALUES.map((classroom) => (
            <Badge
              key={classroom}
              variant={classroomFilter === classroom ? "default" : "outline"}
              className={`cursor-pointer text-xs sm:text-sm ${classroomFilter === classroom ? "bg-blue-900 hover:bg-blue-950 text-white border-blue-900" : "border-blue-900 text-blue-900"}`}
              onClick={() => setClassroomFilter(classroom)}
              data-testid={`filter-classroom-${classroom}`}
            >
              <span className="hidden xs:inline">{getClassroomLabel(classroom, false)}</span>
              <span className="xs:hidden">{getClassroomLabel(classroom, true)}</span>
            </Badge>
          ))}
        </div>
      </div>

      {/* Bulk selection toolbar + Reorder save */}
      {orderedFiles.length > 0 && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === orderedFiles.length && orderedFiles.length > 0}
              onCheckedChange={toggleAllSelection}
              data-testid="checkbox-select-all"
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size === 0 ? "Összes kijelölése" : `${selectedIds.size} kiválasztva`}
            </span>
          </div>
          
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isBulkOperating}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Törlés
              </Button>
              <Button
                size="sm"
                onClick={handleBulkEmail}
                disabled={isBulkOperating}
                className="bg-green-800 hover:bg-green-900 text-white"
                data-testid="button-bulk-email"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
              <Button
                size="sm"
                onClick={handleBulkMove}
                disabled={isBulkOperating}
                className="bg-green-800 hover:bg-green-900 text-white"
                data-testid="button-bulk-move"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Áthelyezés
              </Button>
            </div>
          )}

          {isDirty && (
            <Button
              onClick={handleSaveOrder}
              disabled={isSaving}
              className="ml-auto bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-save-order"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Mentés..." : "Sorrend Mentése"}
            </Button>
          )}
        </div>
      )}

      {orderedFiles.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={localOrder} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 tablet:grid-cols-3 xl:grid-cols-4 foldable:grid-cols-5 uw:grid-cols-6 gap-3 sm:gap-4 tablet:gap-5 xl:gap-6">
              {orderedFiles.map((file) => (
                <SortableItem
                  key={file.id}
                  file={file}
                  currentUserId={currentUserId}
                  isSelected={selectedIds.has(file.id)}
                  onToggleSelection={() => toggleSelection(file.id)}
                  onViewFile={() => onViewFile(file)}
                  onEditFile={() => onEditFile(file)}
                  onDeleteFile={() => onDeleteFile(file.id)}
                  onSendEmail={onSendEmail ? () => onSendEmail(file) : undefined}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            Nincs találat a keresésre: "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  );
}
