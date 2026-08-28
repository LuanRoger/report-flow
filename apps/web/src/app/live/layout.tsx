export default function LiveLayout({ children }: LayoutProps<"/live">) {
  return <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>;
}
