"use client";

import { LoaderCircleIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ClearHistoryButtonProps {
  disabled?: boolean;
  isClearing: boolean;
  onConfirmAction: () => Promise<void>;
}

export default function ClearHistoryButton({
  disabled,
  isClearing,
  onConfirmAction,
}: ClearHistoryButtonProps) {
  const [error, setError] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open: boolean): void => {
    if (isClearing) {
      return;
    }

    setError(undefined);
    setIsOpen(open);
  };

  const handleConfirm = async (): Promise<void> => {
    setError(undefined);

    try {
      await onConfirmAction();
      setIsOpen(false);
    } catch {
      setError("Não foi possível limpar a conversa. Tente novamente.");
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={disabled || isClearing}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Trash2Icon />
          Limpar conversa
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Limpar toda a conversa?</DialogTitle>
          <DialogDescription>
            Todas as perguntas, respostas e referências desta conversa serão
            removidas. As análises do viveiro não serão alteradas.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={isClearing} type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            disabled={disabled || isClearing}
            onClick={handleConfirm}
            type="button"
            variant="destructive"
          >
            {isClearing ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <Trash2Icon />
            )}
            {isClearing ? "Limpando…" : "Limpar conversa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
