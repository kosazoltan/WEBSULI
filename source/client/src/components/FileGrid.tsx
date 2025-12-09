import FileCard from "./FileCard";
import { type HtmlFile } from "@shared/schema";

interface FileGridProps {
  files: HtmlFile[];
  currentUserId?: string;
  isAdmin?: boolean;
  onView: (file: HtmlFile) => void;
  onEdit?: (file: HtmlFile) => void;
  onDelete: (id: string) => void;
  onSendEmail?: (file: HtmlFile) => void;
}

export default function FileGrid({ files, currentUserId, isAdmin = false, onView, onEdit, onDelete, onSendEmail }: FileGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 tablet:grid-cols-3 xl:grid-cols-4 foldable:grid-cols-5 uw:grid-cols-6 gap-3 sm:gap-4 tablet:gap-5 xl:gap-6">
      {files.map((file) => (
        <FileCard
          key={file.id}
          id={file.id}
          userId={file.userId}
          title={file.title}
          description={file.description || undefined}
          createdAt={new Date(file.createdAt)}
          contentType={file.contentType || 'html'}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onView={() => onView(file)}
          onEdit={onEdit ? () => onEdit(file) : undefined}
          onDelete={() => onDelete(file.id)}
          onSendEmail={onSendEmail ? () => onSendEmail(file) : undefined}
        />
      ))}
    </div>
  );
}
