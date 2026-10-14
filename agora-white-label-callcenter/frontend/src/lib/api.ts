// 开发时指向本地后端；生产时用 BASE_URL 前缀（去掉末尾斜杠），让 API 请求经网关转发到容器
export const API = import.meta.env.DEV
  ? 'http://localhost:8000'
  : import.meta.env.BASE_URL.replace(/\/$/, '')
