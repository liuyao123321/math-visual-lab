"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AlertTriangle, BrainCircuit, Eye, EyeOff, KeyRound, Moon, RotateCcw, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ExplanationMode } from "@/lib/math-schema";
import { explanationPreferenceLabels, learningGoalLabels, selfLevelLabels, subjectLabels, tutoringStyleLabels } from "@/lib/personalization";
import { getApiKey, setApiKey } from "@/lib/storage";
import { useMathLabStore } from "@/lib/store";

export function SettingsView() {
  const settings = useMathLabStore((state) => state.settings);
  const updateSettings = useMathLabStore((state) => state.updateSettings);
  const updateLearnerProfile = useMathLabStore((state) => state.updateLearnerProfile);
  const resetLearnerProfile = useMathLabStore((state) => state.resetLearnerProfile);
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
      <div><p className="text-sm font-medium text-primary dark:text-primary">个人设置</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">按你的学习方式调整</h1><p className="mt-2 text-sm text-muted-foreground">偏好与密钥只保存在当前浏览器中。</p></div>

      <section className="laboratory-panel mt-7 overflow-hidden">
        <div className="border-b p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary"><KeyRound className="size-5" /></span><div><h2 className="font-semibold">DeepSeek API 密钥</h2><p className="mt-1 text-sm text-muted-foreground">用于自定义题目、专属讲解和相似练习。</p></div></div></div>
        <div className="space-y-4 p-6">
          <label className="block"><span className="mb-2 block text-sm font-medium">API Key</span><div className="flex gap-2"><Input type={showKey ? "text" : "password"} value={key} onChange={(event) => setKeyValue(event.target.value)} placeholder="sk-..." autoComplete="off" aria-describedby="key-warning" /><Button variant="outline" size="icon" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏密钥" : "显示密钥"}>{showKey ? <EyeOff /> : <Eye />}</Button></div></label>
          <div id="key-warning" className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><p><strong>课程演示用途：</strong>密钥将长期保存在 localStorage，任何能在本页面运行的脚本都可能读取它。请使用低额度、可随时撤销的演示密钥，不要在公共电脑保存。</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><Button onClick={save}><Save />保存密钥</Button><Button variant="outline" onClick={() => { setKeyValue(""); setApiKey(""); toast.success("密钥已从浏览器清除"); }}><Trash2 />清除密钥</Button></div>
          <p className="text-xs text-muted-foreground">请求时密钥只发送到本站服务端代理，再由代理转发给 DeepSeek；不会写入题目、错题记录或应用日志。</p>
        </div>
      </section>

      <section className="laboratory-panel mt-5">
        <div className="border-b p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary"><Moon className="size-5" /></span><div><h2 className="font-semibold">显示与解析偏好</h2><p className="mt-1 text-sm text-muted-foreground">新题默认由 AI 推荐讲解方式；此处解析偏好作为旧题文字讲解的备用设置，可在答疑页手动切换。</p></div></div></div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-medium">颜色模式</span><Select value={settings.theme} onValueChange={(value) => changeTheme(value as "light" | "dark" | "system")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">跟随系统</SelectItem><SelectItem value="light">浅色模式</SelectItem><SelectItem value="dark">深色模式</SelectItem></SelectContent></Select></label>
          <label><span className="mb-2 block text-sm font-medium">默认解析模式</span><Select value={settings.defaultMode} onValueChange={(value) => updateSettings({ defaultMode: value as ExplanationMode })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="concise">简洁解析</SelectItem><SelectItem value="detailed">详细解析</SelectItem><SelectItem value="visual">可视化解析</SelectItem></SelectContent></Select></label>
        </div>
      </section>

      <section className="laboratory-panel mt-5 overflow-hidden">
        <div className="border-b p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><BrainCircuit className="size-5" /></span><div><h2 className="font-semibold">AI 学习偏好</h2><p className="mt-1 text-sm text-muted-foreground">决定提示节奏、讲解重点和复习建议。</p></div></div>
            <label className="flex items-center justify-between gap-3 rounded-xl border bg-muted/35 px-4 py-3 text-sm"><span><span className="block font-medium">启用个性化</span><span className="mt-0.5 block text-xs text-muted-foreground">关闭后不发送学习画像摘要</span></span><Switch checked={settings.learnerProfile.personalizationEnabled} onCheckedChange={(checked) => updateLearnerProfile({ personalizationEnabled: checked })} aria-label="启用 AI 个性化辅导" /></label>
          </div>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-medium">主要课程</span><Select value={settings.learnerProfile.primarySubject} onValueChange={(value) => updateLearnerProfile({ primarySubject: value as typeof settings.learnerProfile.primarySubject })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{subjectLabels.map((subject) => <SelectItem key={subject} value={subject}>{subject}</SelectItem>)}</SelectContent></Select></label>
          <label><span className="mb-2 block text-sm font-medium">自评水平</span><Select value={settings.learnerProfile.selfLevel} onValueChange={(value) => updateLearnerProfile({ selfLevel: value as keyof typeof selfLevelLabels })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(selfLevelLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
          <label><span className="mb-2 block text-sm font-medium">当前学习目标</span><Select value={settings.learnerProfile.learningGoal} onValueChange={(value) => updateLearnerProfile({ learningGoal: value as keyof typeof learningGoalLabels })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(learningGoalLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
          <label><span className="mb-2 block text-sm font-medium">首选讲解方式</span><Select value={settings.learnerProfile.preferredExplanation} onValueChange={(value) => updateLearnerProfile({ preferredExplanation: value as keyof typeof explanationPreferenceLabels })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(explanationPreferenceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-sm font-medium">默认辅导方式</span><Select value={settings.learnerProfile.tutoringStyle} onValueChange={(value) => updateLearnerProfile({ tutoringStyle: value as keyof typeof tutoringStyleLabels })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(tutoringStyleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
        </div>
        <div className="flex flex-col gap-3 border-t bg-muted/20 p-6 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl leading-6 text-muted-foreground">开启后，只会发送上面的偏好和最多 3 个薄弱知识点、3 类高频错误及近 7 天练习数量；不会发送姓名、学号、完整错题库或原始照片。</p><Button variant="outline" onClick={() => { resetLearnerProfile(); toast.success("学习偏好已恢复默认值"); }}><RotateCcw />恢复默认偏好</Button></div>
      </section>

      <section className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p>AI 生成的数学解析可能出现错误。用于作业或考试复习时，请结合教材、教师讲解或独立计算进行核对。</p></section>
      <section className="laboratory-panel mt-5 p-6"><h2 className="font-semibold">反馈与维护</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">网站记录匿名页面访问和功能使用次数，不自动收集题目、照片、个人教材或密钥。</p><div className="mt-4 flex flex-wrap gap-4"><a className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground" href="/feedback">提交问题反馈</a><a className="inline-flex min-h-11 items-center px-2 text-sm text-primary underline underline-offset-4" href="/developer">开发者控制台</a></div></section>
    </main>
  );
}
