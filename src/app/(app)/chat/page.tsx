import { ChatClient } from "@/components/ChatClient";
export const metadata = { title: "ถามตอบ" };
export default function ChatPage() {
  return <div className="space-y-2"><h1 className="text-xl font-bold">ถามตอบสถานการณ์น้ำ</h1><ChatClient /></div>;
}
