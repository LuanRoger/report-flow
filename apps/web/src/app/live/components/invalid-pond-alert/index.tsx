import { ActivityIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function InvalidPondAlert() {
  return (
    <Alert>
      <ActivityIcon />
      <AlertTitle>Select a pond</AlertTitle>
      <AlertDescription>
        Add a positive pondId to the URL, for example ?pondId=1.
      </AlertDescription>
    </Alert>
  );
}
