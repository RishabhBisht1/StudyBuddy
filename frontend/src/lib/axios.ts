import axios from 'axios';
import Cookies from 'js-cookie';

const instance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  withCredentials: true, // Important for cookies
});

instance.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken') || localStorage.getItem('study-buddy-auth');
  if (token && typeof token === 'string') {
    // Some setups store the whole zustand state in localstorage, we'll try cookie first
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default instance;