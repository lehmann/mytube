import express from 'express';
import cors from 'cors';
import searchRouter from './routes/search.js';
import infoRouter from './routes/info.js';
import streamRouter from './routes/stream.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/search', searchRouter);
app.use('/api/info', infoRouter);
app.use('/api/stream', streamRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
