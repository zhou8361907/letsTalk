<template>
  <div class="detail-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>账户详情</span>
          <el-button type="primary" @click="handleSync">同步数据</el-button>
        </div>
      </template>

      <el-form :model="form" label-width="120px">
        <el-form-item label="账户名称" prop="accountName">
          <el-input v-model="form.accountName" />
        </el-form-item>
        <el-form-item label="账户余额" prop="balance">
          <el-input-number v-model="form.balance" :precision="2" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status">
            <el-option label="正常" value="NORMAL" />
            <el-option label="冻结" value="FROZEN" />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="actions">
        <el-button @click="handleReset">重置</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </div>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>交易记录</template>
      <el-table :data="transactions">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="amount" label="金额" />
        <el-table-column prop="type" label="类型" />
        <el-table-column prop="createTime" label="时间" />
      </el-table>
    </el-card>
  </div>
</template>

<script>
export default {
  name: 'Detail',
  data() {
    return {
      accountId: null,
      form: {
        accountName: '',
        balance: 0,
        status: 'NORMAL'
      },
      transactions: []
    }
  },
  mounted() {
    this.accountId = this.$route.params.id
    this.loadDetail()
    this.loadTransactions()
  },
  methods: {
    async loadDetail() {
      try {
        const res = await this.$http.get(`/api/account/${this.accountId}`)
        this.form = res.data
      } catch (error) {
        this.$message.error('加载详情失败')
      }
    },
    async loadTransactions() {
      try {
        const res = await this.$http.get(`/api/account/${this.accountId}/transactions`)
        this.transactions = res.data
      } catch (error) {
        this.$message.error('加载交易记录失败')
      }
    },
    async handleSave() {
      try {
        await this.$http.put(`/api/account/${this.accountId}`, this.form)
        this.$message.success('保存成功')
      } catch (error) {
        this.$message.error('保存失败')
      }
    },
    async handleSync() {
      try {
        this.$message.info('正在同步数据...')
        await this.$http.post(`/api/account/${this.accountId}/sync`)
        this.$message.success('同步成功')
        this.loadDetail()
      } catch (error) {
        this.$message.error('同步失败')
      }
    },
    handleReset() {
      this.loadDetail()
    }
  }
}
</script>

<style scoped>
.detail-page {
  padding: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.actions {
  text-align: right;
  margin-top: 20px;
}
</style>
