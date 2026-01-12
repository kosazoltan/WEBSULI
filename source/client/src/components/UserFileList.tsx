import { useState, useMemo, useEffect, memo } from "react";
import { Search, FileCode, ShieldCheck, BookOpen, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFileIcon } from "@/lib/iconUtils";
import LikeButton from "@/components/LikeButton";
import HeroSection from "@/components/HeroSection";
import { CLASSROOM_VALUES, getClassroomLabel } from "@shared/classrooms";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { motion } from "framer-motion";

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

// Framer Motion animációk
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      damping: 15,
      stiffness: 200,
    },
  },
  hover: {
    scale: 1.03,
    y: -5,
    transition: {
      type: "spring",
      stiffness: 300,
    },
  },
};

function UserFileList({ files, isLoading, onViewFile, onToggleView }: UserFileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState<number | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  // Load fingerprint once on mount
  useEffect(() => {
    getFingerprint().then(setFingerprint).catch(() => setFingerprint("anonymous"));
  }, []);

  // Filter by search query AND selected classroom
  const filteredFiles = useMemo(() => {
    return files
      .filter((file) => {
        const matchesSearch =
          file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (file.description || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesClassroom = selectedClassroom === null || file.classroom === selectedClassroom;
        return matchesSearch && matchesClassroom;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [files, searchQuery, selectedClassroom]);

  // Batch fetch likes for all visible files
  const materialIds = useMemo(() => filteredFiles.map((f) => f.id), [filteredFiles]);

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
    staleTime: 30000,
  });

  // Stats
  const totalFiles = files.length;
  const allClassrooms = new Set(files.map((f) => f.classroom ?? 1));
  const totalClassrooms = allClassrooms.size;
  const availableClassrooms = Array.from(allClassrooms).sort((a, b) => a - b);

  if (isLoading) {
    return (
      <div className="min-h-screen relative">
        <div className="container py-16 text-center relative z-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted/20 rounded mx-auto" />
            <div className="h-4 w-32 bg-muted/20 rounded mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="min-h-screen relative">
        <div className="container py-12 relative z-10">
          {onToggleView && (
            <div className="flex justify-end mb-6">
              <Button onClick={onToggleView} variant="outline" data-testid="button-toggle-admin-view">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Admin nézet
              </Button>
            </div>
          )}

          <div className="text-center py-16">
            <Card className="max-w-md mx-auto">
              <CardContent className="pt-12 pb-12">
                <FileCode className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
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
      <div className="container py-6 relative z-10">
        {/* Admin Toggle */}
        {onToggleView && (
          <div className="flex justify-end mb-4">
            <Button onClick={onToggleView} variant="outline" data-testid="button-toggle-admin-view">
              <ShieldCheck className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Admin nézet</span>
              <span className="sm:hidden">Admin</span>
            </Button>
          </div>
        )}

        {/* Hero Section */}
        <HeroSection
          totalFiles={totalFiles}
          totalClassrooms={totalClassrooms}
          showEmailSubscribe={true}
        />

        {/* Classroom Filter - kontrasztos osztály szűrők sötét háttérhez */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white mb-4 text-center drop-shadow-lg flex items-center justify-center gap-2">
            <BookOpen className="w-5 h-5" />
            Osztályok szerint szűrés
          </h2>
          <div className="flex flex-wrap gap-3 justify-center items-center">
            <Button
              variant={selectedClassroom === null ? "default" : "outline"}
              size="default"
              onClick={() => setSelectedClassroom(null)}
              data-testid="button-filter-all"
              className={`font-semibold ${
                selectedClassroom === null
                  ? "bg-gradient-to-r from-[#FB923C] to-[#EAB308] text-white border-0 shadow-lg shadow-orange-500/50"
                  : "bg-white/20 hover:bg-white/30 text-white border-white/40 backdrop-blur-md"
              }`}
            >
              Minden osztály
            </Button>
            {CLASSROOM_VALUES.map((classroom) => {
              const hasFiles = availableClassrooms.includes(classroom);
              return (
                <Badge
                  key={classroom}
                  variant={selectedClassroom === classroom ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-2 px-4 font-semibold backdrop-blur-sm ${
                    selectedClassroom === classroom
                      ? "bg-gradient-to-r from-[#FB923C] to-[#EAB308] text-white border-0 shadow-lg shadow-orange-500/50"
                      : "bg-white/20 hover:bg-white/30 text-white border-white/40 backdrop-blur-md"
                  } ${
                    !hasFiles ? "opacity-50 cursor-not-allowed" : ""
                  } transition-all duration-200`}
                  onClick={() => (hasFiles ? setSelectedClassroom(classroom) : null)}
                  data-testid={`button-filter-classroom-${classroom}`}
                >
                  {getClassroomLabel(classroom, false)}
                  {!hasFiles && " (0)"}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Search - kontrasztos kereső mező sötét háttérhez */}
        <div className="max-w-xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/70 z-10" />
            <Input
              placeholder="Keresés tananyag után..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-white/20 backdrop-blur-md border-white/40 text-white placeholder:text-white/60 focus:bg-white/30 focus:border-white/60 focus-visible:ring-white/50"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Files Grid - Bento Style with Framer Motion */}
        {filteredFiles.length > 0 ? (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr"
            data-testid="list-files"
            id="content-start"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredFiles.map((file, index) => {
              const Icon = getFileIcon(file.title, file.description || undefined);
              const classroom = file.classroom ?? 1;
              
              // Bento Grid: nagyobb kártyák minden 5. elemnél
              const isLarge = index % 5 === 0;
              const gridClasses = isLarge 
                ? "sm:col-span-2 lg:col-span-2" 
                : "";
              
              // Korcsoport-specifikus téma
              let themeClasses = "";
              let badgeGradient = "from-orange-600 to-amber-600";
              let iconBg = "from-orange-600/30 to-amber-600/30";
              let iconBorder = "border-orange-500/30";
              
              // Új színpaletta: elsődleges és másodlagos gradient-ek
              if (classroom >= 1 && classroom <= 4) {
                // Kid theme - vibráló gradient-ek
                themeClasses = "rounded-3xl";
                badgeGradient = "from-[#8B5CF6] to-[#EC4899]";
                iconBg = "from-[#8B5CF6]/20 to-[#EC4899]/20";
                iconBorder = "border-[#8B5CF6]/40";
              } else if (classroom >= 5 && classroom <= 8) {
                // Teen theme - elsődleges gradient
                themeClasses = "rounded-2xl";
                badgeGradient = "from-[#8B5CF6] via-[#EC4899] to-[#F97316]";
                iconBg = "from-[#8B5CF6]/20 via-[#EC4899]/20 to-[#F97316]/20";
                iconBorder = "border-[#EC4899]/40";
              } else {
                // Senior theme - másodlagos gradient
                themeClasses = "rounded-xl";
                badgeGradient = "from-[#F97316] to-[#EAB308]";
                iconBg = "from-[#F97316]/20 to-[#EAB308]/20";
                iconBorder = "border-[#F97316]/40";
              }

              return (
                <motion.div
                  key={file.id}
                  variants={cardVariants}
                  whileHover="hover"
                  className={gridClasses}
                >
                  <motion.div
                    whileHover={{ scale: 1.03, y: -5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Card
                      className={`group cursor-pointer glass-card h-full ${themeClasses}`}
                      onClick={() => onViewFile(file)}
                      data-testid={`link-file-${file.id}`}
                    >
                    <CardContent className="p-5 flex flex-col h-full">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${iconBg} backdrop-blur-md border-2 ${iconBorder} shadow-xl transition-all group-hover:scale-110 relative z-10`}>
                          {/* Színes ikonok tananyag típus szerint */}
                          {(() => {
                            const titleLower = (file.title + ' ' + (file.description || '')).toLowerCase();
                            let iconColor = '';
                            
                            // Földrajz - zöld/türkiz színek
                            if (titleLower.includes('földrajz') || titleLower.includes('geography') || titleLower.includes('geo') || titleLower.includes('hegy') || titleLower.includes('folyó') || titleLower.includes('river') || titleLower.includes('mountain') || titleLower.includes('víz') || titleLower.includes('water') || titleLower.includes('térkép') || titleLower.includes('map') || titleLower.includes('világ') || titleLower.includes('world')) {
                              iconColor = 'text-emerald-500';
                            }
                            // Angol - kék/vörös (zászló színek)
                            else if (titleLower.includes('angol') || titleLower.includes('english') || titleLower.includes('brit') || titleLower.includes('british') || titleLower.includes('uk') || titleLower.includes('usa') || titleLower.includes('amerika') || titleLower.includes('america')) {
                              iconColor = 'text-blue-600';
                            }
                            // Történelem - barna/arany
                            else if (titleLower.includes('történelem') || titleLower.includes('history') || titleLower.includes('történelmi') || titleLower.includes('vár') || titleLower.includes('castle') || titleLower.includes('király') || titleLower.includes('king') || titleLower.includes('oklevél') || titleLower.includes('scroll')) {
                              iconColor = 'text-amber-700';
                            }
                            // Matematika - lila/kék
                            else if (titleLower.includes('matek') || titleLower.includes('matematika') || titleLower.includes('math') || titleLower.includes('mathematics') || titleLower.includes('algebra') || titleLower.includes('geometria') || titleLower.includes('geometry') || titleLower.includes('formula') || titleLower.includes('képlet') || titleLower.includes('szigma') || titleLower.includes('sigma') || titleLower.includes('egyenlet') || titleLower.includes('equation')) {
                              iconColor = 'text-purple-600';
                            }
                            // Fizika - narancs/vörös
                            else if (titleLower.includes('fizika') || titleLower.includes('physics') || titleLower.includes('atom') || titleLower.includes('energia') || titleLower.includes('energy') || titleLower.includes('villam') || titleLower.includes('lightning') || titleLower.includes('áram') || titleLower.includes('current') || titleLower.includes('zap')) {
                              iconColor = 'text-orange-600';
                            }
                            // Kémia - zöld/kék
                            else if (titleLower.includes('kémia') || titleLower.includes('chemistry') || titleLower.includes('kémiai') || titleLower.includes('vegyület') || titleLower.includes('compound') || titleLower.includes('labor') || titleLower.includes('lab') || titleLower.includes('beaker') || titleLower.includes('flask')) {
                              iconColor = 'text-green-600';
                            }
                            // Biológia - zöld
                            else if (titleLower.includes('biológia') || titleLower.includes('biology') || titleLower.includes('mikroszkóp') || titleLower.includes('microscope')) {
                              iconColor = 'text-green-500';
                            }
                            // Nyelvtan - rózsaszín/lila
                            else if (titleLower.includes('írás') || titleLower.includes('writing') || titleLower.includes('írásgyakorlat') || titleLower.includes('toll') || titleLower.includes('pen') || titleLower.includes('ceruza') || titleLower.includes('pencil') || titleLower.includes('papír') || titleLower.includes('paper') || titleLower.includes('esszé') || titleLower.includes('essay')) {
                              iconColor = 'text-pink-600';
                            }
                            // Alapértelmezett - fehér/színes gradient
                            else {
                              iconColor = 'text-white';
                            }
                            
                            return <Icon className={`w-6 h-6 ${iconColor} drop-shadow-lg`} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />;
                          })()}
                        </div>
                        <Badge 
                          className={`text-xs font-bold bg-gradient-to-r ${badgeGradient} text-white shadow-lg border-0 px-3 py-1 group-hover:bg-gradient-to-r group-hover:from-orange-500 group-hover:to-orange-600 transition-all duration-300`}
                        >
                          {getClassroomLabel(classroom, true)}
                        </Badge>
                      </div>

                      {/* Content */}
                      <div className="flex-1 mb-4">
                        <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-2 group-hover:text-orange-500 transition-all duration-300 drop-shadow-lg">
                          {file.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-3 group-hover:text-orange-400 group-hover:font-semibold transition-all duration-300">
                          {file.description || "Kattints a megtekintéshez"}
                        </p>
                      </div>

                      {/* Footer */}
                      <div className={`flex items-center justify-between pt-4 border-t ${iconBorder}`}>
                        <LikeButton
                          materialId={file.id}
                          initialLikeStatus={batchLikesData?.[file.id]}
                        />
                        <motion.div
                          className={`w-10 h-10 rounded-full bg-gradient-to-r ${badgeGradient} flex items-center justify-center transition-all`}
                          whileHover={{ scale: 1.15, rotate: 5 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <ArrowRight className="w-5 h-5 text-white" />
                        </motion.div>
                      </div>
                    </CardContent>
                    </Card>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <div className="text-center py-16">
            <Card className="max-w-md mx-auto glass-card">
              <CardContent className="pt-12 pb-12">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
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
