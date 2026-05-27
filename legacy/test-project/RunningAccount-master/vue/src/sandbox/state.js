const createOptions = () => ({
    projectOptions: [
        {id: 1, name: '门诊项目'},
        {id: 2, name: '住院项目'},
        {id: 3, name: '财务共享'},
    ],
    accountOptions: [
        {id: 1, name: '工行主账户'},
        {id: 2, name: '建行结算户'},
    ],
    departmentOptions: [
        {id: 1, name: '综合部'},
        {id: 2, name: '财务部'},
        {id: 3, name: '运营部'},
    ],
    categoryOptions: [
        {id: 1, name: '办公采购'},
        {id: 2, name: '差旅报销'},
        {id: 3, name: '客户回款'},
    ],
})

const createDetails = () => ([
    {
        id: 101,
        date: '2026-05-01T09:15:00.000Z',
        project: {id: 1, name: '门诊项目'},
        account: {id: 1, name: '工行主账户'},
        department: {id: 2, name: '财务部'},
        category: {id: 3, name: '客户回款'},
        count: 1,
        earning: 20000,
        expense: 0,
        balance: 88120,
        digest: '住院结算回款',
        reimbursement: false,
        hasPicture: false,
        pictures: [],
    },
    {
        id: 102,
        date: '2026-05-03T14:00:00.000Z',
        project: {id: 2, name: '住院项目'},
        account: {id: 2, name: '建行结算户'},
        department: {id: 1, name: '综合部'},
        category: {id: 2, name: '差旅报销'},
        count: 2,
        earning: 0,
        expense: 2100,
        balance: 86020,
        digest: '外部沟通差旅',
        reimbursement: true,
        hasPicture: false,
        pictures: [],
    },
    {
        id: 103,
        date: '2026-05-08T11:30:00.000Z',
        project: {id: 3, name: '财务共享'},
        account: {id: 1, name: '工行主账户'},
        department: {id: 3, name: '运营部'},
        category: {id: 1, name: '办公采购'},
        count: 3,
        earning: 12300,
        expense: 980,
        balance: 97340,
        digest: '办公设备采购冲销',
        reimbursement: false,
        hasPicture: false,
        pictures: [],
    },
])

const state = {
    currentUser: {
        username: 'product.manager',
        groupId: '1',
    },
    options: createOptions(),
    details: createDetails(),
    nextDetailId: 104,
}

export function deepClone(value) {
    return JSON.parse(JSON.stringify(value))
}

export function resetSandboxState() {
    state.options = createOptions()
    state.details = createDetails()
    state.nextDetailId = 104
}

export default state
