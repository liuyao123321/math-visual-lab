export const acceptedQuestionImages = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const maxQuestionImageBytes = 8 * 1024 * 1024;
function questionImageType(file: File) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[extension ?? ""] ?? "";
}
export function validateQuestionPhoto(file: File) {
  if (!acceptedQuestionImages.includes(questionImageType(file)) || file.size > maxQuestionImageBytes || file.size === 0) {
    throw new Error("请选择 JPG、PNG、WebP 或 GIF 图片，大小为 1 字节至 8 MB。");
  }
}
export function readQuestionPhoto(file: File): Promise<string> {
  validateQuestionPhoto(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(reader.result)) {
        reject(new Error("图片读取结果无效，请重新选择图片。")); return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("图片读取失败，请重新选择或手动输入。"));
    reader.onabort = () => reject(new Error("图片读取已取消，请重新选择。"));
    reader.readAsDataURL(file.type ? file : file.slice(0, file.size, questionImageType(file)));
  });
}
