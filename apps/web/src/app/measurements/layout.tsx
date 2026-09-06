export default function Layout({ children }: LayoutProps<"/measurements">) {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-6 lg:p-8">
      {children}
    </main>
  );
}
