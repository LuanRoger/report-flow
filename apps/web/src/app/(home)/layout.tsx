export default function Layout({ children }: LayoutProps<"/">) {
  return <main className="flex flex-col">{children}</main>;
}
