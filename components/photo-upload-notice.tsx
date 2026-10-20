/** Keep upload privacy information available without crowding the input. */
export function PhotoUploadNotice() {
  return (
    <details className="text-xs leading-5 text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">图片说明</summary>
      <p className="mt-2 max-w-prose">支持 JPG、PNG、WebP、GIF，最大 8 MB。提交后图片会发送给已配置的 DeepSeek 服务并产生调用费用；请避免拍入姓名、学号等隐私。原图不保存。</p>
    </details>
  );
}
