import { useState, useMemo, useEffect, memo } from "react";
import { Search, FileCode, ShieldCheck, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFileIcon } from "@/lib/iconUtils";
import HeroSection from "@/components/HeroSection";
import LikeButton from "@/components/LikeButton";
import { CLASSROOM_VALUES, getClassroomLabel } from "@shared/classrooms";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";

interface HtmlFileApi {
  id: string;
  userId: string | null;
  title: string;
  content: string;
  description: string | null;
  classroom: number;
  createdAt: string;
}

interface UserFileListProps {
  files: HtmlFileApi[];
  isLoading: boolean;
  onViewFile: (file: HtmlFileApi) => void;
  onToggleView?: () => void;
}

function UserFileList({ files, isLoading, onViewFile, onToggleView }: UserFileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState<number | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  // Load fingerprint once on mount
  useEffect(() => {
    getFingerprint().then(setFingerprint).catch(() => setFingerprint("anonymous"));
  }, []);

  // Filter by search query AND selected classroom - OPTIMIZED with useMemo
  const filteredFiles = useMemo(() => {
    return files
      .filter(file => {
        const matchesSearch = file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (file.description || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesClassroom = selectedClassroom === null || file.classroom === selectedClassroom;
        return matchesSearch && matchesClassroom;
      })
      // ALWAYS sort by newest first in normal view (ignore displayOrder from admin)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [files, searchQuery, selectedClassroom]);

  // Batch fetch likes for all visible files
  const materialIds = useMemo(() => filteredFiles.map(f => f.id), [filteredFiles]);
  
  const { data: batchLikesData } = useQuery<Record<string, { liked: boolean; totalLikes: number }>>({
    queryKey: ["/api/materials/likes/batch", materialIds.sort().join(","), fingerprint],
    queryFn: async () => {
      if (!fingerprint || materialIds.length === 0) return {};
      return await apiRequest("POST", "/api/materials/likes/batch", {
        materialIds,
        fingerprint,
      });
    },
    enabled: !!fingerprint && materialIds.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Stats - computed from FULL dataset (not filtered)
  const totalFiles = files.length;
  const allClassrooms = new Set(files.map(f => f.classroom ?? 1));
  const totalClassrooms = allClassrooms.size;
  const availableClassrooms = Array.from(allClassrooms).sort((a, b) => a - b);

  // All classrooms 0-12 for filter buttons (regardless of data presence)
  const allClassroomButtons = CLASSROOM_VALUES;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mx-auto mb-4"></div>
            <div className="h-4 w-32 bg-muted rounded mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Admin Toggle */}
          {onToggleView && (
            <div className="flex justify-end mb-6">
              <Button
                onClick={onToggleView}
                variant="outline"
                className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm"
                data-testid="button-toggle-admin-view"
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Admin nézet</span>
                <span className="sm:hidden">Admin</span>
              </Button>
            </div>
          )}

          {/* Hero Section */}
          <HeroSection showEmailSubscribe={false} />

          {/* Empty State */}
          <div className="text-center py-16">
            <Card className="max-w-md mx-auto bg-gray-800/80 dark:bg-gray-900/80 backdrop-blur-sm border-2 border-cyan-400/30 shadow-lg shadow-cyan-500/10">
              <CardContent className="pt-12 pb-12">
                <FileCode className="w-20 h-20 mx-auto mb-6 text-muted-foreground" />
                <h3 className="text-2xl font-semibold text-foreground mb-3">
                  Még nincsenek anyagok
                </h3>
                <p className="text-muted-foreground">
                  Hamarosan érkeznek az első tananyagok!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background is handled by index.css global styles now */}

      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-4 tablet:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        {/* Admin Toggle */}
        {onToggleView && (
          <div className="flex justify-end mb-4 sm:mb-6">
            <Button
              onClick={onToggleView}
              variant="outline"
              className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm text-xs sm:text-sm"
              data-testid="button-toggle-admin-view"
            >
              <ShieldCheck className="w-3.5 h-3.5 xs:w-4 xs:h-4 mr-1.5 xs:mr-2" />
              <span className="hidden xs:inline">Admin nézet</span>
              <span className="xs:hidden">Admin</span>
            </Button>
          </div>
        )}

        {/* Hero Section */}
        <HeroSection
          totalFiles={totalFiles}
          totalClassrooms={totalClassrooms}
          showEmailSubscribe={true}
        />

        {/* Classroom Filter Buttons */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-base xs:text-lg font-semibold text-gray-100 mb-3 sm:mb-4 text-center xs:text-left drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
            Válassz osztályt:
          </h2>
          <div className="flex flex-wrap gap-2 xs:gap-2.5 sm:gap-3 justify-center xs:justify-start">
            <Button
              variant="outline"
              size="default"
              onClick={() => setSelectedClassroom(null)}
              className={`text-xs xs:text-sm min-h-12 relative overflow-hidden ${selectedClassroom === null
                ? "bg-gradient-to-r from-cyan-600 to-purple-600 text-white border-cyan-400 shadow-lg shadow-cyan-500/30"
                : "bg-gray-800/80 dark:bg-gray-900/80 backdrop-blur-sm border-cyan-400/30 hover:border-cyan-400/70 text-gray-100 hover-elevate"
                }`}
              data-testid="button-filter-all"
            >
              {/* Dotted pattern sarok */}
              <div className="absolute top-0 right-0 w-8 h-8 dotted-pattern opacity-35 pointer-events-none"></div>
              <BookOpen className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 mr-1.5 xs:mr-2" />
              <span className="hidden xs:inline">Minden osztály</span>
              <span className="xs:hidden">Minden</span>
            </Button>
            {allClassroomButtons.map((classroom) => {
              const isActive = selectedClassroom === classroom;
              const hasFiles = availableClassrooms.includes(classroom);
              return (
                <Badge
                  key={classroom}
                  variant={isActive ? "default" : "outline"}
                  className={`cursor-pointer text-xs sm:text-sm ${isActive
                    ? "bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white border-cyan-400 shadow-md shadow-cyan-500/30"
                    : "border-cyan-400/50 text-cyan-400 bg-gray-800/50 hover:bg-gray-700/50"
                    } ${!hasFiles ? "opacity-50" : ""}`}
                  onClick={() => !hasFiles ? null : setSelectedClassroom(classroom)}
                  data-testid={`button-filter-classroom-${classroom}`}
                >
                  <span className="hidden xs:inline">{getClassroomLabel(classroom, false)}</span>
                  <span className="xs:hidden">{getClassroomLabel(classroom, true)}</span>
                  {!hasFiles && <span className="ml-1 xs:ml-2">(0)</span>}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-8 sm:mb-10">
          <div className="relative">
            <Search className="absolute left-3 xs:left-4 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-5 xs:h-5 text-muted-foreground" />
            <Input
              placeholder="Keresés cím vagy leírás alapján..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 xs:pl-12 h-10 xs:h-11 sm:h-12 text-sm xs:text-base bg-gray-800/80 dark:bg-gray-900/80 backdrop-blur-sm border-2 border-cyan-400/30 focus:border-cyan-400/70 text-gray-100 placeholder:text-gray-400 shadow-md shadow-cyan-500/10 focus:shadow-cyan-500/20"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Files Grid - Chronological Order (Newest First) */}
        {filteredFiles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 tablet:grid-cols-3 xl:grid-cols-4 foldable:grid-cols-5 uw:grid-cols-6 gap-4 sm:gap-6" data-testid="list-files" id="content-start">
            {filteredFiles.map((file, index) => {
              const Icon = getFileIcon(file.title, file.description || undefined);
              const classroom = file.classroom ?? 1;
              return (
                <Card
                  key={file.id}
                  className="group holographic-card cursor-pointer border-0 animate-slide-in-up"
                  onClick={() => onViewFile(file)}
                  data-testid={`link-file-${file.id}`}
                  style={{ animationDelay: `${Math.min(index * 0.05, 1)}s` }}
                >
                  <CardContent className="p-6 flex flex-col h-full relative">

                    {/* Top Row: Playful Icon & Badge */}
                    <div className="flex justify-between items-start mb-4">
                        <div className={`sticker p-3 rounded-2xl ${
                             classroom <= 4 ? "bg-gradient-to-br from-green-400/20 to-green-600/20 text-green-400" :
                             classroom <= 8 ? "bg-gradient-to-br from-cyan-400/20 to-cyan-600/20 text-cyan-400" :
                             "bg-gradient-to-br from-pink-400/20 to-purple-600/20 text-pink-400"
                        }`}>
                            <Icon className="w-7 h-7" />
                        </div>

                        <Badge variant="outline" className={`text-xs font-bold ${
                          classroom <= 4 ? "border-green-400/50 text-green-400 bg-green-400/10" :
                          classroom <= 8 ? "border-cyan-400/50 text-cyan-400 bg-cyan-400/10" :
                          "border-pink-400/50 text-pink-400 bg-pink-400/10"
                        }`}>
                            {getClassroomLabel(classroom, true)}
                        </Badge>
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                        <h3 className={`text-lg font-black mb-2 line-clamp-2 leading-tight group-hover:scale-105 transition-transform ${
                          classroom <= 4 ? "text-foreground group-hover:text-neon-purple" :
                          classroom <= 8 ? "text-foreground group-hover:text-neon-cyan" :
                          "text-foreground group-hover:text-neon-pink"
                        }`}>
                            {file.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                            {file.description || "🚀 Töltsd be a tudást és lépj szintet!"}
                        </p>
                    </div>

                    {/* Fun Footer with Like & Arrow */}
                    <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                         <LikeButton
                            materialId={file.id}
                            className="btn-bouncy"
                            initialLikeStatus={batchLikesData?.[file.id]}
                         />

                         {/* Playful Arrow with Gradient */}
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center comic-border transition-all ${
                           classroom <= 4 ? "border-green-400 text-green-400 group-hover:bg-green-400 group-hover:text-background" :
                           classroom <= 8 ? "border-cyan-400 text-cyan-400 group-hover:bg-cyan-400 group-hover:text-background" :
                           "border-pink-400 text-pink-400 group-hover:bg-pink-400 group-hover:text-background"
                         }`}>
                            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                         </div>
                    </div>

                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <Card className="max-w-md mx-auto bg-gray-800/80 dark:bg-gray-900/80 backdrop-blur-sm border-2 border-cyan-400/30 shadow-lg shadow-cyan-500/10">
              <CardContent className="pt-12 pb-12">
                <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg text-muted-foreground mb-2">
                  {selectedClassroom !== null ? (
                    <>
                      Nincs találat a(z) <strong>{selectedClassroom}. osztályban</strong>
                      {searchQuery && (
                        <>
                          {" "}a keresésre: <strong>"{searchQuery}"</strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Nincs találat a keresésre: <strong>"{searchQuery}"</strong>
                    </>
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedClassroom(null);
                  }}
                  className="mt-4"
                  data-testid="button-clear-filters"
                >
                  Szűrők törlése
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(UserFileList);
