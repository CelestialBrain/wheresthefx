import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GitBranch, MapPin } from "lucide-react";

interface LocationCorrection {
  id: string;
  original_location_name: string | null;
  original_location_address: string | null;
  corrected_venue_name: string;
  corrected_street_address: string | null;
  manual_lat: number | null;
  manual_lng: number | null;
  confidence_score: number | null;
  correction_count: number | null;
  created_at: string | null;
}

export const LocationCorrectionsViewer = () => {
  const { data: corrections, isLoading } = useQuery({
    queryKey: ["location-corrections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_corrections")
        .select("*")
        .order("correction_count", { ascending: false });
      if (error) throw error;
      return data as LocationCorrection[];
    },
  });

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading corrections...</div>;
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="text-lg flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Location Corrections ({corrections?.length || 0})
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Corrections learned from manual review - used for fuzzy matching
        </p>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {corrections?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No corrections recorded yet</p>
            <p className="text-xs mt-1">Corrections are created when you fix location data during review</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original</TableHead>
                  <TableHead>Corrected To</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Uses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corrections?.map((correction) => (
                  <TableRow key={correction.id}>
                    <TableCell>
                      <div className="text-sm">
                        {correction.original_location_name || <span className="text-muted-foreground italic">No name</span>}
                      </div>
                      {correction.original_location_address && (
                        <div className="text-xs text-muted-foreground">{correction.original_location_address}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{correction.corrected_venue_name}</div>
                      {correction.corrected_street_address && (
                        <div className="text-xs text-muted-foreground">{correction.corrected_street_address}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {correction.manual_lat && correction.manual_lng
                        ? `${correction.manual_lat.toFixed(4)}, ${correction.manual_lng.toFixed(4)}`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          (correction.confidence_score || 0) >= 0.8
                            ? "default"
                            : (correction.confidence_score || 0) >= 0.5
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {((correction.confidence_score || 0) * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {correction.correction_count || 1}×
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
