import {ensureDevSession} from '@/utils/auth'
import {createMockAdapter} from './mockAdapter'
import {resetSandboxState} from './state'

export const isMockMode = process.env.VUE_APP_MOCK === 'true'

export function initMockMode(axiosInstance) {
    if (!isMockMode) {
        return
    }
    resetSandboxState()
    ensureDevSession()
    sessionStorage.setItem('username', 'product.manager')
    sessionStorage.setItem('groupId', '1')
    axiosInstance.defaults.adapter = createMockAdapter()
}
