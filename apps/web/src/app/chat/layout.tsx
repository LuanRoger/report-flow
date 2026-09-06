export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return (
    <main className="h-svh min-h-0 min-w-0 flex-1 overflow-hidden">
      {children}
    </main>
  );
}
