import axios from 'axios';

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV
  ? 'http://localhost:5000/api'
  : 'https://cloud-computing-project1-add-delete.onrender.com/api');
export default axios.create({ baseURL: API, headers: { 'Content-Type': 'application/json' } });
