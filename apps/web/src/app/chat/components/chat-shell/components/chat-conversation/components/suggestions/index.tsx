import { MessageCircleMoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuggestionsProps {
  disabled?: boolean;
  onSelect: (suggestion: string) => void;
  suggestions: string[];
}

export default function Suggestions({
  disabled,
  onSelect,
  suggestions,
}: SuggestionsProps) {
  return (
    <ul className="grid w-full gap-2">
      {suggestions.map((suggestion) => (
        <li key={suggestion}>
          <Button
            className="h-auto w-full justify-start whitespace-normal py-2.5 text-left"
            data-suggestion={suggestion}
            disabled={disabled}
            // biome-ignore lint/performance/noJsxPropsBind: Each button selects its own suggestion
            onClick={() => onSelect(suggestion)}
            variant="outline"
          >
            <MessageCircleMoreIcon />
            {suggestion}
          </Button>
        </li>
      ))}
    </ul>
  );
}
