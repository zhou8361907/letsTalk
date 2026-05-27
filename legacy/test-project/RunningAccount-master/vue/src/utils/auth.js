/** 是否跳过前端登录校验（由 .env 中 VUE_APP_SKIP_AUTH 控制） */
export const skipAuth = process.env.VUE_APP_SKIP_AUTH === 'true'

/** 未登录时注入占位会话，避免菜单/标题依赖 sessionStorage 报错 */
export function ensureDevSession() {
    if (!sessionStorage.getItem('username')) {
        sessionStorage.setItem('username', 'dev')
    }
    if (!sessionStorage.getItem('groupId')) {
        sessionStorage.setItem('groupId', '1')
    }
}
