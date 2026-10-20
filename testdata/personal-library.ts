// Synthetic local-only regression data, not an actual user textbook.
import type { PersonalBook } from "@/lib/personal-library";
export const personalBookFixture: PersonalBook = {
  id: "local-pdf-11111111-1111-4111-8111-111111111111", title: "[测试]线性代数讲义", fileName: "test-linear-algebra.pdf",
  fingerprint: "a".repeat(64), subject: "线性代数", createdAt: "2026-10-17T00:00:00.000Z", allowAiUse: false,
  pages: [{ pageNumber: 3, text: "矩阵乘法一般不满足交换律。计算矩阵乘积AB之前，必须确认A的列数等于B的行数，结果为A的行数乘B的列数。" }],
};
