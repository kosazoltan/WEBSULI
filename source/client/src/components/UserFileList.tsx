import { useState } from "react";
import { Search, FileCode, ShieldCheck, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFileIcon } from "@/lib/iconUtils";
import HeroSection from "@/components/HeroSection";
import LikeButton from "@/components/LikeButton";
import ScientificBackground from "@/components/ScientificBackground";
import { CLASSROOM_VALUES, getClassroomLabel } from "@shared/classrooms";

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

export default function UserFileList({ files, isLoading, onViewFile, onToggleView }: UserFileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState<number | null>(null);

  // Filter by search query AND selected classroom
  const filteredFiles = files
    .filter(file => {
      const matchesSearch = file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (file.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClassroom = selectedClassroom === null || file.classroom === selectedClassroom;
      return matchesSearch && matchesClassroom;
    })
    // ALWAYS sort by newest first in normal view (ignore displayOrder from admin)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative">
      {/* Tudományos háttér animáció */}
      <ScientificBackground />

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
          <div className="grid grid-cols-1 sm:grid-cols-2 tablet:grid-cols-3 xl:grid-cols-4 foldable:grid-cols-5 uw:grid-cols-6 gap-3 sm:gap-4 tablet:gap-5 xl:gap-6" data-testid="list-files">
            {filteredFiles.map((file) => {
              const Icon = getFileIcon(file.title, file.description || undefined);
              const classroom = file.classroom ?? 1;
              return (
                <Card
                  key={file.id}
                  className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-[0_20px_50px_rgba(34,211,238,0.3),0_10px_30px_rgba(236,72,153,0.2)] hover:-translate-y-2 hover:scale-[1.03] backdrop-blur-lg border-2 border-cyan-400/30 hover:border-cyan-400/70 dark:border-cyan-400/40 dark:hover:border-cyan-400/80 relative rounded-2xl shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20"
                  onClick={() => onViewFile(file)}
                  data-testid={`link-file-${file.id}`}
                  style={{
                    background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(34, 211, 238, 0.15) 25%, rgba(236, 72, 153, 0.15) 50%, rgba(192, 132, 252, 0.15) 75%, rgba(31, 41, 55, 0.95) 100%)',
                    boxShadow: '0 0 20px rgba(34, 211, 238, 0.1), inset 0 0 20px rgba(34, 211, 238, 0.05)'
                  }}
                >
                  {/* Cyberpunk neon shimmer effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" 
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.1) 25%, rgba(236, 72, 153, 0.1) 50%, rgba(192, 132, 252, 0.1) 75%, transparent 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'cyberpunk-shimmer 3s ease-in-out infinite'
                    }}
                  />
                  
                  {/* Cyberpunk corner accents */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400/50 rounded-tl-xl opacity-50 group-hover:opacity-100 group-hover:border-cyan-400 transition-opacity" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-pink-500/50 rounded-tr-xl opacity-50 group-hover:opacity-100 group-hover:border-pink-500 transition-opacity" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-purple-400/50 rounded-bl-xl opacity-50 group-hover:opacity-100 group-hover:border-purple-400 transition-opacity" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400/50 rounded-br-xl opacity-50 group-hover:opacity-100 group-hover:border-cyan-400 transition-opacity" />

                  {/* Cyberpunk grid decoration */}
                  <div className="absolute top-0 right-0 w-20 h-20 opacity-30 group-hover:opacity-60 pointer-events-none transition-opacity">
                    <svg className="w-full h-full text-cyan-400" viewBox="0 0 80 80" style={{ filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.6))' }}>
                      <line x1="0" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                      <line x1="20" y1="0" x2="20" y2="80" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                      <circle cx="20" cy="20" r="3" fill="currentColor" fillOpacity="0.8" />
                    </svg>
                  </div>

                  <CardContent className="fold:p-3 p-4 sm:p-5 relative">
                    {/* Icon + Badge */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 rounded-2xl bg-gradient-to-br from-gray-700/80 via-gray-600/60 to-gray-700/80 dark:from-gray-800/80 dark:via-gray-700/60 dark:to-gray-800/80 group-hover:from-cyan-500/20 group-hover:via-pink-500/20 group-hover:to-purple-500/20 transition-all duration-300 shadow-md group-hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] border border-gray-600/30 group-hover:border-cyan-400/50">
                        <Icon className="w-7 h-7 text-gray-300 dark:text-gray-300 group-hover:text-cyan-400 dark:group-hover:text-cyan-400 transition-colors drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-gradient-to-r from-cyan-600 to-purple-600 text-white border-cyan-400/50 font-semibold text-xs shadow-md shadow-cyan-500/30"
                      >
                        {getClassroomLabel(classroom, true)}
                      </Badge>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-gray-100 dark:text-gray-100 mb-2 line-clamp-2 group-hover:text-cyan-400 dark:group-hover:text-cyan-400 transition-colors drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
                      {file.title}
                    </h3>

                    {/* Description */}
                    {file.description && (
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                        {file.description}
                      </p>
                    )}

                    {/* Like Button + Hover Indicator */}
                    <div className="pt-3 border-t border-cyan-400/30 dark:border-cyan-400/30 group-hover:border-cyan-400/60 transition-colors flex items-center justify-between gap-2">
                      <LikeButton
                        materialId={file.id}
                        className="flex-shrink-0"
                      />
                      <span className="text-xs text-cyan-400 dark:text-cyan-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
                        ⚗️ Megtekintés
                      </span>
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
