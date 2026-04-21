/**
 * Calculate net balances for each member from a list of expenses.
 * Returns a map: memberId -> net amount (positive = is owed, negative = owes)
 */
export function calculateNetBalances(expenses, members) {
  const balances = {};
  members.forEach((m) => (balances[m.id] = 0));

  expenses.forEach((expense) => {
    const { paidBy, amount, splitAmong, currency } = expense;
    if (!splitAmong || splitAmong.length === 0) return;

    const share = amount / splitAmong.length;

    // The payer is owed money
    balances[paidBy] = (balances[paidBy] || 0) + amount;

    // Each participant owes their share
    splitAmong.forEach((memberId) => {
      balances[memberId] = (balances[memberId] || 0) - share;
    });
  });

  return balances;
}

/**
 * Simplify debts: compute minimum transactions to settle all balances.
 * Returns array of { from, to, amount } objects.
 */
export function simplifyDebts(netBalances) {
  const creditors = []; // people who are owed money (positive balance)
  const debtors = []; // people who owe money (negative balance)

  Object.entries(netBalances).forEach(([id, balance]) => {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 0.01) {
      creditors.push({ id, amount: rounded });
    } else if (rounded < -0.01) {
      debtors.push({ id, amount: -rounded }); // store as positive
    }
  });

  // Sort descending by amount for greedy matching
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const settleAmount = Math.min(creditors[i].amount, debtors[j].amount);
    if (settleAmount > 0.01) {
      transactions.push({
        from: debtors[j].id,
        to: creditors[i].id,
        amount: Math.round(settleAmount * 100) / 100,
      });
    }

    creditors[i].amount -= settleAmount;
    debtors[j].amount -= settleAmount;

    if (creditors[i].amount < 0.01) i++;
    if (debtors[j].amount < 0.01) j++;
  }

  return transactions;
}

/**
 * Calculate per-currency balances and simplified debts.
 */
export function calculatePerCurrencyBalances(expenses, members) {
  // Group expenses by currency
  const byCurrency = {};
  expenses.forEach((exp) => {
    const cur = exp.currency || "USD";
    if (!byCurrency[cur]) byCurrency[cur] = [];
    byCurrency[cur].push(exp);
  });

  const result = {};
  Object.entries(byCurrency).forEach(([currency, currencyExpenses]) => {
    const netBalances = calculateNetBalances(currencyExpenses, members);
    const debts = simplifyDebts(netBalances);
    result[currency] = { netBalances, debts, total: currencyExpenses.reduce((s, e) => s + e.amount, 0) };
  });

  return result;
}
