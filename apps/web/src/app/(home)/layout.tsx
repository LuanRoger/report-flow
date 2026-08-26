import Sidebar from "@/components/sidebar";

export default function HomeLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Sidebar />
      <main className="flex flex-col">{children}</main>
    </>
  );
}
