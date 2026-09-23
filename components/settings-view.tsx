"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AlertTriangle, Eye, EyeOff, KeyRound, Moon, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExplanationMode } from "@/lib/math-schema";
import { getApiKey, setApiKey } from "@/lib/storage";
import { useMathLabStore } from "@/lib/store";

export function SettingsView() {
  const settings = useMathLabStore((state) => state.settings);
  const updateSettings = useMathLabStore((state) => state.updateSettings);
  const { setTheme } = useTheme();
  const [key, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setKeyValue(getApiKey()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function save() {
    setApiKey(key);
    toast.success(key.trim() ? "设置已保存" : "密钥已清除");
  }

  function changeTheme(value: "light" | "dark" | "system") {
    updateSettings({ theme: value });
    setTheme(value);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <div><p className="text-sm font-medium text-cyan-600 dark:text-cyan-300">个人设置</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">按你的学习方式调整</h1><p className="mt-2 text-sm text-muted-foreground">偏好与密钥只保存在当前浏览器中。</p></div>

      <section className="laboratory-panel mt-7 overflow-hidden">
        <div className="border-b p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><KeyRound className="size-5" /></span><div><h2 className="font-semibold">DeepSeek API 密钥</h2><p className="mt-1 text-sm text-muted-foreground">用于自定义题目、专属讲解和相似练习。</p></div></div></div>
        <div className="space-y-4 p-6">
          <label className="block"><span className="mb-2 block text-sm font-medium">API Key</span><div className="flex gap-2"><Input type={showKey ? "text" : "password"} value={key} onChange={(event) => setKeyValue(event.target.value)} placeholder="sk-..." autoComplete="off" aria-describedby="key-warning" /><Button variant="outline" size="icon" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏密钥" : "显示密钥"}>{showKey ? <EyeOff /> : <Eye />}</Button></div></label>
          <div id="key-warning" className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><p><strong>课程演示用途：</strong>密钥将长期保存在 localStorage，任何能在本页面运行的脚本都可能读取它。请使用低额度、可随时撤销的演示密钥，不要在公共电脑保存。</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><Button onClick={save}><Save />保存密钥</Button><Button variant="outline" onClick={() => { setKeyValue(""); setApiKey(""); toast.success("密钥已从浏览器清除"); }}><Trash2 />清除密钥</Button></div>
          <p className="text-xs text-muted-foreground">请求时密钥只发送到本站服务端代理，再由代理转发给 DeepSeek；不会写入题目、错题记录或应用日志。</p>
        </div>
      </section>

      <section className="laboratory-panel mt-5">
        <div className="border-b p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Moon className="size-5" /></span><div><h2 className="font-semibold">显示与解析偏好</h2><p className="mt-1 text-sm text-muted-foreground">新题目会优先采用这里的默认设置。</p></div></div></div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-medium">主题模式</span><Select value={settings.theme} onValueChange={(value) => changeTheme(value as "light" | "dark" | "system")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">跟随系统</SelectItem><SelectItem value="light">浅色模式</SelectItem><SelectItem value="dark">深色模式</SelectItem></SelectContent></Select></label>
          <label><span className="mb-2 block text-sm font-medium">默认解析模式</span><Select value={settings.defaultMode} onValueChange={(value) => updateSettings({ defaultMode: value as ExplanationMode })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="concise">简洁解析</SelectItem><SelectItem value="detailed">详细解析</SelectItem><SelectItem value="visual">可视化解析</SelectItem></SelectContent></Select></label>
        </div>
      </section>

      <section className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p>AI 生成的数学解析可能出现错误。用于作业或考试复习时，请结合教材、教师讲解或独立计算进行核对。</p></section>
    </main>
  );
}
