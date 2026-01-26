import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../config/api';
import { useAuth } from './AuthContext';

interface CurrencyContextType {
  symbol: string;
  code: string;
  formatAmount: (amount: number) => string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrency] = useState({ code: 'INR', symbol: '₹' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCurrency = async () => {
      if (!user?.organizationId) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/api/organizations/${user.organizationId}`);
        if (response.data) {
          setCurrency({
            code: response.data.currency_code || 'INR',
            symbol: response.data.currency_symbol || '₹',
          });
        }
      } catch (error) {
        console.error('Error fetching currency:', error);
        // Default to INR on error
        setCurrency({ code: 'INR', symbol: '₹' });
      } finally {
        setLoading(false);
      }
    };

    fetchCurrency();
  }, [user?.organizationId]);

  const formatAmount = (amount: number): string => {
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return `${currency.symbol} 0.00`;

    // Format based on currency code
    if (currency.code === 'INR') {
      // Indian numbering system: 1,25,000.00
      const parts = numAmount.toFixed(2).split('.');
      const integerPart = parts[0];
      const decimalPart = parts[1];
      
      // Format with Indian numbering (lakhs, crores)
      let formatted = '';
      let count = 0;
      for (let i = integerPart.length - 1; i >= 0; i--) {
        if (count > 0 && count % 2 === 0 && i !== integerPart.length - 1) {
          formatted = ',' + formatted;
        }
        formatted = integerPart[i] + formatted;
        count++;
      }
      
      return `${currency.symbol} ${formatted}.${decimalPart}`;
    } else {
      // Western numbering system: 125,000.00
      return `${currency.symbol} ${numAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
  };

  return (
    <CurrencyContext.Provider
      value={{
        symbol: currency.symbol,
        code: currency.code,
        formatAmount,
        loading,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

