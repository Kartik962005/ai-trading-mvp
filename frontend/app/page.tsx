'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`https://ai-trading-backend-jhcl.onrender.com${url}`).then(res => res.json());

const STOCKS = [
  // ---------------- NSE (Top 67) ----------------
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'NSE', ticker: 'RELIANCE.NS', currency: '₹' },
  { name: 'Tata Consultancy Services', symbol: 'TCS', exchange: 'NSE', ticker: 'TCS.NS', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'NSE', ticker: 'HDFCBANK.NS', currency: '₹' },
  { name: 'ICICI Bank', symbol: 'ICICIBANK', exchange: 'NSE', ticker: 'ICICIBANK.NS', currency: '₹' },
  { name: 'Bharti Airtel', symbol: 'BHARTIARTL', exchange: 'NSE', ticker: 'BHARTIARTL.NS', currency: '₹' },
  { name: 'State Bank of India', symbol: 'SBIN', exchange: 'NSE', ticker: 'SBIN.NS', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'NSE', ticker: 'INFY.NS', currency: '₹' },
  { name: 'LIC India', symbol: 'LICI', exchange: 'NSE', ticker: 'LICI.NS', currency: '₹' },
  { name: 'ITC', symbol: 'ITC', exchange: 'NSE', ticker: 'ITC.NS', currency: '₹' },
  { name: 'Hindustan Unilever', symbol: 'HINDUNILVR', exchange: 'NSE', ticker: 'HINDUNILVR.NS', currency: '₹' },
  { name: 'Larsen & Toubro', symbol: 'LT', exchange: 'NSE', ticker: 'LT.NS', currency: '₹' },
  { name: 'Bajaj Finance', symbol: 'BAJFINANCE', exchange: 'NSE', ticker: 'BAJFINANCE.NS', currency: '₹' },
  { name: 'HCL Technologies', symbol: 'HCLTECH', exchange: 'NSE', ticker: 'HCLTECH.NS', currency: '₹' },
  { name: 'Maruti Suzuki', symbol: 'MARUTI', exchange: 'NSE', ticker: 'MARUTI.NS', currency: '₹' },
  { name: 'Sun Pharma', symbol: 'SUNPHARMA', exchange: 'NSE', ticker: 'SUNPHARMA.NS', currency: '₹' },
  { name: 'Adani Enterprises', symbol: 'ADANIENT', exchange: 'NSE', ticker: 'ADANIENT.NS', currency: '₹' },
  { name: 'Tata Motors', symbol: 'TATAMOTORS', exchange: 'NSE', ticker: 'TATAMOTORS.NS', currency: '₹' },
  { name: 'NTPC', symbol: 'NTPC', exchange: 'NSE', ticker: 'NTPC.NS', currency: '₹' },
  { name: 'Kotak Mahindra Bank', symbol: 'KOTAKBANK', exchange: 'NSE', ticker: 'KOTAKBANK.NS', currency: '₹' },
  { name: 'ONGC', symbol: 'ONGC', exchange: 'NSE', ticker: 'ONGC.NS', currency: '₹' },
  { name: 'Titan Company', symbol: 'TITAN', exchange: 'NSE', ticker: 'TITAN.NS', currency: '₹' },
  { name: 'UltraTech Cement', symbol: 'ULTRACEMCO', exchange: 'NSE', ticker: 'ULTRACEMCO.NS', currency: '₹' },
  { name: 'Tata Steel', symbol: 'TATASTEEL', exchange: 'NSE', ticker: 'TATASTEEL.NS', currency: '₹' },
  { name: 'Power Grid', symbol: 'POWERGRID', exchange: 'NSE', ticker: 'POWERGRID.NS', currency: '₹' },
  { name: 'Bajaj Finserv', symbol: 'BAJAJFINSV', exchange: 'NSE', ticker: 'BAJAJFINSV.NS', currency: '₹' },
  { name: 'Adani Ports', symbol: 'ADANIPORTS', exchange: 'NSE', ticker: 'ADANIPORTS.NS', currency: '₹' },
  { name: 'Wipro', symbol: 'WIPRO', exchange: 'NSE', ticker: 'WIPRO.NS', currency: '₹' },
  { name: 'M&M', symbol: 'M&M', exchange: 'NSE', ticker: 'M&M.NS', currency: '₹' },
  { name: 'Asian Paints', symbol: 'ASIANPAINT', exchange: 'NSE', ticker: 'ASIANPAINT.NS', currency: '₹' },
  { name: 'Coal India', symbol: 'COALINDIA', exchange: 'NSE', ticker: 'COALINDIA.NS', currency: '₹' },
  { name: 'Apollo Hospitals', symbol: 'APOLLOHOSP', exchange: 'NSE', ticker: 'APOLLOHOSP.NS', currency: '₹' },
  { name: 'Britannia', symbol: 'BRITANNIA', exchange: 'NSE', ticker: 'BRITANNIA.NS', currency: '₹' },
  { name: 'Tech Mahindra', symbol: 'TECHM', exchange: 'NSE', ticker: 'TECHM.NS', currency: '₹' },
  { name: 'Shriram Finance', symbol: 'SHRIRAMFIN', exchange: 'NSE', ticker: 'SHRIRAMFIN.NS', currency: '₹' },
  { name: 'Hindalco', symbol: 'HINDALCO', exchange: 'NSE', ticker: 'HINDALCO.NS', currency: '₹' },
  { name: 'Grasim', symbol: 'GRASIM', exchange: 'NSE', ticker: 'GRASIM.NS', currency: '₹' },
  { name: 'Eicher Motors', symbol: 'EICHERMOT', exchange: 'NSE', ticker: 'EICHERMOT.NS', currency: '₹' },
  { name: 'Cipla', symbol: 'CIPLA', exchange: 'NSE', ticker: 'CIPLA.NS', currency: '₹' },
  { name: 'Dr. Reddy', symbol: 'DRREDDY', exchange: 'NSE', ticker: 'DRREDDY.NS', currency: '₹' },
  { name: 'Tata Consumer', symbol: 'TATACONSUM', exchange: 'NSE', ticker: 'TATACONSUM.NS', currency: '₹' },
  { name: 'SBI Life', symbol: 'SBILIFE', exchange: 'NSE', ticker: 'SBILIFE.NS', currency: '₹' },
  { name: 'Divis Labs', symbol: 'DIVISLAB', exchange: 'NSE', ticker: 'DIVISLAB.NS', currency: '₹' },
  { name: 'BPCL', symbol: 'BPCL', exchange: 'NSE', ticker: 'BPCL.NS', currency: '₹' },
  { name: 'UPL', symbol: 'UPL', exchange: 'NSE', ticker: 'UPL.NS', currency: '₹' },
  { name: 'HDFC Life', symbol: 'HDFCLIFE', exchange: 'NSE', ticker: 'HDFCLIFE.NS', currency: '₹' },
  { name: 'Adani Green', symbol: 'ADANIGREEN', exchange: 'NSE', ticker: 'ADANIGREEN.NS', currency: '₹' },
  { name: 'Tata Power', symbol: 'TATAPOWER', exchange: 'NSE', ticker: 'TATAPOWER.NS', currency: '₹' },
  { name: 'IndusInd Bank', symbol: 'INDUSINDBK', exchange: 'NSE', ticker: 'INDUSINDBK.NS', currency: '₹' },
  { name: 'Nestle India', symbol: 'NESTLEIND', exchange: 'NSE', ticker: 'NESTLEIND.NS', currency: '₹' },
  { name: 'Shree Cement', symbol: 'SHREECEM', exchange: 'NSE', ticker: 'SHREECEM.NS', currency: '₹' },
  { name: 'Bajaj Auto', symbol: 'BAJAJ-AUTO', exchange: 'NSE', ticker: 'BAJAJ-AUTO.NS', currency: '₹' },
  { name: 'Trent', symbol: 'TRENT', exchange: 'NSE', ticker: 'TRENT.NS', currency: '₹' },
  { name: 'Hero MotoCorp', symbol: 'HEROMOTOCO', exchange: 'NSE', ticker: 'HEROMOTOCO.NS', currency: '₹' },
  { name: 'LTIMindtree', symbol: 'LTIM', exchange: 'NSE', ticker: 'LTIM.NS', currency: '₹' },
  { name: 'Bharat Electronics', symbol: 'BEL', exchange: 'NSE', ticker: 'BEL.NS', currency: '₹' },
  { name: 'Cholamandalam', symbol: 'CHOLAFIN', exchange: 'NSE', ticker: 'CHOLAFIN.NS', currency: '₹' },
  { name: 'TVS Motor', symbol: 'TVSMOTOR', exchange: 'NSE', ticker: 'TVSMOTOR.NS', currency: '₹' },
  { name: 'Pidilite', symbol: 'PIDILITIND', exchange: 'NSE', ticker: 'PIDILITIND.NS', currency: '₹' },
  { name: 'JSW Steel', symbol: 'JSWSTEEL', exchange: 'NSE', ticker: 'JSWSTEEL.NS', currency: '₹' },
  { name: 'ICICI Lombard', symbol: 'ICICIGI', exchange: 'NSE', ticker: 'ICICIGI.NS', currency: '₹' },
  { name: 'Hindustan Aero', symbol: 'HAL', exchange: 'NSE', ticker: 'HAL.NS', currency: '₹' },
  { name: 'InterGlobe Aviation', symbol: 'INDIGO', exchange: 'NSE', ticker: 'INDIGO.NS', currency: '₹' },
  { name: 'Varun Beverages', symbol: 'VBL', exchange: 'NSE', ticker: 'VBL.NS', currency: '₹' },
  { name: 'BHEL', symbol: 'BHEL', exchange: 'NSE', ticker: 'BHEL.NS', currency: '₹' },
  { name: 'Ambuja Cements', symbol: 'AMBUJACEM', exchange: 'NSE', ticker: 'AMBUJACEM.NS', currency: '₹' },
  { name: 'SRF', symbol: 'SRF', exchange: 'NSE', ticker: 'SRF.NS', currency: '₹' },
  { name: 'Zomato', symbol: 'ZOMATO', exchange: 'NSE', ticker: 'ZOMATO.NS', currency: '₹' },

  // ---------------- BSE (Top 67) ----------------
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'BSE', ticker: '500325.BO', currency: '₹' },
  { name: 'Tata Consultancy Services', symbol: 'TCS', exchange: 'BSE', ticker: '532540.BO', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'BSE', ticker: '500180.BO', currency: '₹' },
  { name: 'ICICI Bank', symbol: 'ICICIBANK', exchange: 'BSE', ticker: '532174.BO', currency: '₹' },
  { name: 'Bharti Airtel', symbol: 'BHARTIARTL', exchange: 'BSE', ticker: '532454.BO', currency: '₹' },
  { name: 'State Bank of India', symbol: 'SBIN', exchange: 'BSE', ticker: '500112.BO', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'BSE', ticker: '500209.BO', currency: '₹' },
  { name: 'LIC India', symbol: 'LICI', exchange: 'BSE', ticker: '543526.BO', currency: '₹' },
  { name: 'ITC', symbol: 'ITC', exchange: 'BSE', ticker: '500875.BO', currency: '₹' },
  { name: 'Hindustan Unilever', symbol: 'HINDUNILVR', exchange: 'BSE', ticker: '500696.BO', currency: '₹' },
  { name: 'Larsen & Toubro', symbol: 'LT', exchange: 'BSE', ticker: '500510.BO', currency: '₹' },
  { name: 'Bajaj Finance', symbol: 'BAJFINANCE', exchange: 'BSE', ticker: '500034.BO', currency: '₹' },
  { name: 'HCL Technologies', symbol: 'HCLTECH', exchange: 'BSE', ticker: '532281.BO', currency: '₹' },
  { name: 'Maruti Suzuki', symbol: 'MARUTI', exchange: 'BSE', ticker: '532500.BO', currency: '₹' },
  { name: 'Sun Pharma', symbol: 'SUNPHARMA', exchange: 'BSE', ticker: '524715.BO', currency: '₹' },
  { name: 'Adani Enterprises', symbol: 'ADANIENT', exchange: 'BSE', ticker: '512599.BO', currency: '₹' },
  { name: 'Tata Motors', symbol: 'TATAMOTORS', exchange: 'BSE', ticker: '500570.BO', currency: '₹' },
  { name: 'NTPC', symbol: 'NTPC', exchange: 'BSE', ticker: '532555.BO', currency: '₹' },
  { name: 'Kotak Mahindra Bank', symbol: 'KOTAKBANK', exchange: 'BSE', ticker: '500247.BO', currency: '₹' },
  { name: 'ONGC', symbol: 'ONGC', exchange: 'BSE', ticker: '500312.BO', currency: '₹' },
  { name: 'Titan Company', symbol: 'TITAN', exchange: 'BSE', ticker: '500114.BO', currency: '₹' },
  { name: 'UltraTech Cement', symbol: 'ULTRACEMCO', exchange: 'BSE', ticker: '532538.BO', currency: '₹' },
  { name: 'Tata Steel', symbol: 'TATASTEEL', exchange: 'BSE', ticker: '500470.BO', currency: '₹' },
  { name: 'Power Grid', symbol: 'POWERGRID', exchange: 'BSE', ticker: '532898.BO', currency: '₹' },
  { name: 'Bajaj Finserv', symbol: 'BAJAJFINSV', exchange: 'BSE', ticker: '532978.BO', currency: '₹' },
  { name: 'Adani Ports', symbol: 'ADANIPORTS', exchange: 'BSE', ticker: '532921.BO', currency: '₹' },
  { name: 'Wipro', symbol: 'WIPRO', exchange: 'BSE', ticker: '507685.BO', currency: '₹' },
  { name: 'M&M', symbol: 'M&M', exchange: 'BSE', ticker: '500520.BO', currency: '₹' },
  { name: 'Asian Paints', symbol: 'ASIANPAINT', exchange: 'BSE', ticker: '500820.BO', currency: '₹' },
  { name: 'Coal India', symbol: 'COALINDIA', exchange: 'BSE', ticker: '533278.BO', currency: '₹' },
  { name: 'Apollo Hospitals', symbol: 'APOLLOHOSP', exchange: 'BSE', ticker: '508869.BO', currency: '₹' },
  { name: 'Britannia', symbol: 'BRITANNIA', exchange: 'BSE', ticker: '500825.BO', currency: '₹' },
  { name: 'Tech Mahindra', symbol: 'TECHM', exchange: 'BSE', ticker: '532755.BO', currency: '₹' },
  { name: 'Shriram Finance', symbol: 'SHRIRAMFIN', exchange: 'BSE', ticker: '511218.BO', currency: '₹' },
  { name: 'Hindalco', symbol: 'HINDALCO', exchange: 'BSE', ticker: '500440.BO', currency: '₹' },
  { name: 'Grasim', symbol: 'GRASIM', exchange: 'BSE', ticker: '500300.BO', currency: '₹' },
  { name: 'Eicher Motors', symbol: 'EICHERMOT', exchange: 'BSE', ticker: '505200.BO', currency: '₹' },
  { name: 'Cipla', symbol: 'CIPLA', exchange: 'BSE', ticker: '500087.BO', currency: '₹' },
  { name: 'Dr. Reddy', symbol: 'DRREDDY', exchange: 'BSE', ticker: '500124.BO', currency: '₹' },
  { name: 'Tata Consumer', symbol: 'TATACONSUM', exchange: 'BSE', ticker: '500800.BO', currency: '₹' },
  { name: 'SBI Life', symbol: 'SBILIFE', exchange: 'BSE', ticker: '540719.BO', currency: '₹' },
  { name: 'Divis Labs', symbol: 'DIVISLAB', exchange: 'BSE', ticker: '532488.BO', currency: '₹' },
  { name: 'BPCL', symbol: 'BPCL', exchange: 'BSE', ticker: '500547.BO', currency: '₹' },
  { name: 'UPL', symbol: 'UPL', exchange: 'BSE', ticker: '512070.BO', currency: '₹' },
  { name: 'HDFC Life', symbol: 'HDFCLIFE', exchange: 'BSE', ticker: '540777.BO', currency: '₹' },
  { name: 'Adani Green', symbol: 'ADANIGREEN', exchange: 'BSE', ticker: '541450.BO', currency: '₹' },
  { name: 'Tata Power', symbol: 'TATAPOWER', exchange: 'BSE', ticker: '500400.BO', currency: '₹' },
  { name: 'IndusInd Bank', symbol: 'INDUSINDBK', exchange: 'BSE', ticker: '532187.BO', currency: '₹' },
  { name: 'Nestle India', symbol: 'NESTLEIND', exchange: 'BSE', ticker: '500790.BO', currency: '₹' },
  { name: 'Shree Cement', symbol: 'SHREECEM', exchange: 'BSE', ticker: '500387.BO', currency: '₹' },
  { name: 'Bajaj Auto', symbol: 'BAJAJ-AUTO', exchange: 'BSE', ticker: '532977.BO', currency: '₹' },
  { name: 'Trent', symbol: 'TRENT', exchange: 'BSE', ticker: '500251.BO', currency: '₹' },
  { name: 'Hero MotoCorp', symbol: 'HEROMOTOCO', exchange: 'BSE', ticker: '500182.BO', currency: '₹' },
  { name: 'LTIMindtree', symbol: 'LTIM', exchange: 'BSE', ticker: '540005.BO', currency: '₹' },
  { name: 'Bharat Electronics', symbol: 'BEL', exchange: 'BSE', ticker: '500049.BO', currency: '₹' },
  { name: 'Cholamandalam', symbol: 'CHOLAFIN', exchange: 'BSE', ticker: '511243.BO', currency: '₹' },
  { name: 'TVS Motor', symbol: 'TVSMOTOR', exchange: 'BSE', ticker: '532343.BO', currency: '₹' },
  { name: 'Pidilite', symbol: 'PIDILITIND', exchange: 'BSE', ticker: '500331.BO', currency: '₹' },
  { name: 'JSW Steel', symbol: 'JSWSTEEL', exchange: 'BSE', ticker: '500228.BO', currency: '₹' },
  { name: 'ICICI Lombard', symbol: 'ICICIGI', exchange: 'BSE', ticker: '540716.BO', currency: '₹' },
  { name: 'Hindustan Aero', symbol: 'HAL', exchange: 'BSE', ticker: '541154.BO', currency: '₹' },
  { name: 'InterGlobe Aviation', symbol: 'INDIGO', exchange: 'BSE', ticker: '539448.BO', currency: '₹' },
  { name: 'Varun Beverages', symbol: 'VBL', exchange: 'BSE', ticker: '540180.BO', currency: '₹' },
  { name: 'BHEL', symbol: 'BHEL', exchange: 'BSE', ticker: '500103.BO', currency: '₹' },
  { name: 'Ambuja Cements', symbol: 'AMBUJACEM', exchange: 'BSE', ticker: '500425.BO', currency: '₹' },
  { name: 'SRF', symbol: 'SRF', exchange: 'BSE', ticker: '503806.BO', currency: '₹' },
  { name: 'Zomato', symbol: 'ZOMATO', exchange: 'BSE', ticker: '543320.BO', currency: '₹' },

  // ---------------- NASDAQ / US (Top 66) ----------------
  { name: 'Apple', symbol: 'AAPL', exchange: 'NASDAQ', ticker: 'AAPL', currency: '$' },
  { name: 'Microsoft', symbol: 'MSFT', exchange: 'NASDAQ', ticker: 'MSFT', currency: '$' },
  { name: 'Google (Alphabet)', symbol: 'GOOGL', exchange: 'NASDAQ', ticker: 'GOOGL', currency: '$' },
  { name: 'Amazon', symbol: 'AMZN', exchange: 'NASDAQ', ticker: 'AMZN', currency: '$' },
  { name: 'Nvidia', symbol: 'NVDA', exchange: 'NASDAQ', ticker: 'NVDA', currency: '$' },
  { name: 'Meta Platforms', symbol: 'META', exchange: 'NASDAQ', ticker: 'META', currency: '$' },
  { name: 'Tesla', symbol: 'TSLA', exchange: 'NASDAQ', ticker: 'TSLA', currency: '$' },
  { name: 'Broadcom', symbol: 'AVGO', exchange: 'NASDAQ', ticker: 'AVGO', currency: '$' },
  { name: 'Costco', symbol: 'COST', exchange: 'NASDAQ', ticker: 'COST', currency: '$' },
  { name: 'Netflix', symbol: 'NFLX', exchange: 'NASDAQ', ticker: 'NFLX', currency: '$' },
  { name: 'AMD', symbol: 'AMD', exchange: 'NASDAQ', ticker: 'AMD', currency: '$' },
  { name: 'PepsiCo', symbol: 'PEP', exchange: 'NASDAQ', ticker: 'PEP', currency: '$' },
  { name: 'Cisco Systems', symbol: 'CSCO', exchange: 'NASDAQ', ticker: 'CSCO', currency: '$' },
  { name: 'T-Mobile US', symbol: 'TMUS', exchange: 'NASDAQ', ticker: 'TMUS', currency: '$' },
  { name: 'Intel', symbol: 'INTC', exchange: 'NASDAQ', ticker: 'INTC', currency: '$' },
  { name: 'Comcast', symbol: 'CMCSA', exchange: 'NASDAQ', ticker: 'CMCSA', currency: '$' },
  { name: 'Intuit', symbol: 'INTU', exchange: 'NASDAQ', ticker: 'INTU', currency: '$' },
  { name: 'Qualcomm', symbol: 'QCOM', exchange: 'NASDAQ', ticker: 'QCOM', currency: '$' },
  { name: 'Applied Materials', symbol: 'AMAT', exchange: 'NASDAQ', ticker: 'AMAT', currency: '$' },
  { name: 'Honeywell', symbol: 'HON', exchange: 'NASDAQ', ticker: 'HON', currency: '$' },
  { name: 'Amgen', symbol: 'AMGN', exchange: 'NASDAQ', ticker: 'AMGN', currency: '$' },
  { name: 'Texas Instruments', symbol: 'TXN', exchange: 'NASDAQ', ticker: 'TXN', currency: '$' },
  { name: 'Intuitive Surgical', symbol: 'ISRG', exchange: 'NASDAQ', ticker: 'ISRG', currency: '$' },
  { name: 'Starbucks', symbol: 'SBUX', exchange: 'NASDAQ', ticker: 'SBUX', currency: '$' },
  { name: 'Gilead Sciences', symbol: 'GILD', exchange: 'NASDAQ', ticker: 'GILD', currency: '$' },
  { name: 'Booking Holdings', symbol: 'BKNG', exchange: 'NASDAQ', ticker: 'BKNG', currency: '$' },
  { name: 'Mondelez', symbol: 'MDLZ', exchange: 'NASDAQ', ticker: 'MDLZ', currency: '$' },
  { name: 'Analog Devices', symbol: 'ADI', exchange: 'NASDAQ', ticker: 'ADI', currency: '$' },
  { name: 'Vertex Pharma', symbol: 'VRTX', exchange: 'NASDAQ', ticker: 'VRTX', currency: '$' },
  { name: 'Automatic Data Proc', symbol: 'ADP', exchange: 'NASDAQ', ticker: 'ADP', currency: '$' },
  { name: 'Regeneron', symbol: 'REGN', exchange: 'NASDAQ', ticker: 'REGN', currency: '$' },
  { name: 'Micron Technology', symbol: 'MU', exchange: 'NASDAQ', ticker: 'MU', currency: '$' },
  { name: 'PayPal', symbol: 'PYPL', exchange: 'NASDAQ', ticker: 'PYPL', currency: '$' },
  { name: 'Lam Research', symbol: 'LRCX', exchange: 'NASDAQ', ticker: 'LRCX', currency: '$' },
  { name: 'Synopsys', symbol: 'SNPS', exchange: 'NASDAQ', ticker: 'SNPS', currency: '$' },
  { name: 'KLA Corporation', symbol: 'KLAC', exchange: 'NASDAQ', ticker: 'KLAC', currency: '$' },
  { name: 'Cadence Design', symbol: 'CDNS', exchange: 'NASDAQ', ticker: 'CDNS', currency: '$' },
  { name: 'CSX Corp', symbol: 'CSX', exchange: 'NASDAQ', ticker: 'CSX', currency: '$' },
  { name: 'MercadoLibre', symbol: 'MELI', exchange: 'NASDAQ', ticker: 'MELI', currency: '$' },
  { name: 'Palo Alto Networks', symbol: 'PANW', exchange: 'NASDAQ', ticker: 'PANW', currency: '$' },
  { name: 'Monster Beverage', symbol: 'MNST', exchange: 'NASDAQ', ticker: 'MNST', currency: '$' },
  { name: 'O\'Reilly Auto', symbol: 'ORLY', exchange: 'NASDAQ', ticker: 'ORLY', currency: '$' },
  { name: 'Fortinet', symbol: 'FTNT', exchange: 'NASDAQ', ticker: 'FTNT', currency: '$' },
  { name: 'Keurig Dr Pepper', symbol: 'KDP', exchange: 'NASDAQ', ticker: 'KDP', currency: '$' },
  { name: 'Marriott Intl', symbol: 'MAR', exchange: 'NASDAQ', ticker: 'MAR', currency: '$' },
  { name: 'Cintas', symbol: 'CTAS', exchange: 'NASDAQ', ticker: 'CTAS', currency: '$' },
  { name: 'American Electric', symbol: 'AEP', exchange: 'NASDAQ', ticker: 'AEP', currency: '$' },
  { name: 'CrowdStrike', symbol: 'CRWD', exchange: 'NASDAQ', ticker: 'CRWD', currency: '$' },
  { name: 'NXP Semiconductors', symbol: 'NXPI', exchange: 'NASDAQ', ticker: 'NXPI', currency: '$' },
  { name: 'DexCom', symbol: 'DXCM', exchange: 'NASDAQ', ticker: 'DXCM', currency: '$' },
  { name: 'Microchip Tech', symbol: 'MCHP', exchange: 'NASDAQ', ticker: 'MCHP', currency: '$' },
  { name: 'ASML Holding', symbol: 'ASML', exchange: 'NASDAQ', ticker: 'ASML', currency: '$' },
  { name: 'IDEXX Labs', symbol: 'IDXX', exchange: 'NASDAQ', ticker: 'IDXX', currency: '$' },
  { name: 'PACCAR', symbol: 'PCAR', exchange: 'NASDAQ', ticker: 'PCAR', currency: '$' },
  { name: 'Exelon', symbol: 'EXC', exchange: 'NASDAQ', ticker: 'EXC', currency: '$' },
  { name: 'Paychex', symbol: 'PAYX', exchange: 'NASDAQ', ticker: 'PAYX', currency: '$' },
  { name: 'Biogen', symbol: 'BIIB', exchange: 'NASDAQ', ticker: 'BIIB', currency: '$' },
  { name: 'Cognizant', symbol: 'CTSH', exchange: 'NASDAQ', ticker: 'CTSH', currency: '$' },
  { name: 'Workday', symbol: 'WDAY', exchange: 'NASDAQ', ticker: 'WDAY', currency: '$' },
  { name: 'Ross Stores', symbol: 'ROST', exchange: 'NASDAQ', ticker: 'ROST', currency: '$' },
  { name: 'Moderna', symbol: 'MRNA', exchange: 'NASDAQ', ticker: 'MRNA', currency: '$' },
  { name: 'Kraft Heinz', symbol: 'KHC', exchange: 'NASDAQ', ticker: 'KHC', currency: '$' },
  { name: 'Fastenal', symbol: 'FAST', exchange: 'NASDAQ', ticker: 'FAST', currency: '$' },
  { name: 'Copart', symbol: 'CPRT', exchange: 'NASDAQ', ticker: 'CPRT', currency: '$' },
  { name: 'Electronic Arts', symbol: 'EA', exchange: 'NASDAQ', ticker: 'EA', currency: '$' },
  { name: 'JPMorgan Chase', symbol: 'JPM', exchange: 'NYSE', ticker: 'JPM', currency: '$' },

  // ---------------- CRYPTO (Top 50) ----------------
  { name: 'Bitcoin', symbol: 'BTC', exchange: 'CRYPTO', ticker: 'BTC-USD', currency: '$' },
  { name: 'Ethereum', symbol: 'ETH', exchange: 'CRYPTO', ticker: 'ETH-USD', currency: '$' },
  { name: 'Tether', symbol: 'USDT', exchange: 'CRYPTO', ticker: 'USDT-USD', currency: '$' },
  { name: 'BNB', symbol: 'BNB', exchange: 'CRYPTO', ticker: 'BNB-USD', currency: '$' },
  { name: 'Solana', symbol: 'SOL', exchange: 'CRYPTO', ticker: 'SOL-USD', currency: '$' },
  { name: 'USDC', symbol: 'USDC', exchange: 'CRYPTO', ticker: 'USDC-USD', currency: '$' },
  { name: 'XRP', symbol: 'XRP', exchange: 'CRYPTO', ticker: 'XRP-USD', currency: '$' },
  { name: 'Cardano', symbol: 'ADA', exchange: 'CRYPTO', ticker: 'ADA-USD', currency: '$' },
  { name: 'Dogecoin', symbol: 'DOGE', exchange: 'CRYPTO', ticker: 'DOGE-USD', currency: '$' },
  { name: 'Shiba Inu', symbol: 'SHIB', exchange: 'CRYPTO', ticker: 'SHIB-USD', currency: '$' },
  { name: 'Avalanche', symbol: 'AVAX', exchange: 'CRYPTO', ticker: 'AVAX-USD', currency: '$' },
  { name: 'Polkadot', symbol: 'DOT', exchange: 'CRYPTO', ticker: 'DOT-USD', currency: '$' },
  { name: 'Chainlink', symbol: 'LINK', exchange: 'CRYPTO', ticker: 'LINK-USD', currency: '$' },
  { name: 'TRON', symbol: 'TRX', exchange: 'CRYPTO', ticker: 'TRX-USD', currency: '$' },
  { name: 'Polygon', symbol: 'MATIC', exchange: 'CRYPTO', ticker: 'MATIC-USD', currency: '$' },
  { name: 'Toncoin', symbol: 'TON', exchange: 'CRYPTO', ticker: 'TON-USD', currency: '$' },
  { name: 'Internet Computer', symbol: 'ICP', exchange: 'CRYPTO', ticker: 'ICP-USD', currency: '$' },
  { name: 'Litecoin', symbol: 'LTC', exchange: 'CRYPTO', ticker: 'LTC-USD', currency: '$' },
  { name: 'Uniswap', symbol: 'UNI', exchange: 'CRYPTO', ticker: 'UNI-USD', currency: '$' },
  { name: 'Bitcoin Cash', symbol: 'BCH', exchange: 'CRYPTO', ticker: 'BCH-USD', currency: '$' },
  { name: 'Stellar', symbol: 'XLM', exchange: 'CRYPTO', ticker: 'XLM-USD', currency: '$' },
  { name: 'Aptos', symbol: 'APT', exchange: 'CRYPTO', ticker: 'APT-USD', currency: '$' },
  { name: 'NEAR Protocol', symbol: 'NEAR', exchange: 'CRYPTO', ticker: 'NEAR-USD', currency: '$' },
  { name: 'Cosmos', symbol: 'ATOM', exchange: 'CRYPTO', ticker: 'ATOM-USD', currency: '$' },
  { name: 'Monero', symbol: 'XMR', exchange: 'CRYPTO', ticker: 'XMR-USD', currency: '$' },
  { name: 'Arbitrum', symbol: 'ARB', exchange: 'CRYPTO', ticker: 'ARB-USD', currency: '$' },
  { name: 'Render', symbol: 'RNDR', exchange: 'CRYPTO', ticker: 'RNDR-USD', currency: '$' },
  { name: 'VeChain', symbol: 'VET', exchange: 'CRYPTO', ticker: 'VET-USD', currency: '$' },
  { name: 'Lido DAO', symbol: 'LDO', exchange: 'CRYPTO', ticker: 'LDO-USD', currency: '$' },
  { name: 'Mantle', symbol: 'MNT', exchange: 'CRYPTO', ticker: 'MNT-USD', currency: '$' },
  { name: 'Cronos', symbol: 'CRO', exchange: 'CRYPTO', ticker: 'CRO-USD', currency: '$' },
  { name: 'Filecoin', symbol: 'FIL', exchange: 'CRYPTO', ticker: 'FIL-USD', currency: '$' },
  { name: 'Optimism', symbol: 'OP', exchange: 'CRYPTO', ticker: 'OP-USD', currency: '$' },
  { name: 'Kaspa', symbol: 'KAS', exchange: 'CRYPTO', ticker: 'KAS-USD', currency: '$' },
  { name: 'Injective', symbol: 'INJ', exchange: 'CRYPTO', ticker: 'INJ-USD', currency: '$' },
  { name: 'Stacks', symbol: 'STX', exchange: 'CRYPTO', ticker: 'STX-USD', currency: '$' },
  { name: 'The Graph', symbol: 'GRT', exchange: 'CRYPTO', ticker: 'GRT-USD', currency: '$' },
  { name: 'Theta Network', symbol: 'THETA', exchange: 'CRYPTO', ticker: 'THETA-USD', currency: '$' },
  { name: 'EOS', symbol: 'EOS', exchange: 'CRYPTO', ticker: 'EOS-USD', currency: '$' },
  { name: 'Algorand', symbol: 'ALGO', exchange: 'CRYPTO', ticker: 'ALGO-USD', currency: '$' },
  { name: 'THORChain', symbol: 'RUNE', exchange: 'CRYPTO', ticker: 'RUNE-USD', currency: '$' },
  { name: 'Fantom', symbol: 'FTM', exchange: 'CRYPTO', ticker: 'FTM-USD', currency: '$' },
  { name: 'Terra Classic', symbol: 'LUNC', exchange: 'CRYPTO', ticker: 'LUNC-USD', currency: '$' },
  { name: 'Aave', symbol: 'AAVE', exchange: 'CRYPTO', ticker: 'AAVE-USD', currency: '$' },
  { name: 'Flow', symbol: 'FLOW', exchange: 'CRYPTO', ticker: 'FLOW-USD', currency: '$' },
  { name: 'The Sandbox', symbol: 'SAND', exchange: 'CRYPTO', ticker: 'SAND-USD', currency: '$' },
  { name: 'Decentraland', symbol: 'MANA', exchange: 'CRYPTO', ticker: 'MANA-USD', currency: '$' },
  { name: 'Chiliz', symbol: 'CHZ', exchange: 'CRYPTO', ticker: 'CHZ-USD', currency: '$' },
  { name: 'Synthetix', symbol: 'SNX', exchange: 'CRYPTO', ticker: 'SNX-USD', currency: '$' },
  { name: 'Axie Infinity', symbol: 'AXS', exchange: 'CRYPTO', ticker: 'AXS-USD', currency: '$' },
];

const STRATEGIES = [
  { id: 1,  name: 'Golden Cross',           description: 'SMA 50 crosses above SMA 200 — classic long-term bullish signal' },
  { id: 2,  name: 'RSI Oversold Bounce',    description: 'RSI below 30 signals oversold conditions — potential reversal' },
  { id: 3,  name: 'MACD Crossover',         description: 'MACD line crosses signal line — momentum shift indicator' },
  { id: 4,  name: 'Bollinger Band Breakout',description: 'Price breaks above upper band — strong momentum signal' },
  { id: 5,  name: 'Mean Reversion',         description: 'Price far from moving average — expects return to mean' },
  { id: 6,  name: 'Momentum Trading',       description: 'Buy stocks showing strong upward price momentum' },
  { id: 7,  name: 'Breakout Trading',       description: 'Buy when price breaks key resistance with volume' },
  { id: 8,  name: 'Trend Following',        description: 'Follow the primary trend using multiple timeframe analysis' },
  { id: 9,  name: 'Volume Price Analysis',  description: 'Confirms price moves with volume for stronger signals' },
  { id: 10, name: 'Support & Resistance',   description: 'Trade bounces off key price levels' },
  { id: 11, name: 'EMA Ribbon',             description: 'Multiple EMAs show trend strength and direction' },
  { id: 12, name: 'Stochastic Oscillator',  description: 'Compares closing price to price range over time' },
  { id: 13, name: 'ATR Breakout',           description: 'Uses Average True Range to identify volatility breakouts' },
  { id: 14, name: 'Inside Bar Pattern',     description: 'Consolidation pattern before a major price move' },
  { id: 15, name: 'VWAP Strategy',          description: 'Trade relative to Volume Weighted Average Price' },
  { id: 16, name: 'Death Cross Reversal',   description: 'SMA 50 crosses below SMA 200 — bearish signal to short' },
  { id: 17, name: 'RSI Divergence',         description: 'Price and RSI move in opposite directions — reversal signal' },
  { id: 18, name: 'Gap Fill Strategy',      description: 'Stocks tend to fill price gaps — fade the gap open' },
  { id: 19, name: 'Swing High/Low',         description: 'Trade between swing highs and lows in a range' },
  { id: 20, name: 'Fibonacci Retracement',  description: 'Buy at key Fibonacci levels during a pullback' },
];

export default function Home() {
  const [ticker, setTicker] = useState('TCS.NS');
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedStrategyId, setExpandedStrategyId] = useState<number | null>(null);
  
  const chartRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: quote } = useSWR(`/api/v1/quote/${ticker}`, fetcher, { refreshInterval: 30000 });
  const { data: chartData } = useSWR(`/api/v1/chart/${ticker}`, fetcher);
  const { data: analysis } = useSWR(`/api/v1/analyze/${ticker}`, fetcher);

  useEffect(() => {
    if (input.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = input.trim().toLowerCase();
    const filtered = STOCKS.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.symbol.toLowerCase().includes(q) ||
      s.ticker.toLowerCase().includes(q)
    ).slice(0, 8); // Limits dropdown to top 8 dynamic results for pure performance
    setSuggestions(filtered);
    setShowSuggestions(true);
  }, [input]);

  useEffect(() => {
    if (!chartData || !chartRef.current || !Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth || 800,
        height: 450,
        layout: { background: { color: 'transparent' }, textColor: '#64748b' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        crosshair: { mode: 1 },
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22d3ee', downColor: '#f43f5e', 
        borderVisible: false, wickUpColor: '#22d3ee', wickDownColor: '#f43f5e'
      });
      const formattedData = chartData
        .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
        .map((d: any) => ({
          time: d.date?.toString().slice(0, 10),
          open: parseFloat(d.open), high: parseFloat(d.high),
          low: parseFloat(d.low), close: parseFloat(d.close),
        }));
      candleSeries.setData(formattedData);
      chart.timeScale().fitContent();
    });
  }, [chartData]);

  const selectStock = (stock: typeof STOCKS[0]) => {
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setInput(`${stock.name} (${stock.exchange})`);
    setShowSuggestions(false);
    setExpandedStrategyId(null);
  };

  const verdictColor = analysis?.verdict?.includes('Buy') ? 'text-cyan-400 shadow-cyan-400/50' :
    analysis?.verdict === 'Hold' ? 'text-amber-400 shadow-amber-400/50' : 'text-rose-400 shadow-rose-400/50';

  const verdictBg = analysis?.verdict?.includes('Buy') ? 'border-cyan-500/40 bg-cyan-950/20' :
    analysis?.verdict === 'Hold' ? 'border-amber-500/40 bg-amber-950/20' : 'border-rose-500/40 bg-rose-950/20';

  const sentimentScore = analysis?.sentiment?.score || 0;
  const pointerPosition = Math.max(5, Math.min(95, ((sentimentScore + 1) / 2) * 100));

  return (
    <div className="min-h-screen bg-[#030305] text-gray-200 selection:bg-cyan-500/30" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
      
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:2rem_2rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
      </div>

      <div className="relative z-10 p-4 sm:p-6 md:p-12 max-w-7xl mx-auto">
        <div className="mb-12 md:mb-16 pt-8 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-md mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-[10px] md:text-xs font-mono text-cyan-300 tracking-[0.2em] uppercase">System Online // v2.0</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black mb-4 tracking-tighter bg-gradient-to-br from-white via-cyan-100 to-cyan-800 bg-clip-text text-transparent filter drop-shadow-[0_0_15px_rgba(34,211,238,0.2)] break-words leading-tight px-2 w-full">
            QUANTUM.TRADE
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm md:text-base font-mono tracking-[0.1em] uppercase max-w-2xl px-4">
            Algorithmic Pattern Recognition & NLP Market Sentiment
          </p>
        </div>

        <div className="relative w-full max-w-3xl mx-auto mb-16 px-4 sm:px-0">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full blur opacity-20"></div>
          <div className="relative">
             <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 px-6 sm:px-8 py-4 sm:py-5 rounded-full text-lg sm:text-xl text-white outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder-gray-600 font-mono"
              placeholder="> INIT QUERY (e.g., AAPL, TCS, BTC)"
            />
          </div>
          
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-[calc(100%-2rem)] sm:w-full mx-4 sm:mx-0 bg-[#0a0a0c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl mt-4 shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden">
              {suggestions.map((stock, i) => (
                <div key={i} onMouseDown={() => selectStock(stock)}
                  className="flex justify-between items-center px-6 py-4 hover:bg-cyan-500/10 hover:pl-8 cursor-pointer border-b border-white/5 last:border-0 transition-all duration-200">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-100">{stock.name}</span>
                    <span className="text-cyan-500/70 text-xs font-mono">{stock.symbol}</span>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-mono backdrop-blur-sm ${
                    stock.exchange === 'CRYPTO' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 
                    'bg-white/5 border border-white/10 text-gray-300'
                  }`}>
                    {stock.exchange}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          <div className="lg:col-span-8 border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-4 sm:p-6 shadow-2xl relative overflow-hidden group">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 border-b border-white/5 pb-4">
              <div className="mb-4 sm:mb-0">
                <p className="text-cyan-500 text-xs font-mono tracking-widest mb-1 uppercase">Live Data Stream</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{ticker}</h2>
              </div>
              {quote && quote.price && (
                <div className="text-left sm:text-right">
                  <span className="text-3xl sm:text-4xl font-mono tracking-tighter text-white">{currency}{quote.price}</span>
                  <div className={`text-sm sm:text-lg font-mono flex items-center justify-start sm:justify-end gap-1 mt-1 ${quote.change_percent > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                    {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                  </div>
                </div>
              )}
            </div>

            {!chartData ? (
              <div className="h-[450px] flex flex-col items-center justify-center font-mono text-cyan-400/50 gap-4">
                <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                FETCHING...
              </div>
            ) : (
              <div ref={chartRef} className="w-full h-[300px] sm:h-[450px]" />
            )}
          </div>

          <div className="lg:col-span-4 flex flex-col gap-8">
            <div className="border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-6 sm:p-8 relative overflow-hidden">
              <h3 className="text-sm font-mono text-purple-400 tracking-widest uppercase mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span>
                Global News NLP
              </h3>
              
              <div className="mb-8 mt-12">
                <div className="relative w-full h-3 rounded-full border border-white/10 bg-black/50">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-500 via-gray-500 to-cyan-500 opacity-80" />
                  <div 
                    className="absolute top-[-36px] -translate-x-1/2 flex flex-col items-center transition-all duration-1000 ease-out"
                    style={{ left: `${pointerPosition}%` }}
                  >
                    <div className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider mb-1 uppercase whitespace-nowrap ${
                      analysis?.sentiment?.label === 'Bullish' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.3)]' :
                      analysis?.sentiment?.label === 'Bearish' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                    }`}>
                      {analysis?.sentiment?.label || 'ANALYZING...'}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 21L1 3H23L12 21Z" fill="currentColor"/>
                    </svg>
                  </div>
                </div>
                
                <div className="flex justify-between text-[10px] font-mono text-gray-500 mt-2 px-1 tracking-widest uppercase">
                  <span>Bearish</span><span>Neutral</span><span>Bullish</span>
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-xs text-gray-600 font-mono uppercase tracking-widest block border-b border-white/5 pb-2">Recent Scans</span>
                {analysis?.sentiment?.headlines && analysis.sentiment.headlines.length > 0 ? (
                  <ul className="space-y-3">
                    {analysis.sentiment.headlines.map((headline: string, idx: number) => (
                      <li key={idx} className="text-xs sm:text-sm text-gray-300 font-sans leading-relaxed border-l-[3px] border-purple-500/50 pl-4 py-2 bg-white/[0.03] rounded-r-lg">
                        {headline || "Unknown Headline"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs sm:text-sm text-gray-500 font-sans italic p-4 bg-white/5 rounded-xl border border-white/10">
                    No news data available for this asset at this time.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {analysis && !analysis.error && (
          <div className={`border backdrop-blur-2xl rounded-[2rem] p-6 sm:p-10 mb-16 relative overflow-hidden shadow-2xl ${verdictBg}`}>
             <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-[100px] pointer-events-none"></div>
             
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-white/10 pb-6">
                <div>
                  <h3 className="text-sm font-mono text-gray-400 tracking-widest uppercase mb-1">Predictive Forecast</h3>
                  <div className={`text-5xl sm:text-6xl font-black tracking-tight ${verdictColor}`}>{analysis.verdict}</div>
                </div>
                
                <div className="mt-6 md:mt-0 text-left md:text-right">
                   <span className="text-xs font-mono text-gray-500 tracking-widest uppercase block mb-1">AI Confidence Level</span>
                   <div className="flex items-center gap-3">
                     <div className="text-3xl font-mono text-white">{analysis.confidence}%</div>
                     <div className="flex gap-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`w-6 h-1.5 rounded-full ${i <= Math.ceil(analysis.confidence / 20) ? 'bg-cyan-400' : 'bg-white/10'}`} />
                        ))}
                     </div>
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-black/30 rounded-2xl p-5 border border-white/5">
                  <span className="text-gray-500 text-xs font-mono uppercase tracking-wider block mb-1">Entry Vector</span>
                  <p className="text-2xl font-mono text-white">{currency}{analysis.entry}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                    <span className="text-[10px] font-mono text-gray-500 uppercase">Profile</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      analysis.risk_level === 'High Risk' ? 'bg-rose-500/20 text-rose-400' :
                      analysis.risk_level === 'Medium Risk' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'
                    }`}>{analysis.risk_level}</span>
                  </div>
                </div>

                <div className="bg-black/30 rounded-2xl p-5 border border-white/5 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <span className="text-gray-500 text-xs font-mono uppercase tracking-wider block mb-1">Target Price</span>
                  <p className="text-3xl font-mono text-cyan-400">{currency}{analysis.target}</p>
                  <p className="text-cyan-500/50 text-[10px] font-mono uppercase tracking-wider mt-1">Take Profit Zone</p>
                </div>

                <div className="bg-cyan-500/10 rounded-2xl p-5 border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
                  <span className="text-cyan-400 text-xs font-mono uppercase tracking-wider block mb-1">Expected Timeframe</span>
                  <p className="text-2xl font-mono text-white">{analysis.estimated_days} Trading Days</p>
                  <p className="text-cyan-300 text-sm font-mono mt-1 border-t border-cyan-500/20 pt-2">By {analysis.target_date}</p>
                </div>

                <div className="bg-black/30 rounded-2xl p-5 border border-white/5">
                  <span className="text-gray-500 text-xs font-mono uppercase tracking-wider block mb-1">Hard Stop-Loss</span>
                  <p className="text-3xl font-mono text-rose-400">{currency}{analysis.stop_loss}</p>
                  <p className="text-rose-500/50 text-[10px] font-mono uppercase tracking-wider mt-1">Maximum Risk Tolerance</p>
                </div>
             </div>
             
             <div className="mt-8 pt-6 border-t border-white/5 flex items-center gap-4">
                <span className="text-xs font-mono text-gray-500 whitespace-nowrap">FISO SCORE ({analysis.fiso_score}/100)</span>
                <div className="w-full bg-black/40 rounded-full h-1 overflow-hidden border border-white/5">
                  <div className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-cyan-500" style={{ width: `${analysis.fiso_score}%` }} />
                </div>
             </div>
          </div>
        )}

        {analysis && !analysis.error && (
          <div className="border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-4 sm:p-8 lg:p-12 mb-12">
            <div className="mb-10 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">Tactical Strategy Matrix</h2>
              <p className="text-cyan-500/70 font-mono text-xs sm:text-sm uppercase tracking-widest">Validating 20 mathematical models. Hover/Tap to expand.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
              {STRATEGIES.map((strategy) => {
                const evalData = analysis?.strategy_evals?.[strategy.id];
                const isBest = analysis?.best_strategy_id === strategy.id;
                const isExpanded = expandedStrategyId === strategy.id;

                return (
                  <div
                    key={strategy.id}
                    onMouseEnter={() => setExpandedStrategyId(strategy.id)}
                    onMouseLeave={() => setExpandedStrategyId(null)}
                    onClick={() => setExpandedStrategyId(isExpanded ? null : strategy.id)}
                    className={`relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                      isBest ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border-white/5 hover:border-white/20'
                    } ${
                      isExpanded ? 'bg-black/80 z-20 scale-105' : 'bg-black/30'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className={`font-mono text-[10px] tracking-widest uppercase block ${
                        isBest ? 'text-cyan-400 font-bold' : 'text-gray-500'
                      }`}>MODEL {String(strategy.id).padStart(2, '0')}</span>
                      
                      {isExpanded && (
                        <button className="sm:hidden text-gray-400 hover:text-white">✕</button>
                      )}
                    </div>

                    <span className="font-bold text-sm leading-tight block text-white mb-3">{strategy.name}</span>
                    
                    {evalData && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                           evalData.score > 75 ? 'bg-cyan-500/20 text-cyan-400' : 
                           evalData.score > 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          SCORE: {evalData.score}
                        </span>
                        {isBest && <span className="text-[10px] bg-cyan-400 text-black px-1.5 py-0.5 rounded font-bold uppercase">Best Fit</span>}
                      </div>
                    )}

                    <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100 mt-4 border-t border-white/10 pt-4' : 'max-h-0 opacity-0'}`}>
                      <p className="text-xs text-gray-400 mb-2 font-mono">Overview: {strategy.description}</p>
                      <p className="text-sm text-gray-200 leading-relaxed font-sans border-l-2 border-cyan-500/50 pl-2">
                        {evalData?.desc || "Awaiting mathematical evaluation..."}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}