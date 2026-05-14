// frontend/app/stocks.ts

export const STOCKS = [
  // ==========================================
  // INDIAN STOCKS (NSE/BSE)
  // ==========================================
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'NSE', ticker: 'RELIANCE.NS', currency: '₹' },
  { name: 'Tata Consultancy Services', symbol: 'TCS', exchange: 'NSE', ticker: 'TCS.NS', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'NSE', ticker: 'HDFCBANK.NS', currency: '₹' },
  { name: 'ICICI Bank', symbol: 'ICICIBANK', exchange: 'NSE', ticker: 'ICICIBANK.NS', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'NSE', ticker: 'INFY.NS', currency: '₹' },
  { name: 'State Bank of India', symbol: 'SBIN', exchange: 'NSE', ticker: 'SBIN.NS', currency: '₹' },
  { name: 'Bharti Airtel', symbol: 'BHARTIARTL', exchange: 'NSE', ticker: 'BHARTIARTL.NS', currency: '₹' },
  { name: 'ITC Ltd', symbol: 'ITC', exchange: 'NSE', ticker: 'ITC.NS', currency: '₹' },
  { name: 'Larsen & Toubro', symbol: 'LT', exchange: 'NSE', ticker: 'LT.NS', currency: '₹' },
  { name: 'Bajaj Finance', symbol: 'BAJFINANCE', exchange: 'NSE', ticker: 'BAJFINANCE.NS', currency: '₹' },
  { name: 'Adani Enterprises', symbol: 'ADANIENT', exchange: 'NSE', ticker: 'ADANIENT.NS', currency: '₹' },
  { name: 'Asian Paints', symbol: 'ASIANPAINT', exchange: 'NSE', ticker: 'ASIANPAINT.NS', currency: '₹' },
  { name: 'HCL Technologies', symbol: 'HCLTECH', exchange: 'NSE', ticker: 'HCLTECH.NS', currency: '₹' },
  { name: 'Axis Bank', symbol: 'AXISBANK', exchange: 'NSE', ticker: 'AXISBANK.NS', currency: '₹' },
  { name: 'Maruti Suzuki', symbol: 'MARUTI', exchange: 'NSE', ticker: 'MARUTI.NS', currency: '₹' },
  { name: 'Sun Pharma', symbol: 'SUNPHARMA', exchange: 'NSE', ticker: 'SUNPHARMA.NS', currency: '₹' },
  { name: 'Tata Motors', symbol: 'TATAMOTORS', exchange: 'NSE', ticker: 'TATAMOTORS.NS', currency: '₹' },
  { name: 'Mahindra & Mahindra', symbol: 'M&M', exchange: 'NSE', ticker: 'M&M.NS', currency: '₹' },
  { name: 'UltraTech Cement', symbol: 'ULTRACEMCO', exchange: 'NSE', ticker: 'ULTRACEMCO.NS', currency: '₹' },
  { name: 'Titan Company', symbol: 'TITAN', exchange: 'NSE', ticker: 'TITAN.NS', currency: '₹' },
  // BSE Variants
  { name: 'Infosys', symbol: 'INFY', exchange: 'BSE', ticker: '500209.BO', currency: '₹' },
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'BSE', ticker: '500325.BO', currency: '₹' },
  { name: 'TCS', symbol: 'TCS', exchange: 'BSE', ticker: '532540.BO', currency: '₹' },

  // ==========================================
  // US STOCKS (NASDAQ/NYSE)
  // ==========================================
  { name: 'Apple', symbol: 'AAPL', exchange: 'NASDAQ', ticker: 'AAPL', currency: '$' },
  { name: 'Microsoft', symbol: 'MSFT', exchange: 'NASDAQ', ticker: 'MSFT', currency: '$' },
  { name: 'Nvidia', symbol: 'NVDA', exchange: 'NASDAQ', ticker: 'NVDA', currency: '$' },
  { name: 'Tesla', symbol: 'TSLA', exchange: 'NASDAQ', ticker: 'TSLA', currency: '$' },
  { name: 'Alphabet (Google)', symbol: 'GOOGL', exchange: 'NASDAQ', ticker: 'GOOGL', currency: '$' },
  { name: 'Amazon', symbol: 'AMZN', exchange: 'NASDAQ', ticker: 'AMZN', currency: '$' },
  { name: 'Meta', symbol: 'META', exchange: 'NASDAQ', ticker: 'META', currency: '$' },
  { name: 'Netflix', symbol: 'NFLX', exchange: 'NASDAQ', ticker: 'NFLX', currency: '$' },
  { name: 'AMD', symbol: 'AMD', exchange: 'NASDAQ', ticker: 'AMD', currency: '$' },
  { name: 'Intel', symbol: 'INTC', exchange: 'NASDAQ', ticker: 'INTC', currency: '$' },
  { name: 'JPMorgan Chase', symbol: 'JPM', exchange: 'NYSE', ticker: 'JPM', currency: '$' },
  { name: 'Visa', symbol: 'V', exchange: 'NYSE', ticker: 'V', currency: '$' },
  { name: 'Walmart', symbol: 'WMT', exchange: 'NYSE', ticker: 'WMT', currency: '$' },
  { name: 'Johnson & Johnson', symbol: 'JNJ', exchange: 'NYSE', ticker: 'JNJ', currency: '$' },
  { name: 'Mastercard', symbol: 'MA', exchange: 'NYSE', ticker: 'MA', currency: '$' },
  { name: 'Procter & Gamble', symbol: 'PG', exchange: 'NYSE', ticker: 'PG', currency: '$' },
  { name: 'UnitedHealth', symbol: 'UNH', exchange: 'NYSE', ticker: 'UNH', currency: '$' },
  { name: 'Home Depot', symbol: 'HD', exchange: 'NYSE', ticker: 'HD', currency: '$' },
  { name: 'Chevron', symbol: 'CVX', exchange: 'NYSE', ticker: 'CVX', currency: '$' },
  { name: 'Eli Lilly', symbol: 'LLY', exchange: 'NYSE', ticker: 'LLY', currency: '$' },

  // ==========================================
  // CRYPTOCURRENCIES
  // ==========================================
  { name: 'Bitcoin', symbol: 'BTC', exchange: 'CRYPTO', ticker: 'BTC-USD', currency: '$' },
  { name: 'Ethereum', symbol: 'ETH', exchange: 'CRYPTO', ticker: 'ETH-USD', currency: '$' },
  { name: 'Solana', symbol: 'SOL', exchange: 'CRYPTO', ticker: 'SOL-USD', currency: '$' },
  { name: 'Ripple', symbol: 'XRP', exchange: 'CRYPTO', ticker: 'XRP-USD', currency: '$' },
  { name: 'Cardano', symbol: 'ADA', exchange: 'CRYPTO', ticker: 'ADA-USD', currency: '$' },
  { name: 'Dogecoin', symbol: 'DOGE', exchange: 'CRYPTO', ticker: 'DOGE-USD', currency: '$' },
  { name: 'Binance Coin', symbol: 'BNB', exchange: 'CRYPTO', ticker: 'BNB-USD', currency: '$' },
  { name: 'Chainlink', symbol: 'LINK', exchange: 'CRYPTO', ticker: 'LINK-USD', currency: '$' },
  { name: 'Polkadot', symbol: 'DOT', exchange: 'CRYPTO', ticker: 'DOT-USD', currency: '$' },
  { name: 'Polygon', symbol: 'MATIC', exchange: 'CRYPTO', ticker: 'MATIC-USD', currency: '$' },
  { name: 'Avalanche', symbol: 'AVAX', exchange: 'CRYPTO', ticker: 'AVAX-USD', currency: '$' },
  { name: 'Shiba Inu', symbol: 'SHIB', exchange: 'CRYPTO', ticker: 'SHIB-USD', currency: '$' },
  { name: 'Litecoin', symbol: 'LTC', exchange: 'CRYPTO', ticker: 'LTC-USD', currency: '$' },
  { name: 'Uniswap', symbol: 'UNI', exchange: 'CRYPTO', ticker: 'UNI-USD', currency: '$' },
  { name: 'Cosmos', symbol: 'ATOM', exchange: 'CRYPTO', ticker: 'ATOM-USD', currency: '$' },
  { name: 'Monero', symbol: 'XMR', exchange: 'CRYPTO', ticker: 'XMR-USD', currency: '$' },
  { name: 'Stellar', symbol: 'XLM', exchange: 'CRYPTO', ticker: 'XLM-USD', currency: '$' },
  { name: 'Bitcoin Cash', symbol: 'BCH', exchange: 'CRYPTO', ticker: 'BCH-USD', currency: '$' },
  { name: 'Aptos', symbol: 'APT', exchange: 'CRYPTO', ticker: 'APT-USD', currency: '$' },
  { name: 'Arbitrum', symbol: 'ARB', exchange: 'CRYPTO', ticker: 'ARB-USD', currency: '$' },
];