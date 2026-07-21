import { io } from 'socket.io-client';
import { API_BASE } from './client';

// сокету нужен корневой origin бэкенда, а не /api/v1
const SOCKET_URL = API_BASE.replace(/\/api\/v1\/?$/, '');

let socket = null;

// создаём соединение лениво и один раз — если создавать io(...) в каждом
// компоненте/хуке отдельно, получится несколько параллельных соединений
// от одной вкладки, ровно та ошибка, которую разбирали при проектировании
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { withCredentials: true, autoConnect: false });
  }
  return socket;
}
