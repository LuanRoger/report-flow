export default function HomeLayout({ children }: LayoutProps<"/">) {
  return <main className="flex flex-col">{children}</main>;
}
