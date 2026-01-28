import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { AppBrand } from '../components/common/AppBrand';
import './SignIn.css';

const APP_LOGO_URL = 'https://hixsfzxeglblylasnnfq.supabase.co/storage/v1/object/public/project-logos/project_logo.png';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
      setLoading(false);
    }
  };

  return (
    <div className="signin-container">
      <div className="signin-card">
        <div className="signin-logo-container">
          <AppBrand logoUrl={APP_LOGO_URL} size={200} />
        </div>
        <p className="signin-subtitle">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="signin-form">
          {error && <div className="signin-error">{error}</div>}

          <div className="signin-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>

          <div className="signin-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="signin-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

