import { randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve('.local-server/operations-admin.json');
if (existsSync(configPath)) {
  console.log('Developer access already configured. Existing credentials and data were preserved.');
  process.exit(0);
}
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 210000, 32, 'sha256');
mkdirSync(resolve('.local-server'), { recursive: true });
mkdirSync(resolve('outputs'), { recursive: true });
writeFileSync(configPath, JSON.stringify({ version: 1, passwordHash: `pbkdf2$210000$${salt.toString('base64url')}$${hash.toString('base64url')}`, secret: randomBytes(32).toString('hex') }, null, 2), { flag: 'wx', mode: 0o600 });
writeFileSync(resolve('outputs/developer-access.txt'), `知数实验室 · 本机开发者后台\n\n地址：http://localhost:5173/developer\n登录密码：${password}\n\n此文件仅供本机维护者查看，请勿分享或提交到仓库。\n后台使用密码哈希，反馈与统计存储于 .local-server/operations.sqlite。\n线上部署使用平台登录和管理员 ID 白名单，不能使用此本机登录方式。\n`, { flag: 'wx', mode: 0o600 });
console.log('Developer access configured. Open outputs/developer-access.txt locally to view the password. No password was printed.');
