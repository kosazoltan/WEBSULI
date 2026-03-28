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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-background dark:via-background dark:to-background">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-to-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Vissza az admin felületre
            </Button>
          </Link>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-primary/10 rounded-lg">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-orange-600 via-amber-600 to-yellow-600 bg-clip-text text-transparent">
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
          <AlertTitle>Gyors tipp</AlertTitle>
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
              Fejlett készítő
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
                  Platform áttekintése
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
                    osztályonkénti szűrést és e-mail értesítéseket kínál.
                  </p>
                  <Alert className="border-primary/50 bg-primary/5">
                    <Shield className="h-4 w-4 text-primary" />
                    <AlertTitle>Teljesen nyilvános platform</AlertTitle>
                    <AlertDescription>
                      A platform <strong>100% nyilvános</strong> - nincs bejelentkezés vagy regisztráció szükséges. 
                      Mindenki létrehozhat, szerkeszthet és törölhet anyagokat, valamint elérheti az admin funkciókat.
                    </AlertDescription>
                  </Alert>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Főbb funkciók</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FeatureCard
                      icon={Wand2}
                      title="Fejlett tananyagkészítő (AI)"
                      description="Háromfázisú AI-munkafolyamat: PDF/kép feltöltés → ChatGPT szöveggenerálás → Claude HTML-készítés → előnézet → publikálás"
                    />
                    <FeatureCard
                      icon={FileText}
                      title="Anyagkezelés"
                      description="Anyagok szerkesztése, törlése, tömeges műveletek (többszörös törlés, e-mail küldés, áthelyezés)"
                    />
                    <FeatureCard
                      icon={Shield}
                      title="Nyilvános hozzáférés"
                      description="Nincs bejelentkezés — mindenki létrehozhat, szerkeszthet és törölhet anyagokat szabadon"
                    />
                    <FeatureCard
                      icon={Tag}
                      title="Címkék kezelése"
                      description="Címkék létrehozása, szerkesztése, törlése az anyagok kategorizálásához"
                    />
                    <FeatureCard
                      icon={Database}
                      title="Biztonsági másolatok"
                      description="Teljes adatbázis exportálása JSON-formátumban, importálás katasztrófa-helyreállításhoz"
                    />
                    <FeatureCard
                      icon={Mail}
                      title="E-mailek kezelése"
                      description="Extra e-mail címek hozzáadása osztályonkénti értesítésekhez"
                    />
                    <FeatureCard
                      icon={BarChart3}
                      title="Statisztikák"
                      description="Anyag-megtekintések, e-mail statisztikák, osztály szerinti eloszlás"
                    />
                    <FeatureCard
                      icon={Bell}
                      title="Leküldéses értesítések"
                      description="Böngészős push-értesítések kipróbálása új anyagok feltöltésekor"
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Gyors Navigáció</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <QuickLinkCard
                      title="Fejlett tananyagkészítő"
                      description="Anyag létrehozása AI segítségével"
                      tab="Anyagok → Fejlett készítő"
                      badge="Leggyakoribb"
                    />
                    <QuickLinkCard
                      title="Anyag szerkesztése"
                      description="Cím, leírás és osztály módosítása"
                      tab="Fájlok → szerkesztés ikon"
                    />
                    <QuickLinkCard
                      title="Másolat exportálása"
                      description="Adatbázis mentése"
                      tab="Kezelés → Másolat"
                    />
                    <QuickLinkCard
                      title="E-mail címek"
                      description="Értesítési címek kezelése"
                      tab="Beállítások → E-mail címek"
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
                  Fejlett tananyagkészítő (AI)
                </CardTitle>
                <CardDescription>
                  Háromfázisú, AI-alapú tananyag-készítő rendszer
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Mi ez?</AlertTitle>
                  <AlertDescription>
                    A fejlett tananyagkészítő egy varázslószerű rendszer, amely PDF- vagy képfájlokból
                    három lépésben, AI segítségével készít interaktív HTML-tananyagot.
                  </AlertDescription>
                </Alert>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Munkafolyamat (három fázis)</h3>
                  
                  <div className="space-y-4">
                    <PhaseCard
                      number={1}
                      title="Fájlfeltöltés és elemzés"
                      icon={Upload}
                      steps={[
                        "Tölts fel egy vagy több PDF vagy JPG/PNG fájlt (max 30MB összesen)",
                        "A rendszer a ChatGPT Vision API segítségével elemzi az összes dokumentumot",
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
                      title="Szöveggenerálás (ChatGPT)"
                      icon={FileText}
                      steps={[
                        "A ChatGPT csevegőfelület megnyílik a kinyert szöveggel",
                        "Beszélgess az AI-val a tananyag szövegének finomításához",
                        "Kérd a ChatGPT-tól a részletesebb magyarázatokat és példákat",
                        "Az AI osztályonként eltérő stílusban ír (1–3.: egyszerű, 5–7.: lendületes, 8+.: komolyabb)",
                        "Ha elégedett vagy, kattints a „Tovább Claude HTML-generálásra” gombra"
                      ]}
                      tips={[
                        "Példa kérés: 'Fejtsd ki részletesebben a fotoszintézis lépéseit'",
                        "Példa kérés: 'Adj hozzá 3 gyakorlati példát'",
                        "A chat előzményei megmaradnak, építhetsz rájuk"
                      ]}
                    />

                    <PhaseCard
                      number={3}
                      title="HTML-generálás (Claude) és előnézet"
                      icon={Code2}
                      steps={[
                        "A Claude megkapja a ChatGPT által generált szöveget",
                        "Interaktív, látványos HTML tananyagot készít belőle",
                        "Osztályonként eltérő vizuális stílust alkalmaz (színek, grafikák)",
                        "Az előnézet ablakban azonnal láthatod az eredményt",
                        "Finomítsd a HTML-t további chat üzenetekkel",
                        "Ha kész vagy, kattints a „Publikálás a platformon” gombra"
                      ]}
                      tips={[
                        "Példa kérés Claude-nak: „Adj hozzá egy interaktív kvízt a végére”",
                        "Példa kérés: 'Használj több animációt és képet'",
                        "Az előnézet valós időben frissül minden AI válasznál"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">AI rendszerutasítások testreszabása</h3>
                  <p className="text-muted-foreground mb-4">
                    Minden fázisban testreszabhatod az AI utasításait a „Rendszerutasítás” (system prompt) gombbal:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>ChatGPT-utasítás:</strong> tananyag szövegének stílusa, hangneme, részletessége</li>
                    <li><strong>Claude-utasítás:</strong> HTML megjelenés, színek, interaktivitás szintje</li>
                    <li>Az egyedi utasítások minden készítő-munkamenetben érvényesek</li>
                    <li>A visszaállítás gombbal az alapértelmezett utasítások térnek vissza</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Gyakori problémák és megoldások</h3>
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
                      solution="Kérd Claude-tól: „Adj hozzá több színt, animációt és grafikát”"
                    />
                    <ProblemSolution
                      problem="Osztály automatikus érzékelés rossz"
                      solution="Az 1. fázisban manuálisan állítsd be a helyes osztályt a legördülő listából"
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
                  Anyagkezelés
                </CardTitle>
                <CardDescription>
                  Feltöltött tananyagok szerkesztése, törlése és kezelése
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Anyagműveletek</h3>
                  
                  <div className="space-y-4">
                    <ActionCard
                      icon={Edit}
                      title="Anyag szerkesztése"
                      description="Kattints az anyagon a három pontra (⋮) → „Szerkesztés”"
                      details={[
                        "Cím módosítása: Bármilyen nem üres szöveg (pl. 'Fotoszintézis magyarázat', '5. Arany János...')",
                        "Leírás módosítása: Rövid összefoglaló (opcionális)",
                        "Osztály módosítása: 1–8. osztály közötti átsorolás (független a címtől)",
                        "A cím és osztály mező most már teljesen független egymástól",
                        "A módosítások azonnal mentésre kerülnek"
                      ]}
                    />

                    <ActionCard
                      icon={Trash2}
                      title="Anyag törlése"
                      description="Három pont (⋮) → „Törlés” → megerősítés"
                      details={[
                        "FIGYELEM: A törlés végleges és visszavonhatatlan!",
                        "A törölt anyag minden adata elvész (HTML, metaadatok, statisztikák)",
                        "Törlés előtt mindig készíts biztonsági másolatot a másolatkezelővel"
                      ]}
                    />

                    <ActionCard
                      icon={Eye}
                      title="Anyag előnézete"
                      description="Kattints az anyag kártyára a teljes HTML-előnézethez"
                      details={[
                        "Az előnézet oldal megjeleníti a teljes interaktív tartalmat",
                        "TTS (szövegfelolvasás) elérhető hallgatáshoz",
                        "A webcím egy kattintással másolható megosztáshoz",
                        "Mobilbarát nézet, automatikus optimalizálással"
                      ]}
                    />

                    <ActionCard
                      icon={Mail}
                      title="E-mail értesítés küldése"
                      description="Három pont (⋮) → „E-mail küldése”"
                      details={[
                        "E-mail küldése az anyagról az osztályhoz rendelt címzetteknek",
                        "Választhatsz az előre mentett e-mail címek közül",
                        "Megadhatsz egyedi címeket is (vesszővel elválasztva)",
                        "Az üzenet tartalmazza az anyag címét, leírását és hivatkozását"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Tömeges műveletek</h3>
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
                            Jelöld be a kívánt anyagok melletti jelölőnégyzeteket.
                            A „Mind kijelölése” gomb az összes látható anyagot kijelöli.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Trash2 className="w-5 h-5 text-destructive mt-0.5" />
                        <div>
                          <h4 className="font-semibold mb-2">Tömeges törlés</h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            A kiválasztott anyagok törlése egyszerre.
                            Megerősítő párbeszédablak jelenik meg a veszélyes művelet előtt.
                          </p>
                          <Badge variant="destructive">Visszavonhatatlan!</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Mail className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <h4 className="font-semibold mb-2">Tömeges e-mail</h4>
                          <p className="text-sm text-muted-foreground">
                            E-mail értesítés az összes kiválasztott anyagról egyszerre.
                            Hasznos havi összesítőkhöz vagy tematikus anyagok kiküldéséhez.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <h4 className="font-semibold mb-2">Tömeges osztály-áthelyezés</h4>
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
                  <h3 className="text-lg font-semibold mb-3">Keresés és szűrés</h3>
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
                  Rendszerkezelés
                </CardTitle>
                <CardDescription>
                  Biztonsági másolatok, címkék és e-mailek kezelése
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
                  <h3 className="text-lg font-semibold mb-4">Biztonsági másolatok</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Kezelés → Másolat</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Másolat exportálása"
                      description="Teljes adatbázis mentése JSON-fájlba"
                      features={[
                        "Kattints a „Biztonsági másolat letöltése” gombra",
                        "Automatikus letöltés: anyagok-backup-ÉÉÉÉ-HH-NN.json",
                        "Tartalmazza: összes anyag, felhasználó, e-mail-feliratkozások",
                        "Ajánlott: készíts másolatot minden nagyobb művelet előtt!"
                      ]}
                    />

                    <SystemFeature
                      title="Másolat importálása"
                      description="Korábbi mentés visszaállítása"
                      features={[
                        "Válaszd ki a mentett JSON-fájlt",
                        "Kattints az „Importálás” / visszaállítás gombra",
                        "Vigyázat: ez felülírja a jelenlegi adatokat!",
                        "Használd katasztrófa esetén vagy tesztkörnyezet visszaállításához"
                      ]}
                    />

                    <SystemFeature
                      title="Forráskód letöltése"
                      description="A teljes projekt forráskódjának letöltése"
                      features={[
                        "Kattints a „Forráskód letöltése (.zip)” gombra",
                        "ZIP-fájl érkezik az összes kóddal",
                        "Hasznos: helyi fejlesztés, verziómentés, átvizsgálás"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Címkék kezelése</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Kezelés → Címkék</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Címke létrehozása"
                      description="Új címke hozzáadása az anyagok kategorizálásához"
                      features={[
                        "Adj meg egy címke nevet (pl. „matematika”, „fizika”)",
                        "Opcionális: leírás és szín beállítása",
                        "Kattints a „Címke hozzáadása” gombra",
                        "A címke azonnal használható lesz az anyagoknál"
                      ]}
                    />

                    <SystemFeature
                      title="Címke törlése"
                      description="Felesleges címkék eltávolítása"
                      features={[
                        "Kattints a piros kuka ikonra",
                        "Megerősítő párbeszédablak jelenik meg",
                        "A címke lekerül az összes anyagról is"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">E-mailek kezelése</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Beállítások → E-mail címek</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="E-mail cím hozzáadása"
                      description="Extra címek osztályonkénti értesítésekhez"
                      features={[
                        "Adj meg egy e-mail címet",
                        "Válaszd ki a kívánt osztályokat (jelölőnégyzetek)",
                        "Kattints a „Hozzáadás” gombra",
                        "A cím értesítést kap az adott osztályok új anyagairól"
                      ]}
                    />

                    <SystemFeature
                      title="Osztályok szerkesztése"
                      description="E-mail címhez rendelt osztályok módosítása"
                      features={[
                        "Kattints a szerkesztés ikonra a cím mellett",
                        "Módosítsd a kiválasztott osztályokat",
                        "Mentsd el a változtatásokat"
                      ]}
                    />

                    <SystemFeature
                      title="E-mail cím törlése"
                      description="Cím eltávolítása az értesítési listáról"
                      features={[
                        "Kattints a kuka ikonra",
                        "Erősítsd meg a törlést",
                        "A cím nem kap több értesítést"
                      ]}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Adatbázis-információk</h3>
                  <p className="text-muted-foreground mb-4">
                    Az <strong>Adatbázis</strong> fülön találod a statisztikákat:
                  </p>
                  
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>Tananyagok száma:</strong> összes feltöltött HTML-anyag</li>
                    <li><strong>Felhasználók száma:</strong> regisztrált felhasználók</li>
                    <li><strong>Táblák listája:</strong> szerkezet áttekintése</li>
                    <li><strong>Kapcsolati cím (URL):</strong> PostgreSQL elérési adatok</li>
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
                  Haladó funkciók
                </CardTitle>
                <CardDescription>
                  Statisztikák, leküldéses értesítések és AI-testreszabás
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Statisztikák és riportok</h3>
                  <p className="text-muted-foreground mb-4">
                    Nézd: <strong>Beállítások → Megtekintések</strong>
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Anyag-megtekintések"
                      description="Részletes statisztikák minden anyag megtekintéséről"
                      features={[
                        "Anyag címe, leírása, osztály",
                        "Megtekintések száma anyagonként",
                        "Utolsó megtekintés időpontja",
                        "Böngésző- és eszközazonosító (user agent)"
                      ]}
                    />

                    <SystemFeature
                      title="E-mail statisztikák"
                      description="Küldött levelek nyomon követése"
                      features={[
                        "Kiknek küldtél e-mailt (címzettek listája)",
                        "Mely anyagokról (anyagcímek)",
                        "Mikor küldted (dátum, időpont)",
                        "Sikeres és sikertelen küldések"
                      ]}
                    />

                    <SystemFeature
                      title="Osztályeloszlás"
                      description="Anyagok megoszlása osztályonként"
                      features={[
                        "Hány anyag van osztályonként (1-8)",
                        "Diagram megjelenítés a jobb áttekintéshez",
                        "Segít azonosítani, mely osztályok igényelnek több tartalmat"
                      ]}
                    />

                    <SystemFeature
                      title="Legnépszerűbb anyagok"
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
                  <h3 className="text-lg font-semibold mb-4">Leküldéses értesítések</h3>
                  <p className="text-muted-foreground mb-4">
                    Böngészős push-értesítések kipróbálása és kezelése
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="Push-értesítés küldése"
                      description="Tesztüzenet a feliratkozott felhasználóknak"
                      features={[
                        "A platform új anyag feltöltésekor automatikusan küldhet push-értesítést",
                        "A felhasználóknak engedélyezniük kell a böngészőben",
                        "VAPID-kulcsok a biztonságos kommunikációhoz",
                        "Támogatott böngészők: Chrome, Firefox, Edge, Safari"
                      ]}
                    />

                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Fontos</AlertTitle>
                      <AlertDescription>
                        A push-értesítések csak HTTPS-kapcsolaton keresztül működnek (éles domain).
                        Helyi fejlesztés közben általában nem tesztelhetők.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">AI rendszerutasítások (system prompt)</h3>
                  <p className="text-muted-foreground mb-4">
                    Az AI-generátorok viselkedésének finomhangolása egyedi utasításokkal
                  </p>
                  
                  <div className="space-y-3">
                    <SystemFeature
                      title="ChatGPT rendszerutasítás"
                      description="A szöveggeneráló AI utasításainak módosítása"
                      features={[
                        "Elérhető a fejlett készítőben a „Rendszerutasítás” gombbal",
                        "Módosíthatod a szöveg stílusát, hangnemét, részletességét",
                        "Példa: „Írj rövidebb, tömörebb tananyagot” vagy „Használj több példát”",
                        "Az új utasítás a következő generálásnál lép életbe"
                      ]}
                    />

                    <SystemFeature
                      title="Claude rendszerutasítás"
                      description="A HTML-t készítő AI utasításainak módosítása"
                      features={[
                        "Elérhető a fejlett készítő Claude-fázisában",
                        "Módosíthatod a HTML megjelenését, színeket, interaktivitást",
                        "Példa: „Használj több animációt” vagy „Legyen minimalista a dizájn”",
                        "Visszaállítással az alapértelmezett utasítás tér vissza"
                      ]}
                    />

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Tipp</AlertTitle>
                      <AlertDescription>
                        Az egyedi utasítások a munkamenet alatt megmaradnak.
                        Ha új beállítást szeretnél, módosítsd az utasítást mielőtt elkezded a csevegést.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Haladó tippek és trükkök</h3>
                  
                  <div className="space-y-3">
                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Több anyag egymás után</h4>
                      <p className="text-sm text-muted-foreground">
                        Készíts több anyagot egymás után ugyanazzal a témával különböző osztályokhoz. 
                        Az AI megjegyzi a kontextust, gyorsabb lesz a generálás.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Anyag újrahasznosítása</h4>
                      <p className="text-sm text-muted-foreground">
                        Ha egy anyag jól sikerült, szerkeszd meg és mentsd el más címmel/osztállyal. 
                        Így több verziót tarthatsz fent ugyanabból a tartalomból.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Rendszeres mentés</h4>
                      <p className="text-sm text-muted-foreground">
                        Állíts be heti vagy havi mentési rutint. Töltsd le a JSON-fájlt, és tárold biztonságos helyen
                        (felhő, külső lemez stb.). Ez véd az adatvesztéstől.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">E-mail lista karbantartása</h4>
                      <p className="text-sm text-muted-foreground">
                        Rendszeresen ellenőrizd az extra e-mail címek listáját.
                        Távolítsd el az inaktív vagy érvénytelen címeket a visszapattanó levelek elkerülése érdekében.
                      </p>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h4 className="font-semibold mb-1">Címkestratégia</h4>
                      <p className="text-sm text-muted-foreground">
                        Használj egységes címkéket (pl. „matematika”, „fizika”, „történelem”).
                        Ez megkönnyíti a keresést és a későbbi tömeges műveleteket.
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
                  <AlertTitle>Biztonság az első helyen</AlertTitle>
                  <AlertDescription>
                    Az Anyagok Profiknak platform többszörös biztonsági rétegekkel rendelkezik:
                  </AlertDescription>
                </Alert>

                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li><strong>Több adminisztrátor:</strong> két adminisztrátori fiók rendelkezik jogosultsággal:
                    <ul className="ml-6 mt-1 space-y-1">
                      <li>• kosa.zoltan.ebc@gmail.com (főadmin)</li>
                      <li>• mszilva78@gmail.com (Máté Szilvia)</li>
                    </ul>
                  </li>
                  <li><strong>Munkamenet-kezelés:</strong> 30 perces tétlenség után automatikus kijelentkezés</li>
                  <li><strong>XSS-védelem:</strong> a felhasználói beviteleket tisztítjuk (DOMPurify)</li>
                  <li><strong>Csak HTTPS:</strong> éles környezetben csak titkosított kapcsolat</li>
                  <li><strong>Tartalombiztonsági szabályzat (CSP):</strong> a Helmet köztes réteg segíti a védelmet</li>
                  <li><strong>Biztonságos sütik:</strong> HttpOnly, Secure és SameSite beállítások</li>
                  <li><strong>Adatbázis-helyreállítás:</strong> Neon PostgreSQL — időponthoz kötött visszaállítás (PITR)</li>
                </ul>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-2">Ajánlott gyakorlatok</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Soha ne oszd meg az adminisztrátori e-mail fiók jelszavát</li>
                    <li>Rendszeresen ellenőrizd a felhasználók listáját gyanús tevékenység miatt</li>
                    <li>Készíts biztonsági másolatot minden kritikus művelet előtt</li>
                    <li>Ne vesd el saját magad adminisztrátori jogosultságát</li>
                    <li>Figyeld az e-mail statisztikákat levélszemét- és visszaélési jelekért</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <Card className="mt-8 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-background dark:to-background">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              További kérdés esetén vedd fel a kapcsolatot az adminisztrátorral.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/admin">
                <Button variant="outline" data-testid="button-footer-back-to-admin">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Vissza az admin felületre
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" data-testid="button-footer-public-view">
                  <Eye className="w-4 h-4 mr-2" />
                  Nyilvános nézet
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
