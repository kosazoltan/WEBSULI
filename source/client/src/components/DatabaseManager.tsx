import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Server, Table, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface DatabaseInfo {
  materials: number;
  users: number;
  tables: string[];
  databaseUrl: string;
}

export default function DatabaseManager() {
  const { data: dbInfo, isLoading } = useQuery<DatabaseInfo>({
    queryKey: ["/api/admin/database/info"]
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <Database className="h-5 w-5" />
          Adatbázis információk
        </CardTitle>
        <CardDescription className="text-sm">
          Részletes adatbázis állapot és statisztikák
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Database Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <HardDrive className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{dbInfo?.materials || 0}</p>
                      <p className="text-sm text-muted-foreground">Tananyag</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Server className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{dbInfo?.users || 0}</p>
                      <p className="text-sm text-muted-foreground">Felhasználó</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Database Connection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Kapcsolat
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      PostgreSQL
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      Neon
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    {dbInfo?.databaseUrl}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Database Tables */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Table className="h-4 w-4" />
                  Táblák ({dbInfo?.tables?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {dbInfo?.tables?.map((table) => (
                    <Badge 
                      key={table} 
                      variant="outline" 
                      className="font-mono text-xs"
                      data-testid={`table-${table}`}
                    >
                      {table}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Environment Info */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Környezet</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {window.location.hostname === 'websuli.org' ? 'Production' : 'Development'}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {window.location.hostname}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </CardContent>
    </Card>
  );
}
