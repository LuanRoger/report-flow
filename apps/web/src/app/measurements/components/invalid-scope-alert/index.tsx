import { DatabaseIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface InvalidScopeAlertProps {
  hasBothScopes: boolean;
}

export default function InvalidScopeAlert({
  hasBothScopes,
}: InvalidScopeAlertProps) {
  return (
    <Alert>
      <DatabaseIcon />
      <AlertTitle>
        {hasBothScopes ? "Choose one measurement scope" : "Select a scope"}
      </AlertTitle>
      <AlertDescription>
        {hasBothScopes
          ? "Use either pondId or cycleId in the URL, not both."
          : "Add pondId or cycleId to the URL, for example ?pondId=1."}
      </AlertDescription>
    </Alert>
  );
}
