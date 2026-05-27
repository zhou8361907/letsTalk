<template>
  <div class="user-list">
    <el-button @click="loadUsers" type="primary">加载用户列表</el-button>
    <el-table :data="users" style="margin-top: 20px">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="姓名" />
      <el-table-column prop="email" label="邮箱" />
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button @click="deleteUser(row.id)" type="danger" size="small">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
export default {
  name: 'UserList',
  data() {
    return {
      users: []
    }
  },
  mounted() {
    this.loadUsers()
  },
  methods: {
    async loadUsers() {
      try {
        const res = await this.$http.get('/api/user/list')
        this.users = res.data
      } catch (error) {
        console.error('加载用户失败:', error)
      }
    },
    async deleteUser(userId) {
      try {
        await this.$http.delete(`/api/user/${userId}`)
        this.$message.success('删除成功')
        this.loadUsers()
      } catch (error) {
        this.$message.error('删除失败')
      }
    }
  }
}
</script>

<style scoped>
.user-list {
  padding: 20px;
}
</style>
