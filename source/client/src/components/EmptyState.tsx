import { FileCode } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="text-center py-16 px-4">
      <div className="max-w-md mx-auto">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
          <FileCode className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Még nincsenek HTML fájlok
        </h3>
        <p className="text-muted-foreground">
          A HTML anyagokat az Admin panelen töltheted fel.
        </p>
      </div>
    </div>
  );
}
