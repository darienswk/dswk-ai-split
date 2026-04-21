export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "\u20ac", name: "Euro" },
  { code: "GBP", symbol: "\u00a3", name: "British Pound" },
  { code: "JPY", symbol: "\u00a5", name: "Japanese Yen" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "INR", symbol: "\u20b9", name: "Indian Rupee" },
  { code: "CNY", symbol: "\u00a5", name: "Chinese Yuan" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "KRW", symbol: "\u20a9", name: "South Korean Won" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "THB", symbol: "\u0e3f", name: "Thai Baht" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "TRY", symbol: "\u20ba", name: "Turkish Lira" },
  { code: "PLN", symbol: "z\u0142", name: "Polish Zloty" },
];

export function getCurrencySymbol(code) {
  const currency = CURRENCIES.find((c) => c.code === code);
  return currency ? currency.symbol : code;
}

export function formatMoney(amount, currencyCode) {
  const symbol = getCurrencySymbol(currencyCode);
  return `${symbol}${Math.abs(amount).toFixed(2)}`;
}
