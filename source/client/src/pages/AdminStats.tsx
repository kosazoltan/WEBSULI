import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Eye, Heart, MessageSquare, Mail, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type OverallStats = {
  totalMaterials: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
};

type TopMaterial = {
  id: string;
  title: string;
  classroom: number;
  totalViews: number;
  totalLikes: number;
};

type ClassroomDist = {
  classroom: number;
  count: number;
};

type EmailStats = {
  sent: number;
  failed: number;
};

export default function AdminStats() {
  // Fetch overall statistics
  const { data: overallStats, isLoading: statsLoading } = useQuery<OverallStats>({
    queryKey: ['/api/admin/stats/overall'],
  });

  // Fetch top materials
  const { data: topMaterials, isLoading: topLoading } = useQuery<TopMaterial[]>({
    queryKey: ['/api/admin/stats/top-materials'],
  });

  // Fetch classroom distribution
  const { data: classroomDist, isLoading: distLoading } = useQuery<ClassroomDist[]>({
    queryKey: ['/api/admin/stats/classroom-distribution'],
  });

  // Fetch email delivery stats
  const { data: emailStats, isLoading: emailLoading } = useQuery<EmailStats>({
    queryKey: ['/api/admin/stats/email-delivery'],
  });

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#a855f7'];

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-admin-stats">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">📊 Statisztikák</h1>
          <p className="text-muted-foreground">Platform teljesítmény és aktivitás áttekintése</p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-materials">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Anyagok száma</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-materials">
                  {overallStats?.totalMaterials || 0}
                </div>
                <p className="text-xs text-muted-foreground">Összes feltöltött anyag</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-total-views">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Megtekintések</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-views">
                  {overallStats?.totalViews || 0}
                </div>
                <p className="text-xs text-muted-foreground">Regisztrált nézettség</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-total-likes">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Like-ok</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-likes">
                  {overallStats?.totalLikes || 0}
                </div>
                <p className="text-xs text-muted-foreground">Összes kedvelés</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-total-comments">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kommentek</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-comments">
                  {overallStats?.totalComments || 0}
                </div>
                <p className="text-xs text-muted-foreground">Összes hozzászólás</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Materials Chart */}
        <Card data-testid="card-top-materials-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top 10 Anyag (Nézettség)
            </CardTitle>
            <CardDescription>Legtöbbet megtekintett tananyagok</CardDescription>
          </CardHeader>
          <CardContent>
            {topLoading ? (
              <Skeleton className="h-[300px]" />
            ) : topMaterials && topMaterials.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topMaterials.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="title" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="totalViews" fill="#3b82f6" name="Nézettség" />
                  <Bar dataKey="totalLikes" fill="#ec4899" name="Like-ok" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">Nincs adat</p>
            )}
          </CardContent>
        </Card>

        {/* Classroom Distribution Chart */}
        <Card data-testid="card-classroom-distribution-chart">
          <CardHeader>
            <CardTitle>Osztály megoszlás</CardTitle>
            <CardDescription>Anyagok eloszlása osztályonként</CardDescription>
          </CardHeader>
          <CardContent>
            {distLoading ? (
              <Skeleton className="h-[300px]" />
            ) : classroomDist && classroomDist.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={classroomDist}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ classroom, count }) => `${classroom}. osztály: ${count}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {classroomDist.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">Nincs adat</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Email Delivery Stats */}
      <Card data-testid="card-email-stats">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Statisztika
          </CardTitle>
          <CardDescription>Értesítő emailek küldési állapota</CardDescription>
        </CardHeader>
        <CardContent>
          {emailLoading ? (
            <div className="flex gap-8">
              <Skeleton className="h-20 w-40" />
              <Skeleton className="h-20 w-40" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Elküldött emailek</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-emails-sent">
                  {emailStats?.sent || 0}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Sikertelen emailek</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-emails-failed">
                  {emailStats?.failed || 0}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Sikerességi arány</p>
                <p className="text-2xl font-bold">
                  {emailStats ? Math.round((emailStats.sent / (emailStats.sent + emailStats.failed || 1)) * 100) : 0}%
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Összes kísérlet</p>
                <p className="text-2xl font-bold">
                  {(emailStats?.sent || 0) + (emailStats?.failed || 0)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
