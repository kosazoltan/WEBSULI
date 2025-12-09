import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BookOpen, 
  Wand2, 
  FileText, 
  Users, 
  Database, 
  Mail, 
  Tag, 
  BarChart3, 
  Bell, 
  Settings,
  Upload,
  Edit,
  Trash2,
  Eye,
  ArrowLeft,
  Download,
  Code2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Info
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AdminDocumentation() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-yellow-50 to-pink-50 dark:from-background dark:via-background dark:to-background">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-to-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Vissza az Admin Dashboardra
            </Button>
          </Link>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-primary/10 rounded-lg">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Admin Dokumentáció
              </h1>
              <p className="text-muted-foreground">
                Teljes útmutató minden platform funkcióhoz
              </p>
            </div>
          </div>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>Gyors Tipp</AlertTitle>
          <AlertDescription>
            Használd a fül menüt az oldalon a különböző témák között navigáláshoz. Minden funkció részletes leírást és példákat tartalmaz.
          </AlertDescription>
        </Alert>

        {/* Main Documentation Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 h-auto p-2 bg-card">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-overview">
              <BookOpen className="w-4 h-4 mr-2" />
              Áttekintés
            </TabsTrigger>
            <TabsTrigger value="creator" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-creator">
              <Wand2 className="w-4 h-4 mr-2" />
              Material Creator
            </TabsTrigger>
            <TabsTrigger value="materials" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-materials">
              <FileText className="w-4 h-4 mr-2" />
              Anyagok
            </TabsTrigger>
            <TabsTrigger value="system" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-system">
              <Database className="w-4 h-4 mr-2" />
              Rendszer
            </TabsTrigger>
            <TabsTrigger value="advanced" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-advanced">
              <Settings className="w-4 h-4 mr-2" />
              Haladó
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Platform Áttekintés
                </CardTitle>
                <CardDescription>
                  Az "Anyagok Profiknak" admin felületének teljes bemutatása
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Mi az Anyagok Profiknak?</h3>
                  <p className="text-muted-foreground mb-4">
                    Professzionális HTML oktatóanyag platform, amely lehetővé teszi tananyagok létrehozását, 
                    feltöltését és megosztását diákokkal. A platform AI-alapú tartalomgenerálást, 
                    osztályonkénti szűrést és email értesítéseket kínál.
                  </p>
                  <Alert className="border-primary/50 bg-primary/5">
                    <Shield className="h-4 w-4 text-primary" />
                    <AlertTitle>Teljesen Nyilvános Platform</AlertTitle>
                    <AlertDescription>
                      A platform <strong>100% nyilvános</strong> - nincs bejelentkezés vagy regisztráció szükséges. 
                      Mindenki létrehozhat, szerkeszthet és törölhet anyagokat, valamint elérheti az admin funkciókat.
                    </AlertDescription>
                  </Alert>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Főbb Funkciók</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FeatureCard
                      icon={Wand2}
                      title="Enhanced Material Creator"
                      description="3-fázisú AI munkafolyamat: PDF/kép feltöltés → ChatGPT szöveggenerálás → Claude HTML készítés → Előnézet → Publikálás"
                    />
                    <FeatureCard
                      icon={FileText}
                      title="Anyag Kezelés"
                      description="Anyagok szerkesztése, törlése, bulk műveletek (többszörös törlés, email küldés, áthelyezés)"
                    />
                    <FeatureCard
                      icon={Shield}
                      title="Nyilvános Hozzáférés"
                      description="Nincs bejelentkezés - mindenki létrehozhat, szerkeszthet és törölhet anyagokat szabadon"
                    />
                    <FeatureCard
                      icon={Tag}
                      title="Tag Kezelő"
                      description="Címkék létrehozása, szerkesztése, törlése anyagok kategorizálásához"
                    />
                    <FeatureCard
                      icon={Database}
                      title="Backup Rendszer"
                      description="Teljes adatbázis export JSON formátumban, import funkció katasztrófa-helyreállításhoz"
                    />
                    <FeatureCard
                      icon={Mail}
                      title="Email Kezelés"
                      description="Extra email címek hozzáadása osztályonkénti értesítésekhez"
                    />
                    <FeatureCard
                      icon={BarChart3}
                      title="Analytics"
                      description="Anyag megtekintések, email statisztikák, osztály szerinti eloszlás"
                    />
                    <FeatureCard
                      icon={Bell}
                      title="Push Értesítések"
                      description="Böngésző push notification-ök tesztelése új anyagok feltöltésekor"
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Gyors Navigáció</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <QuickLinkCard
                      title="Enhanced Material Creator"
                      description="Anyag létrehozás AI segítséggel"
                      tab="Anyagok → Fejlett készítő"
                      badge="Leggyakoribb"
                    />
                    <QuickLinkCard
                      title="Anyag Szerkesztés"
                      description="Cím, leírás és osztály módosítása"
                      tab="Fájlok → Szerkesztés ikon"
                    />
                    <QuickLinkCard
                      title="Backup Export"
                      description="Adatbázis mentése"
                      tab="Kezelés → Backup"
                    />
                    <QuickLinkCard
                      title="Email Címek"
                      description="Értesítési email-ek kezelése"
                      tab="Beállítások → Email címek"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Enhanced Material Creator Tab */}
          <TabsContent value="creator" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5" />
                  Enhanced Material Creator
                </CardTitle>
                <CardDescription>
                  3-fázisú AI-alapú tananyag készítő rendszer
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Mi ez?</AlertTitle>
                  <AlertDescription>
                    Az Enhanced Material Creator egy varázsló alapú rendszer, amely PDF vagy kép fájlokból 
                    készít interaktív HTML tananyagot 3 lépésben AI segítségével.
                  </AlertDescription>
                </Alert>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Munkafolyamat (3 Fázis)</h3>
                  
                  <div className="space-y-4">
                    <PhaseCard
                      number={1}
                      title="Fájl Feltöltés & Elemzés"
                      icon={Upload}
                      steps={[
                        "Tölts fel egy vagy több PDF vagy JPG/PNG fájlt (max 30MB összesen)",
                        "A rendszer ChatGPT Vision API-val elemzi az összes dokumentumot",
                        "Automatikusan kinyeri a szöveget az összes fájlból és javaslatokat ad (cím, leírás, osztály, témák)",
                        "Több fájl esetén az AI kombinálja őket egyetlen tananyaggá",
                        "Ellenőrizd és módosítsd a javaslatokat szükség szerint"
                      ]}
                      tips={[
                        "PDF esetén minden fájl első oldala kerül elemzésre",
                        "Tiszta, jól látható képeket használj a jobb eredményért",
                        "A javasolt osztályt és témákat bármikor felülírhatod",
                        "Több fájl feltöltésével gazdagabb tananyagot készíthetsz"
                      ]}
                    />

                    <PhaseCard
                      number={2}
                      title="Szöveg Generálás (ChatGPT)"
                      icon={FileText}
                      steps={[
                        "A ChatGPT chat interfész megnyílik a kinyert szöveggel",
                        "Beszélgess az AI-val a tananyag szövegének finomításához",
                        "Kérd a ChatGPT-t részletesebb magyarázatokra, példákra",
                        "Az AI osztályonként eltérő stílusban ír (1-3: egyszerű, 5-7: energikus, 8+: komolyabb)",
                        "Ha elégedett vagy, kattints a 'Tovább Claude HTML generálásra' gombra"
                      ]}
                      tips={[
                        "Példa kérés: 'Fejtsd ki részletesebben a fotoszintézis lépéseit'",
                        "Példa kérés: 'Adj hozzá 3 gyakorlati példát'",
                        "A chat előzményei megmaradnak, építhetsz rájuk"
                      ]}
                    />

                    <PhaseCard
                      number={3}
                      title="HTML Generálás (Claude) & Előnézet"
                      icon={Code2}
                      steps={[
                        "A Claude AI megkapja a ChatGPT által generált szöveget",
                        "Interaktív, látványos HTML tananyagot készít belőle",
                        "Osztályonként eltérő vizuális stílust alkalmaz (színek, grafikák)",
                        "Az előnézet ablakban azonnal láthatod az eredményt",
                        "Finomítsd a HTML-t további chat üzenetekkel",
                        "Ha kész vagy, kattints a 'Publikálás a platformon' gombra"
                      ]}
                      tips={[
                        "Példa kérés Claude-nak: 'Adj hozzá egy interaktív kvízt a végére'",
                        "Példa kérés: 'Használj több animációt és képet'",
                        "Az előnézet valós időben frissül minden AI válasznál"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">AI System Prompt Testreszabás</h3>
                  <p className="text-muted-foreground mb-4">
                    Minden fázisban testreszabhatod az AI utasításokat a "System Prompt" gombbal:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>ChatGPT Prompt:</strong> Tananyag szöveg stílusa, hangnem, részletesség</li>
                    <li><strong>Claude Prompt:</strong> HTML dizájn stílus, színek, interaktivitás szintje</li>
                    <li>Az egyedi prompt-ok minden material creator session-ben használatosak</li>
                    <li>Reset gombbal visszaállíthatod az alapértelmezett prompt-okat</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Gyakori Problémák & Megoldások</h3>
                  <div className="space-y-3">
                    <ProblemSolution
                      problem="PDF elemzés sikertelen"
                      solution="Próbáld meg PNG-ként exportálni a PDF-et, majd töltsd fel képként"
                    />
                    <ProblemSolution
                      problem="AI válasz túl rövid"
                      solution="Kérd expliciten: 'Írj legalább 500 szavas részletes magyarázatot'"
                    />
                    <ProblemSolution
                      problem="HTML nem látványos"
                      solution="Kérd Claude-ot: 'Adj hozzá több színt, animációt és grafikát'"
                    />
                    <ProblemSolution
                      problem="Osztály automatikus érzékelés rossz"
                      solution="A Fázis 1-ben manuálisan állítsd be a helyes osztályt a dropdown-ból"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Materials Management Tab */}
          <TabsContent value="materials" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Anyag Kezelés
                </CardTitle>
                <CardDescription>
                  Feltöltött tananyagok szerkesztése, törlése és kezelése
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Anyag Műveletek</h3>
                  
                  <div className="space-y-4">
                    <ActionCard
                      icon={Edit}
                      title="Anyag Szerkesztése"
                      description="Kattints az anyagon a három pontra (⋮) → 'Szerkesztés'"
                      details={[
                        "Cím módosítása: Bármilyen nem üres szöveg (pl. 'Fotoszintézis magyarázat', '5. Arany János...')",
                        "Leírás módosítása: Rövid összefoglaló (opcionális)",
                        "Osztály módosítása: 1-8. osztály közötti átsorolás (független a címtől)",
                        "A cím és osztály mező most már teljesen független egymástól",
                        "A módosítások azonnal mentésre kerülnek"
                      ]}
                    />

                    <ActionCard
                      icon={Trash2}
                      title="Anyag Törlése"
                      description="Három pont (⋮) → 'Törlés' → Megerősítés"
                      details={[
                        "FIGYELEM: A törlés végleges és visszavonhatatlan!",
                        "A törölt anyag minden adata elvész (HTML, metaadatok, statisztikák)",
                        "Törlés előtt mindig készíts backup-ot a Backup Manager-rel"
                      ]}
                    />

                    <ActionCard
                      icon={Eye}
                      title="Anyag Előnézet"
                      description="Kattints az anyag kártyára a teljes HTML előnézethez"
                      details={[
                        "A Preview oldal megjeleníti a teljes interaktív tartalmat",
                        "TTS (Text-to-Speech) funkció elérhető olvasáshoz",
                        "URL másolása egy kattintással megosztáshoz",
                        "Mobilbarát nézet automatikusan optimalizálva"
                      ]}
                    />

                    <ActionCard
                      icon={Mail}
                      title="Email Értesítés Küldése"
                      description="Három pont (⋮) → 'Email küldése'"
                      details={[
                        "Email küldése az anyagról az osztályhoz rendelt előfizetőknek",
                        "Választhatsz az előre mentett email címekből",
                        "Adhatsz meg egyedi email címet is (vessző-szeparált lista)",
                        "Az email tartalmazza az anyag címét, leírását és linkjét"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Bulk Műveletek (Tömeges)</h3>
                  <p className="text-muted-foreground mb-4">
                    Egyszerre több anyagon végezz műveleteket:
                  </p>
                  
                  <div className="space-y-3">
                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <h4 className="font-semibold mb-2">Kiválasztás</h4>
                          <p className="text-sm text-muted-foreground">
                            Jelöld be a kívánt anyagok melletti checkbox-okat. 
                            A "Minden kijelölése" gomb az összes látható anyagot kijelöli.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Trash2 className="w-5 h-5 text-destructive mt-0.5" />
                        <div>
                          <h4 className="font-semibold mb-2">Bulk Törlés</h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            A kiválasztott anyagok törlése egyszerre. 
                            Megerősítő dialógus jelenik meg a veszélyes művelet előtt.
                          </p>
                          <Badge variant="destructive">Visszavonhatatlan!</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Mail className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <h4 className="font-semibold mb-2">Bulk Email</h4>
                          <p className="text-sm text-muted-foreground">
                            Email értesítés küldése az összes kiválasztott anyagról egyszerre. 
                            Hasznos havi összesítőkhöz vagy tematikus anyagok kiküldéséhez.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <h4 className="font-semibold mb-2">Bulk Osztály Áthelyezés</h4>
                          <p className="text-sm text-muted-foreground">
                            Az összes kiválasztott anyag átsorolása egy másik osztályba. 
                            Például: 4. osztályos anyagok átsorolása 5. osztályba.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Keresés & Szűrés</h3>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>Keresés:</strong> Anyag címében és leírásában keres valós időben</li>
                    <li><strong>Osztály szűrő:</strong> Csak egy adott osztály anyagainak megjelenítése</li>
                    <li><strong>"Minden osztály":</strong> Az összes anyag megjelenítése szűrő nélkül</li>
                    <li>A szűrők kombinálhatók (pl. "matematika" keresés + "5. osztály" szűrő)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Tab */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Rendszer Kezelés
                </CardTitle>
                <CardDescription>
                  Backup, tag-ek és email kezelés
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert className="mb-6">
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Nyilvános Platform</AlertTitle>
                  <AlertDescription>
                    Ez a platform teljesen nyilvános - nincs felhasználó kezelés vagy bejelentkezés. 
                    Mindenki létrehozhat, szerkeszthet és törölhet anyagokat szabadon.
                  </AlertDescription>
                </Alert>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Backup Manager</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Kezelés → Backup</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Backup Export"
                      description="Teljes adatbázis mentése JSON fájlba"
                      features={[
                        "Kattints a 'Backup exportálása' gombra",
                        "Automatikus fájl letöltés: anyagok-backup-YYYY-MM-DD.json",
                        "Tartalmazza: összes anyag, felhasználó, email subscription",
                        "Ajánlott: Készíts backup-ot MINDEN nagyobb művelet előtt!"
                      ]}
                    />

                    <SystemFeature
                      title="Backup Import"
                      description="Korábbi backup visszaállítása"
                      features={[
                        "Válaszd ki a mentett JSON fájlt",
                        "Kattints az 'Import indítása' gombra",
                        "VIGYÁZAT: Ez felülírja a jelenlegi adatokat!",
                        "Használd katasztrófa esetén vagy teszt környezet visszaállításához"
                      ]}
                    />

                    <SystemFeature
                      title="Forrás Kód Export"
                      description="Teljes projekt forráskódjának letöltése"
                      features={[
                        "Kattints a 'Forrás kód letöltése' gombra",
                        "ZIP fájl letöltése az összes kóddal",
                        "Hasznos: helyi development, verzió backup, audit"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Tag Manager</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Kezelés → Tag-ek</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Tag Létrehozása"
                      description="Új címke hozzáadása anyagok kategorizálásához"
                      features={[
                        "Adj meg egy tag nevet (pl. 'Matematika', 'Fizika')",
                        "Opcionális: Leírás és szín beállítása",
                        "Kattints a 'Tag hozzáadása' gombra",
                        "A tag azonnal használható lesz anyagoknál"
                      ]}
                    />

                    <SystemFeature
                      title="Tag Törlése"
                      description="Felesleges tag-ek eltávolítása"
                      features={[
                        "Kattints a piros Trash ikonra",
                        "Megerősítő dialógus jelenik meg",
                        "A tag eltávolításra kerül az összes anyagról is"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Email Kezelés</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Beállítások → Email címek</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Email Cím Hozzáadása"
                      description="Extra email címek hozzáadása osztályonkénti értesítésekhez"
                      features={[
                        "Adj meg egy email címet",
                        "Válaszd ki a kívánt osztályokat (checkbox-ok)",
                        "Kattints a 'Hozzáadás' gombra",
                        "Az email cím értesítést kap az adott osztályok új anyagairól"
                      ]}
                    />

                    <SystemFeature
                      title="Osztályok Szerkesztése"
                      description="Email címhez rendelt osztályok módosítása"
                      features={[
                        "Kattints az Edit ikonra az email mellett",
                        "Módosítsd a kiválasztott osztályokat",
                        "Mentsd el a változtatásokat"
                      ]}
                    />

                    <SystemFeature
                      title="Email Cím Törlése"
                      description="Email cím eltávolítása az értesítési listáról"
                      features={[
                        "Kattints a Trash ikonra",
                        "Megerősítsd a törlést",
                        "Az email cím nem kap több értesítést"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Adatbázis Információk</h3>
                  <p className="text-muted-foreground mb-4">
                    A Database tab-on találod az adatbázis statisztikákat:
                  </p>
                  
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>Tananyagok száma:</strong> Összes feltöltött HTML anyag</li>
                    <li><strong>Felhasználók száma:</strong> Regisztrált felhasználók</li>
                    <li><strong>Táblák listája:</strong> Adatbázis struktúra áttekintése</li>
                    <li><strong>Database URL:</strong> PostgreSQL kapcsolati információk</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Haladó Funkciók
                </CardTitle>
                <CardDescription>
                  Analytics, push értesítések és AI testreszabás
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Analytics & Statisztikák</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Beállítások → Megtekintések</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Anyag Megtekintések"
                      description="Részletes statisztikák minden anyag megtekintéséről"
                      features={[
                        "Anyag címe, leírása, osztály",
                        "Megtekintések száma anyagonként",
                        "Utolsó megtekintés időpontja",
                        "User agent információk (böngésző, eszköz)"
                      ]}
                    />

                    <SystemFeature
                      title="Email Statisztikák"
                      description="Küldött email-ek nyomon követése"
                      features={[
                        "Kiknek küldtél email-t (címzettek listája)",
                        "Mely anyagokról (anyag címek)",
                        "Mikor küldted (dátum, időpont)",
                        "Sikeres/sikertelen küldések"
                      ]}
                    />

                    <SystemFeature
                      title="Osztály Eloszlás"
                      description="Anyagok megoszlása osztályonként"
                      features={[
                        "Hány anyag van osztályonként (1-8)",
                        "Diagram megjelenítés a jobb áttekintéshez",
                        "Segít azonosítani, mely osztályok igényelnek több tartalmat"
                      ]}
                    />

                    <SystemFeature
                      title="Top Anyagok"
                      description="Legnépszerűbb tananyagok rangsora"
                      features={[
                        "A legtöbbet megtekintett anyagok listája",
                        "Megtekintési számok",
                        "Hasznos a leghatékonyabb tartalmak azonosításához"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Push Értesítések</h3>
                  <p className="text-muted-foreground mb-4">
                    Böngésző push notification-ök tesztelése és kezelése
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Push Notification Küldése"
                      description="Teszt értesítés küldése előfizetett felhasználóknak"
                      features={[
                        "A platform automatikusan push notification-t küld új anyag feltöltésekor",
                        "A felhasználóknak engedélyezniük kell a böngészőben",
                        "VAPID kulcsok használata biztonságos kommunikációhoz",
                        "Támogatott böngészők: Chrome, Firefox, Edge, Safari"
                      ]}
                    />

                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Fontos</AlertTitle>
                      <AlertDescription>
                        A push értesítések csak HTTPS kapcsolaton keresztül működnek (websuli.org).
                        Helyi development során nem tesztelhetők.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">AI System Prompt Testreszabás</h3>
                  <p className="text-muted-foreground mb-4">
                    Az AI generátorok működésének testreszabása egyedi utasításokkal
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="ChatGPT System Prompt"
                      description="Szöveggeneráló AI utasításainak módosítása"
                      features={[
                        "Elérhető az Enhanced Material Creator-ban a 'System Prompt' gombbal",
                        "Módosíthatod a szöveg stílusát, hangnemét, részletességét",
                        "Példa: 'Írj rövidebb, tömörebb tananyagokat' vagy 'Használj több példát'",
                        "Az új prompt azonnal érvénybe lép a következő generálásnál"
                      ]}
                    />

                    <SystemFeature
                      title="Claude System Prompt"
                      description="HTML generáló AI utasításainak módosítása"
                      features={[
                        "Elérhető az Enhanced Material Creator Claude fázisában",
                        "Módosíthatod a HTML dizájn stílusát, színeket, interaktivitást",
                        "Példa: 'Használj több animációt' vagy 'Legyen minimalista dizájn'",
                        "Reset gombbal visszaállíthatod az alapértelmezett prompt-ot"
                      ]}
                    />

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Tipp</AlertTitle>
                      <AlertDescription>
                        Az AI prompt-ok persisted (elmentődnek) a session alatt. 
                        Ha új beállításokat szeretnél, módosítsd a prompt-ot MIELŐTT elkezded a chat-et.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Haladó Tippek & Trükkök</h3>
                  
                  <div className="space-y-3">
                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Batch Anyag Készítés</h4>
                      <p className="text-sm text-muted-foreground">
                        Készíts több anyagot egymás után ugyanazzal a témával különböző osztályokhoz. 
                        Az AI megjegyzi a kontextust, gyorsabb lesz a generálás.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Anyag Újrahasznosítás</h4>
                      <p className="text-sm text-muted-foreground">
                        Ha egy anyag jól sikerült, szerkeszd meg és mentsd el más címmel/osztállyal. 
                        Így több verziót tarthatsz fent ugyanabból a tartalomból.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Rendszeres Backup</h4>
                      <p className="text-sm text-muted-foreground">
                        Állíts be heti/havi backup rutint. Töltsd le a JSON fájlt és mentsd el biztonságos helyre 
                        (Google Drive, Dropbox stb.). Ez megment adatvesztéstől.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Email Lista Karbantartás</h4>
                      <p className="text-sm text-muted-foreground">
                        Rendszeresen ellenőrizd az Extra Email címek listáját. 
                        Távolítsd el az inaktív vagy érvénytelen címeket az email bounce-ok elkerülése érdekében.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Tag Stratégia</h4>
                      <p className="text-sm text-muted-foreground">
                        Használj konzisztens tag-eket (pl. 'Matematika', 'Fizika', 'Történelem'). 
                        Ez megkönnyíti a keresést és a bulk műveleteket később.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Biztonság & Adatvédelem
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Biztonság Első!</AlertTitle>
                  <AlertDescription>
                    Az Anyagok Profiknak platform többszörös biztonsági rétegekkel rendelkezik:
                  </AlertDescription>
                </Alert>

                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li><strong>Multi-Admin Access:</strong> Két admin fiók rendelkezik jogosultsággal:
                    <ul className="ml-6 mt-1 space-y-1">
                      <li>• kosa.zoltan.ebc@gmail.com (Főadmin)</li>
                      <li>• mszilva78@gmail.com (Máté Szilvia)</li>
                    </ul>
                  </li>
                  <li><strong>Session Management:</strong> 30 perces inaktivitás után automatikus kijelentkezés</li>
                  <li><strong>XSS Protection:</strong> Minden user input sanitizálva van DOMPurify-val</li>
                  <li><strong>HTTPS Only:</strong> Éles környezetben csak biztonságos kapcsolat</li>
                  <li><strong>Content Security Policy:</strong> Helmet middleware védi az alkalmazást</li>
                  <li><strong>Secure Cookies:</strong> HttpOnly, Secure, SameSite beállítások</li>
                  <li><strong>Database Backup:</strong> Neon PostgreSQL Point-in-Time Restore</li>
                </ul>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-2">Best Practices</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Soha ne oszd meg az admin email jelszavát</li>
                    <li>Rendszeresen ellenőrizd a felhasználók listáját gyanús aktivitásért</li>
                    <li>Készíts backup-ot minden kritikus művelet előtt</li>
                    <li>Ne töröld magadat admin jogosultságból</li>
                    <li>Figyelj az email statisztikákra spam/abuse jelekért</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <Card className="mt-8 bg-gradient-to-r from-cyan-50 to-purple-50 dark:from-background dark:to-background">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              További kérdések esetén lépj kapcsolatba az admin-nal vagy nézd meg a Replit dokumentációt.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/admin">
                <Button variant="outline" data-testid="button-footer-back-to-admin">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Vissza az Admin Dashboardra
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" data-testid="button-footer-public-view">
                  <Eye className="w-4 h-4 mr-2" />
                  Nyilvános Nézet
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Helper Components

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="border rounded-lg p-4 hover-elevate">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h4 className="font-semibold mb-1">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function QuickLinkCard({ title, description, tab, badge }: { title: string; description: string; tab: string; badge?: string }) {
  return (
    <div className="border rounded-lg p-4 hover-elevate">
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold">{title}</h4>
        {badge && <Badge variant="secondary">{badge}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground mb-2">{description}</p>
      <p className="text-xs text-primary font-medium">{tab}</p>
    </div>
  );
}

function PhaseCard({ number, title, icon: Icon, steps, tips }: { number: number; title: string; icon: any; steps: string[]; tips: string[] }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
          {number}
        </div>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <h4 className="font-semibold">{title}</h4>
        </div>
      </div>
      
      <div className="ml-11 space-y-3">
        <div>
          <p className="text-sm font-medium mb-2">Lépések:</p>
          <ol className="list-decimal list-inside space-y-1">
            {steps.map((step, i) => (
              <li key={i} className="text-sm text-muted-foreground">{step}</li>
            ))}
          </ol>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Tippek:
          </p>
          <ul className="list-disc list-inside space-y-1">
            {tips.map((tip, i) => (
              <li key={i} className="text-sm text-muted-foreground">{tip}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, title, description, details }: { icon: any; title: string; description: string; details: string[] }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h4 className="font-semibold mb-1">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      
      <ul className="ml-11 list-disc list-inside space-y-1">
        {details.map((detail, i) => (
          <li key={i} className="text-sm text-muted-foreground">{detail}</li>
        ))}
      </ul>
    </div>
  );
}

function SystemFeature({ title, description, features }: { title: string; description: string; features: string[] }) {
  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-semibold mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground mb-3">{description}</p>
      <ul className="list-disc list-inside space-y-1">
        {features.map((feature, i) => (
          <li key={i} className="text-sm text-muted-foreground">{feature}</li>
        ))}
      </ul>
    </div>
  );
}

function ProblemSolution({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div className="border-l-4 border-destructive pl-4">
      <p className="font-semibold text-sm mb-1">❌ {problem}</p>
      <p className="text-sm text-muted-foreground">✅ <strong>Megoldás:</strong> {solution}</p>
    </div>
  );
}
