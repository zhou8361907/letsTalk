package com.example.service;

import com.example.entity.Account;
import com.example.entity.Transaction;
import com.example.mapper.AccountMapper;
import com.example.mapper.TransactionMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.data.redis.core.RedisTemplate;

import java.util.List;

/**
 * 账户服务
 */
@Service
public class AccountService {

    @Autowired
    private AccountMapper accountMapper;

    @Autowired
    private TransactionMapper transactionMapper;

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    /**
     * 根据ID获取账户（简单方法）
     */
    public Account getById(Long id) {
        return accountMapper.selectById(id);
    }

    /**
     * 获取交易记录（简单方法）
     */
    public List<Transaction> getTransactions(Long accountId) {
        return transactionMapper.selectByAccountId(accountId);
    }

    /**
     * 更新账户（中等复杂度）
     */
    @Transactional
    public void update(Account account) {
        accountMapper.updateById(account);
        // 清除缓存
        redisTemplate.delete("account:" + account.getId());
    }

    /**
     * 与银行同步数据（高复杂度方法）
     * 这个方法包含：数据库操作、HTTP调用、消息队列、缓存操作
     */
    @Transactional
    public void syncWithBank(Long accountId) {
        // 1. 从数据库获取账户信息
        Account account = accountMapper.selectById(accountId);
        if (account == null) {
            throw new RuntimeException("账户不存在");
        }

        // 2. 调用银行 API 获取最新余额
        String bankApiUrl = "https://bank-api.example.com/account/" + account.getBankAccountNo();
        BankAccountInfo bankInfo = restTemplate.getForObject(bankApiUrl, BankAccountInfo.class);

        if (bankInfo != null) {
            // 3. 比对差异
            if (!account.getBalance().equals(bankInfo.getBalance())) {
                // 4. 更新本地数据库
                account.setBalance(bankInfo.getBalance());
                account.setStatus(bankInfo.getStatus());
                accountMapper.updateById(account);

                // 5. 记录交易
                Transaction transaction = new Transaction();
                transaction.setAccountId(accountId);
                transaction.setAmount(bankInfo.getBalance().subtract(account.getBalance()));
                transaction.setType("SYNC");
                transactionMapper.insert(transaction);

                // 6. 发送 MQ 消息通知其他系统
                rabbitTemplate.convertAndSend("account.sync", "account:" + accountId);

                // 7. 更新缓存
                redisTemplate.opsForValue().set("account:" + accountId, account);
            }
        }

        // 8. 如果余额异常，发送告警
        if (account.getBalance().compareTo(new BigDecimal("0")) < 0) {
            // 调用告警服务
            String alertUrl = "https://alert-api.example.com/send";
            restTemplate.postForObject(alertUrl, new Alert("账户余额异常", accountId), Void.class);
        }
    }
}
