import { DeveloperConsole } from "@/components/developer-console";
import { chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export default function DeveloperPage() { return <DeveloperConsole signInPath={chatGPTSignInPath("/developer")} signOutPath={chatGPTSignOutPath("/developer")} />; }
