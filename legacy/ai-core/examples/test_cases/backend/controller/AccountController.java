package com.example.controller;

import com.example.service.AccountService;
import com.example.entity.Account;
import com.example.entity.Transaction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 账户控制器
 */
@RestController
@RequestMapping("/api/account")
public class AccountController {

    @Autowired
    private AccountService accountService;

    /**
     * 获取账户详情
     */
    @GetMapping("/{id}")
    public Result<Account> getAccountById(@PathVariable Long id) {
        Account account = accountService.getById(id);
        if (account == null) {
            return Result.error("账户不存在");
        }
        return Result.success(account);
    }

    /**
     * 获取账户交易记录
     */
    @GetMapping("/{id}/transactions")
    public Result<List<Transaction>> getTransactions(@PathVariable Long id) {
        List<Transaction> transactions = accountService.getTransactions(id);
        return Result.success(transactions);
    }

    /**
     * 更新账户信息
     */
    @PutMapping("/{id}")
    public Result<Account> updateAccount(@PathVariable Long id, @RequestBody Account account) {
        account.setId(id);
        accountService.update(account);
        return Result.success(account);
    }

    /**
     * 同步账户数据（复杂操作）
     * 这是一个高复杂度的方法，包含多种外部调用
     */
    @PostMapping("/{id}/sync")
    public Result<Void> syncAccount(@PathVariable Long id) {
        // 这个方法会调用 Service 层的复杂同步逻辑
        accountService.syncWithBank(id);
        return Result.success(null);
    }
}
