import { Eye, Trash2, Calendar, Edit, Send } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFileIcon } from "@/lib/iconUtils";
import LikeButton from "./LikeButton";

interface FileCardProps {
  id: string;
  userId: string | null;
  title: string;
  description?: string;
  createdAt: Date;
  contentType?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  onView: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onSendEmail?: () => void;
}

export default function FileCard({
  id,
  userId,
  title,
  description,
  createdAt,
  contentType = 'html',
  currentUserId,
  isAdmin = false,
  onView,
  onEdit,
  onDelete,
  onSendEmail,
}: FileCardProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const FileIcon = getFileIcon(title, description);
  
  // Show delete button if:
  // 1. User is admin (can delete any file including legacy files)
  // 2. User is the owner of the file (excluding legacy files)
  const canDelete = isAdmin || (userId !== null && userId === currentUserId);

  return (
    <Card className="holographic-card border-0" data-testid={`card-file-${title}`}>
      <CardHeader className="fold:p-2 p-2.5 sm:p-3 pb-1.5 sm:pb-2">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileIcon className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="font-semibold text-xs sm:text-sm text-foreground break-words leading-tight">{title}</h3>
          </div>
          <Badge 
            variant="secondary" 
            className={`flex-shrink-0 text-xs font-bold ${
              contentType === 'pdf' 
                ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' 
                : 'bg-[#8B1538] text-white border-[#6B1028] dark:bg-[#6B1028] dark:border-[#8B1538]'
            }`}
          >
            {contentType === 'pdf' ? 'PDF' : 'HTML'}
          </Badge>
        </div>
      </CardHeader>

      {description && (
        <CardContent className="fold:px-2 px-2.5 sm:px-3 pb-1.5 sm:pb-2">
          <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2">
            {description}
          </p>
        </CardContent>
      )}

      <CardFooter className="fold:p-2 p-2.5 sm:p-3 flex flex-col xs:flex-row xs:items-center gap-2 pt-2 border-t border-orange-200/50 dark:border-orange-800/30">
        <div className="flex items-center gap-1 text-[10px] text-orange-700/60 dark:text-orange-400/60 min-w-0">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{formatDate(createdAt)}</span>
        </div>
        <div className="flex flex-wrap gap-1 xs:justify-end xs:ml-auto">
          <LikeButton materialId={id} className="flex-shrink-0" />

          <Button
            size="sm"
            onClick={onView}
            className="h-6 px-2 text-[10px] flex-1 xs:flex-none bg-orange-600 hover:bg-orange-700 text-white"
            data-testid="button-view-file"
          >
            <Eye className="w-3 h-3 xs:mr-1" />
            <span className="hidden xs:inline">Megnyitás</span>
          </Button>
          {isAdmin && onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="h-6 w-6 p-0 flex-shrink-0 border-orange-300 text-orange-600 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/30"
              data-testid="button-edit-file"
            >
              <Edit className="w-3 h-3" />
            </Button>
          )}
          {isAdmin && onSendEmail && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSendEmail}
              className="h-6 w-6 p-0 flex-shrink-0 border-orange-300 text-orange-600 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/30"
              data-testid="button-send-email"
            >
              <Send className="w-3 h-3" />
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              className="h-6 w-6 p-0 flex-shrink-0 border-red-300 text-red-500 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
              data-testid="button-delete-file"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
