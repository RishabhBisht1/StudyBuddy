import axios from 'axios';
import Cookies from 'js-cookie';

const instance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  withCredentials: true,
});

instance.interceptors.request.use((config) => {
  let token = Cookies.get('accessToken');
  
  // If no cookie, safely extract the token from Zustand's persisted JSON state
  if (!token) {
    const authStorage = localStorage.getItem('study-buddy-auth');
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage);
        token = parsed?.state?.token;
      } catch (e) {
        console.error("Failed to parse auth token");
      }
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default instance;