import { GameServer } from './game-server';

const port = Number(process.env.PORT ?? 8080);
const server = new GameServer({ port, broadcastHz: 20 });
server.start().then((bound) => {
  console.log(`Voice Racer game server listening on ws://localhost:${bound}`);
});
process.on('SIGINT', () => server.stop().then(() => process.exit(0)));
