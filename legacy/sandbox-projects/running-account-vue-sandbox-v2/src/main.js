import Vue from 'vue'
import App from './App.vue'
import router from './router'
import './plugins/element.js'
import { installSandboxSession, isSandboxMode } from "@/sandbox";

Vue.config.productionTip = false

if (isSandboxMode) {
    installSandboxSession();
}

//路由拦截
router.beforeEach((to, from, next) => {
    if (isSandboxMode) {
        next();
        return;
    }
    const username = sessionStorage.getItem("username");
    // 判断跳转的路由是否需要登录
    if (to.path !== '/login') {
        if (username) {
            next() // 已登录
        } else {
            next({
                path: '/login',
                query: {redirect: to.fullPath} // 将跳转的路由path作为参数，登录成功后跳转到该路由
            })
        }
    } else if (username) {
        //已登录则阻止前往登陆页面(防止重复登录)
        next(false);
    } else {
        next();
    }
})

new Vue({
    router,
    render: h => h(App),
}).$mount('#app');
