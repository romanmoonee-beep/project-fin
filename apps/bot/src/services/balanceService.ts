// apps/bot/src/services/balanceService.ts (продолжение)
          userId,
          type: TransactionType.refund,
          amount: amount,
          description: `Разморозка средств: ${reason}`,
          metadata: { unfrozen: true, reason }
        }
      });

      return { user: updatedUser, transaction };
    });
  }

  // Get available balance (total - frozen)
  async getAvailableBalance(userId: number): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      select: { balance: true, frozenBalance: true }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    return user.balance.toNumber() - user.frozenBalance.toNumber();
  }

  // Get transaction history
  async getTransactionHistory(
    userId: number,
    page = 1,
    limit = 20,
    type?: TransactionType
  ) {
    const skip = (page - 1) * limit;
    
    const where = {
      userId,
      ...(type && { type })
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.transaction.count({ where })
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  // Handle referral bonus
  async handleReferralBonus(referrerId: number, referralId: number) {
    const referrer = await prisma.user.findUnique({
      where: { telegramId: referrerId }
    });

    if (!referrer) {
      throw new Error('Реферер не найден');
    }

    const levelConfig = USER_LEVEL_CONFIG[referrer.level];
    const bonusAmount = levelConfig.referralBonus;

    // Check if bonus was already given
    const existingBonus = await prisma.transaction.findFirst({
      where: {
        userId: referrerId,
        type: TransactionType.referral,
        metadata: {
          path: ['referralId'],
          equals: referralId
        }
      }
    });

    if (existingBonus) {
      return null; // Bonus already given
    }

    // Give referral bonus
    return await this.updateBalance(
      referrerId,
      bonusAmount,
      TransactionType.referral,
      `Бонус за приглашение пользователя`,
      { referralId, bonusType: 'registration' }
    );
  }

  // Handle referral earning bonus (percentage from referral's earnings)
  async handleReferralEarningBonus(referrerId: number, referralId: number, earningAmount: number) {
    const referrer = await prisma.user.findUnique({
      where: { telegramId: referrerId }
    });

    if (!referrer) return null;

    // Calculate bonus (5% of referral's earning)
    const bonusPercentage = 0.05;
    const bonusAmount = Math.floor(earningAmount * bonusPercentage);

    if (bonusAmount < 1) return null; // Minimum 1 GRAM

    return await this.updateBalance(
      referrerId,
      bonusAmount,
      TransactionType.referral,
      `Бонус с заработка реферала (${bonusPercentage * 100}%)`,
      { referralId, earningAmount, bonusPercentage }
    );
  }

  // Check for level upgrade
  private async checkLevelUpgrade(userId: number, newBalance: number, tx?: any) {
    const user = await (tx || prisma).user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) return;

    const currentLevel = user.level;
    let newLevel = currentLevel;

    // Check level requirements
    if (newBalance >= 100000 && currentLevel !== 'premium') {
      newLevel = 'premium';
    } else if (newBalance >= 50000 && currentLevel === 'bronze' || currentLevel === 'silver') {
      newLevel = 'gold';
    } else if (newBalance >= 10000 && currentLevel === 'bronze') {
      newLevel = 'silver';
    }

    if (newLevel !== currentLevel) {
      await (tx || prisma).user.update({
        where: { telegramId: userId },
        data: { level: newLevel }
      });

      // Send level up notification
      await notificationService.createNotification(
        userId,
        'level_up',
        'Повышение уровня!',
        `Поздравляем! Ваш уровень повышен до ${newLevel.toUpperCase()}`,
        { oldLevel: currentLevel, newLevel }
      );
    }
  }

  // Notify about balance changes
  private async notifyBalanceChange(
    userId: number,
    amount: number,
    newBalance: number,
    type: TransactionType
  ) {
    let title = '';
    let message = '';

    if (amount > 0) {
      title = 'Баланс пополнен';
      message = `На ваш баланс зачислено ${amount} GRAM. Текущий баланс: ${newBalance} GRAM`;
    } else {
      title = 'Списание с баланса';
      message = `С вашего баланса списано ${Math.abs(amount)} GRAM. Текущий баланс: ${newBalance} GRAM`;
    }

    await notificationService.createNotification(
      userId,
      'balance_updated',
      title,
      message,
      { amount, newBalance, type }
    );
  }

  // Get balance statistics
  async getBalanceStatistics(userId: number) {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    // Calculate statistics
    const totalEarned = await prisma.transaction.aggregate({
      where: {
        userId,
        type: { in: [TransactionType.earn, TransactionType.referral, TransactionType.bonus] }
      },
      _sum: { amount: true }
    });

    const totalSpent = await prisma.transaction.aggregate({
      where: {
        userId,
        type: TransactionType.spend
      },
      _sum: { amount: true }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEarned = await prisma.transaction.aggregate({
      where: {
        userId,
        type: { in: [TransactionType.earn, TransactionType.referral, TransactionType.bonus] },
        createdAt: { gte: today }
      },
      _sum: { amount: true }
    });

    return {
      currentBalance: user.balance.toNumber(),
      frozenBalance: user.frozenBalance.toNumber(),
      availableBalance: user.balance.toNumber() - user.frozenBalance.toNumber(),
      totalEarned: totalEarned._sum.amount?.toNumber() || 0,
      totalSpent: Math.abs(totalSpent._sum.amount?.toNumber() || 0),
      todayEarned: todayEarned._sum.amount?.toNumber() || 0,
      level: user.level,
      recentTransactions: user.transactions
    };
  }

  // Process batch transactions (for admin operations)
  async processBatchTransactions(transactions: Array<{
    userId: number;
    amount: number;
    type: TransactionType;
    description: string;
    metadata?: any;
  }>) {
    const results = [];

    for (const tx of transactions) {
      try {
        const result = await this.updateBalance(
          tx.userId,
          tx.amount,
          tx.type,
          tx.description,
          tx.metadata
        );
        results.push({ success: true, userId: tx.userId, result });
      } catch (error) {
        results.push({ 
          success: false, 
          userId: tx.userId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  // Check if user can afford amount
  async canAfford(userId: number, amount: number): Promise<boolean> {
    const availableBalance = await this.getAvailableBalance(userId);
    return availableBalance >= amount;
  }

  // Transfer between users (for checks system)
  async transferBalance(
    fromUserId: number,
    toUserId: number,
    amount: number,
    description: string,
    metadata?: any
  ) {
    return await prisma.$transaction(async (tx) => {
      // Check sender's balance
      const canAfford = await this.canAfford(fromUserId, amount);
      if (!canAfford) {
        throw new Error('Недостаточно средств для перевода');
      }

      // Deduct from sender
      await this.updateBalance(
        fromUserId,
        -amount,
        TransactionType.spend,
        `Перевод: ${description}`,
        { ...metadata, transferTo: toUserId }
      );

      // Add to receiver
      await this.updateBalance(
        toUserId,
        amount,
        TransactionType.earn,
        `Получен перевод: ${description}`,
        { ...metadata, transferFrom: fromUserId }
      );

      return true;
    });
  }
}

export const balanceService = new BalanceService();