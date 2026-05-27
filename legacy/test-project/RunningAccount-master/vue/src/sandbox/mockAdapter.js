import sandboxState, {deepClone} from './state'

function ok(data) {
    return {
        code: 200,
        message: 'ok',
        data,
    }
}

function parseBody(data) {
    if (!data) {
        return {}
    }
    if (typeof data === 'string') {
        try {
            return JSON.parse(data)
        } catch (error) {
            return {}
        }
    }
    return data
}

function filterDetails(params) {
    let items = sandboxState.details.slice()
    if (params.projectId) {
        items = items.filter((item) => String(item.project.id) === String(params.projectId))
    }
    if (params.accountId) {
        items = items.filter((item) => String(item.account.id) === String(params.accountId))
    }
    if (params.departmentId) {
        items = items.filter((item) => String(item.department.id) === String(params.departmentId))
    }
    if (params.categoryId) {
        items = items.filter((item) => String(item.category.id) === String(params.categoryId))
    }
    if (params.reimbursement !== null && params.reimbursement !== undefined && params.reimbursement !== '') {
        const expected = params.reimbursement === true || params.reimbursement === 'true'
        items = items.filter((item) => item.reimbursement === expected)
    }
    if (params.digest) {
        items = items.filter((item) => item.digest.includes(params.digest))
    }
    if (params.beginDate) {
        items = items.filter((item) => new Date(item.date) >= new Date(params.beginDate))
    }
    if (params.endDate) {
        items = items.filter((item) => new Date(item.date) <= new Date(params.endDate))
    }
    const currentPage = Number(params.currentPage || 1)
    const pageSize = Number(params.pageSize || 25)
    const start = (currentPage - 1) * pageSize
    return {
        total: items.length,
        list: deepClone(items.slice(start, start + pageSize)),
    }
}

function upsertDetail(detail) {
    const payload = deepClone(detail)
    if (payload.id) {
        const index = sandboxState.details.findIndex((item) => item.id === payload.id)
        if (index >= 0) {
            sandboxState.details.splice(index, 1, payload)
            return payload.id
        }
    }
    payload.id = sandboxState.nextDetailId++
    payload.balance = payload.balance || 0
    payload.hasPicture = false
    payload.pictures = []
    sandboxState.details.unshift(payload)
    return payload.id
}

function optionCollection(type) {
    return sandboxState.options[`${type}Options`]
}

function upsertOption(type, payload) {
    const collection = optionCollection(type)
    if (!collection) {
        return null
    }
    if (payload.id) {
        const index = collection.findIndex((item) => item.id === payload.id)
        if (index >= 0) {
            collection.splice(index, 1, deepClone(payload))
            return payload.id
        }
    }
    const nextId = collection.length ? Math.max(...collection.map((item) => item.id)) + 1 : 1
    collection.push({id: nextId, name: payload.name})
    return nextId
}

export function createMockAdapter() {
    return async function mockAdapter(config) {
        const method = (config.method || 'get').toLowerCase()
        const url = (config.url || '').replace(/^\//, '')
        const body = parseBody(config.data)
        const params = config.params || {}
        let payload = ok({})

        if (method === 'get' && url === 'option/all') {
            payload = ok(deepClone(sandboxState.options))
        } else if (method === 'get' && url === 'option/account') {
            payload = ok(deepClone(sandboxState.options.accountOptions))
        } else if ((method === 'post' || method === 'put') && /^option\/(project|account|department|category)$/.test(url)) {
            const type = url.split('/')[1]
            payload = ok(upsertOption(type, body))
        } else if (method === 'get' && url === 'detail') {
            payload = ok(filterDetails(params))
        } else if (method === 'get' && /^detail\/\d+$/.test(url)) {
            const id = Number(url.split('/')[1])
            payload = ok(deepClone(sandboxState.details.find((item) => item.id === id) || null))
        } else if (method === 'post' && url === 'detail') {
            payload = ok(upsertDetail(body))
        } else if (method === 'put' && url === 'detail') {
            payload = ok(upsertDetail(body))
        } else if (method === 'delete' && url === 'detail') {
            sandboxState.details = sandboxState.details.filter((item) => item.id !== body.id)
            payload = ok(true)
        } else if (method === 'put' && url === 'detail/balance') {
            payload = ok(true)
        } else if (method === 'get' && /^detail\/picture\/\d+$/.test(url)) {
            payload = ok([])
        } else if (method === 'delete' && /^detail\/picture\/\d+$/.test(url)) {
            payload = ok(true)
        } else if (method === 'post' && url === 'excel/expenseClaimForm') {
            payload = ok(`mock-form-${Date.now()}`)
        }

        return Promise.resolve({
            data: payload,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: {},
        })
    }
}
