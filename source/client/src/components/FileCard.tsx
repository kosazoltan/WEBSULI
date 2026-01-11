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
    <Card className="holographic-card border-0 group" data-testid={`card-file-${title}`}>
      <CardHeader className="fold:p-3 p-4 sm:p-5 pb-2 sm:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Ikon gradient háttérrel */}
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110 ${
              contentType === 'pdf'
                ? 'education-icon-orange'
                : 'education-icon-purple'
            }`}>
              <FileIcon className={`w-6 h-6 sm:w-7 sm:h-7 ${
                contentType === 'pdf' ? 'text-orange-400' : 'text-purple-400'
              }`} />
            </div>
            <h3 className="font-bold text-sm sm:text-base text-white break-words group-hover:text-purple-300 transition-colors">{title}</h3>
          </div>
          {/* Gradient badge */}
          <Badge
            variant="secondary"
            className={`flex-shrink-0 text-xs font-black border-0 ${
              contentType === 'pdf'
                ? 'gradient-badge-orange'
                : 'gradient-badge-purple'
            }`}
          >
            {contentType === 'pdf' ? 'PDF' : 'HTML'}
          </Badge>
        </div>
      </CardHeader>

      {description && (
        <CardContent className="fold:px-3 px-4 sm:px-5 pb-2 sm:pb-3">
          <p className="text-xs sm:text-sm text-gray-400 line-clamp-2">
            {description}
          </p>
        </CardContent>
      )}

      <CardFooter className="fold:p-3 p-4 sm:p-5 flex flex-col xs:flex-row xs:items-center gap-3 pt-3 border-t border-white/10">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
          <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-purple-400/70" />
          <span className="truncate">{formatDate(createdAt)}</span>
        </div>
        <div className="flex flex-wrap gap-2 xs:justify-end xs:ml-auto">
          <LikeButton materialId={id} className="flex-shrink-0" />

          <Button
            size="sm"
            onClick={onView}
            className="flex-1 xs:flex-none font-bold text-white transition-all duration-300 hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
              boxShadow: "0 4px 15px rgba(139, 92, 246, 0.3)",
            }}
            data-testid="button-view-file"
          >
            <Eye className="w-3.5 h-3.5 xs:w-4 xs:h-4 xs:mr-1.5" />
            <span className="hidden xs:inline text-xs sm:text-sm">Megnyitás</span>
          </Button>
          {isAdmin && onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="flex-1 xs:flex-none border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-400 transition-all"
              data-testid="button-edit-file"
            >
              <Edit className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
            </Button>
          )}
          {isAdmin && onSendEmail && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSendEmail}
              className="flex-1 xs:flex-none border-pink-500/30 text-pink-400 hover:bg-pink-500/20 hover:border-pink-400 transition-all"
              data-testid="button-send-email"
            >
              <Send className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              className="flex-1 xs:flex-none border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-400 transition-all"
              data-testid="button-delete-file"
            >
              <Trash2 className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
