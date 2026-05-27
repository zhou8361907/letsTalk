import Vue from 'vue'
import App from './App.vue'
import router from './router'
import './plugins/element.js'
import {ensureDevSession, skipAuth} from './utils/auth'
import {isMockMode} from './sandbox'

Vue.config.productionTip = false

router.beforeEach((to, from, next) => {
    if (skipAuth || isMockMode) {
        ensureDevSession()
        next()
        return
    }

    const username = sessionStorage.getItem("username");
    if (to.path !== '/login') {
        if (username) {
            next()
        } else {
            next({
                path: '/login',
                query: {redirect: to.fullPath}
            })
        }
    } else if (username) {
        next(false);
    } else {
        next();
    }
})

new Vue({
    router,
    render: h => h(App),
}).$mount('#app');
